'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('telemetry is consent-gated and never sends form values or identifiers', () => {
  const collector = read('apps/web/src/telemetry.js');
  const api = read('apps/api/src/modules/telemetry.js');
  const analytics = read('apps/web/src/analytics.js');
  const indexHtml = read('apps/web/index.html');
  const app = read('apps/web/src/app.js');

  assert.match(collector, /function consented\(\)/);
  assert.match(collector, /R\.analytics\.consent\) return R\.analytics\.consent === 'granted'/);
  assert.match(collector, /localStorage\.getItem\('reel-analytics-consent'\) === 'granted'/);
  assert.match(collector, /if \(!consented\(\)\) return;/);
  assert.match(collector, /targetLabel\(event\.target\)/);
  assert.match(collector, /scroll_depth/);
  assert.match(collector, /window\.addEventListener\('error'/);
  assert.match(collector, /unhandledrejection/);
  assert.match(collector, /navigator\.userAgent/);
  assert.match(collector, /\(pointer: coarse\)/);
  assert.match(collector, /sessionStorage/);
  assert.match(collector, /R\.api\('POST', '\/public\/telemetry'/);

  assert.match(api, /uuid|UUID_RE/);
  assert.match(api, /EMAIL_RE/);
  assert.match(api, /PHONE_RE/);
  assert.match(api, /rateLimit\(`telemetry:/);
  assert.match(api, /\{ public: true, skipCsrf: true \}/);
  assert.match(api, /platformOnly: true, permission: 'platform\.health\.read'/);

  assert.match(analytics, /fix errors on specific devices/);
  assert.match(indexHtml, /src="src\/telemetry\.js/);
  assert.match(app, /Reel\.telemetry\.init\(\)/);
  assert.match(app, /Reel\.telemetry\.captureError\('route_load_failed', error\)/);
});

test('diagnostics are available in the platform console', () => {
  const app = read('apps/web/src/app.js');
  const platform = read('apps/web/src/views/platform.js');
  assert.match(app, /route\('\/platform\/diagnostics', 'platform', 'platformDiagnostics'/);
  assert.match(app, /path: '\/platform\/diagnostics', label: 'Diagnostics'/);
  assert.match(platform, /V\.platformDiagnostics = \{/);
  assert.match(platform, /\/platform\/telemetry\?hours=/);
  assert.match(platform, /Operating systems/);
  assert.match(platform, /Device types/);
  assert.match(platform, /Top errors/);
});

test('telemetry has a documented retention window', () => {
  const migration = read('packages/database/migrations/058_telemetry_events.sql');
  const script = read('scripts/purge-telemetry.mjs');
  const pkg = read('package.json');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS telemetry_events/);
  assert.match(migration, /occurred_at TIMESTAMPTZ/);
  assert.match(script, /TELEMETRY_RETENTION_DAYS \|\| 90/);
  assert.match(pkg, /"purge:telemetry"/);
});
