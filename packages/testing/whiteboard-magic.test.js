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
const storage = read('apps/api/src/services/storage-service.js');
const index = read('apps/web/index.html');

// Load the browser recognition module with a minimal window stub.
global.window = { Reel: {} };
require(path.join(root, 'apps/web/src/wb-recognition.js'));
const recognition = global.window.Reel.wbRecognition;
const P = (x, y) => ({ x, y });

function result(strokes) { return recognition.recognise(strokes); }

test('recognises clean shapes from freehand strokes', () => {
  assert.equal(result([[P(50,10),P(75,20),P(88,45),P(82,72),P(58,88),P(30,82),P(14,58),P(16,32),P(32,14),P(50,10)]].map((s) => s)).shape, 'circle');
  assert.equal(result([[P(20,20),P(80,20),P(80,80),P(20,80),P(20,20)]]).shape, 'square');
  assert.equal(result([[P(15,50),P(85,50)]]).shape, 'line');
});

test('recognises handwritten letters, numbers and symbols', () => {
  assert.equal(result([[P(15,90),P(50,10),P(85,90)], [P(30,62),P(70,62)]]).label, 'A');
  assert.equal(result([[P(28,30),P(50,12),P(50,90)], [P(25,90),P(76,90)]]).label, '1');
  assert.equal(result([[P(20,50),P(80,50)], [P(50,20),P(50,80)]]).label, '+');
  assert.equal(result([[P(18,16),P(82,16),P(44,92)]]).label, '7');
  assert.ok(recognition.templates >= 40, 'covers letters, numbers and symbols');
});

test('magic tool converts a stroke and can clean up a selection', () => {
  assert.match(view, /magic: \{ label: 'Magic writing'/);
  assert.match(view, /tool === 'magic'/);
  assert.match(view, /drawing\.magic && applyRecognition/);
  assert.match(view, /function applyRecognition\(strokes, removeIds\)/);
  assert.match(view, /recogniseSelected\(\)/);
  assert.match(view, /id="wb-recognise"/);
  assert.match(view, /R\.wbRecognition/);
  assert.match(index, /src="src\/wb-recognition\.js/);
});

test('the image tool accepts uploads, drops and pastes', () => {
  assert.match(view, /data-wb-upload/);
  assert.match(view, /type="file" accept="image\/jpeg,image\/png,image\/webp,image\/gif,image\/avif"/);
  assert.match(view, /R\.uploadMedia\(file, \{ scope: 'whiteboard'/);
  assert.match(view, /onImageFile\(file, at\) \{ uploadImageFile\(file, at\); \}/);
  assert.match(view, /addEventListener\('drop', onCanvasDrop\)/);
  assert.match(view, /addEventListener\('paste', onCanvasPaste\)/);
  assert.match(view, /imageFilesFrom\(event\)/);
  assert.match(css, /\.wb-canvas-wrap\.wb-drop-target/);
});

test('whiteboard image sources accept uploaded media proxy URLs', () => {
  assert.match(storage, /'nursery-rhyme', 'whiteboard', 'general'/);
  assert.match(api, /MEDIA_PROXY = \/\^\\\/api\\\/v1\\\/media\\\/object/);
  assert.match(api, /safeImageSrc\(raw\.src\)/);
  assert.doesNotMatch(api, /if \(!\/\^https\?:\\\/\\\/\/\.test\(String\(raw\.src/);
  assert.match(view, /function safeImageSrc\(value\)/);
  assert.match(view, /org\(\?:%2F\|\\\/\)\[0-9a-f-\]\{36\}\(\?:%2F\|\\\/\)\/i/);
  assert.match(api, /org\(\?:%2F\|\\\/\)\[0-9a-f-\]\{36\}\(\?:%2F\|\\\/\)\/i/);
  assert.match(view, /addImage\(url, \{ at, w, h \}\)/);
});
