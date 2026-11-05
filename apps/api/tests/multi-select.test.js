'use strict';

/**
 * Multi-select contracts.
 *
 * The UI lets an operator choose several people or records at once, so the API
 * must accept array inputs without breaking the single-value response shapes
 * that existing callers and tests rely on.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

async function principal() {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  return { client, organisationId: session.activeOrganisationId };
}

test('one shift can be created for several staff members at once', async () => {
  const { client, organisationId } = await principal();
  const staff = await client.get('/staff?status=active', { organisationId });
  const branches = await client.get('/branches', { organisationId });
  assert.ok(staff.data.length >= 2);
  assert.ok(branches.data.length >= 1);

  const staffIds = staff.data.slice(0, 2).map((row) => row.id);
  const branchId = branches.data[0].id;
  const shiftDate = '2031-06-03';

  const created = await client.post('/shifts', {
    staffIds,
    branchId,
    shiftDate,
    startsAt: shiftDate + 'T08:00:00.000Z',
    endsAt: shiftDate + 'T13:00:00.000Z',
    breakMinutes: 15,
    publish: true
  }, { organisationId });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.created, 2);
  assert.equal(created.data.requested, 2);
  assert.equal(created.data.shifts.length, 2);
  assert.deepEqual(new Set(created.data.shifts.map((shift) => shift.staff_id)), new Set(staffIds));

  const listed = await client.get('/shifts?from=' + shiftDate + '&to=' + shiftDate, { organisationId });
  assert.equal(listed.status, 200, listed.text);
  assert.ok(listed.data.filter((shift) => staffIds.includes(shift.staff_id)).length >= 2);
});

test('a single staffId still returns the original single-shift shape', async () => {
  const { client, organisationId } = await principal();
  const staff = await client.get('/staff?status=active', { organisationId });
  const branches = await client.get('/branches', { organisationId });
  const staffId = staff.data[0].id;
  const shiftDate = '2031-06-04';

  const created = await client.post('/shifts', {
    staffId,
    branchId: branches.data[0].id,
    shiftDate,
    startsAt: shiftDate + 'T08:00:00.000Z',
    endsAt: shiftDate + 'T12:00:00.000Z'
  }, { organisationId });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.data.staff_id, staffId);
  assert.ok(String(created.data.shift_date).startsWith(shiftDate));
  assert.equal(created.data.created, undefined);
});

test('progress reports can be generated for several children at once', async () => {
  const { client, organisationId } = await principal();
  const learners = await client.get('/learners?status=enrolled&pageSize=200', { organisationId });
  const learnerIds = learners.data.slice(0, 2).map((learner) => learner.id);
  assert.equal(learnerIds.length, 2);

  let periods = await client.get('/assessments/periods', { organisationId });
  if (!periods.data.length) {
    const created = await client.post('/assessments/periods', {
      name: 'Multi-report period', startsOn: '2026-01-01', endsOn: '2026-12-31'
    }, { organisationId });
    assert.equal(created.status, 201, created.text);
    periods = await client.get('/assessments/periods', { organisationId });
  }

  const generated = await client.post('/assessments/reports/generate', {
    learnerIds,
    assessmentPeriodId: periods.data[0].id,
    format: 'html'
  }, { organisationId });
  assert.equal(generated.status, 201, generated.text);
  assert.equal(generated.data.count, 2);
  assert.equal(generated.data.reports.length, 2);
  assert.equal(generated.data.jobs.length, 2);
  assert.deepEqual(new Set(generated.data.reports.map((report) => report.learner.id)), new Set(learnerIds));

  const jobs = await db.one(
    `SELECT COUNT(*)::int AS total FROM report_jobs
     WHERE organisation_id = $1 AND parameters->>'learnerId' = ANY($2::text[])`,
    [organisationId, learnerIds]
  );
  assert.equal(jobs.total, 2);
});

test('a single learnerId keeps the original report response shape', async () => {
  const { client, organisationId } = await principal();
  const learners = await client.get('/learners?status=enrolled&pageSize=200', { organisationId });
  const periods = await client.get('/assessments/periods', { organisationId });
  const generated = await client.post('/assessments/reports/generate', {
    learnerId: learners.data[0].id,
    assessmentPeriodId: periods.data[0].id
  }, { organisationId });
  assert.equal(generated.status, 201, generated.text);
  assert.ok(generated.data.job);
  assert.ok(generated.data.report);
  assert.equal(generated.data.count, undefined);
});

test('monthly invoices can be generated for selected children only', async () => {
  const { client, organisationId } = await principal();
  const branches = await client.get('/branches', { organisationId });
  const branchId = branches.data[0].id;
  const suffix = Date.now();

  // The seed has no active enrolment rows, so create two enrolled children
  // through the real endpoint before billing them.
  const created = [];
  for (const [index, name] of ['Invoice', 'Billing'].entries()) {
    const learner = await client.post('/learners', {
      firstName: name,
      lastName: 'Multi' + (suffix + index),
      dateOfBirth: '2022-04-12',
      branchId,
      enrolmentDate: '2031-01-15'
    }, { organisationId });
    assert.equal(learner.status, 201, learner.text);
    created.push(learner.data.id);
  }
  const learnerIds = created;

  const plans = await client.get('/fee-plans', { organisationId });
  const plan = plans.data.find((entry) => (entry.items || []).length > 0) || plans.data[0];
  assert.ok(plan, 'the seed should provide a fee plan');

  const generated = await client.post('/invoices/generate', {
    feePlanId: plan.id,
    learnerIds,
    dueAt: '2031-06-30',
    description: 'Multi-select test invoice'
  }, { organisationId });
  assert.equal(generated.status, 200, generated.text);
  assert.equal(generated.data.generated, 2);
  assert.deepEqual(new Set(generated.data.invoices.map((invoice) => invoice.learner_id)), new Set(learnerIds));
});

test('several roles can be granted across several branches at once', async () => {
  const { client, organisationId } = await principal();
  const members = await client.get('/access/memberships', { organisationId });
  const roles = await client.get('/access/roles', { organisationId });
  let branches = await client.get('/branches', { organisationId });
  assert.ok(branches.data.length >= 1);

  if (branches.data.length < 2) {
    const created = await client.post('/branches', {
      name: 'Second campus', slug: 'second-campus-' + Date.now()
    }, { organisationId });
    assert.equal(created.status, 201, created.text);
    branches = await client.get('/branches', { organisationId });
  }

  const roleKeys = ['teacher', 'assistant'].filter((key) => roles.data.some((role) => role.role_key === key));
  assert.ok(roleKeys.length >= 1);
  const branchIds = branches.data.slice(0, 2).map((branch) => branch.id);

  const candidate = members.data.find((member) => member.status === 'active' &&
    member.email !== 'principal@littlesprouts.local' &&
    !(member.roles || []).some((role) => roleKeys.includes(role.role)));
  assert.ok(candidate, 'expected a member without the test roles');

  const granted = await client.post('/access/memberships/' + candidate.id + '/roles', {
    roleKeys,
    branchIds
  }, { organisationId });
  assert.equal(granted.status, 200, granted.text);
  assert.equal(granted.data.granted, roleKeys.length * branchIds.length);
  assert.equal(granted.data.assignments.length, roleKeys.length * branchIds.length);

  const rows = await db.many(
    `SELECT mr.* FROM membership_roles mr
     JOIN roles r ON r.id = mr.role_id
     WHERE mr.membership_id = $1 AND mr.status = 'active' AND r.role_key = ANY($2::text[])`,
    [candidate.id, roleKeys]
  );
  assert.equal(rows.length, roleKeys.length * branchIds.length);
  assert.deepEqual(new Set(rows.map((row) => row.branch_id)), new Set(branchIds));

  const duplicate = await client.post('/access/memberships/' + candidate.id + '/roles', {
    roleKeys, branchIds
  }, { organisationId });
  assert.equal(duplicate.status, 409);
});
