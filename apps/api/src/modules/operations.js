'use strict';

const { validate, csvCell } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');
const { parsePagination, sendText } = require('../utils/http');
const { has, today, roundMoney } = require('./helpers');

const REPORT_CATALOGUE = [
  { key: 'enrolment_summary', name: 'Enrolment summary', description: 'Learner counts by branch, classroom and status.', permission: 'reports.read.daycare' },
  { key: 'attendance_summary', name: 'Attendance summary', description: 'Attendance rates by date and classroom.', permission: 'attendance.reports.daycare' },
  { key: 'finance_summary', name: 'Finance summary', description: 'Invoiced, collected, outstanding and expenses.', permission: 'finance.reports.daycare' },
  { key: 'learner_progress', name: 'Learner progress', description: 'Observation coverage by developmental domain.', permission: 'assessments.read.daycare' },
  { key: 'staff_register', name: 'Staff register', description: 'Staff, roles, classrooms and compliance documents.', permission: 'staff.read.daycare' },
  { key: 'safety_register', name: 'Safety register', description: 'Incidents, severity and corrective actions.', permission: 'safety.read.daycare' },
  { key: 'occupancy', name: 'Occupancy and capacity', description: 'Configured capacity against enrolled learners.', permission: 'reports.read.daycare' },
  { key: 'admissions_funnel', name: 'Admissions funnel', description: 'Enquiries and applications by stage.', permission: 'admissions.read.daycare' }
];

