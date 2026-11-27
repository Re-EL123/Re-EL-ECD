'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

test('telemetry ingest sanitises identifiers and free text', async () => {
  const client = createClient();
  const response = await client.post('/public/telemetry', {
    events: [
      {
        kind: 'click', name: 'button.btn-primary', path: '/app/learners/3f2a1111-1111-4111-8111-111111111111/edit?token=secret',
        area: 'app', os: 'Android', device: 'mobile', browser: 'Chrome', viewport: '400-699',
        appVersion: '202611293', sessionKey: 'abc123',
        details: { target: 'button', message: 'contact parent@school.co.za or 082 555 1234', route: '/app/learners/123' }
      },
      {
        kind: 'error', name: 'window_error',
        path: '/app/today', area: 'app', os: 'iOS', device: 'mobile', browser: 'Safari',
        details: { message: 'TypeError: Cannot read property of undefined at https://cdn.example.com/abcdefghijklmnop1234567890.js', line: 42, source: '/app/today' }
      },
      { kind: 'unknown', name: 'ignored' }
    ]
  });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.data.accepted, 2);

  const rows = await db.many('SELECT * FROM telemetry_events ORDER BY id DESC LIMIT 2');
  assert.equal(rows.length, 2);
  const click = rows.find((row) => row.kind === 'click');
  assert.ok(click);
  assert.ok(!JSON.stringify(click).includes('3f2a1111'));
  assert.ok(!JSON.stringify(click).includes('parent@school.co.za'));
  assert.ok(!JSON.stringify(click).includes('082 555 1234'));
  assert.match(click.path, /\/app\/learners\/:id\/edit/);

  const error = rows.find((row) => row.kind === 'error');
  assert.ok(error);
  assert.equal(error.device, 'mobile');
  assert.equal(error.os, 'iOS');
  assert.equal(error.details.line, 42);
});

test('only platform admins can read diagnostics', async () => {
  const tenant = createClient();
  await tenant.login('principal@littlesprouts.local');
  assert.equal((await tenant.get('/platform/telemetry')).status, 403);

  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  const response = await admin.get('/platform/telemetry?hours=24');
  assert.equal(response.status, 200, response.text);
  assert.ok(response.data.totals);
  assert.ok(Array.isArray(response.data.recent));
});
