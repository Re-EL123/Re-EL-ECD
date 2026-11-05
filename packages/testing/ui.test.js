'use strict';

/**
 * Static checks for the no-build web app.
 *
 * The frontend has no bundler, so these invariants are verified against the
 * committed files: script load order, asset versioning, view registration and
 * the Alpine bindings that are easy to get subtly wrong.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const webRoot = path.join(__dirname, '..', '..', 'apps', 'web');
const indexHtml = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');

test('local assets carry the same cache-busting version', () => {
  const versions = new Set();
  const pattern = /(?:src|href)="([^"]+)\?v=(\d+)"/g;
  let match;
  while ((match = pattern.exec(indexHtml))) versions.add(match[2]);
  assert.ok(versions.size >= 1, 'expected versioned local assets');
  assert.equal(versions.size, 1, `all assets must share one version, found ${Array.from(versions).join(', ')}`);
  const version = Array.from(versions)[0];
  assert.match(version, /^\d{8,}$/);
});

test('every referenced local script exists', () => {
  const pattern = /<script src="(?!https?:)([^"?]+)[^"]*"/g;
  let match;
  while ((match = pattern.exec(indexHtml))) {
    const file = path.join(webRoot, match[1]);
    assert.ok(fs.existsSync(file), `${match[1]} is referenced but missing`);
  }
});

test('Alpine loads after the application scripts', () => {
  const scripts = Array.from(indexHtml.matchAll(/<script src="([^"]+)"/g)).map((m) => m[1]);
  const alpine = scripts.findIndex((src) => src.includes('alpine'));
  const app = scripts.findIndex((src) => src.includes('src/app.js'));
  assert.ok(alpine > -1, 'Alpine must be loaded');
  assert.ok(app > -1, 'app.js must be loaded');
  assert.ok(app < alpine, 'app.js must load before Alpine so window.reelApp exists at init');
});

test('third-party scripts are self-hosted', () => {
  const scripts = Array.from(indexHtml.matchAll(/<script src="([^"]+)"/g)).map((m) => m[1]);
  const remote = scripts.filter((src) => /^https?:\/\//.test(src));
  assert.deepEqual(remote, [], 'scripts must be served from the site so a CDN outage cannot block boot');
});

test('Alpine boolean bindings use strict booleans', () => {
  // Alpine sets a boolean attribute for any value that is not strictly false,
  // so `:required="field.required"` marks every optional field as required and
  // the browser then silently blocks form submission.
  const bindings = Array.from(indexHtml.matchAll(/:required="([^"]*)"/g)).map((m) => m[1]);
  assert.ok(bindings.length > 0, 'expected required bindings in the modal template');
  for (const binding of bindings) {
    assert.match(binding, /===\s*true$/, `:required="${binding}" must compare strictly with true`);
  }
  const disabled = Array.from(indexHtml.matchAll(/:disabled="([^"]*)"/g)).map((m) => m[1]);
  for (const binding of disabled) {
    assert.match(binding, /^Boolean\(/, `:disabled="${binding}" must be coerced with Boolean()`);
  }
});

test('view modules register themselves on the shared namespace', () => {
  const viewsDir = path.join(webRoot, 'src', 'views');
  const files = fs.readdirSync(viewsDir).filter((file) => file.endsWith('.js'));
  assert.ok(files.length >= 15, 'expected a view module per domain');
  for (const file of files) {
    const source = fs.readFileSync(path.join(viewsDir, file), 'utf8');
    assert.match(source, /'use strict';/, `${file} should be strict`);
    assert.match(source, /V\.[a-zA-Z]+ = \{/, `${file} should register at least one view`);
    assert.ok(!/^\s*(?:import|export)\s/m.test(source), `${file} must be a classic script, not a module`);
  }
});

test('binding handlers are defined on the Alpine root component', () => {
  // Alpine evaluates `@click`/`@change`/`@submit` expressions with the root
  // component as scope, so a handler declared on a view object (or a stray
  // global) throws "ReferenceError: <name> is not defined" the moment the user
  // interacts. Views only contribute load/render/openModal, so every handler
  // they reference must be a member of reelApp() in app.js.
  const app = fs.readFileSync(path.join(webRoot, 'src', 'app.js'), 'utf8');
  const defined = new Set();
  for (const match of app.matchAll(/^ {6}(?:async\s+)?(?:get\s+)?([a-zA-Z_$][\w$]*)\s*\(/gm)) {
    defined.add(match[1]);
  }

  const ignored = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'function', 'delete', 'void', 'in', 'of', 'do', 'else', 'try', 'throw',
    'Math', 'JSON', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Date', 'Promise', 'RegExp', 'Error', 'Map', 'Set',
    'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'setTimeout', 'clearTimeout', 'console'
  ]);

  const sources = [indexHtml];
  const viewsDir = path.join(webRoot, 'src', 'views');
  for (const file of fs.readdirSync(viewsDir).filter((name) => name.endsWith('.js'))) {
    sources.push(fs.readFileSync(path.join(viewsDir, file), 'utf8'));
  }

  const directive = /@(?:click|change|submit|input|keydown|keyup|blur|focus)[^=\s]*="([^"]*)"/g;
  const missing = new Set();
  for (const source of sources) {
    for (const [, value] of source.matchAll(directive)) {
      for (const call of value.matchAll(/(?<![.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)) {
        const name = call[1];
        if (!ignored.has(name) && !defined.has(name)) missing.add(name);
      }
    }
  }
  assert.deepEqual(Array.from(missing), [],
    `binding handlers missing from reelApp(): ${Array.from(missing).join(', ')}`);
});

test('router routes point at registered views', () => {
  const app = fs.readFileSync(path.join(webRoot, 'src', 'app.js'), 'utf8');
  const registered = new Set();
  for (const file of fs.readdirSync(path.join(webRoot, 'src', 'views'))) {
    const source = fs.readFileSync(path.join(webRoot, 'src', 'views', file), 'utf8');
    for (const match of source.matchAll(/V\.([a-zA-Z]+)\s*=/g)) registered.add(match[1]);
  }
  const routes = Array.from(app.matchAll(/route\('([^']+)',\s*'[^']*',\s*'([a-zA-Z]+)'/g));
  assert.ok(routes.length > 30, 'expected the full route table');
  for (const [, routePath, view] of routes) {
    if (view === 'null') continue;
    assert.ok(registered.has(view), `route ${routePath} references unregistered view ${view}`);
  }
});

test('unknown routes render a branded 404 for signed-in and signed-out visitors', () => {
  const app = fs.readFileSync(path.join(webRoot, 'src', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(webRoot, 'assets', 'styles.css'), 'utf8');
  assert.match(app, /renderNotFound\(path\)/, 'signed-out visitors need a branded 404 renderer');
  assert.match(app, /if \(!matched\)/, 'the router must handle unmatched paths');
  assert.match(app, /not-found-code">404</, 'the 404 page must show a 404 code');
  assert.match(app, /renderNotFound\(path\);/, 'the unmatched branch must call renderNotFound');
  assert.match(styles, /\.not-found\b/, '404 styles must be present');
  assert.match(styles, /\.not-found-code\b/, 'the large 404 numeral must be styled');
});
