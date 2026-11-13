'use strict';

/**
 * Dependency-free Web Push (RFC 8030/8291) sender.
 *
 * Delivery needs a VAPID identity. In production set VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY (base64url, uncompressed point + raw 32-byte private
 * scalar). When they are absent the keys are generated once and stored
 * sealed in push_config (same AES-256-GCM pattern as payment credentials),
 * so push works out of the box; production must provide PUSH_CREDENTIALS_KEY
 * or PAYMENT_CREDENTIALS_KEY so the seal survives restarts.
 */

const crypto = require('node:crypto');
const { AppError } = require('../../../../packages/contracts/errors');

const ALGORITHM = 'aes-256-gcm';

function envKeys() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(process.env.VAPID_SUBJECT || '').trim() || 'mailto:hello@re-el.co.za';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject, ephemeral: false };
}

function sealKey() {
  const configured = String(process.env.PUSH_CREDENTIALS_KEY || process.env.PAYMENT_CREDENTIALS_KEY || '').trim();
  if (configured) return crypto.createHash('sha256').update(configured).digest();
  if (process.env.NODE_ENV !== 'production') return crypto.createHash('sha256').update('re-el local development push key (not for production)').digest();
  throw new AppError('CONFLICT', null, 'Push delivery is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (or PUSH_CREDENTIALS_KEY for auto-generated keys) and redeploy.');
}

function seal(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, sealKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

function unseal(payload) {
  const parts = String(payload || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('unsupported payload');
  const decipher = crypto.createDecipheriv(ALGORITHM, sealKey(), Buffer.from(parts[1], 'base64'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
}

function b64url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64url(value) {
  const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

// ---- recipients --------------------------------------------------------------

async function subscriptionsForUsers(db, organisationId, userIds) {
  if (!userIds.length) return [];
  return db.many(
    `SELECT * FROM push_subscriptions WHERE organisation_id = $1 AND user_id = ANY($2::uuid[])`,
    [organisationId, userIds]
  );
}

async function preferencesFor(db, organisationId, userIds) {
  if (!userIds.length) return new Map();
  const rows = await db.many(
    `SELECT user_id, push_preferences FROM memberships
     WHERE organisation_id = $1 AND user_id = ANY($2::uuid[])`,
    [organisationId, userIds]
  );
  const out = new Map();
  for (const row of rows) out.set(row.user_id, row.push_preferences || { enabled: true });
  // Users without a membership row inherit the platform default (enabled).
  for (const id of userIds) if (!out.has(id)) out.set(id, { enabled: true });
  return out;
}

// ---- VAPID ------------------------------------------------------------------

async function ensureKeys(db) {
  const fromEnv = envKeys();
  if (fromEnv) return fromEnv;
  const row = await db.one('SELECT * FROM push_config WHERE id = TRUE');
  if (row) {
    return { publicKey: row.public_key, privateKey: unseal(row.private_key), subject: row.subject, ephemeral: false };
  }
  // Export JWK directly — no DER step, so Node's signer can consume the keys.
  const { publicKey: jwkPublic, privateKey: jwkPrivate } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { format: 'jwk' },
    privateKeyEncoding: { format: 'jwk' }
  });
  const rawPoint = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwkPublic.x, 'base64url'), Buffer.from(jwkPublic.y, 'base64url')]);
  const rawPrivate = Buffer.from(jwkPrivate.d, 'base64url');
  const subject = String(process.env.VAPID_SUBJECT || '').trim() || 'mailto:hello@re-el.co.za';
  await db.query(
    `INSERT INTO push_config (id, public_key, private_key, subject) VALUES (TRUE, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET public_key = EXCLUDED.public_key, private_key = EXCLUDED.private_key, subject = EXCLUDED.subject, updated_at = now()`,
    [b64url(rawPoint), seal(b64url(rawPrivate)), subject]
  );
  return { publicKey: b64url(rawPoint), privateKey: b64url(rawPrivate), subject, ephemeral: true };
}

function signVapid({ endpoint, publicKey, privateKey, subject }) {
  const aud = new URL(endpoint).origin;
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(Buffer.from(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject
  })));
  const unsigned = header + '.' + claims;
  const jwk = { kty: 'EC', crv: 'P-256', d: privateKey, x: Buffer.from(fromB64url(publicKey)).subarray(1, 33).toString('base64url'), y: Buffer.from(fromB64url(publicKey)).subarray(33).toString('base64url') };
  const privateKeyObject = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  // ES256 wants the raw R||S (IEEE-P1363) form, not ASN.1/DER.
  const raw = crypto.sign('sha256', Buffer.from(unsigned, 'utf8'), { key: privateKeyObject, dsaEncoding: 'ieee-p1363' });
  return { token: unsigned + '.' + b64url(raw), k: publicKey };
}

