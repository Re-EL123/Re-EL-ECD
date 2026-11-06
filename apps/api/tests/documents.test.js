'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient } = require('./helpers');

test.before(start);
test.after(stop);

test('role manuals seed for every capacity and download as branded PDFs', async () => {
  const client = createClient();
  await client.login('principal@littlesprouts.local');
  const list = await client.get('/documents?pageSize=100', { organisationId: undefined });
  assert.ok(Array.isArray(list.data));
  const slugs = new Set(list.data.map((d) => d.slug));
  for (const role of ['principal', 'teacher', 'parent_guardian', 'finance_officer', 'admissions_officer', 'platform_super_admin']) {
    assert.ok(slugs.has('manual-' + role), 'missing manual ' + role);
  }
  for (const slug of ['terms', 'privacy', 'cookies', 'acceptable-use', 'safeguarding']) {
    assert.ok(slugs.has(slug), 'missing legal ' + slug);
  }
  const detail = await client.get('/documents/manual-teacher');
  assert.equal(detail.status, 200);
  assert.ok(detail.data.sections.length >= 2);
  const pdf = await client.get('/documents/manual-teacher/pdf');
  assert.equal(pdf.status, 200, pdf.text?.slice(0, 200));
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.ok(pdf.text.startsWith('%PDF-'));
  assert.ok(pdf.text.length > 2000);
});

test('legal PDFs are public and the super admin can edit every document', async () => {
  const anon = createClient();
  const pub = await anon.get('/public/documents/privacy');
  assert.equal(pub.status, 200, pub.text);
  assert.equal(pub.data.category, 'legal');
  const pubPdf = await anon.get('/public/documents/terms/pdf');
  assert.equal(pubPdf.status, 200, pubPdf.text?.slice(0, 200));
  assert.ok(pubPdf.text.startsWith('%PDF-'));
  const anonManual = await anon.get('/public/documents/manual-teacher');
  assert.equal(anonManual.status, 404);

  const platformClient = createClient();
  await platformClient.login('platform@re-el-ecd.local');
  const users = await platformClient.get('/platform/users?q=teacher@littlesprouts.local');
  const teacher = users.data.find((u) => u.email === 'teacher@littlesprouts.local');
  assert.ok(teacher);
  const edited = await platformClient.patch('/platform/documents/manual-teacher', {
    title: 'Teacher Manual — edited',
    lede: 'Edited lede for test.',
    intro: ['Edited intro.'],
    sections: [{ heading: 'Edited SOP', paragraphs: ['Do the edited thing.'], steps: ['1. Edit', '2. Save'] }]
  });
  assert.equal(edited.status, 200, edited.text);
  assert.equal(edited.data.title, 'Teacher Manual — edited');
  assert.ok(edited.data.version >= 2);

  // Tenant administrators must not edit documents.
  const principalClient = createClient();
  const session = await principalClient.login('principal@littlesprouts.local');
  const denied = await principalClient.patch('/platform/documents/manual-teacher', { title: 'Hacked manual title' }, { organisationId: session.activeOrganisationId });
  assert.equal(denied.status, 403, denied.text);
});
