'use strict';

/**
 * Billing: how an organisation pays Re-EL, and how it collects parent fees.
 *
 * These tests pin the two settlement modes end to end:
 *   - the tenant pays their own Re-EL subscription through the platform's
 *     PayFast account, and the invoice settles + the period extends via ITN;
 *   - a tenant can connect their own PayFast account, in which case parent
 *     fees must NOT reach the platform settlement ledger;
 *   - platform-collected fees are pooled per organisation and settled by EFT,
 *     minus the configured fee, with an audit trail.
 */

process.env.PAYFAST_MERCHANT_ID = '10000100';
process.env.PAYFAST_MERCHANT_KEY = '46f0cd694581a';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';
process.env.PAYFAST_SANDBOX = 'true';
process.env.PAYFAST_VALIDATE = 'false';
process.env.APP_BASE_URL = 'https://ecd.example';
process.env.API_BASE_URL = 'https://api.example';
process.env.PAYMENT_CREDENTIALS_KEY = 'test-only-credentials-key';
process.env.CRON_SECRET = 'test-cron-secret';
delete process.env.RESEND_API_KEY;
delete process.env.PAYFAST_IP_ALLOWLIST;

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');
const payfast = require('../src/services/payfast-service');

test.before(start);
test.after(stop);

const PLATFORM_MID = '10000100';
const TENANT_MID = '87654321';
const PLATFORM_PASSPHRASE = 'test-passphrase';
const TENANT_PASSPHRASE = 'tenant-test-passphrase';

function itn(reference, overrides = {}) {
  const fields = {
    m_payment_id: reference,
    pf_payment_id: 'PF-' + Math.random().toString(36).slice(2, 12),
    payment_status: 'COMPLETE',
    item_name: 'Re-EL ECD',
    amount_gross: '999.00',
    amount_fee: '-5.00',
    amount_net: '994.00',
    merchant_id: PLATFORM_MID,
    email_address: 'payer@example.com',
    ...overrides
  };
  const pairs = Object.entries(fields);
  const secret = pairs.some(([key]) => key === 'merchant_id' && fields.merchant_id === TENANT_MID)
    ? TENANT_PASSPHRASE
    : PLATFORM_PASSPHRASE;
  pairs.push(['signature', payfast.itnSignature(pairs, secret)]);
  return pairs;
}

async function principal() {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  return { client, session, organisationId: session.activeOrganisationId };
}

async function platform() {
  const client = createClient();
  const session = await client.login('platform@re-el-ecd.local');
  return { client, session };
}

async function createPaidForm(client, organisationId, name) {
  const slug = 'billing-form-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const form = await client.post('/forms', {
    name: name || 'Enrolment deposit',
    slug,
    formType: 'enrolment',
    isPublic: true,
    displayOnWebsite: false,
    paymentEnabled: true,
    paymentRequired: true,
    paymentAmount: 250,
    paymentCurrency: 'ZAR',
    paymentDescription: 'Enrolment deposit',
    fields: [
      { key: 'child_name', label: 'Child name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true }
    ]
  }, { organisationId });
  assert.equal(form.status, 201, form.text);
  const published = await client.post('/forms/' + form.data.id + '/publish', { isPublic: true }, { organisationId });
  assert.equal(published.status, 200, published.text);
  return slug;
}

async function submitPublicForm(slug) {
  const client = createClient();
  const submit = await client.post('/public/forms/little-sprouts/' + slug + '/submit', {
    data: { child_name: 'Amelia Johnson', email: 'parent@example.com' },
    email: 'parent@example.com',
    payerName: 'Sarah Johnson'
  });
  assert.equal(submit.status, 200, submit.text);
  assert.ok(submit.data.payment && submit.data.payment.checkout);
  return submit.data;
}

