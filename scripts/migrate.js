'use strict';

/**
 * Applies all pending SQL migrations to the configured PostgreSQL database.
 * Refuses to run against the in-memory development database.
 */

const db = require('../packages/database');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Migrations only run against a real PostgreSQL database.');
    process.exit(1);
  }
  const pool = await db.getPool();
  const before = new Set();
  try {
    const result = await pool.query('SELECT filename FROM schema_migrations');
    result.rows.forEach((row) => before.add(row.filename));
  } catch {
    // First run: schema_migrations does not exist yet.
  }
  await db.runMigrations(pool);
  const after = new Set((await pool.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename));
  const applied = [...after].filter((file) => !before.has(file));
  console.log(JSON.stringify({ level: 'info', message: 'Migrations complete', applied, total: after.size }, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(JSON.stringify({ level: 'fatal', message: error.message, stack: error.stack }));
  process.exit(1);
});
