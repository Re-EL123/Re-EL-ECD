'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

test('a 30-day trial does not issue a payable invoice until it ends', async () => {
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  assert.equal((await admin.patch('/platform/settings', { settings: { allowTenantSignup: true } })).status, 200);

  const anon = createClient();
  const created = await anon.post('/public/signup', {
    centreName: 'Trial Billing Centre',
    ownerName: 'Anita Trial',
    ownerEmail: 'anita@trialbilling.local',
    password: 'trial-pass-123'
  });
  assert.equal(created.status, 201, created.text);

  const owner = createClient();
  await owner.login('anita@trialbilling.local', 'trial-pass-123');
  const trialSummary = await owner.get('/billing/summary');
  assert.equal(trialSummary.status, 200, trialSummary.text);
  assert.equal(trialSummary.data.subscription.status, 'trial');
  assert.ok(trialSummary.data.subscription.daysRemaining >= 28,
    'a fresh 30-day trial should report its remaining days, not zero/null');
  assert.ok(trialSummary.data.subscription.daysRemaining <= 30);
  assert.equal(trialSummary.data.openInvoice, null, 'no invoice should be payable during the trial');
  assert.equal((trialSummary.data.invoices || []).length, 0);

  const invoices = await db.many(
    `SELECT * FROM platform_subscription_invoices
     WHERE organisation_id = (SELECT id FROM organisations WHERE slug = $1)`, ['trial-billing-centre']
  );
  assert.equal(invoices.length, 0);

  // Once the trial lapses, an invoice is raised with a current due date.
  await db.query(
    `UPDATE platform_subscriptions SET status = 'past_due',
       current_period_start = now() - interval '40 days',
       current_period_end = now() - interval '10 days'
     WHERE organisation_id = (SELECT id FROM organisations WHERE slug = 'trial-billing-centre')`
  );
  const lapsed = await owner.get('/billing/summary');
  assert.equal(lapsed.status, 200, lapsed.text);
  assert.ok(lapsed.data.openInvoice, 'a payable invoice appears after the trial ends');
  assert.ok(new Date(lapsed.data.openInvoice.due_at) >= new Date(Date.now() - 86400000));

  await admin.patch('/platform/settings', { settings: { allowTenantSignup: false } });
});
