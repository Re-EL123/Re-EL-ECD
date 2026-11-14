'use strict';

/**
 * The Gate — one QR, one scan, one tap.
 *
 * The centre prints one QR (Settings → Gate QR). A collector scans it with
 * their phone, types their name + PIN (set by the parent), and the page lists
 * only the children they are cleared for, with today's live state:
 *
 *  - "Arriving"  → drop-off: attendance flips to present instantly with the
 *                  verified bringer recorded. No staff action.
 *  - "Collecting" → records a verified arrival (gate_scans). The child is
 *                  NOT marked gone — staff still taps Release on the
 *                  attendance screen. That tap is the only thing that
 *                  flips the register to collected.
 *
 * Safety rails: a collector may only act on children linked to their
 * collector row; custody holds block collection at the scan and again at
 * release; public endpoints are rate-limited.
 */

const crypto = require('crypto');
const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');
const { rateLimit } = require('../middleware/rate-limit');

function hashPin(orgId, pin) {
  return crypto.createHash('sha256').update(orgId + '::collection-pin::' + String(pin).trim().toLowerCase()).digest('hex');
}
function verifyPin(orgId, pin, hash) {
  if (!hash) return false;
  return crypto.timingSafeEqual(Buffer.from(hashPin(orgId, pin), 'hex'), Buffer.from(hash, 'hex'));
}

async function loadGateOrg(db, slug) {
  const org = await db.one("SELECT id, name FROM organisations WHERE slug = $1 AND status = 'active'", [slug]);
  if (!org) throw new AppError('NOT_FOUND', null, 'This gate QR belongs to a centre that is not active.');
  return org;
}

// Name + PIN → every approved collector row that proves out. The same person
// may be registered once per child; one sign-in must reveal all of them.
async function authenticateCollector(db, org, body) {
  const rows = await db.many(
    `SELECT id, name, relationship, vehicle_description, vehicle_make_model, licence_plate,
            collector_type, learner_id, pin_hash, created_by
     FROM authorised_collectors
     WHERE organisation_id = $1 AND status = 'active' AND approval_status = 'approved'
       AND (lower(name) = lower($2) OR lower(split_part(name, ' ', 1)) = lower($2))`,
    [org.id, body.name.trim()]
  );
  const matched = rows.filter((c) => verifyPin(org.id, body.pin, c.pin_hash));
  if (!matched.length) {
    // Intentionally vague — never reveal which part was wrong.
    throw new AppError('UNAUTHENTICATED', null, 'That name or PIN does not match anyone cleared for this centre.');
  }
  await db.query(
    'UPDATE authorised_collectors SET pin_last_used_at = now() WHERE id = ANY($1::uuid[])',
    [matched.map((c) => c.id)]
  );
  return matched;
}

// The learners a matched collector may act on: the learners of every collector
// row that proved out with the same name + PIN.
function learnerIdsOf(matched) {
  return [...new Set(matched.map((c) => c.learner_id))];
}

async function childrenWithState(db, orgId, learnerIds) {
  return db.many(
    `SELECT l.id, l.first_name, l.last_name, l.learner_reference, c.name AS classroom_name,
            a.attendance_status, a.check_in_at, a.check_out_at,
            (l.collection_hold_reason IS NOT NULL) AS on_hold
     FROM learners l
     LEFT JOIN classrooms c ON c.id = l.classroom_id
     LEFT JOIN learner_attendance a ON a.learner_id = l.id AND a.attendance_date = CURRENT_DATE
     WHERE l.organisation_id = $1 AND l.status = 'enrolled' AND l.id = ANY($2::uuid[])
     ORDER BY l.first_name`, [orgId, learnerIds]
  );
}

