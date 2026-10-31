'use strict';

/**
 * Bulk actions across the admissions, forms, shift and leave screens.
 *
 * Every list that offers a bulk bar uses one contract:
 * `POST <resource>/bulk { ids, action }` -> `{ action, updated, skipped }`.
 * These tests exercise the real router, RBAC and SQL, and confirm that a
 * record belonging to another tenant is skipped rather than touched.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient } = require('./helpers');

test.before(start);
test.after(stop);

async function principal() {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  const organisationId = session.activeOrganisationId;
  const branches = await client.get('/branches', { organisationId });
  assert.equal(branches.status, 200);
  return { client, organisationId, branchId: branches.data[0].id };
}

async function otherTenant() {
  const client = createClient();
  const session = await client.login('principal@sunrise.local');
  const organisationId = session.activeOrganisationId;
  const branches = await client.get('/branches', { organisationId });
  return { client, organisationId, branchId: branches.data[0].id };
}

test('enquiries are closed, spammed and reopened in bulk', async () => {
  const { client, organisationId, branchId } = await principal();
  const made = [];
  for (let i = 0; i < 3; i += 1) {
    const enquiry = await client.post('/admissions/enquiries', {
      branchId,
      source: 'phone',
      guardianName: 'Bulk Guardian ' + i + ' ' + Date.now(),
      guardianEmail: 'bulk' + i + '.' + Date.now() + '@example.com',
      childName: 'Bulk Child ' + i
    }, { organisationId });
    assert.equal(enquiry.status, 201);
    made.push(enquiry.data.id);
  }

  const closed = await client.post('/admissions/enquiries/bulk', {
    ids: made, action: 'close'
  }, { organisationId });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.updated, 3);
  assert.equal(closed.data.skipped.length, 0);

  const read = await client.get('/admissions/enquiries/' + made[0], { organisationId });
  assert.equal(read.data.status, 'closed');

  // A record already in the target state is reported as skipped, not failed.
  const again = await client.post('/admissions/enquiries/bulk', {
    ids: made, action: 'close'
  }, { organisationId });
  assert.equal(again.data.updated, 0);
  assert.equal(again.data.skipped.length, 3);

  const reopened = await client.post('/admissions/enquiries/bulk', {
    ids: made, action: 'reopen'
  }, { organisationId });
  assert.equal(reopened.data.updated, 3);

  const spam = await client.post('/admissions/enquiries/bulk', {
    ids: [made[1]], action: 'spam'
  }, { organisationId });
  assert.equal(spam.data.updated, 1);

  const invalid = await client.post('/admissions/enquiries/bulk', {
    ids: made, action: 'delete'
  }, { organisationId });
  assert.equal(invalid.status, 422);

  const empty = await client.post('/admissions/enquiries/bulk', {
    ids: [], action: 'close'
  }, { organisationId });
  assert.equal(empty.status, 422);
});

test('applications are approved in bulk and another tenant is skipped', async () => {
  const { client, organisationId, branchId } = await principal();
  const other = await otherTenant();

  const mine = await client.post('/admissions/applications', {
    branchId,
    childFirstName: 'Bulk',
    childLastName: 'Applicant',
    childDateOfBirth: '2022-02-02',
    guardianName: 'Bulk Applicant Guardian',
    guardianEmail: 'bulk.applicant.' + Date.now() + '@example.com'
  }, { organisationId });
  assert.equal(mine.status, 201);

  const foreign = await other.client.post('/admissions/applications', {
    branchId: other.branchId,
    childFirstName: 'Foreign',
    childLastName: 'Applicant',
    childDateOfBirth: '2022-03-03',
    guardianName: 'Foreign Guardian',
    guardianEmail: 'foreign.applicant.' + Date.now() + '@example.com'
  }, { organisationId: other.organisationId });
  assert.equal(foreign.status, 201);

  const result = await client.post('/admissions/applications/bulk', {
    ids: [mine.data.id, foreign.data.id], action: 'approve'
  }, { organisationId });
  assert.equal(result.status, 200);
  assert.equal(result.data.updated, 1);
  assert.equal(result.data.skipped.length, 1);
  assert.equal(result.data.skipped[0].id, foreign.data.id);

  const approved = await client.get('/admissions/applications/' + mine.data.id, { organisationId });
  assert.equal(approved.data.status, 'approved');

  const untouched = await other.client.get('/admissions/applications/' + foreign.data.id, { organisationId: other.organisationId });
  assert.equal(untouched.data.status, 'submitted');
});

test('forms publish and archive in bulk', async () => {
  const { client, organisationId } = await principal();
  const stamp = Date.now();
  const forms = [];
  for (let i = 0; i < 2; i += 1) {
    const form = await client.post('/forms', {
      name: 'Bulk form ' + i,
      slug: 'bulk-form-' + stamp + '-' + i,
      formType: 'consent',
      isPublic: false,
      fields: [{ key: 'note', label: 'Note', type: 'text', required: true }]
    }, { organisationId });
    assert.equal(form.status, 201);
    forms.push(form.data.id);
  }

  const published = await client.post('/forms/bulk', { ids: forms, action: 'publish' }, { organisationId });
  assert.equal(published.status, 200);
  assert.equal(published.data.updated, 2);

  const read = await client.get('/forms/' + forms[0], { organisationId });
  assert.equal(read.data.status, 'published');

  const archived = await client.post('/forms/bulk', { ids: forms, action: 'archive' }, { organisationId });
  assert.equal(archived.data.updated, 2);

  const afterArchive = await client.get('/forms/' + forms[1], { organisationId });
  assert.equal(afterArchive.data.status, 'archived');
});

test('shifts approve and cancel in bulk without touching completed shifts', async () => {
  const { client, organisationId, branchId } = await principal();
  const staff = await client.get('/staff', { organisationId });
  assert.equal(staff.status, 200);
  const member = staff.data.find((row) => row.employment_status !== 'ended');
  assert.ok(member);

  const day = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const shift = await client.post('/shifts', {
    staffId: member.id,
    branchId,
    shiftDate: day,
    startsAt: day + 'T07:00:00',
    endsAt: day + 'T13:00:00',
    breakMinutes: 15
  }, { organisationId });
  assert.equal(shift.status, 201);

  const approved = await client.post('/shifts/bulk', { ids: [shift.data.id], action: 'approve' }, { organisationId });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.updated, 1);

  const cancelled = await client.post('/shifts/bulk', { ids: [shift.data.id], action: 'cancel' }, { organisationId });
  assert.equal(cancelled.data.updated, 1);

  // Cancelled shifts cannot be approved again.
  const reapprove = await client.post('/shifts/bulk', { ids: [shift.data.id], action: 'approve' }, { organisationId });
  assert.equal(reapprove.data.updated, 0);
  assert.equal(reapprove.data.skipped.length, 1);
});

test('leave requests are approved and rejected in bulk', async () => {
  const { client, organisationId } = await principal();
  const staff = await client.get('/staff', { organisationId });
  const members = staff.data.filter((row) => row.employment_status === 'active').slice(0, 2);
  assert.ok(members.length >= 2);

  const start = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10);
  const requests = [];
  for (const member of members) {
    const leave = await client.post('/leave', {
      staffId: member.id,
      leaveType: 'annual',
      startsOn: start,
      endsOn: end,
      reason: 'Bulk test'
    }, { organisationId });
    assert.equal(leave.status, 201);
    requests.push(leave.data.id);
  }

  const approved = await client.post('/leave/bulk', { ids: [requests[0]], action: 'approve' }, { organisationId });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.updated, 1);

  const rejected = await client.post('/leave/bulk', { ids: [requests[1]], action: 'reject' }, { organisationId });
  assert.equal(rejected.data.updated, 1);

  const read = await client.get('/leave', { organisationId });
  const byId = new Map(read.data.map((row) => [row.id, row.status]));
  assert.equal(byId.get(requests[0]), 'approved');
  assert.equal(byId.get(requests[1]), 'rejected');
});

test('expenses approve, pay and reject in bulk', async () => {
  const { client, organisationId, branchId } = await principal();
  const made = [];
  for (let i = 0; i < 3; i += 1) {
    const expense = await client.post('/expenses', {
      branchId,
      description: 'Bulk expense ' + i + ' ' + Date.now(),
      amount: 120 + i,
      submit: true
    }, { organisationId });
    assert.equal(expense.status, 201);
    made.push(expense.data.id);
  }

  const approved = await client.post('/expenses/bulk', { ids: [made[0]], action: 'approve' }, { organisationId });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.updated, 1);

  const paid = await client.post('/expenses/bulk', { ids: [made[1]], action: 'paid' }, { organisationId });
  assert.equal(paid.data.updated, 1);

  const rejected = await client.post('/expenses/bulk', { ids: [made[2]], action: 'reject' }, { organisationId });
  assert.equal(rejected.data.updated, 1);

  const list = await client.get('/expenses', { organisationId });
  const byId = new Map(list.data.map((row) => [row.id, row.approval_status]));
  assert.equal(byId.get(made[0]), 'approved');
  assert.equal(byId.get(made[1]), 'paid');
  assert.equal(byId.get(made[2]), 'rejected');

  // Closed expenses are skipped on a second pass.
  const again = await client.post('/expenses/bulk', { ids: [made[1]], action: 'approve' }, { organisationId });
  assert.equal(again.data.updated, 0);
  assert.equal(again.data.skipped.length, 1);
});

test('inventory items archive and restore in bulk', async () => {
  const { client, organisationId, branchId } = await principal();
  const item = await client.post('/inventory', {
    branchId,
    name: 'Bulk paint ' + Date.now(),
    category: 'art',
    quantityOnHand: 10,
    minimumQuantity: 2,
    unit: 'litres'
  }, { organisationId });
  assert.equal(item.status, 201);

  const archived = await client.post('/inventory/bulk', { ids: [item.data.id], action: 'archive' }, { organisationId });
  assert.equal(archived.status, 200);
  assert.equal(archived.data.updated, 1);

  const active = await client.get('/inventory', { organisationId });
  assert.equal(active.data.some((row) => row.id === item.data.id), false);

  const archiveView = await client.get('/inventory?status=archived', { organisationId });
  assert.equal(archiveView.data.some((row) => row.id === item.data.id), true);

  const restored = await client.post('/inventory/bulk', { ids: [item.data.id], action: 'restore' }, { organisationId });
  assert.equal(restored.data.updated, 1);

  const back = await client.get('/inventory', { organisationId });
  assert.equal(back.data.some((row) => row.id === item.data.id), true);
});

test('incidents move from reported to closed in bulk', async () => {
  const { client, organisationId, branchId } = await principal();
  const made = [];
  for (let i = 0; i < 2; i += 1) {
    const incident = await client.post('/incidents', {
      branchId,
      incidentType: 'Minor injury',
      description: 'Bulk incident description number ' + i + ' for testing.',
      severity: 'low'
    }, { organisationId });
    assert.equal(incident.status, 201);
    made.push(incident.data.id);
  }

  const reviewed = await client.post('/incidents/bulk', { ids: made, action: 'review' }, { organisationId });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.data.updated, 2);

  const closed = await client.post('/incidents/bulk', { ids: made, action: 'close' }, { organisationId });
  assert.equal(closed.data.updated, 2);

  const read = await client.get('/incidents/' + made[0], { organisationId });
  assert.equal(read.data.status, 'closed');

  // Closing twice is skipped rather than an error.
  const again = await client.post('/incidents/bulk', { ids: made, action: 'close' }, { organisationId });
  assert.equal(again.data.updated, 0);
  assert.equal(again.data.skipped.length, 2);
});

test('lesson plans submit, approve and publish in bulk', async () => {
  const { client, organisationId, branchId } = await principal();
  const plan = await client.post('/curriculum/lesson-plans', {
    branchId,
    title: 'Bulk plan ' + Date.now(),
    theme: 'Colours'
  }, { organisationId });
  assert.equal(plan.status, 201);
  assert.equal(plan.data.status, 'draft');

  const submitted = await client.post('/curriculum/lesson-plans/bulk', { ids: [plan.data.id], action: 'submit' }, { organisationId });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.updated, 1);

  const approved = await client.post('/curriculum/lesson-plans/bulk', { ids: [plan.data.id], action: 'approve' }, { organisationId });
  assert.equal(approved.data.updated, 1);

  const published = await client.post('/curriculum/lesson-plans/bulk', { ids: [plan.data.id], action: 'publish' }, { organisationId });
  assert.equal(published.data.updated, 1);

  const read = await client.get('/curriculum/lesson-plans/' + plan.data.id, { organisationId });
  assert.equal(read.data.status, 'published');

  // Draft-only moves are refused once published.
  const back = await client.post('/curriculum/lesson-plans/bulk', { ids: [plan.data.id], action: 'submit' }, { organisationId });
  assert.equal(back.data.updated, 0);
  assert.equal(back.data.skipped.length, 1);
});
