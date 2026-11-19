'use strict';

/**
 * Closing the loop: a taught lesson becomes parent-visible evidence, submitted
 * work reaches reviewers, and sharing is deduplicated.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

async function login(email) {
  const client = createClient();
  const session = await client.login(email);
  return { client, organisationId: session.activeOrganisationId, userId: session.user && session.user.id };
}

async function sampleEvent(client, organisationId, title) {
  const branches = await client.get('/branches', { organisationId });
  const learners = await client.get('/learners?pageSize=5', { organisationId });
  const learner = (learners.data || []).find((l) => l.classroom_id);
  assert.ok(learner, 'a learner with a classroom is needed');
  const starts = new Date(Date.now() + 2 * 3600 * 1000);
  const created = await client.post('/curriculum/calendar/events', {
    branchId: branches.data[0].id, classroomId: learner.classroom_id, title,
    startsAt: starts.toISOString(), endsAt: new Date(starts.getTime() + 30 * 60000).toISOString()
  }, { organisationId });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  return { event: created.data, learner };
}

test('sharing a lesson creates one evidence record per child and dedupes', async () => {
  const { client, organisationId } = await login('principal@littlesprouts.local');
  const { event, learner } = await sampleEvent(client, organisationId, 'Family loop check');
  try {
    const completed = await client.post('/curriculum/calendar/events/' + event.id + '/complete', {
      participation: [{ learnerId: learner.id, status: 'participated', summary: 'Counted bottle caps confidently.' }]
    }, { organisationId });
    assert.equal(completed.status, 200, JSON.stringify(completed.error));

    const first = await client.post('/curriculum/calendar/events/' + event.id + '/share', {
      note: 'We counted to twenty together.'
    }, { organisationId });
    assert.equal(first.status, 200, JSON.stringify(first.error));
    assert.equal(first.data.shared, 1);
    assert.equal(first.data.published, true, 'principal publishes straight away');

    const rows = await db.many(
      `SELECT * FROM learner_observations WHERE source_type = 'lesson' AND source_id = $1`, [event.id]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].learner_id, learner.id);
    assert.equal(rows[0].assessment_status, 'published');
    assert.match(rows[0].context, /Lesson:/);

    const again = await client.post('/curriculum/calendar/events/' + event.id + '/share', {}, { organisationId });
    assert.equal(again.data.shared, 0, 'a second share is a no-op');
    assert.equal(again.data.skipped, 1);
  } finally {
    await client.delete('/curriculum/calendar/events/' + event.id, { organisationId });
  }
});

test('a teacher without publish rights submits for review and notifies reviewers', async () => {
  const setup = await login('principal@littlesprouts.local');
  const { client, organisationId } = await login('teacher@littlesprouts.local');
  const { event, learner } = await sampleEvent(setup.client, organisationId, 'Teacher review check');
  try {
    const before = await db.one("SELECT COUNT(*)::int AS total FROM notifications WHERE notification_type = 'observation_due'", []);
    const res = await client.post('/curriculum/calendar/events/' + event.id + '/share', {
      note: 'Shared a story with the group.'
    }, { organisationId });
    assert.equal(res.status, 200, JSON.stringify(res.error));
    assert.equal(res.data.published, false);
    const rows = await db.many('SELECT * FROM learner_observations WHERE source_type = \'lesson\' AND source_id = $1', [event.id]);
    assert.ok(rows.length >= 1);
    assert.equal(rows[0].assessment_status, 'submitted');
    assert.equal(rows[0].visibility_status, 'internal');
    const after = await db.one("SELECT COUNT(*)::int AS total FROM notifications WHERE notification_type = 'observation_due'", []);
    assert.ok(after.total > before.total, 'reviewers were notified');
    assert.ok(learner.id);
  } finally {
    await setup.client.delete('/curriculum/calendar/events/' + event.id, { organisationId });
  }
});

test('daily reports shared on create notify guardians', async () => {
  const { client, organisationId } = await login('principal@littlesprouts.local');
  const linked = await db.one(
    'SELECT l.id FROM learners l JOIN learner_guardians lg ON lg.learner_id = l.id JOIN guardians g ON g.id = lg.guardian_id WHERE l.organisation_id = $1 AND lg.can_receive_reports = true AND lg.portal_access_status = $2::text AND g.user_id IS NOT NULL LIMIT 1',
    [organisationId, 'active']
  );
  assert.ok(linked, 'a learner with a report-receiving guardian is needed');
  const learner = { id: linked.id };
  const before = await db.one("SELECT COUNT(*)::int AS total FROM notifications WHERE notification_type = 'daily_report_shared'", []);
  const report = await client.post('/learners/' + learner.id + '/daily-reports', {
    reportDate: '2026-11-14', mood: 'happy', activitiesSummary: 'Counting with bottle caps',
    sharedWithGuardians: true
  }, { organisationId });
  assert.equal(report.status, 201, JSON.stringify(report.error));
  const after = await db.one("SELECT COUNT(*)::int AS total FROM notifications WHERE notification_type = 'daily_report_shared'", []);
  assert.ok(after.total > before.total, 'creating a shared report notifies');
  await client.delete('/learners/' + learner.id + '/daily-reports/' + report.data.id, { organisationId }).catch(() => {});
});

test('one moment can be captured for several children at once', async () => {
  const { client, organisationId } = await login('principal@littlesprouts.local');
  const learners = await client.get('/learners?pageSize=4', { organisationId });
  const ids = (learners.data || []).slice(0, 2).map((l) => l.id);
  assert.equal(ids.length, 2);
  const res = await client.post('/assessments/quick-moments/bulk', {
    learnerIds: ids.concat(ids[0]), note: 'Counting together with bottle caps.'
  }, { organisationId });
  assert.equal(res.status, 201, JSON.stringify(res.error));
  assert.equal(res.data.created, 2, 'duplicates are collapsed');
  assert.equal(res.data.failed.length, 0);
  const rows = await db.query(
    `SELECT COUNT(*)::int AS total FROM learner_observations
     WHERE learner_id = ANY($1::uuid[]) AND observation_text = $2`,
    [ids, 'Counting together with bottle caps.']
  );
  assert.equal(rows.rows[0].total, 2);
});
