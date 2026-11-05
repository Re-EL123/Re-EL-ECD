'use strict';

/**
 * Encryption for credentials that must be recoverable in order to sign
 * checkouts (PayFast merchant keys, passphrases and tenant payout account
 * numbers). The values are AES-256-GCM sealed and only the key holder can
 * open them; the database never stores a credential in clear text.
 *
 * The key comes from PAYMENT_CREDENTIALS_KEY. Any non-empty string is accepted
 * and hashed to 32 bytes, so an operator can set a long random passphrase.
 * Outside production a fixed local-only key is used so tests and development
 * work without configuration; production fails loudly instead of storing
 * credentials under someone else's key.
 */

const crypto = require('node:crypto');
const { AppError } = require('../../../../packages/contracts/errors');

const ALGORITHM = 'aes-256-gcm';

function key() {
  const configured = String(process.env.PAYMENT_CREDENTIALS_KEY || '').trim();
  if (configured) return crypto.createHash('sha256').update(configured).digest();
  if (process.env.NODE_ENV !== 'production') {
    // Public, local-only constant: not a secret and unusable in production.
    return crypto.createHash('sha256').update('re-el local development credentials key (not for production)').digest();
  }
  throw new AppError('CONFLICT', null,
    'Online payments are not fully configured. Set PAYMENT_CREDENTIALS_KEY to a long random string and redeploy.');
}

function encrypt(plain) {
  if (plain === undefined || plain === null || String(plain).trim() === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

function decrypt(payload) {
  if (!payload) return null;
  try {
    const parts = String(payload).split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('unsupported payload');
    const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(parts[1], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]);
    return plain.toString('utf8');
  } catch (error) {
    throw new AppError('CONFLICT', null,
      'A stored payment credential could not be read. Re-enter it in Settings → Billing.');
  }
}

function isConfigured() {
  return process.env.NODE_ENV !== 'production' || Boolean(String(process.env.PAYMENT_CREDENTIALS_KEY || '').trim());
}

module.exports = { encrypt, decrypt, isConfigured };
