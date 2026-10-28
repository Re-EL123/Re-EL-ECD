'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { parsePagination } = require('../utils/http');
const { getLearner, assertLearnerWrite, has, assignedClassroomIds } = require('./helpers');

function register(router) {
  router.get('/learners', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const term = ctx.query.q ? `%${ctx.query.q}%` : null;
    const branchId = ctx.query.branchId || null;
    const classroomId = ctx.query.classroomId || null;
    const status = ctx.query.status || null;
    const scopeAll = has(ctx, 'learners.read.daycare');
    let allowedClassrooms = null;
    if (!scopeAll) allowedClassrooms = await assignedClassroomIds(ctx);
    if (!scopeAll && allowedClassrooms.length === 0) return [];
    const params = [ctx.organisationId, term, branchId, classroomId, status];
    const conditions = [
      'l.organisation_id = $1',
      '($2::text IS NULL OR l.first_name ILIKE $2 OR l.last_name ILIKE $2 OR l.learner_reference ILIKE $2)',
      '($3::uuid IS NULL OR l.branch_id = $3::uuid)',
      '($4::uuid IS NULL OR l.classroom_id = $4::uuid)',
      '($5::text IS NULL OR l.status = $5)'
    ];
    if (!scopeAll) {
      params.push(allowedClassrooms);
      conditions.push(`l.classroom_id = ANY($${params.length}::uuid[])`);
    }
    const where = conditions.join(' AND ');
    const total = await ctx.db.one(`SELECT COUNT(*)::int AS total FROM learners l WHERE ${where}`, params);
    const rows = await ctx.db.many(
      `SELECT l.*, c.name AS classroom_name, b.name AS branch_name
       FROM learners l
       LEFT JOIN classrooms c ON c.id = l.classroom_id
       LEFT JOIN branches b ON b.id = l.branch_id
       WHERE ${where}
       ORDER BY l.last_name, l.first_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    for (const learner of rows) {
      const guardian = await ctx.db.one(
        `SELECT g.first_name, g.last_name, g.email, g.phone, lg.relationship_type
         FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
         WHERE lg.learner_id = $1 ORDER BY lg.is_primary_contact DESC LIMIT 1`, [learner.id]
      );
      learner.primary_guardian = guardian || null;
      learner.age_years = Math.floor((Date.now() - new Date(learner.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000));
    }
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    ctx.meta.totalPages = Math.max(1, Math.ceil(total.total / pageSize));
    return rows;
  }, { permission: ['learners.read.daycare', 'learners.read.assigned'], permissionMode: 'any' });

  router.post('/learners', async (ctx) => {
    const body = validate(ctx.body, {
      firstName: { type: 'string', min: 1, max: 100 },
      lastName: { type: 'string', min: 1, max: 100 },
      preferredName: { type: 'string', max: 100, optional: true },
      dateOfBirth: { type: 'string', date: true },
      gender: { type: 'string', max: 20, optional: true },
      homeLanguage: { type: 'string', max: 60, optional: true },
      branchId: { type: 'string', uuid: true },
      classroomId: { type: 'string', uuid: true, optional: true },
      learnerReference: { type: 'string', max: 50, optional: true },
      enrolmentDate: { type: 'string', date: true, optional: true },
      guardianId: { type: 'string', uuid: true, optional: true },
      guardian: { type: 'object', optional: true }
    });
    const branch = await ctx.db.one('SELECT * FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) fail('VALIDATION', [{ field: 'branchId', message: 'Unknown branch.' }]);
    if (branch.status !== 'active') fail('VALIDATION', [{ field: 'branchId', message: 'The branch is inactive.' }]);
    if (body.classroomId) {
      const classroom = await ctx.db.one('SELECT id FROM classrooms WHERE id = $1 AND organisation_id = $2',
        [body.classroomId, ctx.organisationId]);
      if (!classroom) fail('VALIDATION', [{ field: 'classroomId', message: 'Unknown classroom.' }]);
    }
    const reference = body.learnerReference || `LS-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`;
    const learner = await ctx.db.withTransaction(async (client) => {
      const row = (await client.query(
        `INSERT INTO learners (organisation_id, branch_id, classroom_id, learner_reference, first_name, last_name,
          preferred_name, date_of_birth, gender, home_language, status, enrolment_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'enrolled',$11,$12) RETURNING *`,
        [ctx.organisationId, body.branchId, body.classroomId || null, reference, body.firstName, body.lastName,
          body.preferredName || null, body.dateOfBirth, body.gender || null, body.homeLanguage || null,
          body.enrolmentDate || new Date().toISOString().slice(0, 10), ctx.user.id]
      )).rows[0];
      if (body.classroomId) {
        await client.query(
          `INSERT INTO learner_classroom_history (organisation_id, learner_id, classroom_id, started_on, reason, created_by)
           VALUES ($1,$2,$3,CURRENT_DATE,'Initial enrolment',$4)`,
          [ctx.organisationId, row.id, body.classroomId, ctx.user.id]
        );
      }
      await client.query(
        `INSERT INTO enrolments (organisation_id, branch_id, learner_id, classroom_id, start_date, status)
         VALUES ($1,$2,$3,$4,$5,'active')`,
        [ctx.organisationId, body.branchId, row.id, body.classroomId || null,
          body.enrolmentDate || new Date().toISOString().slice(0, 10)]
      );
      if (body.guardianId) {
        const guardian = (await client.query(
          'SELECT id FROM guardians WHERE id = $1 AND organisation_id = $2', [body.guardianId, ctx.organisationId]
        )).rows[0];
        if (!guardian) throw new AppError('VALIDATION', [{ field: 'guardianId', message: 'Unknown guardian.' }]);
        await client.query(
          `INSERT INTO learner_guardians (organisation_id, learner_id, guardian_id, relationship_type, is_primary_contact)
           VALUES ($1,$2,$3,'Guardian',true)`, [ctx.organisationId, row.id, guardian.id]
        );
      } else if (body.guardian) {
        const g = validate(body.guardian, {
          firstName: { type: 'string', min: 1, max: 100 },
          lastName: { type: 'string', min: 1, max: 100 },
          email: { type: 'string', email: true, optional: true },
          phone: { type: 'string', max: 50, optional: true },
          relationshipType: { type: 'string', max: 50, optional: true }
        });
        const guardian = (await client.query(
          `INSERT INTO guardians (organisation_id, first_name, last_name, email, phone)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [ctx.organisationId, g.firstName, g.lastName, g.email || null, g.phone || null]
        )).rows[0];
        await client.query(
          `INSERT INTO learner_guardians (organisation_id, learner_id, guardian_id, relationship_type, is_primary_contact,
            portal_access_status) VALUES ($1,$2,$3,$4,true,'pending')`,
          [ctx.organisationId, row.id, guardian.id, g.relationshipType || 'Guardian']
        );
      }
      return row;
    });
    await recordAudit(ctx.db, ctx, {
      action: 'learner.created', resourceType: 'learner', resourceId: learner.id, branchId: learner.branch_id,
      metadata: { reference: learner.learner_reference }
    });
    ctx.status = 201;
    return learner;
  }, { permission: 'learners.create.daycare' });

  router.get('/learners/:id', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id);
    const [classroom, branch, guardians, medical, enrolments] = await Promise.all([
      learner.classroom_id ? ctx.db.one('SELECT * FROM classrooms WHERE id = $1', [learner.classroom_id]) : null,
      ctx.db.one('SELECT * FROM branches WHERE id = $1', [learner.branch_id]),
      ctx.db.many(
        `SELECT lg.*, g.first_name, g.last_name, g.email, g.phone, g.status AS guardian_status
         FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
         WHERE lg.learner_id = $1 ORDER BY lg.is_primary_contact DESC`, [learner.id]
      ),
      has(ctx, 'medical.read.daycare')
        ? ctx.db.many('SELECT * FROM learner_medical_records WHERE learner_id = $1 ORDER BY created_at DESC', [learner.id])
        : [],
      ctx.db.many('SELECT * FROM enrolments WHERE learner_id = $1 ORDER BY start_date DESC', [learner.id])
    ]);
    const attendance = await ctx.db.many(
      `SELECT * FROM learner_attendance WHERE learner_id = $1 ORDER BY attendance_date DESC LIMIT 10`, [learner.id]
    );
    return {
      ...learner, classroom, branch, guardians, medical, enrolments, attendance,
      permissions: {
        canEdit: has(ctx, 'learners.update.daycare') || has(ctx, 'learners.update.assigned'),
        canViewMedical: has(ctx, 'medical.read.daycare'),
        canViewFinance: has(ctx, 'finance.read.daycare')
      }
    };
  }, { permission: ['learners.read.daycare', 'learners.read.assigned'], permissionMode: 'any' });

  router.patch('/learners/:id', async (ctx) => {
    const body = validate(ctx.body, {
      firstName: { type: 'string', min: 1, max: 100, optional: true },
      lastName: { type: 'string', min: 1, max: 100, optional: true },
      preferredName: { type: 'string', max: 100, optional: true },
      dateOfBirth: { type: 'string', date: true, optional: true },
      gender: { type: 'string', max: 20, optional: true },
      homeLanguage: { type: 'string', max: 60, optional: true },
      classroomId: { type: 'string', uuid: true, optional: true },
      status: { type: 'string', enum: ['applicant', 'enrolled', 'waitlisted', 'withdrawn', 'completed', 'archived'], optional: true },
      departureDate: { type: 'string', date: true, optional: true }
    });
    const learner = await getLearner(ctx, ctx.params.id);
    if (!has(ctx, 'learners.update.daycare') && !has(ctx, 'learners.update.assigned')) throw new AppError('FORBIDDEN');
    if (body.classroomId) {
      const classroom = await ctx.db.one('SELECT * FROM classrooms WHERE id = $1 AND organisation_id = $2',
        [body.classroomId, ctx.organisationId]);
      if (!classroom) fail('VALIDATION', [{ field: 'classroomId', message: 'Unknown classroom.' }]);
      if (classroom.id !== learner.classroom_id) {
        await ctx.db.query('UPDATE learner_classroom_history SET ended_on = CURRENT_DATE WHERE learner_id = $1 AND ended_on IS NULL', [learner.id]);
        await ctx.db.query(
          `INSERT INTO learner_classroom_history (organisation_id, learner_id, classroom_id, started_on, reason, created_by)
           VALUES ($1,$2,$3,CURRENT_DATE,'Classroom transfer',$4)`,
          [ctx.organisationId, learner.id, classroom.id, ctx.user.id]
        );
        await ctx.db.query("UPDATE enrolments SET classroom_id = $1, updated_at = now() WHERE learner_id = $2 AND status = 'active'",
          [classroom.id, learner.id]);
      }
    }
    await ctx.db.query(
      `UPDATE learners SET first_name = COALESCE($1,first_name), last_name = COALESCE($2,last_name),
        preferred_name = COALESCE($3,preferred_name), date_of_birth = COALESCE($4,date_of_birth),
        gender = COALESCE($5,gender), home_language = COALESCE($6,home_language),
        classroom_id = COALESCE($7,classroom_id), status = COALESCE($8,status),
        departure_date = COALESCE($9,departure_date), updated_at = now() WHERE id = $10`,
      [body.firstName || null, body.lastName || null, body.preferredName || null, body.dateOfBirth || null,
        body.gender || null, body.homeLanguage || null, body.classroomId || null, body.status || null,
        body.departureDate || null, learner.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'learner.updated', resourceType: 'learner', resourceId: learner.id,
      branchId: learner.branch_id, metadata: { fields: Object.keys(body) }
    });
    return ctx.db.one('SELECT * FROM learners WHERE id = $1', [learner.id]);
  }, { permission: ['learners.update.daycare', 'learners.update.assigned'], permissionMode: 'any' });

  router.post('/learners/:id/archive', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id);
    if (learner.status === 'archived') fail('CONFLICT', null, 'This learner is already archived.');
    await ctx.db.query(
      `UPDATE learners SET status = 'archived', departure_date = COALESCE(departure_date, CURRENT_DATE), updated_at = now()
       WHERE id = $1`, [learner.id]
    );
    await ctx.db.query("UPDATE enrolments SET status = 'withdrawn', end_date = CURRENT_DATE WHERE learner_id = $1 AND status = 'active'", [learner.id]);
    await recordAudit(ctx.db, ctx, {
      action: 'learner.archived', resourceType: 'learner', resourceId: learner.id, branchId: learner.branch_id
    });
    return { success: true };
  }, { permission: 'learners.archive.daycare' });

  router.get('/learners/:id/guardians', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id);
    return ctx.db.many(
      `SELECT lg.*, g.first_name, g.last_name, g.email, g.phone, g.status AS guardian_status
       FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
       WHERE lg.learner_id = $1 ORDER BY lg.is_primary_contact DESC`, [learner.id]
    );
  }, { permission: ['guardians.read.daycare', 'guardians.read.assigned'], permissionMode: 'any' });

  router.post('/learners/:id/guardians', async (ctx) => {
    const body = validate(ctx.body, {
      guardianId: { type: 'string', uuid: true, optional: true },
      firstName: { type: 'string', min: 1, max: 100, optional: true },
      lastName: { type: 'string', min: 1, max: 100, optional: true },
      email: { type: 'string', email: true, optional: true },
      phone: { type: 'string', max: 50, optional: true },
      relationshipType: { type: 'string', min: 2, max: 50 },
      isPrimaryContact: { type: 'boolean', optional: true },
      canCollect: { type: 'boolean', optional: true },
      canReceiveReports: { type: 'boolean', optional: true },
      canReceiveFinancialInformation: { type: 'boolean', optional: true },
      portalAccessStatus: { type: 'string', enum: ['pending', 'active', 'suspended', 'revoked'], optional: true }
    });
    const learner = await getLearner(ctx, ctx.params.id);
    let guardianId = body.guardianId;
    if (!guardianId) {
      if (!body.firstName || !body.lastName) {
        fail('VALIDATION', [{ field: 'firstName', message: 'Provide an existing guardian or the guardian name.' }]);
      }
      const guardian = await ctx.db.one(
        `INSERT INTO guardians (organisation_id, first_name, last_name, email, phone)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [ctx.organisationId, body.firstName, body.lastName, body.email || null, body.phone || null]
      );
      guardianId = guardian.id;
    } else {
      const guardian = await ctx.db.one('SELECT id FROM guardians WHERE id = $1 AND organisation_id = $2',
        [guardianId, ctx.organisationId]);
      if (!guardian) throw new AppError('NOT_FOUND');
    }
    const link = await ctx.db.one(
      `INSERT INTO learner_guardians (organisation_id, learner_id, guardian_id, relationship_type, is_primary_contact,
        can_collect, can_receive_reports, can_receive_financial_information, portal_access_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [ctx.organisationId, learner.id, guardianId, body.relationshipType, body.isPrimaryContact !== false,
        body.canCollect !== false, body.canReceiveReports !== false, body.canReceiveFinancialInformation !== false,
        body.portalAccessStatus || 'pending']
    );
    await recordAudit(ctx.db, ctx, {
      action: 'learner.guardian_linked', resourceType: 'learner', resourceId: learner.id,
      metadata: { guardianId }
    });
    ctx.status = 201;
    return link;
  }, { permission: 'guardians.manage.daycare' });

  router.patch('/learners/:id/guardians/:linkId', async (ctx) => {
    const body = validate(ctx.body, {
      relationshipType: { type: 'string', max: 50, optional: true },
      isPrimaryContact: { type: 'boolean', optional: true },
      canCollect: { type: 'boolean', optional: true },
      canReceiveReports: { type: 'boolean', optional: true },
      canReceiveFinancialInformation: { type: 'boolean', optional: true },
      portalAccessStatus: { type: 'string', enum: ['pending', 'active', 'suspended', 'revoked'], optional: true },
      endsAt: { type: 'string', date: true, optional: true }
    });
    const learner = await getLearner(ctx, ctx.params.id);
    const link = await ctx.db.one('SELECT * FROM learner_guardians WHERE id = $1 AND learner_id = $2 AND organisation_id = $3',
      [ctx.params.linkId, learner.id, ctx.organisationId]);
    if (!link) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      `UPDATE learner_guardians SET relationship_type = COALESCE($1,relationship_type),
        is_primary_contact = COALESCE($2,is_primary_contact), can_collect = COALESCE($3,can_collect),
        can_receive_reports = COALESCE($4,can_receive_reports),
        can_receive_financial_information = COALESCE($5,can_receive_financial_information),
        portal_access_status = COALESCE($6,portal_access_status), ends_at = COALESCE($7,ends_at)
       WHERE id = $8`,
      [body.relationshipType || null, body.isPrimaryContact === undefined ? null : body.isPrimaryContact,
        body.canCollect === undefined ? null : body.canCollect, body.canReceiveReports === undefined ? null : body.canReceiveReports,
        body.canReceiveFinancialInformation === undefined ? null : body.canReceiveFinancialInformation,
        body.portalAccessStatus || null, body.endsAt || null, link.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'learner.guardian_updated', resourceType: 'learner', resourceId: learner.id,
      metadata: { linkId: link.id, fields: Object.keys(body) }
    });
    return ctx.db.one('SELECT * FROM learner_guardians WHERE id = $1', [link.id]);
  }, { permission: 'guardians.manage.daycare' });

  router.get('/learners/:id/timeline', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id);
    const events = [];
    const attendance = await ctx.db.many(
      `SELECT attendance_date, attendance_status, check_in_at, check_out_at, absence_reason
       FROM learner_attendance WHERE learner_id = $1 ORDER BY attendance_date DESC LIMIT 30`, [learner.id]
    );
    attendance.forEach((a) => events.push({
      type: 'attendance', at: a.attendance_date, title: `Attendance: ${a.attendance_status}`,
      detail: a.absence_reason || (a.check_in_at ? `Checked in ${new Date(a.check_in_at).toISOString().slice(11, 16)}` : '')
    }));
    const observations = await ctx.db.many(
      `SELECT id, observation_date, context, observation_text, assessment_status FROM learner_observations
       WHERE learner_id = $1 ORDER BY observation_date DESC LIMIT 30`, [learner.id]
    );
    observations.forEach((o) => events.push({
      type: 'observation', at: o.observation_date, title: `Observation: ${o.context || 'General'}`,
      detail: o.observation_text, status: o.assessment_status, id: o.id
    }));
    if (has(ctx, 'finance.read.daycare')) {
      const invoices = await ctx.db.many(
        `SELECT invoice_number, issued_at, total_amount, amount_paid, status FROM invoices
         WHERE learner_id = $1 ORDER BY created_at DESC LIMIT 20`, [learner.id]
      );
      invoices.forEach((i) => events.push({
        type: 'finance', at: i.issued_at, title: `Invoice ${i.invoice_number}`,
        detail: `R${Number(i.total_amount).toFixed(2)} · ${i.status}`, status: i.status
      }));
    }
    const forms = await ctx.db.many(
      `SELECT fs.id, fs.submitted_at, fd.name, fs.status FROM form_submissions fs
       JOIN form_definitions fd ON fd.id = fs.form_definition_id
       WHERE fs.related_learner_id = $1 ORDER BY fs.submitted_at DESC LIMIT 20`, [learner.id]
    );
    forms.forEach((f) => events.push({
      type: 'form', at: f.submitted_at, title: f.name, detail: `Submission ${f.status}`, status: f.status
    }));
    const collections = await ctx.db.many(
      `SELECT recorded_at, collector_name, event_type, verification_method FROM learner_collection_events
       WHERE learner_id = $1 ORDER BY recorded_at DESC LIMIT 20`, [learner.id]
    );
    collections.forEach((c) => events.push({
      type: 'collection', at: c.recorded_at, title: `Collection by ${c.collector_name || 'unknown'}`,
      detail: `Verified via ${c.verification_method || 'standard procedure'}`
    }));
    const reports = await ctx.db.many(
      `SELECT report_date, activities_summary, notes FROM daily_reports WHERE learner_id = $1
       ORDER BY report_date DESC LIMIT 20`, [learner.id]
    );
    reports.forEach((r) => events.push({
      type: 'daily_report', at: r.report_date, title: 'Daily report', detail: r.activities_summary || r.notes || ''
    }));
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return events;
  }, { permission: ['learners.read.daycare', 'learners.read.assigned'], permissionMode: 'any' });

  router.get('/learners/:id/portfolio', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id);
    return ctx.db.many(
      `SELECT pi.*, u.display_name AS uploaded_by_name FROM learner_portfolio_items pi
       LEFT JOIN users u ON u.id = pi.uploaded_by
       WHERE pi.learner_id = $1 AND ($2 = true OR pi.sharing_status IN ('staff','guardians'))
       ORDER BY pi.created_at DESC`,
      [learner.id, has(ctx, 'portfolio.manage.assigned') || has(ctx, 'learners.read.daycare')]
    );
  }, { permission: ['portfolio.read.assigned', 'learners.read.daycare'], permissionMode: 'any' });

  router.post('/learners/:id/portfolio', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 2, max: 200 },
      description: { type: 'string', max: 2000, optional: true },
      activityId: { type: 'string', uuid: true, optional: true },
      mediaType: { type: 'string', max: 100, optional: true },
      sharingStatus: { type: 'string', enum: ['private', 'staff', 'guardians', 'public'], optional: true }
    });
    const learner = await getLearner(ctx, ctx.params.id);
    const item = await ctx.db.one(
      `INSERT INTO learner_portfolio_items (organisation_id, learner_id, activity_id, title, description, media_type,
        sharing_status, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [ctx.organisationId, learner.id, body.activityId || null, body.title, body.description || null,
        body.mediaType || null, body.sharingStatus || 'guardians', ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'learner.portfolio_item_created', resourceType: 'learner', resourceId: learner.id });
    ctx.status = 201;
    return item;
  }, { permission: ['portfolio.manage.assigned', 'learners.update.daycare'], permissionMode: 'any' });

  router.get('/learners/:id/medical', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id);
    return ctx.db.many('SELECT * FROM learner_medical_records WHERE learner_id = $1 ORDER BY created_at DESC', [learner.id]);
  }, { permission: 'medical.read.daycare' });

  router.post('/learners/:id/medical', async (ctx) => {
    const body = validate(ctx.body, {
      recordType: { type: 'string', min: 2, max: 60 },
      details: { type: 'string', min: 3, max: 4000 },
      visibilityLevel: { type: 'string', enum: ['staff', 'medical', 'restricted'], optional: true },
      effectiveFrom: { type: 'string', date: true, optional: true },
      effectiveUntil: { type: 'string', date: true, optional: true }
    });
    const learner = await getLearner(ctx, ctx.params.id);
    const record = await ctx.db.one(
      `INSERT INTO learner_medical_records (organisation_id, learner_id, record_type, details, visibility_level,
        effective_from, effective_until, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [ctx.organisationId, learner.id, body.recordType, body.details, body.visibilityLevel || 'staff',
        body.effectiveFrom || null, body.effectiveUntil || null, ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'learner.medical_record_created', resourceType: 'learner', resourceId: learner.id, metadata: { recordType: body.recordType } });
    ctx.status = 201;
    return record;
  }, { permission: 'medical.manage.daycare' });

  router.get('/learners/:id/collections', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id);
    return ctx.db.many(
      `SELECT ce.*, u.display_name AS verified_by_name FROM learner_collection_events ce
       LEFT JOIN users u ON u.id = ce.verified_by WHERE ce.learner_id = $1 ORDER BY ce.recorded_at DESC`,
      [learner.id]
    );
  }, { permission: 'collections.read.daycare' });

  router.post('/learners/:id/collections', async (ctx) => {
    const body = validate(ctx.body, {
      collectorId: { type: 'string', uuid: true, optional: true },
      collectorName: { type: 'string', min: 2, max: 200, optional: true },
      verificationMethod: { type: 'string', min: 2, max: 60 },
      notes: { type: 'string', max: 1000, optional: true }
    });
    const learner = await getLearner(ctx, ctx.params.id);
    const attendance = await ctx.db.one(
      'SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = CURRENT_DATE', [learner.id]
    );
    if (!attendance || !attendance.check_in_at || attendance.check_out_at) {
      fail('CONFLICT', null, 'The learner is not currently checked in.');
    }
    let collectorName = body.collectorName;
    if (body.collectorId) {
      const collector = await ctx.db.one(
        `SELECT * FROM authorised_collectors WHERE id = $1 AND learner_id = $2 AND organisation_id = $3 AND status = 'active'`,
        [body.collectorId, learner.id, ctx.organisationId]
      );
      if (!collector) fail('CONFLICT', null, 'This person is not an authorised collector for the learner.');
      collectorName = collector.name;
    }
    const event = await ctx.db.withTransaction(async (client) => {
      const row = (await client.query(
        `INSERT INTO learner_collection_events (organisation_id, branch_id, learner_id, collector_id, collector_name,
          event_type, verified_by, verification_method, notes)
         VALUES ($1,$2,$3,$4,$5,'collection',$6,$7,$8) RETURNING *`,
        [ctx.organisationId, learner.branch_id, learner.id, body.collectorId || null, collectorName || 'Unknown',
          ctx.user.id, body.verificationMethod, body.notes || null]
      )).rows[0];
      await client.query(
        `UPDATE learner_attendance SET attendance_status = 'collected', check_out_at = now(), updated_at = now()
         WHERE id = $1`, [attendance.id]
      );
      return row;
    });
    await recordAudit(ctx.db, ctx, {
      action: 'learner.collection_recorded', resourceType: 'learner', resourceId: learner.id,
      branchId: learner.branch_id, metadata: { collector: collectorName }
    });
    ctx.status = 201;
    return event;
  }, { permission: 'collections.record.daycare' });

  router.get('/learners/:id/documents', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id);
    return ctx.db.many('SELECT * FROM learner_documents WHERE learner_id = $1 ORDER BY created_at DESC', [learner.id]);
  }, { permission: ['learners.read.daycare', 'learners.read.assigned'], permissionMode: 'any' });

  router.post('/learners/:id/documents', async (ctx) => {
    const body = validate(ctx.body, {
      documentType: { type: 'string', min: 2, max: 80 },
      title: { type: 'string', min: 2, max: 200 },
      storageKey: { type: 'string', min: 3, max: 500 },
      mediaType: { type: 'string', max: 100, optional: true },
      visibility: { type: 'string', enum: ['staff', 'guardians', 'restricted'], optional: true },
      expiresAt: { type: 'string', date: true, optional: true }
    });
    const learner = await getLearner(ctx, ctx.params.id);
    const doc = await ctx.db.one(
      `INSERT INTO learner_documents (organisation_id, learner_id, document_type, title, storage_key, media_type,
        visibility, expires_at, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [ctx.organisationId, learner.id, body.documentType, body.title, body.storageKey, body.mediaType || null,
        body.visibility || 'guardians', body.expiresAt || null, ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'learner.document_uploaded', resourceType: 'learner', resourceId: learner.id });
    ctx.status = 201;
    return doc;
  }, { permission: 'learners.update.daycare' });

  router.get('/learners/:id/daily-reports', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id);
    return ctx.db.many(
      `SELECT dr.*, u.display_name AS recorded_by_name FROM daily_reports dr
       LEFT JOIN users u ON u.id = dr.recorded_by WHERE dr.learner_id = $1 ORDER BY dr.report_date DESC LIMIT 30`,
      [learner.id]
    );
  }, { permission: ['learners.read.daycare', 'learners.read.assigned'], permissionMode: 'any' });

  router.post('/learners/:id/daily-reports', async (ctx) => {
    const body = validate(ctx.body, {
      reportDate: { type: 'string', date: true, optional: true },
      mood: { type: 'string', max: 40, optional: true },
      meals: { type: 'string', max: 1000, optional: true },
      naps: { type: 'string', max: 1000, optional: true },
      toileting: { type: 'string', max: 1000, optional: true },
      activitiesSummary: { type: 'string', max: 2000, optional: true },
      notes: { type: 'string', max: 2000, optional: true },
      sharedWithGuardians: { type: 'boolean', optional: true }
    });
    const learner = await getLearner(ctx, ctx.params.id);
    const date = body.reportDate || new Date().toISOString().slice(0, 10);
    const existing = await ctx.db.one('SELECT id FROM daily_reports WHERE learner_id = $1 AND report_date = $2', [learner.id, date]);
    if (existing) fail('CONFLICT', null, 'A daily report already exists for this date. Edit the existing report instead.');
    const report = await ctx.db.one(
      `INSERT INTO daily_reports (organisation_id, learner_id, report_date, mood, meals, naps, toileting,
        activities_summary, notes, shared_with_guardians, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [ctx.organisationId, learner.id, date, body.mood || null, body.meals || null, body.naps || null,
        body.toileting || null, body.activitiesSummary || null, body.notes || null,
        body.sharedWithGuardians === true, ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'learner.daily_report_created', resourceType: 'learner', resourceId: learner.id });
    ctx.status = 201;
    return report;
  }, { permission: ['attendance.record.assigned', 'learners.update.daycare'], permissionMode: 'any' });

  router.get('/learners/:id/consents', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id);
    return ctx.db.many(
      `SELECT c.*, g.first_name || ' ' || g.last_name AS guardian_name FROM consent_records c
       LEFT JOIN guardians g ON g.id = c.guardian_id WHERE c.learner_id = $1 ORDER BY c.created_at DESC`, [learner.id]
    );
  }, { permission: ['consent.read.daycare', 'learners.read.daycare'], permissionMode: 'any' });

  router.get('/learners/:id/finance', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id);
    if (!has(ctx, 'finance.read.daycare')) throw new AppError('FORBIDDEN');
    const invoices = await ctx.db.many(
      `SELECT * FROM invoices WHERE learner_id = $1 ORDER BY created_at DESC`, [learner.id]
    );
    for (const invoice of invoices) {
      invoice.items = await ctx.db.many('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoice.id]);
    }
    const balance = invoices.reduce((sum, i) => sum + (Number(i.total_amount) - Number(i.amount_paid)), 0);
    return { invoices, balance };
  }, { permission: 'finance.read.daycare' });
}

module.exports = { register };
