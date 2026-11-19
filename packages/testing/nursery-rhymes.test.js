'use strict';

/**
 * Nursery rhyme library: static-source and VM tests. The frontend has no
 * bundler, so these load the classic scripts the same way the browser does
 * and assert the classroom-first contract rather than implementation detail.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const webRoot = path.join(__dirname, '..', '..', 'apps', 'web');
const read = (relative) => fs.readFileSync(path.join(webRoot, relative), 'utf8');

function loadReel(...files) {
  const context = { window: {}, document: {}, console };
  files.forEach((file) => vm.runInNewContext(read(file), context, { filename: file }));
  return context.window.Reel;
}

const data = loadReel('src/nursery-rhymes-data.js');
const full = loadReel('src/nursery-rhymes-data.js', 'src/nursery-rhymes-meta.js');
const viewSource = read('src/views/nursery-rhymes.js');
const playerSource = read('src/rhyme-player.js');
const appSource = read('src/app.js');
const index = read('index.html');
const styles = read('assets/styles.css');

test('the library ships 33 complete, well-formed rhymes', () => {
  assert.equal(data.nurseryRhymes.all.length, 33);
  data.nurseryRhymes.all.forEach((rhyme) => {
    assert.ok(rhyme.id && /^[a-z0-9-]+$/.test(rhyme.id), rhyme.title);
    assert.ok(rhyme.title, rhyme.id);
    assert.ok(Array.isArray(rhyme.lyrics) && rhyme.lyrics.length >= 4, rhyme.title);
    assert.ok(rhyme.lyrics.some((line) => line.trim()), rhyme.title);
    assert.ok(rhyme.actions, rhyme.title);
    assert.ok(rhyme.source, rhyme.title);
    assert.ok(!rhyme.lyrics.some((line) => line.includes('…')), 'no placeholder ellipsis: ' + rhyme.title);
  });
});

test('formerly truncated songs now carry their full verses', () => {
  const find = (id) => data.nurseryRhymes.find(id);
  const stanzas = (rhyme) => rhyme.lyrics.join('\n').split(/\n\s*\n/).filter(Boolean).length;
  assert.ok(stanzas(find('twinkle')) >= 6, 'Twinkle has all stanzas');
  assert.ok(stanzas(find('mary-lamb')) >= 4, 'Mary has all stanzas');
  assert.ok(stanzas(find('old-macdonald')) >= 6, 'Old MacDonald has every animal');
  assert.ok(stanzas(find('wheels-bus')) >= 6, 'Wheels has every verse');
  assert.ok(stanzas(find('five-monkeys')) === 5, 'Monkeys count down from five');
  assert.ok(stanzas(find('finger-family')) === 5, 'All five family fingers');
  assert.ok(stanzas(find('this-old-man')) === 10, 'This Old Man counts to ten');
  assert.ok(stanzas(find('happy-you-know')) === 4, 'Happy has four actions');
});

test('meta supplies use-case tags, duration bands and personal curation', () => {
  const m = full.rhymeMeta;
  assert.deepEqual([...m.TAGS], ['Calm down', 'Energise', 'Transition', 'Bedtime', 'Circle time']);
  assert.deepEqual([...m.BANDS], ['Under 2 min', '2–4 min', 'Over 4 min']);
  assert.ok([...m.tagsFor(full.nurseryRhymes.find('twinkle'))].includes('Bedtime'));
  assert.ok(m.tagsFor(full.nurseryRhymes.find('itsy-bitsy')).includes('Energise'));
  assert.ok(m.BANDS.includes(m.bandFor(full.nurseryRhymes.find('old-macdonald'))));
  assert.equal(m.popularRank(full.nurseryRhymes.find('twinkle')), 0);
  assert.equal(typeof m.toggleFavourite, 'function');
  assert.equal(typeof m.remember, 'function');
  assert.equal(typeof m.request, 'function');
});

test('organisation-added rhymes replace cleanly and rebuild categories', () => {
  const lib = full.nurseryRhymes;
  const before = lib.all.length;
  lib.setCustom([{ id: 'custom-one', title: 'Our Song', category: 'Other', lyrics: ['One', 'Two'], tags: ['Circle time'] }]);
  assert.equal(lib.all.length, before + 1);
  assert.ok(lib.categories.includes('Other'));
  assert.ok(lib.find('custom-one'));
  assert.equal(lib.find('custom-one').custom, true);
  lib.setCustom([{ id: 'custom-two', title: 'Another Song', lyrics: ['A', 'B'] }]);
  assert.equal(lib.all.length, before + 1, 'old custom rhymes are removed');
  assert.equal(lib.find('custom-one'), null);
  assert.ok(lib.find('custom-two'));
  lib.setCustom([]);
  assert.equal(lib.all.length, before);
});

test('the card UI has two primary controls, no native audio element', () => {
  assert.ok(viewSource.includes('data-rhyme-play='), 'a dedicated Play button');
  assert.ok(viewSource.includes('openRhymeReader('), 'a Read lyrics button');
  assert.ok(!viewSource.includes('<audio controls'), 'native audio controls are gone');
  assert.ok(viewSource.includes('rhymeMenu('), 'per-card overflow menu');
  assert.ok(viewSource.includes('rhyme-manage'), 'admin controls live behind Manage mode');
  assert.ok(viewSource.includes('Request this song'), 'friendly missing-audio state');
  assert.ok(viewSource.includes('Get audio / sheet music'), 'licensing link is on the card');
  assert.ok(viewSource.includes('rhyme-chip-scroll'), 'scrollable filter chips');
  assert.ok(viewSource.includes('toggleRhymeFav('), 'favourites');
  assert.ok(viewSource.includes('printRhymeSongbook()'), 'songbook printing');
  assert.ok(viewSource.includes('rhymeAdd'), 'org-added rhyme form');
});

test('one shared player handles transport, queue, errors and the reader', () => {
  assert.ok(playerSource.includes('const audio = new Audio()'), 'a single audio element');
  assert.ok(playerSource.includes("audio.addEventListener('error'"), 'audio failure is detected');
  assert.ok(playerSource.includes('function retry()'), 'inline retry');
  assert.ok(playerSource.includes('function enqueue('), 'session queue');
  assert.ok(playerSource.includes('function toggleLoop('), 'loop toggle');
  assert.ok(playerSource.includes('function setVolume('), 'volume control');
  assert.ok(playerSource.includes('rhyme-reader-backdrop'), 'lyrics reader');
  assert.ok(playerSource.includes('projectReader()'), 'project mode');
  assert.ok(playerSource.includes('is-sung'), 'line-by-line highlight');
  assert.ok(playerSource.includes('rhyme-now-playing'), 'pinned now-playing bar');
});

test('the app wires every classroom handler', () => {
  [
    'playRhyme', 'openRhymeReader', 'toggleRhymeFav', 'requestRhyme', 'recordRhymeAudio',
    'rhymeMenu', 'rhymeMoreMenu', 'toggleRhymeManage', 'toggleRhymeSelect',
    'toggleRhymeSelected', 'clearRhymeSelection', 'printRhymeSongbook', 'deleteRhyme'
  ].forEach((name) => assert.match(appSource, new RegExp('\\n\\s+(?:async\\s+)?' + name + '\\(')));
  assert.ok(appSource.includes('rhymePlayer.init()'));
  assert.ok(appSource.includes('.slice(0, 12)'), 'stagger is capped');
});

test('accessibility fixes are present in the shell and CSS', () => {
  assert.match(index, /<main class="main" id="main-content">/);
  assert.ok(!/topbar-search[^>]*aria-label="Search"/.test(index), 'search button keeps its visible name');
  assert.match(index, /src\/nursery-rhymes-meta\.js/);
  assert.match(index, /src\/rhyme-player\.js/);
  assert.match(styles, /\.page-sub \{ color: var\(--text\); \}/);
  assert.match(styles, /\.rhyme-card \.card-head h2/);
  assert.match(styles, /\.rhyme-now-playing/);
  assert.match(styles, /\.songbook-cover/);
  assert.match(styles, /min-height: 44px/);
});
