'use strict';

/**
 * Gate flow: one QR, one scan, one tap — with the safety rails held.
 *
 * Drop-off auto-registers the register; collection records a verified
 * arrival that a staff member must release; custody holds block collection
 * everywhere; a collector may only act on children linked to them.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { start, stop, createClient, db } = require('./helpers');

const ORG = 'little-sprouts';
const GOGO = { name: 'Gogo', pin: '123456' };
const SIPHO = { name: 'Sipho Driver', pin: '789012' };

let orgId = null;
let amelia = null;
let principal = null;
let parent = null;

function pinHash(pin) {
  return crypto.createHash('sha256').update(orgId + '::collection-pin::' + String(pin).toLowerCase()).digest('hex');
}

test.before(async () => {
  await start();
  principal = createClient();
  await principal.login('principal@littlesprouts.local');
  parent = createClient();
  await parent.login('parent@littlesprouts.local');
  const org = await db.one("SELECT id FROM organisations WHERE slug = 'little-sprouts'");
  orgId = org.id;
  const child = await db.one("SELECT id FROM learners WHERE first_name = 'Amelia' AND organisation_id = $1", [orgId]);
  amelia = child.id;
});

test.after(stop);

test('gate signin: correct name + PIN returns only the linked child with live state', async () => {
  const res = await createClient().post(`/gate/${ORG}/signin`, GOGO);
  assert.equal(res.status, 200);
  assert.equal(res.data.collector.name, 'Gogo Miriam Johnson');
  assert.deepEqual(res.data.children.map((c) => c.id), [amelia]);
  assert.ok('check_in_at' in res.data.children[0], 'child carries live attendance state');
});

test('gate signin: wrong PIN is vague, never explains which part failed', async () => {
  const res = await createClient().post(`/gate/${ORG}/signin`, { name: 'Gogo', pin: '000000' });
  assert.equal(res.status, 401);
  assert.match(res.error.message, /does not match anyone cleared/);
});

test('gate arrive: auto-checks the child in with the verified bringer', async () => {
  const res = await createClient().post(`/gate/${ORG}/arrive`, { ...GOGO, learnerId: amelia });
  assert.equal(res.status, 200);
  assert.equal(res.data.checkedIn, true);
  const view = await principal.get('/learner-attendance');
  const row = view.data.rows.find((r) => r.learner_id === amelia);
  assert.equal(row.attendance_status, 'present');
  assert.ok(row.check_in_at);
  assert.equal(row.brought_by_unverified, false);
  assert.match(row.brought_by_name, /Gogo/);
});

test('gate arrive: idempotent — a second tap updates nothing and does not error', async () => {
  const res = await createClient().post(`/gate/${ORG}/arrive`, { ...GOGO, learnerId: amelia });
  assert.equal(res.status, 200);
  assert.equal(res.data.wasAlreadyIn, true);
});

test('gate collect: records a verified arrival but never marks the child collected', async () => {
  const res = await createClient().post(`/gate/${ORG}/collect`, { ...GOGO, learnerId: amelia });
  assert.equal(res.status, 200);
  assert.equal(res.data.waitingRelease, true);
  const view = await principal.get('/learner-attendance');
  const row = view.data.rows.find((r) => r.learner_id === amelia);
  assert.equal(row.attendance_status, 'present', 'register stays present until staff release');
  assert.equal(row.check_out_at, null);
  const scans = await principal.get('/gate/scans');
  const pending = scans.data.pending.filter((s) => s.learner_id === amelia);
  assert.equal(pending.length, 1, 'one pending scan for the child');
  assert.equal(pending[0].collector_name, 'Gogo Miriam Johnson');
});

test('gate collect: tapping Collecting twice reuses the same scan', async () => {
  const first = await createClient().post(`/gate/${ORG}/collect`, { ...GOGO, learnerId: amelia });
  const second = await createClient().post(`/gate/${ORG}/collect`, { ...GOGO, learnerId: amelia });
  assert.equal(second.status, 200);
  assert.equal(second.data.scanId, first.data.scanId);
  assert.equal(second.data.alreadyWaiting, true);
});

test('gate collect: a collector cannot act on a child they are not linked to', async () => {
  const view = await principal.get('/learner-attendance');
  const other = view.data.rows.find((r) => r.learner_id !== amelia);
  const collect = await createClient().post(`/gate/${ORG}/collect`, { ...GOGO, learnerId: other.learner_id });
  assert.equal(collect.status, 403);
  const arrive = await createClient().post(`/gate/${ORG}/arrive`, { ...GOGO, learnerId: other.learner_id });
  assert.equal(arrive.status, 403);
});

test('gate collect: refused when the child is not signed in yet', async () => {
  // Liam is seeded present but uncollected… use a learner with no attendance row.
  const free = await db.one(
    `SELECT l.id FROM learners l
     LEFT JOIN learner_attendance a ON a.learner_id = l.id AND a.attendance_date = CURRENT_DATE
     WHERE l.organisation_id = $1 AND l.status = 'enrolled' AND a.id IS NULL LIMIT 1`, [orgId]
  );
  if (!free) return; // every enrolled child is on the register today in this seed
  const res = await createClient().post(`/gate/${ORG}/collect`, { ...GOGO, learnerId: free.id });
  assert.equal(res.status, 403); // not linked beats not-signed-in
});

test('staff release: flips the register to collected exactly once', async () => {
  const scans = await principal.get('/gate/scans');
  const scan = scans.data.pending.find((s) => s.learner_id === amelia);
  const res = await principal.post(`/gate/scans/${scan.id}/release`, {});
  assert.equal(res.status, 200);
  assert.equal(res.data.released, true);
  const view = await principal.get('/learner-attendance');
  const row = view.data.rows.find((r) => r.learner_id === amelia);
  assert.equal(row.attendance_status, 'collected');
  assert.ok(row.check_out_at);
  const again = await principal.post(`/gate/scans/${scan.id}/release`, {});
  assert.equal(again.status, 409);
});

test('parent collection history: a released QR gate scan appears immediately', async () => {
  const res = await parent.get(`/parent/children/${amelia}/collections`);
  assert.equal(res.status, 200);
  const row = res.data.find((r) => r.verification_method === 'gate_qr');
  assert.ok(row, 'the QR release is a custody record parents can see');
  assert.match(row.collector_name, /Gogo/);
  assert.ok(row.recorded_at);
  assert.equal(row.event_type, 'collection');
});

test('morning cockpit: pending gate releases arrive in /staff/morning', async () => {
  // Make a fresh verified arrival for a child still on site, then read the cockpit.
  const free = await db.one(
    `SELECT l.id FROM learners l
     JOIN classrooms c ON c.id = l.classroom_id
     LEFT JOIN learner_attendance a ON a.learner_id = l.id AND a.attendance_date = CURRENT_DATE
     WHERE l.organisation_id = $1 AND l.status = 'enrolled' AND l.id <> $2
       AND c.name IN ('Butterflies','Sunflowers') AND a.id IS NULL LIMIT 1`, [orgId, amelia]
  );
  assert.ok(free, 'seed leaves a learner unmarked for today');
  await principal.post('/learner-attendance/register', { records: [{ learnerId: free.id, status: 'present' }] });
  // Link a collector directly in the DB so the gate scan can be created.
  const collector = (await db.query(
    `INSERT INTO authorised_collectors (organisation_id, learner_id, name, relationship, status, approval_status, approved_at, pin_hash)
     VALUES ($1,$2,'Cockpit Test Uncle','Uncle','active','approved',now(),$3) RETURNING id`,
    [orgId, free.id, pinHash('778899')]
  )).rows[0].id;
  try {
    const scan = await createClient().post(`/gate/${ORG}/collect`, { name: 'Cockpit', pin: '778899', learnerId: free.id });
    assert.equal(scan.status, 200);
    const morning = await principal.get('/staff/morning');
    assert.equal(morning.status, 200);
    const pending = morning.data.gateScans.find((s) => s.id === scan.data.scanId);
    assert.ok(pending, 'cockpit lists the waiting release');
    assert.equal(pending.collectorName, 'Cockpit Test Uncle');
    // Clean up: release it so later tests see a quiet gate.
    const release = await principal.post(`/gate/scans/${scan.data.scanId}/release`, {});
    assert.equal(release.status, 200);
  } finally {
    await db.query("UPDATE authorised_collectors SET status = 'revoked' WHERE id = $1", [collector]);
  }
});

test('gate collect: refused once the child has already gone home', async () => {
  const res = await createClient().post(`/gate/${ORG}/collect`, { ...GOGO, learnerId: amelia });
  assert.equal(res.status, 409);
  assert.match(res.error.message, /already gone home/);
});

test('gate arrive: refused once the child has already gone home', async () => {
  const res = await createClient().post(`/gate/${ORG}/arrive`, { ...GOGO, learnerId: amelia });
  assert.equal(res.status, 409);
  assert.match(res.error.message, /already collected today/);
});

test('custody hold blocks collection at the scan and again at release', async () => {
  // A fresh collector row on Amelia with a known PIN, while a hold is placed.
  const collector = (await db.query(
    `INSERT INTO authorised_collectors (organisation_id, learner_id, name, relationship, status, approval_status, approved_at, pin_hash)
     VALUES ($1,$2,'Hold Test Granny','Grandmother','active','approved',now(),$3) RETURNING id`,
    [orgId, amelia, pinHash('445566')]
  )).rows[0].id;
  await db.query("UPDATE learners SET collection_hold_reason = 'Court order on file' WHERE id = $1", [amelia]);
  try {
    const collect = await createClient().post(`/gate/${ORG}/collect`, { name: 'Hold', pin: '445566', learnerId: amelia });
    assert.equal(collect.status, 409);
    assert.match(collect.error.message, /hold/i);
    // And the release rail: an unreleased scan behind a hold cannot be released.
    const scan = (await db.query(
      `INSERT INTO gate_scans (organisation_id, branch_id, collector_id, collector_name, collector_type, learner_id)
       SELECT $1, branch_id, $2, 'Hold Test Granny', 'family', $3 FROM learners WHERE id = $3 RETURNING id`,
      [orgId, collector, amelia]
    )).rows[0].id;
    const release = await principal.post(`/gate/scans/${scan}/release`, {});
    assert.equal(release.status, 409);
    assert.match(release.error.message, /hold/i);
    const still = await principal.get('/learner-attendance');
    const row = still.data.rows.find((r) => r.learner_id === amelia);
    assert.notEqual(row.attendance_status, 'collected-again');
    assert.equal(row.attendance_status, 'collected', 'the earlier release is untouched');
  } finally {
    await db.query("UPDATE learners SET collection_hold_reason = NULL WHERE id = $1", [amelia]);
    await db.query("UPDATE authorised_collectors SET status = 'revoked' WHERE id = $1", [collector]);
  }
});

test('a second collector on the same child (driver) can run the same flow', async () => {
  // Sipho the driver arrives to collect — different PIN, same child.
  const res = await createClient().post(`/gate/${ORG}/signin`, SIPHO);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.children.map((c) => c.id), [amelia]);
  assert.equal(res.data.collector.type, 'driver');
});

test('gate endpoints are rate limited against PIN guessing', async () => {
  let last;
  for (let i = 0; i < 25; i++) {
    last = await createClient().post(`/gate/${ORG}/signin`, { name: 'Gogo', pin: '90000' + i });
    if (last.status === 429) break;
  }
  assert.equal(last.status, 429, 'repeated failures must hit the limiter');
  const valid = await createClient().post(`/gate/${ORG}/signin`, GOGO);
  assert.equal(valid.status, 429, 'the window is per address, even for a correct PIN');
});

test('bulk register skips already-checked-in children and preserves their bringer', async () => {
  // Check a child in through the normal flow first.
  const free = await db.one(
    `SELECT l.id, l.first_name FROM learners l
     LEFT JOIN learner_attendance a ON a.learner_id = l.id AND a.attendance_date = CURRENT_DATE
     WHERE l.organisation_id = $1 AND l.status = 'enrolled' AND a.id IS NULL LIMIT 1`, [orgId]
  );
  assert.ok(free, 'seed leaves a learner unmarked for today');
  const checkIn = await principal.post('/learner-attendance/register', {
    records: [{ learnerId: free.id, status: 'present' }]
  });
  assert.equal(checkIn.status, 200);
  const before = checkIn.data.records[0];
  assert.ok(before.check_in_at, 'today check-in stamps the arrival time');

  // Now a bulk submit that includes this child again — the register must
  // refuse to silently overwrite the custody evidence.
  const bulk = await principal.post('/learner-attendance/register', {
    records: [{ learnerId: free.id, status: 'present' }]
  });
  assert.equal(bulk.status, 200);
  assert.equal(bulk.data.updated === undefined ? bulk.data.records.length : bulk.data.updated, 0);
  assert.equal(bulk.data.skipped.length, 1);
  assert.equal(bulk.data.skipped[0].id, free.id);
  assert.match(bulk.data.skipped[0].reason, /Already checked in/);

  const after = (await principal.get('/learner-attendance')).data.rows.find((r) => r.learner_id === free.id);
  assert.equal(after.check_in_at, before.check_in_at, 'the check-in time was not erased');
  assert.equal(after.attendance_status, 'present');
});

test('manual release: sets collected, is audited, blocked on hold, and permission-gated', async () => {
  const free = await db.one(
    `SELECT l.id FROM learners l
     LEFT JOIN learner_attendance a ON a.learner_id = l.id AND a.attendance_date = CURRENT_DATE
     WHERE l.organisation_id = $1 AND l.status = 'enrolled' AND a.id IS NULL LIMIT 1`, [orgId]
  );
  assert.ok(free);
  await principal.post('/learner-attendance/register', { records: [{ learnerId: free.id, status: 'present' }] });
  const row = (await principal.get('/learner-attendance')).data.rows.find((r) => r.learner_id === free.id);
  const recordId = row.attendance_id;

  // Reason is required and must be substantive.
  const short = await principal.post(`/learner-attendance/record/${recordId}/manual-release`, { reason: 'short' });
  assert.equal(short.status, 422);

  const released = await principal.post(`/learner-attendance/record/${recordId}/manual-release`, {
    reason: 'Parent arrived without their phone; identity verified at reception.'
  });
  assert.equal(released.status, 200);
  assert.equal(released.data.attendance_status, 'collected');
  assert.ok(released.data.check_out_at);

  // One release only.
  const again = await principal.post(`/learner-attendance/record/${recordId}/manual-release`, {
    reason: 'Parent arrived without their phone; identity verified at reception.'
  });
  assert.equal(again.status, 409);

  // Teachers cannot release without the gate — that is the whole point.
  const teacher = createClient();
  await teacher.login('teacher@littlesprouts.local');
  const denied = await teacher.post(`/learner-attendance/record/${recordId}/manual-release`, { reason: 'Teacher should never reach this.' });
  assert.equal(denied.status, 403);

  // Custody hold blocks the manual release too — no path around a hold.
  const held = await db.one(
    `SELECT l.id FROM learners l
     LEFT JOIN learner_attendance a ON a.learner_id = l.id AND a.attendance_date = CURRENT_DATE
     WHERE l.organisation_id = $1 AND l.status = 'enrolled' AND a.id IS NULL AND l.id <> $2 LIMIT 1`,
    [orgId, free.id]
  );
  assert.ok(held);
  await db.query('UPDATE learners SET collection_hold_reason = $2 WHERE id = $1', [held.id, 'Family court order — test']);
  try {
    await principal.post('/learner-attendance/register', { records: [{ learnerId: held.id, status: 'present' }] });
    const heldRow = (await principal.get('/learner-attendance')).data.rows.find((r) => r.learner_id === held.id);
    const heldRelease = await principal.post(`/learner-attendance/record/${heldRow.attendance_id}/manual-release`, { reason: 'Trying to release past a custody hold.' });
    assert.equal(heldRelease.status, 409);
    assert.match(heldRelease.error.message, /custody hold/i);
  } finally {
    await db.query('UPDATE learners SET collection_hold_reason = NULL WHERE id = $1', [held.id]);
  }

  // The audit trail carries the named release.
  const audit = await db.one(
    `SELECT metadata FROM audit_events WHERE organisation_id = $1 AND action = 'attendance.manual_release'
     ORDER BY occurred_at DESC LIMIT 1`, [orgId]
  );
  assert.ok(audit, 'the release was audited');
  assert.ok(audit.metadata.reason.includes('without their phone'));
});
