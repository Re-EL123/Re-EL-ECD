'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

async function signup(admin, email) {
  const anon = createClient();
  const created = await anon.post('/public/signup', {
    centreName: 'Verify Centre ' + Date.now(),
    ownerName: 'Verify Owner',
    ownerEmail: email,
    password: 'Verify-Pass-2026!'
  });
  assert.equal(created.status, 201, created.text);
  return { anon, created };
}

test('new signups must verify their email before signing in', async () => {
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  assert.equal((await admin.patch('/platform/settings', { settings: { allowTenantSignup: true } })).status, 200);

  const email = 'verify-' + Date.now() + '@example.test';
  const { anon, created } = await signup(admin, email);
  const token = created.meta && created.meta.verifyToken;
  assert.ok(token, 'a verification token should be available in the test environment');

  const user = await db.one('SELECT email_verified_at FROM users WHERE email_normalized = $1', [email]);
  assert.equal(user.email_verified_at, null);

  const blocked = await createClient().post('/auth/login', { email, password: 'Verify-Pass-2026!' }, { csrf: null });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.error.code, 'EMAIL_NOT_VERIFIED');

  const bad = await anon.post('/public/auth/verify-email', { token: 'not-a-real-token-long-enough-000' });
  assert.equal(bad.status, 422);

  const verified = await anon.post('/public/auth/verify-email', { token });
  assert.equal(verified.status, 200, verified.text);

  // Tokens are single use.
  const reused = await anon.post('/public/auth/verify-email', { token });
  assert.equal(reused.status, 422);

  const owner = createClient();
  const login = await owner.login(email, 'Verify-Pass-2026!');
  assert.ok(login.csrfToken);

  const after = await db.one('SELECT email_verified_at FROM users WHERE email_normalized = $1', [email]);
  assert.ok(after.email_verified_at);

  await admin.patch('/platform/settings', { settings: { allowTenantSignup: false } });
});

test('a verification link can be resent and invalidates the old token', async () => {
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  assert.equal((await admin.patch('/platform/settings', { settings: { allowTenantSignup: true } })).status, 200);

  const email = 'resend-' + Date.now() + '@example.test';
  const { anon, created } = await signup(admin, email);
  const first = created.meta.verifyToken;

  const resent = await anon.post('/public/auth/verify-email/resend', { email });
  assert.equal(resent.status, 200, resent.text);
  assert.equal(resent.data.sent, true);
  const second = resent.meta.verifyToken;
  assert.ok(second && second !== first);

  const oldLink = await anon.post('/public/auth/verify-email', { token: first });
  assert.equal(oldLink.status, 422, 'old tokens are invalidated when a new one is sent');
  const newLink = await anon.post('/public/auth/verify-email', { token: second });
  assert.equal(newLink.status, 200, newLink.text);

  await admin.patch('/platform/settings', { settings: { allowTenantSignup: false } });
});

test('existing demo accounts are already verified', async () => {
  const row = await db.one("SELECT email_verified_at FROM users WHERE email_normalized = 'principal@littlesprouts.local'");
  assert.ok(row.email_verified_at, 'a deploy must never lock out existing centres');
});
