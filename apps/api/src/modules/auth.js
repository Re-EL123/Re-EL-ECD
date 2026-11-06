'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { hashPassword, verifyPassword, randomToken, sha256 } = require('../../../../packages/auth/password');
const { createSession, revokeSession, revokeAllSessions, SESSION_COOKIE, CSRF_COOKIE, IMPERSONATION_COOKIE } = require('../services/session-service');
const { resolveAccess, invalidateAccess } = require('../services/access-service');
const { rateLimit } = require('../middleware/rate-limit');
const { recordAudit } = require('../services/audit-service');
const { sendTemplate } = require('../services/email-service');
const branding = require('../services/branding-service');
const { clearCookie } = require('../utils/http');

async function sessionPayload(ctx) {
  const memberships = await ctx.db.many(
    `SELECT m.id AS membership_id, m.status, m.organisation_id, o.name, o.slug, o.status AS organisation_status,
            o.currency, o.timezone, o.logo_url, o.primary_colour, o.secondary_colour, o.accent_colour,
            o.theme_tokens, o.applied_theme_id
     FROM memberships m JOIN organisations o ON o.id = m.organisation_id
     WHERE m.user_id = $1 AND m.status = 'active'
     ORDER BY m.created_at ASC`,
    [ctx.user.id]
  );
  const enriched = [];
  for (const membership of memberships) {
    const access = await resolveAccess(ctx.db, ctx.user.id, membership.organisation_id);
    const branches = (await ctx.db.many(
      `SELECT b.id, b.name FROM branches b WHERE b.organisation_id = $1 ORDER BY b.name`,
      [membership.organisation_id]
    ));
    enriched.push({
      membershipId: membership.membership_id,
      organisation: {
        id: membership.organisation_id,
        name: membership.name,
        slug: membership.slug,
        status: membership.organisation_status,
        currency: membership.currency,
        timezone: membership.timezone,
        logoUrl: membership.logo_url,
        primaryColour: membership.primary_colour,
        secondaryColour: membership.secondary_colour,
        accentColour: membership.accent_colour,
        appliedThemeId: membership.applied_theme_id,
        theme: branding.themeFromOrganisation(membership)
      },
      roles: access.roles,
      permissions: Array.from(access.permissions),
      branchIds: Array.from(access.branchIds),
      orgWide: access.orgWide,
      branches
    });
  }
  const activeId = ctx.organisationId || (memberships[0] && memberships[0].organisation_id) || null;
  const active = enriched.find((m) => m.organisation.id === activeId) || null;
  const features = await ctx.db.many('SELECT flag_key, enabled FROM feature_flags ORDER BY flag_key');
  const impersonated = ctx.impersonatedBy
    ? {
        by: ctx.impersonatedBy,
        byName: ctx.session.impersonated_by_name || null,
        byEmail: ctx.session.impersonated_by_email || null,
        expiresAt: ctx.session.expires_at,
        targetUserId: ctx.user.id
      }
    : null;
  return {
    user: ctx.user,
    csrfToken: ctx.session ? ctx.session.csrf_token : null,
    activeOrganisationId: activeId,
    memberships: enriched,
    active,
    features: Object.fromEntries(features.map((f) => [f.flag_key, f.enabled])),
    isPlatformAdmin: Boolean(active && active.roles.some((r) => r.startsWith('platform_'))),
    impersonated
  };
}