function hkdfSha256(ikm, salt, info, length) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const t = Buffer.concat([Buffer.from(info), Buffer.from([0x01])]);
  return crypto.createHmac('sha256', prk).update(t).digest().subarray(0, length);
}

function encryptPayload(payloadText, p256dh, auth) {
  const receiverPublic = fromB64url(p256dh);
  const receiverAuth = fromB64url(auth);
  const { privateKey: jwkEphemeralPrivate, publicKey: jwkEphemeralPublic } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { format: 'jwk' },
    privateKeyEncoding: { format: 'jwk' }
  });
  // Ephemeral public as raw uncompressed point.
  const ephemeralRaw = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwkEphemeralPublic.x, 'base64url'), Buffer.from(jwkEphemeralPublic.y, 'base64url')]);
  const sharedSecret = crypto.diffieHellman({
    publicKey: crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: Buffer.from(receiverPublic).subarray(1, 33).toString('base64url'), y: Buffer.from(receiverPublic).subarray(33, 65).toString('base64url') }, format: 'jwk' }),
    privateKey: crypto.createPrivateKey({ key: jwkEphemeralPrivate, format: 'jwk' })
  });
  const prkKey = crypto.createHmac('sha256', receiverAuth).update(sharedSecret).digest();
  const ikm = crypto.createHmac('sha256', prkKey)
    .update(Buffer.concat([Buffer.from('WebPush: info\0'), receiverPublic, ephemeralRaw, Buffer.from([0x01])]))
    .digest();
  const salt = crypto.randomBytes(16);
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const cek = crypto.createHmac('sha256', prk)
    .update(Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([0x01])])).digest().subarray(0, 16);
  const nonce = crypto.createHmac('sha256', prk)
    .update(Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([0x01])])).digest().subarray(0, 12);
  const recordSize = 4096;
  const header = Buffer.concat([salt, Buffer.alloc(4), Buffer.from([ephemeralRaw.length]), ephemeralRaw]);
  header.writeUInt32BE(recordSize, 16);
  const plaintext = Buffer.concat([Buffer.from(String(payloadText), 'utf8'), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  cipher.setAAD(header);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([header, encrypted, tag]);
}

// ---- public API ------------------------------------------------------------

/** Public key for clients to subscribe against. Returns null when unconfigured. */
async function publicKey(db) {
  try {
    const keys = await ensureKeys(db);
    return keys.publicKey;
  } catch {
    return null;
  }
}

/**
 * Fan-out a notification to every push subscription of the given users.
 * Returns the number of subscriptions reached (0 when none exist or push
 * is unavailable — callers must not fail because of push).
 */
async function notifyUsers(db, ctx, userIds, { type, title, body, url, data, notificationIds }) {
  if (!userIds.length) return 0;
  const orgId = ctx.organisationId;
  const subscriptions = await subscriptionsForUsers(db, orgId, userIds);
  if (!subscriptions.length) return 0;
  const preferences = await preferencesFor(db, orgId, userIds);
  let keys = null;
  try { keys = await ensureKeys(db); } catch { return 0; }
  let delivered = 0;
  for (const subscription of subscriptions) {
    const pref = preferences.get(subscription.user_id) || { enabled: true };
    if (!pref.enabled) continue;
    if (Array.isArray(pref.types) && pref.types.length && type && !pref.types.includes(type)) continue;
    try {
      const jwt = signVapid({ endpoint: subscription.endpoint, publicKey: keys.publicKey, privateKey: keys.privateKey, subject: keys.subject });
      const payload = JSON.stringify({ title, body, url: url || '/#/app/communications', type, ...(data || {}) });
      const encrypted = encryptPayload(payload, subscription.p256dh, subscription.auth);
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': 'vapid t=' + jwt.token + ', k=' + jwt.k,
          'Content-Encoding': 'aes128gcm',
          'TTL': '86400',
          'Content-Length': String(encrypted.length),
          'Content-Type': 'application/octet-stream'
        },
        body: encrypted
      });
      if (response.status === 201 || response.status === 202) {
        delivered += 1;
        const notificationId = notificationIds ? notificationIds[subscription.user_id] : null;
        if (notificationId) {
          await db.query(
            `INSERT INTO notification_deliveries (notification_id, channel, delivery_status, attempt_count, last_attempt_at)
             VALUES ($1,'push','delivered',1,now())`,
            [notificationId]
          ).catch(() => {});
        }
      } else if (response.status === 404 || response.status === 410) {
        await db.query('DELETE FROM push_subscriptions WHERE id = $1', [subscription.id]);
      }
    } catch (error) {
      // Push is an enhancement: never block the request path.
      if (process.env.NODE_ENV !== 'test') console.warn(JSON.stringify({ level: 'warn', message: 'push send failed', endpoint: subscription.endpoint.slice(0, 60), error: error.message }));
    }
  }
  return delivered;
}

