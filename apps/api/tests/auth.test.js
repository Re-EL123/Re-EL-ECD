'use strict';

/**
 * Authentication, session, CSRF, RBAC and tenant-isolation tests.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient } = require('./helpers');

test.before(start);
test.after(stop);

test('unauthenticated requests are rejected', async () => {
  const client = createClient();
  const session = await client.get('/auth/session');
  assert.equal(session.status, 401);
  assert.equal(session.error.code, 'UNAUTHENTICATED');

  const learners = await client.get('/learners');
  assert.equal(learners.status, 401);
});

test('invalid credentials do not create a session', async () => {
  const client = createClient();
  const result = await client.post('/auth/login', { email: 'principal@littlesprouts.local', password: 'Wrong-Password-1' }, { csrf: null });
  assert.equal(result.status, 401);
  assert.equal(result.error.code, 'INVALID_CREDENTIALS');
  assert.equal(client.cookies.reel_session, undefined);
});

test('principal login returns memberships, permissions, branches and CSRF token', async () => {
  const client = createClient();
  const data = await client.login('principal@littlesprouts.local');
  assert.equal(data.user.email, 'principal@littlesprouts.local');
  assert.ok(data.user.displayName.length > 0);
  assert.equal(typeof data.csrfToken, 'string');
  assert.ok(data.csrfToken.length >= 20);
  assert.ok(data.memberships.length >= 1);
  const membership = data.memberships.find((m) => m.organisation.slug === 'little-sprouts');
  assert.ok(membership);
  assert.ok(membership.permissions.includes('learners.read.daycare'));
  assert.ok(membership.permissions.includes('staff_attendance.record.daycare'));
  assert.ok(Array.isArray(membership.branches));
  assert.equal(client.cookies.reel_session !== undefined, true);
  assert.equal(client.cookies.reel_csrf !== undefined, true);
});

test('state-changing requests require the CSRF header', async () => {
  const client = createClient();
  await client.login('principal@littlesprouts.local');
  const result = await client.post('/tasks', { title: 'CSRF probe' }, { csrf: null });
  assert.equal(result.status, 403);
  assert.equal(result.error.code, 'CSRF_FAILED');
});

test('teacher is denied finance and access-management endpoints', async () => {
  const client = createClient();
  const session = await client.login('teacher@littlesprouts.local');
  const organisationId = session.activeOrganisationId;

  const finance = await client.get('/finance/overview', { organisationId });
  assert.equal(finance.status, 403);
  assert.equal(finance.error.code, 'FORBIDDEN');

  const invitations = await client.post('/access/invitations',
    { email: 'nope@example.com', roleKey: 'teacher' }, { organisationId });
  assert.equal(invitations.status, 403);

  const allowed = await client.get('/learners', { organisationId });
  assert.equal(allowed.status, 200);
});

test('tenant header cannot be used to reach another organisation', async () => {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  const platformOrg = session.memberships.find((m) => m.organisation.slug === 're-el-platform');
  assert.equal(platformOrg, undefined, 'a daycare principal should not be a platform member');

  const others = await client.get('/platform/organisations');
  assert.equal(others.status, 403);
});

test('platform administrator can read the organisation directory but not daycare data', async () => {
  const client = createClient();
  const session = await client.login('platform@re-el-ecd.local');
  assert.equal(session.isPlatformAdmin, true);

  const organisations = await client.get('/platform/organisations');
  assert.equal(organisations.status, 200);
  assert.ok(Array.isArray(organisations.data));
  assert.ok(organisations.data.some((o) => o.slug === 'little-sprouts'));

  const learners = await client.get('/learners', { organisationId: session.activeOrganisationId });
  assert.equal(learners.status, 403);
});

test('parent sees only their own children and cannot browse the learner directory', async () => {
  const client = createClient();
  const session = await client.login('parent@littlesprouts.local');
  const children = await client.get('/parent/children', { organisationId: session.activeOrganisationId });
  assert.equal(children.status, 200);
  assert.equal(children.data.length, 1);
  assert.equal(children.data[0].firstName, 'Amelia');

  const directory = await client.get('/learners', { organisationId: session.activeOrganisationId });
  assert.equal(directory.status, 403);

  const otherChild = await client.get('/parent/children/' + '00000000-0000-4000-8000-000000000000',
    { organisationId: session.activeOrganisationId });
  assert.equal(otherChild.status, 404);
});

test('logout revokes the session cookie', async () => {
  const client = createClient();
  await client.login('principal@littlesprouts.local');
  const before = await client.get('/auth/session');
  assert.equal(before.status, 200);
  const logout = await client.logout();
  assert.equal(logout.status, 200);
  const after = await client.get('/auth/session');
  assert.equal(after.status, 401);
});

test('public daycare website is readable without authentication', async () => {
  const client = createClient();
  const site = await client.get('/public/daycares/little-sprouts');
  assert.equal(site.status, 200);
  assert.equal(site.data.organisation.slug, 'little-sprouts');
  assert.ok(site.data.organisation.name.length > 0);
  assert.equal(site.data.published, true);
});

test('security headers are present on API responses', async () => {
  const client = createClient();
  const result = await client.get('/public/daycares/little-sprouts');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
});
