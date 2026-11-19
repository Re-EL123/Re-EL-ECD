'use strict';

/**
 * Organisation-added nursery rhymes are stored in a strictly shaped setting.
 * These tests exercise the real router, RBAC, tenancy and JSONB persistence.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');
const { normaliseCustomRhymes } = require('../src/modules/organisation');

test.before(start);
test.after(stop);

async function principal() {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  return { client, organisationId: session.activeOrganisationId };
}

async function settings(client, organisationId) {
  const response = await client.get('/organisations/current/settings', { organisationId });
  assert.equal(response.status, 200);
  return response.data;
}

test('custom rhymes round-trip through organisation settings', async () => {
  const { client, organisationId } = await principal();
  const before = await settings(client, organisationId);
  const rhyme = {
    id: 'custom-test-song',
    title: 'Our Centred Song',
    category: 'Other',
    tags: ['Circle time', 'Not a tag'],
    minutes: 4,
    lyrics: ['Line one', '', 'Line two'],
    actions: 'Clap twice',
    source: 'https://example.test/song',
    ignored: 'nope'
  };
  const saved = await client.patch('/organisations/current/settings', {
    settings: { nurseryRhymes: [rhyme] }
  }, { organisationId });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.nurseryRhymes.length, 1);
  assert.deepEqual(saved.data.nurseryRhymes[0], {
    id: 'custom-test-song',
    title: 'Our Centred Song',
    category: 'Other',
    tags: ['Circle time'],
    minutes: 4,
    lyrics: ['Line one', 'Line two'],
    actions: 'Clap twice',
    source: 'https://example.test/song',
    custom: true
  });
  const row = await db.one('SELECT settings FROM organisation_settings WHERE organisation_id = $1', [organisationId]);
  assert.equal(row.settings.nurseryRhymes[0].title, 'Our Centred Song');
  await client.patch('/organisations/current/settings', {
    settings: { nurseryRhymes: before.nurseryRhymes || [] }
  }, { organisationId });
});

test('invalid custom rhymes are rejected with field-level errors', async () => {
  const { client, organisationId } = await principal();
  const missingTitle = await client.patch('/organisations/current/settings', {
    settings: { nurseryRhymes: [{ id: 'bad-song', lyrics: ['a'] }] }
  }, { organisationId });
  assert.equal(missingTitle.status, 422);
  assert.match(missingTitle.error.details[0].field, /title/);

  const badId = await client.patch('/organisations/current/settings', {
    settings: { nurseryRhymes: [{ id: 'Bad ID!', title: 'Song', lyrics: ['a'] }] }
  }, { organisationId });
  assert.equal(badId.status, 422);
  assert.match(badId.error.details[0].field, /id/);

  const notAList = await client.patch('/organisations/current/settings', {
    settings: { nurseryRhymes: { title: 'Song' } }
  }, { organisationId });
  assert.equal(notAList.status, 422);

  const emptyLyrics = await client.patch('/organisations/current/settings', {
    settings: { nurseryRhymes: [{ id: 'no-words', title: 'Song', lyrics: [] }] }
  }, { organisationId });
  assert.equal(emptyLyrics.status, 422);
});

function validation(fn) {
  try { fn(); } catch (error) { return error.details || []; }
  return [];
}

test('the normaliser is defensive about hostile and oversized input', () => {
  assert.match(validation(() => normaliseCustomRhymes(null))[0].message, /Expected a list/);
  assert.match(validation(() => normaliseCustomRhymes(new Array(101).fill({ id: 'x', title: 'y', lyrics: ['z'] })))[0].message, /up to 100/);
  const rows = normaliseCustomRhymes([{ id: 'safe-one', title: '  Trimmed  ', lyrics: ['  Hi  ', '', null, 'Bye'], tags: ['Bedtime', 'evil'], minutes: 999 }]);
  assert.equal(rows[0].title, 'Trimmed');
  assert.deepEqual(rows[0].lyrics, ['Hi', 'Bye']);
  assert.deepEqual(rows[0].tags, ['Bedtime']);
  assert.equal(rows[0].minutes, 2);
});
