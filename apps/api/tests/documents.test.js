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
  for (const slug of ['terms', 'privacy', 'cookies', 'acceptable-use', 'safeguarding',
    'safeguarding-disclaimer', 'data-processing-agreement']) {
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

  // Manual slugs contain underscores (from role keys) — detail and PDF
  // must resolve them, not 422.
  const underscored = await client.get('/documents/manual-admissions_officer');
  assert.equal(underscored.status, 200, underscored.text);
  assert.equal(underscored.data.role_key, 'admissions_officer');
  const underscoredPdf = await client.get('/documents/manual-parent_guardian/pdf');
  assert.equal(underscoredPdf.status, 200, underscoredPdf.text?.slice(0, 200));
  assert.ok(underscoredPdf.text.startsWith('%PDF-'));
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

  // Editing a manual whose slug has underscores must work too.
  const editedUnderscored = await platformClient.patch('/platform/documents/manual-admissions_officer', {
    lede: 'Edited lede for test.'
  });
  assert.equal(editedUnderscored.status, 200, editedUnderscored.text);
  assert.ok(editedUnderscored.data.version >= 2);

  // Tenant administrators must not edit documents.
  const principalClient = createClient();
  const session = await principalClient.login('principal@littlesprouts.local');
  const denied = await principalClient.patch('/platform/documents/manual-teacher', { title: 'Hacked manual title' }, { organisationId: session.activeOrganisationId });
  assert.equal(denied.status, 403, denied.text);
});

test('the operator agreement and safeguarding disclaimer are public and complete', async () => {
  const anon = createClient();
  const dpa = await anon.get('/public/documents/data-processing-agreement');
  assert.equal(dpa.status, 200, dpa.text);
  const dpaText = JSON.stringify(dpa.data).toLowerCase();
  for (const phrase of ['lawful authority', 'cloudflare r2', 'payfast', 'access, sharing', 'security requirements',
    'termination', 'export, retention', 'security incidents', 'attorney']) {
    assert.ok(dpaText.includes(phrase), 'DPA is missing: ' + phrase);
  }

  const disclaimer = await anon.get('/public/documents/safeguarding-disclaimer');
  assert.equal(disclaimer.status, 200, disclaimer.text);
  const disclaimerText = JSON.stringify(disclaimer.data).toLowerCase();
  for (const phrase of ['supervis', 'safeguarding policies', 'authorised collector',
    'verification', 'does not replace', 'registration']) {
    assert.ok(disclaimerText.includes(phrase), 'Disclaimer is missing: ' + phrase);
  }

  const terms = await anon.get('/public/documents/terms');
  assert.equal(terms.status, 200);
  assert.match(JSON.stringify(terms.data), /does not automatically register an ECD centre|does not register an ECD centre/i);
});

test('the breach response procedure is published and covers all seven stages', async () => {
  const anon = createClient();
  const doc = await anon.get('/public/documents/breach-response');
  assert.equal(doc.status, 200, doc.text);
  const text = JSON.stringify(doc.data).toLowerCase();
  for (const phrase of ['detect', 'restrict', 'preserve', 'inform', 'affected', 'popia', 'corrective',
    'information regulator', 'eservices', 'operator']) {
    assert.ok(text.includes(phrase), 'procedure is missing: ' + phrase);
  }
  assert.ok((doc.data.sections || []).length >= 7);

  const dpa = await anon.get('/public/documents/data-processing-agreement');
  assert.equal(dpa.status, 200);
  assert.match(JSON.stringify(dpa.data), /Breach Response Procedure/);
});

test('Terms and the safeguarding disclaimer agree on responsibilities and registration', async () => {
  const anon = createClient();
  const terms = (await anon.get('/public/documents/terms')).data;
  const disclaimer = (await anon.get('/public/documents/safeguarding-disclaimer')).data;
  const termsText = JSON.stringify(terms).toLowerCase();
  const disclaimerText = JSON.stringify(disclaimer).toLowerCase();
  for (const phrase of ['digital tools', 'supervis', 'authorised collector', 'verification',
    'does not replace', 'safeguarding']) {
    assert.ok(termsText.includes(phrase), 'Terms missing: ' + phrase);
    assert.ok(disclaimerText.includes(phrase), 'Disclaimer missing: ' + phrase);
  }
  for (const phrase of ['south african government', 'does not', 'registration', 'certif']) {
    assert.ok(termsText.includes(phrase), 'Terms missing: ' + phrase);
    assert.ok(disclaimerText.includes(phrase), 'Disclaimer missing: ' + phrase);
  }
});
