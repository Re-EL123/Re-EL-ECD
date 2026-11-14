'use strict';

/**
 * The Gate — one QR, one scan, one tap.
 *
 * The centre shows its gate QR on a tablet at the entrance. A collector
 * scans it with their phone, types their name + PIN (set by the parent),
 * picks which child they're collecting, and taps "I'm here". The centre's
 * gate screen shows a live verified list. Staff taps "Release" and the
 * child goes home.
 *
 * No verification methods to pick. No PIN for guardians to forget. One
 * phone-scan, one confirmation, one match of names. That's safety.
 */

const crypto = require('crypto');
const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');

function hashPin(orgId, pin) {
  return crypto.createHash('sha256').update(orgId + '::collection-pin::' + String(pin).trim().toLowerCase()).digest('hex');
}
function verifyPin(orgId, pin, hash) {
  if (!hash) return false;
  return crypto.timingSafeEqual(Buffer.from(hashPin(orgId, pin), 'hex'), Buffer.from(hash, 'hex'));
}

function register(router) {
  router.get('/gate/:slug/brand', async (ctx) => {
    const org = await ctx.db.one("SELECT id, name FROM organisations WHERE slug = $1 AND status = 'active'", [ctx.params.slug]);
    return { name: org ? org.name : null };
  }, { public: true });

  // ---------- Public (no session) ----------

  // Find an approved collector by name + PIN. Returns their cleared children.
  router.post('/gate/:slug/signin', async (ctx) => {
    const org = await ctx.db.one("SELECT id, name FROM organisations WHERE slug = $1 AND status = 'active'", [ctx.params.slug]);
    if (!org) throw new AppError('NOT_FOUND', null, 'This gate QR belongs to a centre that is not active.');
    const body = validate(ctx.body, { name: { type: 'string', min: 2, max: 200 }, pin: { type: 'string', min: 4, max: 12 } });
    const collectors = await ctx.db.many(
      `SELECT id, name, relationship, photo_url, vehicle_description, vehicle_make_model, licence_plate, pin_hash, learner_id
       FROM authorised_collectors
       WHERE organisation_id = $1 AND status = 'active' AND approval_status = 'approved'
         AND (lower(name) = lower($2) OR lower(split_part(name, ' ', 1)) = lower($2))`,
      [org.id, body.name.trim()]
    );
    const pinHash = (c) => c.pin_hash;
    const match = collectors.find((c) => verifyPin(org.id, body.pin, pinHash(c)));
    if (!match) {
      // Intentionally vague — never reveal which part was wrong.
      throw new AppError('UNAUTHENTICATED', null, 'That name or PIN does not match anyone cleared for this centre.');
    }
    const children = await ctx.db.many(
      `SELECT l.id, l.first_name, l.last_name, l.learner_reference, c.name AS classroom_name
       FROM learners l
       LEFT JOIN classrooms c ON c.id = l.classroom_id
       JOIN learner_guardians lg ON lg.learner_id = l.id AND lg.organisation_id = $1 AND lg.portal_access_status = 'active'
       JOIN guardians g ON g.id = lg.guardian_id
       WHERE g.user_id = $2 OR TRUE`,
      [org.id, match.created_by]
    );
    // Simpler: collect children linked to this collector's learner/guardian.
    // For now: all cleared collectors are tied to specific children via learner_collection_requests
    // or authorised_collectors (learner_id). Use that.
    const linked = await ctx.db.many(
      `SELECT l.id, l.first_name, l.last_name, l.learner_reference, c.name AS classroom_name
       FROM learners l
       LEFT JOIN classrooms c ON c.id = l.classroom_id
       WHERE l.organisation_id = $1 AND l.id IN (
         SELECT learner_id FROM authorised_collectors WHERE id = $2 AND status = 'active'
       )`, [org.id, match.id]
    );
    // If the collector is directly attached to a child, show that child; otherwise show all children their guardian(s) can see.
    let out = match.learner_id
      ? linked
      : await ctx.db.many(
          `SELECT l.id, l.first_name, l.last_name, l.learner_reference, c.name AS classroom_name
           FROM learners l
           LEFT JOIN classrooms c ON c.id = l.classroom_id
           JOIN learner_guardians lg ON lg.learner_id = l.id AND lg.organisation_id = $1 AND lg.portal_access_status = 'active'
           JOIN guardians g ON g.id = lg.guardian_id
           WHERE g.user_id = (
             SELECT created_by FROM authorised_collectors WHERE id = $2
           ) AND l.status = 'enrolled'
           ORDER BY l.first_name`, [org.id, match.id]
        );
    return {
      organisationName: org.name,
      collector: { id: match.id, name: match.name, relationship: match.relationship, type: match.collector_type },
      children: out
    };
  }, { public: true });

  // Confirm a pickup: records the scan + gate attendance.
  router.post('/gate/:slug/collect', async (ctx) => {
    const org = await ctx.db.one("SELECT id, name FROM organisations WHERE slug = $1 AND status = 'active'", [ctx.params.slug]);
    if (!org) throw new AppError('NOT_FOUND', null, 'This gate QR belongs to a centre that is not active.');
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 200 },
      pin: { type: 'string', min: 4, max: 12 },
      learnerId: { type: 'string', uuid: true }
    });
    const collectors = await ctx.db.many(
      `SELECT id, name, relationship, vehicle_description, vehicle_make_model, licence_plate, pin_hash, collector_type, learner_id
       FROM authorised_collectors
       WHERE organisation_id = $1 AND status = 'active' AND approval_status = 'approved'
         AND (lower(name) = lower($2) OR lower(split_part(name, ' ', 1)) = lower($2))`,
      [org.id, body.name.trim()]
    );
    const match = collectors.find((c) => verifyPin(org.id, body.pin, c.pin_hash));
    if (!match) throw new AppError('UNAUTHENTICATED', null, 'That name or PIN is not on the cleared list for this centre.');
    const learner = await ctx.db.one('SELECT id, first_name, branch_id FROM learners WHERE id = $1 AND organisation_id = $2', [body.learnerId, org.id]);
    if (!learner) throw new AppError('NOT_FOUND');
    const existing = await ctx.db.one(
      'SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = CURRENT_DATE', [learner.id]
    );
    if (!existing || !existing.check_in_at || existing.check_out_at) {
      fail('CONFLICT', null, 'The child is not currently signed in at this centre.');
    }
    const attendance = await ctx.db.one(
      `INSERT INTO gate_scans (organisation_id, branch_id, collector_id, collector_name, collector_type, learner_id, confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING *`,
      [org.id, learner.branch_id, match.id, match.name, match.collector_type || 'family', learner.id]
    );
    // Mark attendance collected
    await ctx.db.query(
      `UPDATE learner_attendance SET attendance_status = 'collected', check_out_at = now(), updated_at = now() WHERE id = $1`,
      [existing.id]
    );
    // Notification for guardians
    const guardians = await ctx.db.many(
      `SELECT DISTINCT g.user_id, g.first_name, g.email
       FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
       WHERE lg.learner_id = $1 AND lg.organisation_id = $2 AND lg.portal_access_status = 'active' AND g.user_id IS NOT NULL`,
      [learner.id, org.id]
    );
    if (guardians.length) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: guardians.map((g) => g.user_id),
        type: 'collection',
        title: match.name + ' collected ' + learner.first_name,
        body: match.vehicle_description ? (match.name + ' is here with the vehicle: ' + match.vehicle_description) : (match.name + ' signed in at the gate.'),
        url: '/parent/attendance',
        organisationId: org.id
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: 'gate.collection_confirmed', resourceType: 'learner', resourceId: learner.id,
      metadata: { collector: match.name, collectorType: match.collector_type, gateScanId: attendance.id }
    });
    return { released: true, childName: learner.first_name, collectorName: match.name, time: new Date().toISOString() };
  }, { public: true });

  // ---------- Private (staff authenticated) ----------

  // Live view of the gate: who scanned, who hasn't left yet.
  router.get('/gate/scans', async (ctx) => {
    await ctx.db.query('UPDATE gate_scans SET released_at = NULL WHERE released_at IS NULL AND confirmed_at < now() - interval \'12 hours\'');
    const today = new Date().toISOString().slice(0, 10);
    const pending = await ctx.db.many(
      `SELECT gs.id, gs.learner_id, gs.collector_name, gs.collector_type, gs.confirmed_at,
              l.first_name, l.last_name, l.learner_reference, c.name AS classroom_name
       FROM gate_scans gs
       JOIN learners l ON l.id = gs.learner_id
       LEFT JOIN classrooms c ON c.id = l.classroom_id
       WHERE gs.organisation_id = $1 AND gs.released_at IS NULL
       ORDER BY gs.confirmed_at DESC`,
      [ctx.organisationId]
    );
    return { pending };
  }, { permission: 'collections.record.daycare' });

  // Staff confirms release.
  router.post('/gate/scans/:id/release', async (ctx) => {
    const scan = await ctx.db.one(
      `SELECT gs.*, l.first_name, (SELECT u.display_name FROM users u WHERE u.id = gs.released_by) AS released_by_name
       FROM gate_scans gs JOIN learners l ON l.id = gs.learner_id
       WHERE gs.id = $1 AND gs.organisation_id = $2`,
      [ctx.params.id, ctx.organisationId]
    );
    if (!scan) throw new AppError('NOT_FOUND');
    if (scan.released_at) fail('CONFLICT', null, 'This child has already left.');
    await ctx.db.query(
      `UPDATE gate_scans SET released_at = now(), released_by = $1 WHERE id = $2`,
      [ctx.user.id, scan.id]
    );
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
        title: scan.learner_id && scan.first_name ? scan.first_name + ' is on their way home' : 'Your child has left',
        body: scan.collector_name + ' released them at the gate.',
        url: '/parent/attendance',
        organisationId: ctx.organisationId
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: 'gate.release_confirmed', resourceType: 'gate_scan', resourceId: scan.id,
      branchId: scan.branch_id, metadata: { child: scan.first_name, collector: scan.collector_name }
    });
    return { released: true };
  }, { permission: 'collections.record.daycare' });
}
module.exports = { register };
