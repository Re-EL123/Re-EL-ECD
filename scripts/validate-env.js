'use strict';

/**
 * Validates deployment environment variables. Exits non-zero when a production
 * configuration is unsafe or incomplete. Intended for CI and Vercel builds.
 */

const warnings = [];
const errors = [];

function present(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

function check(name, condition, message, level = 'error') {
  if (condition) return;
  if (level === 'error') errors.push(`${name}: ${message}`);
  else warnings.push(`${name}: ${message}`);
}

const production = process.env.NODE_ENV === 'production';

if (production) {
  check('DATABASE_URL', present('DATABASE_URL'), 'a PostgreSQL connection string is required in production');
  check('FRONTEND_ORIGIN', present('FRONTEND_ORIGIN'), 'set the public origin(s) allowed to call the API (comma separated)');
  check('ALLOW_IN_MEMORY_DB', process.env.ALLOW_IN_MEMORY_DB !== 'true', 'in-memory database must not be enabled in production');
  check('DATABASE_SSL', process.env.DATABASE_SSL !== 'false', 'TLS should stay enabled for hosted PostgreSQL', 'warning');
} else {
  check('DATABASE_URL', present('DATABASE_URL'), 'not set; the API will use the in-process PGlite database', 'warning');
}

if (present('DATABASE_URL')) {
  check('DATABASE_URL', /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL), 'must be a postgres:// or postgresql:// URL');
}

if (present('FRONTEND_ORIGIN') && production) {
  const origins = process.env.FRONTEND_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  check('FRONTEND_ORIGIN', origins.every((origin) => /^https?:\/\/[^/]+$/.test(origin)),
    'each origin must be a scheme + host without a path');
  check('FRONTEND_ORIGIN', !origins.includes('*'), 'wildcard origins are not allowed in production');
}

if (present('PORT')) {
  const port = Number(process.env.PORT);
  check('PORT', Number.isInteger(port) && port > 0 && port < 65536, 'must be a valid TCP port');
}

if (present('SESSION_HOURS')) {
  const hours = Number(process.env.SESSION_HOURS);
  check('SESSION_HOURS', Number.isFinite(hours) && hours > 0 && hours <= 168, 'must be between 1 and 168 hours');
}

const report = { environment: process.env.NODE_ENV || 'development', errors, warnings };
if (errors.length) {
  console.error(JSON.stringify({ level: 'error', message: 'Environment validation failed', ...report }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ level: 'info', message: 'Environment validation passed', ...report }, null, 2));
