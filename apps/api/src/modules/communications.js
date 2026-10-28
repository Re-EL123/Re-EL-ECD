'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');
const { parsePagination } = require('../utils/http');
const { has } = require('./helpers');

async function conversationAccess(ctx, conversationId) {
  const conversation = await ctx.db.one(
    'SELECT * FROM conversations WHERE id = $1 AND organisation_id = $2', [conversationId, ctx.organisationId]
  );
  if (!conversation) throw new AppError('NOT_FOUND');
  const participant = await ctx.db.one(
    'SELECT * FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
    [conversation.id, ctx.user.id]
  );
  if (!participant && !has(ctx, 'announcements.manage.daycare')) {
    // Staff with organisation-wide communication rights may observe, but not post, without participation.
    throw new AppError('FORBIDDEN');
  }
  return { conversation, participant };
}

function register(router) {
  router.get('/announcements', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const audience = ctx.query.audience || null;
    const status = ctx.query.status || null;
    const isManager = has(ctx, 'announcements.manage.daycare');
    const params = [ctx.organisationId, audience, isManager ? status : 'published'];
    const rows = await ctx.db.many(
      `SELECT a.*, b.name AS branch_name, u.display_name AS created_by_name
       FROM announcements a
       LEFT JOIN branches b ON b.id = a.branch_id
       LEFT JOIN users u ON u.id = a.created_by
       WHERE a.organisation_id = $1
         AND ($2::text IS NULL OR a.audience_type = $2 OR a.audience_type = 'all')
         AND ($3::text IS NULL OR a.status = $3)
         AND (a.branch_id IS NULL OR $4::uuid IS NULL OR a.branch_id = $4::uuid)
       ORDER BY a.created_at DESC LIMIT $5 OFFSET $6`,
      [...params, ctx.query.branchId || null, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    return rows;
  }, { permission: ['announcements.read.daycare', 'announcements.manage.daycare'], permissionMode: 'any' });

  router.post('/announcements', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 3, max: 200 },
      body: { type: 'string', min: 3, max: 10000 },
      branchId: { type: 'string', uuid: true, optional: true },
      audienceType: { type: 'string', enum: ['all', 'staff', 'parents', 'guardians', 'teachers'], optional: true },
      publish: { type: 'boolean', optional: true }
    });
    if (body.branchId) {
      const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
        [body.branchId, ctx.organisationId]);
      if (!branch) fail('VALIDATION', [{ field: 'branchId', message: 'Unknown branch.' }]);
    }
    const publish = body.publish === true;
    const announcement = await ctx.db.one(
      `INSERT INTO announcements (organisation_id, branch_id, title, body, audience_type, status, published_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [ctx.organisationId, body.branchId || null, body.title, body.body, body.audienceType || 'all',
        publish ? 'published' : 'draft', publish ? new Date().toISOString() : null, ctx.user.id]
    );
    if (publish) await dispatchAnnouncement(ctx, announcement);
    await recordAudit(ctx.db, ctx, {
      action: publish ? 'announcement.published' : 'announcement.created',
      resourceType: 'announcement', resourceId: announcement.id, branchId: body.branchId || null
    });
    ctx.status = 201;
    return announcement;
  }, { permission: 'announcements.manage.daycare' });

  router.patch('/announcements/:id', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 3, max: 200, optional: true },
      body: { type: 'string', min: 3, max: 10000, optional: true },
      audienceType: { type: 'string', enum: ['all', 'staff', 'parents', 'guardians', 'teachers'], optional: true }
    });
    const announcement = await ctx.db.one('SELECT * FROM announcements WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!announcement) throw new AppError('NOT_FOUND');
    if (announcement.status === 'published') fail('CONFLICT', null, 'Published announcements cannot be edited. Create a new announcement.');
    await ctx.db.query(
      `UPDATE announcements SET title = COALESCE($1,title), body = COALESCE($2,body),
        audience_type = COALESCE($3,audience_type) WHERE id = $4`,
      [body.title || null, body.body || null, body.audienceType || null, announcement.id]
    );
    return ctx.db.one('SELECT * FROM announcements WHERE id = $1', [announcement.id]);
  }, { permission: 'announcements.manage.daycare' });

  router.post('/announcements/:id/publish', async (ctx) => {
    const announcement = await ctx.db.one('SELECT * FROM announcements WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!announcement) throw new AppError('NOT_FOUND');
    if (announcement.status === 'published') fail('CONFLICT', null, 'This announcement is already published.');
    await ctx.db.query(
      "UPDATE announcements SET status = 'published', published_at = now() WHERE id = $1", [announcement.id]
    );
    await dispatchAnnouncement(ctx, announcement);
    await recordAudit(ctx.db, ctx, {
      action: 'announcement.published', resourceType: 'announcement', resourceId: announcement.id
    });
    return ctx.db.one('SELECT * FROM announcements WHERE id = $1', [announcement.id]);
  }, { permission: 'announcements.manage.daycare' });

  router.post('/announcements/:id/archive', async (ctx) => {
    const announcement = await ctx.db.one('SELECT * FROM announcements WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!announcement) throw new AppError('NOT_FOUND');
    await ctx.db.query("UPDATE announcements SET status = 'archived' WHERE id = $1", [announcement.id]);
    await recordAudit(ctx.db, ctx, {
      action: 'announcement.archived', resourceType: 'announcement', resourceId: announcement.id
    });
    return { success: true };
  }, { permission: 'announcements.manage.daycare' });

  router.get('/conversations', async (ctx) => {
    const rows = await ctx.db.many(
      `SELECT c.*, l.first_name AS learner_first_name, l.last_name AS learner_last_name,
        (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL) AS message_count,
        (SELECT m.body FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
          ORDER BY m.created_at DESC LIMIT 1) AS last_message,
        (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
          ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
       FROM conversations c
       JOIN conversation_participants p ON p.conversation_id = c.id AND p.user_id = $1 AND p.left_at IS NULL
       LEFT JOIN learners l ON l.id = c.related_learner_id
       WHERE c.organisation_id = $2
       ORDER BY COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id), c.created_at) DESC`,
      [ctx.user.id, ctx.organisationId]
    );
    return rows;
  }, { permission: ['messages.read.own', 'announcements.manage.daycare'], permissionMode: 'any' });

  router.post('/conversations', async (ctx) => {
    const body = validate(ctx.body, {
      subject: { type: 'string', max: 200, optional: true },
      participantUserIds: { type: 'array', of: 'uuid', max: 30, optional: true },
      learnerId: { type: 'string', uuid: true, optional: true },
      conversationType: { type: 'string', enum: ['direct', 'group', 'classroom'], optional: true },
      message: { type: 'string', max: 5000, optional: true }
    });
    const participantIds = Array.from(new Set([...(body.participantUserIds || []), ctx.user.id]));
    for (const userId of participantIds) {
      if (userId === ctx.user.id) continue;
      const member = await ctx.db.one(
        "SELECT id FROM memberships WHERE user_id = $1 AND organisation_id = $2 AND status = 'active'",
        [userId, ctx.organisationId]
      );
      if (!member) fail('VALIDATION', [{ field: 'participantUserIds', message: 'Every participant must be an active organisation member.' }]);
    }
    if (body.learnerId) {
      const learner = await ctx.db.one('SELECT id FROM learners WHERE id = $1 AND organisation_id = $2',
        [body.learnerId, ctx.organisationId]);
      if (!learner) fail('VALIDATION', [{ field: 'learnerId', message: 'Unknown learner.' }]);
    }
    const conversation = await ctx.db.withTransaction(async (client) => {
      const row = (await client.query(
        `INSERT INTO conversations (organisation_id, subject, conversation_type, related_learner_id, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [ctx.organisationId, body.subject || null, body.conversationType || 'direct',
          body.learnerId || null, ctx.user.id]
      )).rows[0];
      for (const userId of participantIds) {
        await client.query(
          `INSERT INTO conversation_participants (conversation_id, user_id, participant_role)
           VALUES ($1,$2,$3)`,
          [row.id, userId, userId === ctx.user.id ? 'owner' : 'member']
        );
      }
      if (body.message) {
        await client.query(
          'INSERT INTO messages (conversation_id, sender_user_id, body) VALUES ($1,$2,$3)',
          [row.id, ctx.user.id, body.message]
        );
      }
      return row;
    });
    if (body.message) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: participantIds.filter((id) => id !== ctx.user.id), type: 'message_received',
        title: body.subject || 'New message', body: body.message.slice(0, 200),
        resourceType: 'conversation', resourceId: conversation.id
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: 'communication.conversation_created', resourceType: 'conversation', resourceId: conversation.id
    });
    ctx.status = 201;
    return conversation;
  }, { permission: 'messages.send.own' });

  router.get('/conversations/:id', async (ctx) => {
    const { conversation } = await conversationAccess(ctx, ctx.params.id);
    const participants = await ctx.db.many(
      `SELECT p.*, u.display_name, u.email, u.avatar_url FROM conversation_participants p
       JOIN users u ON u.id = p.user_id WHERE p.conversation_id = $1 AND p.left_at IS NULL`,
      [conversation.id]
    );
    const messages = await ctx.db.many(
      `SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar
       FROM messages m JOIN users u ON u.id = m.sender_user_id
       WHERE m.conversation_id = $1 AND m.deleted_at IS NULL ORDER BY m.created_at`,
      [conversation.id]
    );
    await ctx.db.query(
      'UPDATE conversation_participants SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2',
      [conversation.id, ctx.user.id]
    );
    return { ...conversation, participants, messages };
  }, { permission: ['messages.read.own', 'announcements.manage.daycare'], permissionMode: 'any' });

  router.post('/conversations/:id/messages', async (ctx) => {
    const { conversation, participant } = await conversationAccess(ctx, ctx.params.id);
    if (!participant) throw new AppError('FORBIDDEN');
    if (conversation.status === 'closed') fail('CONFLICT', null, 'This conversation is closed.');
    const body = validate(ctx.body, { body: { type: 'string', min: 1, max: 5000 } });
    const message = await ctx.db.one(
      'INSERT INTO messages (conversation_id, sender_user_id, body) VALUES ($1,$2,$3) RETURNING *',
      [conversation.id, ctx.user.id, body.body]
    );
    const others = await ctx.db.many(
      'SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id <> $2 AND left_at IS NULL',
      [conversation.id, ctx.user.id]
    );
    if (others.length) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: others.map((o) => o.user_id), type: 'message_received',
        title: conversation.subject || 'New message', body: body.body.slice(0, 200),
        resourceType: 'conversation', resourceId: conversation.id
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: 'communication.message_sent', resourceType: 'conversation', resourceId: conversation.id
    });
    ctx.status = 201;
    return message;
  }, { permission: 'messages.send.own' });

  router.post('/conversations/:id/read', async (ctx) => {
    const { conversation } = await conversationAccess(ctx, ctx.params.id);
    await ctx.db.query(
      'UPDATE conversation_participants SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2',
      [conversation.id, ctx.user.id]
    );
    return { success: true };
  }, { permission: 'messages.read.own' });

  router.post('/conversations/:id/close', async (ctx) => {
    const { conversation } = await conversationAccess(ctx, ctx.params.id);
    await ctx.db.query("UPDATE conversations SET status = 'closed' WHERE id = $1", [conversation.id]);
    await recordAudit(ctx.db, ctx, {
      action: 'communication.conversation_closed', resourceType: 'conversation', resourceId: conversation.id
    });
    return { success: true };
  }, { permission: 'messages.send.own' });

  router.get('/communications/overview', async (ctx) => {
    const unread = await ctx.db.one(
      'SELECT COUNT(*)::int AS total FROM notifications WHERE recipient_user_id = $1 AND read_at IS NULL', [ctx.user.id]
    );
    const announcements = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM announcements
       WHERE organisation_id = $1 AND status = 'published' AND created_at > now() - interval '30 days'`,
      [ctx.organisationId]
    );
    const conversations = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM conversation_participants p
       JOIN conversations c ON c.id = p.conversation_id
       WHERE p.user_id = $1 AND p.left_at IS NULL AND c.status = 'open'`, [ctx.user.id]
    );
    const deliveries = await ctx.db.many(
      `SELECT nd.channel, nd.delivery_status, COUNT(*)::int AS total
       FROM notification_deliveries nd JOIN notifications n ON n.id = nd.notification_id
       WHERE n.recipient_user_id = $1 GROUP BY nd.channel, nd.delivery_status`, [ctx.user.id]
    );
    return { unread: unread.total, recentAnnouncements: announcements.total, openConversations: conversations.total, deliveries };
  }, { permission: ['messages.read.own', 'announcements.read.daycare'], permissionMode: 'any' });
}

