'use strict';

/**
 * Staff attendance nudges: clock in, break and clock out.
 *
 * Runs from a cron every half hour. At most one reminder of each kind is sent
 * per staff member per day (recorded in attendance_reminders). Reminders are
 * in-app by default, with optional push, email and opt-in SMS.
 */

const { createNotification } = require('./notification-service');
const { sendTemplate } = require('./email-service');
const { sendSms } = require('./sms-service');
const { recordAudit } = require('./audit-service');

const DEFAULTS = { clockInTime: '07:30', breakTime: '10:30', clockOutTime: '16:45' };
const KINDS = {
  clock_in: {
    type: 'attendance_reminder_clock_in',
    title: 'Time to clock in',
    body: 'Remember to tap Clock in so your centre has an accurate attendance record for today.'
  },
  break: {
    type: 'attendance_reminder_break',
    title: 'Time for your break',
    body: 'You have been on site a while — remember to record your break when you take it.'
  },
  clock_out: {
    type: 'attendance_reminder_clock_out',
    title: 'Remember to clock out',
    body: 'Your shift should be wrapping up. Please tap Clock out before you leave.'
  }
};

function localTime(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || 'Africa/Johannesburg',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(value ? new Date(value) : new Date());
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return String(hour).padStart(2, '0') + ':' + String(get('minute')).padStart(2, '0');
}

function minutes(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  return match ? (Number(match[1]) * 60 + Number(match[2])) : -1;
}

function nextAction(config, events, shift, now) {
  const latest = events.length ? events[events.length - 1].event_type : null;
  const clockedIn = latest === 'clock_in' || latest === 'break_end';
  const hasBreak = events.some((event) => event.event_type === 'break_start');
  const hasClockIn = events.some((event) => event.event_type === 'clock_in');
  const start = shift && shift.starts_at ? localTime(shift.starts_at, config.timezone) : config.clockInTime;
  const end = shift && shift.ends_at ? localTime(shift.ends_at, config.timezone) : config.clockOutTime;
  const startMin = minutes(start);
  const endMin = minutes(end);

  if (!hasClockIn && now >= startMin && now < (endMin > startMin ? endMin : minutes(config.clockOutTime))) {
    return { kind: 'clock_in', expectedTime: start };
  }
  if (clockedIn && !hasBreak && now >= minutes(config.breakTime) && now < endMin) {
    return { kind: 'break', expectedTime: config.breakTime };
  }
  if (clockedIn && endMin > 0 && now >= endMin) {
    return { kind: 'clock_out', expectedTime: end };
  }
  return null;
}

async function sendReminder(db, org, staff, action, settings) {
  const meta = KINDS[action.kind];
  const channels = ['in_app', 'push'];
  const ctx = { organisationId: org.id, user: null, req: {}, ip: '' };
  await createNotification(db, ctx, {
    recipientUserIds: [staff.user_id],
    type: meta.type,
    title: meta.title,
    body: meta.body,
    organisationId: org.id,
    resourceType: 'staff_profile',
    resourceId: staff.id,
    url: '/app/staff-attendance'
  });

  const data = {
    staffName: staff.display_name,
    organisationName: org.name,
    kind: action.kind,
    expectedTime: action.expectedTime
  };
  if (settings.channelEmail === true && staff.email) {
    await sendTemplate(db, 'attendanceReminder', {
      to: staff.email, organisationId: org.id,
      metadata: { staffId: staff.id, kind: action.kind }, data
    });
    channels.push('email');
  }
  const prefs = (org.settings && org.settings.notificationPreferences) || {};
  if (settings.channelSms === true && prefs.smsAttendanceReminders === true && staff.phone) {
    const sent = await sendSms(db, {
      to: staff.phone, organisationId: org.id,
      message: meta.title + ': ' + meta.body,
      preference: true, kind: 'attendance_reminder'
    });
    if (sent && sent.status === 'sent') channels.push('sms');
  }
  return channels;
}

async function sendAttendanceReminders(db, options = {}) {
  const organisations = await db.many(
    `SELECT o.id, o.name, o.timezone, COALESCE(os.settings,'{}'::jsonb) AS settings
     FROM organisations o
     LEFT JOIN organisation_settings os ON os.organisation_id = o.id
     WHERE o.status <> 'suspended'
     ORDER BY o.name`
  );
  const result = { organisations: [], sent: 0, skipped: 0 };
  for (const org of organisations) {
    const settings = Object.assign({}, DEFAULTS, (org.settings && org.settings.attendanceReminders) || {});
    if (settings.enabled === false) { result.skipped += 1; continue; }
    const staffRows = await db.many(
      `SELECT sp.id, sp.user_id, u.email, u.phone, u.display_name
       FROM staff_profiles sp JOIN users u ON u.id = sp.user_id
       WHERE sp.organisation_id = $1 AND sp.employment_status IN ('active','on_leave')
         AND u.status = 'active' AND sp.user_id IS NOT NULL`, [org.id]
    );
    let sent = 0;
    for (const staff of staffRows) {
      if (options.staffId && staff.id !== options.staffId) continue;
      const events = await db.many(
        `SELECT event_type, recorded_at FROM staff_attendance_events
         WHERE staff_id = $1 AND recorded_at::date = CURRENT_DATE ORDER BY recorded_at`, [staff.id]
      );
      const shift = await db.one(
        `SELECT starts_at, ends_at FROM staff_shifts
         WHERE staff_id = $1 AND shift_date = CURRENT_DATE AND status <> 'cancelled'
         ORDER BY starts_at LIMIT 1`, [staff.id]
      );
      const now = minutes(localTime(null, org.timezone));
      const action = nextAction(Object.assign({}, settings, { timezone: org.timezone }), events, shift, now);
      if (!action) continue;
      const existing = await db.one(
        'SELECT id FROM attendance_reminders WHERE staff_id = $1 AND kind = $2 AND sent_on = CURRENT_DATE',
        [staff.id, action.kind]
      );
      if (existing) continue;
      // Claim the slot first so a concurrent cron tick cannot double-send.
      const claimed = await db.one(
        `INSERT INTO attendance_reminders (organisation_id, staff_id, user_id, kind, channels)
         VALUES ($1,$2,$3,$4,'[]'::jsonb)
         ON CONFLICT (staff_id, kind, sent_on) DO NOTHING RETURNING id`,
        [org.id, staff.id, staff.user_id, action.kind]
      );
      if (!claimed) continue;
      try {
        const channels = await sendReminder(db, org, staff, action, settings);
        await db.query('UPDATE attendance_reminders SET channels = $1 WHERE id = $2', [JSON.stringify(channels), claimed.id]);
        sent += 1;
      } catch (error) {
        // Keep the claim: a failed channel should not cause a second nudge.
        await db.query('DELETE FROM attendance_reminders WHERE id = $1', [claimed.id]).catch(() => null);
        console.error('[attendance-reminders] failed to send', error && error.message);
      }
    }
    if (sent) {
      await recordAudit(db, { organisationId: org.id, user: null, req: {}, ip: '' }, {
        action: 'automation.attendance_reminders', resourceType: 'organisation', resourceId: org.id,
        metadata: { sent }
      });
    }
    result.organisations.push({ organisation: org.name, sent });
    result.sent += sent;
  }
  return result;
}

module.exports = { sendAttendanceReminders, nextAction, localTime, KINDS };
