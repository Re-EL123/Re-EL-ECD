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
  assert.match(view, /class="wb-style-bar"/);
  assert.match(view, /id="wb-object-fields"/);
});

test('layers panel supports select, hide, lock, reorder and grouping', () => {
  assert.match(view, /data-dock-panel="layers"/);
  assert.match(view, /wb-layer-row/);
  assert.match(view, /data-layer-hide/);
  assert.match(view, /data-layer-lock/);
  assert.match(view, /toggleHidden\(id\)/);
  assert.match(view, /toggleLocked\(id\)/);
  assert.match(view, /reorderObject\(id, targetId, after\)/);
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

test('controls live in a labelled dock instead of floating over the canvas', () => {
  assert.match(view, /class="wb-dock" id="wb-dock"/);
  assert.match(view, /data-dock-tab="layers"/);
  assert.match(view, /data-dock-tab="history"/);
  assert.match(view, /id="wb-dock-collapse"/);
  assert.match(view, /openDock\(tab, persist\)/);
  assert.match(view, /Style stays with the tools and is always visible/);
  assert.match(view, /Click a row to select it\. Drag to change what sits on top/);
  assert.match(view, /Versions save automatically as you work/);
  assert.match(view, /Overview · click to jump/);
  assert.match(view, /Space \+ drag to pan/);
  assert.match(css, /\.wb-canvas-wrap \{ right: 288px; \}/);
  assert.match(css, /\.wb-teach-shell\.wb-dock-collapsed \.wb-canvas-wrap \{ right: 0; \}/);
  assert.match(css, /\.wb-dock-panel\[hidden\]/);
  assert.match(css, /\.wb-actions-labelled \.btn/);
  assert.match(view, /aria-label="Undo"/);
  assert.match(view, /aria-label="Redo"/);
});

test('changing the selection never resets the board style controls', () => {
  assert.match(view, /Style stays with the tools and is always visible/);
  assert.ok(!view.includes('inspectorBoard.hidden'), 'board style is never hidden on selection');
  assert.ok(!view.includes('inspectorObject.hidden'), 'style section is never replaced');
  assert.match(view, /objectFields\.hidden = selected\.length === 0/);
  assert.match(css, /\.wb-selection-bar\[hidden\] \{ display: none !important; \}/);
  assert.match(css, /\.wb-style-bar \{[\s\S]{0,220}overflow-x: auto/);
});

test('the Objects list uses content labels, search, groups and clear states', () => {
  assert.match(view, /function describeObject\(o\)/);
  assert.match(view, /label: first \|\| 'Sticky note'/);
  assert.match(view, /label: 'Freehand stroke'/);
  assert.match(view, /id="wb-layer-search"/);
  assert.match(view, /id="wb-layer-filter"/);
  assert.match(view, /id="wb-layer-count"/);
  assert.match(view, /class="wb-layer-grip"/);
  assert.match(view, /data-group-toggle/);
  assert.match(view, /is-selected/);
  assert.match(view, /is-hidden/);
  assert.match(view, /data-layer-menu/);
  assert.match(view, /Bring to front/);
  assert.match(view, /Duplicate/);
  assert.match(css, /\.wb-layer-row\.is-selected \{ background: var\(--reel-green-100\); box-shadow: inset 3px 0 0 var\(--reel-green-700\); \}/);
  assert.match(css, /\.wb-layer-row\.is-hidden \{ opacity: \.5; \}/);
  assert.match(css, /\.wb-dock \.wb-layer-list \{[\s\S]{0,140}overflow-y: auto/);
});

test('selected-object properties live in the dock, not the style bar', () => {
  assert.match(view, /class="wb-properties"/);
  assert.match(view, /id="wb-properties-empty"/);
  assert.match(view, /id="wb-sel-summary"/);
  assert.match(view, /describeObject\(first\)\.label/);
  const styleStart = view.indexOf('class="wb-style-bar"');
  const styleEnd = view.indexOf("// Reference dock", styleStart);
  assert.ok(view.slice(styleStart, styleEnd).indexOf('wb-object-fields') === -1, 'style bar has no object controls');
  assert.match(css, /\.wb-selection-bar \{ display: block; \}/);
});

test('primary tools are pinned and secondary tools live in a More flyout', () => {
  assert.match(view, /const PRIMARY_TOOLS = \[/);
  assert.match(view, /const SECONDARY_TOOLS = \[/);
  assert.match(view, /id="wb-more-menu"/);
  assert.match(view, /class="wb-tool-group-name"/);
  assert.ok(!view.includes('wb-group-label'), 'group captions use a distinct class');
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(css, /\.wb-more-menu\[hidden\] \{ display: none !important; \}/);
});

test('undo/redo state and the dock layout are remembered', () => {
  assert.match(view, /function updateHistoryState\(\)/);
  assert.match(view, /u\.disabled = !engine \|\| !engine\.canUndo\(\)/);
  assert.match(view, /r\.disabled = !engine \|\| !engine\.canRedo\(\)/);
  assert.match(view, /const dockKey = 'reel-wb-dock-' \+ board\.id/);
  assert.match(view, /localStorage\.setItem\(dockKey/);
  assert.match(view, /localStorage\.getItem\(dockKey\)/);
});

test('drag and resize snapshot before mutation and undo keeps selection', () => {
  assert.ok(view.indexOf('if (!drawing.moved) { pushUndo(); drawing.moved = true; }') !== -1, 'undo snapshot on first move');
  assert.match(view, /if \(drawing\.drag \|\| drawing\.resize\) \{ notify\(\); drawing = null; render\(\); return; \}/);
  assert.match(view, /const prior = Array\.from\(selectedIds\);\s*redo\.push/);
  assert.match(view, /selectedIds = new Set\(prior\.filter\(\(id\) => alive\.has\(id\)\)\)/);
});

test('groups behave as a unit and can be ungrouped', () => {
  assert.match(view, /function expandIds\(ids\)/);
  assert.match(view, /const ids = expandIds\(selectedIds\)/);
  assert.match(view, /ungroupSelected\(\)/);
  assert.match(view, /id="wb-ungroup"/);
  assert.match(view, /selectedIds = expandIds\(\[hit\.id\]\)/);
  assert.match(view, /o\.groupId \? 'This item belongs to a group/);
});

test('reorder drops at the indicated position', () => {
  assert.match(view, /const insert = \(from < to \? to - 1 : to\) \+ \(after \? 1 : 0\)/);
  assert.match(view, /classList\.add\(e\.clientY > rect\.top \+ rect\.height \/ 2 \? 'drop-after' : 'drop-before'\)/);
  assert.match(css, /\.wb-layer-row\.drop-before \{ box-shadow: inset 0 2px 0 var\(--reel-green-700\); \}/);
});

test('labels keep the first line of multi-line text', () => {
  assert.match(view, /String\(\(o && o\.text\) \|\| ''\)\.split\('\\n'\)\[0\]/);
});

test('hit testing follows strokes instead of bounding boxes', () => {
  assert.match(view, /function pointSegmentDistance\(p, a, b\)/);
  assert.match(view, /function strokeHit\(o, p, tol\)/);
  assert.match(view, /function rectsIntersect\(a, b\)/);
  assert.match(view, /if \(strokeHit\(o, wpt, tol\)\) return o;/);
});

test('marquee selection, nudging, duplication and align/distribute are wired', () => {
  assert.match(view, /let marquee = null;/);
  assert.match(view, /if \(marquee\) \{ marquee\.current = wpt; render\(\); return; \}/);
  assert.match(view, /rectsIntersect\(b, box\)/);
  assert.match(view, /nudgeSelected\(dx, dy\)/);
  assert.match(view, /arrows\[e\.key\]/);
  assert.match(view, /e\.key\.toLowerCase\(\) === 'd'/);
  assert.match(view, /alignSelected\(mode\)/);
  assert.match(view, /distributeSelected\(axis\)/);
  assert.match(view, /data-align="left"/);
  assert.match(view, /data-distribute="h"/);
});

test('objects list supports range select and keeps the selected row visible', () => {
  assert.match(view, /e\.shiftKey && rowAnchor/);
  assert.match(view, /e\.ctrlKey \|\| e\.metaKey/);
  assert.match(view, /function ensureSelectedVisible\(\)/);
  assert.match(view, /layersList\.scrollTop \+= \(rowRect\.bottom - listRect\.bottom\) \+ 4/);
  assert.match(view, /collapsedGroups\.delete\(o\.groupId\)/);
});

test('properties are type-aware and the eraser has its own settings', () => {
  assert.match(view, /function updateTypeFields\(first\)/);
  assert.match(view, /data-field="fill"/);
  assert.match(view, /show\('fill', types\.has\('sticky'\)\)/);
  assert.match(view, /id="wb-properties-select"/);
  assert.match(view, /id="wb-eraser-group"/);
  assert.match(css, /\.wb-eraser-group\[hidden\] \{ display: none !important; \}/);
  assert.match(view, /setEraserMode\(e\.target\.value\)/);
  assert.match(view, /id="wb-recent-colours"/);
  assert.match(view, /const ringTool = !readOnly && \['pen', 'highlighter', 'eraser'\]/);
});