async function dispatchAnnouncement(ctx, announcement) {
  let audienceFilter;
  if (announcement.audience_type === 'staff' || announcement.audience_type === 'teachers') {
    audienceFilter = ['organisation_owner', 'principal', 'daycare_administrator', 'daycare_manager',
      'curriculum_coordinator', 'teacher', 'assistant_teacher', 'support_staff', 'finance_officer',
      'admissions_officer', 'substitute_staff'];
    if (announcement.audience_type === 'teachers') {
      audienceFilter = ['curriculum_coordinator', 'teacher', 'assistant_teacher', 'substitute_staff'];
    }
  } else {
    audienceFilter = null;
  }
  let recipients;
  if (audienceFilter) {
    recipients = await ctx.db.many(
      `SELECT DISTINCT m.user_id FROM memberships m
       JOIN membership_roles mr ON mr.membership_id = m.id
       JOIN roles r ON r.id = mr.role_id
       WHERE m.organisation_id = $1 AND m.status = 'active' AND r.role_key = ANY($2)`,
      [ctx.organisationId, audienceFilter]
    );
  } else {
    recipients = await ctx.db.many(
      `SELECT m.user_id FROM memberships m WHERE m.organisation_id = $1 AND m.status = 'active'`,
      [ctx.organisationId]
    );
  }
  if (!recipients.length) return;
  await createNotification(ctx.db, ctx, {
    recipientUserIds: recipients.map((r) => r.user_id), type: 'announcement',
    title: announcement.title, body: announcement.body.slice(0, 500),
    resourceType: 'announcement', resourceId: announcement.id
  });
}

module.exports = { register };
