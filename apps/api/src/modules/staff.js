'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');
const { sendTemplate } = require('../services/email-service');
const { parsePagination } = require('../utils/http');
const bulk = require('../services/bulk-service');
const { has, today } = require('./helpers');

async function currentStaff(ctx, required = true) {
  const staff = await ctx.db.one(
    'SELECT * FROM staff_profiles WHERE user_id = $1 AND organisation_id = $2',
    [ctx.user.id, ctx.organisationId]
  );
  if (!staff && required) fail('FORBIDDEN', null, 'Your account is not linked to a staff profile.');
  return staff;
}

async function staffById(ctx, id) {
  const staff = await ctx.db.one('SELECT * FROM staff_profiles WHERE id = $1 AND organisation_id = $2', [id, ctx.organisationId]);
  if (!staff) throw new AppError('NOT_FOUND');
  return staff;
}

async function assertShiftConflict(ctx, staffId, date, startsAt, endsAt, excludeId = null) {
  const rows = await ctx.db.many(
    `SELECT id, starts_at, ends_at FROM staff_shifts
     WHERE organisation_id = $1 AND staff_id = $2 AND shift_date = $3 AND status <> 'cancelled'
       AND ($4::uuid IS NULL OR id <> $4::uuid)`,
    [ctx.organisationId, staffId, date, excludeId]
  );
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  for (const row of rows) {
    const otherStart = new Date(row.starts_at).getTime();
    const otherEnd = new Date(row.ends_at).getTime();
    if (start < otherEnd && end > otherStart) {
      fail('CONFLICT', null, 'This shift overlaps another shift for the same staff member.');
    }
  }
}

async function approvedLeaveOverlap(ctx, staffId, date) {
  return ctx.db.one(
    `SELECT id FROM leave_requests WHERE organisation_id = $1 AND staff_id = $2 AND status = 'approved'
       AND starts_on <= $3::date AND ends_on >= $3::date`,
    [ctx.organisationId, staffId, date]
  );
}

