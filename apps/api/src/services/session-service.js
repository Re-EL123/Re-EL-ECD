'use strict';

const { sha256, randomToken } = require('../../../../packages/auth/password');

const SESSION_COOKIE = 'reel_session';
const CSRF_COOKIE = 'reel_csrf';
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 8);

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

async function loadSession(db, req) {
  const header = req.headers.authorization || '';
  let token = null;
  let fromCookie = false;
  if (header.startsWith('Bearer ')) {
    token = header.slice(7).trim();
  } else if (req.cookies && req.cookies[SESSION_COOKIE]) {
    token = req.cookies[SESSION_COOKIE];
    fromCookie = true;
  }
  if (!token) return null;
  const row = (await db.query(
    `SELECT s.*, u.email, u.display_name, u.status AS user_status, u.avatar_url, u.phone, u.email_normalized
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [sha256(token)]
  )).rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (row.user_status !== 'active') return null;
  await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.id]);
  return {
    session: row,
    fromCookie,
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

module.exports = { createSession, loadSession, revokeSession, revokeAllSessions, SESSION_COOKIE, CSRF_COOKIE };
