'use strict';

/**
 * The shared nursery-rhyme player uses a public, cookie-free stream so mobile
 * browsers can play audio even when the frontend and API are on different
 * sites. The endpoint must never become a general-purpose file server: it only
 * redirects ready assets in the nursery-rhyme scope.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

const KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL'];

test('public rhyme audio streams without cookies and only serves ready shared audio', async () => {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    R2_ACCOUNT_ID: 'ba15c3d0742444bc7f7ba1c19035247a',
    R2_ACCESS_KEY_ID: 'ba15c3d0742444bc7f7ba1c19035247a',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 're-el-media',
    R2_PUBLIC_BASE_URL: 'https://media.example.com'
  });

  const principal = createClient();
  const session = await principal.login('principal@littlesprouts.local');
  const orgId = session.activeOrganisationId;
  const base = 'shared/nursery-rhyme/test-' + Date.now();
  const readyKey = base + '-ready.mp3';
  const otherScopeKey = base + '-book.pdf';
  const pendingKey = base + '-pending.mp3';
  const rows = [
    [readyKey, 'audio/mpeg', 'ready', 'nursery-rhyme'],
    [otherScopeKey, 'application/pdf', 'ready', 'book'],
    [pendingKey, 'audio/mpeg', 'pending', 'nursery-rhyme']
  ];
  for (const [key, mime, status, scope] of rows) {
    await db.query(
      `INSERT INTO media_assets (organisation_id, original_filename, storage_key, url, mime_type, size_bytes, kind, status, scope)
       VALUES ($1,'test',$2,$3,$4,1024,'audio',$5,$6)`,
      [orgId, key, '/api/v1/media/object?key=' + encodeURIComponent(key), mime, status, scope]
    );
  }

  try {
    // No session cookie at all: the whole point of this endpoint.
    const anonymous = createClient();
    const stream = await anonymous.get('/public/rhyme-audio?key=' + encodeURIComponent(readyKey), { redirect: 'manual' });
    assert.equal(stream.status, 302);
    const location = stream.headers.get('location') || '';
    assert.match(location, /X-Amz-Signature=/);
    assert.match(location, /X-Amz-Expires=900/);
    assert.ok(location.includes(encodeURIComponent(readyKey)) || location.includes(readyKey));

    const missing = await anonymous.get('/public/rhyme-audio', { redirect: 'manual' });
    assert.equal(missing.status, 404);

    const wrongScope = await anonymous.get('/public/rhyme-audio?key=' + encodeURIComponent(otherScopeKey), { redirect: 'manual' });
    assert.equal(wrongScope.status, 404);

    const notReady = await anonymous.get('/public/rhyme-audio?key=' + encodeURIComponent(pendingKey), { redirect: 'manual' });
    assert.equal(notReady.status, 404);

    const unknown = await anonymous.get('/public/rhyme-audio?key=does-not-exist', { redirect: 'manual' });
    assert.equal(unknown.status, 404);
  } finally {
    await db.query('DELETE FROM media_assets WHERE storage_key LIKE $1', [base + '%']);
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