test('the tenant sees their plan, a past_due status and the automatically issued invoice', async () => {
  const { client, organisationId } = await principal();
  const response = await client.get('/billing/summary', { organisationId });
  assert.equal(response.status, 200, response.text);
  const billing = response.data;
  assert.equal(billing.organisation.id, organisationId);
  assert.equal(billing.subscription.planName, 'Sapling');
  assert.equal(billing.subscription.amount, 999);
  // The seeded period ended in October, so the lazy flip marks it overdue.
  assert.equal(billing.subscription.status, 'past_due');
  assert.ok(billing.openInvoice, 'an invoice is issued for the current period automatically');
  assert.equal(Number(billing.openInvoice.amount), 999);
  assert.equal(billing.openInvoice.status, 'issued');
  assert.ok(billing.invoices.length >= 1);
  assert.equal(billing.paymentAccount.mode, 'platform_collected');
  assert.equal(billing.collections.outstanding, 0);
});

test('a tenant pays the subscription invoice through PayFast; the invoice settles and the period extends', async () => {
  const { client, organisationId } = await principal();
  const pay = await client.post('/billing/subscription/pay', {}, { organisationId });
  assert.equal(pay.status, 200, pay.text);
  const { checkout, invoice } = pay.data;
  assert.equal(Number(pay.data.amount), 999);
  assert.equal(checkout.fields.merchant_id, PLATFORM_MID);
  assert.equal(checkout.fields.amount, '999.00');
  assert.match(checkout.fields.item_name, /Sapling/);
  assert.match(checkout.fields.return_url, /tab=billing&payment=return/);

  const reference = checkout.fields.m_payment_id;
  const paid = await createClient().postForm('/public/payfast/itn', itn(reference, {
    item_name: checkout.fields.item_name,
    amount_gross: '999.00',
    merchant_id: PLATFORM_MID,
    custom_str1: organisationId
  }));
  assert.equal(paid.status, 200, paid.text);
  assert.equal(paid.text, 'OK');

  const summary = await client.get('/billing/summary', { organisationId });
  assert.equal(summary.data.subscription.status, 'active');
  assert.ok(String(summary.data.subscription.currentPeriodEnd).slice(0, 10) >= String(new Date().toISOString().slice(0, 10)),
    'the period extends beyond today');
  const paidInvoice = (summary.data.invoices || []).find((entry) => entry.id === invoice.id);
  assert.equal(paidInvoice.status, 'paid');

  const settlements = await (await platform()).client.get('/platform/settlements');
  const row = (settlements.data.rows || []).find((entry) => entry.organisationId === organisationId);
  assert.equal(row ? row.collectedGross : 0, 0, 'a platform subscription is the platform’s own money, never a tenant settlement');
});

test('a tenant connects their own PayFast account; parent payments settle there, not to the platform ledger', async () => {
  const { client, organisationId } = await principal();

  const saved = await client.put('/billing/payment-account', {
    mode: 'own_payfast',
    merchantId: TENANT_MID,
    merchantKey: '0123456789abcdef0123456789abcdef',
    passphrase: TENANT_PASSPHRASE
  }, { organisationId });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.data.mode, 'own_payfast');
  assert.equal(saved.data.merchantKeySet, true);
  assert.ok(!JSON.stringify(saved.data).includes('0123456789abcdef'), 'secrets are never returned to the client');

  const slug = await createPaidForm(client, organisationId, 'Own-PayFast deposit');
  const submitted = await submitPublicForm(slug);
  const checkout = submitted.payment.checkout;
  assert.equal(checkout.fields.merchant_id, TENANT_MID, 'the checkout targets the tenant’s merchant account');

  const reference = checkout.fields.m_payment_id;
  // The platform’s credentials cannot pass verification for a tenant checkout.
  const rejected = await createClient().postForm('/public/payfast/itn', itn(reference, {
    item_name: checkout.fields.item_name,
    amount_gross: '250.00',
    merchant_id: PLATFORM_MID
  }));
  assert.equal(rejected.status, 400);

  const accepted = await createClient().postForm('/public/payfast/itn', itn(reference, {
    item_name: checkout.fields.item_name,
    amount_gross: '250.00',
    merchant_id: TENANT_MID
  }));
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal(accepted.text, 'OK');

  const submission = await db.one(
    `SELECT s.payment_status FROM form_submissions s
     JOIN payment_intents i ON i.id = s.payment_intent_id
     WHERE i.reference = $1`, [reference]
  );
  assert.equal(submission.payment_status, 'paid');

  const { client: admin } = await platform();
  const settlements = await admin.get('/platform/settlements');
  const row = (settlements.data.rows || []).find((entry) => entry.organisationId === organisationId);
  assert.equal(row ? row.collectedGross : 0, 0, 'own-account collections must not appear in the platform ledger');
});

