'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the breach procedure is reachable from the legal hub', () => {
  const app = read('apps/web/src/app.js');
  const view = read('apps/web/src/views/public.js');
  assert.match(app, /route\('\/legal\/breach-response', 'public', 'legalBreachResponse'/);
  assert.match(view, /\['\/legal\/breach-response', 'Security incident & breach response'\]/);
  assert.match(view, /V\.legalBreachResponse = legalDocViews\('breach-response'\)/);
  assert.match(view, /'breach-response': \{[\s\S]*?OPERATIONAL TEMPLATE/);
  assert.match(view, /The full Security Incident & Breach Response Procedure/);
});

test('the internal playbook covers the seven required stages and POPIA reporting', () => {
  const doc = read('docs/breach-response.md');
  const headings = [
    'Detecting and investigating', 'Restricting unauthorised access', 'Preserving relevant logs',
    'Informing the affected centre', 'Determining which individuals are affected',
    'POPIA notification requirements', 'Documenting corrective actions'
  ];
  headings.forEach((heading) => assert.match(doc, new RegExp(heading, 'i'), 'missing: ' + heading));
  assert.match(doc, /Information Regulator/);
  assert.match(doc, /eservices\.inforegulator\.org\.za/);
  assert.match(doc, /Security Compromise Notification Form/);
  assert.match(doc, /operator/);
  assert.match(doc, /responsible party/);
  assert.match(doc, /no risk threshold/i);
  assert.match(doc, /Template A/);
  assert.match(doc, /Template B/);
  assert.match(doc, /Template C/);
});

test('seed catalogue and migration publish the procedure', () => {
  const service = read('apps/api/src/services/document-service.js');
  const migration = read('packages/database/migrations/059_breach_response_procedure.sql');
  const review = read('docs/legal-review.md');
  assert.match(service, /legal\('breach-response'/);
  assert.match(migration, /INSERT INTO documents/);
  assert.match(migration, /ON CONFLICT \(slug\) DO NOTHING/);
  assert.match(migration, /Breach Response Procedure/);
  assert.match(review, /Security Incident & Breach Response Procedure/);
  assert.match(review, /Information Officer/);
});
