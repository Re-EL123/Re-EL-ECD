'use strict';

/**
 * Two-factor authentication: enrolment, challenge on login, recovery codes,
 * disable. Runs against a dedicated throwaway account so other suites are
 * unaffected.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { start, stop, createClient, db } = require('./helpers');
const { hashPassword } = require('../../../packages/auth/password');
const totp = require('../../../packages/auth/totp');

test.before(start);
test.after(stop);

let email = null;
let userId = null;

test('seed: throwaway account exists', async () => {
  email = 'mfa-test-' + Date.now() + '@example.test';
  const hash = await hashPassword('Mfa-Test-Password-2026!');
  const rows = await db.query(
    `INSERT INTO users (email, email_normalized, display_name, password_hash, status, email_verified_at)
     VALUES ($1,$1,'MFA Test',$2,'active',now()) RETURNING id`,
    [email, hash]
  );
  userId = rows.rows[0].id;
  assert.ok(userId);
  await db.query(
    `INSERT INTO memberships (user_id, organisation_id, status, joined_at)
     SELECT $1, id, 'active', now() FROM organisations WHERE slug = 'little-sprouts'`,
    [userId]
  );
});

test('mfa: enrol, challenge on login, recovery code, disable', async () => {
  const client = createClient();

  // 1. Plain login works before MFA.
  let result = await client.post('/auth/login', { email, password: 'Mfa-Test-Password-2026!' }, { csrf: null });
  assert.equal(result.status, 200);
  assert.ok(!result.data.mfaRequired);

  // 2. Setup mints the secret.
  const setup = await client.post('/auth/mfa/setup', {});
  assert.equal(setup.status, 200);
  assert.ok(setup.data.secret);
  assert.ok(setup.data.otpauthUri.startsWith('otpauth://totp/'));

  // 3. Wrong code does not enable.
  const bad = await client.post('/auth/mfa/enable', { code: '000000' });
  assert.equal(bad.status, 422);

  // 4. Correct code enables and returns backup codes once.
  const enable = await client.post('/auth/mfa/enable', { code: totp.totp(setup.data.secret) });
  assert.equal(enable.status, 200);
  assert.ok(Array.isArray(enable.data.backupCodes));
  assert.equal(enable.data.backupCodes.length, 8);

  // 5. Logout; the next login stops at the challenge.
  await client.post('/auth/logout', {});
  result = await client.post('/auth/login', { email, password: 'Mfa-Test-Password-2026!' }, { csrf: null });
  assert.equal(result.status, 200);
  assert.equal(result.data.mfaRequired, true);
  assert.ok(result.data.challengeId);
  assert.ok(!client.cookies.reel_session, 'no session yet');

  // 6. Wrong TOTP is rejected; the challenge is rate-limited.
  const wrong = await client.post('/auth/mfa/challenge', { challengeId: result.data.challengeId, code: '000000' }, { csrf: null });
  assert.equal(wrong.status, 422);

  // 7. Correct TOTP completes the login.
  const solved = await client.post('/auth/mfa/challenge', { challengeId: result.data.challengeId, code: totp.totp(setup.data.secret) }, { csrf: null });
  assert.equal(solved.status, 200);
  assert.equal(solved.data.user.email, email);
  assert.ok(client.cookies.reel_session);

  // 8. Replay of the same challenge fails.
  const replay = await client.post('/auth/mfa/challenge', { challengeId: result.data.challengeId, code: totp.totp(setup.data.secret) }, { csrf: null });
  assert.equal(replay.status, 422);

  // 9. Disable MFA protects the password check with a second factor.
  const disable = await client.post('/auth/mfa/disable', { code: totp.totp(setup.data.secret) });
  assert.equal(disable.status, 200);

  // 10. Login is direct again.
  await client.post('/auth/logout', {});
  result = await client.post('/auth/login', { email, password: 'Mfa-Test-Password-2026!' }, { csrf: null });
  assert.equal(result.status, 200);
  assert.equal(result.data.mfaRequired, undefined);
});

test('mfa: recovery code signs in when the app is unavailable', async () => {
  const client = createClient();
  await client.login(email, 'Mfa-Test-Password-2026!');
  const setup = await client.post('/auth/mfa/setup', {});
  const secret = setup.data.secret;
  const enable = await client.post('/auth/mfa/enable', { code: totp.totp(secret) });
  const backupCode = enable.data.backupCodes[0];
  await client.post('/auth/logout', {});

  const login = await client.post('/auth/login', { email, password: 'Mfa-Test-Password-2026!' }, { csrf: null });
  assert.equal(login.data.mfaRequired, true);
  const solved = await client.post('/auth/mfa/challenge', { challengeId: login.data.challengeId, code: backupCode }, { csrf: null });
  assert.equal(solved.status, 200);
  assert.equal(solved.data.user.email, email);

  // The same recovery code cannot be used twice.
  await client.post('/auth/logout', {});
  const again = await client.post('/auth/login', { email, password: 'Mfa-Test-Password-2026!' }, { csrf: null });
  const consumed = await client.post('/auth/mfa/challenge', { challengeId: again.data.challengeId, code: backupCode }, { csrf: null });
  assert.equal(consumed.status, 422);

  await client.post('/auth/mfa/disable', { code: totp.totp(secret) });
});
