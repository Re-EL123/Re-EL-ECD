'use strict';

const nodemailerNotInstalled = process.env.EMAIL_API_KEY ? false : true;

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
    // Email delivery is queued; a durable worker processes it when configured.
    await db.query(
      `INSERT INTO notification_deliveries (notification_id, channel, delivery_status, attempt_count)
       VALUES ($1,'email',$2,0)`,
      [row.id, nodemailerNotInstalled ? 'skipped' : 'queued']
    );
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
