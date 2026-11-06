'use strict';

const { sha256, randomToken } = require('../../../../packages/auth/password');

const SESSION_COOKIE = 'reel_session';
const CSRF_COOKIE = 'reel_csrf';
const IMPERSONATION_COOKIE = 'reel_impersonation';
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 8);
const IMPERSONATION_MINUTES = Number(process.env.IMPERSONATION_MINUTES || 30);

async function createSession(db, userId, req, res, meta = {}) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  const row = (await db.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_token, ip_address, user_agent, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [userId, sha256(token), csrf, meta.ip || null, meta.userAgent || null, expires]
  )).rows[0];
  await db.query('UPDATE users SET last_login_at = now(), failed_login_count = 0 WHERE id = $1', [userId]);
  if (res) {
    const crossSite = process.env.CROSS_SITE_COOKIES === 'true';
    const sameSite = crossSite ? 'None' : 'Lax';
    const secure = crossSite || process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie', [
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`,
      `${CSRF_COOKIE}=${csrf}; Path=/; SameSite=${sameSite}; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`
    ]);
  }
  return { session: row, token, csrf };
}

/**
 * A short-lived session that lets a platform administrator act inside a
 * tenant under that user's identity. The platform administrator's own
 * session is left untouched so they can return at any time; this session
 * expires quickly and is revoked when they stop impersonating.
 */
async function createImpersonationSession(db, userId, impersonatedBy, meta = {}) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const expires = new Date(Date.now() + IMPERSONATION_MINUTES * 60 * 1000);
  const row = (await db.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_token, ip_address, user_agent, expires_at, impersonated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, sha256(token), csrf, meta.ip || null, meta.userAgent || null, expires, impersonatedBy]
  )).rows[0];
  return { session: row, token, csrf };
}

function impersonationCookie(token, expiresAt, crossSite) {
  const sameSite = crossSite ? 'None' : 'Lax';
  const secure = crossSite || process.env.NODE_ENV === 'production';
  const maxAge = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return `${IMPERSONATION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

async function loadSession(db, req) {
  const header = req.headers.authorization || '';
  const impersonationToken = req.cookies && req.cookies[IMPERSONATION_COOKIE];
  if (header.startsWith('Bearer ')) {
    // Programmatic clients are never impersonated.
    return loadToken(db, header.slice(7).trim(), true);
  }
  // An impersonation session wins over the underlying platform session; any
  // problem with it fails closed rather than silently downgrading to god
  // mode as the administrator.
  if (impersonationToken) return loadToken(db, impersonationToken, true, true);
  if (req.cookies && req.cookies[SESSION_COOKIE]) {
    return loadToken(db, req.cookies[SESSION_COOKIE], true);
  }
  return null;
}

async function loadToken(db, token, fromCookie, requireImpersonation = false) {
  const row = (await db.query(
    `SELECT s.*, u.email, u.display_name, u.status AS user_status, u.avatar_url, u.phone,
            u.email_normalized,
            admin.email AS impersonated_by_email, admin.display_name AS impersonated_by_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     LEFT JOIN users admin ON admin.id = s.impersonated_by
     WHERE s.token_hash = $1`,
    [sha256(token)]
  )).rows[0];
  if (!row) return null;
  if (requireImpersonation && !row.impersonated_by) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.user_status !== 'active') return null;
  await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.id]);
  const impersonated = row.impersonated_by
    ? { by: row.impersonated_by, byName: row.impersonated_by_name, byEmail: row.impersonated_by_email }
    : null;
  return {
    session: row,
    fromCookie,
    impersonatedBy: row.impersonated_by || null,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      status: row.user_status,
      avatarUrl: row.avatar_url,
      phone: row.phone
    }
  };
}

async function revokeSession(db, sessionId) {
  await db.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
}

async function revokeAllSessions(db, userId, exceptId = null) {
  if (exceptId) {
    await db.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL', [userId, exceptId]);
  } else {
    await db.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  }
}

module.exports = { createSession, createImpersonationSession, loadSession, revokeSession, revokeAllSessions, impersonationCookie, SESSION_COOKIE, CSRF_COOKIE, IMPERSONATION_COOKIE };
