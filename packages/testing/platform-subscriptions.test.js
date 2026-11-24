'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const view = read('apps/web/src/views/platform.js');
const api = read('apps/api/src/modules/platform.js');
const css = read('apps/web/assets/styles.css');
const vercel = JSON.parse(read('vercel.json'));

test('the broken Record payment action is fixed', () => {
  assert.ok(!/const subscription = subs\.find[\s\S]{0,400}R\.attr\('\'' \+ id/.test(view), 'no broken modal lookup');
  assert.match(view, /const subs = data\.subscriptions \|\| \[\]/);
  assert.match(view, /manualSubscriptionPayment/);
  assert.ok(!/status === 'overdue'/.test(view), 'no invalid overdue status');
});

test('tenant subscriptions have search, status, period filters and pagination', () => {
  assert.match(view, /R\.searchFilter\(ctx, 'subQ'/);
  assert.match(view, /R\.selectFilter\(ctx, 'subStatus'/);
  assert.match(view, /R\.selectFilter\(ctx, 'subPeriod'/);
  assert.match(view, /filters\.subPage/);
  assert.match(view, /Page ' \+ currentPage \+ ' of/);
});

test('bulk plan assignment and suspension are exposed', () => {
  assert.match(view, /bulkAssignPlan/);
  assert.match(view, /bulkSuspend/);
  assert.match(view, /Suspend', icon: 'ban', modal: 'bulkSuspend'/);
  assert.match(view, /Restore'.*\/platform\/organisations\/bulk/);
  assert.match(view, /action: 'assign_plan'/);
  assert.match(view, /planId: body\.planId/);
  assert.match(view, /action: 'suspend'/);
  assert.match(view, /reason: body\.reason/);
  assert.match(api, /enum: \['suspend', 'restore', 'assign_plan'\]/);
});

test('billing sweep and online checkout are available from subscriptions', () => {
  assert.match(view, /\/platform\/subscriptions\/sweep/);
  assert.match(view, /billSubscription/);
  assert.match(read('apps/web/src/app.js'), /createSubscriptionCheckout/);
  assert.match(api, /router\.post\('\/platform\/organisations\/:id\/subscription\/checkout'/);
});

test('setup fee actions are available in the subscription drawer', () => {
  assert.match(view, /setupFeePayment/);
  assert.match(view, /\/setup-fee\/manual-payment/);
  assert.match(api, /router\.post\('\/platform\/organisations\/:id\/setup-fee\/waive'/);
  assert.match(view, /waiveSetupFee|Waive fee/);
});

test('assigning a plan can set a custom period', () => {
  assert.match(view, /currentPeriodStart/);
  assert.match(view, /currentPeriodEnd/);
  assert.match(view, /Days in period/);
  assert.match(api, /currentPeriodStart: \{ type: 'string', date: true, optional: true \}/);
});

test('platform invoices and billing activity are returned and rendered', () => {
  assert.match(api, /FROM platform_subscription_invoices i JOIN organisations o/);
  assert.match(api, /return \{\s*plans, subscriptions, mrr:/);
  assert.match(api, /mrrByCurrency/);
  assert.match(view, /Subscription invoices/);
  assert.match(view, /Billing activity/);
  assert.match(view, /subscription-invoices/);
  assert.match(css, /\.sub-activity \{/);
});

test('subscription lifecycle actions have validated API endpoints', () => {
  ['cancel', 'period', 'waive'].forEach((action) => {
    assert.match(api, new RegExp("router\\.post\\('/platform/subscriptions/:id/" + action + "'"));
  });
  ['void', 'mark-paid', 'refund'].forEach((action) => {
    assert.match(api, new RegExp("router\\.post\\('/platform/subscription-invoices/:id/" + action.replace('-', '\\-') + "'"));
  });
  assert.match(api, /platform\.subscription_cancelled/);
  assert.match(api, /platform\.subscription_period_changed/);
  assert.match(api, /platform\.subscription_waived/);
  assert.match(api, /platform\.subscription_refund_recorded/);
});

test('dunning reminders run on a daily cron', () => {
  const jobs = vercel.crons || [];
  assert.ok(jobs.some((job) => job.path === '/api/v1/internal/subscription-reminders' && job.schedule === '0 7 * * *'));
});

test('risk and health panels surface trials, ageing and revenue by plan', () => {
  assert.match(view, /Trials ending in 7 days/);
  assert.match(view, /Past due under 7 days/);
  assert.match(view, /Past due 7–30 days/);
  assert.match(view, /Past due over 30 days/);
  assert.match(view, /mrrByCurrency/);
  assert.match(css, /\.sub-risk-grid \{/);
});
