'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('staff attendance reminders are scheduled and guarded', () => {
  const vercel = read('vercel.json');
  const operations = read('apps/api/src/modules/operations.js');
  const service = read('apps/api/src/services/attendance-reminders-service.js');
  const migration = read('packages/database/migrations/062_attendance_reminders.sql');

  assert.match(vercel, /\/api\/v1\/cron\/attendance-reminders/);
  assert.match(vercel, /"schedule": "\*\/30 \* \* \* \*"/);
  assert.match(operations, /router\.post\('\/cron\/attendance-reminders'/);
  assert.match(operations, /safeEqual\(presented, secret\)/);
  assert.match(operations, /\{ public: true \}/);
  assert.match(operations, /router\.post\('\/automation\/attendance-reminders'/);

  assert.match(service, /clock_in/);
  assert.match(service, /break/);
  assert.match(service, /clock_out/);
  assert.match(service, /attendance_reminders/);
  assert.match(service, /ON CONFLICT \(staff_id, kind, sent_on\) DO NOTHING/);
  assert.match(migration, /UNIQUE \(staff_id, kind, sent_on\)/);
});

test('reminder channels respect preferences and opt-ins', () => {
  const service = read('apps/api/src/services/attendance-reminders-service.js');
  const notifications = read('apps/api/src/services/notification-service.js');
  const email = read('apps/api/src/services/email-service.js');
  const organisation = read('apps/api/src/modules/organisation.js');
  const settings = read('apps/web/src/views/settings.js');
  const staffView = read('apps/web/src/views/staff.js');

  assert.match(service, /createNotification\(/);
  assert.match(service, /sendTemplate\(db, 'attendanceReminder'/);
  assert.match(service, /sendSms\(/);
  assert.match(service, /smsAttendanceReminders/);
  assert.match(notifications, /attendance_reminder_clock_in: '\/app\/staff-attendance'/);
  assert.match(email, /attendanceReminder\(data\)/);
  assert.match(organisation, /attendanceReminders/);
  assert.match(organisation, /Time\$\/\.test\(nestedKey\)/);
  assert.match(settings, /Staff attendance reminders/);
  assert.match(settings, /clockInTime: data\.clockInTime/);
  assert.match(staffView, /Reminder: please clock in/);
  assert.match(staffView, /record a break when you take one/);
});
