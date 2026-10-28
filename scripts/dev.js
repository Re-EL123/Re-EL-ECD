'use strict';

/**
 * Development launcher. Starts the API and serves the SPA from the same origin
 * (matching production routing). With no DATABASE_URL the in-process PGlite
 * database is migrated and seeded before the server starts, so `npm run dev`
 * yields a working demo without external infrastructure.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const db = require('../packages/database');
const { seedDevelopment } = require('../packages/database/seeds/development');
const { main } = require('../apps/api/server');

async function bootstrap() {
  if (process.env.DATABASE_URL) {
    console.log(JSON.stringify({ level: 'info', message: 'Using PostgreSQL from DATABASE_URL' }));
    return;
  }
  console.log(JSON.stringify({ level: 'info', message: 'No DATABASE_URL: using in-process development database' }));
  const pool = await db.getPool();
  await db.runMigrations(pool);
  const result = await seedDevelopment();
  console.log(JSON.stringify({
    level: 'info',
    message: 'Development data ready',
    organisations: result.organisations ? result.organisations.length : 0,
    demoPassword: result.password
  }));
}

bootstrap().then(main).catch((error) => {
  console.error(JSON.stringify({ level: 'fatal', message: error.message, stack: error.stack }));
  process.exit(1);
});