async function assertLinkedLearner(db, org, matched, learnerId) {
  const learner = await db.one(
    `SELECT l.id, l.first_name, l.branch_id, l.status, l.collection_hold_reason
     FROM learners l WHERE l.id = $1 AND l.organisation_id = $2`, [learnerId, org.id]
  );
  if (!learner) throw new AppError('NOT_FOUND');
  if (!learnerIdsOf(matched).includes(learner.id)) {
    throw new AppError('FORBIDDEN', null, 'This child is not on your cleared list — ask their parent to add you for ' + learner.first_name + '.');
  }
  if (learner.status !== 'enrolled') fail('CONFLICT', null, 'This child is not enrolled.');
  return learner;
}

// Late pickup: after the centre's cutoff (Settings), say so on the release.
async function isLateNow(db, organisationId) {
  const row = await db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [organisationId]).catch(() => null);
  const cutoff = (row && row.settings && row.settings['collection.lateCutoff']) || '17:30';
  if (!/^[0-2]?[0-9]:[0-5][0-9]$/.test(String(cutoff))) return false;
  const [h, m] = String(cutoff).split(':').map(Number);
  let minutes;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' }).formatToParts(new Date());
    const hh = Number((parts.find((p) => p.type === 'hour') || {}).value);
    const mm = Number((parts.find((p) => p.type === 'minute') || {}).value);
    minutes = hh * 60 + mm;
  } catch {
    const d = new Date();
    minutes = d.getHours() * 60 + d.getMinutes();
  }
  return minutes >= h * 60 + m;
}

