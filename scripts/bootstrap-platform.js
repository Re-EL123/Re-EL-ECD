'use strict';

/**
 * Production bootstrap.
 *
 * Creates the first platform super administrator without using the demo seed.
 * The password is supplied through the environment and is never printed.
 *
 *   DATABASE_URL=... BOOTSTRAP_EMAIL=... BOOTSTRAP_NAME=... \
 *   BOOTSTRAP_PASSWORD=... npm run bootstrap:platform
 *
 * The script is idempotent: it applies migrations, seeds the role and
 * permission catalogue plus the default plans and feature flags, then creates
 * the platform organisation, the user and the membership only when missing.
 */

const db = require('../packages/database');
const { hashPassword } = require('../packages/auth/password');
const { ROLES } = require('../packages/auth/roles');
const { seedCatalog, seedPlatformDefaults } = require('../packages/database/seeds/development');

const PLATFORM_SLUG = 're-el-platform';
const PLATFORM_NAME = 'Re-EL Platform';
const THEME_TOKENS = {
  primary: '#0B534A',
  secondary: '#2B9A58',
  accent: '#6FC79B',
  background: '#F6F9F7',
  surface: '#FFFFFF',
  text: '#0E2B26',
  onPrimary: '#FFFFFF'
};

function fail(message) {
  console.error(JSON.stringify({ level: 'fatal', message }));
  process.exit(1);
}

function readConfig() {
  const email = String(process.env.BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const name = String(process.env.BOOTSTRAP_NAME || '').trim();
  const password = String(process.env.BOOTSTRAP_PASSWORD || '');

  if (!process.env.DATABASE_URL) fail('DATABASE_URL is required. Refusing to bootstrap the in-memory database.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('BOOTSTRAP_EMAIL must be a valid email address.');
  if (name.length < 2) fail('BOOTSTRAP_NAME must be at least 2 characters.');
  if (password.length < 12) fail('BOOTSTRAP_PASSWORD must be at least 12 characters.');
  if (/^(password|changeme|letmein)/i.test(password)) fail('BOOTSTRAP_PASSWORD is too easy to guess.');

  return { email, name, password };
}

async function main() {
  const config = readConfig();
  const pool = await db.getPool();

  await db.runMigrations(pool);
  await seedCatalog();
  await seedPlatformDefaults(pool);

  let platform = (await pool.query('SELECT * FROM organisations WHERE slug = $1', [PLATFORM_SLUG])).rows[0];
  if (!platform) {
    platform = (await pool.query(
      `INSERT INTO organisations
         (name, slug, legal_name, status, subscription_status,
          primary_colour, secondary_colour, accent_colour, theme_tokens)
       VALUES ($1,$2,$3,'active','active',$4,$5,$6,$7::jsonb)
       RETURNING *`,
      [
        PLATFORM_NAME, PLATFORM_SLUG, 'Re-EL ECD Technologies (Pty) Ltd',
        THEME_TOKENS.primary, THEME_TOKENS.secondary, THEME_TOKENS.accent,
        JSON.stringify(THEME_TOKENS)
      ]
    )).rows[0];
  }

  let user = (await pool.query('SELECT * FROM users WHERE email_normalized = $1', [config.email])).rows[0];
  let createdUser = false;
  if (!user) {
    const passwordHash = await hashPassword(config.password);
    user = (await pool.query(
      `INSERT INTO users (email, email_normalized, display_name, password_hash, status, auth_provider, auth_subject)
       VALUES ($1,$2,$3,$4,'active','local',$5)
       RETURNING *`,
      [config.email, config.email, config.name, passwordHash, config.email]
    )).rows[0];
    createdUser = true;
  }

  let membership = (await pool.query(
    'SELECT * FROM memberships WHERE user_id = $1 AND organisation_id = $2',
    [user.id, platform.id]
  )).rows[0];
  if (!membership) {
    membership = (await pool.query(
      `INSERT INTO memberships (user_id, organisation_id, status, joined_at)
       VALUES ($1,$2,'active',now()) RETURNING *`,
      [user.id, platform.id]
    )).rows[0];
  }

  const role = (await pool.query('SELECT id FROM roles WHERE role_key = $1', [ROLES.PLATFORM_SUPER_ADMIN])).rows[0];
  if (!role) fail('The platform super admin role is missing after seeding the role catalogue.');

  const existingGrant = (await pool.query(
    `SELECT id FROM membership_roles
     WHERE membership_id = $1 AND role_id = $2 AND status = 'active'`,
    [membership.id, role.id]
  )).rows[0];
  if (!existingGrant) {
    await pool.query(
      `INSERT INTO membership_roles (membership_id, role_id, status)
       VALUES ($1,$2,'active')`,
      [membership.id, role.id]
    );
  }

  console.log(JSON.stringify({
    level: 'info',
    message: createdUser ? 'Platform administrator created.' : 'Platform administrator already exists; access confirmed.',
    email: config.email,
    organisation: platform.slug,
    role: ROLES.PLATFORM_SUPER_ADMIN,
    passwordChanged: false
  }, null, 2));

  await pool.end();
}

main().catch((error) => {
  console.error(JSON.stringify({ level: 'fatal', message: error.message, stack: error.stack }));
  process.exit(1);
});
