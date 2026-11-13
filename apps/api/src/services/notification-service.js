'use strict';

const { isConfigured } = require('./email-service');
const push = require('./push-service');

const PUSH_URLS = {
  observation_published: '/parent/progress',
  progress_published: '/parent/progress',
  daily_report_shared: '/parent/activities',
  moment: '/parent/activities',
  pickup_brief: '/parent/activities',
  parent_welcome: '/parent/overview',
  weekly_digest: '/parent/overview',
  family_nudge: '/parent/overview',
  guardian_reaction: '/app/overview',
  collection: '/parent/attendance',
  collection_override: '/parent/attendance',
  collection_denied: '/parent/attendance',
  collection_response: '/app/collection-gate',
  announcement: '/app/communications',
  task_assigned: '/app/tasks',
  plan_review_due: '/app/curriculum',
  observation_due: '/app/assessments',
  observation_comment: '/app/assessments',
  absence_reported: '/app/learner-attendance',
  consent_needed: '/parent/forms',
  general: '/app/communications'
};

async function createNotification(db, ctx, { recipientUserIds, type = 'general', title, body = '', resourceType = null, resourceId = null, organisationId = null, url = null }) {
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
    // Moments are precious and parents shouldn't be pinged twice a day.
    // Suppress the push (never the in-app entry) for recipients who already
    // received a moment notification today. The check looks at committed
    // notification rows, so it works even though the push fan-out is async.
    let pushTarget = created.map((row) => row.recipient_user_id);
    if (type === 'moment') {
      const createdIds = created.map((row) => row.id);
      const prior = await db.many(
        `SELECT DISTINCT recipient_user_id FROM notifications
         WHERE notification_type = 'moment' AND created_at::date = CURRENT_DATE
           AND recipient_user_id = ANY($1::uuid[]) AND NOT (id = ANY($2::uuid[]))`,
        [pushTarget, createdIds]
      ).catch(() => []);
      const suppressed = new Set(prior.map((row) => row.recipient_user_id));
      for (const row of created) {
        if (suppressed.has(row.recipient_user_id)) {
          await db.query(
            `INSERT INTO notification_deliveries (notification_id, channel, delivery_status, attempt_count)
             VALUES ($1,'push','suppressed',0)`,
            [row.id]
          ).catch(() => {});
        }
      }
      pushTarget = pushTarget.filter((userId) => !suppressed.has(userId));
    }
    push.notifyUsers(db, ctx, pushTarget, {
      type,
      title,
      body,
      url: url || PUSH_URLS[type] || PUSH_URLS.general,
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
