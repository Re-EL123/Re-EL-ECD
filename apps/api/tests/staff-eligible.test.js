'use strict';

/**
 * Staff profiles must be creatable from the active accounts invited under
 * Users and access, without an administrator guessing someone's email.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');

test.before(start);
test.after(stop);

test('eligible staff accounts are active, staff-roled and unprofiled', async () => {
  const client = createClient();
  await client.login('principal@littlesprouts.local');
  const res = await client.get('/staff/eligible');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data));
  res.data.forEach((row) => {
    assert.ok(row.user_id);
    assert.equal(row.status, undefined); // active membership is implicit
    assert.ok(row.display_name);
    assert.ok(row.email);
    assert.ok(Array.isArray(row.roles) && row.roles.length > 0);
    assert.ok(row.roles.some((role) => ['teacher', 'assistant_teacher', 'support_staff', 'substitute_staff',
      'principal', 'daycare_administrator', 'daycare_manager', 'curriculum_coordinator',
      'finance_officer', 'admissions_officer', 'organisation_owner'].includes(role.role)));
  });
  const profiles = await db.many('SELECT user_id FROM staff_profiles WHERE user_id IS NOT NULL');
  const profiled = new Set(profiles.map((p) => p.user_id));
  res.data.forEach((row) => assert.ok(!profiled.has(row.user_id), 'already-profiled user must be excluded'));
});

test('a staff profile can be created by selecting an active account', async () => {
  const client = createClient();
  await client.login('principal@littlesprouts.local');
  const eligible = await client.get('/staff/eligible');
  const candidate = eligible.data.find((row) => row.roles.some((r) => r.role === 'assistant_teacher')) || eligible.data[0];
  assert.ok(candidate, 'the seeded centre has an eligible staff account');
  const reference = 'EMP-TEST-' + Date.now();
  const created = await client.post('/staff', {
    userId: candidate.user_id, employeeReference: reference,
    jobTitle: 'Assistant Teacher', classroomIds: []
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.user_id, candidate.user_id);

  const after = await client.get('/staff/eligible');
  assert.ok(!after.data.some((row) => row.user_id === candidate.user_id), 'linked user drops out of the picker');

  const duplicate = await client.post('/staff', {
    userId: candidate.user_id, employeeReference: 'EMP-DUP-' + Date.now(), jobTitle: 'Teacher'
  });
  assert.equal(duplicate.status, 409);
});

test('creating a profile without an account or email is rejected', async () => {
  const client = createClient();
  await client.login('principal@littlesprouts.local');
  const res = await client.post('/staff', {
    employeeReference: 'EMP-NONE-' + Date.now(), jobTitle: 'Teacher'
  });
  assert.equal(res.status, 422);
});
