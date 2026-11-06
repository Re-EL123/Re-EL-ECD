'use strict';

/**
 * Export endpoint contract tests.
 *
 * Every list export is authenticated, org-scoped and permission-gated; these
 * tests pin the content types, the attachment disposition, the permission
 * boundary and the tenant boundary.
 */

process.env.PAYFAST_SANDBOX = 'true';
process.env.PAYFAST_VALIDATE = 'false';
delete process.env.RESEND_API_KEY;
delete process.env.PAYFAST_IP_ALLOWLIST;

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

async function teacher() {
  const client = createClient();
  const session = await client.login('teacher@littlesprouts.local');
  return { client, organisationId: session.activeOrganisationId };
}

async function platformAdmin() {
  const client = createClient();
  await client.login('platform@re-el-ecd.local');
  return { client };
}

test('learners export in CSV format with the register and a download disposition', async () => {
  const { client, organisationId } = await principal();
  const response = await client.get('/exports/learners', { organisationId });
  assert.equal(response.status, 200, response.text);
  assert.match(String(response.headers.get('content-type') || ''), /text\/csv/);
  assert.match(String(response.headers.get('content-disposition') || ''), /attachment; filename="re-el-learners\.csv"/);
  assert.ok(response.text.startsWith('Reference,Last name,First name'), 'expected the CSV header row first');
  assert.match(response.text, /Emma/);
});

test('learners export in XLSX and PDF formats with the right signatures', async () => {
  const { client, organisationId } = await principal();
  const xlsx = await client.get('/exports/learners?format=xlsx', { organisationId });
  assert.equal(xlsx.status, 200, xlsx.text);
  assert.equal(xlsx.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(String(xlsx.headers.get('content-disposition') || ''), /\.xlsx"/);
  const body = xlsx.rawBody || Buffer.from(xlsx.text, 'binary');
  assert.equal(body[0], 0x50);
  assert.equal(body[1], 0x4b);

  const pdf = await client.get('/exports/learners?format=pdf', { organisationId });
  assert.equal(pdf.status, 200, pdf.text);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.match(String(pdf.headers.get('content-disposition') || ''), /\.pdf"/);
  assert.equal((pdf.rawBody || Buffer.from(pdf.text, 'binary')).slice(0, 5).toString(), '%PDF-');
});

test('an unsupported format falls back to CSV', async () => {
  const { client, organisationId } = await principal();
  const response = await client.get('/exports/learners?format=bogus', { organisationId });
  assert.equal(response.status, 200);
  assert.match(String(response.headers.get('content-type') || ''), /text\/csv/);
});

test('a role without the permission is refused', async () => {
  const { client, organisationId } = await teacher();
  const response = await client.get('/exports/learners', { organisationId });
  assert.equal(response.status, 403);

  // The expenses export is likewise finance-scoped.
  const expenses = await client.get('/exports/expenses', { organisationId });
  assert.equal(expenses.status, 403);
});

test('attendance export respects the from/to filters', async () => {
  const { client, organisationId } = await principal();
  const response = await client.get('/exports/attendance?format=csv&from=2031-01-01&to=2031-01-31', { organisationId });
  assert.equal(response.status, 200, response.text);
  assert.match(response.text, /Date,Child,Status,Absence reason,Branch/);
});

test('platform settlements export is platform-only', async () => {
  const { client } = await platformAdmin();
  const response = await client.get('/exports/platform/settlements?format=csv');
  assert.equal(response.status, 200, response.text);
  assert.match(response.text, /Organisation,Mode,Fee %/);

  const pdf = await client.get('/exports/platform/settlements?format=pdf');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');

  const { client: staff, organisationId } = await principal();
  const denied = await staff.get('/exports/platform/settlements?format=csv', { organisationId });
  assert.equal(denied.status, 403);
});

test('platform audit export is platform-only and available in PDF', async () => {
  const { client } = await platformAdmin();
  const pdf = await client.get('/exports/platform/platform-audit?format=pdf');
  assert.equal(pdf.status, 200, pdf.text);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const body = pdf.rawBody || Buffer.from(pdf.text, 'binary');
  assert.equal(body.slice(0, 5).toString(), '%PDF-');
});

test('subscription invoices export for the tenant', async () => {
  const { client, organisationId } = await principal();
  const response = await client.get('/exports/subscription-invoices?format=xlsx', { organisationId });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});

test('reports export in XLSX and PDF formats', async () => {
  const { client, organisationId } = await principal();
  const xlsx = await client.get('/reports/finance_summary?format=xlsx', { organisationId });
  assert.equal(xlsx.status, 200, xlsx.text);
  assert.equal(xlsx.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const pdf = await client.get('/reports/finance_summary?format=pdf', { organisationId });
  assert.equal(pdf.status, 200, pdf.text);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');

  const csv = await client.get('/reports/finance_summary?format=csv', { organisationId });
  assert.equal(csv.status, 200, csv.text);
  assert.match(String(csv.headers.get('content-type') || ''), /text\/csv/);
});

test('an unknown resource returns 404 and the audit trail records the export', async () => {
  const { client, organisationId } = await principal();
  const response = await client.get('/exports/not-a-resource', { organisationId });
  assert.equal(response.status, 404);

  await client.get('/exports/learners?format=csv', { organisationId });
  const audit = await db.one(
    "SELECT COUNT(*)::int AS total FROM audit_events WHERE action = 'export.created' AND organisation_id = $1",
    [organisationId]
  );
  assert.ok(audit.total >= 1);
});
