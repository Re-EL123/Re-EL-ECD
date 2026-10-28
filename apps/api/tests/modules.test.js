'use strict';

/**
 * End-to-end module tests across the main operational domains. Each request
 * goes through the real router, permission middleware and SQL layer.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient } = require('./helpers');

test.before(start);
test.after(stop);

async function principalContext() {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  const organisationId = session.activeOrganisationId;
  const membership = session.memberships.find((m) => m.organisation.id === organisationId);
  const branches = await client.get('/branches', { organisationId });
  assert.equal(branches.status, 200);
  return { client, session, organisationId, branchId: branches.data[0].id, membership };
}

test('learner can be created, read, updated and listed with pagination', async () => {
  const { client, organisationId, branchId } = await principalContext();
  const classrooms = await client.get('/classrooms', { organisationId });
  const classroomId = classrooms.data[0] && classrooms.data[0].id;

  const created = await client.post('/learners', {
    firstName: 'Test',
    lastName: 'Child',
    dateOfBirth: '2022-04-12',
    branchId,
    classroomId,
    homeLanguage: 'English'
  }, { organisationId });
  assert.equal(created.status, 201);
  assert.equal(created.data.first_name, 'Test');
  assert.equal(created.data.status, 'enrolled');
  assert.match(created.data.learner_reference, /^LS-\d{4}-\d+$/);

  const read = await client.get('/learners/' + created.data.id, { organisationId });
  assert.equal(read.status, 200);
  assert.equal(read.data.last_name, 'Child');

  const updated = await client.patch('/learners/' + created.data.id, { preferredName: 'Testy' }, { organisationId });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.preferred_name, 'Testy');

  const list = await client.get('/learners?q=Test&pageSize=5', { organisationId });
  assert.equal(list.status, 200);
  assert.ok(list.data.some((learner) => learner.id === created.data.id));

  const invalid = await client.post('/learners', { firstName: 'Missing' }, { organisationId });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.error.code, 'VALIDATION_ERROR');
});

test('attendance register records presence and is idempotent per child/day', async () => {
  const { client, organisationId } = await principalContext();
  const date = '2026-09-15';
  const register = await client.get('/learner-attendance?date=' + date, { organisationId });
  assert.equal(register.status, 200);
  const learner = register.data.rows[0];
  assert.ok(learner, 'the seeded register should include enrolled children');

  const marked = await client.post('/learner-attendance/register', {
    date,
    records: [{ learnerId: learner.learner_id, status: 'present' }]
  }, { organisationId });
  assert.equal(marked.status, 200);
  assert.equal(marked.data.records[0].attendance_status, 'present');

  const again = await client.get('/learner-attendance?date=' + date, { organisationId });
  const row = again.data.rows.find((r) => r.learner_id === learner.learner_id);
  assert.equal(row.attendance_status, 'present');
});

test('observation lifecycle produces a real progress report', async () => {
  const { client, organisationId } = await principalContext();
  const learners = await client.get('/learners?pageSize=1', { organisationId });
  const objectives = await client.get('/curriculum/objectives', { organisationId });
  assert.equal(objectives.status, 200);
  assert.ok(objectives.data.length > 0);

  const observation = await client.post('/assessments/observations', {
    learnerId: learners.data[0].id,
    objectiveId: objectives.data[0].id,
    observationText: 'During free play the child sorted shapes by size and colour without prompting.',
    context: 'Free play'
  }, { organisationId });
  assert.equal(observation.status, 201);
  assert.equal(observation.data.assessment_status, 'draft');

  const published = await client.post('/assessments/observations/' + observation.data.id + '/publish', {}, { organisationId });
  assert.equal(published.status, 200);
  assert.equal(published.data.assessment_status, 'published');

  const amended = await client.post('/assessments/observations/' + observation.data.id + '/amend', {
    observationText: 'During free play the child sorted shapes by size and colour, then explained the pattern.',
    reason: 'Added the child\'s explanation after reviewing the note.'
  }, { organisationId });
  assert.equal(amended.status, 200);
  assert.equal(amended.data.amended_from, observation.data.id);

  const period = await client.post('/assessments/periods', {
    name: 'Test Term', startsOn: '2026-09-01', endsOn: '2026-11-30'
  }, { organisationId });
  assert.equal(period.status, 201);

  const report = await client.post('/assessments/reports/generate', {
    learnerId: learners.data[0].id, assessmentPeriodId: period.data.id, format: 'html'
  }, { organisationId });
  assert.equal(report.status, 201);
  assert.equal(report.data.job.status, 'completed');
  assert.ok(report.data.report.totals.objectives > 0);
  assert.match(report.data.report.html, /Developmental progress report/);
  assert.match(report.data.report.html, new RegExp(learners.data[0].first_name));
  assert.ok(!/NaN|Invalid Date|undefined/.test(report.data.report.html));

  const progress = await client.get('/learners/' + learners.data[0].id + '/progress', { organisationId });
  assert.equal(progress.status, 200);
  assert.ok(progress.data.observations.length >= 1);
});

test('invoice, payment allocation and parent balance stay consistent', async () => {
  const { client, organisationId, branchId } = await principalContext();
  const learners = await client.get('/learners?pageSize=1', { organisationId });
  const learnerId = learners.data[0].id;

  const invalid = await client.post('/invoices', { branchId, items: [] }, { organisationId });
  assert.equal(invalid.status, 422);

  const invoice = await client.post('/invoices', {
    branchId,
    learnerId,
    dueAt: '2026-11-15',
    items: [{ description: 'Monthly care fee', quantity: 1, unitAmount: 1250 }]
  }, { organisationId });
  assert.equal(invoice.status, 201);
  assert.equal(invoice.data.status, 'draft');
  assert.equal(Number(invoice.data.total_amount), 1250);

  const issued = await client.post('/invoices/' + invoice.data.id + '/issue', {}, { organisationId });
  assert.equal(issued.status, 200);
  assert.equal(issued.data.status, 'issued');

  const payment = await client.post('/payments', {
    amount: 1250,
    paymentMethod: 'eft',
    allocations: [{ invoiceId: invoice.data.id, amount: 1250 }]
  }, { organisationId });
  assert.equal(payment.status, 201);
  assert.equal(payment.data.unallocated, 0);

  const read = await client.get('/invoices/' + invoice.data.id, { organisationId });
  assert.equal(read.status, 200);
  assert.equal(read.data.status, 'paid');
  assert.equal(Number(read.data.amount_paid), 1250);
});

test('incident moves through review, corrective action and closure', async () => {
  const { client, organisationId, branchId } = await principalContext();
  const learners = await client.get('/learners?pageSize=1', { organisationId });

  const incident = await client.post('/incidents', {
    branchId,
    learnerIds: [learners.data[0].id],
    incidentType: 'injury',
    severity: 'low',
    occurredAt: '2026-10-20T09:30:00Z',
    description: 'Minor scrape on the knee while playing on the outdoor equipment.'
  }, { organisationId });
  assert.equal(incident.status, 201);
  assert.equal(incident.data.status, 'reported');

  const action = await client.post('/incidents/' + incident.data.id + '/actions', {
    description: 'Inspect the play surface and record the outcome.'
  }, { organisationId });
  assert.equal(action.status, 201);

  const done = await client.patch('/incident-actions/' + action.data.id, { status: 'done' }, { organisationId });
  assert.equal(done.status, 200);
  assert.equal(done.data.status, 'done');

  const closed = await client.patch('/incidents/' + incident.data.id, { status: 'closed' }, { organisationId });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.status, 'closed');

  const detail = await client.get('/incidents/' + incident.data.id, { organisationId });
  assert.equal(detail.data.actions[0].status, 'done');
});

test('task can be created and completed', async () => {
  const { client, organisationId } = await principalContext();
  const task = await client.post('/tasks', {
    title: 'Restock the art cupboard',
    priority: 'high',
    dueAt: '2026-11-02'
  }, { organisationId });
  assert.equal(task.status, 201);

  const done = await client.patch('/tasks/' + task.data.id, { status: 'done' }, { organisationId });
  assert.equal(done.status, 200);
  assert.equal(done.data.status, 'done');
  assert.ok(done.data.completed_at);
});

test('form builder publishes a form that a parent can submit', async () => {
  const { client, organisationId } = await principalContext();
  const slug = 'test-consent-' + Date.now();
  const form = await client.post('/forms', {
    name: 'Test permission form',
    slug,
    formType: 'consent',
    isPublic: false,
    fields: [{ key: 'note', label: 'Note', type: 'text', required: true }]
  }, { organisationId });
  assert.equal(form.status, 201);

  const published = await client.post('/forms/' + form.data.id + '/publish', {}, { organisationId });
  assert.equal(published.status, 200);
  assert.equal(published.data.status, 'published');

  const parent = createClient();
  const parentSession = await parent.login('parent@littlesprouts.local');
  const parentOrg = parentSession.activeOrganisationId;
  const available = await parent.get('/parent/forms', { organisationId: parentOrg });
  assert.equal(available.status, 200);
  assert.ok(available.data.some((f) => f.id === form.data.id));

  const children = await parent.get('/parent/children', { organisationId: parentOrg });
  const submission = await parent.post('/forms/' + form.data.id + '/submit', {
    data: { note: 'Happy for this to be recorded.' },
    learnerId: children.data[0].id
  }, { organisationId: parentOrg });
  assert.equal(submission.status, 201);
  assert.equal(submission.data.status, 'received');
});

test('staff invitation is created with a one-time token and correct tenancy', async () => {
  const { client, organisationId } = await principalContext();
  const invitation = await client.post('/access/invitations', {
    email: 'new.teacher.' + Date.now() + '@example.com',
    displayName: 'New Teacher',
    roleKey: 'teacher'
  }, { organisationId });
  assert.equal(invitation.status, 200);
  assert.equal(invitation.data.roleKey, 'teacher');
  assert.ok(invitation.data.invitationId);
  assert.ok(invitation.meta.inviteToken);
  assert.ok(new Date(invitation.data.expiresAt) > new Date());
});

test('reports catalogue, CSV export and audit trail are available', async () => {
  const { client, organisationId } = await principalContext();
  const catalogue = await client.get('/reports', { organisationId });
  assert.equal(catalogue.status, 200);
  assert.ok(Array.isArray(catalogue.data.catalogue));

  const report = await client.get('/reports/enrolment_summary?from=2026-01-01&to=2026-12-31', { organisationId });
  assert.equal(report.status, 200);
  assert.ok(Array.isArray(report.data.rows));

  const csv = await client.get('/reports/enrolment_summary?format=csv', { organisationId });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type') || '', /text\/csv/);

  const audit = await client.get('/audit', { organisationId });
  assert.equal(audit.status, 200);
  assert.ok(audit.data.length > 0);
  assert.ok(audit.data.every((event) => event.action));
});

test('a teacher records their own attendance without team permissions', async () => {
  const client = createClient();
  const session = await client.login('teacher@littlesprouts.local');
  const organisationId = session.activeOrganisationId;

  const team = await client.get('/staff-attendance', { organisationId });
  assert.equal(team.status, 403, 'teachers must not read the whole team register');

  const me = await client.get('/staff-attendance/me', { organisationId });
  assert.equal(me.status, 200);
  assert.equal(me.data.staff.employee_reference, 'EMP-005');

  const clockedOut = await client.post('/staff-attendance/clock-out', {}, { organisationId });
  assert.equal([201, 409].includes(clockedOut.status), true);

  const clockIn = await client.post('/staff-attendance/clock-in', {}, { organisationId });
  assert.equal([201, 409].includes(clockIn.status), true);
  assert.equal(typeof (clockIn.data || {}).event_type === 'string' || clockIn.status === 409, true);

  const after = await client.get('/staff-attendance/me', { organisationId });
  assert.equal(after.status, 200);
  assert.ok(Array.isArray(after.data.today));
});

test('platform administrator manages the platform organisation, not tenant data', async () => {
  const client = createClient();
  const session = await client.login('platform@re-el-ecd.local');
  assert.equal(session.isPlatformAdmin, true);

  const before = await client.get('/platform/settings');
  assert.equal(before.status, 200);
  assert.equal(before.data.organisation.slug, 're-el-platform');

  const updated = await client.patch('/platform/settings', {
    settings: { supportEmail: 'support@re-el-ecd.example', dataRetention: { years: 7 } }
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.settings.supportEmail, 'support@re-el-ecd.example');

  const tenantSettings = await client.get('/organisations/current', { organisationId: session.activeOrganisationId });
  assert.equal(tenantSettings.status, 403, 'platform settings must not imply daycare access');
});
