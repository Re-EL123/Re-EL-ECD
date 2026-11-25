'use strict';

/**
 * Platform administrators own the public SEO and analytics metadata; those
 * values must reach signed-out visitors through /public/platform so the SPA
 * can apply them without a deploy.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient } = require('./helpers');

test.before(start);
test.after(stop);

test('platform SEO and analytics settings round-trip and reach the public payload', async () => {
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');

  const title = 'Re-EL ECD | Teaching workspace for South Africa';
  const measurementId = 'G-ABC123DEF4';
  const verification = 'abc123-def456';
  const saved = await admin.patch('/platform/settings', {
    seo: {
      title, description: 'One calm workspace for ECD centres.',
      keywords: ['ECD', 'daycare'], siteUrl: 'https://ecd.re-el.co.za',
      image: 'https://ecd.re-el.co.za/assets/share.png', twitterHandle: '@reel_ecd',
      sameAs: ['https://www.facebook.com/reel.ecd']
    },
    analytics: { measurementId: measurementId.toLowerCase(), verification }
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.settings.seo.title, title);
  assert.equal(saved.data.settings.analytics.measurementId, measurementId);
  assert.equal(saved.data.settings.analytics.verification, verification);

  const visitor = createClient();
  const publicPayload = await visitor.get('/public/platform');
  assert.equal(publicPayload.status, 200);
  assert.equal(publicPayload.data.seo.title, title);
  assert.deepEqual(publicPayload.data.seo.keywords, ['ECD', 'daycare']);
  assert.equal(publicPayload.data.analytics.measurementId, measurementId);
  assert.equal(publicPayload.data.analytics.verification, verification);
});

test('invalid analytics identifiers are rejected safely', async () => {
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  const saved = await admin.patch('/platform/settings', {
    analytics: { measurementId: 'javascript:alert(1)', verification: '<script>' }
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.settings.analytics.measurementId, '');
  assert.equal(saved.data.settings.analytics.verification, '');
});

test('tenant administrators cannot change platform SEO settings', async () => {
  const client = createClient();
  await client.login('principal@littlesprouts.local');
  const res = await client.patch('/platform/settings', { seo: { title: 'Hijacked' } });
  assert.equal(res.status, 403);
});

test('uploaded relative share images become absolute public URLs', async () => {
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  const saved = await admin.patch('/platform/settings', {
    seo: { image: '/api/v1/media/object?key=shared%2Fbranding%2Ftest.png', siteUrl: 'https://ecd.re-el.co.za' }
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.settings.seo.image,
    'https://ecd.re-el.co.za/api/v1/media/object?key=shared%2Fbranding%2Ftest.png');
});
