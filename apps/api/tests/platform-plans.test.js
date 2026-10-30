'use strict';

/**
 * Platform plan management, subscription assignment, bulk actions and
 * platform branding.
 *
 * The platform console could previously read plans but never change them, and
 * the bulk endpoints are new, so these tests pin the contract the UI depends
 * on: validated input, tenant scoping, honest partial results and an audit
 * trail for every change.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

async function platform() {
  const client = createClient();
  const session = await client.login('platform@re-el-ecd.local');
  return { client, session };
}

async function principal() {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  return { client, organisationId: session.activeOrganisationId };
}

test('the public platform endpoint exposes branding and active plans without a session', async () => {
  const client = createClient();
  const response = await client.get('/public/platform');
  assert.equal(response.status, 200);
  assert.ok(response.data.organisation.name);
  assert.equal(response.data.branding.primary.length, 7);
  assert.ok(Array.isArray(response.data.plans));
  assert.ok(response.data.plans.every((plan) => plan.status === undefined || plan.status === 'active'));
});

test('platform administrators can create, edit and archive a subscription plan', async () => {
  const { client } = await platform();
  const key = 'test-plan-' + Date.now();

  const created = await client.post('/platform/plans', {
    name: 'Test Plan', planKey: key, description: 'A plan created by the test suite.',
    monthlyPrice: 750, currency: 'ZAR', maxLearners: 40, maxStaff: 8,
    features: ['attendance', 'finance']
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.plan_key, key);
  assert.equal(Number(created.data.monthly_price), 750);
  assert.equal(created.data.status, 'active');

  const duplicate = await client.post('/platform/plans', {
    name: 'Duplicate', planKey: key, monthlyPrice: 1
  });
  assert.equal(duplicate.status, 409);

  const updated = await client.patch('/platform/plans/' + created.data.id, {
    description: 'Updated description.', maxLearners: 60, monthlyPrice: 900
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.description, 'Updated description.');
  assert.equal(updated.data.max_learners, 60);

  const archived = await client.patch('/platform/plans/' + created.data.id, { status: 'archived' });
  assert.equal(archived.status, 200);
  assert.equal(archived.data.status, 'archived');
  assert.ok(archived.data.archived_at);

  const restored = await client.patch('/platform/plans/' + created.data.id, { status: 'active' });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.archived_at, null);

  const audit = await db.one(
    "SELECT COUNT(*)::int AS total FROM audit_events WHERE resource_id = $1 AND action LIKE 'platform.plan_%'",
    [created.data.id]
  );
  assert.ok(audit.total >= 3, 'plan lifecycle should be audited');
});

test('tenant users cannot manage the plan catalogue', async () => {
  const { client, organisationId } = await principal();
  const list = await client.get('/platform/plans', { organisationId });
  assert.equal(list.status, 403);
  const create = await client.post('/platform/plans', { name: 'Nope', planKey: 'nope-' + Date.now() }, { organisationId });
  assert.equal(create.status, 403);
});

test('assigning a plan replaces the current subscription and updates the tenant', async () => {
  const { client } = await platform();
  const organisations = await client.get('/platform/organisations?q=sunrise');
  const organisation = organisations.data[0];
  assert.ok(organisation);

  const plans = await client.get('/platform/plans');
  const plan = plans.data.find((p) => p.status === 'active');
  assert.ok(plan);

  const assigned = await client.post('/platform/organisations/' + organisation.id + '/subscription', {
    planId: plan.id, status: 'active', billingPeriod: 'annual'
  });
  assert.equal(assigned.status, 201);
  assert.equal(assigned.data.plan_name, plan.name);
  assert.equal(assigned.data.billing_period, 'annual');

  const refreshed = await client.get('/platform/organisations/' + organisation.id);
  assert.equal(refreshed.data.subscription.plan_id, plan.id);
  assert.equal(refreshed.data.status, 'active');

  const platformOrg = await db.one("SELECT id FROM organisations WHERE slug = 're-el-platform'");
  const refused = await client.post('/platform/organisations/' + platformOrg.id + '/subscription', {
    planId: plan.id, status: 'active'
  });
  assert.equal(refused.status, 404);
});

test('archived plans cannot be assigned to a tenant', async () => {
  const { client } = await platform();
  const key = 'archived-plan-' + Date.now();
  const created = await client.post('/platform/plans', { name: 'Archived Plan', planKey: key, monthlyPrice: 10 });
  await client.patch('/platform/plans/' + created.data.id, { status: 'archived' });

  const organisations = await client.get('/platform/organisations?q=little');
  const organisation = organisations.data[0];
  const refused = await client.post('/platform/organisations/' + organisation.id + '/subscription', {
    planId: created.data.id, status: 'active'
  });
  assert.equal(refused.status, 422);
  assert.match(refused.error.message, /archived/i);
});

test('bulk organisation suspension needs a reason, skips unknown ids and restores cleanly', async () => {
  const { client } = await platform();
  const organisations = await client.get('/platform/organisations?q=sunrise');
  const target = organisations.data[0];
  const unknown = '00000000-0000-4000-8000-000000000000';

  const missingReason = await client.post('/platform/organisations/bulk', {
    ids: [target.id], action: 'suspend'
  });
  assert.equal(missingReason.status, 422);

  const suspended = await client.post('/platform/organisations/bulk', {
    ids: [target.id, unknown], action: 'suspend', reason: 'Automated test of bulk suspension.'
  });
  assert.equal(suspended.status, 200);
  assert.equal(suspended.data.updated, 1);
  assert.equal(suspended.data.skipped.length, 1);
  assert.equal(suspended.data.skipped[0].id, unknown);

  const afterSuspend = await client.get('/platform/organisations/' + target.id);
  assert.equal(afterSuspend.data.status, 'suspended');

  const restored = await client.post('/platform/organisations/bulk', {
    ids: [target.id], action: 'restore'
  });
  assert.equal(restored.data.updated, 1);
  const afterRestore = await client.get('/platform/organisations/' + target.id);
  assert.equal(afterRestore.data.status, 'active');
});

test('bulk learner archive and restore is tenant scoped and audited', async () => {
  const { client, organisationId } = await principal();
  const learners = await client.get('/learners?status=enrolled', { organisationId });
  const ids = learners.data.slice(0, 2).map((learner) => learner.id);
  assert.ok(ids.length >= 2);

  const archived = await client.post('/learners/bulk', { ids, action: 'archive' }, { organisationId });
  assert.equal(archived.status, 200);
  assert.equal(archived.data.updated, 2);

  const rows = await db.many('SELECT status FROM learners WHERE id = ANY($1::uuid[])', [ids]);
  assert.ok(rows.every((row) => row.status === 'archived'));

  const restored = await client.post('/learners/bulk', { ids, action: 'restore' }, { organisationId });
  assert.equal(restored.data.updated, 2);

  const audit = await db.one(
    "SELECT COUNT(*)::int AS total FROM audit_events WHERE action = 'learner.archived' AND metadata->>'bulk' = 'true'"
  );
  assert.ok(audit.total >= 2);

  const other = createClient();
  const otherSession = await other.login('principal@sunrise.local');
  const crossTenant = await other.post('/learners/bulk', { ids, action: 'archive' }, { organisationId: otherSession.activeOrganisationId });
  assert.equal(crossTenant.status, 200);
  assert.equal(crossTenant.data.updated, 0);
  assert.equal(crossTenant.data.skipped.length, 2);
});

test('bulk task completion and access suspension return honest counts', async () => {
  const { client, organisationId } = await principal();

  const first = await client.post('/tasks', { title: 'Bulk task one', priority: 'medium' }, { organisationId });
  const second = await client.post('/tasks', { title: 'Bulk task two', priority: 'medium' }, { organisationId });
  const completed = await client.post('/tasks/bulk', {
    ids: [first.data.id, second.data.id], action: 'complete'
  }, { organisationId });
  assert.equal(completed.data.updated, 2);

  const again = await client.post('/tasks/bulk', {
    ids: [first.data.id, second.data.id], action: 'complete'
  }, { organisationId });
  assert.equal(again.data.updated, 0);
  assert.equal(again.data.skipped.length, 2);

  const members = await client.get('/access/memberships', { organisationId });
  const other = members.data.find((member) => member.email !== 'principal@littlesprouts.local' && member.status === 'active');
  if (other) {
    const suspended = await client.post('/access/memberships/bulk', { ids: [other.id], action: 'suspend' }, { organisationId });
    assert.equal(suspended.data.updated, 1);
    const restored = await client.post('/access/memberships/bulk', { ids: [other.id], action: 'activate' }, { organisationId });
    assert.equal(restored.data.updated, 1);
  }
});

test('platform branding tokens persist and cascade to the theme', async () => {
  const { client } = await platform();
  const response = await client.patch('/platform/settings', {
    primaryColour: '#0B534A',
    secondaryColour: '#2B9A58',
    accentColour: '#6FC79B',
    themeTokens: {
      primary: '#0B534A', secondary: '#2B9A58', accent: '#6FC79B',
      background: '#F6F9F7', surface: '#FFFFFF', text: '#0E2B26'
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.theme.primary, '#0B534A');
  assert.equal(response.data.theme.secondary, '#2B9A58');
  assert.equal(response.data.theme.accent, '#6FC79B');
  assert.equal(response.data.theme.onPrimary.length, 7);

  const publicBranding = await createClient().get('/public/platform');
  assert.equal(publicBranding.data.branding.primary, '#0B534A');

  const invalid = await client.patch('/platform/settings', { themeTokens: { primary: 'not-a-colour' } });
  assert.equal(invalid.status, 422);
});