function register(router) {
  router.post('/auth/login', async (ctx) => {
    const body = validate(ctx.body, {
      email: { type: 'string', email: true, max: 255 },
      password: { type: 'string', min: 8, max: 200 }
    });
    const limit = rateLimit(`login:${ctx.ip}:${body.email.toLowerCase()}`, 8, 15 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const user = await ctx.db.one('SELECT * FROM users WHERE email_normalized = $1', [body.email.toLowerCase()]);
    if (!user || !user.password_hash) throw new AppError('INVALID_CREDENTIALS');
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new AppError('RATE_LIMITED', null, 'Too many failed attempts. Please try again later.');
    }
    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      const failures = Number(user.failed_login_count) + 1;
      const lock = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await ctx.db.query('UPDATE users SET failed_login_count = $1, locked_until = $2 WHERE id = $3', [failures, lock, user.id]);
      await recordAudit(ctx.db, ctx, { action: 'auth.login_failed', resourceType: 'user', resourceId: user.id });
      throw new AppError('INVALID_CREDENTIALS');
    }
    if (user.status === 'suspended') throw new AppError('ACCOUNT_SUSPENDED');
    if (user.status === 'disabled' || user.status === 'invited') throw new AppError('FORBIDDEN', null, 'This account is not active.');
    const created = await createSession(ctx.db, user.id, ctx.req, ctx.res, { ip: ctx.ip, userAgent: ctx.req.headers['user-agent'] });
    ctx.session = created.session;
    ctx.user = { id: user.id, email: user.email, displayName: user.display_name, status: user.status, avatarUrl: user.avatar_url };
    ctx.fromCookie = true;
    const memberships = await ctx.db.many(
      `SELECT organisation_id FROM memberships WHERE user_id = $1 AND status = 'active' ORDER BY created_at`,
      [user.id]
    );
    ctx.organisationId = memberships.length ? memberships[0].organisation_id : null;
    await recordAudit(ctx.db, ctx, { action: 'auth.login', resourceType: 'session', resourceId: created.session.id });
    return sessionPayload(ctx);
  }, { public: true, skipCsrf: true });

  router.post('/auth/logout', async (ctx) => {
    await revokeSession(ctx.db, ctx.session.id);
    clearCookie(ctx.res, SESSION_COOKIE);
    clearCookie(ctx.res, CSRF_COOKIE);
    clearCookie(ctx.res, IMPERSONATION_COOKIE);
    await recordAudit(ctx.db, ctx, { action: 'auth.logout', resourceType: 'session', resourceId: ctx.session.id });
    return { success: true };
  }, { authenticated: true });

  // Stop impersonating. The platform administrator's own session was never
  // touched; the short-lived impersonation session is revoked here and the
  // browser falls back to the underlying platform session.
  router.post('/auth/impersonation/stop', async (ctx) => {
    if (!ctx.impersonatedBy) fail('CONFLICT', null, 'You are not impersonating anyone.');
    const impersonatedBy = ctx.impersonatedBy;
    await revokeSession(ctx.db, ctx.session.id);
    clearCookie(ctx.res, IMPERSONATION_COOKIE);
    await recordAudit(ctx.db, ctx, {
      action: 'platform.impersonation_stopped', resourceType: 'session', resourceId: ctx.session.id,
      metadata: { impersonatedBy }
    });
    return { success: true };
  }, { authenticated: true });

  router.get('/auth/session', async (ctx) => sessionPayload(ctx), { authenticated: true });

  router.post('/auth/change-password', async (ctx) => {
    const body = validate(ctx.body, {
      currentPassword: { type: 'string', min: 8, max: 200 },
      newPassword: { type: 'string', min: 10, max: 200 }
    });
    const user = await ctx.db.one('SELECT * FROM users WHERE id = $1', [ctx.user.id]);
    const valid = await verifyPassword(body.currentPassword, user.password_hash);
    if (!valid) fail('VALIDATION', [{ field: 'currentPassword', message: 'The current password is incorrect.' }]);
    const hash = await hashPassword(body.newPassword);
    await ctx.db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, user.id]);
    await revokeAllSessions(ctx.db, user.id, ctx.session.id);
    await recordAudit(ctx.db, ctx, { action: 'auth.password_changed', resourceType: 'user', resourceId: user.id });
    await sendTemplate(ctx.db, 'passwordChanged', {
      to: user.email,
      metadata: { userId: user.id, source: 'change_password' },
      data: {
        name: user.display_name,
        at: new Date().toLocaleString('en-ZA'),
        device: String(ctx.req.headers['user-agent'] || '').slice(0, 120)
      }
    });
    return { success: true };
  }, { authenticated: true });

  router.post('/auth/forgot-password', async (ctx) => {
    const body = validate(ctx.body, { email: { type: 'string', email: true } });
    const limit = rateLimit(`forgot:${ctx.ip}:${body.email.toLowerCase()}`, 5, 15 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const user = await ctx.db.one('SELECT id, email, display_name FROM users WHERE email_normalized = $1', [body.email.toLowerCase()]);
    let token = null;
    if (user) {
      token = randomToken(24);
      await ctx.db.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2,now() + interval '1 hour')`,
        [user.id, sha256(token)]
      );
      if (process.env.NODE_ENV !== 'production') ctx.meta.resetToken = token;
      await sendTemplate(ctx.db, 'passwordReset', {
        to: user.email,
        metadata: { userId: user.id },
        data: { displayName: user.display_name, token }
      });
      await recordAudit(ctx.db, ctx, { action: 'auth.password_reset_requested', resourceType: 'user', resourceId: user.id });
    }
    // Always respond identically to avoid disclosing account existence.
    return { success: true };
  }, { public: true, skipCsrf: true });

  router.post('/auth/reset-password', async (ctx) => {
    const body = validate(ctx.body, {
      token: { type: 'string', min: 20, max: 200 },
      password: { type: 'string', min: 10, max: 200 }
    });
    const reset = await ctx.db.one('SELECT * FROM password_resets WHERE token_hash = $1', [sha256(body.token)]);
    if (!reset || reset.used_at || new Date(reset.expires_at) < new Date()) throw new AppError('VALIDATION', [{ field: 'token', message: 'This reset link is invalid or has expired.' }]);
    const hash = await hashPassword(body.password);
    await ctx.db.query('UPDATE users SET password_hash = $1, updated_at = now(), failed_login_count = 0, locked_until = NULL WHERE id = $2', [hash, reset.user_id]);
    await ctx.db.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id]);
    await revokeAllSessions(ctx.db, reset.user_id);
    await recordAudit(ctx.db, ctx, { action: 'auth.password_reset_completed', resourceType: 'user', resourceId: reset.user_id });
    const resetUser = await ctx.db.one('SELECT email, display_name FROM users WHERE id = $1', [reset.user_id]);
    if (resetUser) {
      await sendTemplate(ctx.db, 'passwordChanged', {
        to: resetUser.email,
        metadata: { userId: reset.user_id, source: 'reset_password' },
        data: {
          name: resetUser.display_name,
          at: new Date().toLocaleString('en-ZA'),
          device: String(ctx.req.headers['user-agent'] || '').slice(0, 120)
        }
      });
    }
    return { success: true };
  }, { public: true, skipCsrf: true });

  router.post('/auth/verify-email', async (ctx) => {
    await recordAudit(ctx.db, ctx, { action: 'auth.email_verified', resourceType: 'user', resourceId: ctx.user.id });
    return { success: true };
  }, { authenticated: true });

  router.post('/auth/invitations/accept', async (ctx) => {
    const body = validate(ctx.body, {
      token: { type: 'string', min: 20, max: 200 },
      password: { type: 'string', min: 10, max: 200, optional: true },
      displayName: { type: 'string', min: 2, max: 120, optional: true }
    });
    const invitation = await ctx.db.one('SELECT * FROM invitations WHERE token_hash = $1', [sha256(body.token)]);
    if (!invitation || invitation.status !== 'pending') {
      throw new AppError('VALIDATION', [{ field: 'token', message: 'This invitation is invalid or has already been used.' }]);
    }
    if (new Date(invitation.expires_at) < new Date()) {
      await ctx.db.query("UPDATE invitations SET status = 'expired' WHERE id = $1", [invitation.id]);
      throw new AppError('VALIDATION', [{ field: 'token', message: 'This invitation has expired.' }]);
    }
    let user = await ctx.db.one('SELECT * FROM users WHERE email_normalized = $1', [invitation.email.toLowerCase()]);
    if (!user) {
      if (!body.password) fail('VALIDATION', [{ field: 'password', message: 'A password is required to activate your account.' }]);
      const hash = await hashPassword(body.password);
      user = await ctx.db.one(
        `INSERT INTO users (email, email_normalized, display_name, password_hash, status)
         VALUES ($1,$2,$3,$4,'active') RETURNING *`,
        [invitation.email, invitation.email.toLowerCase(), body.displayName || invitation.email.split('@')[0], hash]
      );
    } else if (body.password && !user.password_hash) {
      const hash = await hashPassword(body.password);
      await ctx.db.query('UPDATE users SET password_hash = $1, status = $2 WHERE id = $3', [hash, 'active', user.id]);
    }
    let membership = await ctx.db.one('SELECT * FROM memberships WHERE user_id = $1 AND organisation_id = $2',
      [user.id, invitation.organisation_id]);
    if (!membership) {
      membership = await ctx.db.one(
        `INSERT INTO memberships (user_id, organisation_id, status, joined_at) VALUES ($1,$2,'active',now()) RETURNING *`,
        [user.id, invitation.organisation_id]
      );
    } else if (membership.status !== 'active') {
      await ctx.db.query("UPDATE memberships SET status = 'active', joined_at = now() WHERE id = $1", [membership.id]);
    }
    const role = await ctx.db.one('SELECT id, name FROM roles WHERE role_key = $1', [invitation.role_key]);
    if (role) {
      // Accepting an invitation must never stack a second copy of a role the
      // person already holds (for example a re-invite after a suspension).
      await ctx.db.query(
        `INSERT INTO membership_roles (membership_id, role_id, branch_id, status)
         SELECT $1,$2,$3,'active'
         WHERE NOT EXISTS (
           SELECT 1 FROM membership_roles
           WHERE membership_id = $1 AND role_id = $2 AND status = 'active'
             AND (($3::uuid IS NULL AND branch_id IS NULL) OR branch_id = $3::uuid)
         )`,
        [membership.id, role.id, invitation.branch_id]
      );
      if (invitation.branch_id) {
        await ctx.db.query('INSERT INTO branch_memberships (membership_id, branch_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [membership.id, invitation.branch_id]);
      }
    }
    await ctx.db.query("UPDATE invitations SET status = 'accepted' WHERE id = $1", [invitation.id]);
    invalidateAccess(user.id, invitation.organisation_id);
    await recordAudit(ctx.db, ctx, {
      action: 'access.invitation_accepted', resourceType: 'membership', resourceId: membership.id,
      organisationId: invitation.organisation_id
    });
    if (invitation.invited_by && invitation.invited_by !== user.id) {
      const inviter = await ctx.db.one('SELECT email, display_name FROM users WHERE id = $1', [invitation.invited_by]);
      const organisation = await ctx.db.one('SELECT name FROM organisations WHERE id = $1', [invitation.organisation_id]);
      if (inviter && inviter.email) {
        await sendTemplate(ctx.db, 'invitationAccepted', {
          to: inviter.email,
          organisationId: invitation.organisation_id,
          metadata: { invitationId: invitation.id, membershipId: membership.id },
          data: {
            inviterName: inviter.display_name,
            accepterName: user.display_name,
            accepterEmail: user.email,
            organisationName: organisation ? organisation.name : '',
            roleLabel: role ? role.name : invitation.role_key
          }
        });
      }
    }
    return { success: true, organisationId: invitation.organisation_id };
  }, { public: true, skipCsrf: true });
}

module.exports = { register, sessionPayload };
