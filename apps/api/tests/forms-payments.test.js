'use strict';

/**
 * Public forms with PayFast payments.
 *
 * These tests pin three things that are easy to regress:
 *   - checkout fields are signed and posted in PayFast's documented order,
 *     not alphabetically;
 *   - a paid public form creates a form_payment intent tied to its submission;
 *   - the ITN settles exactly that submission without touching invoices.
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

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');
const payfast = require('../src/services/payfast-service');

test.before(start);
test.after(stop);

function md5(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

function itn(intent, overrides = {}) {
  const gross = Number(intent.amount).toFixed(2);
  const fields = {
    m_payment_id: intent.reference,
    pf_payment_id: 'PF-' + Math.random().toString(36).slice(2, 12),
    payment_status: 'COMPLETE',
    item_name: 'Enrolment deposit',
    amount_gross: gross,
    amount_fee: '-5.00',
    amount_net: (Number(intent.amount) - 5).toFixed(2),
    merchant_id: process.env.PAYFAST_MERCHANT_ID,
    email_address: 'parent@example.com',
    name_first: 'Sarah',
    name_last: 'Johnson',
    custom_str1: intent.organisation_id,
    ...overrides
  };
  const pairs = Object.entries(fields).filter(([, value]) => value !== undefined && value !== null);
  pairs.push(['signature', payfast.itnSignature(pairs)]);
  return pairs;
}

async function principal() {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  return { client, organisationId: session.activeOrganisationId };
}

async function createPaidForm(client, organisationId, options = {}) {
  const slug = 'paid-form-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const form = await client.post('/forms', {
    name: 'Enrolment deposit',
    slug,
    formType: 'enrolment',
    description: 'Pay the deposit with your enrolment form.',
    isPublic: true,
    displayOnWebsite: options.displayOnWebsite !== false,
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
  return { form: form.data, slug };
}

test('checkout fields are signed in PayFast documented order, not alphabetically', () => {
  const checkout = payfast.buildCheckout({
    reference: 'ECD-SIGNATURE-TEST',
    amount: 250,
    itemName: 'Enrolment deposit',
    itemDescription: 'A test payment',
    nameFirst: 'Sarah',
    nameLast: 'Johnson',
    email: 'sarah@example.com',
    returnUrl: 'https://ecd.example/return',
    cancelUrl: 'https://ecd.example/cancel',
    notifyUrl: 'https://api.example/itn',
    organisationId: '11111111-1111-4111-8111-111111111111'
  });

  const documented = payfast.CHECKOUT_FIELD_ORDER.filter((key) => checkout.fields[key] !== undefined);
  assert.deepEqual(Object.keys(checkout.fields).filter((key) => key !== 'signature'), documented);

  const parts = documented.map((key) => key + '=' + payfast.pfEncode(checkout.fields[key]));
  parts.push('passphrase=' + payfast.pfEncode(process.env.PAYFAST_PASSPHRASE));
  const expected = md5(parts.join('&'));
  assert.equal(checkout.fields.signature, expected);

  const alphabetical = Object.keys(checkout.fields)
    .filter((key) => key !== 'signature')
    .sort()
    .map((key) => key + '=' + payfast.pfEncode(checkout.fields[key]));
  alphabetical.push('passphrase=' + payfast.pfEncode(process.env.PAYFAST_PASSPHRASE));
  assert.notEqual(md5(alphabetical.join('&')), expected, 'alphabetical order must not produce the valid signature');

  // The posted form and the query string must use the same order as the hash.
  const posted = Object.keys(checkout.fields).filter((key) => key !== 'signature');
  assert.deepEqual(posted, documented);
  assert.match(checkout.query, /^merchant_id=10000100&merchant_key=46f0cd694581a&/);
  assert.ok(checkout.query.endsWith('&signature=' + expected));
});

test('a paid public form creates a form_payment intent tied to the submission', async () => {
  const { client, organisationId } = await principal();
  const { form, slug } = await createPaidForm(client, organisationId);

  const invoicesBefore = await db.one(
    'SELECT COUNT(*)::int AS total FROM invoices WHERE organisation_id = $1', [organisationId]
  );

  const publicForm = await createClient().get('/public/forms/little-sprouts/' + slug);
  assert.equal(publicForm.status, 200, publicForm.text);
  assert.equal(publicForm.data.form.payment.enabled, true);
  assert.equal(Number(publicForm.data.form.payment.amount), 250);
  assert.equal(publicForm.data.form.payment.available, true);

  const submit = await createClient().post('/public/forms/little-sprouts/' + slug + '/submit', {
    data: { child_name: 'Amelia Johnson', email: 'parent@example.com' },
    email: 'parent@example.com',
    payerName: 'Sarah Johnson'
  });
  assert.equal(submit.status, 200, submit.text);
  assert.equal(submit.data.received, true);
  assert.ok(submit.data.submissionId);
  assert.equal(submit.data.payment.required, true);
  assert.equal(Number(submit.data.payment.amount), 250);
  const checkout = submit.data.payment.checkout;
  assert.ok(checkout);
  assert.equal(checkout.fields.amount, '250.00');
  assert.equal(checkout.fields.custom_str1, organisationId);
  assert.equal(checkout.fields.item_name, form.name);
  assert.match(checkout.fields.return_url, /#\/site\/little-sprouts\/forms\?payment=return&ref=/);

  const intent = await db.one('SELECT * FROM payment_intents WHERE reference = $1', [checkout.fields.m_payment_id]);
  assert.equal(intent.purpose, 'form_payment');
  assert.equal(intent.metadata.formId, form.id);
  assert.equal(intent.metadata.submissionId, submit.data.submissionId);
  assert.equal(intent.metadata.payerEmail, 'parent@example.com');

  const submission = await db.one('SELECT * FROM form_submissions WHERE id = $1', [submit.data.submissionId]);
  assert.equal(submission.payment_status, 'pending');
  assert.equal(submission.payment_intent_id, intent.id);

  const settled = await createClient().postForm('/public/payfast/itn', itn(intent));
  assert.equal(settled.status, 200, settled.text);
  assert.equal(settled.text, 'OK');

  const paid = await db.one('SELECT * FROM form_submissions WHERE id = $1', [submit.data.submissionId]);
  assert.equal(paid.payment_status, 'paid');
  assert.equal(Number(paid.amount_paid), 250);
  assert.equal(paid.status, 'received', 'the review status must not change when payment settles');

  const receipt = await db.one(
    "SELECT status, recipient FROM email_deliveries WHERE organisation_id = $1 AND template = 'paymentReceipt' ORDER BY created_at DESC LIMIT 1",
    [organisationId]
  );
  assert.ok(receipt);
  assert.equal(receipt.recipient, 'parent@example.com');
  assert.equal(receipt.status, 'skipped');

  const invoicesAfter = await db.one(
    'SELECT COUNT(*)::int AS total FROM invoices WHERE organisation_id = $1', [organisationId]
  );
  assert.equal(invoicesAfter.total, invoicesBefore.total, 'a form payment must not create an invoice');
});

test('public website lists only forms marked for the website', async () => {
  const { client, organisationId } = await principal();
  const visible = await createPaidForm(client, organisationId, { displayOnWebsite: true });
  const hidden = await createPaidForm(client, organisationId, { displayOnWebsite: false });

  const site = await createClient().get('/public/daycares/little-sprouts');
  assert.equal(site.status, 200, site.text);
  const slugs = (site.data.forms || []).map((form) => form.slug);
  assert.ok(slugs.includes(visible.slug));
  assert.ok(!slugs.includes(hidden.slug));

  const listed = (site.data.forms || []).find((form) => form.slug === visible.slug);
  assert.equal(listed.payment.enabled, true);
  assert.equal(Number(listed.payment.amount), 250);
});

test('a free public form returns no payment block', async () => {
  const { client, organisationId } = await principal();
  const slug = 'free-form-' + Date.now();
  const created = await client.post('/forms', {
    name: 'Free feedback form',
    slug,
    isPublic: true,
    fields: [{ key: 'comment', label: 'Comment', type: 'text', required: true }]
  }, { organisationId });
  assert.equal(created.status, 201, created.text);
  await client.post('/forms/' + created.data.id + '/publish', { isPublic: true }, { organisationId });

  const submit = await createClient().post('/public/forms/little-sprouts/' + slug + '/submit', {
    data: { comment: 'Lovely team.' }
  });
  assert.equal(submit.status, 200, submit.text);
  assert.equal(submit.data.payment, null);
  assert.ok(submit.data.submissionId);
});
