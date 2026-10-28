'use strict';

/**
 * Generates docs/api.md from the live router. Run after adding or changing
 * routes: node scripts/generate-api-docs.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { Router } = require('../apps/api/src/router');
const { modules } = require('../apps/api/src/modules');

const router = new Router();
for (const module of modules) module.register(router);

const groups = new Map();
for (const route of router.routes) {
  const first = route.pattern.split('/')[1] || 'root';
  const group = first
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push(route);
}

function permissionLabel(route) {
  if (route.options.public) return 'Public';
  if (route.options.platformOnly) return 'Platform only · ' + (route.options.permission || 'authenticated');
  if (route.options.authenticated && !route.options.permission) return 'Authenticated';
  const permission = route.options.permission;
  if (!permission) return '—';
  if (Array.isArray(permission)) {
    return permission.join(route.options.permissionMode === 'all' ? ' AND ' : ' OR ');
  }
  return permission;
}

const lines = [
  '# API reference',
  '',
  'Base path: `/api/v1`. All responses are JSON envelopes:',
  '',
  '- Success: `{ "data": ..., "meta": { "requestId": "..." } }`',
  '- Error: `{ "error": { "code": "...", "message": "...", "requestId": "...", "details": [...] } }`',
  '',
  'Authentication uses the `reel_session` HttpOnly cookie issued by',
  '`POST /auth/login`. State-changing requests also require the `X-CSRF-Token`',
  'header. `Authorization: Bearer <token>` is supported for automated clients.',
  '',
  'Every protected request is scoped by the `X-Organisation-Id` header (or the',
  '`organisationId` query parameter). Membership and permissions are resolved',
  'server-side; a client cannot widen its scope by changing headers.',
  '',
  `Generated from the router: **${router.routes.length} routes** across ${modules.length} modules.`,
  ''
];

for (const [group, routes] of Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`## ${group}`, '');
  lines.push('| Method | Path | Access |');
  lines.push('| --- | --- | --- |');
  for (const route of routes.sort((a, b) => a.pattern.localeCompare(b.pattern) || a.method.localeCompare(b.method))) {
    lines.push(`| ${route.method} | \`${route.pattern}\` | ${permissionLabel(route).replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
}

lines.push(
  '## Common status codes',
  '',
  '| Status | Meaning |',
  '| --- | --- |',
  '| 200 | Success |',
  '| 201 | Created |',
  '| 401 | Not authenticated, invalid credentials or expired session |',
  '| 403 | Forbidden, CSRF failure, suspended account or tenant mismatch |',
  '| 404 | Record not found or not visible in the active organisation |',
  '| 409 | Conflict with the current state (duplicate, invalid transition) |',
  '| 422 | Validation error; `error.details` lists the fields |',
  '| 429 | Rate limited |',
  '| 500 | Unexpected error; quote the `requestId` when reporting it |',
  ''
);

const target = path.join(__dirname, '..', 'docs', 'api.md');
fs.writeFileSync(target, lines.join('\n'));
console.log(JSON.stringify({ level: 'info', message: 'Wrote API reference', target, routes: router.routes.length }));
