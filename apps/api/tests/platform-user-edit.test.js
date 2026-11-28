'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

async function platformAdmin() {
  const client = createClient();
  await client.login('platform@re-el-ecd.local');
  return client;
}

test('platform user detail is safe and fully editable', async () => {
  const admin = await platformAdmin();
  const users = (await admin.get('/platform/users?q=teacher@littlesprouts.local')).data || [];
  const target = users.find((u) => u.email === 'teacher@littlesprouts.local');
  assert.ok(target);

  const detail = await admin.get('/platform/users/' + target.id);
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.data.user.display_name, target.display_name);
  assert.ok(Array.isArray(detail.data.roles));
  assert.ok(Array.isArray(detail.data.memberships));
  assert.ok(!JSON.stringify(detail.data).includes('password_hash'));
  assert.ok(!JSON.stringify(detail.data).includes('totp_secret_enc'));

  const updated = await admin.patch('/platform/users/' + target.id, {
    displayName: 'Anika Botha-Edited', phone: '+27820009999', status: 'suspended', unlock: true
  });
  assert.equal(updated.status, 200, updated.text);
  assert.equal(updated.data.display_name, 'Anika Botha-Edited');
  assert.equal(updated.data.status, 'suspended');
  assert.ok(!JSON.stringify(updated.data).includes('password_hash'));

  const restored = await admin.patch('/platform/users/' + target.id, {
    displayName: 'Anika Botha', status: 'active', phone: ''
  });
  assert.equal(restored.status, 200, restored.text);

  const audited = await db.one(
    "SELECT id FROM audit_events WHERE action = 'platform.user_updated' AND resource_id = $1 LIMIT 1", [target.id]
  );
  assert.ok(audited);
});

test('platform admins cannot suspend themselves and cannot leak secrets via status change', async () => {
  const admin = await platformAdmin();
  const me = (await admin.get('/auth/session')).data.user;
  const blocked = await admin.patch('/platform/users/' + me.id, { status: 'suspended' });
  assert.equal(blocked.status, 409);

  const target = (await admin.get('/platform/users?q=principal@littlesprouts.local')).data[0];
  const result = await admin.post('/platform/users/' + target.id + '/status', { status: 'active' });
  assert.equal(result.status, 200);
  assert.ok(!JSON.stringify(result.data).includes('password_hash'));
  assert.ok(!JSON.stringify(result.data).includes('mfa_recovery_hashes'));
});

test('password reset and role/membership edits are audited', async () => {
  const admin = await platformAdmin();
  const target = (await admin.get('/platform/users?q=teacher@littlesprouts.local')).data[0];

  const reset = await admin.post('/platform/users/' + target.id + '/reset-password', {});
  assert.equal(reset.status, 200, reset.text);
  assert.equal(reset.data.success, true);

  const orgs = (await admin.get('/platform/organisations')).data;
  const org = (orgs.organisations || orgs || []).find((row) => row.slug === 'little-sprouts');
  const grant = await admin.post('/platform/users/' + target.id + '/memberships', {
    organisationId: org.id, roleKey: 'curriculum_coordinator'
  });
  assert.equal(grant.status, 200, grant.text);

  const detail = await admin.get('/platform/users/' + target.id);
  const membership = detail.data.memberships.find((m) => m.organisation_id === org.id);
  const role = membership.roles.find((r) => r.key === 'curriculum_coordinator');
  assert.ok(role);

  const revoked = await admin.delete('/platform/users/' + target.id + '/memberships/' + membership.id + '/roles/' + role.id);
  assert.equal(revoked.status, 200, revoked.text);

  const audit = await db.many(
    "SELECT action FROM audit_events WHERE resource_id = $1 AND action IN ('platform.user_password_reset_sent','platform.user_role_granted','platform.user_role_revoked')",
    [target.id]
  );
  assert.ok(audit.some((row) => row.action === 'platform.user_password_reset_sent'));
  assert.ok(audit.some((row) => row.action === 'platform.user_role_granted'));
  assert.ok(audit.some((row) => row.action === 'platform.user_role_revoked'));
});
