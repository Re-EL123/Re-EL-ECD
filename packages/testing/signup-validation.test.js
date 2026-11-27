'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('signup shows the same fee-inclusive amount as the upgrade modal', () => {
  const api = read('apps/api/src/modules/platform.js');
  const view = read('apps/web/src/views/public.js');
  const app = read('apps/web/src/app.js');
  const css = read('apps/web/assets/styles.css');

  assert.match(api, /const rawPlans = await ctx\.db\.many/);
  assert.match(api, /checkout: \{[\s\S]*?monthly: quote\(monthlyBase\)/);
  assert.match(api, /annual: quote\(annualBase\)/);
  assert.match(view, /p\.checkout && p\.checkout\.monthly && p\.checkout\.monthly\.total/);
  assert.match(view, /upgrade-price-detail/);
  assert.match(view, /what PayFast charges for a month of the plan/);
  assert.match(app, /plan\.checkout && plan\.checkout\.monthly && plan\.checkout\.monthly\.total/);
  assert.match(css, /\.upgrade-price-detail \{/);
});

test('password rules are shared by API and web and shown during signup', () => {
  const auth = read('packages/auth/password.js');
  const apiAuth = read('apps/api/src/modules/auth.js');
  const apiPlatform = read('apps/api/src/modules/platform.js');
  const app = read('apps/web/src/app.js');
  const view = read('apps/web/src/views/public.js');

  assert.match(auth, /PASSWORD_RULES = \[/);
  assert.match(auth, /One uppercase letter/);
  assert.match(auth, /One symbol/);
  assert.match(auth, /passwordIssues\(value, context/);
  assert.match(apiAuth, /assertPassword\(body\.newPassword/);
  assert.match(apiAuth, /assertPassword\(body\.password/);
  assert.match(apiPlatform, /assertPassword\(body\.password, \{ email \}\)/);
  assert.match(app, /passwordIssues\(value, email\)/);
  assert.match(app, /Password needs: /);
  assert.match(view, /passwordRuleRows/);
  assert.match(view, /signup-rules/);
});

test('email verification is enforced and can be completed from the emailed link', () => {
  const migration = read('packages/database/migrations/057_email_verification.sql');
  const auth = read('apps/api/src/modules/auth.js');
  const platform = read('apps/api/src/modules/platform.js');
  const email = read('apps/api/src/services/email-service.js');
  const app = read('apps/web/src/app.js');
  const view = read('apps/web/src/views/public.js');

  assert.match(migration, /email_verified_at TIMESTAMPTZ/);
  assert.match(migration, /UPDATE users SET email_verified_at = now\(\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS email_verifications/);
  assert.match(platform, /requireEmailVerification: true/);
  assert.match(platform, /'verifyEmail'/);
  assert.match(email, /verifyEmail\(data\)/);
  assert.match(email, /verify-email\?token=/);
  assert.match(auth, /router\.post\('\/public\/auth\/verify-email'/);
  assert.match(auth, /router\.post\('\/public\/auth\/verify-email\/resend'/);
  assert.match(auth, /EMAIL_NOT_VERIFIED/);
  assert.match(app, /route\('\/verify-email', 'public', 'verifyEmail'/);
  assert.match(app, /async resendVerification\(\)/);
  assert.match(view, /V\.verifyEmail = \{/);
  assert.match(view, /open it before signing in/);
});
