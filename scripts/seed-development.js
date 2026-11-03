'use strict';

/**
 * Seeds the demonstration dataset. Runs against DATABASE_URL when present and
 * otherwise against the in-process development database (useful for local demos
 * and tests). Existing data is preserved unless --force is supplied.
 */

const db = require('../packages/database');
const { seedDevelopment } = require('../packages/database/seeds/development');

async function main() {
  const force = process.argv.includes('--force');
  if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed in production without DATABASE_URL.');
    process.exit(1);
  }
  const pool = await db.getPool();
  await db.runMigrations(pool);
  const result = await seedDevelopment({ force });
  console.log(JSON.stringify({
    level: 'info',
    message: result.skipped ? 'Seed skipped: data already present (use --force to reseed)' : 'Seed complete',
    seeded: result.seeded,
    organisations: result.organisations,
    demoAccounts: 'See DEMO.md for the seeded demonstration accounts.'
  }, null, 2));
  if (process.env.DATABASE_URL) await pool.end();
}

main().catch((error) => {
  console.error(JSON.stringify({ level: 'fatal', message: error.message, stack: error.stack }));
  process.exit(1);
});
