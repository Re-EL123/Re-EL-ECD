'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the sidebar has a permission-gated upgrade shortcut', () => {
  const html = read('apps/web/index.html');
  const app = read('apps/web/src/app.js');
  const css = read('apps/web/assets/styles.css');
  const settings = read('apps/web/src/views/settings.js');

  assert.match(html, /class="sidebar-upgrade" x-show="canUpgrade"/);
  assert.match(html, /@click="openNamedModal\('upgradePlan'\)"/);
  assert.match(html, /data-tip="Upgrade plan"/);

  assert.match(app, /get canUpgrade\(\)/);
  assert.match(app, /this\.area === 'app' && !this\.billingLocked && this\.has\('organisation\.settings\.manage'\)/);
  assert.match(app, /if \(name === 'upgradePlan'\)/);
  assert.match(app, /Reel\.api\('GET', '\/billing\/summary'\)/);
  assert.match(app, /Only an owner or principal can upgrade the plan/);

  assert.match(css, /\.sidebar-upgrade-btn \{/);
  assert.match(css, /\.sidebar\.collapsed \.sidebar-upgrade-btn/);

  // The Billing page upgrade cards remain available.
  assert.ok(settings.includes("openNamedModal(\\'upgradePlan\\')"));
  assert.match(settings, /plan-upgrade-card/);
});

test('the upgrade modal compares plans with their inclusions', () => {
  const html = read('apps/web/index.html');
  const app = read('apps/web/src/app.js');
  const billing = read('apps/api/src/modules/billing.js');
  const css = read('apps/web/assets/styles.css');

  assert.match(html, /class="modal modal-upgrade"/);
  assert.match(html, /class="upgrade-plans"/);
  assert.match(html, /class="upgrade-features"/);
  assert.match(html, /x-text="upgradePlanPrice\(plan\)"/);
  assert.match(html, /x-text="upgradeFeatureLabel\(feature\)"/);
  assert.match(html, /x-text="upgradeModal\.period === 'annual'/);

  assert.match(app, /async openUpgradeModal\(\)/);
  assert.match(app, /async confirmUpgrade\(\)/);
  assert.match(app, /upgradePlanPrice\(plan\)/);
  assert.match(app, /upgradeFeatureLabel\(key\)/);

  assert.match(billing, /SELECT plan_key, name, description, features, monthly_price, currency/);
  assert.match(css, /\.upgrade-plan\.selected \{/);
  assert.match(css, /\.upgrade-features \{/);
});
