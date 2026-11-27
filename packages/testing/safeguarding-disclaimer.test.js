'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('a dedicated safeguarding disclaimer explains platform vs centre duties', () => {
  const view = read('apps/web/src/views/public.js');
  const app = read('apps/web/src/app.js');
  const service = read('apps/api/src/services/document-service.js');
  const migration = read('packages/database/migrations/060_safeguarding_terms_alignment.sql');

  assert.match(app, /route\('\/legal\/safeguarding-disclaimer'/);
  assert.match(view, /V\.legalSafeguardingDisclaimer = legalDocViews\('safeguarding-disclaimer'\)/);
  assert.match(view, /\['\/legal\/safeguarding-disclaimer', 'Safeguarding & operational disclaimer'\]/);
  assert.match(view, /Re-EL ECD provides digital tools to support ECD administration and safeguarding procedures/);
  assert.match(view, /remain fully responsible for the physical supervision/);
  assert.match(view, /maintain its own safeguarding policies and procedures/);
  assert.match(view, /Authorised collectors must be correctly registered/);
  assert.match(view, /Staff must follow the centre’s verification procedures/);
  assert.match(view, /does not replace physical supervision, responsible and suitably vetted staff/);
  assert.match(view, /South African Government requirements for ECD registration/);
  assert.match(view, /Re-EL ECD is not a South African Government department/);

  assert.match(service, /legal\('safeguarding-disclaimer'/);
  assert.match(service, /South African Government ECD registration/);
  assert.match(migration, /Safeguarding and operational responsibilities/);
  assert.match(migration, /South African Government department/);
});

test('the Terms carry the safeguarding relationship and registration disclaimer', () => {
  const view = read('apps/web/src/views/public.js');
  const app = read('apps/web/src/app.js');
  const service = read('apps/api/src/services/document-service.js');
  assert.match(app, /route\('\/legal\/terms'/);
  assert.match(view, /The Safeguarding & Operational Disclaimer forms part of these Terms/);
  assert.match(view, /centre remains responsible for supervising children/);
  assert.match(view, /authorised collectors are correctly registered/);
  assert.match(view, /staff follow the centre’s established verification procedures/);
  assert.match(service, /does not register an ECD centre or certify that it is legally compliant/);
  assert.match(service, /does not replace physical supervision, responsible staff/);
});
