'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('platform admins can fully edit a user from the console', () => {
  const view = read('apps/web/src/views/platform.js');
  const app = read('apps/web/src/app.js');
  const api = read('apps/api/src/modules/platform.js');

  assert.ok(view.includes('openPlatformUser('));
  assert.ok(view.includes('openPlatformUserRoles('));
  assert.ok(view.includes('resetPlatformUserPassword('));
  assert.match(app, /async openPlatformUser\(id\)/);
  assert.match(app, /async openPlatformUserRoles\(id\)/);
  assert.match(app, /async revokePlatformUserRole\(/);
  assert.match(app, /async revokePlatformUserMembership\(/);
  assert.match(app, /method: 'PATCH'/);
  assert.match(app, /Turn off two-factor authentication/);
  assert.match(app, /Unlock account/);

  assert.match(api, /router\.get\('\/platform\/users\/:id'/);
  assert.match(api, /router\.patch\('\/platform\/users\/:id'/);
  assert.match(api, /router\.post\('\/platform\/users\/:id\/reset-password'/);
  assert.match(api, /router\.post\('\/platform\/users\/:id\/memberships'/);
  assert.match(api, /router\.delete\('\/platform\/users\/:id\/memberships\/:membershipId\/roles\/:roleId'/);
  assert.match(api, /function safeUser\(user\)/);
  assert.match(api, /platform\.user_updated/);
});
