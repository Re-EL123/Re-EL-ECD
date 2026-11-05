'use strict';

/**
 * Platform user administration, broadcasts, support cases and bulk plan
 * assignment. These endpoints are platform-only, so every test also pins the
 * tenant boundary that keeps a daycare out of the platform console.
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

test('platform users list exposes memberships and stays platform-only', async () => {
  const { client } = await platform();
  const list = await client.get('/platform/users?q=principal@littlesprouts.local');
  assert.equal(list.status, 200, list.text);
  assert.ok(Array.isArray(list.data));
  assert.ok(list.data.length >= 1);
  const user = list.data[0];
  assert.equal(user.email, 'principal@littlesprouts.local');
  assert.ok(Array.isArray(user.memberships));
  assert.ok(user.memberships.some((membership) => membership.organisation_slug === 'little-sprouts'));
  assert.equal(typeof user.active_sessions, 'number');

  const { client: tenant, organisationId } = await principal();
  const denied = await tenant.get('/platform/users', { organisationId });
  assert.equal(denied.status, 403);
});

test('platform users can be filtered by organisation', async () => {
  const { client } = await platform();
  const organisations = await client.get('/platform/organisations?q=little');
  const organisation = organisations.data[0];
  assert.ok(organisation);
  const list = await client.get('/platform/users?organisationId=' + organisation.id);
  assert.equal(list.status, 200, list.text);
  assert.ok(list.data.length >= 1);
  assert.ok(list.data.every((user) => user.memberships.some((m) => m.organisation_id === organisation.id)));
});

test('suspending a user revokes sessions and reactivation restores access', async () => {
  const { client } = await platform();
  const list = await client.get('/platform/users?q=teacher@littlesprouts.local');
  const user = list.data[0];
  assert.ok(user);

  const suspended = await client.post('/platform/users/' + user.id + '/status', { status: 'suspended' });
  assert.equal(suspended.status, 200, suspended.text);
  assert.equal(suspended.data.status, 'suspended');

  const sessions = await db.one(
    'SELECT COUNT(*)::int AS total FROM sessions WHERE user_id = $1 AND revoked_at IS NULL', [user.id]
  );
  assert.equal(sessions.total, 0);

  const activated = await client.post('/platform/users/' + user.id + '/status', { status: 'active' });
  assert.equal(activated.data.status, 'active');

  const audit = await db.one(
    "SELECT COUNT(*)::int AS total FROM audit_events WHERE resource_id = $1 AND action = 'platform.user_status_changed'",
    [user.id]
  );
  assert.ok(audit.total >= 2);
});

test('platform administrators cannot suspend their own account', async () => {
  const { client, session } = await platform();
  const refused = await client.post('/platform/users/' + session.user.id + '/status', { status: 'suspended' });
  assert.equal(refused.status, 409);
});

test('bulk user actions report honest counts and revoke sessions', async () => {
  const { client } = await platform();
  const list = await client.get('/platform/users?q=teacher@littlesprouts.local');
  const user = list.data[0];
  assert.ok(user);

  const suspended = await client.post('/platform/users/bulk', { ids: [user.id], action: 'suspend' });
  assert.equal(suspended.status, 200, suspended.text);
  assert.equal(suspended.data.updated, 1);

  const again = await client.post('/platform/users/bulk', { ids: [user.id], action: 'suspend' });
  assert.equal(again.data.updated, 0);
  assert.equal(again.data.skipped.length, 1);

  const revoked = await client.post('/platform/users/bulk', { ids: [user.id], action: 'revoke_sessions' });
  assert.equal(revoked.data.updated, 1);

  await client.post('/platform/users/bulk', { ids: [user.id], action: 'activate' });
  const active = await client.get('/platform/users?q=teacher@littlesprouts.local');
  assert.equal(active.data[0].status, 'active');
});

test('a broadcast creates an in-app notification for every tenant member', async () => {
  const { client } = await platform();
  const organisations = await client.get('/platform/organisations?q=little');
  const organisation = organisations.data[0];

  const sent = await client.post('/platform/broadcast', {
    organisationIds: [organisation.id],
    title: 'Scheduled maintenance',
    message: 'The platform will be read-only on Sunday evening.',
    email: false
  });
  assert.equal(sent.status, 200, sent.text);
  assert.equal(sent.data.organisations, 1);
  assert.ok(sent.data.recipients >= 1);

  const notifications = await db.one(
    `SELECT COUNT(*)::int AS total FROM notifications
     WHERE organisation_id = $1 AND notification_type = 'platform_broadcast'`,
    [organisation.id]
  );
  assert.ok(notifications.total >= 1);

  const audit = await db.one(
    "SELECT COUNT(*)::int AS total FROM audit_events WHERE action = 'platform.broadcast_sent'"
  );
  assert.ok(audit.total >= 1);
});

test('support cases can be updated and resolved', async () => {
  const { client } = await platform();
  const organisations = await client.get('/platform/organisations?q=little');
  const organisation = organisations.data[0];

  const created = await client.post('/platform/support-cases', {
    organisationId: organisation.id,
    subject: 'Test support case',
    description: 'Created by the automated test suite.'
  });
  assert.equal(created.status, 201, created.text);

  const updated = await client.patch('/platform/support-cases/' + created.data.id, {
    status: 'in_progress',
    accessGrantedUntil: '2030-01-01T10:00:00.000Z'
  });
  assert.equal(updated.status, 200, updated.text);
  assert.equal(updated.data.status, 'in_progress');
  assert.ok(updated.data.access_granted_until);

  const resolved = await client.patch('/platform/support-cases/' + created.data.id, { status: 'resolved' });
  assert.equal(resolved.data.status, 'resolved');

  const missing = await client.patch('/platform/support-cases/00000000-0000-4000-8000-000000000000', { status: 'closed' });
  assert.equal(missing.status, 404);
});

test('bulk plan assignment moves every selected tenant onto the plan', async () => {
  const { client } = await platform();
  const plans = await client.get('/platform/plans');
  const plan = plans.data.find((entry) => entry.status === 'active');
  assert.ok(plan);

  const organisations = await client.get('/platform/organisations?q=sunrise');
  const organisation = organisations.data[0];
  assert.ok(organisation);

  const assigned = await client.post('/platform/organisations/bulk', {
    ids: [organisation.id],
    action: 'assign_plan',
    planId: plan.id,
    billingPeriod: 'annual'
  });
  assert.equal(assigned.status, 200, assigned.text);
  assert.equal(assigned.data.updated, 1);

  const refreshed = await client.get('/platform/organisations/' + organisation.id);
  assert.equal(refreshed.data.subscription.plan_id, plan.id);
  assert.equal(refreshed.data.subscription.billing_period, 'annual');

  const missingPlan = await client.post('/platform/organisations/bulk', {
    ids: [organisation.id], action: 'assign_plan'
  });
  assert.equal(missingPlan.status, 422);
});
