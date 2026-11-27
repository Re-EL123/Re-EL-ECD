'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { hashPassword, verifyPassword, randomToken, sha256, passwordIssues } = require('../../../../packages/auth/password');
const { createSession, revokeSession, revokeAllSessions, SESSION_COOKIE, CSRF_COOKIE, IMPERSONATION_COOKIE } = require('../services/session-service');
const { resolveAccess, invalidateAccess } = require('../services/access-service');
const { rateLimit } = require('../middleware/rate-limit');
const { recordAudit } = require('../services/audit-service');
const { sendTemplate } = require('../services/email-service');
const branding = require('../services/branding-service');
const { clearCookie } = require('../utils/http');
const secretbox = require('../services/secretbox');
const totp = require('../../../../packages/auth/totp');
const { debugTokensEnabled } = require('../utils/debug');

// Format-valid scrypt hash of a random string — used to equalise timing for
// unknown accounts without storing a guessable value.
const DUMMY_PASSWORD_HASH = 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);

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

/** Constant-time TOTP check against the user's encrypted secret; falls back
 * to the stored recovery codes (SHA-256 hashes) and reports the remaining
 * hashes when one was consumed. */
async function verifySecondFactor(user, code) {
  const trimmed = String(code == null ? '' : code).trim();
  if (user.totp_secret_enc) {
    try {
      const secret = secretbox.decrypt(user.totp_secret_enc);
      if (totp.verifyTotp(secret, trimmed)) return { ok: true, usedRecovery: false };
    } catch (error) {
      // Undecryptable secret — fall through to recovery codes rather than lock the user out.
    }
  }
  const hashes = Array.isArray(user.mfa_recovery_hashes) ? user.mfa_recovery_hashes.slice() : [];
  const hash = totp.sha256(trimmed.toLowerCase());
  const index = hashes.indexOf(hash);
  if (index === -1) return { ok: false };
  hashes.splice(index, 1);
  return { ok: true, usedRecovery: true, remainingRecovery: hashes };
}