function register(router) {
  // --- Tasks --------------------------------------------------------------

  router.get('/tasks', async (ctx) => {
    const scopeAll = has(ctx, 'tasks.read.daycare');
    const status = ctx.query.status || null;
    const mine = ctx.query.mine === 'true' || !scopeAll;
    const params = [ctx.organisationId, status];
    let extra = '';
    if (mine) {
      params.push(ctx.user.id);
      extra = ` AND t.assigned_to = $${params.length}`;
    }
    return ctx.db.many(
      `SELECT t.*, u.display_name AS assignee_name, c.display_name AS creator_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       LEFT JOIN users c ON c.id = t.created_by
       WHERE t.organisation_id = $1 AND ($2::text IS NULL OR t.status = $2)${extra}
       ORDER BY CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'open' THEN 2 ELSE 3 END,
         CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         t.due_at LIMIT 200`, params
    );
  }, { permission: ['tasks.read.own', 'tasks.read.daycare'], permissionMode: 'any' });

  router.post('/tasks', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 3, max: 200 },
      description: { type: 'string', max: 4000, optional: true },
      branchId: { type: 'string', uuid: true, optional: true },
      assignedTo: { type: 'string', uuid: true, optional: true },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], optional: true },
      dueAt: { type: 'string', date: true, optional: true },
      relatedResourceType: { type: 'string', max: 60, optional: true },
      relatedResourceId: { type: 'string', uuid: true, optional: true }
    });
    const scopeAll = has(ctx, 'tasks.manage.daycare');
    const assignedTo = body.assignedTo || ctx.user.id;
    if (!scopeAll && assignedTo !== ctx.user.id) fail('FORBIDDEN', null, 'You can only create tasks assigned to yourself.');
    if (body.assignedTo) {
      const member = await ctx.db.one(
        "SELECT id FROM memberships WHERE user_id = $1 AND organisation_id = $2 AND status = 'active'",
        [body.assignedTo, ctx.organisationId]
      );
      if (!member) fail('VALIDATION', [{ field: 'assignedTo', message: 'The assignee must be an active organisation member.' }]);
    }
    const task = await ctx.db.one(
      `INSERT INTO tasks (organisation_id, branch_id, title, description, assigned_to, priority, due_at, source,
        related_resource_type, related_resource_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'manual',$8,$9,$10) RETURNING *`,
      [ctx.organisationId, body.branchId || null, body.title, body.description || null, assignedTo,
        body.priority || 'medium', body.dueAt || null, body.relatedResourceType || null,
        body.relatedResourceId || null, ctx.user.id]
    );
    if (assignedTo !== ctx.user.id) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: [assignedTo], type: 'task_assigned', title: 'Task assigned',
        body: body.title, resourceType: 'task', resourceId: task.id
      });
    }
    await recordAudit(ctx.db, ctx, { action: 'task.created', resourceType: 'task', resourceId: task.id });
    ctx.status = 201;
    return task;
  }, { permission: ['tasks.read.own', 'tasks.manage.daycare'], permissionMode: 'any' });

  router.patch('/tasks/:id', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 3, max: 200, optional: true },
      description: { type: 'string', max: 4000, optional: true },
      status: { type: 'string', enum: ['open', 'in_progress', 'blocked', 'done', 'cancelled'], optional: true },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], optional: true },
      dueAt: { type: 'string', date: true, optional: true },
      assignedTo: { type: 'string', uuid: true, optional: true }
    });
    const task = await ctx.db.one('SELECT * FROM tasks WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!task) throw new AppError('NOT_FOUND');
    const manager = has(ctx, 'tasks.manage.daycare');
    if (!manager && task.assigned_to !== ctx.user.id) throw new AppError('FORBIDDEN');
    if (!manager && (body.assignedTo || body.title)) fail('FORBIDDEN', null, 'Only a task manager can change ownership or the title.');
    await ctx.db.query(
      `UPDATE tasks SET title = COALESCE($1,title), description = COALESCE($2,description), status = COALESCE($3,status),
        priority = COALESCE($4,priority), due_at = COALESCE($5,due_at), assigned_to = COALESCE($6,assigned_to),
        completed_at = CASE WHEN $3 = 'done' THEN now() ELSE completed_at END, updated_at = now() WHERE id = $7`,
      [body.title || null, body.description || null, body.status || null, body.priority || null,
        body.dueAt || null, body.assignedTo || null, task.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'task.updated', resourceType: 'task', resourceId: task.id, metadata: { status: body.status || null }
    });
    return ctx.db.one('SELECT * FROM tasks WHERE id = $1', [task.id]);
  }, { permission: ['tasks.read.own', 'tasks.manage.daycare'], permissionMode: 'any' });

  router.get('/tasks/:id', async (ctx) => {
    const task = await ctx.db.one('SELECT * FROM tasks WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!task) throw new AppError('NOT_FOUND');
    if (!has(ctx, 'tasks.read.daycare') && task.assigned_to !== ctx.user.id) throw new AppError('FORBIDDEN');
    const comments = await ctx.db.many(
      `SELECT tc.*, u.display_name AS author_name FROM task_comments tc
       JOIN users u ON u.id = tc.author_user_id WHERE tc.task_id = $1 ORDER BY tc.created_at`, [task.id]
    );
    const assignee = task.assigned_to ? await ctx.db.one('SELECT id, display_name, email FROM users WHERE id = $1', [task.assigned_to]) : null;
    return { ...task, comments, assignee };
  }, { permission: ['tasks.read.own', 'tasks.read.daycare'], permissionMode: 'any' });

  router.post('/tasks/:id/comments', async (ctx) => {
    const body = validate(ctx.body, { body: { type: 'string', min: 1, max: 4000 } });
    const task = await ctx.db.one('SELECT * FROM tasks WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!task) throw new AppError('NOT_FOUND');
    if (!has(ctx, 'tasks.read.daycare') && task.assigned_to !== ctx.user.id) throw new AppError('FORBIDDEN');
    const comment = await ctx.db.one(
      'INSERT INTO task_comments (task_id, author_user_id, body) VALUES ($1,$2,$3) RETURNING *',
      [task.id, ctx.user.id, body.body]
    );
    return comment;
  }, { permission: ['tasks.read.own', 'tasks.read.daycare'], permissionMode: 'any' });

  router.get('/tasks/overview/counts', async (ctx) => {
    const scopeAll = has(ctx, 'tasks.read.daycare');
    const filter = scopeAll ? '' : ' AND assigned_to = $2';
    const params = scopeAll ? [ctx.organisationId] : [ctx.organisationId, ctx.user.id];
    const counts = await ctx.db.one(
      `SELECT
        COUNT(CASE WHEN status = 'open' THEN 1 END)::int AS open,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int AS in_progress,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END)::int AS blocked,
        COUNT(CASE WHEN status = 'done' AND completed_at > now() - interval '7 days' THEN 1 END)::int AS recently_done,
        COUNT(CASE WHEN due_at < CURRENT_DATE AND status NOT IN ('done','cancelled') THEN 1 END)::int AS overdue
       FROM tasks WHERE organisation_id = $1${filter}`, params
    );
    return counts;
  }, { permission: ['tasks.read.own', 'tasks.read.daycare'], permissionMode: 'any' });

  // --- Website ------------------------------------------------------------

  router.get('/website', async (ctx) => {
    const config = await ctx.db.one(
      'SELECT * FROM website_configs WHERE organisation_id = $1 ORDER BY created_at LIMIT 1', [ctx.organisationId]
    );
    if (!config) return { config: null, domains: [] };
    const domains = await ctx.db.many('SELECT * FROM domains WHERE organisation_id = $1', [ctx.organisationId]);
    return { config, domains };
  }, { permission: 'website.read.daycare' });

  router.patch('/website', async (ctx) => {
    const body = validate(ctx.body, {
      theme: { type: 'string', max: 40, optional: true },
      draftContent: { type: 'object' }
    });
    let config = await ctx.db.one(
      'SELECT * FROM website_configs WHERE organisation_id = $1 ORDER BY created_at LIMIT 1', [ctx.organisationId]
    );
    if (!config) {
      const branch = await ctx.db.one('SELECT id FROM branches WHERE organisation_id = $1 ORDER BY created_at LIMIT 1',
        [ctx.organisationId]);
      config = await ctx.db.one(
        `INSERT INTO website_configs (organisation_id, branch_id, slug, theme, draft_content)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [ctx.organisationId, branch ? branch.id : null, ctx.organisation.slug,
          body.theme || 'nature', JSON.stringify(body.draftContent)]
      );
    } else {
      const merged = { ...(config.draft_content || {}), ...body.draftContent };
      await ctx.db.query(
        'UPDATE website_configs SET theme = COALESCE($1,theme), draft_content = $2, updated_at = now() WHERE id = $3',
        [body.theme || null, JSON.stringify(merged), config.id]
      );
      config = await ctx.db.one('SELECT * FROM website_configs WHERE id = $1', [config.id]);
    }
    await recordAudit(ctx.db, ctx, {
      action: 'website.draft_updated', resourceType: 'website_config', resourceId: config.id
    });
    return config;
  }, { permission: 'website.manage.daycare' });

  router.post('/website/publish', async (ctx) => {
    const config = await ctx.db.one(
      'SELECT * FROM website_configs WHERE organisation_id = $1 ORDER BY created_at LIMIT 1', [ctx.organisationId]
    );
    if (!config) fail('CONFLICT', null, 'Configure the website before publishing.');
    const content = config.draft_content || {};
    if (!content.hero || !content.hero.headline) {
      fail('VALIDATION', null, 'Add a hero headline before publishing.');
    }
    await ctx.db.query(
      `UPDATE website_configs SET published_content = draft_content, status = 'published', published_at = now(),
        updated_at = now() WHERE id = $1`, [config.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'website.published', resourceType: 'website_config', resourceId: config.id
    });
    return ctx.db.one('SELECT * FROM website_configs WHERE id = $1', [config.id]);
  }, { permission: 'website.manage.daycare' });

  router.post('/website/unpublish', async (ctx) => {
    const config = await ctx.db.one(
      'SELECT * FROM website_configs WHERE organisation_id = $1 ORDER BY created_at LIMIT 1', [ctx.organisationId]
    );
    if (!config) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      "UPDATE website_configs SET status = 'unpublished', updated_at = now() WHERE id = $1", [config.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'website.unpublished', resourceType: 'website_config', resourceId: config.id
    });
    return { success: true };
  }, { permission: 'website.manage.daycare' });

  router.post('/website/domains', async (ctx) => {
    const body = validate(ctx.body, {
      domainName: { type: 'string', min: 4, max: 255, regex: /^[a-z0-9.-]+$/ }
    });
    const existing = await ctx.db.one('SELECT id FROM domains WHERE domain_name = $1', [body.domainName]);
    if (existing) fail('CONFLICT', null, 'That domain is already registered.');
    const domain = await ctx.db.one(
      `INSERT INTO domains (organisation_id, domain_name) VALUES ($1,$2) RETURNING *`,
      [ctx.organisationId, body.domainName]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'website.domain_added', resourceType: 'domain', resourceId: domain.id,
      metadata: { domainName: body.domainName }
    });
    ctx.status = 201;
    return domain;
  }, { permission: 'website.manage.daycare' });

  // --- Reports ------------------------------------------------------------

  router.get('/reports', async (ctx) => {
    const available = REPORT_CATALOGUE.filter((report) => has(ctx, report.permission));
    const jobs = await ctx.db.many(
      `SELECT rj.*, u.display_name AS requested_by_name FROM report_jobs rj
       LEFT JOIN users u ON u.id = rj.requested_by
       WHERE rj.organisation_id = $1 ORDER BY rj.created_at DESC LIMIT 20`, [ctx.organisationId]
    );
    return { catalogue: available, jobs };
  }, { permission: ['reports.read.daycare', 'reports.read.assigned'], permissionMode: 'any' });

  router.get('/reports/:key', async (ctx) => {
    const report = REPORT_CATALOGUE.find((r) => r.key === ctx.params.key);
    if (!report) throw new AppError('NOT_FOUND');
    if (!has(ctx, report.permission)) throw new AppError('FORBIDDEN');
    const from = ctx.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = ctx.query.to || today();
    const rows = await buildReport(ctx, report.key, from, to);
    if (ctx.query.format === 'csv') {
      const keys = rows.length ? Object.keys(rows[0]) : ['no_data'];
      const header = keys.map(csvCell).join(',');
      const body = rows.map((row) => keys.map((k) => csvCell(row[k])).join(',')).join('\n');
      await recordAudit(ctx.db, ctx, {
        action: 'report.exported', resourceType: 'report', resourceId: null,
        metadata: { report: report.key, format: 'csv', rowCount: rows.length }
      });
      ctx.rawResponse = true;
      sendText(ctx.res, 200, [header, body].join('\n'), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="re-el-${report.key}.csv"`
      });
      return;
    }
    return { report: { key: report.key, name: report.name }, from, to, rows, generatedAt: new Date().toISOString() };
  }, { permission: ['reports.read.daycare', 'reports.read.assigned'], permissionMode: 'any' });

  router.post('/reports/jobs', async (ctx) => {
    const body = validate(ctx.body, {
      reportKey: { type: 'string', min: 2, max: 80 },
      parameters: { type: 'object', optional: true }
    });
    const report = REPORT_CATALOGUE.find((r) => r.key === body.reportKey);
    if (!report) fail('VALIDATION', [{ field: 'reportKey', message: 'Unknown report.' }]);
    if (!has(ctx, report.permission)) throw new AppError('FORBIDDEN');
    const job = await ctx.db.one(
      `INSERT INTO report_jobs (organisation_id, report_key, parameters, status, requested_by, completed_at, row_count)
       VALUES ($1,$2,$3,'completed',$4,now(),0) RETURNING *`,
      [ctx.organisationId, body.reportKey, JSON.stringify(body.parameters || {}), ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'report.job_created', resourceType: 'report_job', resourceId: job.id,
      metadata: { reportKey: body.reportKey }
    });
    ctx.status = 201;
    return job;
  }, { permission: 'reports.export.daycare' });

  // --- Automation ---------------------------------------------------------

  router.get('/automation-rules', async (ctx) => {
    return ctx.db.many('SELECT * FROM automation_rules WHERE organisation_id = $1 ORDER BY created_at DESC', [ctx.organisationId]);
  }, { permission: 'organisation.settings.manage' });

  router.post('/automation-rules', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 150 },
      triggerEvent: { type: 'string', min: 3, max: 120 },
      conditions: { type: 'object', optional: true },
      action: { type: 'object' },
      active: { type: 'boolean', optional: true }
    });
    const rule = await ctx.db.one(
      `INSERT INTO automation_rules (organisation_id, name, trigger_event, conditions, action, active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ctx.organisationId, body.name, body.triggerEvent, JSON.stringify(body.conditions || {}),
        JSON.stringify(body.action), body.active !== false, ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'automation.rule_created', resourceType: 'automation_rule', resourceId: rule.id
    });
    ctx.status = 201;
    return rule;
  }, { permission: 'organisation.settings.manage' });
}

async function buildReport(ctx, key, from, to) {
  switch (key) {
    case 'enrolment_summary': {
      return ctx.db.many(
        `SELECT b.name AS branch, COALESCE(c.name,'Unassigned') AS classroom, l.status,
          COUNT(*)::int AS learners,
          COUNT(CASE WHEN l.date_of_birth > CURRENT_DATE - interval '3 years' THEN 1 END)::int AS under_three
         FROM learners l
         JOIN branches b ON b.id = l.branch_id
         LEFT JOIN classrooms c ON c.id = l.classroom_id
         WHERE l.organisation_id = $1
         GROUP BY b.name, c.name, l.status ORDER BY b.name, c.name, l.status`,
        [ctx.organisationId]
      );
    }
    case 'attendance_summary': {
      return ctx.db.many(
        `SELECT a.attendance_date, COALESCE(c.name,'Unassigned') AS classroom,
          COUNT(*)::int AS marked,
          COUNT(CASE WHEN a.attendance_status IN ('present','late','collected') THEN 1 END)::int AS present,
          COUNT(CASE WHEN a.attendance_status = 'absent' THEN 1 END)::int AS absent,
          COUNT(CASE WHEN a.attendance_status = 'excused' THEN 1 END)::int AS excused
         FROM learner_attendance a
         JOIN learners l ON l.id = a.learner_id
         LEFT JOIN classrooms c ON c.id = l.classroom_id
         WHERE a.organisation_id = $1 AND a.attendance_date BETWEEN $2::date AND $3::date
         GROUP BY a.attendance_date, c.name ORDER BY a.attendance_date DESC, c.name`,
        [ctx.organisationId, from, to]
      );
    }
    case 'finance_summary': {
      const invoices = await ctx.db.many(
        `SELECT i.invoice_number, i.status, i.total_amount, i.amount_paid, i.due_at,
          l.first_name || ' ' || l.last_name AS learner, g.email AS guardian_email
         FROM invoices i LEFT JOIN learners l ON l.id = i.learner_id
         LEFT JOIN guardians g ON g.id = i.guardian_id
         WHERE i.organisation_id = $1 AND i.created_at::date BETWEEN $2::date AND $3::date
         ORDER BY i.created_at DESC`, [ctx.organisationId, from, to]
      );
      return invoices.map((i) => ({
        ...i,
        total_amount: roundMoney(i.total_amount),
        amount_paid: roundMoney(i.amount_paid),
        outstanding: roundMoney(Number(i.total_amount) - Number(i.amount_paid))
      }));
    }
    case 'learner_progress': {
      return ctx.db.many(
        `SELECT l.learner_reference, l.first_name, l.last_name, c.name AS classroom,
          COUNT(o.id)::int AS observations,
          COUNT(CASE WHEN o.assessment_status = 'published' THEN 1 END)::int AS published_observations,
          MAX(o.observation_date) AS last_observation
         FROM learners l
         LEFT JOIN classrooms c ON c.id = l.classroom_id
         LEFT JOIN learner_observations o ON o.learner_id = l.id AND o.observation_date BETWEEN $2::date AND $3::date
         WHERE l.organisation_id = $1 AND l.status = 'enrolled'
         GROUP BY l.learner_reference, l.first_name, l.last_name, c.name
         ORDER BY observations, l.last_name`, [ctx.organisationId, from, to]
      );
    }
    case 'staff_register': {
      return ctx.db.many(
        `SELECT s.employee_reference, u.display_name, u.email, s.job_title, s.employment_status, s.start_date,
          (SELECT COUNT(*)::int FROM staff_classrooms sc WHERE sc.staff_id = s.id) AS classrooms,
          (SELECT COUNT(*)::int FROM staff_documents sd WHERE sd.staff_id = s.id AND sd.verification_status = 'verified') AS verified_documents
         FROM staff_profiles s LEFT JOIN users u ON u.id = s.user_id
         WHERE s.organisation_id = $1 ORDER BY u.display_name`, [ctx.organisationId]
      );
    }
    case 'safety_register': {
      return ctx.db.many(
        `SELECT i.incident_type, i.severity, i.status, i.occurred_at, i.guardian_notified_at,
          b.name AS branch, COUNT(ia.id)::int AS actions
         FROM incidents i
         LEFT JOIN branches b ON b.id = i.branch_id
         LEFT JOIN incident_actions ia ON ia.incident_id = i.id
         WHERE i.organisation_id = $1 AND i.occurred_at::date BETWEEN $2::date AND $3::date
         GROUP BY i.id, i.incident_type, i.severity, i.status, i.occurred_at, i.guardian_notified_at, b.name
         ORDER BY i.occurred_at DESC`, [ctx.organisationId, from, to]
      );
    }
    case 'occupancy': {
      return ctx.db.many(
        `SELECT b.name AS branch, c.name AS classroom, c.age_group, c.configured_capacity,
          COUNT(CASE WHEN l.status = 'enrolled' THEN 1 END)::int AS enrolled,
          GREATEST(0, c.configured_capacity - COUNT(CASE WHEN l.status = 'enrolled' THEN 1 END))::int AS available
         FROM classrooms c
         JOIN branches b ON b.id = c.branch_id
         LEFT JOIN learners l ON l.classroom_id = c.id
         WHERE c.organisation_id = $1 AND c.status = 'active'
         GROUP BY b.name, c.name, c.age_group, c.configured_capacity
         ORDER BY b.name, c.name`, [ctx.organisationId]
      );
    }
    case 'admissions_funnel': {
      return ctx.db.many(
        `SELECT 'enquiry' AS stage, status, COUNT(*)::int AS total FROM admission_enquiries
         WHERE organisation_id = $1 AND created_at::date BETWEEN $2::date AND $3::date
         GROUP BY status
         UNION ALL
         SELECT 'application', status, COUNT(*)::int FROM admission_applications
         WHERE organisation_id = $1 AND submitted_at::date BETWEEN $2::date AND $3::date
         GROUP BY status
         ORDER BY stage, status`, [ctx.organisationId, from, to]
      );
    }
    default:
      return [];
  }
}

module.exports = { register, REPORT_CATALOGUE };
