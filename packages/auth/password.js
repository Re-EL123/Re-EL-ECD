'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
// The usual suspects — length alone should not be all that stands between a
// parent's account and a credential-stuffing hit list.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', '12345678', '123456789',
  '1234567890', 'qwerty123', 'letmein123', 'welcome1', 'welcome123', 'admin123', 'iloveyou1',
  'changeme', 'changeme123'
]);

/**
 * Shared password policy. Endpoints return these as field errors so the UI can
 * show exactly which rule failed; hashPassword stays deliberately permissive
 * for existing accounts and internally generated credentials.
 */
const PASSWORD_RULES = [
  { key: 'length', label: 'At least 10 characters', test: (value) => value.length >= 10 },
  { key: 'upper', label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { key: 'lower', label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
  { key: 'number', label: 'One number', test: (value) => /\d/.test(value) },
  { key: 'symbol', label: 'One symbol (! @ # …)', test: (value) => /[^A-Za-z0-9]/.test(value) },
  { key: 'common', label: 'Not a common password', test: (value) => !COMMON_PASSWORDS.has(value.toLowerCase()) }
];

function passwordIssues(value, context = {}) {
  const password = typeof value === 'string' ? value : '';
  const issues = PASSWORD_RULES.filter((rule) => !rule.test(password))
    .map((rule) => ({ rule: rule.key, message: rule.label }));
  const email = String(context.email || '').toLowerCase();
  if (email && password.toLowerCase().includes(email)) {
    issues.push({ rule: 'email', message: 'Not contain your email address' });
  }
  return issues;
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new Error('That password is on every credential list — pick something less common.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Constant-time comparison for shared secrets (CSRF token, cron secret,
 * webhook signature). Returns false — never throws — on length mismatch.
 */
function safeEqual(a, b) {
  const left = Buffer.from(String(a == null ? '' : a));
  const right = Buffer.from(String(b == null ? '' : b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = { hashPassword, verifyPassword, randomToken, sha256, safeEqual, passwordIssues, PASSWORD_RULES };
