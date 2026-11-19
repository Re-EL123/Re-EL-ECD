'use strict';

/**
 * Whiteboard frontend tests. The convention scripts are loaded in a VM so the
 * canvas engine and the board renderer can be asserted without a browser.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const webRoot = path.join(__dirname, '..', '..', 'apps', 'web');
const read = (relative) => fs.readFileSync(path.join(webRoot, relative), 'utf8');

function loadView() {
  const esc = (v) => String(v == null ? '' : v);
  const context = {
    window: { Reel: { views: {}, esc, attr: esc, icon: (name) => '<i data-lucide="' + name + '"></i>', number: (n) => String(n), relative: () => 'recently', truncate: (v, n) => String(v).slice(0, n), avatar: () => '', icon: (name) => '<i data-lucide="' + name + '"></i>' } },
    document: {}, console
  };
  vm.runInNewContext(read('src/views/whiteboards.js'), context, { filename: 'whiteboards.js' });
  return context.window.Reel;
}

const Reel = loadView();
const source = read('src/views/whiteboards.js');
const app = read('src/app.js');
const css = read('assets/styles.css');
const index = read('index.html');
const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'packages', 'database', 'migrations', '048_whiteboard_history.sql'), 'utf8');

test('the shared renderer fits any object set into a thumbnail', () => {
  const renderer = Reel.whiteboardCanvas;
  assert.ok(renderer && typeof renderer.renderThumbnail === 'function');
  const objects = [
    { id: 'a', type: 'sticky', x: 0, y: 0, w: 100, h: 80, text: 'a' },
    { id: 'b', type: 'circle', cx: 500, cy: 500, rx: 40, ry: 40 }
  ];
  const b = renderer.boardBounds(objects);
  assert.equal(b.x, 0); assert.equal(b.y, 0);
  assert.equal(b.w, 540); assert.equal(b.h, 540);
  const empty = renderer.boardBounds([]);
  assert.ok(empty.w > 0 && empty.h > 0);
});

test('the canvas engine is grouped, inline, pannable andundoable', () => {
  assert.ok(source.includes('const TOOL_GROUPS'), 'grouped toolbar');
  assert.ok(source.includes("hand: { label: 'Pan'"), 'a pan tool exists');
  assert.ok(source.includes("e.code === 'Space'"), 'space-drag pan is wired');
  assert.ok(!source.includes('window.prompt('), 'blocking prompts are gone');
  assert.ok(source.includes('wb-inline-editor'), 'inline text editor');
  assert.ok(source.includes('function diffOps('), 'delta saves');
  assert.ok(source.includes('setReadOnly('), 'read-only engine state');
  assert.ok(source.includes('setSnap('), 'grid snapping');
  assert.ok(source.includes('moveSelected('), 'z-order controls');
  assert.ok(source.includes('updateSelected('), 'per-object styling');
  assert.ok(source.includes('exportPNG('), 'image export');
  assert.ok(source.includes('scaleObjectToBounds('), 'resize handles');
});

test('board cards have previews and a management menu', () => {
  assert.ok(source.includes('<canvas class="wb-thumb"'), 'thumbnail canvas on every card');
  assert.ok(source.includes('wbBoardMenu('), 'per-card actions');
  assert.ok(source.includes('_initWhiteboards'), 'thumbnails are hydrated after render');
  assert.ok(!source.includes('Collaborative</span>'), 'static marketing stat removed');
  assert.ok(source.includes('R.searchFilter(ctx, \'q\''), 'board search');
});

test('templates are reachable from the New whiteboard menu at any time', () => {
  assert.ok(source.includes('templateButton(\'math\')'));
  assert.ok(source.includes('templateButton(\'story\')'));
  assert.ok(source.includes('templateButton(\'rhyme\')'));
  assert.ok(source.includes('templateButton(\'shape\')'));
  assert.ok(app.includes('wbNewMenu(anchor)'), 'menu handler exists');
  assert.match(app, /whiteboardTemplate', 'math'/);
});

test('the editor exposes presentation, history, export and conflict choices', () => {
  assert.ok(source.includes('wb-present-btn'));
  assert.ok(source.includes('wb-export-btn'));
  assert.ok(source.includes('wb-history-btn'));
  assert.ok(source.includes("'Keep my work'"), 'conflict keeps teacher work');
  assert.ok(source.includes("'Use their version'"), 'conflict offers remote state');
  assert.ok(source.includes('Saved just now'), 'live saved status');
  assert.ok(source.includes('Offline — changes queued'));
  assert.ok(source.includes('View only'), 'read-only badge');
});

test('the app wires every whiteboard handler', () => {
  ['wbNewMenu', 'wbBoardMenu', 'wbRenameBoard', 'wbDuplicateBoard', 'wbArchiveBoard', 'wbDeleteBoard'].forEach((name) => {
    assert.match(app, new RegExp('\\n\\s+(?:async\\s+)?' + name + '\\('), name);
  });
  assert.ok(app.includes('views._initWhiteboards'));
});

test('accessibility and mobile polish are present', () => {
  assert.match(css, /\.wb-status \{ color: var\(--text\)/, 'status contrast fixed');
  assert.match(source, /aria-label="Undo"/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.wb-toolbar \{ flex-wrap: nowrap; overflow-x: auto/, 'scrollable toolbar on small screens');
  assert.match(css, /wb-mathbar\[hidden\]/);
  assert.match(index, /<main class="main" id="main-content">/);
});

test('history migration is present', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS whiteboard_snapshots/);
  assert.match(migration, /whiteboard_id UUID NOT NULL REFERENCES whiteboards/);
});
