'use strict';

/**
 * Cloudflare R2 object storage.
 *
 * R2 speaks the S3 API, so uploads use a presigned `PUT` URL that the browser
 * sends directly to R2. That keeps large photos and videos out of the
 * serverless function and means the API only ever handles a short-lived URL.
 *
 * The database stores the public URL of a file, never its bytes. `storage_key`
 * is retained so an object can be deleted or re-signed later.
 *
 * Configuration:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 *   R2_PUBLIC_BASE_URL (for example https://media.example.com)
 * Optional:
 *   R2_ENDPOINT (defaults to https://<account>.r2.cloudflarestorage.com)
 *   R2_REGION (defaults to "auto", which is what R2 expects)
 */

const crypto = require('node:crypto');

const DEFAULT_REGION = 'auto';
const DEFAULT_EXPIRES = 900;
const MAX_EXPIRES = 3600;

const MIME_KINDS = {
  'image/jpeg': { kind: 'image', maxBytes: 15 * 1024 * 1024, extension: 'jpg' },
  'image/png': { kind: 'image', maxBytes: 15 * 1024 * 1024, extension: 'png' },
  'image/webp': { kind: 'image', maxBytes: 15 * 1024 * 1024, extension: 'webp' },
  'image/gif': { kind: 'image', maxBytes: 15 * 1024 * 1024, extension: 'gif' },
  'image/avif': { kind: 'image', maxBytes: 15 * 1024 * 1024, extension: 'avif' },
  'video/mp4': { kind: 'video', maxBytes: 150 * 1024 * 1024, extension: 'mp4' },
  'video/webm': { kind: 'video', maxBytes: 150 * 1024 * 1024, extension: 'webm' },
  'video/quicktime': { kind: 'video', maxBytes: 150 * 1024 * 1024, extension: 'mov' },
  'audio/mpeg': { kind: 'audio', maxBytes: 25 * 1024 * 1024, extension: 'mp3' },
  'audio/mp4': { kind: 'audio', maxBytes: 25 * 1024 * 1024, extension: 'm4a' },
  'audio/webm': { kind: 'audio', maxBytes: 25 * 1024 * 1024, extension: 'weba' },
  'application/pdf': { kind: 'document', maxBytes: 25 * 1024 * 1024, extension: 'pdf' },
  'text/plain': { kind: 'document', maxBytes: 5 * 1024 * 1024, extension: 'txt' },
  'text/csv': { kind: 'document', maxBytes: 10 * 1024 * 1024, extension: 'csv' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'document', maxBytes: 25 * 1024 * 1024, extension: 'docx' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { kind: 'document', maxBytes: 25 * 1024 * 1024, extension: 'xlsx' }
};

const SCOPES = [
  'branding', 'learner-photo', 'learner-document', 'portfolio', 'daily-report',
  'incident', 'announcement', 'staff-avatar', 'staff-document', 'branch-image', 'website', 'general'
];

function isConfigured() {
  return Boolean(
    process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
    && process.env.R2_BUCKET && process.env.R2_PUBLIC_BASE_URL
    && (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT)
  );
}

function config() {
  const endpoint = process.env.R2_ENDPOINT
    || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');
  const parsed = endpoint ? new URL(endpoint) : null;
  return {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || '',
    region: process.env.R2_REGION || DEFAULT_REGION,
    endpoint: parsed ? parsed.origin : '',
    host: parsed ? parsed.host : '',
    publicBase: String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
  };
}

/**
 * AWS URI encoding: like encodeURIComponent but also escapes !'()* and uses
 * %20 for spaces. PayFast is not involved here, but the same rule applies.
 */
function uriEncode(value) {
  return encodeURIComponent(String(value === undefined || value === null ? '' : value))
    .replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

function encodeKeyPath(bucket, key) {
  const segments = [bucket, ...String(key).split('/')].filter((segment) => segment.length > 0);
  return '/' + segments.map(uriEncode).join('/');
}

function amzDate(now) {
  return new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function dateStamp(now) {
  return amzDate(now).slice(0, 8);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

function signingKey(secret, stamp, region, service) {
  const dateKey = hmac('AWS4' + secret, stamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, 'aws4_request');
}

function canonicalQuery(params) {
  return Object.keys(params)
    .sort()
    .map((key) => uriEncode(key) + '=' + uriEncode(params[key]))
    .join('&');
}

/**
 * Create a presigned URL for one object.
 *
 * `method` is normally PUT (upload) or GET (private download). The payload is
 * signed as UNSIGNED-PAYLOAD, which is the documented behaviour for presigned
 * browser uploads.
 */
function presign(method, key, options = {}) {
  const cfg = options.config || config();
  if (!cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket || !cfg.host) {
    throw new Error('Object storage is not configured.');
  }
  const now = options.now ? new Date(options.now) : new Date();
  const expires = Math.min(Math.max(Number(options.expires || DEFAULT_EXPIRES), 60), MAX_EXPIRES);
  const stamp = dateStamp(now);
  const timestamp = amzDate(now);
  const credentialScope = `${stamp}/${cfg.region}/s3/aws4_request`;
  const canonicalUri = encodeKeyPath(cfg.bucket, key);
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': timestamp,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host'
  };
  const query = canonicalQuery(params);
  const canonicalRequest = [
    method,
    canonicalUri,
    query,
    `host:${cfg.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    sha256(canonicalRequest)
  ].join('\n');
  const signature = crypto.createHmac('sha256', signingKey(cfg.secretAccessKey, stamp, cfg.region, 's3'))
    .update(stringToSign, 'utf8')
    .digest('hex');
  return {
    url: `${cfg.endpoint}${canonicalUri}?${query}&X-Amz-Signature=${signature}`,
    method,
    key,
    expiresAt: new Date(now.getTime() + expires * 1000).toISOString()
  };
}

function presignPut(key, options = {}) {
  const result = presign('PUT', key, options);
  const contentType = options.contentType || 'application/octet-stream';
  return { ...result, headers: { 'Content-Type': contentType } };
}

function presignGet(key, options = {}) {
  return presign('GET', key, options);
}

function publicUrl(key) {
  const base = config().publicBase;
  if (!base) return null;
  return base + '/' + String(key).split('/').map(uriEncode).join('/');
}

/**
 * Delete an object with a signed request. Returns false when storage is not
 * configured; the database row is still marked deleted by the caller.
 */
async function deleteObject(key) {
  if (!isConfigured()) return false;
  const cfg = config();
  const now = new Date();
  const stamp = dateStamp(now);
  const timestamp = amzDate(now);
  const credentialScope = `${stamp}/${cfg.region}/s3/aws4_request`;
  const canonicalUri = encodeKeyPath(cfg.bucket, key);
  const payloadHash = sha256('');
  const canonicalHeaders = `host:${cfg.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['DELETE', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', timestamp, credentialScope, sha256(canonicalRequest)].join('\n');
  const signature = crypto.createHmac('sha256', signingKey(cfg.secretAccessKey, stamp, cfg.region, 's3'))
    .update(stringToSign, 'utf8')
    .digest('hex');
  try {
    const response = await fetch(`${cfg.endpoint}${canonicalUri}`, {
      method: 'DELETE',
      headers: {
        Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, `
          + `SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': timestamp
      },
      signal: AbortSignal.timeout(Number(process.env.R2_TIMEOUT_MS || 10000))
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

function safeSegment(value, fallback = 'file') {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function extensionFor(filename, contentType) {
  const fromName = /\.([a-z0-9]{1,8})$/i.exec(String(filename || ''));
  if (fromName) return fromName[1].toLowerCase();
  const known = MIME_KINDS[contentType];
  return known ? known.extension : 'bin';
}

/**
 * Keys are tenant-scoped so one daycare can never overwrite another's media,
 * and the random component prevents guessing or accidental replacement.
 */
function buildKey({ organisationId, scope = 'general', filename, contentType }) {
  const tenant = safeSegment(organisationId, 'org');
  const area = SCOPES.includes(scope) ? scope : 'general';
  const ext = extensionFor(filename, contentType);
  const random = crypto.randomBytes(12).toString('hex');
  return `org/${tenant}/${area}/${Date.now().toString(36)}-${random}.${ext}`;
}

function describeUpload({ filename, contentType, size }) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  const known = MIME_KINDS[mime];
  if (!known) {
    return { valid: false, reason: 'This file type is not allowed. Upload an image, video, audio file or PDF.' };
  }
  const bytes = Number(size);
  if (Number.isFinite(bytes) && bytes > known.maxBytes) {
    return { valid: false, reason: `This file is too large. The limit is ${Math.round(known.maxBytes / (1024 * 1024))} MB.` };
  }
  return { valid: true, mime, kind: known.kind, maxBytes: known.maxBytes, extension: known.extension };
}

module.exports = {
  SCOPES,
  MIME_KINDS,
  isConfigured,
  config,
  uriEncode,
  encodeKeyPath,
  presign,
  presignPut,
  presignGet,
  publicUrl,
  deleteObject,
  buildKey,
  describeUpload,
  safeSegment
};
