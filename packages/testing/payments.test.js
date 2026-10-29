'use strict';

/**
 * Unit tests for the payment and email services. These are pure functions, so
 * they run without a database or network.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const payfast = require('../../apps/api/src/services/payfast-service');
const email = require('../../apps/api/src/services/email-service');

test('pfEncode matches the PHP urlencode rules PayFast signs with', () => {
  assert.equal(payfast.pfEncode('a b'), 'a+b');
  assert.equal(payfast.pfEncode('a~b'), 'a%7Eb');
  assert.equal(payfast.pfEncode("a'b(c)d*e"), 'a%27b%28c%29d%2Ae');
  assert.equal(payfast.pfEncode('R 1 000.00'), 'R+1+000.00');
  assert.equal(payfast.pfEncode('  padded  '), 'padded');
});

test('checkout signatures are deterministic and ignore field order', () => {
  const fields = { merchant_id: '10000100', merchant_key: '46f0cd694581a', amount: '500.00', item_name: 'Fees' };
  const first = payfast.signature(fields, 'secret');
  const shuffled = { item_name: 'Fees', amount: '500.00', merchant_key: '46f0cd694581a', merchant_id: '10000100' };
  assert.equal(first, payfast.signature(shuffled, 'secret'));
  assert.equal(first, payfast.signature(fields, 'secret'));
  assert.notEqual(first, payfast.signature(fields, 'other-secret'));
  assert.notEqual(first, payfast.signature({ ...fields, amount: '501.00' }, 'secret'));
});

test('ITN signatures preserve posted order', () => {
  const pairs = [
    ['m_payment_id', 'ECD-1'],
    ['pf_payment_id', '123456'],
    ['payment_status', 'COMPLETE'],
    ['item_name', 'School fees'],
    ['amount_gross', '500.00'],
    ['merchant_id', '10000100']
  ];
  const signed = payfast.itnSignature(pairs, 'secret');
  assert.equal(payfast.itnSignature(pairs, 'secret'), signed);
  const reordered = [pairs[1], pairs[0], ...pairs.slice(2)];
  assert.notEqual(payfast.itnSignature(reordered, 'secret'), signed);
});

test('verifyItn accepts a correctly signed notification and rejects tampering', () => {
  process.env.PAYFAST_MERCHANT_ID = '10000100';
  process.env.PAYFAST_PASSPHRASE = 'secret';
  const pairs = [
    ['m_payment_id', 'ECD-1'],
    ['pf_payment_id', '123456'],
    ['payment_status', 'COMPLETE'],
    ['amount_gross', '500.00'],
    ['merchant_id', '10000100']
  ];
  const valid = [...pairs, ['signature', payfast.itnSignature(pairs)]];
  const result = payfast.verifyItn(valid, { amount: 500 });
  assert.equal(result.valid, true);
  assert.equal(result.data.reference, 'ECD-1');
  assert.equal(result.data.providerReference, '123456');

  const tampered = valid.map((pair) => pair[0] === 'amount_gross' ? ['amount_gross', '1.00'] : pair);
  assert.equal(payfast.verifyItn(tampered, { amount: 1 }).valid, false);

  assert.equal(payfast.verifyItn(valid, { amount: 999 }).valid, false);

  const wrongMerchant = valid.map((pair) => pair[0] === 'merchant_id' ? ['merchant_id', '999'] : pair);
  assert.equal(payfast.verifyItn(wrongMerchant, { amount: 500 }).valid, false);
  delete process.env.PAYFAST_MERCHANT_ID;
  delete process.env.PAYFAST_PASSPHRASE;
});

test('buildCheckout produces a signed payload with a formatted amount', () => {
  process.env.PAYFAST_MERCHANT_ID = '10000100';
  process.env.PAYFAST_MERCHANT_KEY = '46f0cd694581a';
  process.env.PAYFAST_SANDBOX = 'true';
  const checkout = payfast.buildCheckout({
    amount: 1250.5,
    itemName: 'School fees — INV-001',
    reference: 'ECD-TEST',
    email: 'parent@example.com',
    nameFirst: 'Sarah',
    nameLast: 'Johnson',
    returnUrl: 'https://ecd.example/#/parent/finance',
    cancelUrl: 'https://ecd.example/#/parent/finance',
    notifyUrl: 'https://api.example/api/v1/public/payfast/itn'
  });
  assert.match(checkout.action, /sandbox\.payfast\.co\.za/);
  assert.equal(checkout.fields.amount, '1250.50');
  assert.equal(checkout.fields.m_payment_id, 'ECD-TEST');
  assert.match(checkout.fields.signature, /^[a-f0-9]{32}$/);
  assert.ok(checkout.query.includes('signature='));
  delete process.env.PAYFAST_MERCHANT_ID;
  delete process.env.PAYFAST_MERCHANT_KEY;
  delete process.env.PAYFAST_SANDBOX;
});

test('every email template renders a subject, html and text', () => {
  const samples = {
    welcome: { ownerName: 'Sipho', organisationName: 'Little Sprouts', token: 'tok_welcome' },
    invitation: { organisationName: 'Little Sprouts', inviterName: 'Sipho', roleLabel: 'Teacher', token: 'tok_invite' },
    passwordReset: { displayName: 'Sipho', token: 'tok_reset' },
    enquiryReceived: { guardianName: 'Sarah', childName: 'Amelia', email: 's@example.com', message: 'Hello' },
    enquiryAcknowledgement: { guardianName: 'Sarah', organisationName: 'Little Sprouts', slug: 'little-sprouts' },
    formSubmission: { formName: 'Consent', submittedBy: 'Sarah' },
    announcement: { organisationName: 'Little Sprouts', title: 'Sports day', body: 'Wear comfortable shoes.' },
    invoiceIssued: { organisationName: 'Little Sprouts', invoiceNumber: 'INV-1', amount: 500, currency: 'ZAR' },
    paymentReceipt: { organisationName: 'Little Sprouts', amount: 500, currency: 'ZAR', reference: 'ECD-1' },
    incidentAlert: { learnerName: 'Amelia', severity: 'high', summary: 'Fall', reportedBy: 'Sipho' },
    leaveDecision: { staffName: 'Thandi', status: 'approved', leaveType: 'annual', dates: '1-3 Nov' }
  };
  for (const [name, data] of Object.entries(samples)) {
    const message = email.build(name, data);
    assert.ok(message.subject.length > 0, name + ' needs a subject');
    assert.ok(message.html.includes('<!doctype html>'), name + ' needs html');
    assert.ok(message.text.length > 0, name + ' needs a text alternative');
  }
  assert.match(email.build('passwordReset', { token: 'abc' }).html, /reset-password\?token=abc/);
  assert.match(email.build('invitation', { organisationName: 'X', roleLabel: 'Y', token: 'abc' }).html, /accept-invite\?token=abc/);
  assert.equal(email.money(1234.5, 'ZAR'), 'R1 234.50');
});
