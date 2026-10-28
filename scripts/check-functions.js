'use strict';

/**
 * Verifies the API surface: every module registers, every route declares a
 * permission (or is explicitly public), and no duplicate method+path pairs
 * exist. Also confirms the Vercel entry point exports a handler.
 */

const path = require('node:path');
const { Router } = require('../apps/api/src/router');
const { modules } = require('../apps/api/src/modules');

const errors = [];
const warnings = [];

const router = new Router();
for (const module of modules) {
  const before = router.routes.length;
  module.register(router);
  const added = router.routes.length - before;
  if (!added) errors.push(`Module ${module.register.name || 'anonymous'} registered no routes.`);
}

const seen = new Set();
for (const route of router.routes) {
  const signature = `${route.method} ${route.pattern}`;
  if (seen.has(signature)) errors.push(`Duplicate route: ${signature}`);
  seen.add(signature);
  if (!route.options.public && !route.options.permission && !route.options.authenticated) {
    errors.push(`${signature}: protected route has no permission declaration`);
  }
  if (route.options.public && route.options.permission) {
    warnings.push(`${signature}: public route also declares a permission (permission is ignored)`);
  }
}

const publicRoutes = router.routes.filter((r) => r.options.public);
if (!publicRoutes.length) warnings.push('No public routes registered; the public website and forms will not work.');

const entry = require(path.join(__dirname, '..', 'api', '[...path].js'));
if (typeof entry !== 'function') errors.push('api/[...path].js must export a request handler function.');

const report = {
  level: errors.length ? 'error' : 'info',
  modules: modules.length,
  routes: router.routes.length,
  publicRoutes: publicRoutes.length,
  errors,
  warnings
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
