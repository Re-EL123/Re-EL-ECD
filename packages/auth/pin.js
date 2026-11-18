'use strict';

/**
 * Collection-PIN hashing. PINs are low-entropy secrets, so they are stored as
 * scrypt digests (the same primitive as user passwords) — never as fast,
 * unsalted hashes, which are trivially precomputed after a database leak.
 *
 * Legacy rows stored an unsalted sha256 of `<orgId>::collection-pin::<pin>`.
 * Verification accepts both schemes and reports `needsRehash` so callers can
 * transparently upgrade a row the moment its PIN is next used successfully.
 */

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };

function normalise(pin) {
  return String(pin == null ? '' : pin).trim().toLowerCase();
}

async function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(normalise(pin), salt, KEY_LENGTH, PARAMS);
  return 'scrypt$' + salt + '$' + derived.toString('hex');
}

function legacyHash(orgId, pin) {
  return crypto.createHash('sha256').update(orgId + '::collection-pin::' + normalise(pin)).digest('hex');
}

/**
 * Verify a PIN against a stored digest. Returns { ok, needsRehash } — never
 * throws on malformed stored values.
 */
async function verifyPin(pin, stored, orgId) {
  if (!stored || typeof stored !== 'string') return { ok: false, needsRehash: false };
  const value = normalise(pin);
  if (value.length === 0) return { ok: false, needsRehash: false };
  if (stored.startsWith('scrypt$')) {
    try {
      const [, salt, hash] = stored.split('$');
      if (!salt || !hash || !/^[0-9a-f]+$/i.test(salt) || !/^[0-9a-f]+$/i.test(hash)) {
        return { ok: false, needsRehash: false };
      }
      const derived = await scrypt(value, salt, KEY_LENGTH, PARAMS);
      const expected = Buffer.from(hash, 'hex');
      if (expected.length !== derived.length) return { ok: false, needsRehash: false };
      return { ok: crypto.timingSafeEqual(expected, derived), needsRehash: false };
    } catch {
      return { ok: false, needsRehash: false };
    }
  }
  // Legacy sha256 — constant-time where possible.
  const expected = legacyHash(orgId, pin);
  if (stored.length !== expected.length) return { ok: false, needsRehash: false };
  const ok = crypto.timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(expected, 'hex'));
  return { ok, needsRehash: ok };
}

module.exports = { hashPin, verifyPin };
