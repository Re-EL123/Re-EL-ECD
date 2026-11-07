'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient } = require('./helpers');

test.before(start);
test.after(stop);

test('tenant self-signup is gated by the platform allowTenantSignup setting', async () => {
  const anon = createClient();
  const payload = {
    centreName: 'Rainbow Early Learning',
    ownerName: 'Nomsa Dlamini',
    ownerEmail: 'nomsa@rainbow.local',
    password: 'rainbow-pass-123',
    planKey: 'seedling'
  };

  // Off by default: the endpoint refuses and the public flag is false.
  const blocked = await anon.post('/public/signup', payload);
  assert.equal(blocked.status, 403, blocked.text);
  assert.match(blocked.error.message, /not enabled/i);
  const off = await anon.get('/public/platform');
  assert.equal(off.data.allowTenantSignup, false);

  // The platform admin enables it.
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  const enabled = await admin.patch('/platform/settings', { settings: { allowTenantSignup: true } });
  assert.equal(enabled.status, 200, enabled.text);
  const on = await anon.get('/public/platform');
  assert.equal(on.data.allowTenantSignup, true);
  const planKeys = new Set((on.data.plans || []).map((p) => p.plan_key));
  assert.ok(planKeys.has('seedling'), 'expected a starter plan to be offered');

  // Signup succeeds and the owner can immediately sign in.
  const created = await anon.post('/public/signup', payload);
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.organisation.name, 'Rainbow Early Learning');
  assert.equal(created.data.organisation.slug, 'rainbow-early-learning');
  assert.equal(created.data.trialDays, 30);
  assert.equal(created.data.planKey, 'seedling');
  const owner = createClient();
  const login = await owner.login('nomsa@rainbow.local', 'rainbow-pass-123');
  assert.ok(login.csrfToken, 'owner should sign in straight after signup');

  // Duplicate email and unknown plan are rejected.
  const duplicate = await anon.post('/public/signup', { ...payload, centreName: 'Rainbow Two' });
  assert.equal(duplicate.status, 409, duplicate.text);
  const badPlan = await anon.post('/public/signup', {
    centreName: 'Sunrise Academy',
    ownerName: 'Sipho Ndlovu',
    ownerEmail: 'sipho@sunrise.local',
    password: 'sunrise-pass-123',
    planKey: 'no-such-plan'
  });
  assert.equal(badPlan.status, 422, badPlan.text);

  // Turning the setting off blocks signup again.
  await admin.patch('/platform/settings', { settings: { allowTenantSignup: false } });
  const reblocked = await anon.post('/public/signup', {
    centreName: 'Sunrise Academy',
    ownerName: 'Sipho Ndlovu',
    ownerEmail: 'sipho@sunrise.local',
    password: 'sunrise-pass-123'
  });
  assert.equal(reblocked.status, 403, reblocked.text);
});

test('admin provisioning still works after the provisioning refactor', async () => {
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  const created = await admin.post('/platform/organisations', {
    name: 'Admin Provisioned Creche',
    slug: 'admin-provisioned-creche',
    ownerName: 'Lerato Mokoena',
    ownerEmail: 'lerato@admin-provisioned.local'
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.slug, 'admin-provisioned-creche');
  assert.equal(created.data.status, 'onboarding');
});
