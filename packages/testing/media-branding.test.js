'use strict';

/**
 * Unit tests for the two services that sit behind media and branding.
 *
 * They are pure functions on purpose: signing, key layout, MIME policy and
 * colour validation must not depend on a running server or on R2 being online.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const storage = require('../../apps/api/src/services/storage-service');
const branding = require('../../apps/api/src/services/branding-service');

const CONFIG = {
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret-example',
  bucket: 'reel-media',
  region: 'auto',
  endpoint: 'https://account.r2.cloudflarestorage.com',
  host: 'account.r2.cloudflarestorage.com',
  publicBase: 'https://media.example.com'
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

test('describeUpload accepts supported media and reports its kind and limit', () => {
  const image = storage.describeUpload({ filename: 'a.jpg', contentType: 'image/jpeg', size: 1024 });
  assert.equal(image.valid, true);
  assert.equal(image.mime, 'image/jpeg');
  assert.equal(image.kind, 'image');
  assert.equal(image.extension, 'jpg');
  const video = storage.describeUpload({ filename: 'clip.mp4', contentType: 'video/mp4; codecs=h264', size: 2048 });
  assert.equal(video.valid, true);
  assert.equal(video.kind, 'video');
  assert.equal(video.mime, 'video/mp4');
});

test('describeUpload rejects unknown types, SVG and oversized files', () => {
  assert.equal(storage.describeUpload({ filename: 'x.exe', contentType: 'application/x-msdownload' }).valid, false);
  assert.equal(storage.describeUpload({ filename: 'x.svg', contentType: 'image/svg+xml' }).valid, false);
  const tooBig = storage.describeUpload({ filename: 'x.png', contentType: 'image/png', size: 20 * 1024 * 1024 });
  assert.equal(tooBig.valid, false);
  assert.match(tooBig.reason, /too large/i);
});

test('buildKey is tenant-scoped, random and limited to known scopes', () => {
  const key = storage.buildKey({
    organisationId: 'org-123', scope: 'learner-photo', filename: 'My Photo.JPG', contentType: 'image/jpeg'
  });
  assert.match(key, /^org\/org-123\/learner-photo\/[a-z0-9]+-[a-f0-9]{24}\.jpg$/);
  const other = storage.buildKey({
    organisationId: 'org-123', scope: 'learner-photo', filename: 'My Photo.JPG', contentType: 'image/jpeg'
  });
  assert.notEqual(key, other);

  const unknownScope = storage.buildKey({
    organisationId: 'org-123', scope: '../../etc', filename: 'x.png', contentType: 'image/png'
  });
  assert.match(unknownScope, /^org\/org-123\/general\//);
  assert.equal(unknownScope.includes('..'), false);

  // The extension comes from the validated MIME type, never the filename, so
  // an image can never be published with an executable extension.
  const disguised = storage.buildKey({
    organisationId: 'org-123', scope: 'branding', filename: 'logo.html', contentType: 'image/png'
  });
  assert.match(disguised, /\.png$/);
  assert.equal(disguised.includes('.html'), false);
});

test('presignPut produces a stable, encoded SigV4 URL with an expiry', () => {
  const now = new Date('2026-01-02T03:04:05.000Z');
  const first = storage.presignPut('org/abc/learner-photo/one two.jpg', {
    config: CONFIG, contentType: 'image/jpeg', now
  });
  const second = storage.presignPut('org/abc/learner-photo/one two.jpg', {
    config: CONFIG, contentType: 'image/jpeg', now
  });
  assert.equal(first.url, second.url);
  assert.equal(first.method, 'PUT');
  assert.equal(first.headers['Content-Type'], 'image/jpeg');
  assert.equal(first.expiresAt, '2026-01-02T03:19:05.000Z');
  assert.match(first.url, /^https:\/\/account\.r2\.cloudflarestorage\.com\/reel-media\/org\/abc\/learner-photo\/one%20two\.jpg\?/);
  assert.match(first.url, /X-Amz-Algorithm=AWS4-HMAC-SHA256/);
  assert.match(first.url, /X-Amz-Credential=AKIAEXAMPLE%2F20260102%2Fauto%2Fs3%2Faws4_request/);
  assert.match(first.url, /X-Amz-SignedHeaders=content-type%3Bhost/);
  assert.match(first.url, /X-Amz-Signature=[a-f0-9]{64}$/);
});

test('presignGet signs a read and clamps the expiry window', () => {
  const result = storage.presignGet('org/abc/file.pdf', { config: CONFIG, expires: 999999 });
  assert.equal(result.method, 'GET');
  assert.match(result.url, /X-Amz-Expires=3600/);
});

test('presign refuses to sign without credentials', () => {
  assert.throws(() => storage.presign('PUT', 'key', { config: { bucket: 'b', host: 'h', region: 'auto' } }),
    /not configured/);
});

test('publicUrl joins the bucket base without double slashes', () => {
  const previous = process.env.R2_PUBLIC_BASE_URL;
  process.env.R2_PUBLIC_BASE_URL = 'https://media.example.com/';
  try {
    assert.equal(storage.publicUrl('org/a/b.jpg'), 'https://media.example.com/org/a/b.jpg');
  } finally {
    if (previous === undefined) delete process.env.R2_PUBLIC_BASE_URL;
    else process.env.R2_PUBLIC_BASE_URL = previous;
  }
});

test('isConfigured requires every credential and a public base URL', () => {
  const keys = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL', 'R2_ENDPOINT'];
  const saved = {};
  for (const key of keys) { saved[key] = process.env[key]; delete process.env[key]; }
  try {
    assert.equal(storage.isConfigured(), false);
    Object.assign(process.env, {
      R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'bucket', R2_PUBLIC_BASE_URL: 'https://media.example.com'
    });
    assert.equal(storage.isConfigured(), true);
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

test('normalizeColour accepts only six-digit hex and upper-cases it', () => {
  assert.equal(branding.normalizeColour('#3a7d44'), '#3A7D44');
  assert.equal(branding.normalizeColour('#abc'), null);
  assert.equal(branding.normalizeColour('red'), null);
  assert.equal(branding.normalizeColour(null), null);
});

test('normalizeTokens drops unknown keys and invalid values', () => {
  const tokens = branding.normalizeTokens({
    primary: '#112233', secondary: 'nope', accent: '#445566',
    '--injected': 'url(javascript:alert(1))', text: '#000000'
  });
  assert.deepEqual(tokens, { primary: '#112233', accent: '#445566', text: '#000000' });
});

test('onColour picks readable text for light and dark brand colours', () => {
  assert.equal(branding.onColour('#FFE600'), '#142016');
  assert.equal(branding.onColour('#1F3D24'), '#FFFFFF');
  assert.equal(branding.onColour('invalid'), '#FFFFFF');
});

test('themeFromOrganisation merges stored tokens with organisation columns', () => {
  const theme = branding.themeFromOrganisation({
    primary_colour: '#0055AA',
    secondary_colour: '#EE8800',
    accent_colour: '#33AA66',
    theme_tokens: { background: '#FAFAFA', surface: '#FFFFFF', text: '#111111' }
  });
  assert.equal(theme.primary, '#0055AA');
  assert.equal(theme.secondary, '#EE8800');
  assert.equal(theme.accent, '#33AA66');
  assert.equal(theme.background, '#FAFAFA');
  assert.equal(theme.surface, '#FFFFFF');
  assert.equal(theme.text, '#111111');
  assert.equal(theme.onPrimary, '#FFFFFF');
});

test('themeFromOrganisation falls back to the default palette', () => {
  const theme = branding.themeFromOrganisation({});
  assert.deepEqual(theme, branding.DEFAULT_THEME);
});
