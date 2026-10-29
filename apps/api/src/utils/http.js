'use strict';

const crypto = require('node:crypto');

function requestId() {
  return `req_${crypto.randomUUID()}`;
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

/**
 * Parse `application/x-www-form-urlencoded` while preserving the original field
 * order. PayFast signs ITNs in the order the fields were posted, so an object
 * alone is not enough to verify the signature.
 */
function parseFormPairs(raw) {
  const pairs = [];
  for (const part of String(raw).split('&')) {
    if (!part) continue;
    const index = part.indexOf('=');
    const key = decodeURIComponent((index === -1 ? part : part.slice(0, index)).replace(/\+/g, ' '));
    const value = index === -1 ? '' : decodeURIComponent(part.slice(index + 1).replace(/\+/g, ' '));
    if (key) pairs.push([key, value]);
  }
  return pairs;
}

function readBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error('Request body too large'), { code: 'BODY_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({ value: null, formPairs: null, raw: '' });
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const pairs = parseFormPairs(raw);
        const value = {};
        for (const [key, fieldValue] of pairs) {
          if (!(key in value)) value[key] = fieldValue;
        }
        return resolve({ value, formPairs: pairs, raw });
      }
      try {
        resolve({ value: JSON.parse(raw), formPairs: null, raw });
      } catch {
        reject(Object.assign(new Error('Malformed JSON body'), { code: 'INVALID_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload, headers = {}) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(body);
}

function sendText(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(body);
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.secure || process.env.NODE_ENV === 'production') parts.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const cookie = parts.join('; ');
  res.setHeader('Set-Cookie', existing ? [].concat(existing, cookie) : [cookie]);
}

function clearCookie(res, name) {
  const crossSite = process.env.CROSS_SITE_COOKIES === 'true';
  setCookie(res, name, '', { maxAge: 0, sameSite: crossSite ? 'None' : 'Lax' });
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) if (obj[key] !== undefined) out[key] = obj[key];
  return out;
}

function parsePagination(query, options = {}) {
  const defaultSize = options.defaultSize || 25;
  const maxSize = options.maxSize || 100;
  let page = Number.parseInt(query.page, 10);
  let pageSize = Number.parseInt(query.pageSize, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = defaultSize;
  pageSize = Math.min(pageSize, maxSize);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

module.exports = {
  requestId,
  clientIp,
  parseCookies,
  readBody,
  send,
  sendText,
  setCookie,
  clearCookie,
  pick,
  parsePagination
};
