'use strict';

/**
 * PayFast checkout and ITN integration tests.
 *
 * These exercise the real HTTP pipeline, the real database and the real
 * signature code. The provider itself is never contacted: PAYFAST_VALIDATE is
 * disabled, so the server-to-server confirmation is reported as "skipped"
 * instead of making a network call.
 */

process.env.PAYFAST_MERCHANT_ID = '10000100';
process.env.PAYFAST_MERCHANT_KEY = '46f0cd694581a';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';
process.env.PAYFAST_SANDBOX = 'true';
process.env.PAYFAST_VALIDATE = 'false';
process.env.APP_BASE_URL = 'https://ecd.example';
process.env.API_BASE_URL = 'https://api.example';
delete process.env.RESEND_API_KEY;
delete process.env.PAYFAST_IP_ALLOWLIST;

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');
const payfast = require('../src/services/payfast-service');

test.before(start);
test.after(stop);

let cachedContext = null;

async function familyContext() {
  if (cachedContext) return cachedContext;
  const pool = await db.getPool();
  const row = (await pool.query(
    `SELECT l.id AS learner_id, l.branch_id, o.id AS organisation_id, g.id AS guardian_id, g.email AS guardian_email
     FROM learners l
     JOIN organisations o ON o.id = l.organisation_id
     JOIN learner_guardians lg ON lg.learner_id = l.id
     JOIN guardians g ON g.id = lg.guardian_id
     WHERE o.slug = 'little-sprouts' AND l.first_name = 'Amelia'
     ORDER BY lg.is_primary_contact DESC
     LIMIT 1`
  )).rows[0];
  cachedContext = row;
  return row;
}

async function issueInvoice(client, amount) {
  const family = await familyContext();
  const result = await client.post('/invoices', {
    branchId: family.branch_id,
    learnerId: family.learner_id,
    guardianId: family.guardian_id,
    description: 'PayFast integration test',
    items: [{ description: 'Test programme fee', unitAmount: amount }],
    issueNow: true
  });
  assert.equal(result.status, 201, result.text);
  return result.data;
}

/**
 * Build an ITN in the order PayFast posts it, signed the same way.
 */
function itn(intent, overrides = {}) {
  const gross = Number(intent.amount).toFixed(2);
  const fields = {
    m_payment_id: intent.reference,
    pf_payment_id: 'PF-' + Math.random().toString(36).slice(2, 12),
    payment_status: 'COMPLETE',
    item_name: 'Test programme fee',
    amount_gross: gross,
    amount_fee: '-10.00',
    amount_net: (Number(intent.amount) - 10).toFixed(2),
    merchant_id: process.env.PAYFAST_MERCHANT_ID,
    email_address: 'parent@example.com',
    name_first: 'Sarah',
    name_last: 'Johnson',
    custom_str1: intent.organisation_id,
    custom_str2: intent.invoice_id,
    ...overrides
  };
  const pairs = Object.entries(fields).filter(([, value]) => value !== undefined && value !== null);
  pairs.push(['signature', payfast.itnSignature(pairs)]);
  return pairs;
}

