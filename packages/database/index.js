'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
let sharedPool = null;
let sharedMemoryDb = null;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function connectionString() {
  return process.env.DATABASE_URL || '';
}

/**
 * Minimal async mutex. The embedded database has a single connection, so
 * transactions must not interleave with other queries.
 */
class Mutex {
  constructor() {
    this.locked = false;
    this.waiters = [];
  }

  acquire() {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.locked = false;
  }
}

class MemoryClient {
  constructor(pglite, mutex) {
    this.pglite = pglite;
    this.mutex = mutex;
    this.released = false;
  }

  query(sql, params = []) {
    return this.pglite.query(sql, params);
  }

  release() {
    if (this.released) return;
    this.released = true;
    this.mutex.release();
  }
}

class MemoryPool {
  constructor(pglite) {
    this.pglite = pglite;
    this.mutex = new Mutex();
  }

  async query(sql, params = []) {
    await this.mutex.acquire();
    try {
      return await this.pglite.query(sql, params);
    } finally {
      this.mutex.release();
    }
  }

  async connect() {
    await this.mutex.acquire();
    return new MemoryClient(this.pglite, this.mutex);
  }

  async end() {
    await this.pglite.close();
  }
}

async function createMemoryPool() {
  const { PGlite } = require('@electric-sql/pglite');
  const pglite = new PGlite();
  // PGlite is real PostgreSQL compiled to WebAssembly. It does not ship the
  // uuid-ossp extension, so provide the single function the schema relies on.
  await pglite.query(`CREATE OR REPLACE FUNCTION uuid_generate_v4() RETURNS uuid
    AS 'SELECT gen_random_uuid()' LANGUAGE SQL VOLATILE`);
  sharedMemoryDb = pglite;
  return new MemoryPool(pglite);
}

/**
 * Returns a singleton pool. Production requires DATABASE_URL; development and
 * tests fall back to an embedded PostgreSQL (PGlite/WebAssembly) so the
 * application can be run end-to-end without external infrastructure.
 */
async function getPool() {
  if (sharedPool) return sharedPool;
  const url = connectionString();
  if (url) {
    const { Pool } = require('pg');
    sharedPool = new Pool({
      connectionString: url,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 20000
    });
  } else {
    if (isProduction() && process.env.ALLOW_IN_MEMORY_DB !== 'true') {
      throw new Error('DATABASE_URL is required in production. Refusing to start with an in-memory database.');
    }
    sharedPool = await createMemoryPool();
  }
  return sharedPool;
}

async function query(sql, params = [], client = null) {
  const runner = client || (await getPool());
  return runner.query(sql, params);
}

async function one(sql, params = [], client = null) {
  const result = await query(sql, params, client);
  return result.rows[0] || null;
}

async function many(sql, params = [], client = null) {
  const result = await query(sql, params, client);
  return result.rows;
}

async function withTransaction(fn) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore rollback failure */ }
    throw error;
  } finally {
    client.release();
  }
}

function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

function splitStatements(sql) {
  const withoutComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runMigrations(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const applied = new Set((await pool.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename));
  for (const file of migrationFiles()) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = splitStatements(sql);
    for (const statement of statements) {
      await pool.query(statement);
    }
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
  }
}

async function resetDatabase() {
  sharedPool = null;
  sharedMemoryDb = null;
}

module.exports = {
  getPool,
  query,
  one,
  many,
  withTransaction,
  runMigrations,
  migrationFiles,
  splitStatements,
  resetDatabase,
  isProduction
};
