'use strict';

/**
 * Storage diagnostics.
 *
 * The logo-upload failure was reported as a CORS error but was really a 401
 * from R2: an authentication failure comes back without CORS headers, so the
 * browser can only describe it as a blocked request. These tests pin the
 * server-side check that tells those causes apart without a browser.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../src/services/storage-service');

const KEYS = [
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET', 'R2_PUBLIC_BASE_URL', 'R2_ENDPOINT'
];

function withEnv(values, run) {
  const saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, values);
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const key of KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    });
}

test('an unconfigured deployment explains which variables are missing', async () => {
  await withEnv({}, async () => {
    const result = await storage.check();
    assert.equal(result.ok, false);
    assert.equal(result.diagnosis.code, 'unconfigured');
    assert.equal(result.steps[0].step, 'configuration');
    assert.equal(result.steps[0].ok, false);
  });
});

test('an access key that equals the account id is reported as credentials, not CORS', async () => {
  await withEnv({
    R2_ACCOUNT_ID: 'ba15c3d0742444bc7f7ba1c19035247a',
    R2_ACCESS_KEY_ID: 'ba15c3d0742444bc7f7ba1c19035247a',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 're-el-media',
    R2_PUBLIC_BASE_URL: 'https://media.example.com'
  }, async () => {
    assert.equal(storage.isConfigured(), true);
    const result = await storage.check();
    assert.equal(result.ok, false);
    assert.equal(result.diagnosis.code, 'credentials');
    assert.match(result.diagnosis.message, /account ID/i);
    assert.equal(result.steps.some((step) => step.step === 'credentials' && !step.ok), true);
    assert.equal(result.steps.some((step) => step.step === 'upload'), false,
      'no network call is attempted with a key that cannot work');
  });
});

test('the public URL is built from the configured base and key', async () => {
  await withEnv({ R2_PUBLIC_BASE_URL: 'https://media.example.com/' }, async () => {
    assert.equal(storage.publicUrl('org/abc/website/photo one.jpg'),
      'https://media.example.com/org/abc/website/photo%20one.jpg');
  });
});