// ---- routes ------------------------------------------------------------------

function register(router) {
  router.get('/push/public-key', async (ctx) => {
    const key = await publicKey(ctx.db);
    return { key };
  }, { authenticated: true });

  router.post('/push/subscribe', async (ctx) => {
    const body = ctx.body || {};
    const endpoint = String(body.endpoint || '').trim();
    const p256dh = String((body.keys && body.keys.p256dh) || '').trim();
    const auth = String((body.keys && body.keys.auth) || '').trim();
    if (!endpoint || !/^https:\/\//.test(endpoint) || endpoint.length > 2000) {
      throw new AppError('VALIDATION', [{ field: 'endpoint', message: 'A valid https endpoint is required.' }]);
    }
    if (!p256dh || !auth) throw new AppError('VALIDATION', [{ field: 'keys', message: 'Subscription keys are required.' }]);
    const membership = await ctx.db.one(
      `SELECT id FROM memberships WHERE user_id = $1 AND organisation_id = $2 AND status = 'active' LIMIT 1`,
      [ctx.user.id, ctx.organisationId]
    );
    await ctx.db.query(
      `INSERT INTO push_subscriptions (organisation_id, user_id, membership_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, membership_id = EXCLUDED.membership_id,
         p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
      [ctx.organisationId, ctx.user.id, membership ? membership.id : null, endpoint, p256dh, auth, String(body.userAgent || '').slice(0, 300)]
    );
    ctx.status = 201;
    return { subscribed: true };
  }, { authenticated: true });

  router.post('/push/unsubscribe', async (ctx) => {
    const endpoint = String((ctx.body || {}).endpoint || '').trim();
    await ctx.db.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, ctx.user.id]);
    return { unsubscribed: true };
  }, { authenticated: true });

  router.get('/push/preferences', async (ctx) => {
    const rows = await ctx.db.many(
      `SELECT m.organisation_id, m.push_preferences, m.email_digest, o.name AS organisation_name
       FROM memberships m JOIN organisations o ON o.id = m.organisation_id
       WHERE m.user_id = $1 AND m.status = 'active'`,
      [ctx.user.id]
    );
    return rows.map((row) => ({
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      preferences: Object.assign({}, row.push_preferences || { enabled: true }, { digest: row.email_digest !== false })
    }));
  }, { authenticated: true });

  router.patch('/push/preferences', async (ctx) => {
    const body = ctx.body || {};
    const preferences = typeof body.preferences === 'object' && body.preferences ? body.preferences : null;
    const emailDigest = typeof body.emailDigest === 'boolean' ? body.emailDigest : undefined;
    if (!preferences && emailDigest === undefined) {
      throw new AppError('VALIDATION', [{ field: 'preferences', message: 'Provide preferences and/or emailDigest.' }]);
    }
    if (preferences) {
      if (typeof preferences.enabled !== 'boolean') {
        throw new AppError('VALIDATION', [{ field: 'preferences.enabled', message: 'A boolean "enabled" is required.' }]);
      }
      if (preferences.types !== undefined && !Array.isArray(preferences.types)) {
        throw new AppError('VALIDATION', [{ field: 'types', message: 'types must be an array of notification keys.' }]);
      }
      await ctx.db.query(
        `UPDATE memberships SET push_preferences = $1 WHERE user_id = $2 AND organisation_id = $3 AND status = 'active'`,
        [JSON.stringify({ enabled: preferences.enabled, types: Array.isArray(preferences.types) ? preferences.types : [] }), ctx.user.id, ctx.organisationId]
      );
    }
    if (emailDigest !== undefined) {
      await ctx.db.query(
        `UPDATE memberships SET email_digest = $1 WHERE user_id = $2 AND organisation_id = $3 AND status = 'active'`,
        [emailDigest, ctx.user.id, ctx.organisationId]
      );
    }
    return { preferences: preferences || undefined, emailDigest };
  }, { authenticated: true });
}

module.exports = { register, notifyUsers, publicKey };