test('finance can create a signed payment link and the ITN settles the invoice', async () => {
  const finance = createClient();
  const session = await finance.login('finance@littlesprouts.local');
  const family = await familyContext();
  const invoice = await issueInvoice(finance, 1234.56);

  const link = await finance.post('/invoices/' + invoice.id + '/payfast-link', {});
  assert.equal(link.status, 200, link.text);
  const { intent, checkout } = link.data;
  assert.equal(intent.status, 'pending');
  assert.match(intent.reference, /^ECD-[A-Z0-9]+-[A-F0-9]+$/);
  assert.equal(Number(intent.amount), 1234.56);
  assert.equal(intent.invoice_id, invoice.id);
  assert.equal(checkout.action, 'https://sandbox.payfast.co.za/eng/process');
  assert.equal(checkout.fields.amount, '1234.56');
  assert.equal(checkout.fields.m_payment_id, intent.reference);
  assert.equal(checkout.fields.custom_str1, session.activeOrganisationId);
  assert.equal(checkout.fields.custom_str2, invoice.id);
  assert.equal(checkout.fields.notify_url, 'https://api.example/api/v1/public/payfast/itn');
  assert.match(checkout.fields.signature, /^[a-f0-9]{32}$/);

  const deliveries = await db.getPool();
  const invoiceMail = await deliveries.query(
    "SELECT status, recipient FROM email_deliveries WHERE organisation_id = $1 AND template = 'invoiceIssued' ORDER BY created_at",
    [session.activeOrganisationId]
  );
  assert.ok(invoiceMail.rows.length >= 1);
  assert.equal(invoiceMail.rows[invoiceMail.rows.length - 1].status, 'skipped');
  assert.equal(invoiceMail.rows[invoiceMail.rows.length - 1].recipient, family.guardian_email);

  const notification = itn(intent);
  const settled = await finance.postForm('/public/payfast/itn', notification);
  assert.equal(settled.status, 200, settled.text);
  assert.equal(settled.text, 'OK');

  const paid = await finance.get('/invoices/' + invoice.id);
  assert.equal(paid.status, 200, paid.text);
  assert.equal(paid.data.status, 'paid');
  assert.equal(Number(paid.data.amount_paid), 1234.56);

  const payment = await deliveries.query(
    "SELECT payment_method, amount, status, provider_reference FROM payments WHERE idempotency_key = $1",
    ['payfast:' + notification.find(([key]) => key === 'pf_payment_id')[1]]
  );
  assert.equal(payment.rows.length, 1);
  assert.equal(payment.rows[0].payment_method, 'payfast');
  assert.equal(Number(payment.rows[0].amount), 1234.56);
  assert.equal(payment.rows[0].status, 'confirmed');

  const intentRow = await deliveries.query('SELECT status, payment_id FROM payment_intents WHERE id = $1', [intent.id]);
  assert.equal(intentRow.rows[0].status, 'paid');
  assert.ok(intentRow.rows[0].payment_id);

  const receipt = await deliveries.query(
    "SELECT status FROM email_deliveries WHERE organisation_id = $1 AND template = 'paymentReceipt'",
    [session.activeOrganisationId]
  );
  assert.ok(receipt.rows.length >= 1);
  assert.equal(receipt.rows[0].status, 'skipped');
});

test('a duplicate ITN is acknowledged without double-paying the invoice', async () => {
  const finance = createClient();
  const session = await finance.login('finance@littlesprouts.local');
  const invoice = await issueInvoice(finance, 250);
  const link = await finance.post('/invoices/' + invoice.id + '/payfast-link', {});
  assert.equal(link.status, 200, link.text);
  const { intent } = link.data;

  const notification = itn(intent);
  const first = await finance.postForm('/public/payfast/itn', notification);
  assert.equal(first.text, 'OK');
  const duplicate = await finance.postForm('/public/payfast/itn', notification);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.text, 'DUPLICATE');

  const pool = await db.getPool();
  const paid = await pool.query('SELECT status, amount_paid FROM invoices WHERE id = $1', [invoice.id]);
  assert.equal(paid.rows[0].status, 'paid');
  assert.equal(Number(paid.rows[0].amount_paid), 250);

  const payments = await pool.query(
    "SELECT count(*)::int AS count FROM payments WHERE organisation_id = $1 AND payment_method = 'payfast' AND idempotency_key = $2",
    [session.activeOrganisationId, 'payfast:' + notification.find(([key]) => key === 'pf_payment_id')[1]]
  );
  assert.equal(payments.rows[0].count, 1);
});

