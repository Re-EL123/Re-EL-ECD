'use strict';

/**
 * Today workspace: static-source invariants for the trust, navigation and
 * accessibility changes. The frontend is convention scripts with no bundler,
 * so source assertions are the appropriate level here.
 */

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const view = read('apps/web/src/views/today.js');
const app = read('apps/web/src/app.js');
const css = read('apps/web/assets/styles.css');
const organisation = read('apps/api/src/modules/organisation.js');

test('the live badge text is set directly, with stale animations cleared', () => {
  const block = app.slice(app.indexOf('syncTodayLive() {'), app.indexOf('stopTodayLive() {'));
  assert.ok(!block.includes('contentTransition('), 'no interrupted WAAPI transition on the ticker');
  assert.ok(block.includes('label.getAnimations()'), 'stale animations are cancelled');
  assert.ok(block.includes('label.textContent = text'), 'text is painted directly');
});

test('silent refresh never swaps the DOM during a gesture', () => {
  const block = app.slice(app.indexOf('async refreshSilent()'), app.indexOf('syncTodayLive() {'));
  assert.ok(block.includes('this._todayInteracting'), 'interaction guard checked');
  assert.ok(app.includes('initTodayInteractionGuard()'), 'guard is installed');
  assert.ok(app.includes("pointerdown'"), 'pointer down tracked');
  assert.ok(app.includes("pointerup'"), 'pointer release tracked');
});

test('the day meter counts blocks, register, reports and evidence', () => {
  assert.ok(view.includes('registerPart'), 'register is part of the meter');
  assert.ok(view.includes('reportPart'), 'reports are part of the meter');
  assert.ok(view.includes('evidencePart'), 'moments are part of the meter');
  assert.ok(view.includes('blockPart'), 'blocks are part of the meter');
  assert.match(view, /\(blockPart \+ registerPart \+ reportPart \+ evidencePart\) \/ 4/, 'four-way average');
  assert.ok(/register ·/.test(view), 'the breakdown explains the number');
  assert.ok(view.includes('moments</span>'), 'moments shown in the meter meta');
});

test('empty data is shown honestly', () => {
  assert.ok(view.includes("attendance.marked ? R.percent(attendance.rate) : '—'"));
  assert.ok(view.includes('Awaiting register — no data yet'));
  assert.ok(view.includes('Nothing coming up'), 'past/completed events are filtered');
  assert.ok(view.includes('upcomingWhen(event, page)'), 'future events show their date, not just a time');
  assert.ok(view.includes("e.status === 'completed' || e.status === 'cancelled'"), 'completed events excluded');
  assert.ok(view.includes('noTodayData'), 'chart gap for today');
  assert.ok(view.includes('the open gap marks today'), 'today has no fake zero — the gap is explained in the subtitle');
  assert.ok(view.includes('Attendance · last 14 days'), 'chart period in the title');
});

test('dashboard cards flow without holes', () => {
  assert.ok(view.includes('today-dash-grid'), 'two-column dashboard grid');
  assert.ok(!view.includes('<div class="split section">'), 'the old lopsided split is gone');
  assert.match(css, /\.today-dash-grid \{ align-items: start; \}/);
});

test('a sticky jump rail navigates the long page', () => {
  assert.ok(view.includes('renderJumpBar(order)'), 'jump bar rendered');
  assert.match(view, /class="today-jump" id="today-jump"/);
  assert.ok(app.includes('initTodayJump()'), 'active-section observer installed');
  assert.ok(app.includes('IntersectionObserver'), 'observer used');
  ['today-hero', 'today-stats', 'today-suggestions', 'today-dashboard', 'today-prep', 'today-register', 'today-insights', 'today-focus', 'today-upnext', 'today-schedule', 'today-wrapup'].forEach((id) => {
    assert.ok(view.includes(id), 'section id ' + id);
  });
});

test('sections are ordered by time of day and can be folded away', () => {
  assert.ok(view.includes('phaseOrder(tod.phase)'), 'phase-based ordering');
  assert.ok(view.includes("['hero', 'timeline', 'upNext'"), 'today activities lead the page');
  assert.ok(view.includes("phase === 'dawn' || phase === 'morning'"), 'morning order');
  assert.ok(view.includes("phase === 'dusk' || phase === 'night'"), 'evening order');
  assert.ok(view.includes('collapsible('), 'collapsible wrapper');
  assert.ok(view.includes('today-wrapup-fold') && view.includes('today-prep-fold'));
});

test('hero tiles are real buttons with a handler', () => {
  assert.ok(view.includes('data-tile="'), 'tiles carry a key');
  assert.ok(view.includes('todayTile('), 'tiles call todayTile');
  assert.ok(app.includes('todayTile(key)'), 'handler exists');
  assert.ok(app.includes('todayWeather()'), 'weather detail handler');
});

test('charts are labelled with their real period and show evidence', () => {
  assert.ok(view.includes("'Register (today)', 'Observations (month)', 'Reports (month)'"));
  assert.ok(view.includes('Progress snapshot'), 'monthly chart renamed');
  assert.ok(view.includes('Moments captured'), 'evidence layer on the doughnut');
  assert.ok(view.includes('evidenceDone'), 'evidence total computed');
});

