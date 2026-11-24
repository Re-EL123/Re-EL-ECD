'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const view = read('apps/web/src/views/platform.js');
const api = read('apps/api/src/modules/platform.js');
const app = read('apps/web/src/app.js');
const utils = read('apps/web/src/utils.js');
const css = read('apps/web/assets/styles.css');
const migration = read('packages/database/migrations/052_subscription_invoice_actors.sql');

test('MRR is split by currency and never summed across currencies', () => {
  assert.match(api, /const currencyMap = new Map\(\)/);
  assert.match(api, /const code = String\(row\.plan_currency \|\| row\.organisation_currency \|\| 'ZAR'\)\.toUpperCase\(\)/);
  assert.match(api, /const mrrByCurrency = Array\.from\(currencyMap\.values\(\)\)/);
  assert.match(api, /singleCurrency: Boolean\(singleCurrency\)/);
  assert.match(view, /mrrLabel = singleCurrency/);
  assert.match(view, /Revenue by currency/);
  assert.match(view, /totals are never mixed/);
  assert.ok(!/reduce\(\(sum, s\) => sum \+ Number\(s\.monthly_price/.test(api), 'no blind cross-currency sum');
});

test('bulk actions are gated by the permission their endpoint requires', () => {
  assert.match(view, /const canSubs = ctx\.has\('platform\.subscriptions\.manage'\)/);
  assert.match(view, /const canOrg = ctx\.has\('platform\.organisations\.manage'\)/);
  assert.match(view, /const canAudit = ctx\.has\('platform\.audit\.read'\)/);
  assert.match(view, /const bulk = canOrg \? R\.bulkBar\(/);
  assert.match(api, /router\.post\('\/platform\/organisations\/bulk'[\s\S]{0,6000}permission: 'platform\.organisations\.manage'/);
  assert.match(view, /canAudit \? '<a class="btn btn-sm btn-ghost" href="#\/platform\/audit"/);
});

test('invoices and activity report counts and honour a date range', () => {
  assert.match(api, /SELECT COUNT\(\*\)::int AS total FROM platform_subscription_invoices/);
  assert.match(api, /SELECT COUNT\(\*\)::int AS total FROM audit_events/);
  assert.match(api, /invoiceCount: invoiceCount\.total/);
  assert.match(api, /activityCount: activityCount\.total/);
  assert.match(api, /i\.created_at::date >= \$2/);
  assert.match(api, /a\.occurred_at::date <= \$3/);
  assert.match(view, /of ' \+ R\.number\(invoiceCount\)/);
  assert.match(view, /of ' \+ R\.number\(activityCount\)/);
  assert.match(view, /scopeFrom/);
  assert.match(view, /scopeTo/);
});

test('one shared scope selector drives every section', () => {
  assert.match(view, /class="sub-scope/);
  assert.ok(view.includes("setFilter(\\'scopeOrg\\'"));
  assert.ok(view.includes("setFilter(\\'scopePlan\\'"));
  assert.ok(view.includes("setFilter(\\'scopeFrom\\'"));
  assert.ok(view.includes("setFilter(\\'scopeTo\\'"));
  assert.match(view, /clearSubscriptionScope/);
  assert.match(app, /clearSubscriptionScope\(\)/);
  assert.match(api, /const scopeOrg = ctx\.query\.orgId \|\| null/);
  assert.match(api, /const scopePlan = ctx\.query\.planId \|\| null/);
  assert.ok(view.includes("'/platform/subscriptions' + qs"));
});

test('plan cards drill down into scoped tenants', () => {
  assert.match(view, /kpi-link/);
  assert.match(view, /Active tenants →/);
  assert.ok(view.includes("setFilter(\\'scopePlan\\',\\'' + R.attr(p.id)"));
  assert.match(api, /AS tenant_count/);
  assert.match(css, /\.kpi-link \{/);
});

test('entitlements and branch counts are surfaced per subscription', () => {
  assert.match(api, /AS learner_count/);
  assert.match(api, /AS staff_count/);
  assert.match(api, /AS branch_count/);
  assert.match(view, /Near limit/);
  assert.match(view, /Learners ' \+ cell\(learners, maxL\)/);
  assert.match(view, /branch_count \|\| 0/);
  assert.match(view, /revokes all sessions across every branch/);
  assert.match(view, /Entitlements', 'Learners/);
});

test('the organisation picker is searchable and bounded', () => {
  assert.match(view, /\/platform\/organisations\?pageSize=100/);
  assert.match(view, /orgQuery \? '&q=' \+ encodeURIComponent\(filters\.orgQuery\)/);
  assert.match(view, /Find an organisation…/);
  assert.match(view, /orgTotal/);
});

test('billing period is normalised and labelled', () => {
  assert.match(view, /Normalised MRR/);
  assert.match(view, /contract<\/span>/);
  assert.match(view, /Normalised monthly · ' \+ activeCount/);
  assert.match(view, /Normalised monthly', R\.money/);
});

test('money actions use typed confirmation and record the actor', () => {
  assert.ok(app.includes("confirmText: config.confirmText || ''"));
  assert.ok(app.includes('to confirm this action.'));
  assert.match(view, /confirmMoney/);
  assert.match(view, /confirmText: label/);
  ['cancel:', 'waive:', 'void:', "'mark-paid':"].forEach((action) => {
    assert.ok(view.includes(action), 'confirmation meta for ' + action);
  });
  assert.match(migration, /paid_by UUID REFERENCES users/);
  assert.match(migration, /voided_by UUID REFERENCES users/);
  assert.match(migration, /refunded_by UUID REFERENCES users/);
  assert.match(api, /voided_by = \$2, voided_at = now\(\)/);
  assert.match(api, /paid_by = \$2/);
  assert.match(api, /refunded_by = \$2, refunded_at = now\(\)/);
});

test('the console is split into scope-based tabs', () => {
  ["key: 'overview', label: 'Overview'", "key: 'tenants', label: 'Tenants'",
    "key: 'plans', label: 'Plans'", "key: 'billing', label: 'Billing'",
    "key: 'activity', label: 'Activity'"].forEach((entry) => assert.ok(view.includes(entry), entry));
  assert.ok(view.includes("setFilter(\\'subTab\\'"));
  assert.ok(view.indexOf("tab === 'tenants' ? tenants") !== -1);
  assert.ok(view.indexOf('class="tabs sub-tabs"') !== -1);
  assert.match(css, /\.sub-tabs/);
});

test('all subscription endpoints remain permission-gated', () => {
  ['cancel', 'period', 'waive'].forEach((action) => {
    assert.match(api, new RegExp("router\\.post\\('/platform/subscriptions/:id/" + action + "'[\\s\\S]{0,3000}platform\\.subscriptions\\.manage"));
  });
  ['void', 'mark-paid', 'refund'].forEach((action) => {
    assert.match(api, new RegExp("router\\.post\\('/platform/subscription-invoices/:id/" + action.replace('-', '\\-') + "'[\\s\\S]{0,3000}platform\\.subscriptions\\.manage"));
  });
  assert.match(api, /router\.get\('\/platform\/subscriptions'[\s\S]{0,12000}permission: 'platform\.subscriptions\.read'/);
});