test('the platform settles platform-collected fees to the tenant, minus the collection fee', async () => {
  const { client, organisationId } = await principal();
  const { client: admin } = await platform();

  // Back to platform collection, with 10% fee.
  const switched = await client.put('/billing/payment-account', {
    mode: 'platform_collected',
    clearCredentials: true
  }, { organisationId });
  assert.equal(switched.status, 200, switched.text);
  assert.equal(switched.data.mode, 'platform_collected');

  const fee = await admin.put('/platform/organisations/' + organisationId + '/payment-account', { feePercent: 10 });
  assert.equal(fee.status, 200, fee.text);
  assert.equal(fee.data.feePercent, 10);

  const slug = await createPaidForm(client, organisationId, 'Platform-collected deposit');
  const submitted = await submitPublicForm(slug);
  const checkout = submitted.payment.checkout;
  assert.equal(checkout.fields.merchant_id, PLATFORM_MID);
  const paid = await createClient().postForm('/public/payfast/itn', itn(checkout.fields.m_payment_id, {
    item_name: checkout.fields.item_name,
    amount_gross: '250.00',
    merchant_id: PLATFORM_MID,
    custom_str1: organisationId
  }));
  assert.equal(paid.status, 200, paid.text);

  const before = await admin.get('/platform/settlements');
  const rowBefore = (before.data.rows || []).find((entry) => entry.organisationId === organisationId);
  assert.ok(rowBefore, 'the collection appears in the ledger');
  assert.ok(rowBefore.outstanding >= 250, 'the balance covers the collected fee');
  const outstanding = rowBefore.outstanding;

  const payout = await admin.post('/platform/settlements/payout', { organisationId, reference: 'EFT-TEST-0001' });
  assert.equal(payout.status, 201, payout.text);
  assert.equal(Number(payout.data.gross_amount), outstanding);
  assert.equal(Number(payout.data.fee_amount), Math.round(outstanding * 0.10 * 100) / 100);
  assert.equal(Number(payout.data.net_amount), Math.round((outstanding - Math.round(outstanding * 0.10 * 100) / 100) * 100) / 100);
  assert.equal(payout.data.reference, 'EFT-TEST-0001');

  const after = await admin.get('/platform/settlements');
  const rowAfter = (after.data.rows || []).find((entry) => entry.organisationId === organisationId);
  assert.equal(rowAfter ? rowAfter.outstanding : 0, 0);

  const payouts = await admin.get('/platform/settlements/payouts?organisationId=' + organisationId);
  assert.ok((payouts.data || []).some((entry) => entry.id === payout.data.id));

  const overpay = await admin.post('/platform/settlements/payout', { organisationId, grossAmount: outstanding + 100 });
  assert.equal(overpay.status, 422, 'a payout may not exceed the outstanding balance');

  const voided = await admin.post('/platform/settlements/payouts/' + payout.data.id + '/void', {});
  assert.equal(voided.status, 200, voided.text);
  assert.equal(voided.data.status, 'void');
  const restored = await admin.get('/platform/settlements');
  const rowRestored = (restored.data.rows || []).find((entry) => entry.organisationId === organisationId);
  assert.equal(rowRestored.outstanding, outstanding, 'voiding the payout restores the balance');
});

