'use strict';

/**
 * God's-eye platform controls and richer multi-assignment.
 * Exercises the real router, session/token handling, tenant scoping and SQL.
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
  return { client, session, organisationId: session.activeOrganisationId };
}

async function activeStaff() {
  const { client, organisationId } = await principal();
  const list = await client.get('/staff?status=active', { organisationId });
  assert.ok(list.data.filter((row) => row.user_id).length >= 2);
  return { client, organisationId, staff: list.data.filter((row) => row.user_id) };
}

async function twoBranches(client, organisationId) {
  const branches = await client.get('/branches', { organisationId });
  let list = branches.data;
  if (list.length < 2) {
    const created = await client.post('/branches', {
      name: 'Second campus',
      slug: 'second-campus-' + Date.now()
    }, { organisationId });
    assert.equal(created.status, 201, created.text);
    list = (await client.get('/branches', { organisationId })).data;
  }
  return list.slice(0, 2);
}

test('platform overview, sweep and search expose the god view without opening the tenant boundary', async () => {
  const { client } = await platform();
  const overview = await client.get('/platform/overview');
  assert.equal(overview.status, 200, overview.text);
  assert.equal(typeof overview.data.feesCollectedLast30Days, 'number');
  assert.equal(typeof overview.data.platformOutstanding, 'number');
  assert.equal(typeof overview.data.pastDueSubscriptions, 'number');

  const sweep = await client.post('/platform/subscriptions/sweep', {});
  assert.equal(sweep.status, 200, sweep.text);
  assert.equal(typeof sweep.data.flipped, 'number');
  assert.equal(typeof sweep.data.reminders, 'number');

  const found = await client.get('/platform/search?q=littl');
  assert.equal(found.status, 200, found.text);
  assert.ok(found.data.organisations.some((org) => org.slug === 'little-sprouts'));
  const foundUser = await client.get('/platform/search?q=Sipho');
  assert.equal(foundUser.status, 200, foundUser.text);
  assert.ok(foundUser.data.users.some((user) => user.email === 'principal@littlesprouts.local'));
  const short = await client.get('/platform/search?q=x');
  assert.equal(short.status, 200);
  assert.deepEqual(short.data, { organisations: [], users: [], branches: [], learners: [] });

  const { client: tenantClient, organisationId } = await principal();
  const denied = await tenantClient.get('/platform/search?q=littl', { organisationId });
  assert.equal(denied.status, 403);
});

test('impersonation can start and stop, records itself in the audit trail and never impersonates platform admins', async () => {
  const { client, session } = await platform();
  const own = await client.get('/auth/session');
  assert.equal(own.status, 200);
  const me = own.data.user;

  const users = await client.get('/platform/users?q=teacher@littlesprouts.local');
  const target = users.data.find((user) => user.email === 'teacher@littlesprouts.local');
  assert.ok(target);

  const started = await client.post('/platform/users/' + target.id + '/impersonate', {});
  assert.equal(started.status, 200, started.text);
  assert.equal(started.data.impersonating, true);
  assert.ok(started.data.csrfToken);

  const inside = await client.get('/auth/session');
  assert.equal(inside.status, 200, inside.text);
  assert.equal(inside.data.user.email, 'teacher@littlesprouts.local');
  assert.ok(inside.data.impersonated);
  assert.equal(inside.data.impersonated.byEmail, 'platform@re-el-ecd.local');

  const stopped = await client.post('/auth/impersonation/stop', {});
  assert.equal(stopped.status, 200, stopped.text);

  const back = await client.get('/auth/session');
  assert.equal(back.status, 200);
  assert.equal(back.data.user.email, 'platform@re-el-ecd.local');
  assert.equal(back.data.impersonated, null);

  const self = await client.post('/platform/users/' + me.id + '/impersonate', {});
  assert.equal(self.status, 409);

  const otherAdmins = await client.get('/platform/users?q=platformfinance@re-el-ecd.local');
  const financeAdmin = otherAdmins.data.find((user) => user.email === 'platformfinance@re-el-ecd.local');
  if (financeAdmin) {
    const blocked = await client.post('/platform/users/' + financeAdmin.id + '/impersonate', {});
    assert.equal(blocked.status, 409);
  }

  const { client: tenantClient, organisationId } = await principal();
  const denied = await tenantClient.post('/platform/users/' + target.id + '/impersonate', {}, { organisationId });
  assert.equal(denied.status, 403);

  const startedAudit = await db.one(
    "SELECT COUNT(*)::int AS total FROM audit_events WHERE action = 'platform.impersonation_started' AND resource_id = $1",
    [target.id]
  );
  assert.ok(startedAudit.total >= 1);
  const stoppedAudit = await db.one(
    "SELECT COUNT(*)::int AS total FROM audit_events WHERE action = 'platform.impersonation_stopped'"
  );
  assert.ok(stoppedAudit.total >= 1);
});

test('announcements can target several branches at once', async () => {
  const { client, organisationId } = await principal();
  const branches = await twoBranches(client, organisationId);
  const created = await client.post('/announcements', {
    title: 'All-campus notice',
    body: 'This notice goes to Rosebank and our new campus.',
    branchIds: branches.map((branch) => branch.id),
    audienceType: 'all',
    publish: false
  }, { organisationId });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.branch_ids.length, 2);
  assert.deepEqual(new Set(created.data.branch_ids), new Set(branches.map((branch) => branch.id)));
  assert.equal(created.data.branch_id, null);

  for (const branch of branches) {
    const list = await client.get('/announcements?branchId=' + branch.id, { organisationId });
    assert.equal(list.status, 200, list.text);
    assert.ok(list.data.some((row) => row.id === created.data.id));
  }
});

test('one task can be assigned to several staff members at once', async () => {
  const { client, organisationId, staff: members } = await activeStaff();
  const created = await client.post('/tasks', {
    title: 'Team reset checklist',
    staffIds: members.slice(0, 2).map((row) => row.user_id),
    dueAt: '2026-12-01'
  }, { organisationId });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.created, 2);
  assert.equal(created.data.tasks.length, 2);
  assert.deepEqual(new Set(created.data.tasks.map((task) => task.assigned_to)), new Set(members.slice(0, 2).map((row) => row.user_id)));
  assert.ok(created.data.tasks.every((task) => task.title === 'Team reset checklist'));
});

test('one corrective action can be assigned to several staff members at once', async () => {
  const { client, organisationId } = await principal();
  const branches = await client.get('/branches', { organisationId });
  const branchId = branches.data[0].id;
  const learners = await client.get('/learners?status=enrolled&pageSize=1', { organisationId });
  const incident = await client.post('/incidents', {
    branchId,
    learnerIds: [learners.data[0].id],
    incidentType: 'injury',
    severity: 'medium',
    occurredAt: '2026-11-06T08:00:00Z',
    description: 'Two adults were assigned to walk the outdoor area and record the outcome.'
  }, { organisationId });
  assert.equal(incident.status, 201, incident.text);

  const activeStaff = await client.get('/staff?status=active', { organisationId });
  const staffIds = activeStaff.data.filter((row) => row.user_id).slice(0, 2).map((row) => row.user_id);
  assert.equal(staffIds.length, 2);
  const action = await client.post('/incidents/' + incident.data.id + '/actions', {
    description: 'Inspect the play surface and complete the outdoor-area checklist.',
    staffIds
  }, { organisationId });
  assert.equal(action.status, 201, action.text);
  assert.equal(action.data.created, 2);
  assert.equal(action.data.actions.length, 2);
  assert.deepEqual(new Set(action.data.actions.map((entry) => entry.assigned_to)), new Set(staffIds));
});

test('several children can be moved to another classroom in one bulk action', async () => {
  const { client, organisationId } = await principal();
  const classrooms = await client.get('/classrooms', { organisationId });
  const learners = await client.get('/learners?status=enrolled&pageSize=2', { organisationId });
  assert.ok(classrooms.data.length >= 2);
  assert.equal(learners.data.length, 2);
  const target = classrooms.data.find((row) => row.id !== learners.data[0].classroom_id);
  assert.ok(target);

  const moved = await client.post('/learners/bulk', {
    ids: learners.data.map((learner) => learner.id),
    action: 'move_classroom',
    classroomId: target.id
  }, { organisationId });
  assert.equal(moved.status, 200, moved.text);
  assert.equal(moved.data.updated, 2);
  assert.equal(moved.data.skipped.length, 0);

  for (const learner of learners.data) {
    const refreshed = await client.get('/learners/' + learner.id, { organisationId });
    assert.equal(refreshed.data.classroom_id, target.id);
  }
});

test('a guardian can report one absence for several children at once', async () => {
  const { client: principalClient, organisationId } = await principal();
  const branches = await principalClient.get('/branches', { organisationId });
  const created = await principalClient.post('/learners', {
    firstName: 'Ayanda',
    lastName: 'Zulu',
    dateOfBirth: '2022-08-19',
    branchId: branches.data[0].id
  }, { organisationId });
  assert.equal(created.status, 201, created.text);

  const guardian = await db.one(
    `SELECT g.id FROM guardians g JOIN users u ON u.id = g.user_id
     WHERE u.email = 'parent@littlesprouts.local' AND g.organisation_id = $1`,
    [organisationId]
  );
  assert.ok(guardian);
  await db.query(
    `INSERT INTO learner_guardians (organisation_id, learner_id, guardian_id, relationship_type, is_primary_contact,
      can_collect, can_receive_reports, can_receive_financial_information, portal_access_status)
     VALUES ($1,$2,$3,'guardian',false,true,true,true,'active')`,
    [organisationId, created.data.id, guardian.id]
  );

  const parent = createClient();
  const session = await parent.login('parent@littlesprouts.local');
  const parentOrg = session.activeOrganisationId;
  const children = await parent.get('/parent/children', { organisationId: parentOrg });
  assert.ok(children.data.length >= 2);
  const fallbackIds = children.data.slice(0, 2).map((child) => child.id);
  const date = '2099-01-15';

  const submitted = await parent.post('/parent/absence', {
    childIds: fallbackIds,
    date,
    reason: 'Family travel'
  }, { organisationId: parentOrg });
  assert.equal(submitted.status, 201, submitted.text);
  assert.equal(submitted.data.created, 2);
  assert.equal(submitted.data.records.length, 2);

  const attendance = await db.many(
    `SELECT learner_id, attendance_status, absence_reason FROM learner_attendance
     WHERE learner_id = ANY($1::uuid[]) AND attendance_date = $2::date ORDER BY learner_id`,
    [fallbackIds, date]
  );
  assert.equal(attendance.length, 2);
  assert.ok(attendance.every((row) => row.attendance_status === 'excused' && row.absence_reason === 'Family travel'));
});