function register(router) {
  router.get('/gate/:slug/brand', async (ctx) => {
    const org = await ctx.db.one("SELECT id, name FROM organisations WHERE slug = $1 AND status = 'active'", [ctx.params.slug]);
    return { name: org ? org.name : null };
  }, { public: true });

  // ---------- Public (no session) ----------

  // Find an approved collector by name + PIN. Returns their cleared children
  // with today's live state so the phone shows only useful buttons.
  router.post('/gate/:slug/signin', async (ctx) => {
    const limit = rateLimit('gate-signin:' + ctx.ip, 15, 10 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const org = await loadGateOrg(ctx.db, ctx.params.slug);
    const body = validate(ctx.body, { name: { type: 'string', min: 2, max: 200 }, pin: { type: 'string', min: 4, max: 12 } });
    const matched = await authenticateCollector(ctx.db, org, body);
    const children = await childrenWithState(ctx.db, org.id, learnerIdsOf(matched));
    return {
      organisationName: org.name,
      collector: {
        name: matched[0].name,
        relationship: matched[0].relationship,
        type: matched[0].collector_type || 'family',
        vehicle: matched[0].vehicle_description || null
      },
      children
    };
  }, { public: true });

  // Drop-off: auto-register attendance present with the verified bringer.
  router.post('/gate/:slug/arrive', async (ctx) => {
    const limit = rateLimit('gate-arrive:' + ctx.ip, 20, 10 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const org = await loadGateOrg(ctx.db, ctx.params.slug);
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 200 },
      pin: { type: 'string', min: 4, max: 12 },
      learnerId: { type: 'string', uuid: true }
    });
    const matched = await authenticateCollector(ctx.db, org, body);
    const learner = await assertLinkedLearner(ctx.db, org, matched, body.learnerId);
    const collector = matched.find((c) => c.learner_id === learner.id) || matched[0];
    const existing = await ctx.db.one(
      'SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = CURRENT_DATE', [learner.id]
    );
    if (existing && existing.check_out_at) {
      fail('CONFLICT', null, learner.first_name + ' was already collected today.');
    }
    let wasAlreadyIn = false;
    if (existing && existing.check_in_at) {
      // Already signed in today — idempotent: fill in the verified bringer if
      // the record so far has none (e.g. "mark all present" beat them to it).
      wasAlreadyIn = true;
      await ctx.db.query(
        `UPDATE learner_attendance
         SET brought_by_collector_id = $1, brought_by_name = $2, brought_by_unverified = FALSE, updated_at = now()
         WHERE id = $3 AND (brought_by_unverified = TRUE OR brought_by_name IS NULL)`,
        [collector.id, collector.name, existing.id]
      );
    } else if (existing) {
      // A row exists but was never checked in (absent / excused / expected /
      // bulk "mark all present" with no time). Flip it to present in place —
      // the daily row is unique per learner, so never insert a second one.
      await ctx.db.query(
        `UPDATE learner_attendance
         SET check_in_at = now(), attendance_status = 'present', absence_reason = NULL,
             brought_by_collector_id = $1, brought_by_name = $2, brought_by_unverified = FALSE,
             recorded_by = $3, updated_at = now()
         WHERE id = $4`,
        [collector.id, collector.name, collector.created_by, existing.id]
      );
    } else {
      await ctx.db.query(
        `INSERT INTO learner_attendance (organisation_id, branch_id, learner_id, attendance_date, check_in_at,
          attendance_status, recorded_by, brought_by_collector_id, brought_by_name, brought_by_unverified)
         VALUES ($1,$2,$3,CURRENT_DATE,now(),'present',$4,$5,$6,FALSE)`,
        [org.id, learner.branch_id, learner.id, collector.created_by, collector.id, collector.name]
      );
    }
    await recordAudit(ctx.db, ctx, {
      action: 'gate.drop_off', resourceType: 'learner', resourceId: learner.id,
      metadata: { bringer: collector.name, collectorId: collector.id, wasAlreadyIn }
    });
    return { checkedIn: true, childName: learner.first_name, wasAlreadyIn };
  }, { public: true });

  // Collection: record the verified arrival only. The register stays "present"
  // until a staff member taps Release — an accidental morning tap cannot send
  // a child home on paper.
  router.post('/gate/:slug/collect', async (ctx) => {
    const limit = rateLimit('gate-collect:' + ctx.ip, 20, 10 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const org = await loadGateOrg(ctx.db, ctx.params.slug);
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 200 },
      pin: { type: 'string', min: 4, max: 12 },
      learnerId: { type: 'string', uuid: true }
    });
    const matched = await authenticateCollector(ctx.db, org, body);
    const learner = await assertLinkedLearner(ctx.db, org, matched, body.learnerId);
    const collector = matched.find((c) => c.learner_id === learner.id) || matched[0];
    if (learner.collection_hold_reason) {
      fail('CONFLICT', null, 'The centre has placed a hold on ' + learner.first_name + '’s collection. Please speak to reception.');
    }
    const attendance = await ctx.db.one(
      'SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = CURRENT_DATE', [learner.id]
    );
    if (!attendance || !attendance.check_in_at) {
      fail('CONFLICT', null, learner.first_name + ' is not signed in yet — tap Arriving at drop-off first.');
    }
    if (attendance.check_out_at) {
      fail('CONFLICT', null, learner.first_name + ' has already gone home today.');
    }
    // One pending scan per child: tapping Collecting twice changes nothing.
    const dupe = await ctx.db.one(
      `SELECT id FROM gate_scans WHERE learner_id = $1 AND released_at IS NULL AND confirmed_at::date = CURRENT_DATE
       ORDER BY confirmed_at DESC LIMIT 1`, [learner.id]
    );
    if (dupe) {
      return { scanId: dupe.id, childName: learner.first_name, waitingRelease: true, alreadyWaiting: true };
    }
    const scan = await ctx.db.one(
      `INSERT INTO gate_scans (organisation_id, branch_id, collector_id, collector_name, collector_type, learner_id, confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING id`,
      [org.id, learner.branch_id, collector.id, collector.name, collector.collector_type || 'family', learner.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'gate.collection_scan', resourceType: 'learner', resourceId: learner.id,
      metadata: { collector: collector.name, collectorType: collector.collector_type, gateScanId: scan.id }
    });
    return { scanId: scan.id, childName: learner.first_name, waitingRelease: true, alreadyWaiting: false };
  }, { public: true });

  // ---------- Private (staff authenticated) ----------

  // Live view of the gate: verified arrivals waiting for release today.
  router.get('/gate/scans', async (ctx) => {
    const pending = await ctx.db.many(
      `SELECT gs.id, gs.learner_id, gs.collector_name, gs.collector_type, gs.confirmed_at,
              l.first_name, l.last_name, l.learner_reference,
              (l.collection_hold_reason IS NOT NULL) AS on_hold,
              c.name AS classroom_name,
              a.attendance_status, a.check_out_at
       FROM gate_scans gs
       JOIN learners l ON l.id = gs.learner_id
       LEFT JOIN classrooms c ON c.id = l.classroom_id
       LEFT JOIN learner_attendance a ON a.learner_id = gs.learner_id AND a.attendance_date = CURRENT_DATE
       WHERE gs.organisation_id = $1 AND gs.released_at IS NULL AND gs.confirmed_at::date = CURRENT_DATE
       ORDER BY gs.confirmed_at DESC`,
      [ctx.organisationId]
    );
    return { pending };
  }, { permission: 'collections.record.daycare' });

  // Staff confirms release — the only path that flips the register to
  // collected. Custody holds and already-gone children are blocked here too,
  // because hours may pass between the scan and the release.
  router.post('/gate/scans/:id/release', async (ctx) => {
    const scan = await ctx.db.one(
      `SELECT gs.*, l.first_name, l.collection_hold_reason
       FROM gate_scans gs JOIN learners l ON l.id = gs.learner_id
       WHERE gs.id = $1 AND gs.organisation_id = $2`,
      [ctx.params.id, ctx.organisationId]
    );
    if (!scan) throw new AppError('NOT_FOUND');
    if (scan.released_at) fail('CONFLICT', null, 'This arrival was already released.');
    if (scan.collection_hold_reason) {
      fail('CONFLICT', null, 'A custody hold is on this child — collection is blocked until management clears it.');
    }
    const attendance = await ctx.db.one(
      'SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = CURRENT_DATE', [scan.learner_id]
    );
    if (!attendance || !attendance.check_in_at) {
      fail('CONFLICT', null, scan.first_name + ' is not signed in today — check the register first.');
    }
    if (attendance.check_out_at) {
      fail('CONFLICT', null, scan.first_name + ' has already been collected today.');
    }
    const late = await isLateNow(ctx.db, ctx.organisationId);
    await ctx.db.withTransaction(async (client) => {
      await client.query(
        'UPDATE gate_scans SET released_at = now(), released_by = $1 WHERE id = $2',
        [ctx.user.id, scan.id]
      );
      await client.query(
        `UPDATE learner_attendance SET attendance_status = 'collected', check_out_at = now(), updated_at = now()
         WHERE id = $1`,
        [attendance.id]
      );
    });
    const guardians = await ctx.db.many(
      `SELECT DISTINCT g.user_id, g.first_name
       FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
       WHERE lg.learner_id = $1 AND lg.organisation_id = $2 AND lg.portal_access_status = 'active' AND g.user_id IS NOT NULL`,
      [scan.learner_id, ctx.organisationId]
    );
    if (guardians.length) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: guardians.map((g) => g.user_id),
        type: 'collection',
        title: scan.first_name + ' is on the way home',
        body: scan.collector_name + ' signed at the gate and staff released ' + scan.first_name + '.' + (late ? ' Pickup was after the centre’s cutoff today.' : ''),
        url: '/parent/attendance',
        organisationId: ctx.organisationId
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: 'gate.release_confirmed', resourceType: 'gate_scan', resourceId: scan.id,
      branchId: scan.branch_id,
      metadata: { child: scan.first_name, collector: scan.collector_name, late }
    });
    return { released: true, childName: scan.first_name, late };
  }, { permission: 'collections.record.daycare' });
}
module.exports = { register };
