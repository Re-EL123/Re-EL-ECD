'use strict';

/**
 * The platform organisation directory must show each centre exactly once,
 * even when that centre has several historical subscriptions (assigning a
 * plan cancels the old row and inserts a new one).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

test('the organisation list does not duplicate tenants with multiple subscriptions', async () => {
  const client = createClient();
  await client.login('platform@re-el-ecd.local');

  const list = await client.get('/platform/organisations?pageSize=100');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.data));
  const ids = list.data.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, 'each organisation appears once');

  const plan = await db.one("SELECT id FROM subscription_plans WHERE status = 'active' ORDER BY monthly_price LIMIT 1");
  const target = list.data.find((row) => row.slug !== 're-el-platform');
  assert.ok(target);

  // Assign twice so this tenant has more than one subscription row.
  for (let i = 0; i < 2; i++) {
    const assigned = await client.post('/platform/organisations/' + target.id + '/subscription', {
      planId: plan.id, status: 'active', billingPeriod: 'monthly'
    });
    assert.equal(assigned.status, 201);
  }
  const rows = await db.many('SELECT id FROM platform_subscriptions WHERE organisation_id = $1', [target.id]);
  assert.ok(rows.length >= 2, 'the fixture has historical subscriptions');

  const after = await client.get('/platform/organisations?pageSize=100');
  const afterIds = after.data.map((row) => row.id);
  assert.equal(new Set(afterIds).size, afterIds.length, 'still one row per organisation');
  assert.equal(after.data.filter((row) => row.id === target.id).length, 1);
  assert.ok(after.meta.total >= 0);
});