test('a tampered or mis-signed ITN is rejected', async () => {
  const finance = createClient();
  await finance.login('finance@littlesprouts.local');
  const invoice = await issueInvoice(finance, 300);
  const link = await finance.post('/invoices/' + invoice.id + '/payfast-link', {});
  assert.equal(link.status, 200, link.text);
  const { intent } = link.data;

  const signed = itn(intent);
  const tampered = signed.map((pair) => (pair[0] === 'amount_gross' ? ['amount_gross', '1.00'] : pair));
  const rejected = await finance.postForm('/public/payfast/itn', tampered);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.text, 'INVALID');

  const unsigned = signed.filter(([key]) => key !== 'signature');
  const missing = await finance.postForm('/public/payfast/itn', unsigned);
  assert.equal(missing.status, 400);
  assert.equal(missing.text, 'INVALID');

  // Correctly signed but for the wrong amount: acknowledged so PayFast stops
  // retrying, but the invoice is deliberately left open.
  const wrongAmount = itn(intent, { amount_gross: '1.00' });
  const mismatch = await finance.postForm('/public/payfast/itn', wrongAmount);
  assert.equal(mismatch.status, 200);
  assert.equal(mismatch.text, 'REJECTED');

  const pool = await db.getPool();
  const row = await pool.query('SELECT status, amount_paid FROM invoices WHERE id = $1', [invoice.id]);
  assert.equal(row.rows[0].status, 'issued');
  assert.equal(Number(row.rows[0].amount_paid), 0);
});

test('a parent can start a checkout from the family portal', async () => {
  const finance = createClient();
  await finance.login('finance@littlesprouts.local');
  const invoice = await issueInvoice(finance, 875.4);

  const parent = createClient();
  await parent.login('parent@littlesprouts.local');
  const pay = await parent.post('/parent/invoices/' + invoice.id + '/pay', {});
  assert.equal(pay.status, 200, pay.text);
  const { intent, checkout } = pay.data;
  assert.equal(Number(intent.amount), 875.4);
  assert.equal(checkout.fields.amount, '875.40');
  assert.match(checkout.fields.return_url, /^https:\/\/ecd\.example\/#\/parent\/finance\?payment=return&ref=/);
  assert.match(checkout.fields.cancel_url, /payment=cancelled/);

  const settled = await parent.postForm('/public/payfast/itn', itn(intent));
  assert.equal(settled.text, 'OK');

  const paid = await parent.get('/parent/invoices/' + invoice.id);
  assert.equal(paid.status, 200, paid.text);
  assert.equal(paid.data.status, 'paid');
  assert.equal(Number(paid.data.outstanding), 0);
});

test('a daycare cannot create a payment link for another tenant invoice', async () => {
  const finance = createClient();
  await finance.login('finance@littlesprouts.local');
  const invoice = await issueInvoice(finance, 100);

  const sunrise = createClient();
  await sunrise.login('principal@sunrise.local');
  const denied = await sunrise.post('/invoices/' + invoice.id + '/payfast-link', {});
  assert.equal(denied.status, 404);

  const teacher = createClient();
  await teacher.login('teacher@littlesprouts.local');
  const forbidden = await teacher.post('/invoices/' + invoice.id + '/payfast-link', {});
  assert.equal(forbidden.status, 403);
});

test('the payment link is refused when PayFast is not configured', async () => {
  const finance = createClient();
  await finance.login('finance@littlesprouts.local');
  const invoice = await issueInvoice(finance, 50);

  const merchantId = process.env.PAYFAST_MERCHANT_ID;
  delete process.env.PAYFAST_MERCHANT_ID;
  try {
    const refused = await finance.post('/invoices/' + invoice.id + '/payfast-link', {});
    assert.equal(refused.status, 409);
    assert.match(refused.error.message, /not configured/i);
  } finally {
    process.env.PAYFAST_MERCHANT_ID = merchantId;
  }
});

test('the public return endpoint redirects to the family portal', async () => {
  const client = createClient();
  const result = await client.get('/public/payfast/return?payment=cancelled&ref=ECD-TEST', { redirect: 'manual' });
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('location'), 'https://ecd.example/#/parent/finance?payment=cancelled&ref=ECD-TEST');
});
