'use strict';

/**
 * Vercel serverless entry point.
 *
 * All traffic under /api/* is routed here by vercel.json. The handler is the
 * same request pipeline used by the local Node server, so behaviour does not
 * diverge between environments.
 */

const { handle, applyCors } = require('../apps/api/src/app');
const db = require('../packages/database');
const { seedCatalog } = require('../packages/database/seeds/development');

let bootstrapPromise = null;

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_IN_MEMORY_DB !== 'true') {
      throw new Error('DATABASE_URL is required in production.');
    }
    return;
  }
  const pool = await db.getPool();
  const applied = new Set();
  try {
    const result = await pool.query('SELECT filename FROM schema_migrations');
    result.rows.forEach((row) => applied.add(row.filename));
  } catch {
    // The migration table is created by runMigrations on first boot.
  }
  const pending = db.migrationFiles().filter((file) => !applied.has(file));
  if (pending.length) await db.runMigrations(pool);
  await seedCatalog();
}

function ensureBootstrapped() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

module.exports = async function handler(req, res) {
  if ((req.url || '').split('?')[0] === '/healthz') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ status: 'ok', uptime: Math.floor(process.uptime()) }));
    return;
  }
  // Apply CORS before any work. A cold start that fails (for example a
  // database that is still waking) must still answer the browser with a
  // readable, CORS-enabled error. Without these headers the browser reports
  // an opaque "CORS request did not succeed" with a null status and hides the
  // real cause.
  applyCors(req, res);
  try {
    await ensureBootstrapped();
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', message: 'api bootstrap failed', error: error.message }));
    if (res.headersSent) return;
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: {
        code: 'BOOTSTRAP_FAILED',
        message: 'The API could not start. Check the database configuration and try again.',
        requestId: req.headers['x-request-id'] || null
      }
    }));
    return;
  }
  return handle(req, res);
};
