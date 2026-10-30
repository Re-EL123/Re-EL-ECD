'use strict';

/**
 * The web helpers are classic scripts that attach to window.Reel. Loading the
 * file in a VM keeps the colour maths under test without a browser.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function loadReel() {
  const file = path.join(__dirname, '..', '..', 'apps', 'web', 'src', 'utils.js');
  const context = { window: {}, document: { documentElement: {} }, console };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return context.window.Reel;
}

const Reel = loadReel();

test('colourStats ranks a mid-tone brand colour above a pale background', () => {
  const pale = Reel.colourStats('#E6F4E8');
  const brand = Reel.colourStats('#4F9A58');
  assert.ok(brand.vividness > pale.vividness);
  assert.ok(brand.lightness < pale.lightness);
});

test('colourStats handles greys without dividing by zero', () => {
  const grey = Reel.colourStats('#808080');
  assert.equal(grey.saturation, 0);
  assert.equal(grey.vividness, 0);
});

test('themeVars cascades brand colours onto the design tokens', () => {
  const vars = Reel.themeVars({ primary: '#1F6F8B', secondary: '#E0A458', accent: '#9C528B' });
  assert.equal(vars['--reel-green-600'], '#1F6F8B');
  assert.equal(vars['--reel-sun-600'], '#E0A458');
  assert.equal(vars['--reel-sky-500'], '#9C528B');
  assert.equal(vars['--brand-on-primary'], Reel.onColour('#1F6F8B'));
});
