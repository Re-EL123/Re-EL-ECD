'use strict';

/**
 * Seeds only the platform catalogue: roles, permissions, role grants,
 * subscription plans and feature flags. Safe to run repeatedly and safe for
 * production because it never creates demo organisations or users.
 */

const db = require('../packages/database');
const { seedCatalog, seedPlatformDefaults } = require('../packages/database/seeds/development');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required to seed the production catalogue.');
    process.exit(1);
  }
  const pool = await db.getPool();
  await db.runMigrations(pool);
  await seedCatalog();
  await seedPlatformDefaults(pool);
  console.log(JSON.stringify({ level: 'info', message: 'Catalogue seeded (roles, permissions, plans, flags)' }));
  await pool.end();
}

main().catch((error) => {
  console.error(JSON.stringify({ level: 'fatal', message: error.message, stack: error.stack }));
  process.exit(1);
});
