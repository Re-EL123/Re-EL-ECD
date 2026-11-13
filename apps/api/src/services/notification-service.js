'use strict';

const { isConfigured } = require('./email-service');
const push = require('./push-service');

const PUSH_URLS = {
  observation_published: '/parent/progress',
  daily_report_shared: '/parent/activities',
  announcement: '/app/communications',
  task_assigned: '/app/tasks',
  plan_review_due: '/app/curriculum',
  observation_due: '/app/assessments',
  observation_comment: '/app/assessments',
  absence_reported: '/app/learner-attendance',
  consent_needed: '/parent/forms',
  general: '/app/communications'
};

async function createNotification(db, ctx, { recipientUserIds, type = 'general', title, body = '', resourceType = null, resourceId = null, organisationId = null }) {
  const created = [];
  for (const recipientUserId of recipientUserIds) {
    const row = (await db.query(
      `INSERT INTO notifications (organisation_id, recipient_user_id, notification_type, title, body,
        related_resource_type, related_resource_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [organisationId || (ctx ? ctx.organisationId : null), recipientUserId, type, title, body, resourceType, resourceId]
    )).rows[0];
    created.push(row);
    await db.query(
      `INSERT INTO notification_deliveries (notification_id, channel, delivery_status, attempt_count, last_attempt_at)
       VALUES ($1,'in_app','delivered',1,now())`,
      [row.id]
    );
    // In-app delivery is immediate. Transactional email is sent explicitly by
    // the domain module and recorded in `email_deliveries`; this row keeps the
    // notification fan-out auditable without pretending a worker exists.
    await db.query(
      `INSERT INTO notification_deliveries (notification_id, channel, delivery_status, attempt_count)
       VALUES ($1,'email',$2,0)`,
      [row.id, isConfigured() ? 'queued' : 'skipped']
    );
  }
  if (created.length) {
    const notificationIds = {};
    for (const row of created) notificationIds[row.recipient_user_id] = row.id;
    push.notifyUsers(db, ctx, created.map((row) => row.recipient_user_id), {
      type,
      title,
      body,
      url: PUSH_URLS[type] || PUSH_URLS.general,
      notificationIds
    }).catch((error) => {
      if (process.env.NODE_ENV !== 'test') console.warn(JSON.stringify({ level: 'warn', message: 'push fan-out failed', error: error.message }));
    });
  }
  return created;
}

async function notifyRole(db, ctx, roles, payload) {
  const users = (await db.query(
    `SELECT DISTINCT m.user_id FROM memberships m
     JOIN membership_roles mr ON mr.membership_id = m.id
     JOIN roles r ON r.id = mr.role_id
     WHERE m.organisation_id = $1 AND m.status = 'active' AND r.role_key = ANY($2)`,
    [payload.organisationId || (ctx ? ctx.organisationId : null), roles]
  )).rows;
  if (!users.length) return [];
  return createNotification(db, ctx, { ...payload, recipientUserIds: users.map((u) => u.user_id) });
}

module.exports = { createNotification, notifyRole };
