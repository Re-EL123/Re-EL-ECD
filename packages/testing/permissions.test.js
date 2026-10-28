'use strict';

/**
 * Unit tests for the shared packages: permission expansion, role catalogue,
 * password hashing and the request validator. These run without a database.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { PERMISSION_KEYS, PERMISSIONS, hasPermission, expand } = require('../auth/permissions');
const { ROLES, ROLE_DEFINITIONS, ROLE_PERMISSIONS } = require('../auth/roles');
const { hashPassword, verifyPassword, randomToken, sha256 } = require('../auth/password');
const { validate } = require('../contracts/validate');
const { AppError, ERROR_CODES } = require('../contracts/errors');

test('permission catalogue uses the resource.action.scope convention', () => {
  assert.ok(PERMISSION_KEYS.length > 60);
  for (const key of PERMISSION_KEYS) {
    const parts = key.split('.');
    assert.ok(parts.length >= 3 && parts.length <= 4, `${key} should have three or four segments`);
    assert.ok(parts.every((part) => part.length > 0), `${key} should not have empty segments`);
  }
  assert.equal(PERMISSIONS['learners.read.daycare'].resource, 'learners');
  assert.equal(PERMISSIONS['learners.read.daycare'].action, 'read');
  assert.equal(PERMISSIONS['learners.read.daycare'].scope, 'daycare');
});

test('hasPermission honours exact, resource wildcard and global grants', () => {
  assert.equal(hasPermission(new Set(['learners.read.daycare']), 'learners.read.daycare'), true);
  assert.equal(hasPermission(new Set(['learners.read.daycare']), 'learners.update.daycare'), false);
  assert.equal(hasPermission(new Set(['learners.*']), 'learners.update.daycare'), true);
  assert.equal(hasPermission(new Set(['learners.read.*']), 'learners.read.daycare'), true);
  assert.equal(hasPermission(new Set(['learners.read.*']), 'learners.update.daycare'), false);
  assert.equal(hasPermission(new Set(['*']), 'anything.at.all'), true);
  assert.equal(hasPermission(new Set(), 'learners.read.daycare'), false);
  assert.equal(hasPermission(new Set(['learners.read.daycare']), ''), false);
});

test('expand resolves wildcard role patterns against the catalogue', () => {
  const expanded = expand(['learners.*', 'tasks.read.own']);
  assert.ok(expanded.has('learners.read.daycare'));
  assert.ok(expanded.has('learners.archive.daycare'));
  assert.ok(expanded.has('tasks.read.own'));
  assert.equal(expanded.has('finance.read.daycare'), false);
});

test('every role has a definition and known permission patterns', () => {
  const defined = new Set(ROLE_DEFINITIONS.map((role) => role.key));
  for (const key of Object.values(ROLES)) {
    assert.ok(defined.has(key), `${key} should have a definition`);
    assert.ok(Array.isArray(ROLE_PERMISSIONS[key]), `${key} should have permission patterns`);
  }
  const known = new Set(PERMISSION_KEYS);
  for (const [role, patterns] of Object.entries(ROLE_PERMISSIONS)) {
    for (const pattern of patterns) {
      if (pattern === '*' || pattern.includes('*')) continue;
      assert.ok(known.has(pattern), `${role} references unknown permission ${pattern}`);
    }
  }
});

test('teachers do not receive finance or access-management permissions', () => {
  const granted = expand(ROLE_PERMISSIONS[ROLES.TEACHER]);
  assert.equal(hasPermission(granted, 'learners.read.assigned'), true);
  assert.equal(hasPermission(granted, 'finance.read.daycare'), false);
  assert.equal(hasPermission(granted, 'access.manage.daycare'), false);
  assert.equal(hasPermission(granted, 'platform.organisations.read'), false);
});

test('parents only receive own-scope permissions', () => {
  const granted = expand(ROLE_PERMISSIONS[ROLES.PARENT_GUARDIAN]);
  assert.ok(granted.size > 0);
  for (const key of granted) {
    assert.ok(key.endsWith('.own'), `${key} should be own-scope for a guardian`);
    assert.equal(hasPermission(granted, 'consent.read.daycare'), false);
    assert.equal(hasPermission(granted, 'forms.read.daycare'), false);
    assert.equal(hasPermission(granted, 'learners.read.daycare'), false);
  }
});

test('password hashing is salted and verifiable', async () => {
  const first = await hashPassword('Correct-Horse-2026!');
  const second = await hashPassword('Correct-Horse-2026!');
  assert.notEqual(first, second, 'hashes must use unique salts');
  assert.match(first, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword('Correct-Horse-2026!', first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  assert.equal(await verifyPassword('Correct-Horse-2026!', 'not-a-hash'), false);
  await assert.rejects(() => hashPassword('short'), /at least 8 characters/);
});

test('random tokens are unique and sha256 is stable', () => {
  const a = randomToken();
  const b = randomToken();
  assert.equal(a.length, 64);
  assert.notEqual(a, b);
  assert.equal(sha256('abc'), sha256('abc'));
  assert.notEqual(sha256('abc'), sha256('abd'));
});

test('validator strips unknown fields and coerces declared types', () => {
  const out = validate(
    { name: '  Little Sprouts  ', age: '3', active: 'true', organisationId: 'attacker' },
    {
      name: { type: 'string', min: 2, max: 40 },
      age: { type: 'integer', min: 0, max: 12 },
      active: { type: 'boolean' },
      note: { type: 'string', optional: true }
    }
  );
  assert.deepEqual(out, { name: 'Little Sprouts', age: 3, active: true });
  assert.equal('organisationId' in out, false);
});

test('validator reports field-level errors with a 422 AppError', () => {
  assert.throws(
    () => validate({ email: 'not-an-email', count: 1.5 }, {
      email: { type: 'string', email: true },
      count: { type: 'integer' }
    }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 422);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.deepEqual(error.details.map((d) => d.field).sort(), ['count', 'email']);
      return true;
    }
  );
});

test('error catalogue exposes stable status codes', () => {
  assert.equal(new AppError('FORBIDDEN').status, 403);
  assert.equal(new AppError('TENANT_MISMATCH').code, 'TENANT_MISMATCH');
  assert.equal(new AppError('NOT_FOUND').status, 404);
  assert.equal(new AppError('CSRF').code, 'CSRF_FAILED');
  assert.equal(ERROR_CODES.INTERNAL.status, 500);
});
