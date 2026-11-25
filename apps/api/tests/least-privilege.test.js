'use strict';

/**
 * Least privilege: a permission to see one domain must not expose another,
 * and sensitive fields stay behind the permission that justifies them.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

test('the dashboard only returns domains the caller can open', async () => {
  const admissions = createClient();
  await admissions.login('admissions@littlesprouts.local');
  const dashboard = await admissions.get('/dashboard');
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.error));
  assert.equal(dashboard.data.finance.outstanding, 0);
  assert.deepEqual(dashboard.data.revenueByMonth, []);
  assert.deepEqual(dashboard.data.tasks, []);
  // Admissions is their domain, so it is still visible.
  assert.ok(dashboard.data.applications);

  const finance = createClient();
  await finance.login('finance@littlesprouts.local');
  const financeDashboard = await finance.get('/dashboard');
  assert.equal(financeDashboard.status, 200);
  // Finance officers can open Fees, so the numbers must be present.
  assert.ok(Number.isFinite(financeDashboard.data.finance.outstanding));
  assert.ok(Array.isArray(financeDashboard.data.revenueByMonth));
});

test('a reports permission no longer unlocks every child in the morning view', async () => {
  const { wideRead } = require('../src/modules/morning');
  const ctxFor = (keys) => ({ access: { permissions: new Set(keys) } });
  assert.equal(wideRead(ctxFor(['reports.read.daycare'])), false);
  assert.equal(wideRead(ctxFor(['learner_placeholder', 'reports.read.daycare'])), false);
  assert.equal(wideRead(ctxFor(['learners.read.daycare'])), true);
});

test('teachers see ordinary medical notes but not restricted ones', async () => {
  const principal = createClient();
  await principal.login('principal@littlesprouts.local');
  const learners = await principal.get('/learners?pageSize=200');
  const amelia = learners.data.find((learner) => learner.first_name === 'Amelia');
  assert.ok(amelia);

  const restricted = await db.one(
    "SELECT id FROM learner_medical_records WHERE learner_id = $1 AND visibility_level = 'restricted' LIMIT 1",
    [amelia.id]
  );
  assert.ok(restricted, 'seed dataset should include a restricted medical note');

  const teacher = createClient();
  await teacher.login('teacher@littlesprouts.local');
  const teacherRows = await teacher.get('/learners/' + amelia.id + '/medical');
  assert.equal(teacherRows.status, 200, JSON.stringify(teacherRows.error));
  assert.ok(!teacherRows.data.some((row) => row.id === restricted.id));

  const principalRows = await principal.get('/learners/' + amelia.id + '/medical');
  assert.ok(principalRows.data.some((row) => row.id === restricted.id));
});

test('a parent without financial consent is not shown a balance', async () => {
  const parent = createClient();
  const session = await parent.login('parent@littlesprouts.local');
  const learner = await db.one(
    `SELECT l.id FROM learners l
     JOIN learner_guardians lg ON lg.learner_id = l.id
     JOIN guardians g ON g.id = lg.guardian_id
     WHERE g.user_id = $1 AND l.organisation_id = $2 LIMIT 1`,
    [session.user.id, session.activeOrganisationId]
  ).catch(() => null);
  if (!learner) return;

  const before = await db.one(
    `SELECT lg.can_receive_financial_information AS allowed FROM learner_guardians lg
     JOIN guardians g ON g.id = lg.guardian_id
     WHERE g.user_id = $1 AND lg.learner_id = $2 LIMIT 1`, [session.user.id, learner.id]
  );
  await db.query(
    `UPDATE learner_guardians SET can_receive_financial_information = false
     WHERE learner_id = $1 AND guardian_id = (SELECT id FROM guardians WHERE user_id = $2 LIMIT 1)`,
    [learner.id, session.user.id]
  );
  try {
    const overview = await parent.get('/parent/overview');
    assert.equal(overview.status, 200);
    const child = overview.data.children.find((row) => row.id === learner.id);
    if (child) {
      assert.equal(child.canViewFinance, false);
      assert.equal(child.outstandingBalance, null);
    }
  } finally {
    if (before) {
      await db.query(
        `UPDATE learner_guardians SET can_receive_financial_information = $1
         WHERE learner_id = $2 AND guardian_id = (SELECT id FROM guardians WHERE user_id = $3 LIMIT 1)`,
        [before.allowed, learner.id, session.user.id]
      );
    }
  }
});
