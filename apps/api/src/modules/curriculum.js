'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { parsePagination } = require('../utils/http');
const bulk = require('../services/bulk-service');
const { has } = require('./helpers');

const PLAN_TRANSITIONS = {
  draft: ['submitted', 'approved', 'cancelled'],
  submitted: ['approved', 'draft', 'cancelled'],
  approved: ['published', 'cancelled'],
  published: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: ['evaluated'],
  evaluated: [],
  cancelled: []
};

function register(router) {
  router.get('/curriculum/frameworks', async (ctx) => {
    const frameworks = await ctx.db.many(
      `SELECT * FROM curriculum_frameworks WHERE organisation_id = $1 OR organisation_id IS NULL ORDER BY name`,
      [ctx.organisationId]
    );
    for (const framework of frameworks) {
      framework.domains = await ctx.db.many(
        'SELECT * FROM curriculum_domains WHERE framework_id = $1 ORDER BY sort_order, name', [framework.id]
      );
    }
    return frameworks;
  }, { permission: 'curriculum.read.daycare' });

  router.post('/curriculum/frameworks', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 200 },
      version: { type: 'string', max: 40, optional: true },
      description: { type: 'string', max: 2000, optional: true }
    });
    const framework = await ctx.db.one(
      `INSERT INTO curriculum_frameworks (organisation_id, name, version, description) VALUES ($1,$2,$3,$4) RETURNING *`,
      [ctx.organisationId, body.name, body.version || '1.0', body.description || null]
    );
    await recordAudit(ctx.db, ctx, { action: 'curriculum.framework_created', resourceType: 'curriculum_framework', resourceId: framework.id });
    ctx.status = 201;
    return framework;
  }, { permission: 'curriculum.create.daycare' });

  router.post('/curriculum/domains', async (ctx) => {
    const body = validate(ctx.body, {
      frameworkId: { type: 'string', uuid: true },
      name: { type: 'string', min: 2, max: 150 },
      description: { type: 'string', max: 1000, optional: true },
      sortOrder: { type: 'number', min: 0, optional: true }
    });
    const framework = await ctx.db.one(
      'SELECT id FROM curriculum_frameworks WHERE id = $1 AND (organisation_id = $2 OR organisation_id IS NULL)',
      [body.frameworkId, ctx.organisationId]
    );
    if (!framework) throw new AppError('NOT_FOUND');
    const domain = await ctx.db.one(
      `INSERT INTO curriculum_domains (framework_id, name, description, sort_order) VALUES ($1,$2,$3,$4) RETURNING *`,
      [body.frameworkId, body.name, body.description || null, body.sortOrder || 0]
    );
    ctx.status = 201;
    return domain;
  }, { permission: 'curriculum.create.daycare' });

  router.get('/curriculum/objectives', async (ctx) => {
    const domainId = ctx.query.domainId || null;
    const term = ctx.query.q ? `%${ctx.query.q}%` : null;
    return ctx.db.many(
      `SELECT o.*, d.name AS domain_name, d.framework_id FROM learning_objectives o
       JOIN curriculum_domains d ON d.id = o.domain_id
       JOIN curriculum_frameworks f ON f.id = d.framework_id
       WHERE (f.organisation_id = $1 OR f.organisation_id IS NULL)
         AND ($2::uuid IS NULL OR o.domain_id = $2::uuid)
         AND ($3::text IS NULL OR o.code ILIKE $3 OR o.description ILIKE $3)
       ORDER BY d.sort_order, o.code`,
      [ctx.organisationId, domainId, term]
    );
  }, { permission: 'curriculum.read.daycare' });

  router.post('/curriculum/objectives', async (ctx) => {
    const body = validate(ctx.body, {
      domainId: { type: 'string', uuid: true },
      code: { type: 'string', min: 2, max: 40 },
      description: { type: 'string', min: 5, max: 2000 },
      ageGroup: { type: 'string', max: 60, optional: true },
      expectedObservationContext: { type: 'string', max: 1000, optional: true }
    });
    const domain = await ctx.db.one(
      `SELECT d.id FROM curriculum_domains d JOIN curriculum_frameworks f ON f.id = d.framework_id
       WHERE d.id = $1 AND (f.organisation_id = $2 OR f.organisation_id IS NULL)`,
      [body.domainId, ctx.organisationId]
    );
    if (!domain) throw new AppError('NOT_FOUND');
    const objective = await ctx.db.one(
      `INSERT INTO learning_objectives (domain_id, age_group, code, description, expected_observation_context)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [body.domainId, body.ageGroup || null, body.code, body.description, body.expectedObservationContext || null]
    );
    ctx.status = 201;
    return objective;
  }, { permission: 'curriculum.create.daycare' });

  router.get('/curriculum/lesson-plans', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const status = ctx.query.status || null;
    const classroomId = ctx.query.classroomId || null;
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM lesson_plans
       WHERE organisation_id = $1 AND ($2::text IS NULL OR status = $2) AND ($3::uuid IS NULL OR classroom_id = $3::uuid)`,
      [ctx.organisationId, status, classroomId]
    );
    const rows = await ctx.db.many(
      `SELECT lp.*, c.name AS classroom_name, u.display_name AS created_by_name
       FROM lesson_plans lp LEFT JOIN classrooms c ON c.id = lp.classroom_id
       LEFT JOIN users u ON u.id = lp.created_by
       WHERE lp.organisation_id = $1 AND ($2::text IS NULL OR lp.status = $2)
         AND ($3::uuid IS NULL OR lp.classroom_id = $3::uuid)
       ORDER BY lp.created_at DESC LIMIT $4 OFFSET $5`,
      [ctx.organisationId, status, classroomId, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    return rows;
  }, { permission: 'curriculum.read.daycare' });

  router.post('/curriculum/lesson-plans', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true },
      classroomId: { type: 'string', uuid: true, optional: true },
      academicPeriodId: { type: 'string', uuid: true, optional: true },
      title: { type: 'string', min: 3, max: 200 },
      theme: { type: 'string', max: 150, optional: true },
      objectiveIds: { type: 'array', of: 'uuid', max: 30, optional: true },
      preparationNotes: { type: 'string', max: 4000, optional: true },
      publishNow: { type: 'boolean', optional: true }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) throw new AppError('NOT_FOUND');
    const publishNow = body.publishNow === true;
    if (publishNow && !has(ctx, 'curriculum.publish.daycare')) throw new AppError('FORBIDDEN');
    const plan = await ctx.db.one(
      `INSERT INTO lesson_plans (organisation_id, branch_id, classroom_id, academic_period_id, title, theme,
        objective_ids, preparation_notes, status, created_by, approved_by, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [ctx.organisationId, body.branchId, body.classroomId || null, body.academicPeriodId || null,
        body.title, body.theme || null, JSON.stringify(body.objectiveIds || []), body.preparationNotes || null,
        publishNow ? 'published' : 'draft', ctx.user.id, publishNow ? ctx.user.id : null, publishNow ? new Date().toISOString() : null]
    );
    await recordAudit(ctx.db, ctx, { action: 'curriculum.lesson_plan_created', resourceType: 'lesson_plan', resourceId: plan.id, branchId: body.branchId });
    ctx.status = 201;
    return plan;
  }, { permission: 'curriculum.create.daycare' });

  router.get('/curriculum/lesson-plans/:id', async (ctx) => {
    const plan = await ctx.db.one('SELECT * FROM lesson_plans WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!plan) throw new AppError('NOT_FOUND');
    plan.scheduled = await ctx.db.many(
      `SELECT sa.*, a.title AS activity_title FROM scheduled_activities sa
       LEFT JOIN activities a ON a.id = sa.activity_id WHERE sa.lesson_plan_id = $1 ORDER BY sa.starts_at`, [plan.id]
    );
    return plan;
  }, { permission: 'curriculum.read.daycare' });

  router.patch('/curriculum/lesson-plans/:id', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 3, max: 200, optional: true },
      theme: { type: 'string', max: 150, optional: true },
      objectiveIds: { type: 'array', of: 'uuid', max: 30, optional: true },
      preparationNotes: { type: 'string', max: 4000, optional: true },
      deliveryNotes: { type: 'string', max: 4000, optional: true }
    });
    const plan = await ctx.db.one('SELECT * FROM lesson_plans WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!plan) throw new AppError('NOT_FOUND');
    if (['published', 'completed', 'evaluated'].includes(plan.status)) {
      fail('CONFLICT', null, 'Published plans cannot be silently rewritten. Create a revision instead.');
    }
    await ctx.db.query(
      `UPDATE lesson_plans SET title = COALESCE($1,title), theme = COALESCE($2,theme),
        objective_ids = COALESCE($3,objective_ids), preparation_notes = COALESCE($4,preparation_notes),
        delivery_notes = COALESCE($5,delivery_notes), updated_at = now() WHERE id = $6`,
      [body.title || null, body.theme || null, body.objectiveIds ? JSON.stringify(body.objectiveIds) : null,
        body.preparationNotes || null, body.deliveryNotes || null, plan.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'curriculum.lesson_plan_updated', resourceType: 'lesson_plan', resourceId: plan.id });
    return ctx.db.one('SELECT * FROM lesson_plans WHERE id = $1', [plan.id]);
  }, { permission: 'curriculum.create.daycare' });

  router.post('/curriculum/lesson-plans/:id/transition', async (ctx) => {
    const body = validate(ctx.body, {
      status: { type: 'string', enum: ['submitted', 'approved', 'published', 'in_progress', 'completed', 'evaluated', 'cancelled', 'draft'] },
      notes: { type: 'string', max: 4000, optional: true }
    });
    const plan = await ctx.db.one('SELECT * FROM lesson_plans WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!plan) throw new AppError('NOT_FOUND');
    if (!(PLAN_TRANSITIONS[plan.status] || []).includes(body.status)) {
      fail('CONFLICT', null, `A plan cannot move from ${plan.status} to ${body.status}.`);
    }
    if (body.status === 'published' && !has(ctx, 'curriculum.publish.daycare')) throw new AppError('FORBIDDEN');
    await ctx.db.query(
      `UPDATE lesson_plans SET status = $1, delivery_notes = COALESCE($2,delivery_notes),
        approved_by = CASE WHEN $1 = 'approved' THEN $3 ELSE approved_by END,
        published_at = CASE WHEN $1 = 'published' THEN now() ELSE published_at END,
        delivered_at = CASE WHEN $1 = 'completed' THEN now() ELSE delivered_at END,
        updated_at = now() WHERE id = $4`,
      [body.status, body.notes || null, ctx.user.id, plan.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: `curriculum.lesson_plan_${body.status}`, resourceType: 'lesson_plan', resourceId: plan.id
    });
    return ctx.db.one('SELECT * FROM lesson_plans WHERE id = $1', [plan.id]);
  }, { permission: 'curriculum.create.daycare' });

  router.post('/curriculum/lesson-plans/bulk', async (ctx) => {
    const body = bulk.parse(ctx.body, ['submit', 'approve', 'publish', 'cancel']);
    const status = { submit: 'submitted', approve: 'approved', publish: 'published', cancel: 'cancelled' }[body.action];
    if (status === 'published' && !has(ctx, 'curriculum.publish.daycare')) throw new AppError('FORBIDDEN');
    return bulk.run(ctx, {
      ids: body.ids,
      action: body.action,
      resourceType: 'lesson_plan',
      auditAction: `curriculum.lesson_plan_${status}`,
      handler: async (id) => {
        const plan = await ctx.db.one(
          'SELECT * FROM lesson_plans WHERE id = $1 AND organisation_id = $2', [id, ctx.organisationId]
        );
        if (!plan) return { ok: false, reason: 'not found' };
        if (!(PLAN_TRANSITIONS[plan.status] || []).includes(status)) {
          return { ok: false, reason: `cannot move from ${plan.status} to ${status}` };
        }
        await ctx.db.query(
          `UPDATE lesson_plans SET status = $1,
            approved_by = CASE WHEN $2 = 'approved' THEN $3 ELSE approved_by END,
            published_at = CASE WHEN $2 = 'published' THEN now() ELSE published_at END,
            updated_at = now() WHERE id = $4`,
          [status, status, ctx.user.id, plan.id]
        );
        return { ok: true, metadata: { status } };
      }
    });
  }, { permission: 'curriculum.create.daycare' });

  router.get('/curriculum/activities', async (ctx) => {
    const term = ctx.query.q ? `%${ctx.query.q}%` : null;
    return ctx.db.many(
      `SELECT a.*, u.display_name AS created_by_name FROM activities a LEFT JOIN users u ON u.id = a.created_by
       WHERE a.organisation_id = $1 AND a.status = 'active'
         AND ($2::text IS NULL OR a.title ILIKE $2 OR a.description ILIKE $2)
       ORDER BY a.title`,
      [ctx.organisationId, term]
    );
  }, { permission: 'curriculum.read.daycare' });

  router.post('/curriculum/activities', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true },
      title: { type: 'string', min: 3, max: 200 },
      description: { type: 'string', max: 4000, optional: true },
      ageGroup: { type: 'string', max: 60, optional: true },
      durationMinutes: { type: 'number', min: 1, max: 480, optional: true },
      materials: { type: 'string', max: 2000, optional: true },
      safetyNotes: { type: 'string', max: 2000, optional: true },
      activityType: { type: 'string', max: 60, optional: true }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) throw new AppError('NOT_FOUND');
    const activity = await ctx.db.one(
      `INSERT INTO activities (organisation_id, branch_id, title, description, age_group, duration_minutes,
        materials, safety_notes, activity_type, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [ctx.organisationId, body.branchId, body.title, body.description || null, body.ageGroup || null,
        body.durationMinutes || 30, body.materials || null, body.safetyNotes || null,
        body.activityType || 'creative', ctx.user.id]
    );
    ctx.status = 201;
    return activity;
  }, { permission: 'curriculum.create.daycare' });

  router.get('/curriculum/calendar', async (ctx) => {
    const from = ctx.query.from || new Date().toISOString().slice(0, 10);
    const to = ctx.query.to || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    return ctx.db.many(
      `SELECT sa.*, c.name AS classroom_name, u.display_name AS staff_name, lp.title AS lesson_plan_title
       FROM scheduled_activities sa
       LEFT JOIN classrooms c ON c.id = sa.classroom_id
       LEFT JOIN users u ON u.id = sa.assigned_staff_id
       LEFT JOIN lesson_plans lp ON lp.id = sa.lesson_plan_id
       WHERE sa.organisation_id = $1 AND sa.starts_at >= $2::timestamptz AND sa.starts_at < ($3::date + 1)
       ORDER BY sa.starts_at`,
      [ctx.organisationId, `${from}T00:00:00Z`, to]
    );
  }, { permission: 'curriculum.read.daycare' });

  router.post('/curriculum/calendar/events', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true },
      classroomId: { type: 'string', uuid: true, optional: true },
      lessonPlanId: { type: 'string', uuid: true, optional: true },
      activityId: { type: 'string', uuid: true, optional: true },
      title: { type: 'string', min: 2, max: 200 },
      startsAt: { type: 'string', datetime: true },
      endsAt: { type: 'string', datetime: true, optional: true },
      assignedStaffId: { type: 'string', uuid: true, optional: true },
      notes: { type: 'string', max: 2000, optional: true }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) throw new AppError('NOT_FOUND');
    const event = await ctx.db.one(
      `INSERT INTO scheduled_activities (organisation_id, branch_id, classroom_id, lesson_plan_id, activity_id, title,
        starts_at, ends_at, assigned_staff_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [ctx.organisationId, body.branchId, body.classroomId || null, body.lessonPlanId || null,
        body.activityId || null, body.title, body.startsAt, body.endsAt || null, body.assignedStaffId || null,
        body.notes || null]
    );
    await recordAudit(ctx.db, ctx, { action: 'curriculum.activity_scheduled', resourceType: 'scheduled_activity', resourceId: event.id, branchId: body.branchId });
    ctx.status = 201;
    return event;
  }, { permission: 'curriculum.create.daycare' });

  router.post('/curriculum/calendar/events/:id/complete', async (ctx) => {
    const body = validate(ctx.body, {
      notes: { type: 'string', max: 4000, optional: true },
      participation: { type: 'array', max: 100, optional: true }
    });
    const event = await ctx.db.one(
      'SELECT * FROM scheduled_activities WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]
    );
    if (!event) throw new AppError('NOT_FOUND');
    if (event.status === 'completed') fail('CONFLICT', null, 'This activity has already been completed.');
    await ctx.db.withTransaction(async (client) => {
      await client.query(
        "UPDATE scheduled_activities SET status = 'completed', notes = COALESCE($1,notes) WHERE id = $2",
        [body.notes || null, event.id]
      );
      for (const entry of body.participation || []) {
        const learner = await client.query('SELECT id FROM learners WHERE id = $1 AND organisation_id = $2',
          [entry.learnerId, ctx.organisationId]);
        if (!learner.rows.length) continue;
        await client.query(
          `INSERT INTO activity_participation (organisation_id, scheduled_activity_id, learner_id, participation_status,
            observation_summary, recorded_by) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (scheduled_activity_id, learner_id) DO UPDATE SET participation_status = $4,
             observation_summary = $5, recorded_by = $6, recorded_at = now()`,
          [ctx.organisationId, event.id, entry.learnerId, entry.status || 'participated', entry.summary || null, ctx.user.id]
        );
      }
    });
    await recordAudit(ctx.db, ctx, { action: 'curriculum.activity_completed', resourceType: 'scheduled_activity', resourceId: event.id });
    return ctx.db.one('SELECT * FROM scheduled_activities WHERE id = $1', [event.id]);
  }, { permission: 'curriculum.create.daycare' });

  router.get('/curriculum/calendar/events/:id/participation', async (ctx) => {
    const event = await ctx.db.one('SELECT id FROM scheduled_activities WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!event) throw new AppError('NOT_FOUND');
    return ctx.db.many(
      `SELECT ap.*, l.first_name, l.last_name FROM activity_participation ap
       JOIN learners l ON l.id = ap.learner_id WHERE ap.scheduled_activity_id = $1 ORDER BY l.last_name`, [event.id]
    );
  }, { permission: 'curriculum.read.daycare' });

  router.get('/curriculum/periods', async (ctx) => {
    return ctx.db.many('SELECT * FROM academic_periods WHERE organisation_id = $1 ORDER BY starts_on DESC', [ctx.organisationId]);
  }, { permission: 'curriculum.read.daycare' });

  router.post('/curriculum/periods', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true, optional: true },
      name: { type: 'string', min: 2, max: 120 },
      periodType: { type: 'string', max: 40, optional: true },
      startsOn: { type: 'string', date: true },
      endsOn: { type: 'string', date: true }
    });
    if (body.endsOn < body.startsOn) fail('VALIDATION', [{ field: 'endsOn', message: 'The end date must follow the start date.' }]);
    const period = await ctx.db.one(
      `INSERT INTO academic_periods (organisation_id, branch_id, name, period_type, starts_on, ends_on)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [ctx.organisationId, body.branchId || null, body.name, body.periodType || 'term', body.startsOn, body.endsOn]
    );
    ctx.status = 201;
    return period;
  }, { permission: 'curriculum.create.daycare' });

  router.get('/curriculum/overview', async (ctx) => {
    const counts = await ctx.db.one(
      `SELECT
        (SELECT COUNT(*)::int FROM lesson_plans WHERE organisation_id = $1) AS plans,
        (SELECT COUNT(*)::int FROM lesson_plans WHERE organisation_id = $1 AND status = 'published') AS published_plans,
        (SELECT COUNT(*)::int FROM activities WHERE organisation_id = $1 AND status = 'active') AS activities,
        (SELECT COUNT(*)::int FROM scheduled_activities WHERE organisation_id = $1 AND status = 'completed') AS completed_activities,
        (SELECT COUNT(*)::int FROM scheduled_activities WHERE organisation_id = $1 AND status = 'scheduled') AS upcoming_activities,
        (SELECT COUNT(*)::int FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id
          JOIN curriculum_frameworks f ON f.id = d.framework_id
          WHERE f.organisation_id = $1) AS objectives`,
      [ctx.organisationId]
    );
    return counts;
  }, { permission: 'curriculum.read.daycare' });
}

module.exports = { register };
