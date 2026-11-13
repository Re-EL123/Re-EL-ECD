'use strict';

/**
 * Learning modules: a first-class, sequenced container for lesson plans built
 * around a theme and an age group. Plans live in at most one module at a time
 * and carry their position within it.
 */

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { has } = require('./helpers');

function register(router) {
  router.get('/learning-modules', async (ctx) => {
    const rows = await ctx.db.many(
      `SELECT m.*, u.display_name AS created_by_name,
              (SELECT COUNT(*)::int FROM lesson_plans p WHERE p.module_id = m.id) AS plan_count
       FROM learning_modules m
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.organisation_id = $1
       ORDER BY m.created_at DESC`,
      [ctx.organisationId]
    );
    return rows;
  }, { permission: 'curriculum.read.daycare' });

  router.post('/learning-modules', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 2, max: 180 },
      description: { type: 'string', max: 4000, optional: true },
      theme: { type: 'string', max: 120, optional: true },
      ageGroup: { type: 'string', max: 60, optional: true },
      durationWeeks: { type: 'number', min: 1, max: 52, optional: true }
    });
    const module = await ctx.db.one(
      `INSERT INTO learning_modules (organisation_id, title, description, theme, age_group, duration_weeks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [ctx.organisationId, body.title, body.description || null, body.theme || null,
        body.ageGroup || null, body.durationWeeks || null, ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'curriculum.module_created', resourceType: 'learning_module', resourceId: module.id
    });
    ctx.status = 201;
    return module;
  }, { permission: 'curriculum.create.daycare' });

  router.get('/learning-modules/:id', async (ctx) => {
    const module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module) throw new AppError('NOT_FOUND');
    const plans = await ctx.db.many(
      `SELECT lp.*, c.name AS classroom_name FROM lesson_plans lp
       LEFT JOIN classrooms c ON c.id = lp.classroom_id
       WHERE lp.module_id = $1
       ORDER BY COALESCE(lp.module_position, 9999), lp.created_at`,
      [module.id]
    );
    return { module, plans };
  }, { permission: 'curriculum.read.daycare' });

  router.patch('/learning-modules/:id', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 2, max: 180, optional: true },
      description: { type: 'string', max: 4000, optional: true },
      theme: { type: 'string', max: 120, optional: true },
      ageGroup: { type: 'string', max: 60, optional: true },
      durationWeeks: { type: 'number', min: 1, max: 52, optional: true },
      status: { type: 'string', enum: ['draft', 'published', 'archived'], optional: true }
    });
    const module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module) throw new AppError('NOT_FOUND');
    if (body.status === 'published' && !has(ctx, 'curriculum.publish.daycare')) throw new AppError('FORBIDDEN');
    await ctx.db.query(
      `UPDATE learning_modules SET title = COALESCE($1,title), description = COALESCE($2,description),
        theme = COALESCE($3,theme), age_group = COALESCE($4,age_group),
        duration_weeks = COALESCE($5,duration_weeks), status = COALESCE($6,status), updated_at = now()
       WHERE id = $7`,
      [body.title || null, body.description || null, body.theme || null, body.ageGroup || null,
        body.durationWeeks || null, body.status || null, module.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'curriculum.module_updated', resourceType: 'learning_module', resourceId: module.id,
      metadata: { status: body.status || null }
    });
    return ctx.db.one('SELECT * FROM learning_modules WHERE id = $1', [module.id]);
  }, { permission: 'curriculum.create.daycare' });

  router.delete('/learning-modules/:id', async (ctx) => {
    const module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module) throw new AppError('NOT_FOUND');
    await ctx.db.query('UPDATE lesson_plans SET module_id = NULL, module_position = NULL WHERE module_id = $1', [module.id]);
    await ctx.db.query('DELETE FROM learning_modules WHERE id = $1', [module.id]);
    await recordAudit(ctx.db, ctx, {
      action: 'curriculum.module_deleted', resourceType: 'learning_module', resourceId: module.id
    });
    return { deleted: true };
  }, { permission: 'curriculum.create.daycare' });

  router.post('/learning-modules/:id/plans', async (ctx) => {
    const body = validate(ctx.body, {
      planId: { type: 'string', uuid: true },
      position: { type: 'number', min: 1, optional: true }
    });
    const module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module) throw new AppError('NOT_FOUND');
    const plan = await ctx.db.one('SELECT * FROM lesson_plans WHERE id = $1 AND organisation_id = $2',
      [body.planId, ctx.organisationId]);
    if (!plan) throw new AppError('NOT_FOUND');
    let position = body.position || null;
    if (!position) {
      const max = await ctx.db.one('SELECT COALESCE(MAX(module_position), 0)::int AS max FROM lesson_plans WHERE module_id = $1', [module.id]);
      position = max.max + 1;
    }
    await ctx.db.query(
      'UPDATE lesson_plans SET module_id = $1, module_position = $2 WHERE id = $3',
      [module.id, position, plan.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'curriculum.module_plan_linked', resourceType: 'learning_module', resourceId: module.id,
      metadata: { planId: plan.id, position }
    });
    return { moduleId: module.id, planId: plan.id, position };
  }, { permission: 'curriculum.create.daycare' });

  router.delete('/learning-modules/:id/plans/:planId', async (ctx) => {
    const module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      'UPDATE lesson_plans SET module_id = NULL, module_position = NULL WHERE id = $1 AND module_id = $2',
      [ctx.params.planId, module.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'curriculum.module_plan_unlinked', resourceType: 'learning_module', resourceId: module.id
    });
    return { unlinked: true };
  }, { permission: 'curriculum.create.daycare' });

  router.post('/learning-modules/:id/plans/reorder', async (ctx) => {
    const body = validate(ctx.body, {
      planIds: { type: 'array', of: 'uuid', max: 100 }
    });
    const module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module) throw new AppError('NOT_FOUND');
    // Plans in the module that are not listed are appended after the listed
    // ones, so a partial list never leaves duplicate or null positions.
    const existing = await ctx.db.many(
      'SELECT id FROM lesson_plans WHERE module_id = $1 ORDER BY COALESCE(module_position, 9999), created_at',
      [module.id]
    );
    const requested = body.planIds.filter((id) => existing.some((row) => row.id === id));
    const appended = existing.map((row) => row.id).filter((id) => !requested.includes(id));
    const ordered = [...requested, ...appended];
    await ctx.db.withTransaction(async (client) => {
      for (let index = 0; index < ordered.length; index += 1) {
        await client.query(
          'UPDATE lesson_plans SET module_position = $1 WHERE id = $2 AND module_id = $3',
          [index + 1, ordered[index], module.id]
        );
      }
    });
    await recordAudit(ctx.db, ctx, {
      action: 'curriculum.module_plans_reordered', resourceType: 'learning_module', resourceId: module.id
    });
    return { reordered: ordered.length };
  }, { permission: 'curriculum.create.daycare' });
}

module.exports = { register };
