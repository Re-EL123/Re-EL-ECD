'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const view = read('apps/web/src/views/whiteboards.js');
const css = read('apps/web/assets/styles.css');
const api = read('apps/api/src/modules/whiteboards.js');

test('the editor is canvas-first with a slim sticky bar', () => {
  assert.match(view, /class="wb-teach-shell/);
  assert.match(view, /<header class="wb-topbar">/);
  assert.ok(!view.includes('R.pageHead(esc(b.title'), 'no big page head in the editor');
  assert.match(css, /body\.wb-teaching \{ overflow: hidden; \}/);
  assert.match(css, /\.wb-canvas-wrap \{ position: absolute; inset: 100px 0 0/);
  assert.ok(!view.includes('height:70vh'), 'canvas is no longer capped at 70vh');
  assert.match(css, /\.wb-topbar \{[\s\S]{0,200}height: 54px/);
});

test('canvas rendering is theme-aware', () => {
  assert.match(view, /function palette\(\)/);
  assert.match(view, /document\.documentElement\.getAttribute\('data-theme'\) === 'dark'/);
  assert.match(view, /bg: '#26322a'/);
  assert.match(view, /stickyText:/);
  assert.match(view, /resolvedColor\(o, pal\)/);
  assert.ok(!view.includes("ctx.fillStyle = '#fafbf8'; ctx.fillRect"), 'hardcoded light background gone');
});

test('present is a live annotated board, not a screenshot', () => {
  assert.match(view, /wb-presentation/);
  assert.match(view, /newBoardCanvas\(stage, engine\.getState\(\)/);
  assert.match(view, /data-present="laser"/);
  assert.match(view, /tool === 'laser'/);
  assert.match(view, /laser\.filter\(\(p\) => now - p\.t < 900\)/);
  assert.match(view, /presentEngine\.fitToContent\(\)/);
  assert.match(css, /\.wb-present-stage \{ position: relative/);
});

test('the tool strip is a single scrollable row', () => {
  assert.match(view, /class="wb-tool-strip"/);
  assert.match(css, /\.wb-tool-strip \{[\s\S]{0,220}overflow-x: auto/);
  assert.ok(!view.includes('wb-group-label'), 'group labels moved out of the strip');
  assert.match(view, /wb-inspector-board/);
  assert.match(view, /wb-inspector-object/);
});

test('layers panel supports select, hide, lock, reorder and grouping', () => {
  assert.match(view, /id="wb-layers"/);
  assert.match(view, /wb-layer-row/);
  assert.match(view, /data-layer-hide/);
  assert.match(view, /data-layer-lock/);
  assert.match(view, /toggleHidden\(id\)/);
  assert.match(view, /toggleLocked\(id\)/);
  assert.match(view, /reorderObject\(id, targetId\)/);
  assert.match(view, /groupSelected\(\)/);
  assert.match(view, /setSelectedIds\(ids\)/);
  assert.match(view, /e\.shiftKey && hit/);
});

test('richer insert and object styling are wired', () => {
  assert.match(view, /image: \{ label: 'Image'/);
  assert.match(view, /insertTemplate\(kind\)/);
  assert.match(view, /data-swatch=/);
  assert.match(view, /wb-obj-font/);
  assert.match(view, /font: font \|\| 'sans'/);
  assert.match(api, /case 'image'/);
  assert.match(api, /groupId: typeof raw\.groupId/);
  assert.match(api, /hidden: raw\.hidden === true/);
});

test('zoom UI, fit and minimap exist', () => {
  assert.match(view, /id="wb-zoom"/);
  assert.match(view, /id="wb-fit"/);
  assert.match(view, /fitToContent\(\)/);
  assert.match(view, /class="wb-minimap"/);
  assert.match(view, /function drawMinimap/);
  assert.match(view, /setViewport\(next\)/);
});

test('presence, named history and print handout are implemented', () => {
  assert.match(api, /router\.post\('\/whiteboards\/:id\/presence'/);
  assert.match(api, /router\.get\('\/whiteboards\/:id\/presence'/);
  assert.match(view, /wb-presence-peer/);
  assert.match(view, /id="wb-version-name"/);
  assert.match(view, /wb-history-thumb/);
  assert.match(view, /handout-page/);
  assert.match(view, /Save version/);
  assert.match(css, /\.handout-page \{ break-after: page/);
  const migration = fs.readFileSync(path.join(root, 'packages/database/migrations/050_whiteboard_presence.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS whiteboard_presence/);
});

test('read-only mode is explicit', () => {
  assert.match(view, /wb-readonly-banner/);
  assert.match(view, /View only — you can look around but cannot edit/);
  assert.match(css, /\.wb-readonly \.wb-tool/);
  assert.match(view, /engine\.setReadOnly\(!canEdit\)/);
});
