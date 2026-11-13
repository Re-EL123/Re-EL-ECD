'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { parsePagination } = require('../utils/http');
const bulk = require('../services/bulk-service');
const { has, officialEnabled, isOfficial } = require('./helpers');
const { BUILTIN_TEMPLATES } = require('./templates');

async function findOfficialPlan(ctx, id) {
  if (!(await officialEnabled(ctx))) return null;
  return ctx.db.one('SELECT * FROM lesson_plans WHERE id = $1 AND organisation_id IS NULL', [id]);
}

async function copySteps(db, fromPlanId, toPlanId, organisationId) {
  const steps = await db.many('SELECT * FROM lesson_steps WHERE lesson_plan_id = $1 ORDER BY position', [fromPlanId]);
  for (const step of steps) {
    await db.query(
      `INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, media_url, duration_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [organisationId, toPlanId, step.position, step.step_type, step.title, step.body, step.media_url || null, step.duration_minutes || null]
    );
  }
  return steps.length;
}

async function resolveFrameworkTemplate(ctx, templateId) {
  const builtin = BUILTIN_TEMPLATES.find((template) => template.id === templateId && template.kind === 'framework');
  if (builtin) return builtin;
  const row = await ctx.db.one(
    "SELECT * FROM content_templates WHERE id = $1 AND organisation_id = $2 AND kind = 'framework'",
    [templateId, ctx.organisationId]
  );
  return row ? { id: row.id, kind: 'framework', builtin: false, name: row.name, payload: row.payload || {} } : null;
}

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
    const includeOfficial = await officialEnabled(ctx);
    const frameworks = await ctx.db.many(
      `SELECT * FROM curriculum_frameworks WHERE organisation_id = $1 OR ($2::boolean AND organisation_id IS NULL) ORDER BY name`,
      [ctx.organisationId, includeOfficial]
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

  router.post('/curriculum/frameworks/from-template', async (ctx) => {
    const body = validate(ctx.body, {
      templateId: { type: 'string', min: 1, max: 120 },
      name: { type: 'string', min: 2, max: 200, optional: true }
    });
    const template = await resolveFrameworkTemplate(ctx, body.templateId);
    if (!template) fail('NOT_FOUND', null, 'That framework template could not be found.');
    const payload = template.payload || {};
    const domains = Array.isArray(payload.domains) ? payload.domains : [];
    if (!domains.length) fail('VALIDATION', [{ field: 'templateId', message: 'The template has no domains to create.' }]);
    const result = await ctx.db.withTransaction(async (client) => {
      const frameworkRow = await client.query(
        `INSERT INTO curriculum_frameworks (organisation_id, name, version, description) VALUES ($1,$2,$3,$4) RETURNING *`,
        [ctx.organisationId, body.name || payload.name || template.name, payload.version || '1.0', payload.description || null]
      );
      const framework = frameworkRow.rows[0];
      let objectiveCount = 0;
      for (let index = 0; index < domains.length; index += 1) {
        const domain = domains[index] || {};
        const domainRow = await client.query(
          `INSERT INTO curriculum_domains (framework_id, name, description, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`,
          [framework.id, String(domain.name || ('Domain ' + (index + 1))).slice(0, 150), domain.description || null, index]
        );
        const domainId = domainRow.rows[0].id;
        const objectives = Array.isArray(domain.objectives) ? domain.objectives : [];
        for (const objective of objectives) {
          if (!objective || !objective.description) continue;
          objectiveCount += 1;
          await client.query(
            `INSERT INTO learning_objectives (domain_id, age_group, code, description, expected_observation_context)
             VALUES ($1,$2,$3,$4,$5)`,
            [domainId, objective.ageGroup || '0-5 years', String(objective.code || ('OBJ-' + objectiveCount)).slice(0, 40),
              String(objective.description).slice(0, 1000),
              objective.expected_observation_context || objective.expectedObservationContext || null]
          );
        }
      }
      return { framework, domainCount: domains.length, objectiveCount };
    });
    await recordAudit(ctx.db, ctx, {
      action: 'curriculum.framework_from_template', resourceType: 'curriculum_framework', resourceId: result.framework.id,
      metadata: { template: template.name, builtin: Boolean(template.builtin) }
    });
    ctx.status = 201;
    return result;
  }, { permission: 'curriculum.create.daycare' });

  router.get('/curriculum/domains', async (ctx) => {
    const includeOfficial = await officialEnabled(ctx);
    return ctx.db.many(
      `SELECT DISTINCT d.id, d.name, d.description, d.sort_order
       FROM curriculum_domains d
       JOIN curriculum_frameworks f ON f.id = d.framework_id
       WHERE f.organisation_id = $1 OR ($2::boolean AND f.organisation_id IS NULL)
       ORDER BY d.sort_order, d.name`,
      [ctx.organisationId, includeOfficial]
    );
  }, { permission: ['curriculum.read.assigned', 'curriculum.read.daycare', 'assessments.read.assigned', 'assessments.create.assigned'], permissionMode: 'any' });

  router.post('/curriculum/domains', async (ctx) => {
    const body = validate(ctx.body, {
      frameworkId: { type: 'string', uuid: true },
      name: { type: 'string', min: 2, max: 150 },
      description: { type: 'string', max: 1000, optional: true },
      sortOrder: { type: 'number', min: 0, optional: true }
    });
    const framework = await ctx.db.one(
      'SELECT id, organisation_id FROM curriculum_frameworks WHERE id = $1 AND (organisation_id = $2 OR organisation_id IS NULL)',
      [body.frameworkId, ctx.organisationId]
    );
    if (!framework) throw new AppError('NOT_FOUND');
    if (framework.organisation_id === null) fail('FORBIDDEN', null, 'Official frameworks are read-only.');
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
    const includeOfficial = await officialEnabled(ctx);
    return ctx.db.many(
      `SELECT o.*, d.name AS domain_name, d.framework_id FROM learning_objectives o
       JOIN curriculum_domains d ON d.id = o.domain_id
       JOIN curriculum_frameworks f ON f.id = d.framework_id
       WHERE (f.organisation_id = $1 OR ($4::boolean AND f.organisation_id IS NULL))
         AND ($2::uuid IS NULL OR o.domain_id = $2::uuid)
         AND ($3::text IS NULL OR o.code ILIKE $3 OR o.description ILIKE $3)
       ORDER BY d.sort_order, o.code`,
      [ctx.organisationId, domainId, term, includeOfficial]
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
    const owner = await ctx.db.one(
      `SELECT f.organisation_id FROM curriculum_domains d JOIN curriculum_frameworks f ON f.id = d.framework_id WHERE d.id = $1`,
      [body.domainId]
    );
    if (owner && owner.organisation_id === null) fail('FORBIDDEN', null, 'Official frameworks are read-only.');
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
    const includeOfficial = await officialEnabled(ctx);
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM lesson_plans
       WHERE (organisation_id = $1 OR ($4::boolean AND organisation_id IS NULL))
         AND ($2::text IS NULL OR status = $2) AND ($3::uuid IS NULL OR classroom_id = $3::uuid)`,
      [ctx.organisationId, status, classroomId, includeOfficial]
    );
    const rows = await ctx.db.many(
      `SELECT lp.*, c.name AS classroom_name, u.display_name AS created_by_name, lm.title AS module_title
       FROM lesson_plans lp LEFT JOIN classrooms c ON c.id = lp.classroom_id
       LEFT JOIN users u ON u.id = lp.created_by
       LEFT JOIN learning_modules lm ON lm.id = lp.module_id
       WHERE (lp.organisation_id = $1 OR ($6::boolean AND lp.organisation_id IS NULL))
         AND ($2::text IS NULL OR lp.status = $2)
         AND ($3::uuid IS NULL OR lp.classroom_id = $3::uuid)
       ORDER BY (lp.organisation_id IS NULL), lp.created_at DESC LIMIT $4 OFFSET $5`,
      [ctx.organisationId, status, classroomId, pageSize, offset, includeOfficial]
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
      publishNow: { type: 'boolean', optional: true },
      moduleId: { type: 'string', uuid: true, optional: true }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) throw new AppError('NOT_FOUND');
    const publishNow = body.publishNow === true;
    if (publishNow && !has(ctx, 'curriculum.publish.daycare')) throw new AppError('FORBIDDEN');
    let module = null;
    let modulePosition = null;
    if (body.moduleId) {
      module = await ctx.db.one('SELECT id, organisation_id FROM learning_modules WHERE id = $1 AND (organisation_id = $2 OR organisation_id IS NULL)',
        [body.moduleId, ctx.organisationId]);
      if (!module) fail('NOT_FOUND', null, 'The module this plan should belong to was not found.');
      if (module.organisation_id === null) fail('FORBIDDEN', null, 'Official modules are read-only. Adopt the module first, then add your own plans.');
      const maxPos = await ctx.db.one('SELECT COALESCE(MAX(module_position), 0)::int AS max FROM lesson_plans WHERE module_id = $1', [module.id]);
      modulePosition = maxPos.max + 1;
    }
    const plan = await ctx.db.one(
      `INSERT INTO lesson_plans (organisation_id, branch_id, classroom_id, academic_period_id, title, theme,
        objective_ids, preparation_notes, status, created_by, approved_by, published_at, module_id, module_position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [ctx.organisationId, body.branchId, body.classroomId || null, body.academicPeriodId || null,
        body.title, body.theme || null, JSON.stringify(body.objectiveIds || []), body.preparationNotes || null,
        publishNow ? 'published' : 'draft', ctx.user.id, publishNow ? ctx.user.id : null, publishNow ? new Date().toISOString() : null,
        module ? module.id : null, modulePosition]
    );
    await recordAudit(ctx.db, ctx, { action: 'curriculum.lesson_plan_created', resourceType: 'lesson_plan', resourceId: plan.id, branchId: body.branchId });
    ctx.status = 201;
    return plan;
  }, { permission: 'curriculum.create.daycare' });

  router.get('/curriculum/lesson-plans/:id', async (ctx) => {
    let plan = await ctx.db.one('SELECT * FROM lesson_plans WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!plan) plan = await findOfficialPlan(ctx, ctx.params.id);
    if (!plan) throw new AppError('NOT_FOUND');
    plan.scheduled = await ctx.db.many(
      `SELECT sa.*, a.title AS activity_title FROM scheduled_activities sa
       LEFT JOIN activities a ON a.id = sa.activity_id WHERE sa.lesson_plan_id = $1 ORDER BY sa.starts_at`, [plan.id]
    );
    return plan;
  }, { permission: 'curriculum.read.daycare' });

  // Step-by-step multimedia lesson guide for a plan (official or the
  // tenant's own). Steps are the actual teaching script: songs written out,
  // stories to read aloud, activities to run and what to notice afterwards.
  router.get('/curriculum/lesson-plans/:id/guide', async (ctx) => {
    let plan = await ctx.db.one('SELECT * FROM lesson_plans WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!plan) plan = await findOfficialPlan(ctx, ctx.params.id);
    if (!plan) throw new AppError('NOT_FOUND');
    const steps = await ctx.db.many(
      `SELECT id, position, step_type, title, body, media_url, duration_minutes FROM lesson_steps
       WHERE lesson_plan_id = $1 ORDER BY position`,
      [plan.id]
    );
    const module = plan.module_id
      ? await ctx.db.one('SELECT id, title, theme FROM learning_modules WHERE id = $1', [plan.module_id])
      : null;
    ctx.meta = { steps: steps.length };
    return {
      plan: {
        id: plan.id, title: plan.title, theme: plan.theme,
        objectiveIds: plan.objective_ids || [],
        preparationNotes: plan.preparation_notes,
        isOfficial: Boolean(plan.organisation_id === null)
      },
      module,
      steps
    };
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
    if (!plan) {
      if (await findOfficialPlan(ctx, ctx.params.id)) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
      throw new AppError('NOT_FOUND');
    }
    if (isOfficial(plan)) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
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
    if (!plan) {
      if (await findOfficialPlan(ctx, ctx.params.id)) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
      throw new AppError('NOT_FOUND');
    }
    if (isOfficial(plan)) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
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
    const includeOfficial = await officialEnabled(ctx);
    return ctx.db.many(
      `SELECT a.*, u.display_name AS created_by_name FROM activities a LEFT JOIN users u ON u.id = a.created_by
       WHERE (a.organisation_id = $1 OR ($3::boolean AND a.organisation_id IS NULL)) AND a.status = 'active'
         AND ($2::text IS NULL OR a.title ILIKE $2 OR a.description ILIKE $2)
       ORDER BY (a.organisation_id IS NULL), a.title`,
      [ctx.organisationId, term, includeOfficial]
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

  router.patch('/curriculum/activities/:id', async (ctx) => {
    const body = validate(ctx.body, {
      branchId: { type: 'string', uuid: true, optional: true },
      title: { type: 'string', min: 3, max: 200, optional: true },
      description: { type: 'string', max: 4000, optional: true },
      ageGroup: { type: 'string', max: 60, optional: true },
      durationMinutes: { type: 'number', min: 1, max: 480, optional: true },
      materials: { type: 'string', max: 2000, optional: true },
      safetyNotes: { type: 'string', max: 2000, optional: true },
      activityType: { type: 'string', max: 60, optional: true }
    });
    const activity = await ctx.db.one('SELECT * FROM activities WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!activity) {
      if (await officialEnabled(ctx)) {
        const official = await ctx.db.one('SELECT id FROM activities WHERE id = $1 AND organisation_id IS NULL', [ctx.params.id]);
        if (official) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
      }
      throw new AppError('NOT_FOUND');
    }
    if (isOfficial(activity)) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
    if (body.branchId) {
      const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
        [body.branchId, ctx.organisationId]);
      if (!branch) throw new AppError('NOT_FOUND');
    }
    await ctx.db.query(
      `UPDATE activities SET branch_id = COALESCE($1,branch_id), title = COALESCE($2,title),
        description = COALESCE($3,description), age_group = COALESCE($4,age_group),
        duration_minutes = COALESCE($5,duration_minutes), materials = COALESCE($6,materials),
        safety_notes = COALESCE($7,safety_notes), activity_type = COALESCE($8,activity_type),
        updated_at = now() WHERE id = $9`,
      [body.branchId || null, body.title || null, body.description || null, body.ageGroup || null,
        body.durationMinutes || null, body.materials || null, body.safetyNotes || null,
        body.activityType || null, activity.id]
    );
    return ctx.db.one('SELECT * FROM activities WHERE id = $1', [activity.id]);
  }, { permission: 'curriculum.create.daycare' });

  router.post('/curriculum/activities/:id/archive', async (ctx) => {
    const activity = await ctx.db.one('SELECT * FROM activities WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!activity) {
      if (await officialEnabled(ctx)) {
        const official = await ctx.db.one('SELECT id FROM activities WHERE id = $1 AND organisation_id IS NULL', [ctx.params.id]);
        if (official) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
      }
      throw new AppError('NOT_FOUND');
    }
    if (isOfficial(activity)) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
    await ctx.db.query(
      `UPDATE activities SET status = 'archived', updated_at = now() WHERE id = $1`, [activity.id]);
    await recordAudit(ctx.db, ctx, {
      action: 'curriculum.activity_archived', resourceType: 'activity', resourceId: activity.id
    });
    return ctx.db.one('SELECT * FROM activities WHERE id = $1', [activity.id]);
  }, { permission: 'curriculum.create.daycare' });

  // --- Adopt official content ---------------------------------------------------
  // Official (NCF) content stays read-only. Adopting clones it into the tenant
  // with source attribution (source='ncf') so centres can adapt it freely —
  // the copy keeps the NCF badge, which is honest attribution, and becomes a
  // normal editable record.

  router.post('/curriculum/adopt', async (ctx) => {
    const body = validate(ctx.body, {
      kind: { type: 'string', enum: ['lesson_plan', 'activity', 'module', 'framework'] },
      id: { type: 'string', uuid: true }
    });
    if (!(await officialEnabled(ctx))) {
      fail('FORBIDDEN', null, 'Switch on the Official NCF curriculum in Settings before adopting official content.');
    }
    const branch = await ctx.db.one('SELECT id FROM branches WHERE organisation_id = $1 ORDER BY created_at LIMIT 1', [ctx.organisationId]);
    if (!branch) fail('NOT_FOUND', null, 'Create a branch before adopting content.');

    if (body.kind === 'lesson_plan') {
      const official = await ctx.db.one('SELECT * FROM lesson_plans WHERE id = $1 AND organisation_id IS NULL', [body.id]);
      if (!official) throw new AppError('NOT_FOUND');
      const plan = await ctx.db.one(
        `INSERT INTO lesson_plans (organisation_id, branch_id, classroom_id, academic_period_id, title, theme,
          objective_ids, preparation_notes, status, module_id, source, source_version)
         VALUES ($1,$2,NULL,NULL,$3,$4,$5,$6,'draft',NULL,$7,$8) RETURNING *`,
        [ctx.organisationId, branch.id, official.title, official.theme || null,
          JSON.stringify(official.objective_ids || []), official.preparation_notes || null, official.source || 'ncf', official.source_version || '1.0']
      );
      const copied = await copySteps(ctx.db, official.id, plan.id, ctx.organisationId);
      await recordAudit(ctx.db, ctx, { action: 'curriculum.adopted_plan', resourceType: 'lesson_plan', resourceId: plan.id, metadata: { sourceKey: official.source_key || null, steps: copied } });
      ctx.status = 201;
      return plan;
    }

    if (body.kind === 'activity') {
      const official = await ctx.db.one('SELECT * FROM activities WHERE id = $1 AND organisation_id IS NULL', [body.id]);
      if (!official) throw new AppError('NOT_FOUND');
      const activity = await ctx.db.one(
        `INSERT INTO activities (organisation_id, branch_id, title, description, age_group, duration_minutes,
          materials, safety_notes, activity_type, status, source, source_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11) RETURNING *`,
        [ctx.organisationId, branch.id, official.title, official.description || null, official.age_group || null,
          official.duration_minutes || 30, official.materials || null, official.safety_notes || null,
          official.activity_type || 'creative', official.source || 'ncf', official.source_version || '1.0']
      );
      await recordAudit(ctx.db, ctx, { action: 'curriculum.adopted_activity', resourceType: 'activity', resourceId: activity.id, metadata: { sourceKey: official.source_key || null } });
      ctx.status = 201;
      return activity;
    }

    if (body.kind === 'framework') {
      const official = await ctx.db.one('SELECT * FROM curriculum_frameworks WHERE id = $1 AND organisation_id IS NULL', [body.id]);
      if (!official) throw new AppError('NOT_FOUND');
      const created = await ctx.db.withTransaction(async (client) => {
        const fwRow = await client.query(
          `INSERT INTO curriculum_frameworks (organisation_id, name, version, description, status, source, source_version)
           VALUES ($1,$2,$3,$4,'active',$5,$6) RETURNING *`,
          [ctx.organisationId, official.name, official.version || '1.0', official.description || null, official.source || 'ncf', official.source_version || '1.0']
        );
        const framework = fwRow.rows[0];
        const domains = await client.query('SELECT * FROM curriculum_domains WHERE framework_id = $1 ORDER BY sort_order, name', [official.id]);
        let objectiveCount = 0;
        for (const domain of domains.rows) {
          const domainRow = await client.query(
            `INSERT INTO curriculum_domains (framework_id, name, description, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`,
            [framework.id, domain.name, domain.description || null, domain.sort_order || 0]
          );
          const objectives = await client.query("SELECT * FROM learning_objectives WHERE domain_id = $1 AND status = 'active'", [domain.id]);
          for (const objective of objectives.rows) {
            objectiveCount += 1;
            await client.query(
              `INSERT INTO learning_objectives (domain_id, age_group, code, description, expected_observation_context, status)
               VALUES ($1,$2,$3,$4,$5,'active')`,
              [domainRow.rows[0].id, objective.age_group || null, objective.code, objective.description, objective.expected_observation_context || null]
            );
          }
        }
        return { framework, domainCount: domains.rows.length, objectiveCount };
      });
      await recordAudit(ctx.db, ctx, {
        action: 'curriculum.adopted_framework', resourceType: 'curriculum_framework', resourceId: created.framework.id,
        metadata: { sourceKey: official.source_key || null, objectives: created.objectiveCount }
      });
      ctx.status = 201;
      return created;
    }

    // kind === 'module': clone the module and its plans, keeping the NCF badge.
    const official = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id IS NULL', [body.id]);
    if (!official) throw new AppError('NOT_FOUND');
    const created = await ctx.db.withTransaction(async (client) => {
      const moduleRow = await client.query(
        `INSERT INTO learning_modules (organisation_id, title, description, theme, age_group, duration_weeks, status, source, source_version)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8) RETURNING *`,
        [ctx.organisationId, official.title, official.description || null, official.theme || null,
          official.age_group || null, official.duration_weeks || null, official.source || 'ncf', official.source_version || '1.0']
      );
      const module = moduleRow.rows[0];
      const plans = await client.query(
        'SELECT * FROM lesson_plans WHERE module_id = $1 ORDER BY COALESCE(module_position, 9999), created_at',
        [official.id]
      );
      let position = 0;
      let stepCount = 0;
      for (const plan of plans.rows) {
        position += 1;
        const inserted = await client.query(
          `INSERT INTO lesson_plans (organisation_id, branch_id, classroom_id, academic_period_id, title, theme,
            objective_ids, preparation_notes, status, module_id, module_position, source, source_version)
           VALUES ($1,$2,NULL,NULL,$3,$4,$5,$6,'draft',$7,$8,$9,$10) RETURNING id`,
          [ctx.organisationId, branch.id, plan.title, plan.theme || null,
            JSON.stringify(plan.objective_ids || []), plan.preparation_notes || null,
            module.id, position, plan.source || 'ncf', plan.source_version || '1.0']
        );
        const steps = await client.query('SELECT * FROM lesson_steps WHERE lesson_plan_id = $1 ORDER BY position', [plan.id]);
        for (const step of steps.rows) {
          await client.query(
            `INSERT INTO lesson_steps (organisation_id, lesson_plan_id, position, step_type, title, body, media_url, duration_minutes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [ctx.organisationId, inserted.rows[0].id, step.position, step.step_type, step.title, step.body, step.media_url || null, step.duration_minutes || null]
          );
          stepCount += 1;
        }
      }
      return { module, planCount: position, stepCount };
    });
    await recordAudit(ctx.db, ctx, { action: 'curriculum.adopted_module', resourceType: 'learning_module', resourceId: created.module.id, metadata: { sourceKey: official.source_key || null, plans: created.planCount, steps: created.stepCount } });
    ctx.status = 201;
    return created;
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
      notes: { type: 'string', max: 2000, optional: true },
      recurrence: { type: 'string', enum: ['none', 'daily', 'weekly', 'biweekly', 'monthly'], optional: true },
      repeatUntil: { type: 'string', max: 10, optional: true }
    });
    const branch = await ctx.db.one('SELECT id FROM branches WHERE id = $1 AND organisation_id = $2',
      [body.branchId, ctx.organisationId]);
    if (!branch) throw new AppError('NOT_FOUND');
    const recurrence = body.recurrence || 'none';
    let startsAts = [new Date(body.startsAt)];
    const duration = body.endsAt ? new Date(body.endsAt).getTime() - new Date(body.startsAt).getTime() : null;
    if (recurrence !== 'none') {
      const until = body.repeatUntil ? new Date(body.repeatUntil + 'T23:59:59Z') : null;
      if (!until || Number.isNaN(until.getTime()) || until < startsAts[0]) {
        fail('VALIDATION', [{ field: 'repeatUntil', message: 'Choose a "repeats until" date on or after the first occurrence.' }]);
      }
      const max = 26;
      const next = new Date(startsAts[0]);
      while (startsAts.length < max) {
        if (recurrence === 'daily') next.setUTCDate(next.getUTCDate() + 1);
        else if (recurrence === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
        else if (recurrence === 'biweekly') next.setUTCDate(next.getUTCDate() + 14);
        else if (recurrence === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
        if (next > until) break;
        startsAts.push(new Date(next));
      }
    }
    const events = await ctx.db.withTransaction(async (client) => {
      const created = [];
      for (const start of startsAts) {
        const end = duration === null ? null : new Date(start.getTime() + duration).toISOString();
        const inserted = await client.query(
          `INSERT INTO scheduled_activities (organisation_id, branch_id, classroom_id, lesson_plan_id, activity_id, title,
            starts_at, ends_at, assigned_staff_id, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [ctx.organisationId, body.branchId, body.classroomId || null, body.lessonPlanId || null,
            body.activityId || null, body.title, start.toISOString(), end, body.assignedStaffId || null,
            body.notes || null]
        );
        created.push(inserted.rows[0]);
      }
      return created;
    });
    await recordAudit(ctx.db, ctx, { action: 'curriculum.activity_scheduled', resourceType: 'scheduled_activity', resourceId: events[0].id, branchId: body.branchId, metadata: { recurrence, occurrences: events.length } });
    ctx.status = 201;
    return Object.assign({}, events[0], { recurrenceCount: events.length, recurrence: recurrence === 'none' ? undefined : recurrence });
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

  router.post('/curriculum/calendar/events/:id/start', async (ctx) => {
    const event = await ctx.db.one('SELECT * FROM scheduled_activities WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!event) throw new AppError('NOT_FOUND');
    if (event.status !== 'scheduled') fail('CONFLICT', null, 'Only scheduled activities can be started.');
    await ctx.db.query(`UPDATE scheduled_activities SET status = 'in_progress' WHERE id = $1`, [event.id]);
    await recordAudit(ctx.db, ctx, { action: 'curriculum.activity_started', resourceType: 'scheduled_activity', resourceId: event.id });
    return ctx.db.one('SELECT * FROM scheduled_activities WHERE id = $1', [event.id]);
  }, { permission: 'curriculum.create.daycare' });

  router.post('/curriculum/calendar/events/:id/cancel', async (ctx) => {
    const event = await ctx.db.one('SELECT * FROM scheduled_activities WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!event) throw new AppError('NOT_FOUND');
    if (!['scheduled', 'in_progress'].includes(event.status)) fail('CONFLICT', null, 'Only scheduled or in-progress activities can be cancelled.');
    await ctx.db.query(`UPDATE scheduled_activities SET status = 'cancelled' WHERE id = $1`, [event.id]);
    await recordAudit(ctx.db, ctx, { action: 'curriculum.activity_cancelled', resourceType: 'scheduled_activity', resourceId: event.id });
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
