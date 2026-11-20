'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const view = read('apps/web/src/views/forms.js');
const app = read('apps/web/src/app.js');
const css = read('apps/web/assets/styles.css');

test('field rows stack the label above the type', () => {
  assert.match(view, /class="form-field-copy"/);
  assert.match(css, /\.form-field-copy \{ display: flex; flex-direction: column/);
  assert.match(css, /\.form-field-copy \.cell-sub \{ display: block; \}/);
});

test('detail actions are compact, sticky and publish is primary', () => {
  assert.match(view, /class="form-detail-actions"/);
  assert.match(view, /title="Settings"/);
  assert.match(view, /title="Edit questions"/);
  assert.match(view, /title="Archive form"/);
  assert.match(css, /\.form-detail-actions \{[\s\S]{0,120}position: sticky/);
});

test('badge soup becomes one status chip plus a secondary summary', () => {
  assert.match(view, /function formStatus\(form\)/);
  assert.match(view, /return 'Live'|return 'Draft'|return 'Archived'/);
  assert.match(view, /class="form-status-line"/);
  assert.match(view, /class="form-secondary"/);
});

test('bulk bar only appears with a selection and shows a count', () => {
  const utils = read('apps/web/src/utils.js');
  assert.match(utils, /x-show="selectedCount > 0"/);
  assert.match(utils, /<strong x-text="selectedCount"><\/strong> selected/);
  assert.match(css, /\[x-cloak\] \{ display: none !important; \}/);
});

test('the library has search, status filter, sort and sortable headers', () => {
  assert.match(view, /R\.searchFilter\(ctx, 'formSearch'/);
  assert.match(view, /R\.selectFilter\(ctx, 'formStatus'/);
  assert.match(view, /R\.selectFilter\(ctx, 'formSort'/);
  assert.match(view, /sort === 'submissions'/);
  assert.match(view, /const statusHeader = \(label, value\)/);
  assert.match(view, /formSort/);
});

test('template gallery opens the new-form modal with a preset', () => {
  assert.match(view, /renderTemplateGallery\(canManage/);
  assert.match(view, /newFormFromPreset/);
  assert.match(app, /newFormFromPreset\(key\)/);
  assert.match(app, /applyFormPreset\(key\)/);
  assert.match(view, /Start from a template|New from a template/);
});

test('the detail panel is split into tabs and sections', () => {
  assert.match(view, /formSection/);
  assert.match(view, /key: 'overview', label: 'Overview'/);
  assert.match(view, /key: 'questions', label: 'Questions'/);
  assert.match(view, /sections\[section\]/);
  assert.match(view, /class="form-detail-section"/);
});

test('public links can be copied and rendered as a QR', () => {
  assert.match(view, /copyToClipboard\(\\'/);
  assert.match(view, /form-public-qr/);
  assert.match(view, /data-qr-data=/);
  assert.match(view, /window\.Reel\.mountQr\(\$el\)/);
  assert.match(app, /copyToClipboard\(value, label\)/);
});

test('draft warnings contain their own publish action', () => {
  assert.match(view, /form-draft-alert/);
  assert.match(view, /form-draft-alert[\s\S]{0,260}\+ publish/);
});

test('submissions have filters, expandable answers and CSV export', () => {
  assert.match(view, /subFrom/);
  assert.match(view, /subTo/);
  assert.match(view, /form-answer-cell/);
  assert.match(view, /x-data="\{ open: false \}"/);
  assert.match(view, /Show all|Show less/);
  assert.match(view, /exportSubmissionsCsv\(\)/);
  assert.match(app, /exportSubmissionsCsv\(\)/);
  assert.match(app, /text\/csv;charset=utf-8/);
});

test('empty library uses its space and mobile stacks the split', () => {
  assert.match(view, /form-empty-guide/);
  assert.match(view, /forms.length < 4/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]{0,160}\.forms-split/);
  assert.match(css, /@media \(max-width: 560px\)/);
});
