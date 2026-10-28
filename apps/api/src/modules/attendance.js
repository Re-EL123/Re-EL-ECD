'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { has, assignedClassroomIds, getLearner, today } = require('./helpers');

async function upsertAttendance(client, ctx, learner, data) {
  const existing = (await client.query(
    'SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = $2',
    [learner.id, data.date]
  )).rows[0];
  if (existing) {
    await client.query(
      `UPDATE learner_attendance SET check_in_at = $1, check_out_at = $2, attendance_status = $3,
        absence_reason = $4, recorded_by = $5, updated_at = now() WHERE id = $6`,
      [data.checkInAt || null, data.checkOutAt || null, data.status, data.absenceReason || null, ctx.user.id, existing.id]
    );
    return (await client.query('SELECT * FROM learner_attendance WHERE id = $1', [existing.id])).rows[0];
  }
  return (await client.query(
    `INSERT INTO learner_attendance (organisation_id, branch_id, learner_id, attendance_date, check_in_at, check_out_at,
      attendance_status, absence_reason, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [ctx.organisationId, learner.branch_id, learner.id, data.date, data.checkInAt || null, data.checkOutAt || null,
      data.status, data.absenceReason || null, ctx.user.id]
  )).rows[0];
}

function register(router) {
  router.get('/learner-attendance', async (ctx) => {
    const date = ctx.query.date || today();
    const classroomId = ctx.query.classroomId || null;
    const branchId = ctx.query.branchId || null;
    const scopeAll = has(ctx, 'attendance.read.daycare');
    let classrooms = null;
    if (!scopeAll) {
      classrooms = await assignedClassroomIds(ctx);
      if (!classrooms.length) return { date, rows: [], summary: { marked: 0, present: 0, absent: 0, unmarked: 0 } };
    }
    const params = [ctx.organisationId, date, classroomId, branchId];
    let extra = '';
    if (!scopeAll) {
      params.push(classrooms);
      extra = ` AND l.classroom_id = ANY($${params.length}::uuid[])`;
    }
    const rows = await ctx.db.many(
      `SELECT l.id AS learner_id, l.first_name, l.last_name, l.learner_reference, l.classroom_id, l.branch_id,
              c.name AS classroom_name, a.id AS attendance_id, a.attendance_status, a.check_in_at, a.check_out_at,
              a.absence_reason, a.recorded_by
       FROM learners l
       LEFT JOIN classrooms c ON c.id = l.classroom_id
       LEFT JOIN learner_attendance a ON a.learner_id = l.id AND a.attendance_date = $2
       WHERE l.organisation_id = $1 AND l.status = 'enrolled'
         AND ($3::uuid IS NULL OR l.classroom_id = $3::uuid)
         AND ($4::uuid IS NULL OR l.branch_id = $4::uuid)${extra}
       ORDER BY c.name, l.last_name, l.first_name`,
      params
    );
    const summary = { marked: 0, present: 0, absent: 0, unmarked: 0 };
    for (const row of rows) {
      row.attendance_status = row.attendance_status || 'expected';
      if (!row.attendance_id) summary.unmarked += 1;
      else {
        summary.marked += 1;
        if (['present', 'late', 'collected'].includes(row.attendance_status)) summary.present += 1;
        if (row.attendance_status === 'absent') summary.absent += 1;
      }
    }
    return { date, rows, summary };
  }, { permission: ['attendance.read.daycare', 'attendance.read.assigned'], permissionMode: 'any' });

  router.post('/learner-attendance/register', async (ctx) => {
    const body = validate(ctx.body, {
      date: { type: 'string', date: true, optional: true },
      records: { type: 'array', max: 200 }
    });
    if (!Array.isArray(body.records) || body.records.length === 0) {
      fail('VALIDATION', [{ field: 'records', message: 'Provide at least one attendance record.' }]);
    }
    const date = body.date || today();
    const allowedClassrooms = has(ctx, 'attendance.record.daycare') ? null : await assignedClassroomIds(ctx);
    const results = [];
    for (const raw of body.records) {
      const record = validate(raw, {
        learnerId: { type: 'string', uuid: true },
        status: { type: 'string', enum: ['present', 'absent', 'late', 'excused', 'expected', 'collected'] },
        absenceReason: { type: 'string', max: 1000, optional: true },
        checkInAt: { type: 'string', datetime: true, optional: true },
        checkOutAt: { type: 'string', datetime: true, optional: true }
      });
      const learner = await getLearner(ctx, record.learnerId);
      if (allowedClassrooms && !allowedClassrooms.includes(learner.classroom_id)) throw new AppError('FORBIDDEN');
      if (record.checkInAt && record.checkOutAt && new Date(record.checkOutAt) < new Date(record.checkInAt)) {
        fail('VALIDATION', [{ field: 'checkOutAt', message: 'Check-out cannot precede check-in.' }]);
      }
      const saved = await ctx.db.withTransaction((client) => upsertAttendance(client, ctx, learner, {
        date, status: record.status, absenceReason: record.absenceReason,
        checkInAt: record.checkInAt || (record.status === 'present' || record.status === 'late' ? new Date().toISOString() : null),
        checkOutAt: record.checkOutAt || null
      }));
      results.push(saved);
    }
    await recordAudit(ctx.db, ctx, {
      action: 'attendance.register_submitted', resourceType: 'learner_attendance', resourceId: null,
      metadata: { date, count: results.length }
    });
    return { date, records: results };
  }, { permission: ['attendance.record.assigned', 'attendance.record.daycare'], permissionMode: 'any' });

  router.post('/learner-attendance/check-in', async (ctx) => {
    const body = validate(ctx.body, {
      learnerId: { type: 'string', uuid: true },
      status: { type: 'string', enum: ['present', 'late'], optional: true }
    });
    const learner = await getLearner(ctx, body.learnerId);
    const existing = await ctx.db.one(
      'SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = CURRENT_DATE', [learner.id]
    );
    if (existing && existing.check_in_at && !existing.check_out_at) {
      fail('CONFLICT', null, 'This learner is already checked in.');
    }
    const record = await ctx.db.withTransaction((client) => upsertAttendance(client, ctx, learner, {
      date: today(), status: body.status || 'present', checkInAt: new Date().toISOString(),
      checkOutAt: null, absenceReason: null
    }));
    await recordAudit(ctx.db, ctx, {
      action: 'attendance.learner_checked_in', resourceType: 'learner_attendance', resourceId: record.id,
      branchId: learner.branch_id
    });
    return record;
  }, { permission: ['attendance.record.assigned', 'attendance.record.daycare'], permissionMode: 'any' });

  router.post('/learner-attendance/check-out', async (ctx) => {
    const body = validate(ctx.body, {
      learnerId: { type: 'string', uuid: true },
      notes: { type: 'string', max: 1000, optional: true }
    });
    const learner = await getLearner(ctx, body.learnerId);
    const existing = await ctx.db.one(
      'SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = CURRENT_DATE', [learner.id]
    );
    if (!existing || !existing.check_in_at) fail('CONFLICT', null, 'This learner is not checked in.');
    if (existing.check_out_at) fail('CONFLICT', null, 'This learner has already been checked out.');
    await ctx.db.query(
      `UPDATE learner_attendance SET check_out_at = now(), attendance_status = 'collected', updated_at = now()
       WHERE id = $1`, [existing.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'attendance.learner_checked_out', resourceType: 'learner_attendance', resourceId: existing.id
    });
    return ctx.db.one('SELECT * FROM learner_attendance WHERE id = $1', [existing.id]);
  }, { permission: ['attendance.record.assigned', 'attendance.record.daycare'], permissionMode: 'any' });

  router.post('/learner-attendance/absence', async (ctx) => {
    const body = validate(ctx.body, {
      learnerId: { type: 'string', uuid: true },
      reason: { type: 'string', min: 3, max: 1000 },
      date: { type: 'string', date: true, optional: true },
      excused: { type: 'boolean', optional: true }
    });
    const learner = await getLearner(ctx, body.learnerId);
    const date = body.date || today();
    const record = await ctx.db.withTransaction((client) => upsertAttendance(client, ctx, learner, {
      date, status: body.excused ? 'excused' : 'absent', absenceReason: body.reason, checkInAt: null, checkOutAt: null
    }));
    await recordAudit(ctx.db, ctx, {
      action: 'attendance.absence_recorded', resourceType: 'learner_attendance', resourceId: record.id,
      metadata: { reason: body.reason }
    });
    return record;
  }, { permission: ['attendance.record.assigned', 'attendance.record.daycare'], permissionMode: 'any' });

  router.get('/learner-attendance/current-presence', async (ctx) => {
    const rows = await ctx.db.many(
      `SELECT a.*, l.first_name, l.last_name, l.learner_reference, c.name AS classroom_name
       FROM learner_attendance a JOIN learners l ON l.id = a.learner_id
       LEFT JOIN classrooms c ON c.id = l.classroom_id
       WHERE a.organisation_id = $1 AND a.attendance_date = CURRENT_DATE
         AND a.check_in_at IS NOT NULL AND a.check_out_at IS NULL
       ORDER BY a.check_in_at`, [ctx.organisationId]
    );
    const expected = await ctx.db.one(
      "SELECT COUNT(*)::int AS total FROM learners WHERE organisation_id = $1 AND status = 'enrolled'", [ctx.organisationId]
    );
    return { present: rows.length, expected: expected.total, learners: rows };
  }, { permission: 'attendance.read.daycare' });

  router.get('/learner-attendance/reports', async (ctx) => {
    const from = ctx.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = ctx.query.to || today();
    const byDay = await ctx.db.many(
      `SELECT attendance_date, COUNT(*)::int AS marked,
        SUM(CASE WHEN attendance_status IN ('present','late','collected') THEN 1 ELSE 0 END)::int AS present,
        SUM(CASE WHEN attendance_status = 'absent' THEN 1 ELSE 0 END)::int AS absent,
        SUM(CASE WHEN attendance_status = 'excused' THEN 1 ELSE 0 END)::int AS excused
       FROM learner_attendance WHERE organisation_id = $1 AND attendance_date BETWEEN $2 AND $3
       GROUP BY attendance_date ORDER BY attendance_date`, [ctx.organisationId, from, to]
    );
    const byClassroom = await ctx.db.many(
      `SELECT c.name AS classroom_name, COUNT(a.id)::int AS marked,
        SUM(CASE WHEN a.attendance_status IN ('present','late','collected') THEN 1 ELSE 0 END)::int AS present,
        SUM(CASE WHEN a.attendance_status = 'absent' THEN 1 ELSE 0 END)::int AS absent
       FROM classrooms c LEFT JOIN learners l ON l.classroom_id = c.id
       LEFT JOIN learner_attendance a ON a.learner_id = l.id AND a.attendance_date BETWEEN $2 AND $3
       WHERE c.organisation_id = $1 GROUP BY c.name ORDER BY c.name`, [ctx.organisationId, from, to]
    );
    const totals = byDay.reduce((acc, day) => ({
      marked: acc.marked + day.marked, present: acc.present + day.present,
      absent: acc.absent + day.absent, excused: acc.excused + day.excused
    }), { marked: 0, present: 0, absent: 0, excused: 0 });
    return {
      from, to, byDay, byClassroom, totals,
      attendanceRate: totals.marked ? Math.round((totals.present / totals.marked) * 100) : null,
      definition: 'Present includes checked-in learners and late arrivals. Attendance rate = present / marked learner-days, excluding excused absences from neither numerator nor denominator.'
    };
  }, { permission: 'attendance.reports.daycare' });

  router.get('/learner-attendance/adjustments', async (ctx) => {
    return ctx.db.many(
      `SELECT aa.*, u1.display_name AS requested_by_name, u2.display_name AS approved_by_name,
        l.first_name, l.last_name, a.attendance_date
       FROM attendance_adjustments aa
       LEFT JOIN users u1 ON u1.id = aa.requested_by
       LEFT JOIN users u2 ON u2.id = aa.approved_by
       JOIN learner_attendance a ON a.id = aa.attendance_record_id
       JOIN learners l ON l.id = a.learner_id
       WHERE aa.organisation_id = $1 ORDER BY aa.created_at DESC`, [ctx.organisationId]
    );
  }, { permission: 'attendance.correct.daycare' });

  router.post('/learner-attendance/adjustments', async (ctx) => {
    const body = validate(ctx.body, {
      attendanceRecordId: { type: 'string', uuid: true },
      reason: { type: 'string', min: 3, max: 1000 },
      proposedStatus: { type: 'string', enum: ['present', 'absent', 'late', 'excused', 'collected'], optional: true },
      proposedCheckInAt: { type: 'string', datetime: true, optional: true },
      proposedCheckOutAt: { type: 'string', datetime: true, optional: true }
    });
    const record = await ctx.db.one('SELECT * FROM learner_attendance WHERE id = $1 AND organisation_id = $2',
      [body.attendanceRecordId, ctx.organisationId]);
    if (!record) throw new AppError('NOT_FOUND');
    const proposed = {
      attendanceStatus: body.proposedStatus || record.attendance_status,
      checkInAt: body.proposedCheckInAt || record.check_in_at,
      checkOutAt: body.proposedCheckOutAt || record.check_out_at
    };
    const adjustment = await ctx.db.one(
      `INSERT INTO attendance_adjustments (organisation_id, attendance_record_id, requested_by, reason, previous_values,
        proposed_values) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [ctx.organisationId, record.id, ctx.user.id, body.reason,
        JSON.stringify({ attendanceStatus: record.attendance_status, checkInAt: record.check_in_at, checkOutAt: record.check_out_at }),
        JSON.stringify(proposed)]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'attendance.adjustment_requested', resourceType: 'attendance_adjustment', resourceId: adjustment.id
    });
    ctx.status = 201;
    return adjustment;
  }, { permission: ['attendance.record.assigned', 'attendance.record.daycare'], permissionMode: 'any' });

  router.post('/learner-attendance/adjustments/:id/approve', async (ctx) => {
    const body = validate(ctx.body, {
      decision: { type: 'string', enum: ['approved', 'rejected'], optional: true }
    });
    const decision = body.decision || 'approved';
    const adjustment = await ctx.db.one('SELECT * FROM attendance_adjustments WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!adjustment) throw new AppError('NOT_FOUND');
    if (adjustment.status !== 'pending') fail('CONFLICT', null, 'This adjustment has already been resolved.');
    await ctx.db.withTransaction(async (client) => {
      await client.query(
        'UPDATE attendance_adjustments SET status = $1, approved_by = $2, resolved_at = now() WHERE id = $3',
        [decision, ctx.user.id, adjustment.id]
      );
      if (decision === 'approved') {
        const proposed = adjustment.proposed_values;
        await client.query(
          `UPDATE learner_attendance SET attendance_status = $1, check_in_at = $2, check_out_at = $3,
            verified_by = $4, updated_at = now() WHERE id = $5`,
          [proposed.attendanceStatus, proposed.checkInAt || null, proposed.checkOutAt || null,
            ctx.user.id, adjustment.attendance_record_id]
        );
      }
    });
    await recordAudit(ctx.db, ctx, {
      action: `attendance.adjustment_${decision}`, resourceType: 'attendance_adjustment', resourceId: adjustment.id
    });
    return ctx.db.one('SELECT * FROM attendance_adjustments WHERE id = $1', [adjustment.id]);
  }, { permission: 'attendance.correct.daycare' });
}

module.exports = { register };
