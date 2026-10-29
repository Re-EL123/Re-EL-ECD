'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { randomToken, sha256 } = require('../../../../packages/auth/password');
const { ROLE_HIERARCHY, ROLES } = require('../../../../packages/auth/roles');
const { hasPermission } = require('../../../../packages/auth/permissions');
const { invalidateAccess } = require('../services/access-service');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');
const { sendTemplate } = require('../services/email-service');

async function actorRank(ctx) {
  let max = 0;
  for (const role of ctx.access.roles) max = Math.max(max, ROLE_HIERARCHY[role] || 0);
  return max;
}

function register(router) {
  router.get('/access/roles', async (ctx) => {
    const roles = await ctx.db.many(
      `SELECT r.*, (SELECT COUNT(*)::int FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count
       FROM roles r ORDER BY r.scope_type, r.name`
    );
    return roles;
  }, { permission: 'access.read.daycare' });

  router.get('/access/permissions', async (ctx) => {
    const permissions = await ctx.db.many('SELECT * FROM permissions ORDER BY permission_key');
    return permissions;
  }, { permission: 'access.read.daycare' });

  router.get('/access/memberships', async (ctx) => {
    const search = ctx.query.q ? `%${ctx.query.q}%` : null;
    const rows = await ctx.db.many(
      `SELECT m.id, m.status, m.joined_at, u.id AS user_id, u.email, u.display_name, u.last_login_at
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organisation_id = $1
         AND ($2::text IS NULL OR u.display_name ILIKE $2 OR u.email ILIKE $2)
       ORDER BY u.display_name`,
      [ctx.organisationId, search]
    );
    for (const row of rows) {
      row.roles = await ctx.db.many(
        `SELECT mr.id AS "assignmentId", r.role_key AS role, r.name, mr.branch_id AS "branchId", mr.expires_at AS "expiresAt"
         FROM membership_roles mr JOIN roles r ON r.id = mr.role_id
         WHERE mr.membership_id = $1 AND mr.status = 'active'`,
        [row.id]
      );
    }
    return rows;
  }, { permission: 'access.read.daycare' });

  router.post('/access/invitations', async (ctx) => {
    const body = validate(ctx.body, {
      email: { type: 'string', email: true, max: 255 },
      roleKey: { type: 'string', min: 2, max: 100 },
      branchId: { type: 'string', uuid: true, optional: true },
      displayName: { type: 'string', min: 2, max: 120, optional: true }
    });
    const role = await ctx.db.one('SELECT * FROM roles WHERE role_key = $1', [body.roleKey]);
    if (!role) fail('VALIDATION', [{ field: 'roleKey', message: 'Unknown role.' }]);
    if (role.scope_type === 'platform' && ctx.organisation.slug !== 're-el-platform') {
      fail('FORBIDDEN', null, 'Platform roles cannot be granted inside a daycare organisation.');
    }
    if (role.scope_type !== 'platform' && ctx.organisation.slug === 're-el-platform') {
      fail('VALIDATION', [{ field: 'roleKey', message: 'Only platform roles can be granted at platform level.' }]);
    }
    if ((ROLE_HIERARCHY[body.roleKey] || 0) > (await actorRank(ctx))) {
      fail('FORBIDDEN', null, 'You cannot grant a role with more authority than your own.');
    }
    if (body.branchId) {
      const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
        [body.branchId, ctx.organisationId]);
      if (!branch) fail('VALIDATION', [{ field: 'branchId', message: 'Unknown branch.' }]);
    }
    const token = randomToken(24);
    const invitation = await ctx.db.one(
      `INSERT INTO invitations (organisation_id, email, role_key, branch_id, token_hash, invited_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,now() + interval '7 days') RETURNING *`,
      [ctx.organisationId, body.email.toLowerCase(), body.roleKey, body.branchId || null, sha256(token), ctx.user.id]
    );
    const existing = await ctx.db.one('SELECT id FROM users WHERE email_normalized = $1', [body.email.toLowerCase()]);
    await recordAudit(ctx.db, ctx, {
      action: 'access.invitation_created', resourceType: 'invitation', resourceId: invitation.id,
      metadata: { email: body.email, roleKey: body.roleKey }
    });
    if (existing) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: [existing.id], type: 'invitation',
        title: 'Organisation invitation', body: `You have been invited to join ${ctx.organisation.name}.`
      });
    }
    await sendTemplate(ctx.db, 'invitation', {
      to: body.email,
      organisationId: ctx.organisationId,
      metadata: { invitationId: invitation.id, roleKey: body.roleKey },
      data: {
        organisationName: ctx.organisation.name,
        inviterName: ctx.user.display_name,
        roleLabel: role.name,
        token,
        expiresAt: invitation.expires_at
      }
    });
    if (process.env.NODE_ENV !== 'production') ctx.meta.inviteToken = token;
    return { invitationId: invitation.id, email: body.email, roleKey: body.roleKey, expiresAt: invitation.expires_at };
  }, { permission: 'access.manage.daycare' });

  router.post('/access/memberships/:id/roles', async (ctx) => {
    const body = validate(ctx.body, {
      roleKey: { type: 'string', min: 2, max: 100 },
      branchId: { type: 'string', uuid: true, optional: true },
      expiresAt: { type: 'string', datetime: true, optional: true }
    });
    const membership = await ctx.db.one('SELECT * FROM memberships WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!membership) throw new AppError('NOT_FOUND');
    const role = await ctx.db.one('SELECT * FROM roles WHERE role_key = $1', [body.roleKey]);
    if (!role) fail('VALIDATION', [{ field: 'roleKey', message: 'Unknown role.' }]);
    if (role.scope_type === 'platform' && ctx.organisation.slug !== 're-el-platform') {
      fail('FORBIDDEN', null, 'Platform roles cannot be granted inside a daycare organisation.');
    }
    if ((ROLE_HIERARCHY[body.roleKey] || 0) > (await actorRank(ctx))) fail('FORBIDDEN', null, 'Cannot grant a higher role.');
    if (body.branchId) {
      const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
        [body.branchId, ctx.organisationId]);
      if (!branch) fail('VALIDATION', [{ field: 'branchId', message: 'Unknown branch.' }]);
    }
    const assignment = await ctx.db.one(
      `INSERT INTO membership_roles (membership_id, role_id, branch_id, granted_by, expires_at, status)
       VALUES ($1,$2,$3,$4,$5,'active') RETURNING *`,
      [membership.id, role.id, body.branchId || null, ctx.user.id, body.expiresAt || null]
    );
    invalidateAccess(membership.user_id, ctx.organisationId);
    await recordAudit(ctx.db, ctx, {
      action: 'access.role_assigned', resourceType: 'membership', resourceId: membership.id,
      metadata: { roleKey: body.roleKey, branchId: body.branchId || null }
    });
    return assignment;
  }, { permission: 'access.manage.daycare' });

  router.delete('/access/memberships/:id/roles/:roleId', async (ctx) => {
    const membership = await ctx.db.one('SELECT * FROM memberships WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!membership) throw new AppError('NOT_FOUND');
    const assignment = await ctx.db.one(
      `SELECT mr.*, r.role_key FROM membership_roles mr JOIN roles r ON r.id = mr.role_id
       WHERE mr.membership_id = $1 AND (mr.id::text = $2 OR mr.role_id::text = $2) AND mr.status = 'active'`,
      [membership.id, ctx.params.roleId]
    );
    if (!assignment) throw new AppError('NOT_FOUND');
    if (membership.user_id === ctx.user.id && assignment.role_key === ROLES.ORGANISATION_OWNER) {
      fail('CONFLICT', null, 'The organisation owner cannot remove their own owner role.');
    }
    await ctx.db.query("UPDATE membership_roles SET status = 'revoked' WHERE id = $1", [assignment.id]);
    invalidateAccess(membership.user_id, ctx.organisationId);
    await recordAudit(ctx.db, ctx, {
      action: 'access.role_revoked', resourceType: 'membership', resourceId: membership.id,
      metadata: { roleKey: assignment.role_key }
    });
    return { success: true };
  }, { permission: 'access.manage.daycare' });

  router.patch('/access/memberships/:id', async (ctx) => {
    const body = validate(ctx.body, {
      status: { type: 'string', enum: ['active', 'suspended', 'revoked'], optional: true }
    });
    const membership = await ctx.db.one('SELECT * FROM memberships WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!membership) throw new AppError('NOT_FOUND');
    if (body.status) {
      await ctx.db.query('UPDATE memberships SET status = $1 WHERE id = $2', [body.status, membership.id]);
      invalidateAccess(membership.user_id, ctx.organisationId);
      if (body.status !== 'active') {
        await ctx.db.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [membership.user_id]);
      }
    }
    await recordAudit(ctx.db, ctx, {
      action: 'access.membership_updated', resourceType: 'membership', resourceId: membership.id,
      metadata: { status: body.status }
    });
    return { success: true };
  }, { permission: 'access.manage.daycare' });

  router.get('/access/delegations', async (ctx) => {
    const rows = await ctx.db.many(
      `SELECT d.*, gu.display_name AS grantor_name, ge.display_name AS grantee_name
       FROM delegations d
       JOIN users gu ON gu.id = d.grantor_user_id
       JOIN users ge ON ge.id = d.grantee_user_id
       WHERE d.organisation_id = $1 ORDER BY d.created_at DESC`,
      [ctx.organisationId]
    );
    return rows;
  }, { permission: 'delegations.manage.daycare' });

  router.post('/access/delegations', async (ctx) => {
    const body = validate(ctx.body, {
      granteeUserId: { type: 'string', uuid: true },
      permissions: { type: 'array', of: 'string', max: 60 },
      branchId: { type: 'string', uuid: true, optional: true },
      expiresAt: { type: 'string', datetime: true },
      reason: { type: 'string', min: 3, max: 500 }
    });
    const grantee = await ctx.db.one(
      `SELECT m.user_id FROM memberships m WHERE m.user_id = $1 AND m.organisation_id = $2 AND m.status = 'active'`,
      [body.granteeUserId, ctx.organisationId]
    );
    if (!grantee) fail('VALIDATION', [{ field: 'granteeUserId', message: 'The user is not an active member of this organisation.' }]);
    if (body.granteeUserId === ctx.user.id) fail('VALIDATION', [{ field: 'granteeUserId', message: 'You cannot delegate permissions to yourself.' }]);
    if (new Date(body.expiresAt) <= new Date()) fail('VALIDATION', [{ field: 'expiresAt', message: 'The expiry must be in the future.' }]);
    for (const permission of body.permissions) {
      if (!ctx.access.permissions.has(permission)) {
        fail('FORBIDDEN', null, `You cannot delegate a permission you do not hold: ${permission}`);
      }
    }
    const delegation = await ctx.db.withTransaction(async (client) => {
      const row = (await client.query(
        `INSERT INTO delegations (organisation_id, branch_id, grantor_user_id, grantee_user_id, permissions,
          expires_at, reason) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [ctx.organisationId, body.branchId || null, ctx.user.id, body.granteeUserId,
          JSON.stringify(body.permissions), body.expiresAt, body.reason]
      )).rows[0];
      for (const permission of body.permissions) {
        await client.query('INSERT INTO delegations_permissions (delegation_id, permission_key) VALUES ($1,$2)', [row.id, permission]);
      }
      return row;
    });
    invalidateAccess(body.granteeUserId, ctx.organisationId);
    await recordAudit(ctx.db, ctx, {
      action: 'access.delegation_created', resourceType: 'delegation', resourceId: delegation.id,
      metadata: { permissions: body.permissions, expiresAt: body.expiresAt }
    });
    return delegation;
  }, { permission: 'delegations.manage.daycare' });

  router.post('/access/delegations/:id/revoke', async (ctx) => {
    const delegation = await ctx.db.one('SELECT * FROM delegations WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!delegation) throw new AppError('NOT_FOUND');
    await ctx.db.query('UPDATE delegations SET revoked_at = now() WHERE id = $1', [delegation.id]);
    invalidateAccess(delegation.grantee_user_id, ctx.organisationId);
    await recordAudit(ctx.db, ctx, { action: 'access.delegation_revoked', resourceType: 'delegation', resourceId: delegation.id });
    return { success: true };
  }, { permission: 'delegations.manage.daycare' });

  router.get('/access/effective/:userId', async (ctx) => {
    if (!hasPermission(ctx.access.permissions, 'access.read.daycare')) throw new AppError('FORBIDDEN');
    const membership = await ctx.db.one('SELECT id FROM memberships WHERE user_id = $1 AND organisation_id = $2',
      [ctx.params.userId, ctx.organisationId]);
    if (!membership) throw new AppError('NOT_FOUND');
    const access = await require('../services/access-service').resolveAccess(ctx.db, ctx.params.userId, ctx.organisationId);
    return {
      roles: access.roles, permissions: Array.from(access.permissions),
      branchIds: Array.from(access.branchIds), orgWide: access.orgWide
    };
  }, { permission: 'access.read.daycare' });
}

module.exports = { register };