test('the platform records a manual subscription payment and the period extends', async () => {
  const { session, organisationId } = await principal();
  const { client: admin } = await platform();
  const before = await admin.get('/platform/organisations/' + organisationId);
  assert.equal(before.status, 200, before.text);

  const result = await admin.post('/platform/organisations/' + organisationId + '/subscription/manual-payment', {
    reference: 'EFT-MANUAL-0001',
    notes: 'Paid by EFT 4 November 2026'
  });
  assert.equal(result.status, 200, result.text);
  assert.equal(result.data.subscription.status, 'active');
  assert.ok(String(result.data.subscription.current_period_end).slice(0, 10) > '2026-12-01');
  assert.equal(result.data.invoice.status, 'paid');
  assert.equal(result.data.invoice.payment_reference, 'EFT-MANUAL-0001');

  const audit = await db.one(
    "SELECT COUNT(*)::int AS total FROM audit_events WHERE action = 'platform.subscription_manual_payment' AND organisation_id = $1",
    [organisationId]
  );
  assert.ok(audit.total >= 1);
});

test('the reminder endpoint is inert without the secret and flips statuses and emails owners with it', async () => {
  const { client } = await principal();
  const withoutAuth = await client.get('/internal/subscription-reminders');
  assert.equal(withoutAuth.status, 404);
  const wrongAuth = await createClient().get('/internal/subscription-reminders', {
    token: 'nope-not-the-secret'
  });
  assert.equal(wrongAuth.status, 404);
  const rightAuth = await createClient().get('/internal/subscription-reminders', {
    token: 'test-cron-secret'
  });
  assert.equal(rightAuth.status, 200, rightAuth.text);
  assert.ok(typeof rightAuth.data.flipped === 'number');
  assert.ok(typeof rightAuth.data.reminders === 'number');
});

test('a suspended tenant can still view and pay their subscription invoice; payment restores the workspace', async () => {
  const { session, organisationId } = await principal();
  const { client: admin } = await platform();

  const suspended = await admin.post('/platform/organisations/' + organisationId + '/suspend', {
    reason: 'Non-payment of subscription.'
  });
  assert.equal(suspended.status, 200, suspended.text);

  // Suspension revoked sessions: sign in again and confirm normal routes are blocked,
  // but billing (summary + checkout) still works.
  const tenant = createClient();
  await tenant.login('principal@littlesprouts.local');
  const blocked = await tenant.get('/organisations/current', { organisationId });
  assert.equal(blocked.status, 403, blocked.text);
  assert.match(blocked.error.message, /suspended/i);

  const summary = await tenant.get('/billing/summary', { organisationId });
  assert.equal(summary.status, 200, summary.text);
  assert.equal(summary.data.workspaceSuspended, true);
  assert.ok(summary.data.openInvoice, 'the suspended tenant still sees the open invoice');

  const pay = await tenant.post('/billing/subscription/pay', {}, { organisationId });
  assert.equal(pay.status, 200, pay.text);
  const checkout = pay.data.checkout;
  assert.equal(Number(pay.data.amount), 999);

  // Still blocked from everything else until the payment lands.
  const stillBlocked = await tenant.get('/organisations/current', { organisationId });
  assert.equal(stillBlocked.status, 403);

  const reference = checkout.fields.m_payment_id;
  const paid = await createClient().postForm('/public/payfast/itn', itn(reference, {
    item_name: checkout.fields.item_name,
    amount_gross: '999.00',
    merchant_id: PLATFORM_MID,
    custom_str1: organisationId
  }));
  assert.equal(paid.status, 200, paid.text);
  assert.equal(paid.text, 'OK');

  const org = await db.one('SELECT status, subscription_status FROM organisations WHERE id = $1', [organisationId]);
  assert.equal(org.status, 'active', 'payment reactivated the workspace');
  assert.equal(org.subscription_status, 'active');

  const restored = await tenant.get('/organisations/current', { organisationId });
  assert.equal(restored.status, 200, restored.text);

  const audit = await db.one(
    `SELECT COUNT(*)::int AS total FROM audit_events
     WHERE action = 'platform.organisation_restored' AND organisation_id = $1 AND metadata->>'reason' = 'subscription_payment'`,
    [organisationId]
  );
  assert.ok(audit.total >= 1, 'the auto-restore is audited');
});
