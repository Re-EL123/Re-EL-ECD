'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');
const { has, guardianLearnerIds, guardianForLearner, today, roundMoney } = require('./helpers');
const { progressFor } = require('./assessments');

async function childOrFail(ctx, learnerId) {
  const ids = await guardianLearnerIds(ctx, learnerId);
  if (!ids.length) throw new AppError('NOT_FOUND');
  const learner = await ctx.db.one('SELECT * FROM learners WHERE id = $1 AND organisation_id = $2',
    [learnerId, ctx.organisationId]);
  if (!learner) throw new AppError('NOT_FOUND');
  const link = await guardianForLearner(ctx, learnerId);
  return { learner, link };
}

function register(router) {
  router.get('/parent/overview', async (ctx) => {
    const ids = await guardianLearnerIds(ctx);
    const children = [];
    for (const id of ids) {
      const learner = await ctx.db.one('SELECT * FROM learners WHERE id = $1 AND organisation_id = $2',
        [id, ctx.organisationId]);
      if (!learner) continue;
      const classroom = learner.classroom_id
        ? await ctx.db.one('SELECT id, name FROM classrooms WHERE id = $1', [learner.classroom_id])
        : null;
      const attendance = await ctx.db.one(
        `SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = CURRENT_DATE`, [learner.id]
      );
      const balance = await ctx.db.one(
        `SELECT COALESCE(SUM(total_amount - amount_paid),0)::float AS outstanding FROM invoices
         WHERE learner_id = $1 AND status IN ('issued','partially_paid','overdue')`, [learner.id]
      );
      const latestObservation = await ctx.db.one(
        `SELECT observation_date, context FROM learner_observations WHERE learner_id = $1
         AND assessment_status = 'published' ORDER BY observation_date DESC LIMIT 1`, [learner.id]
      );
      children.push({
        id: learner.id, firstName: learner.first_name, lastName: learner.last_name,
        preferredName: learner.preferred_name, dateOfBirth: learner.date_of_birth,
        status: learner.status, classroom, attendanceToday: attendance || null,
        outstandingBalance: roundMoney(balance.outstanding),
        latestObservation
      });
    }
    const announcements = await ctx.db.many(
      `SELECT id, title, body, published_at FROM announcements
       WHERE organisation_id = $1 AND status = 'published'
         AND audience_type IN ('all','parents','guardians')
       ORDER BY published_at DESC LIMIT 5`, [ctx.organisationId]
    );
    const unread = await ctx.db.one(
      'SELECT COUNT(*)::int AS total FROM notifications WHERE recipient_user_id = $1 AND read_at IS NULL',
      [ctx.user.id]
    );
    const forms = await ctx.db.many(
      `SELECT id, name, description FROM form_definitions
       WHERE organisation_id = $1 AND status = 'published' ORDER BY name`, [ctx.organisationId]
    );
    return { children, announcements, unread: unread.total, forms };
  }, { permission: 'parent.read.own' });

  router.get('/parent/children', async (ctx) => {
    const ids = await guardianLearnerIds(ctx);
    const children = [];
    for (const id of ids) {
      const learner = await ctx.db.one('SELECT * FROM learners WHERE id = $1 AND organisation_id = $2',
        [id, ctx.organisationId]);
      if (!learner) continue;
      const link = await guardianForLearner(ctx, id);
      children.push({
        id: learner.id, firstName: learner.first_name, lastName: learner.last_name,
        learnerReference: learner.learner_reference, dateOfBirth: learner.date_of_birth,
        classroomId: learner.classroom_id, status: learner.status,
        relationship: link ? link.relationship_type : null,
        canReceiveReports: link ? link.can_receive_reports : false
      });
    }
    return children;
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id', async (ctx) => {
    const { learner, link } = await childOrFail(ctx, ctx.params.id);
    const classroom = learner.classroom_id
      ? await ctx.db.one('SELECT * FROM classrooms WHERE id = $1', [learner.classroom_id])
      : null;
    const branch = await ctx.db.one('SELECT id, name, address, contact_email, contact_phone FROM branches WHERE id = $1',
      [learner.branch_id]);
    const attendance = await ctx.db.many(
      `SELECT attendance_date, attendance_status, check_in_at, check_out_at, absence_reason
       FROM learner_attendance WHERE learner_id = $1 ORDER BY attendance_date DESC LIMIT 14`, [learner.id]
    );
    const reports = link && link.can_receive_reports
      ? await ctx.db.many(
        `SELECT * FROM daily_reports WHERE learner_id = $1 AND shared_with_guardians = true
         ORDER BY report_date DESC LIMIT 10`, [learner.id]
      )
      : [];
    const balance = await ctx.db.one(
      `SELECT COALESCE(SUM(total_amount - amount_paid),0)::float AS outstanding FROM invoices
       WHERE learner_id = $1 AND status IN ('issued','partially_paid','overdue')`, [learner.id]
    );
    const medical = await ctx.db.many(
      `SELECT id, record_type, details, visibility_level, effective_from, effective_until
       FROM learner_medical_records WHERE learner_id = $1 AND visibility_level IN ('staff','medical')
       ORDER BY created_at DESC`, [learner.id]
    );
    return {
      learner: {
        id: learner.id, firstName: learner.first_name, lastName: learner.last_name,
        preferredName: learner.preferred_name, dateOfBirth: learner.date_of_birth,
        learnerReference: learner.learner_reference, status: learner.status,
        enrolmentDate: learner.enrolment_date
      },
      relationship: link ? {
        type: link.relationship_type, canCollect: link.can_collect,
        canReceiveReports: link.can_receive_reports,
        canReceiveFinancialInformation: link.can_receive_financial_information
      } : null,
      classroom, branch, attendance, dailyReports: reports,
      outstandingBalance: roundMoney(balance.outstanding),
      medical
    };
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/attendance', async (ctx) => {
    const { learner } = await childOrFail(ctx, ctx.params.id);
    const from = ctx.query.from || new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const to = ctx.query.to || today();
    const rows = await ctx.db.many(
      `SELECT attendance_date, attendance_status, check_in_at, check_out_at, absence_reason
       FROM learner_attendance WHERE learner_id = $1 AND attendance_date BETWEEN $2 AND $3
       ORDER BY attendance_date DESC`, [learner.id, from, to]
    );
    const present = rows.filter((r) => ['present', 'late', 'collected'].includes(r.attendance_status)).length;
    return {
      from, to, rows,
      summary: {
        marked: rows.length, present,
        absent: rows.filter((r) => r.attendance_status === 'absent').length,
        rate: rows.length ? Math.round((present / rows.length) * 100) : null
      }
    };
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/progress', async (ctx) => {
    const { learner, link } = await childOrFail(ctx, ctx.params.id);
    if (!link || !link.can_receive_reports) throw new AppError('FORBIDDEN', null, 'You are not authorised to receive progress reports.');
    return progressFor(ctx, learner);
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/daily-reports', async (ctx) => {
    const { learner, link } = await childOrFail(ctx, ctx.params.id);
    if (!link || !link.can_receive_reports) throw new AppError('FORBIDDEN');
    return ctx.db.many(
      `SELECT * FROM daily_reports WHERE learner_id = $1 AND shared_with_guardians = true
       ORDER BY report_date DESC LIMIT 60`, [learner.id]
    );
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/portfolio', async (ctx) => {
    const { learner } = await childOrFail(ctx, ctx.params.id);
    return ctx.db.many(
      `SELECT id, title, description, media_type, storage_key, created_at FROM learner_portfolio_items
       WHERE learner_id = $1 AND sharing_status IN ('guardians','public')
       ORDER BY created_at DESC`, [learner.id]
    );
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/assessments', async (ctx) => {
    const { learner, link } = await childOrFail(ctx, ctx.params.id);
    if (!link || !link.can_receive_reports) throw new AppError('FORBIDDEN');
    return ctx.db.many(
      `SELECT la.id, la.summary, la.published_at, d.name AS domain_name, ap.name AS period_name
       FROM learner_assessments la
       LEFT JOIN curriculum_domains d ON d.id = la.domain_id
       LEFT JOIN assessment_periods ap ON ap.id = la.assessment_period_id
       WHERE la.learner_id = $1 AND la.assessment_status = 'published'
       ORDER BY la.published_at DESC`, [learner.id]
    );
  }, { permission: 'parent.read.own' });

  router.get('/parent/children/:id/invoices', async (ctx) => {
    const { learner, link } = await childOrFail(ctx, ctx.params.id);
    if (!link || !link.can_receive_financial_information) throw new AppError('FORBIDDEN');
    const invoices = await ctx.db.many(
      `SELECT id, invoice_number, status, total_amount, amount_paid, due_at, issued_at, description
       FROM invoices WHERE learner_id = $1 AND status NOT IN ('draft','void')
       ORDER BY created_at DESC`, [learner.id]
    );
    return invoices.map((invoice) => ({
      ...invoice,
      outstanding: roundMoney(Number(invoice.total_amount) - Number(invoice.amount_paid))
    }));
  }, { permission: 'parent.finance.read.own' });

  router.get('/parent/invoices/:id', async (ctx) => {
    const invoice = await ctx.db.one(
      `SELECT i.* FROM invoices i JOIN learner_guardians lg ON lg.learner_id = i.learner_id
       JOIN guardians g ON g.id = lg.guardian_id
       WHERE i.id = $1 AND i.organisation_id = $2 AND g.user_id = $3
         AND lg.can_receive_financial_information = true`,
      [ctx.params.id, ctx.organisationId, ctx.user.id]
    );
    if (!invoice) throw new AppError('NOT_FOUND');
    const items = await ctx.db.many('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoice.id]);
    const payments = await ctx.db.many(
      `SELECT p.amount, p.payment_method, p.received_at, p.status, pa.allocated_amount
       FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
       WHERE pa.invoice_id = $1 ORDER BY p.received_at`, [invoice.id]
    );
    return { ...invoice, items, payments, outstanding: roundMoney(Number(invoice.total_amount) - Number(invoice.amount_paid)) };
  }, { permission: 'parent.finance.read.own' });

  router.get('/parent/finance/summary', async (ctx) => {
    const ids = await guardianLearnerIds(ctx);
    const invoices = [];
    for (const id of ids) {
      const rows = await ctx.db.many(
        `SELECT i.id, i.invoice_number, i.status, i.total_amount, i.amount_paid, i.due_at, i.issued_at,
          l.first_name, l.last_name
         FROM invoices i JOIN learners l ON l.id = i.learner_id
         WHERE i.learner_id = $1 AND i.status NOT IN ('draft','void')
         ORDER BY i.created_at DESC`, [id]
      );
      invoices.push(...rows);
    }
    const outstanding = roundMoney(invoices.reduce((sum, i) => sum + Number(i.total_amount) - Number(i.amount_paid), 0));
    return { invoices, outstanding };
  }, { permission: 'parent.finance.read.own' });

  router.post('/parent/children/:id/absence', async (ctx) => {
    const { learner } = await childOrFail(ctx, ctx.params.id);
    const body = validate(ctx.body, {
      date: { type: 'string', date: true, optional: true },
      reason: { type: 'string', min: 3, max: 1000 }
    });
    const date = body.date || today();
    if (date < today()) fail('VALIDATION', [{ field: 'date', message: 'Report an absence for today or a future date.' }]);
    const existing = await ctx.db.one(
      'SELECT * FROM learner_attendance WHERE learner_id = $1 AND attendance_date = $2', [learner.id, date]
    );
    if (existing && existing.check_in_at) fail('CONFLICT', null, 'This learner is already checked in for that date.');
    let record;
    if (existing) {
      await ctx.db.query(
        `UPDATE learner_attendance SET attendance_status = 'excused', absence_reason = $1, recorded_by = $2,
          updated_at = now() WHERE id = $3`, [body.reason, ctx.user.id, existing.id]
      );
      record = await ctx.db.one('SELECT * FROM learner_attendance WHERE id = $1', [existing.id]);
    } else {
      record = await ctx.db.one(
        `INSERT INTO learner_attendance (organisation_id, branch_id, learner_id, attendance_date, attendance_status,
          absence_reason, recorded_by) VALUES ($1,$2,$3,$4,'excused',$5,$6) RETURNING *`,
        [ctx.organisationId, learner.branch_id, learner.id, date, body.reason, ctx.user.id]
      );
    }
    const staff = await ctx.db.many(
      `SELECT DISTINCT m.user_id FROM memberships m
       JOIN membership_roles mr ON mr.membership_id = m.id
       JOIN roles r ON r.id = mr.role_id
       WHERE m.organisation_id = $1 AND m.status = 'active'
         AND r.role_key IN ('teacher','assistant_teacher','principal','daycare_administrator','daycare_manager')`,
      [ctx.organisationId]
    );
    if (staff.length) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: staff.map((s) => s.user_id), type: 'absence_reported',
        title: 'Absence reported',
        body: `${learner.first_name} ${learner.last_name} will be absent on ${date}: ${body.reason}`,
        resourceType: 'learner_attendance', resourceId: record.id
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: 'parent.absence_reported', resourceType: 'learner_attendance', resourceId: record.id,
      metadata: { date }
    });
    ctx.status = 201;
    return record;
  }, { permission: 'parent.absence.report.own' });

  router.get('/parent/forms', async (ctx) => {
    return ctx.db.many(
      `SELECT f.id, f.name, f.description, f.form_type, v.schema_json FROM form_definitions f
       JOIN form_versions v ON v.id = f.current_version_id
       WHERE f.organisation_id = $1 AND f.status = 'published' ORDER BY f.name`, [ctx.organisationId]
    );
  }, { permission: 'parent.forms.submit.own' });

  router.get('/parent/announcements', async (ctx) => {
    return ctx.db.many(
      `SELECT id, title, body, published_at FROM announcements
       WHERE organisation_id = $1 AND status = 'published' AND audience_type IN ('all','parents','guardians')
       ORDER BY published_at DESC LIMIT 50`, [ctx.organisationId]
    );
  }, { permission: 'parent.read.own' });

  router.get('/parent/consents', async (ctx) => {
    const ids = await guardianLearnerIds(ctx);
    const records = [];
    for (const id of ids) {
      const rows = await ctx.db.many(
        `SELECT c.*, l.first_name, l.last_name FROM consent_records c
         JOIN learners l ON l.id = c.learner_id WHERE c.learner_id = $1 ORDER BY c.created_at DESC`, [id]
      );
      records.push(...rows);
    }
    return records;
  }, { permission: 'parent.read.own' });
}

module.exports = { register };
