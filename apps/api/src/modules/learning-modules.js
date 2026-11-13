'use strict';

/**
 * Learning modules: a first-class, sequenced container for lesson plans built
 * around a theme and an age group. Plans live in at most one module at a time
 * and carry their position within it.
 */

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { has, officialEnabled, isOfficial } = require('./helpers');
const exportService = require('../services/export-service');

async function findOfficialModule(ctx, id) {
  if (!(await officialEnabled(ctx))) return null;
  return ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id IS NULL', [id]);
}

function register(router) {
  router.get('/learning-modules', async (ctx) => {
    const includeOfficial = await officialEnabled(ctx);
    const rows = await ctx.db.many(
      `SELECT m.*, u.display_name AS created_by_name,
              (SELECT COUNT(*)::int FROM lesson_plans p WHERE p.module_id = m.id) AS plan_count
       FROM learning_modules m
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.organisation_id = $1 OR ($2::boolean AND m.organisation_id IS NULL)
       ORDER BY (m.organisation_id IS NULL), m.created_at DESC`,
      [ctx.organisationId, includeOfficial]
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
    let module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module && (await officialEnabled(ctx))) {
      module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id IS NULL',
        [ctx.params.id]);
    }
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
    let module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module) module = await findOfficialModule(ctx, ctx.params.id);
    if (!module) throw new AppError('NOT_FOUND');
    if (isOfficial(module)) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
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
    let module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module) module = await findOfficialModule(ctx, ctx.params.id);
    if (!module) throw new AppError('NOT_FOUND');
    if (isOfficial(module)) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
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
    let module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module) module = await findOfficialModule(ctx, ctx.params.id);
    if (!module) throw new AppError('NOT_FOUND');
    if (isOfficial(module)) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
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
    let module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module) module = await findOfficialModule(ctx, ctx.params.id);
    if (!module) throw new AppError('NOT_FOUND');
    if (isOfficial(module)) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
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
    let module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module) module = await findOfficialModule(ctx, ctx.params.id);
    if (!module) throw new AppError('NOT_FOUND');
    if (isOfficial(module)) fail('FORBIDDEN', null, 'Official content is read-only. Adopt it to make it yours.');
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

  // Branded teacher guide for a module: how to run the sequence, each plan with
  // its objectives and preparation, and the NCF alignment statement. Available
  // for the tenant's own modules and for official ones when the centre has the
  // NCF pack switched on.
  router.get('/learning-modules/:id/teacher-guide', async (ctx) => {
    let module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!module && (await officialEnabled(ctx))) {
      module = await ctx.db.one('SELECT * FROM learning_modules WHERE id = $1 AND organisation_id IS NULL',
        [ctx.params.id]);
    }
    if (!module) throw new AppError('NOT_FOUND');

    const plans = await ctx.db.many(
      `SELECT lp.*, c.name AS classroom_name FROM lesson_plans lp
       LEFT JOIN classrooms c ON c.id = lp.classroom_id
       WHERE lp.module_id = $1
       ORDER BY COALESCE(lp.module_position, 9999), lp.created_at`,
      [module.id]
    );
    const objectiveIds = [...new Set(plans.flatMap((plan) => plan.objective_ids || []))];
    const placeholders = objectiveIds.map((_, index) => '$' + (index + 1)).join(',');
    const objectives = objectiveIds.length
      ? await ctx.db.many('SELECT id, code, description, domain_id FROM learning_objectives WHERE id IN (' + placeholders + ')', objectiveIds)
      : [];
    const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));
    const org = (ctx.organisation && ctx.organisation.name) || 'Your centre';
    const isOfficialModule = module.organisation_id === null || module.organisation_id === undefined;
    const sections = [];
    sections.push({
      heading: 'How to use this guide',
      paragraphs: [
        'This guide walks you through ' + module.title + ' in the order children will experience it. Plans build on one another, so run them in sequence where you can, and trust the children\'s pace — repeating a plan or stretching one over two weeks is a normal, healthy choice.',
        'Every plan is play-based and links back to observable NCF outcomes. Record observations as you go; they feed the progress report automatically.' + (isOfficialModule ? ' This module is an official NCF pack: the activities, approaches and wording are ready to use as they are.' : '')
      ]
    });
    if (module.description) sections.push({ heading: 'The theme', paragraphs: [module.description] });
    sections.push({
      heading: 'The sequence at a glance',
      paragraphs: plans.map((plan, index) => (index + 1) + '. ' + plan.title + (plan.theme ? ' (' + plan.theme + ')' : ''))
    });
    for (const [index, plan] of plans.entries()) {
      const lines = ['Theme: ' + (plan.theme || '—') + '.'];
      const linked = (plan.objective_ids || []).map((id) => objectiveById.get(id)).filter(Boolean);
      if (linked.length) {
        lines.push('Outcomes this plan works towards:');
        for (const objective of linked) {
          lines.push('  ' + objective.code + ' — ' + objective.description);
        }
      }
      if (plan.preparation_notes) lines.push('Preparation: ' + plan.preparation_notes);
      sections.push({ heading: (index + 1) + '. ' + plan.title, paragraphs: lines });
    }
    sections.push({
      heading: 'NCF alignment',
      paragraphs: [
        'This pack aligns to the National Curriculum Framework for Children from Birth to Four (© Department of Basic Education, 2015). It is a play-based guide, not a prescriptive curriculum: adapt pacing, materials and language to the children in front of you.',
        'A skill without an observation is not treated as a developmental concern — it simply has not been seen yet. Observe generously, record what you see, and let the pattern emerge.'
      ]
    });

    const pdf = exportService.toDocumentPdf({
      title: module.title,
      subtitle: 'Teacher guide' + (module.theme ? ' — ' + module.theme : ''),
      organisationName: org,
      intro: ['One module. ' + plans.length + ' lesson plan' + (plans.length === 1 ? '' : 's') + '. A few hours of setup. A term of joyful, purposeful play.'],
      sections,
      updatedAt: module.updated_at || new Date().toISOString(),
      footer: 'Re-EL ECD — ' + org + ' · Official NCF pack (© DBE, 2015)'
    });
    ctx.rawResponse = true;
    ctx.res.statusCode = 200;
    ctx.res.setHeader('Content-Type', 'application/pdf');
    ctx.res.setHeader('Content-Disposition', 'attachment; filename="' + module.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-teacher-guide.pdf"');
    ctx.res.setHeader('Cache-Control', 'no-store');
    ctx.res.end(pdf);
  }, { permission: 'curriculum.read.daycare' });
}

module.exports = { register };
