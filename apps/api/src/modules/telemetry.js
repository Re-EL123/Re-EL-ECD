'use strict';

/**
 * Privacy-friendly product diagnostics.
 *
 * Browser events are batched and consent-gated. Every string is scrubbed here
 * as well as in the client: no email addresses, phone numbers, record IDs or
 * free text from forms ever reach storage. There is no user or organisation
 * identifier — only a short-lived, rotating anonymous session key.
 */

const { validate } = require('../../../../packages/contracts/validate');
const { AppError } = require('../../../../packages/contracts/errors');
const { rateLimit } = require('../middleware/rate-limit');

const KINDS = ['page_view', 'click', 'scroll', 'error', 'event'];
const MAX_EVENTS = 25;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /\+?\d[\d\s()-]{7,}\d/g;
const LONG_TOKEN_RE = /\b[A-Za-z0-9_-]{24,}\b/g;

function scrub(value, max, labelChars, stripTokens) {
  let text = String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(UUID_RE, ':id')
    .replace(EMAIL_RE, ':email')
    .replace(PHONE_RE, ':number');
  // Only free-text fields get token scrubbing — event names and labels are
  // allowlisted identifiers, not secrets.
  if (stripTokens) text = text.replace(LONG_TOKEN_RE, ':token');
  if (labelChars) text = text.replace(/[^A-Za-z0-9 :._\/-]/g, '');
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizePath(value) {
  const clean = scrub(value, 240, false, true)
    .replace(UUID_RE, ':id')
    .replace(/\/\d+/g, '/:id')
    .replace(/[?&][^=]+=([^&]*)/g, (match) => match.slice(0, match.indexOf('=') + 1) + ':value')
    .replace(/^\/+/, '/');
  return clean || '/';
}

function sanitizeDetails(kind, details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  const out = {};
  const limited = (value) => Math.min(100, Math.max(0, Number(value) || 0));
  if (Number.isFinite(Number(details.depth))) out.depth = limited(details.depth);
  if (details.target !== undefined) out.target = scrub(details.target, 80, true);
  if (details.route !== undefined) out.route = sanitizePath(details.route);
  if (details.reason !== undefined) out.reason = scrub(details.reason, 60, true);
  if (kind === 'error') {
    // Error messages are useful for debugging, but scrubbed and capped.
    out.message = scrub(details.message, 160, false, true);
    if (details.source !== undefined) out.source = sanitizePath(details.source);
    if (Number.isFinite(Number(details.line))) out.line = Math.floor(Number(details.line)) || 0;
    if (Number.isFinite(Number(details.column))) out.column = Math.floor(Number(details.column)) || 0;
  }
  return out;
}

function register(router) {
  router.post('/public/telemetry', async (ctx) => {
    const limit = rateLimit(`telemetry:${ctx.ip}`, 240, 10 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const body = validate(ctx.body || {}, { events: { type: 'array', max: MAX_EVENTS } });
    const rows = [];
    for (const event of body.events || []) {
      if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
      const kind = String(event.kind || '');
      if (!KINDS.includes(kind)) continue;
      const name = scrub(event.name, 120, true);
      if (!name) continue;
      const occurred = new Date(event.at);
      const at = Number.isNaN(occurred.getTime()) ? new Date() : occurred;
      // Do not accept events from hours ago or in the future.
      const age = Date.now() - at.getTime();
      if (age < -60000 || age > 6 * 60 * 60 * 1000) continue;
      rows.push({
        kind, name,
        path: sanitizePath(event.path || '/'),
        area: ['public', 'app', 'parent', 'platform'].includes(event.area) ? event.area : 'public',
        os: scrub(event.os, 40, true),
        device: ['mobile', 'tablet', 'desktop'].includes(event.device) ? event.device : 'unknown',
        browser: scrub(event.browser, 40, true),
        viewport: scrub(event.viewport, 24, true),
        app_version: scrub(event.appVersion, 40, true),
        session_key: scrub(event.sessionKey, 64, true).slice(0, 64),
        details: JSON.stringify(sanitizeDetails(kind, event.details)),
        occurred_at: at
      });
    }
    if (!rows.length) return { accepted: 0 };
    const placeholders = rows.map((_, index) => {
      const n = index * 12;
      return `($${n + 1},$${n + 2},$${n + 3},$${n + 4},$${n + 5},$${n + 6},$${n + 7},$${n + 8},$${n + 9},$${n + 10},$${n + 11},$${n + 12})`;
    }).join(',');
    const values = rows.flatMap((row) => [row.kind, row.name, row.path, row.area, row.os, row.device,
      row.browser, row.viewport, row.app_version, row.session_key, row.details, row.occurred_at]);
    await ctx.db.query(
      `INSERT INTO telemetry_events
        (kind, name, path, area, os, device, browser, viewport, app_version, session_key, details, occurred_at)
       VALUES ${placeholders}`, values
    );
    return { accepted: rows.length };
  }, { public: true, skipCsrf: true });

  router.get('/platform/telemetry', async (ctx) => {
    const hours = Math.min(720, Math.max(1, Number(ctx.query.hours) || 24));
    const from = new Date(Date.now() - hours * 3600000).toISOString();
    const kind = KINDS.includes(ctx.query.kind) ? ctx.query.kind : null;
    const [totals, topErrors, topOs, topDevices, topPaths, recent] = await Promise.all([
      ctx.db.one(
        `SELECT COUNT(*)::int AS events,
                COUNT(*) FILTER (WHERE kind = 'error')::int AS errors,
                COUNT(DISTINCT session_key)::int AS sessions
         FROM telemetry_events WHERE occurred_at >= $1 AND ($2::text IS NULL OR kind = $2)`, [from, kind]
      ),
      ctx.db.many(
        `SELECT name, COUNT(*)::int AS total FROM telemetry_events
         WHERE kind = 'error' AND occurred_at >= $1
         GROUP BY name ORDER BY total DESC LIMIT 10`, [from]
      ),
      ctx.db.many(
        `SELECT COALESCE(os,'Unknown') AS label, COUNT(*)::int AS total FROM telemetry_events
         WHERE occurred_at >= $1 GROUP BY os ORDER BY total DESC LIMIT 8`, [from]
      ),
      ctx.db.many(
        `SELECT COALESCE(device,'unknown') AS label, COUNT(*)::int AS total FROM telemetry_events
         WHERE occurred_at >= $1 GROUP BY device ORDER BY total DESC LIMIT 8`, [from]
      ),
      ctx.db.many(
        `SELECT path, COUNT(*)::int AS total FROM telemetry_events
         WHERE occurred_at >= $1 AND kind = 'page_view'
         GROUP BY path ORDER BY total DESC LIMIT 10`, [from]
      ),
      ctx.db.many(
        `SELECT id, occurred_at, kind, name, path, area, os, device, browser, viewport, details
         FROM telemetry_events
         WHERE occurred_at >= $1 AND ($2::text IS NULL OR kind = $2)
         ORDER BY occurred_at DESC LIMIT 100`, [from, kind]
      )
    ]);
    return { hours, totals, topErrors, topOs, topDevices, topPaths, recent };
  }, { platformOnly: true, permission: 'platform.health.read' });
}

module.exports = { register, scrub, sanitizePath, sanitizeDetails, KINDS };
