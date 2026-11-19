'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('lesson completion bridges into parent-visible evidence', () => {
  const curriculum = read('apps/api/src/modules/curriculum.js');
  assert.match(curriculum, /router\.post\('\/curriculum\/calendar\/events\/:id\/share'/);
  assert.match(curriculum, /source_type, source_id\);?/);
  assert.match(curriculum, /notifyGuardians\(ctx, learner\.id, observation\)/);
  assert.match(curriculum, /notifyReviewers\(ctx, observation\)/);
  const migration = read('packages/database/migrations/049_lesson_sharing.sql');
  assert.match(migration, /CREATE UNIQUE INDEX/);
  const index = read('apps/web/index.html');
  assert.match(index, /shareLessonWithFamilies\(\)/);
  const app = read('apps/web/src/app.js');
  assert.match(app, /async shareLessonWithFamilies\(\)/);
});

test('submitted observations tell reviewers and published ones tell families', () => {
  const assessments = read('apps/api/src/modules/assessments.js');
  assert.match(assessments, /async function notifyReviewers/);
  assert.match(assessments, /permission_key = 'assessments\.publish\.daycare'/);
  assert.match(assessments, /else await notifyReviewers\(ctx, observation\)/);
  assert.match(assessments, /module\.exports = \{ register, progressFor, notifyGuardians, notifyReviewers \}/);
  const notifications = read('apps/api/src/services/notification-service.js');
  assert.match(notifications, /moment: '\/parent\/progress'/);
});

test('parents see moments, shared reports and participation notes', () => {
  const parentApi = read('apps/api/src/modules/parent.js');
  assert.match(parentApi, /router\.get\('\/parent\/children\/:id\/observations'/);
  assert.match(parentApi, /participation_summary/);
  assert.match(parentApi, /latestObservation[\s\S]{0,300}assessment_status IN \('published','amended'\)/);
  const parentView = read('apps/web/src/views/parent.js');
  assert.match(parentView, /\/observations'\)/);
  assert.match(parentView, /Classroom moments/);
  assert.match(parentView, /event\.participation_summary/);
});

test('privacy gates are enforced on every parent-facing read', () => {
  const checks = [
    'apps/api/src/modules/parent.js',
    'apps/api/src/modules/assessments.js',
    'apps/api/src/services/digest-service.js',
    'apps/api/src/modules/operations.js'
  ];
  checks.forEach((file) => {
    const source = read(file);
    assert.match(source, /visibility_status IN \('guardians','published'\)/, file);
  });
  const learners = read('apps/api/src/modules/learners.js');
  assert.match(learners, /if \(report\.shared_with_guardians\) await notifyReportShared/);
  assert.match(learners, /async function notifyReportShared/);
});
