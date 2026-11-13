'use strict';

/**
 * One-off command to (re)seed the Official NCF pack against DATABASE_URL.
 * Idempotent — safe to re-run to publish new content versions.
 */

const db = require('../packages/database');
const { seedOfficialNcf } = require('../packages/database/seeds/official-ncf');

async function main() {
  const pool = await db.getPool();
  await db.runMigrations(pool);
  const result = await seedOfficialNcf(pool);
  console.log(JSON.stringify({ level: 'info', message: 'Official NCF pack seeded', ...result }));
  await pool.end();
}

main().catch((error) => {
  console.error(JSON.stringify({ level: 'fatal', message: error.message, stack: error.stack }));
  process.exit(1);
});
