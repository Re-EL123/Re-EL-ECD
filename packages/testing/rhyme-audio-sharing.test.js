'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const media = read('apps/api/src/modules/media.js');
const storageService = read('apps/api/src/services/storage-service.js');
const org = read('apps/api/src/modules/organisation.js');
const app = read('apps/web/src/app.js');
const view = read('apps/web/src/views/nursery-rhymes.js');
const utils = read('apps/web/src/utils.js');

test('shared media keys need no schema migration', () => {
  assert.match(storageService, /shared = false \}\)/);
  assert.match(storageService, /if \(shared\) return `shared\/\$\{area\}/);
  assert.doesNotMatch(media, /is_shared/);
  assert.ok(!fs.existsSync(path.join(root, 'packages/database/migrations/051_shared_rhyme_audio.sql')));
});

test('uploads can be marked shared, admin-gated and only for rhyme audio', () => {
  assert.match(media, /shared: \{ type: 'boolean', optional: true \}/);
  assert.match(media, /body\.shared === true && \['nursery-rhyme', 'book'\]\.includes\(scope\)/);
  assert.match(media, /hasPermission\(ctx\.access && ctx\.access\.permissions, 'organisation\.settings\.manage'\)[\s\S]{0,120}platform\.settings\.manage/);
  assert.match(media, /shared: mayShare/);
  assert.match(media, /metadata: \{ scope, kind: described\.kind, mimeType: described\.mime, shared: mayShare \}/);
});

test('the media proxy serves shared and existing rhyme recordings to every tenant', () => {
  assert.match(media, /const shared = \/\^shared\\\/\/\.test\(key\)/);
  assert.match(media, /SELECT status, scope FROM media_assets WHERE storage_key = \$1/);
  assert.match(media, /asset\.scope === 'nursery-rhyme'/);
  assert.match(media, /if \(!own && !shared && !publicRhyme\) throw new AppError\('FORBIDDEN'\)/);
});

test('a shared audio library is readable and writable through the API', () => {
  assert.match(org, /router\.get\('\/nursery-rhyme-audio'/);
  assert.match(org, /router\.patch\('\/nursery-rhyme-audio'/);
  assert.match(org, /router\.delete\('\/nursery-rhyme-audio\/:id'/);
  assert.match(org, /Object\.assign\(audio, plainObject\(own\.nurseryRhymeAudio\)\)/);
  assert.match(org, /shared\(?:%2F|\\\/\)\|org\(?:%2F|\\\/\)\[0-9a-f-\]\{36\}/);
  assert.match(org, /permission: 'organisation\.settings\.manage'/);
});

test('the browser uploads, reads and removes shared rhyme audio', () => {
  assert.match(utils, /shared: opts\.shared === true \? true : undefined/);
  assert.match(app, /Reel\.uploadMedia\(file, \{ scope: 'nursery-rhyme', shared: true \}\)/);
  assert.match(app, /Reel\.api\('PATCH', '\/nursery-rhyme-audio', \{ id, url: asset\.url \}\)/);
  assert.match(app, /Reel\.api\('DELETE', '\/nursery-rhyme-audio\/' \+ encodeURIComponent\(id\)\)/);
  assert.match(app, /shared: \['nursery-rhyme', 'book'\]\.includes\(field\.scope\) \? true : undefined/);
  assert.match(view, /R\.api\('GET', '\/nursery-rhyme-audio'\)/);
  assert.match(view, /sharedRes && sharedRes\.data && sharedRes\.data\.audio/);
  assert.match(view, /R\.api\('PATCH', '\/nursery-rhyme-audio', \{ id: rhyme\.id, url: rhyme\.audioUrl \}\)/);
  assert.match(view, /Shared with every centre/);
});

test('every teaching role that can open rhymes can load the shared audio', () => {
  const org = read('apps/api/src/modules/organisation.js');
  assert.match(org, /return \{ audio \};\s*\}, \{ permission: \['curriculum\.read\.daycare', 'platform\.settings\.manage'\], permissionMode: 'any' \}/);
});

test('the rhymes page loads audio for teaching roles, not just settings readers', () => {
  const view = read('apps/web/src/views/nursery-rhymes.js');
  assert.match(view, /ctx\.has\('curriculum\.read\.daycare'\) \|\| ctx\.has\('organisation\.read\.daycare'\)/);
  assert.match(view, /R\.api\('GET', '\/organisations\/current\/settings'\)\.catch\(\(\) => null\)/);
});
