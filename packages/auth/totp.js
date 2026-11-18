'use strict';

/**
 * RFC 6238 TOTP (SHA-1, 30-second step, 6 digits) with base32 secrets —
 * interoperable with Google Authenticator, Microsoft Authenticator, 1Password,
 * Authy and every other common authenticator app.
 *
 * Recovery codes are handled by the caller: generate random codes, store only
 * their SHA-256 hashes, compare hashes on use.
 */

const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(secret) {
  const clean = String(secret || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret, counter, digits = 6) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

function totp(secret, atMs = Date.now(), stepSeconds = 30, digits = 6) {
  return hotp(secret, Math.floor(atMs / 1000 / stepSeconds), digits);
}

/** Constant-time TOTP verify across a small time window (±1 step). */
function verifyTotp(secret, code, window = 1, stepSeconds = 30) {
  const token = String(code == null ? '' : code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  for (let drift = -window; drift <= window; drift += 1) {
    const expected = totp(secret, Date.now() + drift * stepSeconds * 1000, stepSeconds);
    if (safeEqual(token, expected)) return true;
  }
  return false;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function otpauthUri({ issuer, label, secret }) {
  return 'otpauth://totp/' + encodeURIComponent(issuer + ':' + label)
    + '?secret=' + secret + '&issuer=' + encodeURIComponent(issuer)
    + '&algorithm=SHA1&digits=6&period=30';
}

/** Eight one-time recovery codes — shown once, stored only as SHA-256 hashes. */
function generateRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < 8; i += 1) {
    const part = () => crypto.randomBytes(3).toString('hex');
    codes.push(part() + '-' + part());
  }
  return codes;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { generateSecret, verifyTotp, otpauthUri, generateRecoveryCodes, sha256, totp, hotp };