function register(router) {
  router.get('/staff/overview', async (ctx) => {
    const counts = await ctx.db.one(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN employment_status = 'active' THEN 1 ELSE 0 END)::int AS active,
              SUM(CASE WHEN employment_status = 'on_leave' THEN 1 ELSE 0 END)::int AS on_leave
       FROM staff_profiles WHERE organisation_id = $1`, [ctx.organisationId]
    );
    const shiftsToday = await ctx.db.one(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)::int AS approved
       FROM staff_shifts WHERE organisation_id = $1 AND shift_date = $2`, [ctx.organisationId, today()]
    );
    const pendingLeave = await ctx.db.one(
      "SELECT COUNT(*)::int AS total FROM leave_requests WHERE organisation_id = $1 AND status = 'pending'",
      [ctx.organisationId]
    );
    const pendingTimesheets = await ctx.db.one(
      "SELECT COUNT(*)::int AS total FROM timesheets WHERE organisation_id = $1 AND status = 'submitted'",
      [ctx.organisationId]
    );
    const expiringDocuments = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM staff_documents
       WHERE organisation_id = $1 AND expires_at IS NOT NULL AND expires_at <= CURRENT_DATE + 60`,
      [ctx.organisationId]
    );
    const clockedIn = await ctx.db.many(
      `SELECT e.staff_id, e.event_type, e.recorded_at, sp.job_title, u.display_name
       FROM staff_attendance_events e
       JOIN staff_profiles sp ON sp.id = e.staff_id
       LEFT JOIN users u ON u.id = sp.user_id
       WHERE e.organisation_id = $1 AND e.recorded_at::date = CURRENT_DATE
       ORDER BY e.recorded_at DESC`,
      [ctx.organisationId]
    );
    const latest = new Map();
    for (const event of clockedIn) if (!latest.has(event.staff_id)) latest.set(event.staff_id, event);
    const onSite = Array.from(latest.values()).filter((e) => e.event_type === 'clock_in' || e.event_type === 'break_end');
    const onBreak = Array.from(latest.values()).filter((e) => e.event_type === 'break_start');
    return {
      staff: counts,
      shiftsToday,
      pendingLeave: pendingLeave.total,
      pendingTimesheets: pendingTimesheets.total,
      expiringDocuments: expiringDocuments.total,
      onSiteCount: onSite.length,
      onBreakCount: onBreak.length,
      onSite: onSite.map((e) => ({ staffId: e.staff_id, name: e.display_name, jobTitle: e.job_title, since: e.recorded_at }))
    };
  }, { permission: ['staff.read.daycare', 'tasks.read.own'], permissionMode: 'any' });

  router.get('/staff', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const term = ctx.query.q ? `%${ctx.query.q}%` : null;
    const branchId = ctx.query.branchId || null;
    const status = ctx.query.status || null;
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM staff_profiles s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.organisation_id = $1
         AND ($2::text IS NULL OR u.display_name ILIKE $2 OR s.employee_reference ILIKE $2 OR s.job_title ILIKE $2)
         AND ($3::text IS NULL OR s.employment_status = $3)`,
      [ctx.organisationId, term, status]
    );
    const rows = await ctx.db.many(
      `SELECT s.*, u.display_name, u.email, u.phone, u.avatar_url, u.last_login_at
       FROM staff_profiles s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.organisation_id = $1
         AND ($2::text IS NULL OR u.display_name ILIKE $2 OR s.employee_reference ILIKE $2 OR s.job_title ILIKE $2)
         AND ($3::text IS NULL OR s.employment_status = $3)
       ORDER BY u.display_name, s.employee_reference LIMIT $4 OFFSET $5`,
      [ctx.organisationId, term, status, pageSize, offset]
    );
    for (const row of rows) {
      row.classrooms = await ctx.db.many(
        `SELECT c.id, c.name, c.branch_id FROM staff_classrooms sc JOIN classrooms c ON c.id = sc.classroom_id
         WHERE sc.staff_id = $1 ORDER BY c.name`, [row.id]
      );
      row.branchIds = Array.from(new Set(row.classrooms.map((c) => c.branch_id)));
    }
    const scoped = branchId ? rows.filter((r) => r.branchIds.includes(branchId)) : rows;
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    return scoped;
  }, { permission: 'staff.read.daycare' });

  router.post('/staff', async (ctx) => {
    const body = validate(ctx.body, {
      userId: { type: 'string', uuid: true, optional: true },
      email: { type: 'string', email: true, optional: true },
      displayName: { type: 'string', min: 2, max: 120, optional: true },
      employeeReference: { type: 'string', min: 2, max: 50 },
      jobTitle: { type: 'string', min: 2, max: 120 },
      startDate: { type: 'string', date: true, optional: true },
      contactDetails: { type: 'object', optional: true },
      classroomIds: { type: 'array', of: 'uuid', max: 20, optional: true }
    });
    let userId = body.userId || null;
    if (!userId && body.email) {
      const existing = await ctx.db.one('SELECT id FROM users WHERE email_normalized = $1', [body.email.toLowerCase()]);
      if (!existing) fail('VALIDATION', [{ field: 'email', message: 'Invite the user to the organisation before creating their staff profile.' }]);
      const membership = await ctx.db.one(
        "SELECT id FROM memberships WHERE user_id = $1 AND organisation_id = $2 AND status = 'active'",
        [existing.id, ctx.organisationId]
      );
      if (!membership) fail('VALIDATION', [{ field: 'email', message: 'The user is not an active member of this organisation.' }]);
      userId = existing.id;
    }
    if (userId) {
      const duplicate = await ctx.db.one(
        'SELECT id FROM staff_profiles WHERE user_id = $1 AND organisation_id = $2', [userId, ctx.organisationId]
      );
      if (duplicate) fail('CONFLICT', null, 'This user already has a staff profile.');
    }
    const staff = await ctx.db.withTransaction(async (client) => {
      const row = (await client.query(
        `INSERT INTO staff_profiles (organisation_id, user_id, employee_reference, job_title, start_date, contact_details)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [ctx.organisationId, userId, body.employeeReference, body.jobTitle,
          body.startDate || null, JSON.stringify(body.contactDetails || {})]
      )).rows[0];
      for (const classroomId of body.classroomIds || []) {
        const classroom = (await client.query(
          'SELECT id FROM classrooms WHERE id = $1 AND organisation_id = $2', [classroomId, ctx.organisationId]
        )).rows[0];
        if (!classroom) continue;
        await client.query(
          'INSERT INTO staff_classrooms (organisation_id, staff_id, classroom_id) VALUES ($1,$2,$3)',
          [ctx.organisationId, row.id, classroomId]
        );
      }
      return row;
    });
    await recordAudit(ctx.db, ctx, {
      action: 'staff.created', resourceType: 'staff_profile', resourceId: staff.id,
      metadata: { employeeReference: staff.employee_reference }
    });
    ctx.status = 201;
    return staff;
  }, { permission: 'staff.manage.daycare' });

  router.get('/staff/:id', async (ctx) => {
    const staff = await staffById(ctx, ctx.params.id);
    const profile = await ctx.db.one('SELECT * FROM users WHERE id = $1', [staff.user_id]);
    const classrooms = await ctx.db.many(
      `SELECT c.* FROM staff_classrooms sc JOIN classrooms c ON c.id = sc.classroom_id
       WHERE sc.staff_id = $1 ORDER BY c.name`, [staff.id]
    );
    const documents = await ctx.db.many('SELECT * FROM staff_documents WHERE staff_id = $1 ORDER BY created_at DESC', [staff.id]);
    const training = await ctx.db.many('SELECT * FROM staff_training_records WHERE staff_id = $1 ORDER BY completed_on DESC', [staff.id]);
    const shifts = await ctx.db.many(
      `SELECT * FROM staff_shifts WHERE staff_id = $1 AND shift_date >= CURRENT_DATE - 14 ORDER BY starts_at DESC LIMIT 30`,
      [staff.id]
    );
    const leave = await ctx.db.many('SELECT * FROM leave_requests WHERE staff_id = $1 ORDER BY starts_on DESC LIMIT 20', [staff.id]);
    const timesheets = await ctx.db.many('SELECT * FROM timesheets WHERE staff_id = $1 ORDER BY period_start DESC LIMIT 12', [staff.id]);
    return {
      ...staff,
      user: profile ? {
        id: profile.id, email: profile.email, displayName: profile.display_name,
        phone: profile.phone, avatarUrl: profile.avatar_url, lastLoginAt: profile.last_login_at
      } : null,
      classrooms, documents, training, shifts, leave, timesheets
    };
  }, { permission: 'staff.read.daycare' });

  router.patch('/staff/:id', async (ctx) => {
    const body = validate(ctx.body, {
      jobTitle: { type: 'string', min: 2, max: 120, optional: true },
      employmentStatus: { type: 'string', enum: ['active', 'on_leave', 'suspended', 'ended'], optional: true },
      startDate: { type: 'string', date: true, optional: true },
      endDate: { type: 'string', date: true, optional: true },
      avatarUrl: { type: 'string', max: 500, optional: true },
      contactDetails: { type: 'object', optional: true }
    });
    const staff = await staffById(ctx, ctx.params.id);
    await ctx.db.query(
      `UPDATE staff_profiles SET job_title = COALESCE($1,job_title), employment_status = COALESCE($2,employment_status),
        start_date = COALESCE($3,start_date), end_date = COALESCE($4,end_date),
        contact_details = COALESCE($5,contact_details), updated_at = now() WHERE id = $6`,
      [body.jobTitle || null, body.employmentStatus || null, body.startDate || null, body.endDate || null,
        body.contactDetails ? JSON.stringify(body.contactDetails) : null, staff.id]
    );
    if (body.avatarUrl) {
      await ctx.db.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [body.avatarUrl, staff.user_id]);
    }
    await recordAudit(ctx.db, ctx, {
      action: 'staff.updated', resourceType: 'staff_profile', resourceId: staff.id, metadata: { fields: Object.keys(body) }
    });
    return ctx.db.one('SELECT * FROM staff_profiles WHERE id = $1', [staff.id]);
  }, { permission: 'staff.manage.daycare' });

  router.post('/staff/bulk', async (ctx) => {
    const body = bulk.parse(ctx.body, ['activate', 'suspend', 'end']);
    const target = { activate: 'active', suspend: 'suspended', end: 'ended' }[body.action];
    return bulk.run(ctx, {
      ids: body.ids,
      action: body.action,
      resourceType: 'staff_profile',
      auditAction: 'staff.employment_status_changed',
      handler: async (id) => {
        const staff = await ctx.db.one(
          'SELECT * FROM staff_profiles WHERE id = $1 AND organisation_id = $2', [id, ctx.organisationId]
        );
        if (!staff) return { ok: false, reason: 'not found' };
        if (staff.employment_status === target) return { ok: false, reason: 'already ' + target };
        if (staff.user_id === ctx.user.id) return { ok: false, reason: 'you cannot change your own employment status' };
        await ctx.db.query(
          `UPDATE staff_profiles SET employment_status = $1, end_date = CASE WHEN $1 = 'ended' THEN COALESCE(end_date, CURRENT_DATE) ELSE end_date END,
             updated_at = now() WHERE id = $2`, [target, id]
        );
        return { ok: true, metadata: { employmentStatus: target } };
      }
    });
  }, { permission: 'staff.manage.daycare' });

  router.post('/staff/:id/classrooms', async (ctx) => {
    const body = validate(ctx.body, {
      classroomIds: { type: 'array', of: 'uuid', max: 20 }
    });
    const staff = await staffById(ctx, ctx.params.id);
    await ctx.db.withTransaction(async (client) => {
      await client.query('DELETE FROM staff_classrooms WHERE staff_id = $1', [staff.id]);
      for (const classroomId of body.classroomIds) {
        const classroom = (await client.query(
          'SELECT id FROM classrooms WHERE id = $1 AND organisation_id = $2', [classroomId, ctx.organisationId]
        )).rows[0];
        if (!classroom) continue;
        await client.query(
          'INSERT INTO staff_classrooms (organisation_id, staff_id, classroom_id) VALUES ($1,$2,$3)',
          [ctx.organisationId, staff.id, classroomId]
        );
      }
    });
    await recordAudit(ctx.db, ctx, {
      action: 'staff.classrooms_updated', resourceType: 'staff_profile', resourceId: staff.id,
      metadata: { classroomIds: body.classroomIds }
    });
    return ctx.db.many('SELECT * FROM staff_classrooms WHERE staff_id = $1', [staff.id]);
  }, { permission: 'staff.manage.daycare' });

  router.get('/staff/:id/documents', async (ctx) => {
    const staff = await staffById(ctx, ctx.params.id);
    return ctx.db.many('SELECT * FROM staff_documents WHERE staff_id = $1 ORDER BY created_at DESC', [staff.id]);
  }, { permission: 'staff.read.daycare' });

  router.post('/staff/:id/documents', async (ctx) => {
    const body = validate(ctx.body, {
      documentType: { type: 'string', min: 2, max: 80 },
      title: { type: 'string', min: 2, max: 200 },
      storageKey: { type: 'string', min: 3, max: 500, optional: true },
      fileUrl: { type: 'string', max: 500, optional: true },
      issuedAt: { type: 'string', date: true, optional: true },
      expiresAt: { type: 'string', date: true, optional: true }
    });
    const staff = await staffById(ctx, ctx.params.id);
    const location = body.fileUrl || body.storageKey || null;
    const document = await ctx.db.one(
      `INSERT INTO staff_documents (organisation_id, staff_id, document_type, title, storage_key, file_url, issued_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [ctx.organisationId, staff.id, body.documentType, body.title, location, location,
        body.issuedAt || null, body.expiresAt || null]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'staff.document_added', resourceType: 'staff_document', resourceId: document.id
    });
    ctx.status = 201;
    return document;
  }, { permission: 'staff.manage.daycare' });

  router.post('/staff/:id/documents/:documentId/verify', async (ctx) => {
    const body = validate(ctx.body, {
      verificationStatus: { type: 'string', enum: ['verified', 'rejected', 'expired'] }
    });
    const staff = await staffById(ctx, ctx.params.id);
    const document = await ctx.db.one(
      'SELECT * FROM staff_documents WHERE id = $1 AND staff_id = $2', [ctx.params.documentId, staff.id]
    );
    if (!document) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      'UPDATE staff_documents SET verification_status = $1, verified_by = $2 WHERE id = $3',
      [body.verificationStatus, ctx.user.id, document.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'staff.document_verified', resourceType: 'staff_document', resourceId: document.id,
      metadata: { status: body.verificationStatus }
    });
    return ctx.db.one('SELECT * FROM staff_documents WHERE id = $1', [document.id]);
  }, { permission: 'staff.manage.daycare' });

  router.post('/staff/:id/training', async (ctx) => {
    const body = validate(ctx.body, {
      courseName: { type: 'string', min: 2, max: 200 },
      provider: { type: 'string', max: 150, optional: true },
      completedOn: { type: 'string', date: true, optional: true },
      expiresOn: { type: 'string', date: true, optional: true },
      certificateStorageKey: { type: 'string', max: 500, optional: true }
    });
    const staff = await staffById(ctx, ctx.params.id);
    const record = await ctx.db.one(
      `INSERT INTO staff_training_records (organisation_id, staff_id, course_name, provider, completed_on, expires_on,
        certificate_storage_key) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ctx.organisationId, staff.id, body.courseName, body.provider || null, body.completedOn || null,
        body.expiresOn || null, body.certificateStorageKey || null]
    );
    await recordAudit(ctx.db, ctx, { action: 'staff.training_added', resourceType: 'staff_training', resourceId: record.id });
    ctx.status = 201;
    return record;
  }, { permission: 'staff.manage.daycare' });

  // --- Shifts -------------------------------------------------------------

  router.get('/shifts', async (ctx) => {
    const from = ctx.query.from || today();
    const to = ctx.query.to || from;
    const staffId = ctx.query.staffId || null;
    const branchId = ctx.query.branchId || null;
    const scopeAll = has(ctx, 'shifts.read.daycare');
    const params = [ctx.organisationId, from, to, staffId, branchId];
    let extra = '';
    if (!scopeAll) {
      const staff = await currentStaff(ctx, false);
      if (!staff) return [];
      params.push(staff.id);
      extra = ` AND s.staff_id = $${params.length}`;
    }
    const rows = await ctx.db.many(
      `SELECT s.*, u.display_name AS staff_name, sp.job_title, b.name AS branch_name, c.name AS classroom_name
       FROM staff_shifts s
       JOIN staff_profiles sp ON sp.id = s.staff_id
       LEFT JOIN users u ON u.id = sp.user_id
       LEFT JOIN branches b ON b.id = s.branch_id
       LEFT JOIN classrooms c ON c.id = s.assigned_classroom_id
       WHERE s.organisation_id = $1 AND s.shift_date BETWEEN $2 AND $3
         AND ($4::uuid IS NULL OR s.staff_id = $4::uuid)
         AND ($5::uuid IS NULL OR s.branch_id = $5::uuid)${extra}
       ORDER BY s.starts_at`, params
    );
    return rows;
  }, { permission: ['shifts.read.daycare', 'shifts.read.assigned'], permissionMode: 'any' });

  router.post('/shifts', async (ctx) => {
    const body = validate(ctx.body, {
      staffId: { type: 'string', uuid: true },
      branchId: { type: 'string', uuid: true },
      shiftDate: { type: 'string', date: true },
      startsAt: { type: 'string', datetime: true },
      endsAt: { type: 'string', datetime: true },
      breakMinutes: { type: 'number', min: 0, max: 240, optional: true },
      assignedClassroomId: { type: 'string', uuid: true, optional: true },
      publish: { type: 'boolean', optional: true }
    });
    const staff = await staffById(ctx, body.staffId);
    if (staff.employment_status === 'ended') fail('VALIDATION', [{ field: 'staffId', message: 'This staff member has left employment.' }]);
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) fail('VALIDATION', [{ field: 'branchId', message: 'Unknown branch.' }]);
    if (new Date(body.endsAt) <= new Date(body.startsAt)) {
      fail('VALIDATION', [{ field: 'endsAt', message: 'The shift must end after it starts.' }]);
    }
    const leave = await approvedLeaveOverlap(ctx, staff.id, body.shiftDate);
    if (leave) fail('CONFLICT', null, 'This staff member has approved leave on that date.');
    await assertShiftConflict(ctx, staff.id, body.shiftDate, body.startsAt, body.endsAt);
    if (body.assignedClassroomId) {
      const classroom = await ctx.db.one('SELECT id FROM classrooms WHERE id = $1 AND organisation_id = $2',
        [body.assignedClassroomId, ctx.organisationId]);
      if (!classroom) fail('VALIDATION', [{ field: 'assignedClassroomId', message: 'Unknown classroom.' }]);
    }
    const shift = await ctx.db.one(
      `INSERT INTO staff_shifts (organisation_id, branch_id, staff_id, shift_date, starts_at, ends_at, break_minutes,
        assigned_classroom_id, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [ctx.organisationId, body.branchId, staff.id, body.shiftDate, body.startsAt, body.endsAt,
        body.breakMinutes === undefined ? 30 : body.breakMinutes, body.assignedClassroomId || null,
        body.publish === true ? 'scheduled' : 'draft', ctx.user.id]
    );
    if (staff.user_id) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: [staff.user_id], type: 'shift_scheduled',
        title: 'New shift scheduled', body: `A shift has been scheduled for ${body.shiftDate}.`,
        resourceType: 'staff_shift', resourceId: shift.id
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: 'shift.created', resourceType: 'staff_shift', resourceId: shift.id, branchId: body.branchId
    });
    ctx.status = 201;
    return shift;
  }, { permission: 'shifts.create.daycare' });

  router.patch('/shifts/:id', async (ctx) => {
    const body = validate(ctx.body, {
      startsAt: { type: 'string', datetime: true, optional: true },
      endsAt: { type: 'string', datetime: true, optional: true },
      breakMinutes: { type: 'number', min: 0, max: 240, optional: true },
      assignedClassroomId: { type: 'string', uuid: true, optional: true },
      status: { type: 'string', enum: ['draft', 'scheduled', 'approved', 'completed', 'cancelled'], optional: true }
    });
    const shift = await ctx.db.one('SELECT * FROM staff_shifts WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!shift) throw new AppError('NOT_FOUND');
    if (shift.status === 'completed') fail('CONFLICT', null, 'Completed shifts cannot be edited.');
    const startsAt = body.startsAt || shift.starts_at;
    const endsAt = body.endsAt || shift.ends_at;
    if (new Date(endsAt) <= new Date(startsAt)) fail('VALIDATION', [{ field: 'endsAt', message: 'The shift must end after it starts.' }]);
    await assertShiftConflict(ctx, shift.staff_id, shift.shift_date, startsAt, endsAt, shift.id);
    await ctx.db.query(
      `UPDATE staff_shifts SET starts_at = $1, ends_at = $2, break_minutes = COALESCE($3,break_minutes),
        assigned_classroom_id = COALESCE($4,assigned_classroom_id), status = COALESCE($5,status)
       WHERE id = $6`,
      [startsAt, endsAt, body.breakMinutes === undefined ? null : body.breakMinutes,
        body.assignedClassroomId || null, body.status || null, shift.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'shift.updated', resourceType: 'staff_shift', resourceId: shift.id });
    return ctx.db.one('SELECT * FROM staff_shifts WHERE id = $1', [shift.id]);
  }, { permission: 'shifts.create.daycare' });

  router.post('/shifts/:id/approve', async (ctx) => {
    const shift = await ctx.db.one('SELECT * FROM staff_shifts WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!shift) throw new AppError('NOT_FOUND');
    if (shift.status === 'cancelled') fail('CONFLICT', null, 'Cancelled shifts cannot be approved.');
    await ctx.db.query(
      "UPDATE staff_shifts SET status = 'approved', approved_by = $1 WHERE id = $2", [ctx.user.id, shift.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'shift.approved', resourceType: 'staff_shift', resourceId: shift.id });
    return ctx.db.one('SELECT * FROM staff_shifts WHERE id = $1', [shift.id]);
  }, { permission: 'shifts.approve.daycare' });

  router.post('/shifts/:id/cancel', async (ctx) => {
    const body = validate(ctx.body, { reason: { type: 'string', min: 3, max: 500, optional: true } });
    const shift = await ctx.db.one('SELECT * FROM staff_shifts WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!shift) throw new AppError('NOT_FOUND');
    if (shift.status === 'completed') fail('CONFLICT', null, 'Completed shifts cannot be cancelled.');
    await ctx.db.query("UPDATE staff_shifts SET status = 'cancelled' WHERE id = $1", [shift.id]);
    await recordAudit(ctx.db, ctx, {
      action: 'shift.cancelled', resourceType: 'staff_shift', resourceId: shift.id,
      metadata: { reason: body.reason || null }
    });
    return { success: true };
  }, { permission: 'shifts.create.daycare' });

  // --- Staff attendance ---------------------------------------------------

  router.get('/staff-attendance/me', async (ctx) => {
    const staff = await currentStaff(ctx, false);
    if (!staff) return { staff: null, today: [], week: [], status: 'not_linked' };
    const events = await ctx.db.many(
      `SELECT * FROM staff_attendance_events WHERE staff_id = $1 AND recorded_at::date = CURRENT_DATE ORDER BY recorded_at`,
      [staff.id]
    );
    const week = await ctx.db.many(
      `SELECT * FROM staff_attendance_events WHERE staff_id = $1 AND recorded_at >= CURRENT_DATE - 6 ORDER BY recorded_at`,
      [staff.id]
    );
    const shift = await ctx.db.one(
      `SELECT * FROM staff_shifts WHERE staff_id = $1 AND shift_date = CURRENT_DATE AND status <> 'cancelled'
       ORDER BY starts_at LIMIT 1`, [staff.id]
    );
    const latest = events.length ? events[events.length - 1] : null;
    const status = !latest ? 'not_clocked_in'
      : latest.event_type === 'clock_out' ? 'clocked_out'
        : latest.event_type === 'break_start' ? 'on_break' : 'on_site';
    return { staff, today: events, week, shift, status };
  }, { permission: ['staff_attendance.record.own', 'staff_attendance.read.assigned', 'staff_attendance.read.daycare'], permissionMode: 'any' });

  async function recordEvent(ctx, type) {
    const body = validate(ctx.body || {}, {
      staffId: { type: 'string', uuid: true, optional: true },
      clientRecordedAt: { type: 'string', datetime: true, optional: true },
      deviceReference: { type: 'string', max: 120, optional: true }
    });
    let staff;
    if (body.staffId) {
      if (!has(ctx, 'staff_attendance.record.daycare')) fail('FORBIDDEN');
      staff = await staffById(ctx, body.staffId);
    } else {
      staff = await currentStaff(ctx);
    }
    if (staff.employment_status !== 'active' && staff.employment_status !== 'on_leave') {
      fail('FORBIDDEN', null, 'This staff profile is not active.');
    }
    const events = await ctx.db.many(
      `SELECT * FROM staff_attendance_events WHERE staff_id = $1 AND recorded_at::date = CURRENT_DATE ORDER BY recorded_at`,
      [staff.id]
    );
    const latest = events.length ? events[events.length - 1] : null;
    if (type === 'clock_in' && latest && (latest.event_type === 'clock_in' || latest.event_type === 'break_end')) {
      fail('CONFLICT', null, 'This staff member is already clocked in.');
    }
    if (type === 'break_start' && (!latest || !['clock_in', 'break_end'].includes(latest.event_type))) {
      fail('CONFLICT', null, 'A break can only start while clocked in.');
    }
    if (type === 'break_end' && (!latest || latest.event_type !== 'break_start')) {
      fail('CONFLICT', null, 'There is no active break to end.');
    }
    if (type === 'clock_out' && (!latest || latest.event_type === 'clock_out')) {
      fail('CONFLICT', null, 'This staff member is not currently clocked in.');
    }
    const shift = await ctx.db.one(
      `SELECT * FROM staff_shifts WHERE staff_id = $1 AND shift_date = CURRENT_DATE AND status <> 'cancelled'
       ORDER BY starts_at LIMIT 1`, [staff.id]
    );
    let branchId = shift ? shift.branch_id : null;
    if (!branchId) {
      const classroom = await ctx.db.one(
        `SELECT c.branch_id FROM staff_classrooms sc JOIN classrooms c ON c.id = sc.classroom_id
         WHERE sc.staff_id = $1 ORDER BY sc.assigned_at LIMIT 1`, [staff.id]
      );
      branchId = classroom ? classroom.branch_id : null;
    }
    if (!branchId) {
      const branch = await ctx.db.one(
        'SELECT id FROM branches WHERE organisation_id = $1 ORDER BY created_at LIMIT 1', [ctx.organisationId]
      );
      branchId = branch ? branch.id : null;
    }
    if (!branchId) fail('VALIDATION', [{ field: 'branchId', message: 'Create a branch before recording attendance.' }]);
    const event = await ctx.db.one(
      `INSERT INTO staff_attendance_events (organisation_id, branch_id, staff_id, shift_id, event_type, client_recorded_at,
        source, device_reference, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,'web',$7,$8) RETURNING *`,
      [ctx.organisationId, branchId, staff.id, shift ? shift.id : null, type,
        body.clientRecordedAt || null, body.deviceReference || null, ctx.user.id]
    );
    if (type === 'clock_in' && shift) {
      await ctx.db.query("UPDATE staff_shifts SET status = 'approved' WHERE id = $1 AND status = 'scheduled'", [shift.id]);
    }
    await recordAudit(ctx.db, ctx, {
      action: `staff_attendance.${type}`, resourceType: 'staff_attendance_event', resourceId: event.id, branchId
    });
    ctx.status = 201;
    return event;
  }

  const clockPermissions = { permission: ['staff_attendance.record.own', 'staff_attendance.record.daycare'], permissionMode: 'any' };
  router.post('/staff-attendance/clock-in', (ctx) => recordEvent(ctx, 'clock_in'), clockPermissions);
  router.post('/staff-attendance/clock-out', (ctx) => recordEvent(ctx, 'clock_out'), clockPermissions);
  router.post('/staff-attendance/break-start', (ctx) => recordEvent(ctx, 'break_start'), clockPermissions);
  router.post('/staff-attendance/break-end', (ctx) => recordEvent(ctx, 'break_end'), clockPermissions);

  router.get('/staff-attendance', async (ctx) => {
    const date = ctx.query.date || today();
    const rows = await ctx.db.many(
      `SELECT e.*, u.display_name AS staff_name, sp.job_title
       FROM staff_attendance_events e
       JOIN staff_profiles sp ON sp.id = e.staff_id
       LEFT JOIN users u ON u.id = sp.user_id
       WHERE e.organisation_id = $1 AND e.recorded_at::date = $2::date
       ORDER BY e.recorded_at`, [ctx.organisationId, date]
    );
    const staff = await ctx.db.many(
      `SELECT sp.id, sp.job_title, u.display_name, s.id AS shift_id, s.starts_at, s.ends_at, s.status AS shift_status
       FROM staff_profiles sp
       LEFT JOIN users u ON u.id = sp.user_id
       LEFT JOIN staff_shifts s ON s.staff_id = sp.id AND s.shift_date = $2
       WHERE sp.organisation_id = $1 AND sp.employment_status IN ('active','on_leave')
       ORDER BY u.display_name`, [ctx.organisationId, date]
    );
    return { date, events: rows, staff };
  }, { permission: 'staff_attendance.read.daycare' });

  router.post('/staff-attendance/events', async (ctx) => {
    const body = validate(ctx.body, {
      staffId: { type: 'string', uuid: true },
      eventType: { type: 'string', enum: ['clock_in', 'clock_out', 'break_start', 'break_end'] },
      recordedAt: { type: 'string', datetime: true, optional: true },
      notes: { type: 'string', max: 1000, optional: true }
    });
    const staff = await staffById(ctx, body.staffId);
    const shift = await ctx.db.one(
      `SELECT * FROM staff_shifts WHERE staff_id = $1 AND shift_date = CURRENT_DATE AND status <> 'cancelled'
       ORDER BY starts_at LIMIT 1`, [staff.id]
    );
    const event = await ctx.db.one(
      `INSERT INTO staff_attendance_events (organisation_id, branch_id, staff_id, shift_id, event_type, recorded_at,
        source, recorded_by, approval_status)
       VALUES ($1,$2,$3,$4,$5,$6,'manual',$7,'approved') RETURNING *`,
      [ctx.organisationId, shift ? shift.branch_id : null, staff.id, shift ? shift.id : null, body.eventType,
        body.recordedAt || new Date().toISOString(), ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'staff_attendance.manual_event', resourceType: 'staff_attendance_event', resourceId: event.id,
      metadata: { eventType: body.eventType, notes: body.notes || null }
    });
    ctx.status = 201;
    return event;
  }, { permission: 'staff_attendance.correct.daycare' });

  router.get('/staff-attendance/summary', async (ctx) => {
    const from = ctx.query.from || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const to = ctx.query.to || today();
    const rows = await ctx.db.many(
      `SELECT sp.id AS staff_id, u.display_name AS staff_name, sp.job_title,
              COUNT(CASE WHEN e.event_type = 'clock_in' THEN 1 END)::int AS days_clocked_in,
              COUNT(CASE WHEN e.approval_status = 'rejected' THEN 1 END)::int AS rejected_events
       FROM staff_profiles sp
       LEFT JOIN users u ON u.id = sp.user_id
       LEFT JOIN staff_attendance_events e ON e.staff_id = sp.id AND e.recorded_at::date BETWEEN $2::date AND $3::date
       WHERE sp.organisation_id = $1
       GROUP BY sp.id, u.display_name, sp.job_title ORDER BY u.display_name`,
      [ctx.organisationId, from, to]
    );
    return { from, to, rows };
  }, { permission: 'staff_attendance.read.daycare' });

  // --- Timesheets ---------------------------------------------------------

  router.get('/timesheets', async (ctx) => {
    const status = ctx.query.status || null;
    const rows = await ctx.db.many(
      `SELECT t.*, u.display_name AS staff_name, sp.job_title
       FROM timesheets t JOIN staff_profiles sp ON sp.id = t.staff_id
       LEFT JOIN users u ON u.id = sp.user_id
       WHERE t.organisation_id = $1 AND ($2::text IS NULL OR t.status = $2)
       ORDER BY t.period_start DESC LIMIT 100`, [ctx.organisationId, status]
    );
    return rows;
  }, { permission: 'timesheets.read.daycare' });

  router.post('/timesheets/generate', async (ctx) => {
    const body = validate(ctx.body, {
      staffId: { type: 'string', uuid: true, optional: true },
      periodStart: { type: 'string', date: true },
      periodEnd: { type: 'string', date: true }
    });
    if (body.periodEnd < body.periodStart) {
      fail('VALIDATION', [{ field: 'periodEnd', message: 'The period end must follow the period start.' }]);
    }
    const staffRows = body.staffId
      ? [await staffById(ctx, body.staffId)]
      : await ctx.db.many("SELECT * FROM staff_profiles WHERE organisation_id = $1 AND employment_status = 'active'", [ctx.organisationId]);
    const created = [];
    for (const staff of staffRows) {
      const events = await ctx.db.many(
        `SELECT * FROM staff_attendance_events WHERE staff_id = $1 AND approval_status <> 'rejected'
           AND recorded_at::date BETWEEN $2::date AND $3::date ORDER BY recorded_at`,
        [staff.id, body.periodStart, body.periodEnd]
      );
      let totalMinutes = 0;
      let clockIn = null;
      let breakStart = null;
      for (const event of events) {
        const at = new Date(event.recorded_at).getTime();
        if (event.event_type === 'clock_in') clockIn = at;
        else if (event.event_type === 'break_start' && clockIn) breakStart = at;
        else if (event.event_type === 'break_end' && breakStart) { totalMinutes += Math.round((at - breakStart) / 60000); breakStart = null; }
        else if (event.event_type === 'clock_out' && clockIn) {
          totalMinutes += Math.round((at - clockIn) / 60000);
          if (breakStart) breakStart = null;
          clockIn = null;
        }
      }
      const workedMinutes = Math.max(0, totalMinutes);
      const overtime = Math.max(0, workedMinutes - 45 * 60 * 5);
      const existing = await ctx.db.one(
        'SELECT * FROM timesheets WHERE staff_id = $1 AND period_start = $2 AND period_end = $3',
        [staff.id, body.periodStart, body.periodEnd]
      );
      if (existing) {
        if (existing.status === 'approved') continue;
        await ctx.db.query(
          'UPDATE timesheets SET total_minutes = $1, overtime_minutes = $2 WHERE id = $3',
          [workedMinutes, overtime, existing.id]
        );
        created.push({ ...existing, total_minutes: workedMinutes, overtime_minutes: overtime });
      } else {
        const row = await ctx.db.one(
          `INSERT INTO timesheets (organisation_id, staff_id, period_start, period_end, total_minutes, overtime_minutes)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [ctx.organisationId, staff.id, body.periodStart, body.periodEnd, workedMinutes, overtime]
        );
        created.push(row);
      }
    }
    await recordAudit(ctx.db, ctx, {
      action: 'timesheet.generated', resourceType: 'timesheet', resourceId: null,
      metadata: { periodStart: body.periodStart, periodEnd: body.periodEnd, count: created.length }
    });
    return created;
  }, { permission: 'timesheets.approve.daycare' });

  router.post('/timesheets/:id/transition', async (ctx) => {
    const body = validate(ctx.body, {
      status: { type: 'string', enum: ['submitted', 'approved', 'rejected', 'draft'] },
      reason: { type: 'string', max: 1000, optional: true }
    });
    const timesheet = await ctx.db.one('SELECT * FROM timesheets WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!timesheet) throw new AppError('NOT_FOUND');
    if (timesheet.status === 'approved' && body.status === 'approved') {
      fail('CONFLICT', null, 'This timesheet is already approved.');
    }
    if (body.status === 'submitted' && timesheet.status !== 'draft') {
      fail('CONFLICT', null, 'Only draft timesheets can be submitted.');
    }
    await ctx.db.query(
      `UPDATE timesheets SET status = $1, approved_by = CASE WHEN $1 = 'approved' THEN $2 ELSE approved_by END,
        approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END WHERE id = $3`,
      [body.status, ctx.user.id, timesheet.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: `timesheet.${body.status}`, resourceType: 'timesheet', resourceId: timesheet.id,
      metadata: { reason: body.reason || null }
    });
    return ctx.db.one('SELECT * FROM timesheets WHERE id = $1', [timesheet.id]);
  }, { permission: 'timesheets.approve.daycare' });

  // --- Leave --------------------------------------------------------------

  router.get('/leave', async (ctx) => {
    const status = ctx.query.status || null;
    const scopeAll = has(ctx, 'leave.read.daycare');
    const params = [ctx.organisationId, status];
    let extra = '';
    if (!scopeAll) {
      const staff = await currentStaff(ctx, false);
      if (!staff) return [];
      params.push(staff.id);
      extra = ` AND l.staff_id = $${params.length}`;
    }
    return ctx.db.many(
      `SELECT l.*, u.display_name AS staff_name, sp.job_title, r.display_name AS reviewed_by_name
       FROM leave_requests l
       JOIN staff_profiles sp ON sp.id = l.staff_id
       LEFT JOIN users u ON u.id = sp.user_id
       LEFT JOIN users r ON r.id = l.reviewed_by
       WHERE l.organisation_id = $1 AND ($2::text IS NULL OR l.status = $2)${extra}
       ORDER BY l.starts_on DESC, l.created_at DESC`, params
    );
  }, { permission: ['leave.read.daycare', 'leave.request.own'], permissionMode: 'any' });

  router.post('/leave', async (ctx) => {
    const body = validate(ctx.body, {
      staffId: { type: 'string', uuid: true, optional: true },
      leaveType: { type: 'string', enum: ['annual', 'sick', 'family', 'study', 'unpaid', 'maternity'] },
      startsOn: { type: 'string', date: true },
      endsOn: { type: 'string', date: true },
      reason: { type: 'string', max: 1000, optional: true }
    });
    const scopeAll = has(ctx, 'leave.manage.daycare');
    let staff;
    if (body.staffId) {
      if (!scopeAll) fail('FORBIDDEN');
      staff = await staffById(ctx, body.staffId);
    } else {
      staff = await currentStaff(ctx);
    }
    if (body.endsOn < body.startsOn) {
      fail('VALIDATION', [{ field: 'endsOn', message: 'The end date must follow the start date.' }]);
    }
    const overlap = await ctx.db.one(
      `SELECT id FROM leave_requests WHERE staff_id = $1 AND status IN ('pending','approved')
         AND starts_on <= $3::date AND ends_on >= $2::date`,
      [staff.id, body.startsOn, body.endsOn]
    );
    if (overlap) fail('CONFLICT', null, 'This leave request overlaps an existing request.');
    const leave = await ctx.db.one(
      `INSERT INTO leave_requests (organisation_id, staff_id, leave_type, starts_on, ends_on, reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [ctx.organisationId, staff.id, body.leaveType, body.startsOn, body.endsOn, body.reason || null]
    );
    const approvers = await ctx.db.many(
      `SELECT DISTINCT m.user_id FROM memberships m
       JOIN membership_roles mr ON mr.membership_id = m.id
       JOIN roles r ON r.id = mr.role_id
       WHERE m.organisation_id = $1 AND m.status = 'active'
         AND r.role_key IN ('principal','daycare_administrator','daycare_manager','organisation_owner')`,
      [ctx.organisationId]
    );
    if (approvers.length) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: approvers.map((a) => a.user_id), type: 'leave_requested',
        title: 'Leave request submitted',
        body: `A ${body.leaveType} leave request was submitted for ${body.startsOn} to ${body.endsOn}.`,
        resourceType: 'leave_request', resourceId: leave.id
      });
    }
    await recordAudit(ctx.db, ctx, { action: 'leave.requested', resourceType: 'leave_request', resourceId: leave.id });
    ctx.status = 201;
    return leave;
  }, { permission: ['leave.request.own', 'leave.manage.daycare'], permissionMode: 'any' });

  router.post('/leave/:id/review', async (ctx) => {
    const body = validate(ctx.body, {
      decision: { type: 'string', enum: ['approved', 'rejected'] },
      reason: { type: 'string', max: 1000, optional: true }
    });
    const leave = await ctx.db.one('SELECT * FROM leave_requests WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!leave) throw new AppError('NOT_FOUND');
    if (leave.status !== 'pending') fail('CONFLICT', null, 'This request has already been reviewed.');
    await ctx.db.query(
      'UPDATE leave_requests SET status = $1, reviewed_by = $2, reviewed_at = now() WHERE id = $3',
      [body.decision, ctx.user.id, leave.id]
    );
    if (body.decision === 'approved') {
      await ctx.db.query(
        "UPDATE staff_profiles SET employment_status = 'on_leave', updated_at = now() WHERE id = $1 AND employment_status = 'active'",
        [leave.staff_id]
      );
    }
    const staff = await ctx.db.one(
      `SELECT sp.user_id, u.email, u.display_name FROM staff_profiles sp
       LEFT JOIN users u ON u.id = sp.user_id WHERE sp.id = $1`, [leave.staff_id]
    );
    if (staff && staff.user_id) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: [staff.user_id], type: 'leave_decision',
        title: `Leave ${body.decision}`, body: body.reason || `Your leave request was ${body.decision}.`,
        resourceType: 'leave_request', resourceId: leave.id
      });
    }
    if (staff && staff.email) {
      await sendTemplate(ctx.db, 'leaveDecision', {
        to: staff.email,
        organisationId: ctx.organisationId,
        metadata: { leaveRequestId: leave.id },
        data: {
          staffName: staff.display_name,
          status: body.decision,
          leaveType: leave.leave_type,
          dates: `${leave.starts_on} to ${leave.ends_on}`,
          reviewer: ctx.user.display_name,
          note: body.reason
        }
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: `leave.${body.decision}`, resourceType: 'leave_request', resourceId: leave.id,
      metadata: { reason: body.reason || null }
    });
    return ctx.db.one('SELECT * FROM leave_requests WHERE id = $1', [leave.id]);
  }, { permission: 'leave.manage.daycare' });
}

module.exports = { register };