function assertPassword(value, context, field = 'password') {
  const issues = passwordIssues(value, context);
  if (issues.length) fail('VALIDATION', issues.map((issue) => ({ field, message: issue.message })));
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
    if (!user || !user.password_hash) {
      // Always run a scrypt verification so a missing account costs the same
      // time as a wrong password — no account-existence timing oracle.
      await verifyPassword(body.password, DUMMY_PASSWORD_HASH);
      throw new AppError('INVALID_CREDENTIALS');
    }
    const lockExpired = user.locked_until && new Date(user.locked_until) <= new Date();
    if (user.locked_until && !lockExpired) {
      throw new AppError('RATE_LIMITED', null, 'Too many failed attempts. Please try again later.');
    }
    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      // A spent lockout gives a fresh set of tries, not an instant re-lock.
      const base = lockExpired ? 0 : Number(user.failed_login_count || 0);
      const failures = base + 1;
      const lock = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await ctx.db.query('UPDATE users SET failed_login_count = $1, locked_until = $2 WHERE id = $3', [failures, lock, user.id]);
      await recordAudit(ctx.db, ctx, { action: 'auth.login_failed', resourceType: 'user', resourceId: user.id });
      throw new AppError('INVALID_CREDENTIALS');
    }
    if (user.status === 'suspended') throw new AppError('ACCOUNT_SUSPENDED');
    if (user.status === 'disabled' || user.status === 'invited') throw new AppError('FORBIDDEN', null, 'This account is not active.');
    if (!user.email_verified_at) {
      throw new AppError('EMAIL_NOT_VERIFIED', null,
        'Please verify your email address before signing in. Use the link we sent, or request a new one on the sign-in page.');
    }
    // Second factor: a correct password is not enough on its own. Hand out a
    // short-lived challenge — the client exchanges it for a session only
    // after the TOTP (or a recovery code) checks out.
    if (user.mfa_enabled) {
      const limit = rateLimit(`mfa-challenge:${ctx.ip}`, 8, 10 * 60 * 1000);
      if (!limit.allowed) throw new AppError('RATE_LIMITED');
      const challenge = (await ctx.db.query(
        'INSERT INTO mfa_challenges (user_id) VALUES ($1) RETURNING id', [user.id]
      )).rows[0];
      return { mfaRequired: true, challengeId: challenge.id };
    }
    const created = await createSession(ctx.db, user.id, ctx.req, ctx.res, { ip: ctx.ip, userAgent: ctx.req.headers['user-agent'] });
    ctx.session = created.session;
    ctx.user = { id: user.id, email: user.email, displayName: user.display_name, status: user.status, avatarUrl: user.avatar_url, mfaEnabled: Boolean(user.mfa_enabled) };
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
    assertPassword(body.newPassword, { email: ctx.user.email }, 'newPassword');
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
      if (debugTokensEnabled()) ctx.meta.resetToken = token;
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
    const resetUser = await ctx.db.one('SELECT email, display_name FROM users WHERE id = $1', [reset.user_id]);
    assertPassword(body.password, { email: resetUser && resetUser.email });
    const hash = await hashPassword(body.password);
    await ctx.db.query('UPDATE users SET password_hash = $1, updated_at = now(), failed_login_count = 0, locked_until = NULL WHERE id = $2', [hash, reset.user_id]);
    await ctx.db.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id]);
    await revokeAllSessions(ctx.db, reset.user_id);
    await recordAudit(ctx.db, ctx, { action: 'auth.password_reset_completed', resourceType: 'user', resourceId: reset.user_id });
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

  // --- Two-factor authentication (TOTP) --------------------------------------
  // Authenticator-app TOTP. Setup is a two-step: /auth/mfa/setup mints the
  // secret and stores it encrypted; /auth/mfa/enable proves the app can read
  // it before the flag flips and recovery codes are issued.
  router.post('/auth/mfa/setup', async (ctx) => {
    const user = await ctx.db.one('SELECT id, email, display_name, mfa_enabled FROM users WHERE id = $1', [ctx.user.id]);
    if (user.mfa_enabled) fail('CONFLICT', null, 'Two-factor authentication is already on. Disable it first to re-enrol.');
    const limit = rateLimit(`mfa-setup:${ctx.user.id}`, 10, 10 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const secret = totp.generateSecret();
    await ctx.db.query('UPDATE users SET totp_secret_enc = $1 WHERE id = $2', [secretbox.encrypt(secret), user.id]);
    const email = user.email || '';
    const uri = totp.otpauthUri({ issuer: 'Re-EL ECD', label: email, secret });
    await recordAudit(ctx.db, ctx, { action: 'auth.mfa_setup_started', resourceType: 'user', resourceId: user.id });
    return { secret, otpauthUri: uri };
  }, { authenticated: true });

  router.post('/auth/mfa/enable', async (ctx) => {
    const body = validate(ctx.body, { code: { type: 'string', min: 6, max: 8 } });
    const user = await ctx.db.one('SELECT id, mfa_enabled, totp_secret_enc FROM users WHERE id = $1', [ctx.user.id]);
    if (user.mfa_enabled) fail('CONFLICT', null, 'Two-factor authentication is already on.');
    if (!user.totp_secret_enc) fail('CONFLICT', null, 'Run the setup first so we can mint your secret.');
    const limit = rateLimit(`mfa-enable:${ctx.user.id}`, 10, 10 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const secret = secretbox.decrypt(user.totp_secret_enc);
    if (!totp.verifyTotp(secret, body.code)) {
      fail('VALIDATION', [{ field: 'code', message: 'That code does not match. Check your authenticator app and try again.' }]);
    }
    const recovery = totp.generateRecoveryCodes();
    const hashes = recovery.map((code) => totp.sha256(code.trim().toLowerCase()));
    await ctx.db.query(
      'UPDATE users SET mfa_enabled = true, mfa_recovery_hashes = $1::jsonb WHERE id = $2',
      [JSON.stringify(hashes), user.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'auth.mfa_enabled', resourceType: 'user', resourceId: user.id });
    return { backupCodes: recovery };
  }, { authenticated: true });

  router.post('/auth/mfa/disable', async (ctx) => {
    const body = validate(ctx.body, { code: { type: 'string', min: 4, max: 32 } });
    const user = await ctx.db.one('SELECT id, mfa_enabled, totp_secret_enc, mfa_recovery_hashes FROM users WHERE id = $1', [ctx.user.id]);
    if (!user.mfa_enabled) fail('CONFLICT', null, 'Two-factor authentication is not on.');
    const limit = rateLimit(`mfa-disable:${ctx.user.id}`, 10, 10 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const ok = await verifySecondFactor(user, body.code);
    if (!ok.ok) {
      fail('VALIDATION', [{ field: 'code', message: 'That code does not match. Use your authenticator app or a recovery code.' }]);
    }
    await ctx.db.query('UPDATE users SET mfa_enabled = false, totp_secret_enc = NULL, mfa_recovery_hashes = $1::jsonb WHERE id = $2', ['[]', user.id]);
    await recordAudit(ctx.db, ctx, { action: 'auth.mfa_disabled', resourceType: 'user', resourceId: user.id });
    return { success: true };
  }, { authenticated: true });

  // Exchange the pending-login challenge for a session. The challenge id is a
  // UUID handed out after a correct password — only possession of it plus a
  // valid TOTP (or a recovery code) finishes sign-in.
  router.post('/auth/mfa/challenge', async (ctx) => {
    const body = validate(ctx.body, {
      challengeId: { type: 'string', uuid: true },
      code: { type: 'string', min: 4, max: 32 }
    });
    const limit = rateLimit(`mfa-verify:${body.challengeId}`, 5, 10 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const challenge = await ctx.db.one(
      'SELECT * FROM mfa_challenges WHERE id = $1 AND used_at IS NULL AND expires_at > now()', [body.challengeId]
    ).catch(() => null);
    if (!challenge) throw new AppError('VALIDATION', [{ field: 'challengeId', message: 'That sign-in attempt expired. Sign in again.' }]);
    const user = await ctx.db.one(
      'SELECT id, email, display_name, status, avatar_url, mfa_enabled, totp_secret_enc, mfa_recovery_hashes FROM users WHERE id = $1',
      [challenge.user_id]
    );
    if (!user || !user.mfa_enabled || user.status !== 'active') throw new AppError('UNAUTHENTICATED');
    const result = await verifySecondFactor(user, body.code);
    if (!result.ok) {
      await recordAudit(ctx.db, ctx, { action: 'auth.mfa_challenge_failed', resourceType: 'user', resourceId: user.id });
      fail('VALIDATION', [{ field: 'code', message: 'That code is not right. Try again — you have five attempts.' }]);
    }
    if (result.usedRecovery) {
      await ctx.db.query('UPDATE users SET mfa_recovery_hashes = $1::jsonb WHERE id = $2',
        [JSON.stringify(result.remainingRecovery), user.id]);
    }
    await ctx.db.query('UPDATE mfa_challenges SET used_at = now() WHERE id = $1', [challenge.id]);
    const created = await createSession(ctx.db, user.id, ctx.req, ctx.res, { ip: ctx.ip, userAgent: ctx.req.headers['user-agent'] });
    ctx.session = created.session;
    ctx.user = { id: user.id, email: user.email, displayName: user.display_name, status: user.status, avatarUrl: user.avatar_url, mfaEnabled: true };
    ctx.fromCookie = true;
    const memberships = await ctx.db.many(
      `SELECT organisation_id FROM memberships WHERE user_id = $1 AND status = 'active' ORDER BY created_at`,
      [user.id]
    );
    ctx.organisationId = memberships.length ? memberships[0].organisation_id : null;
    await recordAudit(ctx.db, ctx, { action: 'auth.mfa_challenge_passed', resourceType: 'session', resourceId: created.session.id });
    return sessionPayload(ctx);
  }, { public: true, skipCsrf: true });

  // Public token exchange — the emailed link must work before the owner can
  // sign in, so this cannot require a session.
  router.post('/public/auth/verify-email', async (ctx) => {
    const body = validate(ctx.body, { token: { type: 'string', min: 20, max: 200 } });
    const verification = await ctx.db.one('SELECT * FROM email_verifications WHERE token_hash = $1', [sha256(body.token)]);
    if (!verification || verification.used_at || new Date(verification.expires_at) < new Date()) {
      throw new AppError('VALIDATION', [{ field: 'token', message: 'This verification link is invalid or has expired.' }]);
    }
    await ctx.db.withTransaction(async (client) => {
      await client.query('UPDATE email_verifications SET used_at = now() WHERE id = $1', [verification.id]);
      await client.query('UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1',
        [verification.user_id]);
    });
    await recordAudit(ctx.db, ctx, {
      action: 'auth.email_verified', resourceType: 'user', resourceId: verification.user_id,
      metadata: { via: 'email_link' }
    });
    return { success: true };
  }, { public: true, skipCsrf: true });

  async function sendVerificationEmail(ctx, user) {
    if (user.email_verified_at) return { sent: false, reason: 'already_verified' };
    const limit = rateLimit(`verify:${ctx.ip}:${user.id}`, 5, 60 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    await ctx.db.query('UPDATE email_verifications SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
    const token = randomToken(24);
    await ctx.db.query(
      `INSERT INTO email_verifications (user_id, token_hash, expires_at)
       VALUES ($1,$2,now() + interval '48 hours')`, [user.id, sha256(token)]
    );
    await sendTemplate(ctx.db, 'verifyEmail', {
      to: user.email,
      metadata: { userId: user.id, source: 'resend' },
      data: { ownerName: user.display_name, token }
    });
    if (debugTokensEnabled()) ctx.meta.verifyToken = token;
    return { sent: true };
  }

  // Resend from a signed-in session (kept for backwards compatibility).
  router.post('/auth/verify-email', async (ctx) => {
    const user = await ctx.db.one('SELECT * FROM users WHERE id = $1', [ctx.user.id]);
    return sendVerificationEmail(ctx, user);
  }, { authenticated: true });

  // Public resend for someone who has not verified and cannot sign in yet.
  router.post('/public/auth/verify-email/resend', async (ctx) => {
    const body = validate(ctx.body, { email: { type: 'string', email: true } });
    const user = await ctx.db.one('SELECT * FROM users WHERE email_normalized = $1', [body.email.toLowerCase()]);
    if (!user || user.email_verified_at) return { sent: false };
    return sendVerificationEmail(ctx, user);
  }, { public: true, skipCsrf: true });

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
      assertPassword(body.password, { email: invitation.email });
      const hash = await hashPassword(body.password);
      user = await ctx.db.one(
        `INSERT INTO users (email, email_normalized, display_name, password_hash, status, email_verified_at)
         VALUES ($1,$2,$3,$4,'active',now()) RETURNING *`,
        [invitation.email, invitation.email.toLowerCase(), body.displayName || invitation.email.split('@')[0], hash]
      );
    } else if (body.password && !user.password_hash) {
      assertPassword(body.password, { email: user.email });
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
