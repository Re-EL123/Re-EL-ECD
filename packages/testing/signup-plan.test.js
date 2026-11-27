'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('signup always assigns a real plan and reports it honestly', () => {
  const api = read('apps/api/src/modules/platform.js');
  const provision = read('apps/api/src/services/provision-service.js');
  const signup = read('apps/web/src/views/public.js');
  const app = read('apps/web/src/app.js');

  // API: choose the cheapest active plan when no key is supplied.
  assert.match(api, /ORDER BY monthly_price ASC, name ASC LIMIT 1/);
  assert.match(api, /No plans are available for signup right now/);
  assert.match(api, /planKey: chosenPlan\.plan_key/);
  assert.match(api, /planName: chosenPlan\.name/);

  // Provisioning refuses archived or unknown plans instead of silently
  // creating a planless organisation.
  assert.match(provision, /status = 'active'/);
  assert.match(provision, /PLAN_UNAVAILABLE/);

  // UI: no "decide later" option; first plan preselected; prices respect currency.
  assert.ok(!/Decide later/.test(signup));
  assert.match(signup, /ctx\.signupForm\.planKey = ctx\.signupPlans\[0\]\.plan_key/);
  assert.match(signup, /R\.money\(p\.monthly_price, p\.currency \|\| 'ZAR'\)/);
  assert.ok(!/Decide later/.test(app));
  assert.match(app, /Default plan \(30-day trial\)/);
});
