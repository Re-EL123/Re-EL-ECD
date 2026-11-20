'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const api = read('apps/api/src/modules/books.js');
const view = read('apps/web/src/views/books.js');
const app = read('apps/web/src/app.js');
const utils = read('apps/web/src/utils.js');
const index = read('apps/web/index.html');
const importer = read('scripts/import-bookdash.mjs');
const css = read('apps/web/assets/styles.css');

test('books are shared from the platform and stored per centre', () => {
  assert.match(api, /router\.get\('\/books'/);
  assert.match(api, /router\.post\('\/books'/);
  assert.match(api, /router\.post\('\/books\/import'/);
  assert.match(api, /router\.patch\('\/books\/:id'/);
  assert.match(api, /router\.delete\('\/books\/:id'/);
  assert.match(api, /hasPermission\(ctx\.access && ctx\.access\.permissions, 'platform\.settings\.manage'\)/);
  assert.match(api, /permission: 'platform\.settings\.manage'/);
});

test('book metadata is validated, including language editions', () => {
  assert.match(api, /book\.editions = \(Array\.isArray\(raw\.editions\)/);
  assert.match(api, /pdfUrl: safeUrl\(e && e\.pdfUrl, 1000\)/);
  assert.match(api, /if \(!book\.title \|\| \(!book\.pdfUrl && !book\.editions\.length\)\) return null;/);
  assert.match(api, /MEDIA_URL = \/\^\\\/api\\\/v1\\\/media\\\/object/);
  assert.match(api, /licence: text\(raw\.licence, 120\) \|\| 'CC BY 4\.0'/);
});

test('Book Dash attribution is stored and displayed', () => {
  assert.match(view, /Writer.*Illustrator.*Designer.*Editor/);
  assert.match(view, /bookdash\.org/);
  assert.match(view, /CC BY 4\.0/);
  assert.match(view, /Read at Book Dash/);
  assert.match(view, /book-credit-logo/);
  assert.match(app, /\[\['Writer', book\.author\], \['Illustrator', book\.illustrator\]/);
});

test('the books view supports multiple language editions', () => {
  assert.match(view, /function editions\(book\)/);
  assert.match(view, /function allLanguages\(books\)/);
  assert.match(view, /book-lang-count/);
  assert.match(view, /data-language/);
  assert.match(app, /book-editions/);
  assert.match(app, /Read in a language/);
  assert.match(app, /editions\.map\(\(e, i\)/);
});

test('centres can add books and platform admins can publish more', () => {
  assert.match(view, /name !== 'bookAdd'/);
  assert.match(view, /type: 'media', accept: 'application\/pdf', scope: 'book'/);
  assert.match(view, /R\.api\('POST', '\/books', \{ book: body \}\)/);
  assert.match(view, /Platform admins publish for every centre/);
  assert.match(app, /DELETE', '\/books\/' \+ encodeURIComponent\(id\)/);
  assert.match(app, /\['nursery-rhyme', 'book'\]\.includes\(field\.scope\)/);
});

test('the Books page is wired into navigation and scripts', () => {
  assert.match(app, /route\('\/app\/books', 'app', 'books'/);
  assert.match(utils, /key: 'books', path: '\/app\/books'/);
  assert.match(index, /src="src\/books-data\.js/);
  assert.match(index, /src="src\/views\/books\.js/);
  assert.match(css, /\.book-grid \{ display: grid/);
});

test('the importer uploads PDFs, groups editions and publishes defaults', () => {
  assert.match(importer, /scope: 'book', shared: true/);
  assert.match(importer, /POST', '\/books\/import'/);
  assert.match(importer, /grouped\.get\(item\.book\)\.push\(item\)/);
  assert.match(importer, /language: LANG\[edition\.lang\]/);
  assert.match(importer, /R\.bookDefaults = /);
  assert.match(importer, /Book Dash books are CC BY 4\.0/);
});

test('stored media URLs resolve against the API origin for covers and PDFs', () => {
  const utils = read('apps/web/src/utils.js');
  assert.match(utils, /function resolveMediaUrl\(value\)/);
  assert.match(utils, /API_BASE \+ safe/);
  assert.match(utils, /Reel\.resolveMediaUrl = resolveMediaUrl/);
  assert.match(view, /R\.resolveMediaUrl\(book\.coverUrl\)/);
  assert.match(view, /R\.resolveMediaUrl\(\(found \|\| list\[0\]/);
  assert.match(app, /Reel\.resolveMediaUrl\(e\.pdfUrl\)/);
});

test('centres and platform admins can add and remove language editions', () => {
  const bview = read('apps/web/src/views/books.js');
  const bapp = read('apps/web/src/app.js');
  assert.match(bview, /name === 'bookEditionAdd'/);
  assert.match(bview, /Upload another PDF for a different language/);
  assert.match(bview, /R\.api\('PATCH', '\/books\/' \+ encodeURIComponent\(book\.id\)/);
  assert.match(bapp, /bookEditionAdd/);
  assert.match(bapp, /removeBookEdition\(id, index\)/);
  assert.match(bapp, /editions\.splice\(Number\(index\), 1\)/);
  assert.match(css, /\.book-edition \{ display: inline-flex/);
});
