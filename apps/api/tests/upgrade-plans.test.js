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
