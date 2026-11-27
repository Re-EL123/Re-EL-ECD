'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient } = require('./helpers');

test.before(start);
test.after(stop);

test('billing summary exposes upgrade plans with descriptions and features', async () => {
  const principal = createClient();
  await principal.login('principal@littlesprouts.local');
  const summary = await principal.get('/billing/summary');
  assert.equal(summary.status, 200, summary.text);
  const plans = summary.data.upgradePlans || [];
  assert.ok(plans.length, 'a tenant below the top plan should have an upgrade option');
  for (const plan of plans) {
    assert.ok(plan.plan_key);
    assert.ok(plan.name);
    assert.ok(typeof plan.description === 'string');
    assert.ok(Array.isArray(plan.features));
    assert.ok(Number(plan.max_learners) > 0);
    assert.ok(Number(plan.max_staff) > 0);
    assert.ok(Number(plan.monthly_price) > 0);
  }
});

test('upgrade quotes match the amount the upgrade endpoint charges', async () => {
  const payfastFees = require('../src/services/payfast-fees');
  const payfast = require('../src/services/payfast-service');
  const principal = createClient();
  await principal.login('principal@littlesprouts.local');
  const summary = await principal.get('/billing/summary');
  const profile = process.env.PAYFAST_RECOVERY_PROFILE || 'standard_card';
  const recover = payfast.isConfigured() && payfastFees.recoveryEnabledForSubscriptions();

  for (const plan of summary.data.upgradePlans || []) {
    assert.ok(plan.checkout, 'each upgrade plan must carry a checkout quote');
    const monthly = Number(plan.monthly_price);
    const annual = Math.round(monthly * 12 * 100) / 100;
    const monthlyQuote = payfastFees.estimate(monthly, profile);
    const annualQuote = payfastFees.estimate(annual, profile);
    assert.equal(plan.checkout.monthly.base, monthlyQuote.base);
    assert.equal(plan.checkout.monthly.total, recover ? monthlyQuote.gross : monthlyQuote.base);
    assert.equal(plan.checkout.annual.base, annual);
    assert.equal(plan.checkout.annual.total, recover ? annualQuote.gross : annualQuote.base);
    assert.ok(plan.checkout.annual.total > plan.checkout.monthly.total);
  }
});

test('public signup plans quote the same fee-inclusive amounts', async () => {
  const payfastFees = require('../src/services/payfast-fees');
  const payfast = require('../src/services/payfast-service');
  const res = await createClient().get('/public/platform');
  assert.equal(res.status, 200, res.text);
  const profile = process.env.PAYFAST_RECOVERY_PROFILE || 'standard_card';
  const recover = payfast.isConfigured() && payfastFees.recoveryEnabledForSubscriptions();
  assert.ok((res.data.plans || []).length);
  for (const plan of res.data.plans) {
    assert.ok(plan.checkout, 'signup plan must carry a checkout quote');
    const base = Number(plan.monthly_price);
    const quoted = payfastFees.estimate(base, profile);
    assert.equal(plan.checkout.monthly.base, base);
    assert.equal(plan.checkout.monthly.total, recover ? quoted.gross : quoted.base);
    assert.equal(plan.checkout.annual.base, Math.round(base * 12 * 100) / 100);
  }
});
