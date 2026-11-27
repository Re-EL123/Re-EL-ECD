'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, createClient, db } = require('./helpers');
const { nextAction } = require('../src/services/attendance-reminders-service');

test.before(start);
test.after(stop);

const config = { clockInTime: '07:30', breakTime: '10:30', clockOutTime: '16:45', timezone: 'Africa/Johannesburg' };
const at = (value) => ({ event_type: value });

test('nextAction picks clock-in, break and clock-out from the day’s events', () => {
  const shift = { starts_at: '2026-11-27T05:00:00Z', ends_at: '2026-11-27T14:00:00Z' };
  assert.equal(nextAction(config, [], null, 8 * 60).kind, 'clock_in');
  assert.equal(nextAction(config, [], null, 6 * 60), null, 'too early to clock in');

  assert.equal(nextAction(config, [], shift, 8 * 60).kind, 'clock_in');
  assert.equal(nextAction(config, [at('clock_in')], shift, 11 * 60).kind, 'break');
  assert.equal(nextAction(config, [at('clock_in'), at('break_start'), at('break_end')], shift, 17 * 60).kind, 'clock_out');
  assert.equal(nextAction(config, [at('clock_in'), at('clock_out')], shift, 18 * 60), null);
  assert.equal(nextAction(config, [at('clock_in')], shift, 10 * 60), null, 'break not due yet');
});

test('the cron requires the shared secret and reminders are sent once per day', async () => {
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  const orgs = (await admin.get('/platform/organisations')).data;
  const org = (orgs.organisations || orgs || []).find((row) => row.slug === 'little-sprouts');
  assert.ok(org);

  await db.query(
    `UPDATE organisation_settings SET settings = jsonb_set(
       COALESCE(settings,'{}'::jsonb), '{attendanceReminders}',
       '{"enabled":true,"clockInTime":"00:00","breakTime":"00:00","clockOutTime":"23:59"}'::jsonb)
     WHERE organisation_id = $1`, [org.id]
  );
  const user = await db.one("SELECT id FROM users WHERE email_normalized = 'principal@littlesprouts.local'");
  const branch = await db.one('SELECT id FROM branches WHERE organisation_id = $1 LIMIT 1', [org.id]);
  const staff = await db.one(
    `INSERT INTO staff_profiles (organisation_id, user_id, employee_reference, job_title, employment_status)
     VALUES ($1,$2,'REMIND-TEST-' || gen_random_uuid(),'Teacher','active') RETURNING id`,
    [org.id, user.id]
  ).catch(() => db.one("SELECT id FROM staff_profiles WHERE user_id = $1 AND organisation_id = $2", [user.id, org.id]));
  assert.ok(staff && branch);

  process.env.CRON_SECRET = 'reminder-test-secret';
  const unauth = await createClient().post('/cron/attendance-reminders', {});
  assert.equal(unauth.status, 403);
  const authed = await createClient().post('/cron/attendance-reminders', {},
    { headers: { authorization: 'Bearer reminder-test-secret' } });
  assert.equal(authed.status, 200, authed.text);
  assert.ok(typeof authed.data.sent === 'number');

  const rows = await db.many("SELECT id FROM attendance_reminders WHERE staff_id = $1 AND kind = 'clock_in'", [staff.id]);
  assert.equal(rows.length, 1, 'only one clock-in reminder per staff per day');

  const second = await createClient().post('/cron/attendance-reminders', {},
    { headers: { authorization: 'Bearer reminder-test-secret' } });
  assert.equal(second.status, 200);
  const again = await db.many("SELECT id FROM attendance_reminders WHERE staff_id = $1 AND kind = 'clock_in'", [staff.id]);
  assert.equal(again.length, 1, 'a second cron tick must not resend');

  const notes = await db.many(
    "SELECT id FROM notifications WHERE recipient_user_id = $1 AND notification_type = 'attendance_reminder_clock_in'",
    [user.id]
  );
  assert.ok(notes.length >= 1);
  delete process.env.CRON_SECRET;
});
