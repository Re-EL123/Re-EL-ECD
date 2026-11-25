'use strict';

/**
 * Record corrections: an organisation can fix a mistake, but the original
 * value, the reason and the approver are kept. Teachers cannot request one.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

async function learnerId(client) {
  const rows = await client.get('/learners?pageSize=1');
  return rows.data[0].id;
}

test('a correction needs a reason, keeps the old value and is applied on approval', async () => {
  const principal = createClient();
  const requester = await principal.login('principal@littlesprouts.local');
  const owner = createClient();
  await owner.login('owner@littlesprouts.local');

  const id = await learnerId(principal);
  const before = (await principal.get('/learners/' + id)).data;

  const denied = await createClient().post('/corrections', {}, {});
  assert.equal(denied.status, 401);

  const badField = await principal.post('/corrections', {
    resourceType: 'learner', resourceId: id, reason: 'Typo in the name',
    changes: { status: 'archived' }
  });
  assert.equal(badField.status, 422);

  const requested = await principal.post('/corrections', {
    resourceType: 'learner', resourceId: id, reason: 'Captured with a spelling mistake at enrolment',
    changes: { firstName: before.first_name + '-corrected' }
  });
  assert.equal(requested.status, 201, JSON.stringify(requested.error));
  assert.equal(requested.data.status, 'pending');
  assert.equal(requested.data.changes.before.firstName, before.first_name);
  assert.equal(requested.data.changes.after.firstName, before.first_name + '-corrected');

  // Still unchanged while approval is pending.
  assert.equal((await principal.get('/learners/' + id)).data.first_name, before.first_name);

  const approved = await owner.post('/corrections/' + requested.data.id + '/approve', { notes: 'Checked against the birth certificate' });
  assert.equal(approved.status, 200, JSON.stringify(approved.error));
  assert.equal(approved.data.status, 'approved');
  assert.equal((await principal.get('/learners/' + id)).data.first_name, before.first_name + '-corrected');

  const audit = await db.many(
    "SELECT action, metadata FROM audit_events WHERE action LIKE 'record_correction.%' ORDER BY occurred_at DESC LIMIT 5"
  );
  assert.ok(audit.some((row) => row.action === 'record_correction.requested'));
  const applied = audit.find((row) => row.action === 'record_correction.approved');
  assert.ok(applied);
  assert.equal(applied.metadata.reason, 'Captured with a spelling mistake at enrolment');
  assert.equal(applied.metadata.before.firstName, before.first_name);

  // Restore the seed value so other tests are not affected.
  await principal.patch('/learners/' + id, { firstName: before.first_name }).catch(() => null);
  await db.query("UPDATE learners SET first_name = $1 WHERE id = $2", [before.first_name, id]);
});

test('a rejected correction never changes the record and teachers cannot request one', async () => {
  const principal = createClient();
  await principal.login('principal@littlesprouts.local');
  const id = await learnerId(principal);
  const before = (await principal.get('/learners/' + id)).data;

  const teacher = createClient();
  await teacher.login('teacher@littlesprouts.local');
  const denied = await teacher.post('/corrections', {
    resourceType: 'learner', resourceId: id, reason: 'Teacher should not be able to do this',
    changes: { lastName: 'Nope' }
  });
  assert.equal(denied.status, 403);

  const requested = await principal.post('/corrections', {
    resourceType: 'learner', resourceId: id, reason: 'Wrong preferred name recorded',
    changes: { preferredName: 'Not applied' }
  });
  assert.equal(requested.status, 201);
  const rejected = await principal.post('/corrections/' + requested.data.id + '/reject', { notes: 'No longer needed' });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.status, 'rejected');
  assert.equal((await principal.get('/learners/' + id)).data.preferred_name, before.preferred_name);
});
