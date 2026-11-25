'use strict';

/**
 * Plan limits: usage is reported to tenants, a 7-day grace window applies at
 * 100%, and after that new learners, staff and uploads are blocked with an
 * upgrade message. Existing records are never removed or disabled.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

test('tenant usage, grace window and hard enforcement', async () => {
  const admin = createClient();
  const adminSession = await admin.login('platform@re-el-ecd.local');
  const principal = createClient();
  const session = await principal.login('principal@littlesprouts.local');

  const plans = await admin.get('/platform/plans');
  const plan = plans.data.find((p) => p.plan_key === 'seedling') || plans.data[0];
  await admin.patch('/platform/plans/' + plan.id, {
    maxLearners: 1, maxStaff: 1, maxStorageGb: 0.001
  });
  await admin.post('/platform/organisations/' + session.activeOrganisationId + '/subscription', {
    planId: plan.id, status: 'active', billingPeriod: 'monthly'
  });

  const summary = await principal.get('/billing/summary');
  assert.equal(summary.status, 200);
  assert.ok(summary.data.planUsage.learners.limit === 1);
  assert.ok(summary.data.planUsage.staff.limit === 1);
  assert.ok(summary.data.planUsage.storage.limit > 0);
  assert.ok(['over', 'grace'].includes(summary.data.planUsage.learners.state));
  assert.ok(Array.isArray(summary.data.upgradePlans));

  // Inside the grace window the first violating action is still allowed.
  await db.query('DELETE FROM plan_limit_grace');
  const graceLearner = await principal.post('/learners', {
    firstName: 'Grace', lastName: 'Test', dateOfBirth: '2022-01-01',
    branchId: (await db.one('SELECT id FROM branches WHERE organisation_id = $1 LIMIT 1', [session.activeOrganisationId])).id
  });
  assert.equal(graceLearner.status, 201);
  const grace = await db.one("SELECT breached_at FROM plan_limit_grace WHERE organisation_id = $1 AND kind = 'learners'", [session.activeOrganisationId]);
  assert.ok(grace);

  // Simulate the grace period ending.
  await db.query("UPDATE plan_limit_grace SET breached_at = now() - interval '8 days'");
  const blockedLearner = await principal.post('/learners', {
    firstName: 'Blocked', lastName: 'Test', dateOfBirth: '2022-01-01',
    branchId: (await db.one('SELECT id FROM branches WHERE organisation_id = $1 LIMIT 1', [session.activeOrganisationId])).id
  });
  assert.equal(blockedLearner.status, 409);
  assert.ok(/limit|upgrade/i.test(JSON.stringify(blockedLearner.error || blockedLearner.data || {})));

  const blockedUpload = await principal.post('/media/uploads', {
    filename: 'over-quota.png', contentType: 'image/png', size: 500000
  });
  assert.equal(blockedUpload.status, 409);

  // Dropping back under the limit clears the breach state.
  await admin.patch('/platform/plans/' + plan.id, { maxLearners: 100, maxStaff: 100, maxStorageGb: 100 });
  await db.query('DELETE FROM plan_limit_grace WHERE organisation_id = $1', [session.activeOrganisationId]);
  const restored = await principal.get('/billing/summary');
  assert.equal(restored.data.planUsage.learners.state, 'ok');
});

test('storage usage counts ready media bytes for the organisation', async () => {
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  const principal = createClient();
  const session = await principal.login('principal@littlesprouts.local');
  const key = 'test-storage-' + Date.now();
  await db.query(
    `INSERT INTO media_assets (organisation_id, original_filename, storage_key, url, mime_type, size_bytes, kind, status)
     VALUES ($1,'test.png',$2,$3,'image/png',123456,'image','ready')`,
    [session.activeOrganisationId, key, '/api/v1/media/object?key=' + encodeURIComponent(key)]
  );
  const summary = await principal.get('/billing/summary');
  assert.ok(Number(summary.data.planUsage.storage.used) >= 123456);
});
