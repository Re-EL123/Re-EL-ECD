'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('correction permissions are catalogued and granted to the right roles', () => {
  const permissions = read('packages/auth/permissions.js');
  const roles = read('packages/auth/roles.js');
  assert.match(permissions, /'records\.correct\.daycare', 'records\.approve\.daycare'/);
  assert.match(roles, /'records\.\*'/); // owner
  assert.match(roles, /'records\.correct\.daycare', 'records\.approve\.daycare'/); // principal
  assert.equal((roles.match(/'records\.correct\.daycare'/g) || []).length, 3); // principal + admin + manager
});

test('the corrections workspace is wired into the web app', () => {
  const app = read('apps/web/src/app.js');
  const view = read('apps/web/src/views/corrections.js');
  const html = read('apps/web/index.html');
  assert.match(app, /route\('\/app\/corrections', 'app', 'corrections', 'records\.correct\.daycare'/);
  assert.match(app, /path: '\/app\/corrections', label: 'Record corrections'/);
  assert.match(app, /async loadCorrectionFields\(\)/);
  assert.match(app, /async submitCorrection\(\)/);
  assert.match(app, /async reviewCorrection\(id, decision\)/);
  assert.match(view, /V\.corrections = \{/);
  assert.match(view, /reviewCorrection\(/);
  assert.match(html, /src="src\/views\/corrections\.js/);
});

test('least privilege removes cross-domain reads', () => {
  const organisation = read('apps/api/src/modules/organisation.js');
  const morning = read('apps/api/src/modules/morning.js');
  const learners = read('apps/api/src/modules/learners.js');
  const parent = read('apps/api/src/modules/parent.js');
  assert.match(organisation, /finance: has\(ctx, 'finance\.read\.daycare'\) \|\| has\(ctx, 'finance\.reports\.daycare'\)/);
  assert.ok(!/WIDE_READ_PERMS = \[[^\]]*reports\.read\.daycare/.test(morning));
  assert.match(learners, /visibility_level = 'staff' OR \$2::boolean/);
  assert.match(parent, /financeLearnerIds\(ctx\)/);
  assert.match(parent, /financeIds\.has\(learner\.id\) \? roundMoney\(balance\.outstanding\) : null/);
});
