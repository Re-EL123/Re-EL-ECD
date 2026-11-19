'use strict';

/**
 * Whiteboard endpoints: validation, delta saves, optimistic concurrency,
 * version snapshots and board management. Real router, RBAC and PGlite SQL.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient } = require('./helpers');
const { cleanObject, cleanState, applyOps } = require('../src/modules/whiteboards');

test.before(start);
test.after(stop);

async function principal() {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  return { client, organisationId: session.activeOrganisationId };
}

async function createBoard(client, organisationId, title) {
  const response = await client.post('/whiteboards', {
    title: title || 'Test board',
    state: {
      objects: [
        { id: 'a', type: 'sticky', x: 10, y: 20, w: 180, h: 140, text: 'Hello', fill: '#FFF4B8' },
        { id: 'b', type: 'path', color: '#1f3b2a', width: 3, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    }
  }, { organisationId });
  assert.equal(response.status, 201, JSON.stringify(response.error));
  return response.data;
}

test('canvas objects are whitelisted, sized and validated on write', () => {
  assert.equal(cleanObject({ type: 'malicious', evil: true }), null);
  assert.equal(cleanObject({ type: 'path', points: [] }), null);
  const sticky = cleanObject({ id: 's', type: 'sticky', x: 1, y: 2, w: 9999, h: -50, text: 'x'.repeat(5000), color: 'red', fill: 'javascript:alert(1)', extra: 'dropped' });
  assert.equal(sticky.w, 800);
  assert.equal(sticky.h, 40);
  assert.equal(sticky.text.length, 2000);
  assert.equal(sticky.color, '#1f3b2a');
  assert.equal(sticky.fill, '#FFF4B8');
  assert.equal(sticky.extra, undefined);
  const path = cleanObject({ type: 'path', points: Array.from({ length: 5000 }, () => ({ x: 1e9, y: 1 })) });
  assert.ok(path.points.length <= 4000);
  assert.equal(path.points[0].x, 100000);
  const state = cleanState({ objects: [sticky, { type: 'nope' }], viewport: { zoom: 99, x: 'bad' } });
  assert.equal(state.objects.length, 1);
  assert.equal(state.viewport.zoom, 5);
  assert.equal(state.viewport.x, 0);
});

test('delta ops add, update, delete and clear objects in order', () => {
  const base = [{ id: 'a', type: 'sticky', x: 0, y: 0, text: 'one' }, { id: 'b', type: 'text', x: 0, y: 0, text: 'two' }];
  let objects = applyOps(base, [
    { type: 'add', object: { id: 'c', type: 'rect', x: 1, y: 1, w: 20, h: 10 } },
    { type: 'update', id: 'a', patch: { text: 'changed' } },
    { type: 'delete', id: 'b' }
  ]);
  assert.equal(objects.length, 2);
  assert.equal(objects.find((o) => o.id === 'a').text, 'changed');
  assert.equal(objects.find((o) => o.id === 'c').type, 'rect');
  objects = applyOps(objects, [{ type: 'clear' }]);
  assert.equal(objects.length, 0);
});

test('boards can be renamed, archived, duplicated by the client and deleted', async () => {
  const { client, organisationId } = await principal();
  const board = await createBoard(client, organisationId, 'Manage me');
  const renamed = await client.patch('/whiteboards/' + board.id, { title: 'Renamed board' }, { organisationId });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.title, 'Renamed board');
  const archived = await client.patch('/whiteboards/' + board.id, { isArchived: true }, { organisationId });
  assert.equal(archived.status, 200);
  const list = await client.get('/whiteboards', { organisationId });
  assert.ok(!list.data.some((b) => b.id === board.id), 'archived boards are hidden by default');
  const withArchived = await client.get('/whiteboards?archived=true', { organisationId });
  assert.ok(withArchived.data.some((b) => b.id === board.id && b.isArchived));
  const restored = await client.patch('/whiteboards/' + board.id, { isArchived: false }, { organisationId });
  assert.equal(restored.data.isArchived, false);
  const deleted = await client.delete('/whiteboards/' + board.id, { organisationId });
  assert.equal(deleted.status, 200);
  assert.equal((await client.get('/whiteboards/' + board.id, { organisationId })).status, 404);
});

test('delta saves increment version and reject stale writes with 409', async () => {
  const { client, organisationId } = await principal();
  const board = await createBoard(client, organisationId, 'Delta board');
  const saved = await client.put('/whiteboards/' + board.id + '/state', {
    ops: [{ type: 'add', object: { id: 'new', type: 'circle', cx: 10, cy: 10, rx: 5, ry: 5 } }],
    viewport: { x: 3, y: 4, zoom: 2 },
    version: board.version
  }, { organisationId });
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  assert.equal(saved.data.objectCount, 3);
  assert.equal(saved.data.version, board.version + 1);
  assert.equal(saved.data.state.viewport.zoom, 2);
  const stale = await client.put('/whiteboards/' + board.id + '/state', {
    ops: [{ type: 'clear' }], version: board.version
  }, { organisationId });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.conflict, true);
  assert.ok(stale.data.latest.version >= saved.data.version);
  await client.delete('/whiteboards/' + board.id, { organisationId });
});

test('version history is bounded, listed and restorable', async () => {
  const { client, organisationId } = await principal();
  const board = await createBoard(client, organisationId, 'History board');
  await client.put('/whiteboards/' + board.id + '/state', {
    ops: [{ type: 'clear' }], version: board.version, label: 'Before clearing'
  }, { organisationId });
  const history = await client.get('/whiteboards/' + board.id + '/snapshots', { organisationId });
  assert.equal(history.status, 200);
  assert.ok(history.data.length >= 1);
  assert.equal(history.data[0].label, 'Before clearing');
  const before = (await client.get('/whiteboards/' + board.id, { organisationId })).data;
  assert.equal(before.state.objects.length, 0);
  const restored = await client.post('/whiteboards/' + board.id + '/snapshots/' + history.data[0].id + '/restore', {}, { organisationId });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.state.objects.length, 2, 'cleared work is recoverable');
  assert.ok(restored.data.version > before.version);
  await client.delete('/whiteboards/' + board.id, { organisationId });
});

test('the list projection stays light and reports object counts', async () => {
  const { client, organisationId } = await principal();
  const board = await createBoard(client, organisationId, 'Projection board');
  const list = await client.get('/whiteboards', { organisationId });
  const row = list.data.find((b) => b.id === board.id);
  assert.equal(row.objectCount, 2);
  assert.equal(row.state, undefined);
  await client.delete('/whiteboards/' + board.id, { organisationId });
});
