'use strict';

/** /staff/today must report future activities without mixing them into today's timeline. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient } = require('./helpers');

test.before(start);
test.after(stop);

test('upcoming activities are separate from today and limited to future windows', async () => {
  const client = createClient();
  const session = await client.login('principal@littlesprouts.local');
  const organisationId = session.activeOrganisationId;

  const branches = await client.get('/branches', { organisationId });
  assert.equal(branches.status, 200);
  const branchId = branches.data[0] && branches.data[0].id;
  assert.ok(branchId);

  const starts = new Date(Date.now() + 5 * 24 * 3600 * 1000);
  const ends = new Date(starts.getTime() + 30 * 60000);
  const created = await client.post('/curriculum/calendar/events', {
    branchId, title: 'Future cockpit check',
    startsAt: starts.toISOString(), endsAt: ends.toISOString()
  }, { organisationId });
  assert.equal(created.status, 201, JSON.stringify(created.error));
  const id = created.data.id;

  try {
    const res = await client.get('/staff/today', { organisationId });
    assert.equal(res.status, 200, JSON.stringify(res.error));
    const data = res.data;
    assert.ok(Array.isArray(data.upcoming), 'upcoming list is present');
    assert.ok(data.upcoming.some((u) => u.id === id), 'future activity is reported');
    assert.ok(!(data.timeline || []).some((b) => b.id === id), 'future activity is not in today’s timeline');
    data.upcoming.forEach((u) => assert.ok(new Date(u.startsAt) > new Date(), 'upcoming is in the future'));
  } finally {
    await client.delete('/curriculum/calendar/events/' + id, { organisationId });
  }
});
