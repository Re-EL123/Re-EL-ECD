'use strict';

const { Router } = require('./router');
const db = require('../../../packages/database');
const { AppError } = require('../../../packages/contracts/errors');
const { send, readBody, parseCookies, requestId, clientIp } = require('./utils/http');
const { loadSession } = require('./services/session-service');
const { resolveAccess } = require('./services/access-service');
const { hasPermission } = require('../../../packages/auth/permissions');

const router = new Router();
require('./modules').register(router);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedOrigins() {
  const configured = (process.env.FRONTEND_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (configured.length) return configured;
  if (process.env.NODE_ENV !== 'production') return ['*'];
  return [];
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed = allowedOrigins();
  if (allowed.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Organisation-Id, X-Request-Id, Idempotency-Key');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function createDbContext() {
  return {
    query: (sql, params) => db.query(sql, params),
    one: (sql, params) => db.one(sql, params),
    many: (sql, params) => db.many(sql, params),
    withTransaction: (fn) => db.withTransaction(fn)
  };
}

async function resolveOrganisation(ctx, route) {
  if (route.options.public) return null;
  if (route.options.platformOnly) {
    ctx.platformAccess = await resolveAccess(ctx.db, ctx.user.id, ctx.platformOrganisationId);
    ctx.organisationId = ctx.platformOrganisationId;
    ctx.organisation = await ctx.db.one('SELECT * FROM organisations WHERE id = $1', [ctx.platformOrganisationId]);
    return ctx.platformOrganisationId;
  }
  const headerOrg = ctx.req.headers['x-organisation-id'];
  const requested = headerOrg || ctx.query.organisationId || null;
  let organisationId = requested;
  if (!organisationId) {
    const memberships = await ctx.db.many(
      `SELECT m.organisation_id, o.status
       FROM memberships m JOIN organisations o ON o.id = m.organisation_id
       WHERE m.user_id = $1 AND m.status = 'active'
       ORDER BY CASE WHEN o.slug = 're-el-platform' THEN 1 ELSE 0 END ASC, m.created_at ASC`,
      [ctx.user.id]
    );
    organisationId = memberships.length ? memberships[0].organisation_id : null;
  }
  if (!organisationId) throw new AppError('FORBIDDEN', null, 'You are not a member of any organisation.');
  const access = await resolveAccess(ctx.db, ctx.user.id, organisationId);
  if (!access.membership || access.membership.status !== 'active') throw new AppError('TENANT_MISMATCH');
  const organisation = await ctx.db.one('SELECT * FROM organisations WHERE id = $1', [organisationId]);
  if (!organisation) throw new AppError('NOT_FOUND');
  if (organisation.status === 'suspended' && !route.options.allowSuspended) {
    throw new AppError('FORBIDDEN', null, 'This organisation is suspended. Contact platform support.');
  }
  ctx.organisationId = organisationId;
  ctx.organisation = organisation;
  ctx.access = access;
  return organisationId;
}

async function findPlatformOrganisation(ctx) {
  const row = await ctx.db.one("SELECT id FROM organisations WHERE slug = 're-el-platform' ORDER BY created_at LIMIT 1");
  if (!row) throw new AppError('INTERNAL', null, 'Platform organisation is not provisioned.');
  return row.id;
}

function checkPermission(ctx, route) {
  const required = route.options.permission;
  if (!required) return;
  const access = route.options.platformOnly ? ctx.platformAccess : ctx.access;
  const permissions = access ? access.permissions : new Set();
  const keys = Array.isArray(required) ? required : [required];
  const mode = route.options.permissionMode || 'all';
  const result = mode === 'any'
    ? keys.some((key) => hasPermission(permissions, key))
    : keys.every((key) => hasPermission(permissions, key));
  if (!result) throw new AppError('FORBIDDEN');
}

async function handle(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const startedAt = Date.now();
  const ctx = {
    req,
    res,
    db: createDbContext(),
    requestId: req.headers['x-request-id'] || requestId(),
    ip: clientIp(req),
    query: {},
    params: {},
    body: null,
    user: null,
    session: null,
    organisationId: null,
    organisation: null,
    access: null,
    platformAccess: null,
    status: 200,
    meta: {},
    rawResponse: false
  };
  res.setHeader('X-Request-Id', ctx.requestId);

  try {
    req.cookies = parseCookies(req.headers.cookie);
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    ctx.query = Object.fromEntries(url.searchParams.entries());
    let path = url.pathname;
    if (path.startsWith('/api/v1')) path = path.slice(7) || '/';
    else if (path.startsWith('/api')) path = path.slice(4) || '/';

    if (!SAFE_METHODS.has(req.method)) {
      ctx.body = await readBody(req);
    }

    const match = router.match(req.method, path);
    if (!match) throw new AppError('NOT_FOUND');
    if (match.methodNotAllowed) throw new AppError('NOT_FOUND', null, 'Method not allowed for this endpoint.');
    const { route, params } = match;
    ctx.params = params;
    ctx.route = route;

    if (!route.options.public) {
      const loaded = await loadSession(ctx.db, req);
      if (!loaded) throw new AppError('UNAUTHENTICATED');
      ctx.session = loaded.session;
      ctx.user = loaded.user;
      ctx.fromCookie = loaded.fromCookie;
      ctx.platformOrganisationId = await findPlatformOrganisation(ctx);

      if (ctx.fromCookie && !SAFE_METHODS.has(req.method) && !route.options.skipCsrf) {
        const supplied = req.headers['x-csrf-token'];
        if (!supplied || supplied !== ctx.session.csrf_token) throw new AppError('CSRF');
      }

      await resolveOrganisation(ctx, route);
      checkPermission(ctx, route);
    }

    const result = await route.handler(ctx);

    if (ctx.rawResponse) {
      console.log(JSON.stringify({ level: 'info', requestId: ctx.requestId, method: req.method, path, status: res.statusCode, ms: Date.now() - startedAt }));
      return;
    }
    const payload = {
      data: result === undefined ? null : result,
      meta: { requestId: ctx.requestId, ...ctx.meta }
    };
    send(res, ctx.status, payload);
    console.log(JSON.stringify({ level: 'info', requestId: ctx.requestId, method: req.method, path, status: ctx.status, ms: Date.now() - startedAt }));
  } catch (error) {
    handleError(ctx, error, res);
  }
}

function handleError(ctx, error, res) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred.';
  let details = null;

  if (error instanceof AppError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error && error.code === '23505') {
    status = 409;
    code = 'CONFLICT';
    message = 'A record with these details already exists.';
  } else if (error && error.code === '23503') {
    status = 409;
    code = 'CONFLICT';
    message = 'This record is referenced by other data and cannot be changed.';
  } else if (error && error.code === 'INVALID_JSON') {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'The request body is not valid JSON.';
  } else if (error && error.code === 'BODY_TOO_LARGE') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'The request body is too large.';
  } else {
    console.error(JSON.stringify({
      level: 'error',
      requestId: ctx.requestId,
      method: ctx.req.method,
      path: ctx.req.url,
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    }));
  }

  const payload = { error: { code, message, requestId: ctx.requestId } };
  if (details) payload.error.details = details;
  if (res.headersSent) return;
  send(res, status, payload);
}

module.exports = { handle, router, applyCors };