test('suggestions can be completed or snoozed for the session', () => {
  assert.ok(view.includes('reel.today.suggestions'), 'session state key');
  assert.ok(view.includes('data-suggest-key='), 'stable row keys');
  assert.ok(view.includes("saved[suggestionKey(s.text)] !== 'done'"), 'done rows hidden');
  assert.ok(view.includes('is-snoozed'), 'snoozed styling');
  assert.ok(app.includes('todaySuggestDone(key)') && app.includes('todaySuggestSnooze(key)'));
});

test('calendar events backfill the timeline and completed blocks are viewable', () => {
  assert.ok(view.includes('calendarEventToBlock'), 'calendar rows are mapped to timeline blocks');
  assert.ok(view.includes('!have.has(e.id)'), 'only missing events are added, no duplicates');
  assert.ok(view.includes('toggleTodayCompleted()'), 'normal deck has a completed toggle');
  assert.ok(app.includes('toggleTodayCompleted()'), 'completed toggle handler exists');
  assert.ok(view.includes('Completed earlier today'), 'completed list has an honest heading');
  assert.match(css, /\.deck-details \.deck-print, \.deck-completed \.deck-print \{ display: block/, 'expanded lists are actually visible');
});

test('the all-complete deck is compact and mobile has a swipe hint', () => {
  assert.ok(view.includes('today-deck-empty'), 'compact summary replaces the giant empty state');
  assert.ok(view.includes('moments captured'), 'evidence in the summary');
  assert.ok(view.includes('toggleTodayDeckDetails()'), 'expand control');
  assert.ok(app.includes('toggleTodayDeckDetails()'));
  assert.ok(view.includes('deck-swipe-hint'), 'mobile hint');
  assert.match(css, /\.deck-swipe-hint \{ display: flex; \}/);
});

test('accessibility fixes and the day print pack are present', () => {
  assert.match(css, /\.alert-info \{ color: #155e78/, 'alert contrast');
  assert.match(css, /\.empty-state, \.empty-state p \{ color: var\(--text\)/, 'empty state contrast');
  assert.match(css, /\.today-collapse-btn \.muted \{[^}]*color: var\(--text\)/, 'collapse label contrast');
  assert.ok(view.includes('sr-only'), 'heading order anchor');
  assert.ok(view.includes('Print day pack'), 'single print action');
  assert.ok(app.includes('printDayPack()'), 'print handler');
  assert.ok(app.includes('today-print-sheet'), 'print sheet');
  assert.ok(view.includes('u.childName || u.guardianFirst'), 'named families');
});

test('the API writes grammatical alert copy', () => {
  assert.match(organisation, /application\$\{applications\.total === 1 \? '' : 's'\} await\$\{applications\.total === 1 \? 's' : ''\} review/);
});

test('today activities launch the full lesson workspace', () => {
  assert.ok(view.includes('openLesson('), 'cards launch the lesson workspace');
  assert.ok(view.includes('Teach full lesson'), 'primary card action is teaching');
  assert.ok(view.includes('Open lesson workspace'), 'up-next launches the workspace');
  assert.ok(app.includes('async openLesson(blockId)'), 'handler exists');
  assert.ok(app.includes('_lessonBlock'), 'block is passed into the guide');
  assert.ok(app.includes('toolkitOpen: Boolean(block)'), 'toolkit opens with the lesson');
  assert.ok(app.includes('lessonObjectives()') && app.includes('lessonMaterials()'));
  assert.ok(app.includes('lessonCapture(') && app.includes('lessonParticipation()') && app.includes('lessonWhiteboard()'));
  const html = read('apps/web/index.html');
  assert.ok(html.includes('lesson-toolkit'), 'toolkit markup exists');
  assert.match(css, /\.lesson-toolkit-grid \{ display: grid; grid-template-columns: repeat\(2/, 'toolkit grid');
});

test('today shows what is coming after today instead of a dead end', () => {
  assert.ok(view.includes('renderUpcoming(page)'), 'upcoming section rendered');
  assert.ok(view.includes("id=\"today-upcoming\""), 'upcoming section has an anchor');
  assert.ok(view.includes('Nothing more today'), 'up next shows the next future activity');
  assert.ok(view.includes('nothing left today'), 'deck summary is scoped to today');
  assert.ok(view.includes('deck-next-hint'), 'compact empty state hints at the next activity');
  assert.ok(view.includes('Next 14 days'), 'upcoming window is labelled');
  const morning = read('apps/api/src/modules/morning.js');
  assert.ok(morning.includes('const upcomingRows'), 'API returns upcoming activities');
  assert.ok(morning.includes('starts_at >= $2::timestamptz'), 'upcoming starts after today');
  assert.ok(morning.includes('upcoming,') && morning.includes('status IN (\'scheduled\',\'in_progress\')'), 'only live/scheduled upcoming');
});

test('the lesson workspace paints instantly and hydrates steps in the background', () => {
  const appSource = app;
  assert.ok(appSource.includes('buildGuideState('), 'shared guide state builder');
  assert.ok(appSource.includes('shell.loading = Boolean(planId)'), 'shell marks loading state');
  assert.ok(appSource.includes('this.guide = shell'), 'shell is shown before the fetch');
  assert.ok(appSource.includes('hydrateLessonGuide(planId, block)'), 'hydration is deferred');
  assert.ok(appSource.includes("localStorage.getItem('reel.guide.' + planId)"), 'cache-first hydration');
  assert.ok(appSource.includes('duration: 180'), 'fast entry animation');
  const html = read('apps/web/index.html');
  assert.ok(html.includes("'Opening your lesson…'"), 'loading message in the workspace');
});
