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
