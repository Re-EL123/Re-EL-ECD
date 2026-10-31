'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');
const { sendTemplate } = require('../services/email-service');
const { parsePagination } = require('../utils/http');
const bulk = require('../services/bulk-service');
const { has } = require('./helpers');

const STATUS_FLOW = {
  reported: ['reviewed', 'closed'],
  reviewed: ['action_assigned', 'follow_up', 'closed'],
  action_assigned: ['follow_up', 'closed'],
  follow_up: ['closed', 'action_assigned'],
  closed: []
};

function register(router) {
  router.get('/safety/overview', async (ctx) => {
    const counts = await ctx.db.one(
      `SELECT COUNT(*)::int AS total,
        COUNT(CASE WHEN status <> 'closed' THEN 1 END)::int AS open,
        COUNT(CASE WHEN severity = 'critical' AND status <> 'closed' THEN 1 END)::int AS critical_open,
        COUNT(CASE WHEN guardian_notified_at IS NULL AND status <> 'closed' THEN 1 END)::int AS awaiting_notification
       FROM incidents WHERE organisation_id = $1`, [ctx.organisationId]
    );
    const byType = await ctx.db.many(
      `SELECT incident_type, COUNT(*)::int AS total FROM incidents
       WHERE organisation_id = $1 GROUP BY incident_type ORDER BY total DESC`, [ctx.organisationId]
    );
    const bySeverity = await ctx.db.many(
      `SELECT severity, COUNT(*)::int AS total FROM incidents
       WHERE organisation_id = $1 AND status <> 'closed' GROUP BY severity`, [ctx.organisationId]
    );
    const openActions = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM incident_actions ia
       JOIN incidents i ON i.id = ia.incident_id
       WHERE i.organisation_id = $1 AND ia.status IN ('open','in_progress')`, [ctx.organisationId]
    );
    const recent = await ctx.db.many(
      `SELECT i.*, u.display_name AS reported_by_name FROM incidents i
       LEFT JOIN users u ON u.id = i.reported_by
       WHERE i.organisation_id = $1 ORDER BY i.occurred_at DESC LIMIT 10`, [ctx.organisationId]
    );
    const documents = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM staff_documents sd
       WHERE sd.organisation_id = $1 AND sd.expires_at IS NOT NULL AND sd.expires_at <= CURRENT_DATE + 30`,
      [ctx.organisationId]
    );
    return {
      incidents: counts, byType, bySeverity,
      openActions: openActions.total,
      expiringStaffDocuments: documents.total,
      recent
    };
  }, { permission: 'safety.read.daycare' });

  router.get('/incidents', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const status = ctx.query.status || null;
    const severity = ctx.query.severity || null;
    const branchId = ctx.query.branchId || null;
    const from = ctx.query.from || null;
    const to = ctx.query.to || null;
    const conditions = [
      'i.organisation_id = $1',
      '($2::text IS NULL OR i.status = $2)',
      '($3::text IS NULL OR i.severity = $3)',
      '($4::uuid IS NULL OR i.branch_id = $4::uuid)',
      '($5::date IS NULL OR i.occurred_at::date >= $5::date)',
      '($6::date IS NULL OR i.occurred_at::date <= $6::date)'
    ];
    const params = [ctx.organisationId, status, severity, branchId, from, to];
    const where = conditions.join(' AND ');
    const total = await ctx.db.one(`SELECT COUNT(*)::int AS total FROM incidents i WHERE ${where}`, params);
    const rows = await ctx.db.many(
      `SELECT i.*, b.name AS branch_name, u.display_name AS reported_by_name,
        (SELECT COUNT(*)::int FROM incident_actions ia WHERE ia.incident_id = i.id AND ia.status IN ('open','in_progress')) AS open_actions
       FROM incidents i
       LEFT JOIN branches b ON b.id = i.branch_id
       LEFT JOIN users u ON u.id = i.reported_by
       WHERE ${where}
       ORDER BY i.occurred_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    return rows;
  }, { permission: 'safety.read.daycare' });

  router.post('/incidents', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true },
      incidentType: { type: 'string', min: 2, max: 80 },
      occurredAt: { type: 'string', datetime: true, optional: true },
      locationDescription: { type: 'string', max: 200, optional: true },
      description: { type: 'string', min: 10, max: 8000 },
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      restricted: { type: 'boolean', optional: true },
      learnerIds: { type: 'array', of: 'uuid', max: 50, optional: true },
      staffIds: { type: 'array', of: 'uuid', max: 50, optional: true },
      attachmentUrls: { type: 'array', of: 'string', max: 20, optional: true },
      actions: { type: 'array', max: 20, optional: true }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) fail('VALIDATION', [{ field: 'branchId', message: 'Unknown branch.' }]);
    const result = await ctx.db.withTransaction(async (client) => {
      const incident = (await client.query(
        `INSERT INTO incidents (organisation_id, branch_id, incident_type, occurred_at, location_description, description,
          severity, restricted, attachment_urls, reported_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [ctx.organisationId, body.branchId, body.incidentType, body.occurredAt || new Date().toISOString(),
          body.locationDescription || null, body.description, body.severity, body.restricted === true,
          JSON.stringify(body.attachmentUrls || []), ctx.user.id]
      )).rows[0];
      for (const learnerId of body.learnerIds || []) {
        const learner = (await client.query('SELECT id FROM learners WHERE id = $1 AND organisation_id = $2',
          [learnerId, ctx.organisationId])).rows[0];
        if (!learner) continue;
        await client.query(
          `INSERT INTO incident_participants (incident_id, participant_type, participant_id, involvement_type)
           VALUES ($1,'learner',$2,'involved')`, [incident.id, learnerId]
        );
      }
      for (const staffId of body.staffIds || []) {
        const staff = (await client.query('SELECT id FROM staff_profiles WHERE id = $1 AND organisation_id = $2',
          [staffId, ctx.organisationId])).rows[0];
        if (!staff) continue;
        await client.query(
          `INSERT INTO incident_participants (incident_id, participant_type, participant_id, involvement_type)
           VALUES ($1,'staff',$2,'involved')`, [incident.id, staffId]
        );
      }
      for (const raw of body.actions || []) {
        const action = validate(raw, {
          description: { type: 'string', min: 3, max: 2000 },
          assignedTo: { type: 'string', uuid: true, optional: true },
          dueAt: { type: 'string', date: true, optional: true }
        });
        await client.query(
          `INSERT INTO incident_actions (incident_id, action_description, assigned_to, due_at)
           VALUES ($1,$2,$3,$4)`,
          [incident.id, action.description, action.assignedTo || null, action.dueAt || null]
        );
      }
      return incident;
    });
    if (['high', 'critical'].includes(body.severity)) {
      const leaders = await ctx.db.many(
        `SELECT DISTINCT m.user_id, u.email FROM memberships m
         JOIN users u ON u.id = m.user_id
         JOIN membership_roles mr ON mr.membership_id = m.id
         JOIN roles r ON r.id = mr.role_id
         WHERE m.organisation_id = $1 AND m.status = 'active'
           AND r.role_key IN ('principal','daycare_administrator','daycare_manager','organisation_owner')`,
        [ctx.organisationId]
      );
      if (leaders.length) {
        await createNotification(ctx.db, ctx, {
          recipientUserIds: leaders.map((l) => l.user_id), type: 'incident_high_severity',
          title: `${body.severity === 'critical' ? 'Critical' : 'High severity'} incident reported`,
          body: body.description.slice(0, 300),
          resourceType: 'incident', resourceId: result.id
        });
      }
      const firstLearner = (body.learnerIds || []).length
        ? await ctx.db.one('SELECT first_name, last_name FROM learners WHERE id = $1 AND organisation_id = $2',
          [body.learnerIds[0], ctx.organisationId])
        : null;
      for (const leader of leaders) {
        await sendTemplate(ctx.db, 'incidentAlert', {
          to: leader.email,
          organisationId: ctx.organisationId,
          metadata: { incidentId: result.id, severity: body.severity },
          data: {
            learnerName: firstLearner ? `${firstLearner.first_name} ${firstLearner.last_name}` : 'Multiple children',
            severity: body.severity,
            summary: body.description.slice(0, 500),
            reportedBy: ctx.user.display_name,
            occurredAt: new Date(body.occurredAt || Date.now()).toLocaleString('en-ZA')
          }
        });
      }
    }
    await recordAudit(ctx.db, ctx, {
      action: 'safety.incident_reported', resourceType: 'incident', resourceId: result.id,
      branchId: body.branchId, metadata: { severity: body.severity, type: body.incidentType }
    });
    ctx.status = 201;
    return result;
  }, { permission: ['safety.report.daycare', 'safety.manage.daycare'], permissionMode: 'any' });

  router.get('/incidents/:id', async (ctx) => {
    const incident = await ctx.db.one('SELECT * FROM incidents WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!incident) throw new AppError('NOT_FOUND');
    const participants = await ctx.db.many(
      'SELECT * FROM incident_participants WHERE incident_id = $1', [incident.id]
    );
    for (const participant of participants) {
      if (participant.participant_type === 'learner') {
        participant.learner = await ctx.db.one(
          'SELECT id, first_name, last_name FROM learners WHERE id = $1', [participant.participant_id]
        );
      } else if (participant.participant_type === 'staff') {
        participant.staff = await ctx.db.one(
          `SELECT sp.id, sp.job_title, u.display_name FROM staff_profiles sp
           LEFT JOIN users u ON u.id = sp.user_id WHERE sp.id = $1`, [participant.participant_id]
        );
      }
    }
    const actions = await ctx.db.many(
      `SELECT ia.*, u.display_name AS assigned_to_name FROM incident_actions ia
       LEFT JOIN users u ON u.id = ia.assigned_to WHERE ia.incident_id = $1 ORDER BY ia.created_at`,
      [incident.id]
    );
    const reportedBy = incident.reported_by
      ? await ctx.db.one('SELECT id, display_name, email FROM users WHERE id = $1', [incident.reported_by])
      : null;
    const reviewedBy = incident.reviewed_by
      ? await ctx.db.one('SELECT id, display_name FROM users WHERE id = $1', [incident.reviewed_by])
      : null;
    return { ...incident, participants, actions, reportedBy, reviewedBy };
  }, { permission: 'safety.read.daycare' });

  router.patch('/incidents/:id', async (ctx) => {
    const body = validate(ctx.body, {
      incidentType: { type: 'string', max: 80, optional: true },
      locationDescription: { type: 'string', max: 200, optional: true },
      description: { type: 'string', min: 10, max: 8000, optional: true },
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], optional: true },
      status: { type: 'string', enum: ['reported', 'reviewed', 'action_assigned', 'follow_up', 'closed'], optional: true },
      restricted: { type: 'boolean', optional: true },
      attachmentUrls: { type: 'array', of: 'string', max: 20, optional: true }
    });
    const incident = await ctx.db.one('SELECT * FROM incidents WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!incident) throw new AppError('NOT_FOUND');
    if (body.status && body.status !== incident.status) {
      if (!(STATUS_FLOW[incident.status] || []).includes(body.status)) {
        fail('CONFLICT', null, `An incident cannot move from ${incident.status} to ${body.status}.`);
      }
      if (body.status === 'closed') {
        const openActions = await ctx.db.one(
          `SELECT COUNT(*)::int AS total FROM incident_actions WHERE incident_id = $1 AND status IN ('open','in_progress')`,
          [incident.id]
        );
        if (openActions.total > 0) fail('CONFLICT', null, 'All corrective actions must be completed before closing the incident.');
      }
    }
    await ctx.db.query(
      `UPDATE incidents SET incident_type = COALESCE($1,incident_type),
        location_description = COALESCE($2,location_description), description = COALESCE($3,description),
        severity = COALESCE($4,severity), status = COALESCE($5,status), restricted = COALESCE($6,restricted),
        reviewed_by = CASE WHEN $5 = 'reviewed' THEN $7 ELSE reviewed_by END,
        closed_at = CASE WHEN $5 = 'closed' THEN now() ELSE closed_at END,
        attachment_urls = CASE WHEN $9::jsonb IS NULL THEN attachment_urls ELSE $9::jsonb END,
        updated_at = now() WHERE id = $8`,
      [body.incidentType || null, body.locationDescription || null, body.description || null,
        body.severity || null, body.status || null,
        body.restricted === undefined ? null : body.restricted, ctx.user.id, incident.id,
        body.attachmentUrls ? JSON.stringify(body.attachmentUrls) : null]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'safety.incident_updated', resourceType: 'incident', resourceId: incident.id,
      metadata: { status: body.status || null }
    });
    return ctx.db.one('SELECT * FROM incidents WHERE id = $1', [incident.id]);
  }, { permission: 'safety.manage.daycare' });

  router.post('/incidents/bulk', async (ctx) => {
    const body = bulk.parse(ctx.body, ['review', 'close']);
    const status = body.action === 'review' ? 'reviewed' : 'closed';
    return bulk.run(ctx, {
      ids: body.ids,
      action: body.action,
      resourceType: 'incident',
      auditAction: 'safety.incident_updated',
      handler: async (id) => {
        const incident = await ctx.db.one(
          'SELECT * FROM incidents WHERE id = $1 AND organisation_id = $2', [id, ctx.organisationId]
        );
        if (!incident) return { ok: false, reason: 'not found' };
        if (!(STATUS_FLOW[incident.status] || []).includes(status)) {
          return { ok: false, reason: `cannot move from ${incident.status} to ${status}` };
        }
        if (status === 'closed') {
          const openActions = await ctx.db.one(
            `SELECT COUNT(*)::int AS total FROM incident_actions WHERE incident_id = $1 AND status IN ('open','in_progress')`,
            [incident.id]
          );
          if (openActions.total > 0) return { ok: false, reason: 'open corrective actions' };
        }
        await ctx.db.query(
          `UPDATE incidents SET status = $1,
            reviewed_by = CASE WHEN $2 = 'reviewed' THEN $3 ELSE reviewed_by END,
            closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE closed_at END,
            updated_at = now() WHERE id = $4`,
          [status, status, ctx.user.id, incident.id]
        );
        return { ok: true, branchId: incident.branch_id, metadata: { status } };
      }
    });
  }, { permission: 'safety.manage.daycare' });

  router.post('/incidents/:id/actions', async (ctx) => {
    const body = validate(ctx.body, {
      description: { type: 'string', min: 3, max: 2000 },
      assignedTo: { type: 'string', uuid: true, optional: true },
      dueAt: { type: 'string', date: true, optional: true }
    });
    const incident = await ctx.db.one('SELECT * FROM incidents WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!incident) throw new AppError('NOT_FOUND');
    if (incident.status === 'closed') fail('CONFLICT', null, 'Closed incidents cannot receive new actions.');
    if (body.assignedTo) {
      const member = await ctx.db.one(
        "SELECT id FROM memberships WHERE user_id = $1 AND organisation_id = $2 AND status = 'active'",
        [body.assignedTo, ctx.organisationId]
      );
      if (!member) fail('VALIDATION', [{ field: 'assignedTo', message: 'The assignee must be an active organisation member.' }]);
    }
    const action = await ctx.db.one(
      `INSERT INTO incident_actions (incident_id, action_description, assigned_to, due_at) VALUES ($1,$2,$3,$4) RETURNING *`,
      [incident.id, body.description, body.assignedTo || null, body.dueAt || null]
    );
    if (body.assignedTo) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: [body.assignedTo], type: 'incident_action_assigned',
        title: 'Corrective action assigned', body: body.description.slice(0, 300),
        resourceType: 'incident', resourceId: incident.id
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: 'safety.incident_action_created', resourceType: 'incident_action', resourceId: action.id
    });
    ctx.status = 201;
    return action;
  }, { permission: 'safety.manage.daycare' });

  router.patch('/incident-actions/:id', async (ctx) => {
    const body = validate(ctx.body, {
      status: { type: 'string', enum: ['open', 'in_progress', 'done', 'cancelled'], optional: true },
      description: { type: 'string', min: 3, max: 2000, optional: true }
    });
    const action = await ctx.db.one(
      `SELECT ia.*, i.organisation_id FROM incident_actions ia JOIN incidents i ON i.id = ia.incident_id
       WHERE ia.id = $1 AND i.organisation_id = $2`, [ctx.params.id, ctx.organisationId]
    );
    if (!action) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      `UPDATE incident_actions SET status = COALESCE($1,status), action_description = COALESCE($2,action_description),
        completed_at = CASE WHEN $1 = 'done' THEN now() ELSE completed_at END WHERE id = $3`,
      [body.status || null, body.description || null, action.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'safety.incident_action_updated', resourceType: 'incident_action', resourceId: action.id,
      metadata: { status: body.status || null }
    });
    return ctx.db.one('SELECT * FROM incident_actions WHERE id = $1', [action.id]);
  }, { permission: 'safety.manage.daycare' });

  router.post('/incidents/:id/notify-guardians', async (ctx) => {
    const body = validate(ctx.body, { message: { type: 'string', max: 2000, optional: true } });
    const incident = await ctx.db.one('SELECT * FROM incidents WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!incident) throw new AppError('NOT_FOUND');
    const participants = await ctx.db.many(
      "SELECT participant_id FROM incident_participants WHERE incident_id = $1 AND participant_type = 'learner'",
      [incident.id]
    );
    const recipients = [];
    for (const participant of participants) {
      const guardians = await ctx.db.many(
        `SELECT g.user_id FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
         WHERE lg.learner_id = $1 AND g.user_id IS NOT NULL AND lg.can_receive_reports = true
           AND lg.portal_access_status = 'active'`,
        [participant.participant_id]
      );
      for (const guardian of guardians) if (!recipients.includes(guardian.user_id)) recipients.push(guardian.user_id);
    }
    if (!recipients.length) fail('CONFLICT', null, 'No guardian portal recipients are available for this incident.');
    await createNotification(ctx.db, ctx, {
      recipientUserIds: recipients, type: 'incident_notification',
      title: 'Incident notification',
      body: body.message || 'An incident involving your child has been recorded. Please contact the centre for details.',
      resourceType: 'incident', resourceId: incident.id
    });
    await ctx.db.query('UPDATE incidents SET guardian_notified_at = now() WHERE id = $1', [incident.id]);
    await recordAudit(ctx.db, ctx, {
      action: 'safety.guardians_notified', resourceType: 'incident', resourceId: incident.id,
      metadata: { recipients: recipients.length }
    });
    return { success: true, notified: recipients.length };
  }, { permission: 'safety.manage.daycare' });

  router.get('/safety/compliance', async (ctx) => {
    const expiringDocuments = await ctx.db.many(
      `SELECT sd.*, sp.job_title, u.display_name FROM staff_documents sd
       JOIN staff_profiles sp ON sp.id = sd.staff_id
       LEFT JOIN users u ON u.id = sp.user_id
       WHERE sd.organisation_id = $1 AND sd.expires_at IS NOT NULL AND sd.expires_at <= CURRENT_DATE + 60
       ORDER BY sd.expires_at`, [ctx.organisationId]
    );
    const trainingDue = await ctx.db.many(
      `SELECT st.*, sp.job_title, u.display_name FROM staff_training_records st
       JOIN staff_profiles sp ON sp.id = st.staff_id
       LEFT JOIN users u ON u.id = sp.user_id
       WHERE st.organisation_id = $1 AND st.expires_on IS NOT NULL AND st.expires_on <= CURRENT_DATE + 60
       ORDER BY st.expires_on`, [ctx.organisationId]
    );
    const unverified = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM staff_documents WHERE organisation_id = $1 AND verification_status = 'pending'`,
      [ctx.organisationId]
    );
    const openIncidents = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM incidents WHERE organisation_id = $1 AND status <> 'closed'`,
      [ctx.organisationId]
    );
    return {
      expiringDocuments, trainingDue, unverifiedDocuments: unverified.total, openIncidents: openIncidents.total,
      note: 'Expiry alerts cover the next 60 days. Verification remains a human decision recorded against each document.'
    };
  }, { permission: 'safety.read.daycare' });
}

module.exports = { register };
