'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');
const payfast = require('../services/payfast-service');
const { createInvoiceIntent, createStatementIntent, outstandingFor, isPayable, guardianForInvoice } = require('../services/payment-intent-service');
const crypto = require('crypto');
const { has, guardianLearnerIds, guardianForLearner, today, dateOnly, roundMoney } = require('./helpers');
const { progressFor } = require('./assessments');

function generatePin() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashPin(organisationId, pin) {
  return crypto.createHash('sha256').update(organisationId + '::collection-pin::' + pin).digest('hex');
}

async function childOrFail(ctx, learnerId) {
  const ids = await guardianLearnerIds(ctx, learnerId);
  if (!ids.length) throw new AppError('NOT_FOUND');
  const learner = await ctx.db.one('SELECT * FROM learners WHERE id = $1 AND organisation_id = $2',
    [learnerId, ctx.organisationId]);
  if (!learner) throw new AppError('NOT_FOUND');
  const link = await guardianForLearner(ctx, learnerId);
  return { learner, link };
}

function register(router) {
  // --- Read receipts ---------------------------------------------------------
  // Parents opening a report or observation stamps it read; teachers see the
  // engagement on their side. The stamp fires once per record, best-effort.

  router.post('/parent/reports/:id/read', async (ctx) => {
    const report = await ctx.db.one('SELECT * FROM daily_reports WHERE id = $1 AND organisation_id = $2 AND shared_with_guardians = true',
      [ctx.params.id, ctx.organisationId]);
    if (!report) throw new AppError('NOT_FOUND');
    await childOrFail(ctx, report.learner_id);
    const updated = await ctx.db.one(
      `UPDATE daily_reports SET parent_viewed_at = COALESCE(parent_viewed_at, now()) WHERE id = $1 RETURNING parent_viewed_at`,
      [report.id]
    );
    return { parentViewedAt: updated.parent_viewed_at };
  }, { permission: 'parent.read.own' });

  router.post('/parent/observations/:id/read', async (ctx) => {
    const observation = await ctx.db.one(
      `SELECT * FROM learner_observations WHERE id = $1 AND organisation_id = $2
       AND assessment_status IN ('published','amended')`,
      [ctx.params.id, ctx.organisationId]
    );
    if (!observation) throw new AppError('NOT_FOUND');
    await childOrFail(ctx, observation.learner_id);
    const updated = await ctx.db.one(
      `UPDATE learner_observations SET parent_viewed_at = COALESCE(parent_viewed_at, now()) WHERE id = $1 RETURNING parent_viewed_at`,
      [observation.id]
    );
    return { parentViewedAt: updated.parent_viewed_at };
  }, { permission: 'parent.read.own' });

  // --- Who may collect this child -------------------------------------------
  // Guardians add, review, revoke and re-PIN their child’s collectors.
  // A collector with a photo is approved automatically; without one, the
  // centre verifies first. Nothing is added without a guardian asking.

  router.get('/parent/children/:id/collectors', async (ctx) => {
    const { learner } = await childOrFail(ctx, ctx.params.id);
    return ctx.db.many(
      `SELECT id, name, relationship, contact_phone, photo_url, identity_verification_policy AS policy,
              is_trusted, status, approval_status, approved_by, approved_at,
              pin_created_at, collector_type, vehicle_description, licence_plate, created_at
       FROM authorised_collectors
       WHERE learner_id = $1 AND organisation_id = $2 AND status <> 'revoked'
       ORDER BY approval_status DESC, is_trusted DESC, name`,
      [learner.id, ctx.organisationId]
    );
  }, { permission: 'parent.read.own' });

  router.post('/parent/children/:id/collectors', async (ctx) => {
    const { learner, link } = await childOrFail(ctx, ctx.params.id);
    if (!link || link.can_collect === false) throw new AppError('FORBIDDEN', null, 'You are not allowed to add collectors for this child.');
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 200 },
      relationship: { type: 'string', min: 2, max: 80 },
      contactPhone: { type: 'string', max: 50, optional: true },
      policy: { type: 'string', enum: ['photo_id', 'qr_code', 'pin', 'code_word'], optional: true },
      photoUrl: { type: 'string', regex: /^https?:\/\//i, max: 1000, optional: true },
      notes: { type: 'string', max: 500, optional: true },
      collectorType: { type: 'string', enum: ['family', 'driver', 'taxi'], optional: true },
      vehicleDescription: { type: 'string', max: 200, optional: true },
      licencePlate: { type: 'string', max: 30, optional: true },
      pin: { type: 'string', min: 4, max: 12, optional: true }
    });
    // The house policy, held firmly: a photo means the centre trusts you
    // automatically; a PIN means the parent has delegated gate access to this
    // person directly (transport drivers); anything else waits for the centre.
    const policy = body.policy || (body.photoUrl ? 'photo_id' : (body.pin ? 'pin' : 'code_word'));
    const autoApprove = Boolean(body.photoUrl) || Boolean(body.pin);
    const row = await ctx.db.one(
      `INSERT INTO authorised_collectors (organisation_id, learner_id, name, relationship, contact_phone,
        identity_verification_policy, photo_url, status, approval_status, approved_by, approved_at, created_by,
        collector_type, vehicle_description, licence_plate, pin_hash, pin_created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [ctx.organisationId, learner.id, body.name.trim(), body.relationship.trim(), body.contactPhone || null,
        policy, body.photoUrl || null, 'active', autoApprove ? 'approved' : 'pending',
        autoApprove ? new Date() : null, ctx.user.id,
        body.collectorType || 'family', body.vehicleDescription || null, body.licencePlate || null,
        body.pin ? hashPin(ctx.organisationId, body.pin) : null, body.pin ? new Date() : null]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'parent.collector_added', resourceType: 'authorised_collector', resourceId: row.id,
      metadata: { child: learner.first_name, autoApproved: autoApprove }
    });
    ctx.status = 201;
    return row;
  }, { permission: 'parent.read.own' });

  router.delete('/parent/children/:id/collectors/:collectorId', async (ctx) => {
    const { learner } = await childOrFail(ctx, ctx.params.id);
    const collector = await ctx.db.one(
      `SELECT * FROM authorised_collectors WHERE id = $1 AND learner_id = $2 AND organisation_id = $3 AND status <> 'revoked'`,
      [ctx.params.collectorId, learner.id, ctx.organisationId]
    );
    if (!collector) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      `UPDATE authorised_collectors SET status = 'revoked' WHERE id = $1`, [collector.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'parent.collector_revoked', resourceType: 'authorised_collector', resourceId: collector.id,
      metadata: { collector: collector.name, child: learner.first_name }
    });
    return { revoked: true };
  }, { permission: 'parent.read.own' });

  router.post('/parent/children/:id/collectors/:collectorId/pin', async (ctx) => {
    const { learner } = await childOrFail(ctx, ctx.params.id);
    const collector = await ctx.db.one(
      `SELECT * FROM authorised_collectors WHERE id = $1 AND learner_id = $2 AND organisation_id = $3 AND status = 'active'`,
      [ctx.params.collectorId, learner.id, ctx.organisationId]
    );
    if (!collector) throw new AppError('NOT_FOUND');
    const pin = generatePin();
    await ctx.db.query(
      `UPDATE authorised_collectors SET pin_hash = $1, pin_created_at = now() WHERE id = $2`,
      [hashPin(ctx.organisationId, pin), collector.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'parent.collector_pin_regenerated', resourceType: 'authorised_collector', resourceId: collector.id,
      metadata: { collector: collector.name, child: learner.first_name }
    });
    // Shown once, never stored in the clear. Share it the way you share the house key.
    return { pin, note: 'This code works once per collection, until you generate a new one. Tell only your collectors.' };
  }, { permission: 'parent.read.own' });

  // --- Approvals at the gate --------------------------------------------------
  router.get('/parent/collection-approvals', async (ctx) => {
    const ids = await guardianLearnerIds(ctx);
    if (!ids.length) return { approvals: [] };
    const rows = await ctx.db.many(
      `SELECT r.id, r.learner_id, r.collector_name, r.status, r.reason, r.created_at,
              l.first_name AS child_first_name, ac.photo_url AS collector_photo_url, ac.name AS collector_full_name,
              ac.relationship AS collector_relationship
       FROM learner_collection_requests r
       JOIN learners l ON l.id = r.learner_id
       LEFT JOIN authorised_collectors ac ON ac.id = r.collector_id
       WHERE r.organisation_id = $1 AND r.learner_id = ANY($2::uuid[]) AND r.status = 'pending'
       ORDER BY r.created_at DESC`,
      [ctx.organisationId, ids]
    );
    return { approvals: rows };
  }, { permission: 'parent.read.own' });

  router.post('/parent/collection-approvals/:id/respond', async (ctx) => {
    const body = validate(ctx.body, { decision: { type: 'string', enum: ['approved', 'declined'] } });
    const row = await ctx.db.one(
      `SELECT r.*, l.first_name AS child_first_name
       FROM learner_collection_requests r
       JOIN learners l ON l.id = r.learner_id
       WHERE r.id = $1 AND r.organisation_id = $2 AND r.status = 'pending'`,
      [ctx.params.id, ctx.organisationId]
    );
    if (!row) throw new AppError('NOT_FOUND');
    await childOrFail(ctx, row.learner_id);
    const updated = await ctx.db.one(
      `UPDATE learner_collection_requests
       SET status = $1, resolved_by = $2, resolved_at = now(), resolution_note = NULL, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [body.decision, ctx.user.id, row.id]
    );
    if (row.requested_by) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: [row.requested_by], type: 'collection_response',
        title: 'Gate answer: ' + (body.decision === 'approved' ? 'approved' : 'declined'),
        body: row.child_first_name + ' can ' + (body.decision === 'approved' ? 'go with' : 'NOT go with') + ' ' + row.collector_name + '.' + (body.decision === 'approved' ? ' Record the release now.' : ' The child stays.'),
        resourceType: 'learner_collection_request', resourceId: row.id, url: '/app/collection-gate',
        organisationId: ctx.organisationId
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: 'parent.collection_' + body.decision, resourceType: 'learner_collection_request', resourceId: row.id,
      metadata: { collector: row.collector_name, child: row.child_first_name }
    });
    return { id: updated.id, status: updated.status };
  }, { permission: 'parent.read.own' });

  // --- Collection history, where it belongs: with the daily record ----------
  router.get('/parent/children/:id/collections', async (ctx) => {
    const { learner } = await childOrFail(ctx, ctx.params.id);
    // The QR gate writes gate_scans; the pre-QR flow wrote
    // learner_collection_events. Both are custody records — show both.
    const rows = await ctx.db.many(
      `SELECT * FROM (
        SELECT g.id, 'collection'::text AS event_type, g.released_at AS recorded_at,
               g.collector_name, 'gate_qr'::text AS verification_method,
               FALSE AS late, FALSE AS overridden, NULL::text AS override_reason,
               NULL::text AS collector_photo_url, FALSE AS signature_captured, NULL::text AS denial_reason,
               ac.relationship AS collector_relationship, ac.photo_url AS collector_profile_photo,
               u.display_name AS verified_by_name
        FROM gate_scans g
        LEFT JOIN authorised_collectors ac ON ac.id = g.collector_id
        LEFT JOIN users u ON u.id = g.released_by
        WHERE g.learner_id = $1 AND g.released_at IS NOT NULL
        UNION ALL
        SELECT ce.id, ce.event_type, ce.recorded_at, ce.collector_name, ce.verification_method,
               ce.late, ce.override_by IS NOT NULL AS overridden, ce.override_reason,
               ce.collector_photo_url, ce.signature_captured, ce.denial_reason,
               ac.relationship AS collector_relationship, ac.photo_url AS collector_profile_photo,
               u.display_name AS verified_by_name
        FROM learner_collection_events ce
        LEFT JOIN authorised_collectors ac ON ac.id = ce.collector_id
        LEFT JOIN users u ON u.id = ce.verified_by
        WHERE ce.learner_id = $1
      ) t
      ORDER BY t.recorded_at DESC NULLS LAST LIMIT 60`,
      [learner.id]
    );
    // Flag gate releases after the centre's late-pickup cutoff.
    const settingsRow = await ctx.db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [ctx.organisationId]).catch(() => null);
    const cutoff = String((settingsRow && settingsRow.settings && settingsRow.settings['collection.lateCutoff']) || '17:30');
    const match = /^([0-9]+):([0-9]{2})$/.exec(cutoff);
    if (match) {
      const cutoffMin = Number(match[1]) * 60 + Number(match[2]);
      for (const row of rows) {
        if (row.verification_method !== 'gate_qr' || !row.recorded_at) continue;
        try {
          const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Johannesburg' }).formatToParts(new Date(row.recorded_at));
          const hh = Number((parts.find((p) => p.type === 'hour') || {}).value);
          const mm = Number((parts.find((p) => p.type === 'minute') || {}).value);
          if (hh * 60 + mm >= cutoffMin) row.late = true;
        } catch { /* leave as false */ }
      }
    }
    return rows;
  }, { permission: 'parent.read.own' });

  router.post('/parent/visit', async (ctx) => {
    const body = ctx.body || {};
    const source = String(body.source || '').trim() || null;
    const todayIso = new Date().toISOString().slice(0, 10);
    const rows = await ctx.db.many(
      `SELECT id, COALESCE(activation, '{}'::jsonb) AS activation
       FROM memberships WHERE user_id = $1 AND organisation_id = $2 AND status = 'active'`,
      [ctx.user.id, ctx.organisationId]
    );
    for (const row of rows) {
      const activation = row.activation || {};
      const dates = Array.isArray(activation.visitDates) ? activation.visitDates : [];
      const next = [...new Set([...dates.map(String), todayIso])].slice(-60);
      const patch = { visitDates: next, visitCount: next.length, lastVisitAt: new Date().toISOString() };
      await ctx.db.query(
        `UPDATE memberships
         SET activation = COALESCE(activation, '{}'::jsonb) || $1::jsonb,
             digest_opened_at = CASE WHEN $2 = 'weekly-digest' THEN now() ELSE digest_opened_at END
         WHERE id = $3`,
        [JSON.stringify(patch), source, row.id]
      );
    }
    return { ok: true };
  }, { permission: 'parent.read.own' });

  router.get('/parent/reactions', async (ctx) => {
    const ids = await guardianLearnerIds(ctx);
    if (!ids.length) return { mine: {}, counts: {} };
    const rows = await ctx.db.many(
      `SELECT r.resource_type, r.resource_id,
              COUNT(*)::int AS total,
              COUNT(CASE WHEN r.reaction = 'heart' THEN 1 END)::int AS heart,
              COUNT(CASE WHEN r.reaction = 'thumb' THEN 1 END)::int AS thumb,
              COUNT(CASE WHEN r.reaction = 'more' THEN 1 END)::int AS more,
              MAX(CASE WHEN r.guardian_user_id = $3 THEN r.reaction END) AS mine
       FROM guardian_reactions r
       WHERE r.organisation_id = $1 AND r.learner_id = ANY($2::uuid[])
       GROUP BY r.resource_type, r.resource_id`,
      [ctx.organisationId, ids, ctx.user.id]
    );
    const counts = {};
    const mine = {};
    for (const row of rows) {
      const key = row.resource_type + ':' + row.resource_id;
      counts[key] = { heart: row.heart, thumb: row.thumb, more: row.more, total: row.total };
      if (row.mine) mine[key] = row.mine;
    }
    return { mine, counts };
  }, { permission: 'parent.read.own' });

  router.post('/parent/reactions', async (ctx) => {
    const body = validate(ctx.body, {
      resourceType: { type: 'string', enum: ['observation', 'daily_report'] },
      resourceId: { type: 'string', uuid: true },
      reaction: { type: 'string', enum: ['heart', 'thumb', 'more'] }
    });
    let resource = null;
    if (body.resourceType === 'observation') {
      resource = await ctx.db.one(
        `SELECT id, learner_id, recorded_by, observation_date AS shared_at
         FROM learner_observations
         WHERE id = $1 AND organisation_id = $2 AND assessment_status IN ('published','amended')`,
        [body.resourceId, ctx.organisationId]);
    } else {
      resource = await ctx.db.one(
        `SELECT id, learner_id, recorded_by, report_date AS shared_at
         FROM daily_reports
         WHERE id = $1 AND organisation_id = $2 AND shared_with_guardians = true`,
        [body.resourceId, ctx.organisationId]);
    }
    if (!resource) throw new AppError('NOT_FOUND');
    await childOrFail(ctx, resource.learner_id);
    const existing = await ctx.db.one(
      'SELECT id, reaction FROM guardian_reactions WHERE resource_type = $1 AND resource_id = $2 AND guardian_user_id = $3',
      [body.resourceType, body.resourceId, ctx.user.id]);
    if (existing) {
      if (existing.reaction === body.reaction) {
        await ctx.db.query('DELETE FROM guardian_reactions WHERE id = $1', [existing.id]);
        return { reacted: false, reaction: body.reaction };
      }
      await ctx.db.query('DELETE FROM guardian_reactions WHERE id = $1', [existing.id]);
      await ctx.db.query(
        `INSERT INTO guardian_reactions (organisation_id, resource_type, resource_id, guardian_user_id, learner_id, reaction)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [ctx.organisationId, body.resourceType, body.resourceId, ctx.user.id, resource.learner_id, body.reaction]);
      return { reacted: true, reaction: body.reaction };
    }
    await ctx.db.query(
      `INSERT INTO guardian_reactions (organisation_id, resource_type, resource_id, guardian_user_id, learner_id, reaction)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ctx.organisationId, body.resourceType, body.resourceId, ctx.user.id, resource.learner_id, body.reaction]);
    const learner = await ctx.db.one('SELECT first_name FROM learners WHERE id = $1', [resource.learner_id]);
    const guardian = await ctx.db.one('SELECT display_name FROM users WHERE id = $1', [ctx.user.id]);
    const guardianFirst = String((guardian && guardian.display_name) || 'A parent').split(' ')[0];
    const childFirst = learner.first_name;
    if (resource.recorded_by && resource.recorded_by !== ctx.user.id) {
      const sharedDate = resource.shared_at
        ? new Date(resource.shared_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })
        : 'this week';
      const verb = { heart: 'loved', thumb: 'gave a thumbs-up to', more: 'wants to know more about' }[body.reaction];
      await createNotification(ctx.db, ctx, {
        recipientUserIds: [resource.recorded_by], type: 'guardian_reaction',
        title: guardianFirst + ' ' + verb + ' ' + childFirst + '’s moment',
        body: body.reaction === 'more'
          ? guardianFirst + ' asked to know more about the ' + (body.resourceType === 'observation' ? 'observation' : 'daily report') + ' from ' + sharedDate + ' — one short reply goes a long way.'
          : guardianFirst + ' was moved by your update for ' + childFirst + ' from ' + sharedDate + '.',
        resourceType: body.resourceType === 'observation' ? 'learner_observation' : 'daily_report',
        resourceId: resource.id, url: '/app/overview'
      });
    }
    return { reacted: true, reaction: body.reaction };
  }, { permission: 'parent.read.own' });

  router.get('/parent/overview', async (ctx) => {
    const ids = await guardianLearnerIds(ctx);
    const children = [];
    for (const id of ids) {
      const learner = await ctx.db.one('SELECT * FROM learners WHERE id = $1 AND organisation_id = $2',
        [id, ctx.organisationId]);
      if (!learner) continue;
      const classroom = learner.classroom_id
        ? await ctx.db.one('SELECT id, name FROM classrooms WHERE id = $1', [learner.classroom_id])
        : null;
      const attendance = await ctx.db.one(
        `SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = CURRENT_DATE`, [learner.id]
      );
      const balance = await ctx.db.one(
        `SELECT COALESCE(SUM(total_amount - amount_paid),0)::float AS outstanding FROM invoices
         WHERE learner_id = $1 AND status IN ('issued','partially_paid','overdue')`, [learner.id]
      );
      const latestObservation = await ctx.db.one(
        `SELECT observation_date, context FROM learner_observations WHERE learner_id = $1
         AND assessment_status = 'published' ORDER BY observation_date DESC LIMIT 1`, [learner.id]
      );
      children.push({
        id: learner.id, firstName: learner.first_name, lastName: learner.last_name,
        preferredName: learner.preferred_name, dateOfBirth: learner.date_of_birth,
        status: learner.status, classroom, attendanceToday: attendance || null,
        outstandingBalance: roundMoney(balance.outstanding),
        latestObservation
      });
    }
    const announcements = await ctx.db.many(
      `SELECT id, title, body, attachment_urls, published_at FROM announcements
       WHERE organisation_id = $1 AND status = 'published'
         AND audience_type IN ('all','parents','guardians')
       ORDER BY published_at DESC LIMIT 5`, [ctx.organisationId]
    );
    const unread = await ctx.db.one(
      'SELECT COUNT(*)::int AS total FROM notifications WHERE recipient_user_id = $1 AND read_at IS NULL',
      [ctx.user.id]
    );
    const forms = await ctx.db.many(
      `SELECT id, name, description FROM form_definitions
       WHERE organisation_id = $1 AND status = 'published' ORDER BY name`, [ctx.organisationId]
    );
    return { children, announcements, unread: unread.total, forms };
  }, { permission: 'parent.read.own' });

  router.get('/parent/children', async (ctx) => {
    const ids = await guardianLearnerIds(ctx);
    const children = [];
    for (const id of ids) {
      const learner = await ctx.db.one('SELECT * FROM learners WHERE id = $1 AND organisation_id = $2',
        [id, ctx.organisationId]);
      if (!learner) continue;
      const link = await guardianForLearner(ctx, id);
      children.push({
        id: learner.id, firstName: learner.first_name, lastName: learner.last_name,
        learnerReference: learner.learner_reference, dateOfBirth: learner.date_of_birth,
        classroomId: learner.classroom_id, status: learner.status,
        relationship: link ? link.relationship_type : null,
        canReceiveReports: link ? link.can_receive_reports : false
      });
    }
    return children;
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id', async (ctx) => {
    const { learner, link } = await childOrFail(ctx, ctx.params.id);
    const classroom = learner.classroom_id
      ? await ctx.db.one('SELECT * FROM classrooms WHERE id = $1', [learner.classroom_id])
      : null;
    const branch = await ctx.db.one('SELECT id, name, address, contact_email, contact_phone FROM branches WHERE id = $1',
      [learner.branch_id]);
    const attendance = await ctx.db.many(
      `SELECT attendance_date, attendance_status, check_in_at, check_out_at, absence_reason
       FROM learner_attendance WHERE learner_id = $1 ORDER BY attendance_date DESC LIMIT 14`, [learner.id]
    );
    const reports = link && link.can_receive_reports
      ? await ctx.db.many(
        `SELECT * FROM daily_reports WHERE learner_id = $1 AND shared_with_guardians = true
         ORDER BY report_date DESC LIMIT 10`, [learner.id]
      )
      : [];
    const balance = await ctx.db.one(
      `SELECT COALESCE(SUM(total_amount - amount_paid),0)::float AS outstanding FROM invoices
       WHERE learner_id = $1 AND status IN ('issued','partially_paid','overdue')`, [learner.id]
    );
    const medical = await ctx.db.many(
      `SELECT id, record_type, details, visibility_level, effective_from, effective_until
       FROM learner_medical_records WHERE learner_id = $1 AND visibility_level IN ('staff','medical')
       ORDER BY created_at DESC`, [learner.id]
    );
    return {
      learner: {
        id: learner.id, firstName: learner.first_name, lastName: learner.last_name,
        preferredName: learner.preferred_name, dateOfBirth: learner.date_of_birth,
        learnerReference: learner.learner_reference, status: learner.status,
        enrolmentDate: learner.enrolment_date
      },
      relationship: link ? {
        type: link.relationship_type, canCollect: link.can_collect,
        canReceiveReports: link.can_receive_reports,
        canReceiveFinancialInformation: link.can_receive_financial_information
      } : null,
      classroom, branch, attendance, dailyReports: reports,
      outstandingBalance: roundMoney(balance.outstanding),
      medical
    };
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/attendance', async (ctx) => {
    const { learner } = await childOrFail(ctx, ctx.params.id);
    const from = ctx.query.from || new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const to = ctx.query.to || today();
    const rows = await ctx.db.many(
      `SELECT attendance_date, attendance_status, check_in_at, check_out_at, absence_reason,
              brought_by_name, brought_by_unverified
       FROM learner_attendance WHERE learner_id = $1 AND attendance_date BETWEEN $2 AND $3
       ORDER BY attendance_date DESC`, [learner.id, from, to]
    );
    const present = rows.filter((r) => ['present', 'late', 'collected'].includes(r.attendance_status)).length;
    return {
      from, to, rows,
      summary: {
        marked: rows.length, present,
        absent: rows.filter((r) => r.attendance_status === 'absent').length,
        rate: rows.length ? Math.round((present / rows.length) * 100) : null
      }
    };
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/calendar', async (ctx) => {
    const { learner } = await childOrFail(ctx, ctx.params.id);
    const from = dateOnly(ctx.query.from);
    const to = dateOnly(ctx.query.to);
    if (!from || !to) fail('VALIDATION', [{ field: 'from', message: 'Provide a from and to date.' }]);
    if (to < from) fail('VALIDATION', [{ field: 'to', message: 'The end date must be after the start date.' }]);
    const rows = await ctx.db.many(
      `SELECT sa.id, sa.title, sa.starts_at, sa.ends_at, sa.status, sa.classroom_id,
              a.title AS activity_title, lp.title AS lesson_plan_title,
              ap.participation_status
       FROM scheduled_activities sa
       LEFT JOIN activities a ON a.id = sa.activity_id
       LEFT JOIN lesson_plans lp ON lp.id = sa.lesson_plan_id
       LEFT JOIN activity_participation ap ON ap.scheduled_activity_id = sa.id AND ap.learner_id = $4
       WHERE sa.organisation_id = $1 AND sa.starts_at >= $2::timestamptz AND sa.starts_at < ($3::date + 1)
         AND (sa.classroom_id = $5 OR ($5::uuid IS NULL AND sa.branch_id = $6))
       ORDER BY sa.starts_at`,
      [ctx.organisationId, `${from}T00:00:00Z`, to, learner.id, learner.classroom_id, learner.branch_id]
    );
    return rows;
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/progress', async (ctx) => {
    const { learner, link } = await childOrFail(ctx, ctx.params.id);
    if (!link || !link.can_receive_reports) throw new AppError('FORBIDDEN', null, 'You are not authorised to receive progress reports.');
    return progressFor(ctx, learner);
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/daily-reports', async (ctx) => {
    const { learner, link } = await childOrFail(ctx, ctx.params.id);
    if (!link || !link.can_receive_reports) throw new AppError('FORBIDDEN');
    return ctx.db.many(
      `SELECT * FROM daily_reports WHERE learner_id = $1 AND shared_with_guardians = true
       ORDER BY report_date DESC LIMIT 60`, [learner.id]
    );
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/portfolio', async (ctx) => {
    const { learner } = await childOrFail(ctx, ctx.params.id);
    return ctx.db.many(
      `SELECT id, title, description, media_type, media_url, storage_key, created_at FROM learner_portfolio_items
       WHERE learner_id = $1 AND sharing_status IN ('guardians','public')
       ORDER BY created_at DESC`, [learner.id]
    );
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/assessments', async (ctx) => {
    const { learner, link } = await childOrFail(ctx, ctx.params.id);
    if (!link || !link.can_receive_reports) throw new AppError('FORBIDDEN');
    return ctx.db.many(
      `SELECT la.id, la.summary, la.published_at, d.name AS domain_name, ap.name AS period_name
       FROM learner_assessments la
       LEFT JOIN curriculum_domains d ON d.id = la.domain_id
       LEFT JOIN assessment_periods ap ON ap.id = la.assessment_period_id
       WHERE la.learner_id = $1 AND la.assessment_status = 'published'
       ORDER BY la.published_at DESC`, [learner.id]
    );
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/invoices', async (ctx) => {
    const { learner, link } = await childOrFail(ctx, ctx.params.id);
    if (!link || !link.can_receive_financial_information) throw new AppError('FORBIDDEN');
    const invoices = await ctx.db.many(
      `SELECT id, invoice_number, status, total_amount, amount_paid, due_at, issued_at, description
       FROM invoices WHERE learner_id = $1 AND status NOT IN ('draft','void')
       ORDER BY created_at DESC`, [learner.id]
    );
    return invoices.map((invoice) => ({
      ...invoice,
      outstanding: roundMoney(Number(invoice.total_amount) - Number(invoice.amount_paid))
    }));
  }, { permission: 'parent.finance.read.own' });

  router.get('/parent/invoices/:id', async (ctx) => {
    const invoice = await ctx.db.one(
      `SELECT i.* FROM invoices i JOIN learner_guardians lg ON lg.learner_id = i.learner_id
       JOIN guardians g ON g.id = lg.guardian_id
       WHERE i.id = $1 AND i.organisation_id = $2 AND g.user_id = $3
         AND lg.can_receive_financial_information = true`,
      [ctx.params.id, ctx.organisationId, ctx.user.id]
    );
    if (!invoice) throw new AppError('NOT_FOUND');
    const items = await ctx.db.many('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoice.id]);
    const payments = await ctx.db.many(
      `SELECT p.amount, p.payment_method, p.received_at, p.status, pa.allocated_amount
       FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
       WHERE pa.invoice_id = $1 ORDER BY p.received_at`, [invoice.id]
    );
    return { ...invoice, items, payments, outstanding: roundMoney(Number(invoice.total_amount) - Number(invoice.amount_paid)),
      organisation: { name: ctx.organisation.name, logoUrl: ctx.organisation.logo_url } };
  }, { permission: 'parent.finance.read.own' });

  router.post('/parent/invoices/:id/pay', async (ctx) => {
    if (!payfast.isConfigured()) {
      fail('CONFLICT', null, 'Online card payments are not available yet. Please pay by EFT and use the reference on your invoice.');
    }
    const invoice = await ctx.db.one(
      `SELECT i.* FROM invoices i JOIN learner_guardians lg ON lg.learner_id = i.learner_id
       JOIN guardians g ON g.id = lg.guardian_id
       WHERE i.id = $1 AND i.organisation_id = $2 AND g.user_id = $3
         AND lg.can_receive_financial_information = true`,
      [ctx.params.id, ctx.organisationId, ctx.user.id]
    );
    if (!invoice) throw new AppError('NOT_FOUND');
    if (!isPayable(invoice)) fail('CONFLICT', null, 'This invoice is not open for payment.');
    const body = validate(ctx.body || {}, { amount: { type: 'number', min: 0.01, optional: true } });
    const outstanding = outstandingFor(invoice);
    const amount = body.amount ? roundMoney(Math.min(Number(body.amount), outstanding)) : outstanding;
    if (amount <= 0) fail('CONFLICT', null, 'There is nothing left to pay on this invoice.');

    const guardian = await guardianForInvoice(ctx.db, invoice);

    const { intent, checkout } = await createInvoiceIntent(ctx.db, {
      organisation: ctx.organisation,
      invoice,
      guardian,
      amount,
      createdBy: ctx.user.id,
      req: ctx.req,
      scope: 'parent',
      itemName: 'School fees — ' + invoice.invoice_number
    });

    await recordAudit(ctx.db, ctx, {
      action: 'finance.payment_link_created', resourceType: 'invoice', resourceId: invoice.id,
      metadata: { intentId: intent.id, amount, reference: intent.reference, channel: 'parent' }
    });
    return { intent, checkout };
  }, { permission: 'parent.finance.read.own' });

  /**
   * Pay every open invoice in one hosted checkout. Parents with several
   * outstanding invoices settle the lot with a single card payment, and the
   * ITN spreads it across the invoices oldest-first.
   */
  router.post('/parent/finance/statement/pay', async (ctx) => {
    if (!payfast.isConfigured()) {
      fail('CONFLICT', null, 'Online card payments are not available yet. Please pay by EFT and use the reference on your invoice.');
    }
    const guardian = await ctx.db.one(
      'SELECT * FROM guardians WHERE user_id = $1 AND organisation_id = $2 ORDER BY created_at LIMIT 1',
      [ctx.user.id, ctx.organisationId]
    );
    if (!guardian) throw new AppError('NOT_FOUND');
    const ids = await guardianLearnerIds(ctx);
    if (!ids.length) fail('CONFLICT', null, 'There are no children linked to your account.');
    const invoices = await ctx.db.many(
      `SELECT * FROM invoices WHERE organisation_id = $1 AND learner_id = ANY($2::uuid[])
         AND status IN ('issued','partially_paid','overdue')
       ORDER BY COALESCE(due_at, CURRENT_DATE), created_at`,
      [ctx.organisationId, ids]
    );
    const payable = invoices.filter(isPayable);
    if (!payable.length) fail('CONFLICT', null, 'You have no open invoices to pay.');

    const { intent, checkout } = await createStatementIntent(ctx.db, {
      organisation: ctx.organisation,
      guardian,
      invoices: payable,
      createdBy: ctx.user.id,
      req: ctx.req,
      scope: 'parent'
    });

    await recordAudit(ctx.db, ctx, {
      action: 'finance.statement_link_created', resourceType: 'guardian', resourceId: guardian.id,
      metadata: { intentId: intent.id, amount: Number(intent.amount), invoiceCount: payable.length, reference: intent.reference, channel: 'parent' }
    });
    return { intent, checkout, amount: Number(intent.amount), invoiceCount: payable.length };
  }, { permission: 'parent.finance.read.own' });

  router.get('/parent/finance/summary', async (ctx) => {
    const ids = await guardianLearnerIds(ctx);
    const invoices = [];
    for (const id of ids) {
      const rows = await ctx.db.many(
        `SELECT i.id, i.invoice_number, i.status, i.total_amount, i.amount_paid, i.due_at, i.issued_at,
          l.first_name, l.last_name
         FROM invoices i JOIN learners l ON l.id = i.learner_id
         WHERE i.learner_id = $1 AND i.status NOT IN ('draft','void')
         ORDER BY i.created_at DESC`, [id]
      );
      invoices.push(...rows);
    }
    const outstanding = roundMoney(invoices.reduce((sum, i) => sum + Number(i.total_amount) - Number(i.amount_paid), 0));
    return { invoices, outstanding };
  }, { permission: 'parent.finance.read.own' });

  router.post('/parent/absence', async (ctx) => {
    const body = validate(ctx.body, {
      childIds: { type: 'array', of: 'uuid', max: 20 },
      date: { type: 'string', date: true, optional: true },
      reason: { type: 'string', min: 3, max: 1000 }
    });
    const date = body.date || today();
    if (date < today()) fail('VALIDATION', [{ field: 'date', message: 'Report an absence for today or a future date.' }]);
    const childIds = [...new Set(body.childIds)];
    const linked = await ctx.db.many(
      `SELECT l.* FROM learners l
       JOIN learner_guardians lg ON lg.learner_id = l.id AND lg.organisation_id = $1
       JOIN guardians g ON g.id = lg.guardian_id AND g.organisation_id = $1
       WHERE g.user_id = $2 AND lg.portal_access_status = 'active'
         AND (lg.ends_at IS NULL OR lg.ends_at >= CURRENT_DATE)
         AND l.id = ANY($3::uuid[])`,
      [ctx.organisationId, ctx.user.id, childIds]
    );
    const validIds = new Set(linked.map((child) => child.id));
    if (validIds.size !== childIds.length) {
      fail('FORBIDDEN', null, 'One or more children are not linked to your account.');
    }
    const records = [];
    for (const child of linked) {
      const existing = await ctx.db.one(
        'SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = $2', [child.id, date]
      );
      if (existing && existing.check_in_at) fail('CONFLICT', null, child.first_name + ' is already checked in for that date.');
      let record;
      if (existing) {
        await ctx.db.query(
          `UPDATE learner_attendance SET attendance_status = 'excused', absence_reason = $1, recorded_by = $2,
            updated_at = now() WHERE id = $3`, [body.reason, ctx.user.id, existing.id]
        );
        record = await ctx.db.one('SELECT * FROM learner_attendance WHERE id = $1', [existing.id]);
      } else {
        record = await ctx.db.one(
          `INSERT INTO learner_attendance (organisation_id, branch_id, learner_id, attendance_date, attendance_status,
            absence_reason, recorded_by) VALUES ($1,$2,$3,$4,'excused',$5,$6) RETURNING *`,
          [ctx.organisationId, child.branch_id, child.id, date, body.reason, ctx.user.id]
        );
      }
      records.push(record);
    }
    const staff = await ctx.db.many(
      `SELECT DISTINCT m.user_id FROM memberships m
       JOIN membership_roles mr ON mr.membership_id = m.id
       JOIN roles r ON r.id = mr.role_id
       WHERE m.organisation_id = $1 AND m.status = 'active'
         AND r.role_key IN ('teacher','assistant_teacher','principal','daycare_administrator','daycare_manager')`,
      [ctx.organisationId]
    );
    if (staff.length && records.length) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: staff.map((s) => s.user_id), type: 'absence_reported',
        title: 'Absence reported',
        body: `${records.length} child${records.length === 1 ? '' : 'ren'} will be absent on ${date}.${records.length === 1 ? ' ' + linked[0].first_name + ' ' + linked[0].last_name + ': ' + body.reason : ' Reason: ' + body.reason}`,
        resourceType: 'learner_attendance', resourceId: records[0].id
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: 'parent.absence_reported', resourceType: 'learner_attendance', resourceId: records[0].id,
      metadata: { date, childIds }
    });
    ctx.status = 201;
    return { created: records.length, records };
  }, { permission: 'parent.absence.report.own' });

  router.post('/parent/children/:id/absence', async (ctx) => {
    const { learner } = await childOrFail(ctx, ctx.params.id);
    const body = validate(ctx.body, {
      date: { type: 'string', date: true, optional: true },
      reason: { type: 'string', min: 3, max: 1000 }
    });
    const date = body.date || today();
    if (date < today()) fail('VALIDATION', [{ field: 'date', message: 'Report an absence for today or a future date.' }]);
    const existing = await ctx.db.one(
      'SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = $2', [learner.id, date]
    );
    if (existing && existing.check_in_at) fail('CONFLICT', null, 'This learner is already checked in for that date.');
    let record;
    if (existing) {
      await ctx.db.query(
        `UPDATE learner_attendance SET attendance_status = 'excused', absence_reason = $1, recorded_by = $2,
          updated_at = now() WHERE id = $3`, [body.reason, ctx.user.id, existing.id]
      );
      record = await ctx.db.one('SELECT * FROM learner_attendance WHERE id = $1', [existing.id]);
    } else {
      record = await ctx.db.one(
        `INSERT INTO learner_attendance (organisation_id, branch_id, learner_id, attendance_date, attendance_status,
          absence_reason, recorded_by) VALUES ($1,$2,$3,$4,'excused',$5,$6) RETURNING *`,
        [ctx.organisationId, learner.branch_id, learner.id, date, body.reason, ctx.user.id]
      );
    }
    const staff = await ctx.db.many(
      `SELECT DISTINCT m.user_id FROM memberships m
       JOIN membership_roles mr ON mr.membership_id = m.id
       JOIN roles r ON r.id = mr.role_id
       WHERE m.organisation_id = $1 AND m.status = 'active'
         AND r.role_key IN ('teacher','assistant_teacher','principal','daycare_administrator','daycare_manager')`,
      [ctx.organisationId]
    );
    if (staff.length) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: staff.map((s) => s.user_id), type: 'absence_reported',
        title: 'Absence reported',
        body: `${learner.first_name} ${learner.last_name} will be absent on ${date}: ${body.reason}`,
        resourceType: 'learner_attendance', resourceId: record.id
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: 'parent.absence_reported', resourceType: 'learner_attendance', resourceId: record.id,
      metadata: { date }
    });
    ctx.status = 201;
    return record;
  }, { permission: 'parent.absence.report.own' });

  router.get('/parent/forms', async (ctx) => {
    return ctx.db.many(
      `SELECT f.id, f.name, f.description, f.form_type, v.schema_json FROM form_definitions f
       JOIN form_versions v ON v.id = f.current_version_id
       WHERE f.organisation_id = $1 AND f.status = 'published' ORDER BY f.name`, [ctx.organisationId]
    );
  }, { permission: 'parent.forms.submit.own' });

  router.get('/parent/announcements', async (ctx) => {
    return ctx.db.many(
      `SELECT id, title, body, attachment_urls, published_at FROM announcements
       WHERE organisation_id = $1 AND status = 'published' AND audience_type IN ('all','parents','guardians')
       ORDER BY published_at DESC LIMIT 50`, [ctx.organisationId]
    );
  }, { permission: 'parent.read.own' });

  router.get('/parent/consents', async (ctx) => {
    const ids = await guardianLearnerIds(ctx);
    const records = [];
    for (const id of ids) {
      const rows = await ctx.db.many(
        `SELECT c.*, l.first_name, l.last_name FROM consent_records c
         JOIN learners l ON l.id = c.learner_id WHERE c.learner_id = $1 ORDER BY c.created_at DESC`, [id]
      );
      records.push(...rows);
    }
    return records;
  }, { permission: 'parent.read.own' });
}

module.exports = { register };
