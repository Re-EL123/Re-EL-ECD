'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { describe } = require('../../apps/api/src/services/entitlements-service');

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

test('storage usage shows a meaningful unit instead of rounding small data to zero', () => {
  // A centre on the 1 GB Seedling plan with ~49 MB of photos used to read
  // "0 GB / 1 GB" because everything was rounded to one decimal of a GB.
  assert.equal(describe('storage', 51729455, GB), '49.3 MB / 1 GB');
  assert.equal(describe('storage', 0, GB), '0 GB / 1 GB');
  assert.equal(describe('storage', 512 * 1024, GB), '512 KB / 1 GB');
  assert.equal(describe('storage', 386850334, 3 * GB), '0.4 GB / 3 GB');
  assert.equal(describe('storage', 1.5 * GB, 0), '1.5 GB / Unlimited');
});

test('learner and staff counts keep the plain used / limit format', () => {
  assert.equal(describe('learners', 12, 120), '12 / 120');
  assert.equal(describe('staff', 10, 0), '10 / Unlimited');
});
