'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification } = require('../services/notification-service');
const { parsePagination } = require('../utils/http');
const { getLearner, has, assignedClassroomIds } = require('./helpers');

function register(router) {
  router.get('/assessments/observations', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const learnerId = ctx.query.learnerId || null;
    const status = ctx.query.status || null;
    const domainId = ctx.query.domainId || null;
    const scopeAll = has(ctx, 'assessments.read.daycare');
    const params = [ctx.organisationId, learnerId, status, domainId];
    let extra = '';
    if (!scopeAll) {
      const classrooms = await assignedClassroomIds(ctx);
      if (!classrooms.length) return [];
      params.push(classrooms);
      extra = ` AND l.classroom_id = ANY($${params.length}::uuid[])`;
    }
    const where = `o.organisation_id = $1 AND ($2::uuid IS NULL OR o.learner_id = $2::uuid)
      AND ($3::text IS NULL OR o.assessment_status = $3) AND ($4::uuid IS NULL OR ob.domain_id = $4::uuid)${extra}`;
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM learner_observations o
       JOIN learners l ON l.id = o.learner_id LEFT JOIN learning_objectives ob ON ob.id = o.objective_id
       WHERE ${where}`, params
    );
    const rows = await ctx.db.many(
      `SELECT o.*, l.first_name, l.last_name, ob.code AS objective_code, ob.description AS objective_description,
              d.name AS domain_name, u.display_name AS recorded_by_name
       FROM learner_observations o
       JOIN learners l ON l.id = o.learner_id
       LEFT JOIN learning_objectives ob ON ob.id = o.objective_id
       LEFT JOIN curriculum_domains d ON d.id = ob.domain_id
       LEFT JOIN users u ON u.id = o.recorded_by
       WHERE ${where} ORDER BY o.observation_date DESC, o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    return rows;
  }, { permission: ['assessments.read.daycare', 'assessments.read.assigned'], permissionMode: 'any' });

  router.post('/assessments/observations', async (ctx) => {
    const body = validate(ctx.body, {
      learnerId: { type: 'string', uuid: true },
      objectiveId: { type: 'string', uuid: true, optional: true },
      observationDate: { type: 'string', date: true, optional: true },
      context: { type: 'string', max: 120, optional: true },
      observationText: { type: 'string', min: 10, max: 5000 },
      publishNow: { type: 'boolean', optional: true }
    });
    const learner = await getLearner(ctx, body.learnerId);
    if (!has(ctx, 'assessments.create.assigned') && !has(ctx, 'assessments.read.daycare')) throw new AppError('FORBIDDEN');
    if (body.publishNow && !has(ctx, 'assessments.publish.daycare')) throw new AppError('FORBIDDEN');
    if (body.objectiveId) {
      const objective = await ctx.db.one('SELECT id FROM learning_objectives WHERE id = $1', [body.objectiveId]);
      if (!objective) fail('VALIDATION', [{ field: 'objectiveId', message: 'Unknown learning objective.' }]);
    }
    const observation = await ctx.db.one(
      `INSERT INTO learner_observations (organisation_id, branch_id, learner_id, objective_id, observation_date,
        context, observation_text, assessment_status, visibility_status, recorded_by, reviewed_by, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [ctx.organisationId, learner.branch_id, learner.id, body.objectiveId || null,
        body.observationDate || new Date().toISOString().slice(0, 10), body.context || null, body.observationText,
        body.publishNow ? 'published' : 'draft', body.publishNow ? 'published' : 'internal',
        ctx.user.id, body.publishNow ? ctx.user.id : null, body.publishNow ? new Date().toISOString() : null]
    );
    if (body.publishNow) await notifyGuardians(ctx, learner.id, observation);
    await recordAudit(ctx.db, ctx, {
      action: 'assessment.observation_created', resourceType: 'learner_observation', resourceId: observation.id,
      branchId: learner.branch_id, metadata: { published: Boolean(body.publishNow) }
    });
    ctx.status = 201;
    return observation;
  }, { permission: ['assessments.create.assigned', 'assessments.read.daycare'], permissionMode: 'any' });

  router.patch('/assessments/observations/:id', async (ctx) => {
    const body = validate(ctx.body, {
      context: { type: 'string', max: 120, optional: true },
      observationText: { type: 'string', min: 10, max: 5000, optional: true },
      objectiveId: { type: 'string', uuid: true, optional: true }
    });
    const observation = await ctx.db.one('SELECT * FROM learner_observations WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!observation) throw new AppError('NOT_FOUND');
    if (!['draft', 'submitted'].includes(observation.assessment_status)) {
      fail('CONFLICT', null, 'Published observations cannot be edited. Record an amendment instead.');
    }
    if (observation.recorded_by !== ctx.user.id && !has(ctx, 'assessments.read.daycare')) throw new AppError('FORBIDDEN');
    await ctx.db.query(
      `UPDATE learner_observations SET context = COALESCE($1,context), observation_text = COALESCE($2,observation_text),
        objective_id = COALESCE($3,objective_id), updated_at = now() WHERE id = $4`,
      [body.context || null, body.observationText || null, body.objectiveId || null, observation.id]
    );
    return ctx.db.one('SELECT * FROM learner_observations WHERE id = $1', [observation.id]);
  }, { permission: ['assessments.create.assigned', 'assessments.read.daycare'], permissionMode: 'any' });

  router.post('/assessments/observations/:id/publish', async (ctx) => {
    const observation = await ctx.db.one('SELECT * FROM learner_observations WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!observation) throw new AppError('NOT_FOUND');
    if (observation.assessment_status === 'published') fail('CONFLICT', null, 'This observation is already published.');
    await ctx.db.query(
      `UPDATE learner_observations SET assessment_status = 'published', visibility_status = 'published',
        reviewed_by = $1, published_at = now(), updated_at = now() WHERE id = $2`, [ctx.user.id, observation.id]
    );
    await notifyGuardians(ctx, observation.learner_id, observation);
    await recordAudit(ctx.db, ctx, {
      action: 'assessment.observation_published', resourceType: 'learner_observation', resourceId: observation.id
    });
    return ctx.db.one('SELECT * FROM learner_observations WHERE id = $1', [observation.id]);
  }, { permission: 'assessments.publish.daycare' });

  router.post('/assessments/observations/:id/amend', async (ctx) => {
    const body = validate(ctx.body, {
      observationText: { type: 'string', min: 10, max: 5000 },
      reason: { type: 'string', min: 3, max: 1000 }
    });
    const original = await ctx.db.one('SELECT * FROM learner_observations WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!original) throw new AppError('NOT_FOUND');
    if (original.assessment_status !== 'published') fail('CONFLICT', null, 'Only published observations are amended.');
    const amendment = await ctx.db.withTransaction(async (client) => {
      await client.query("UPDATE learner_observations SET assessment_status = 'amended' WHERE id = $1", [original.id]);
      return (await client.query(
        `INSERT INTO learner_observations (organisation_id, branch_id, learner_id, objective_id, observation_date,
          context, observation_text, assessment_status, visibility_status, recorded_by, reviewed_by, published_at, amended_from)
         VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,'published','published',$7,$8,now(),$9) RETURNING *`,
        [original.organisation_id, original.branch_id, original.learner_id, original.objective_id,
          original.context, body.observationText, ctx.user.id, ctx.user.id, original.id]
      )).rows[0];
    });
    await recordAudit(ctx.db, ctx, {
      action: 'assessment.observation_amended', resourceType: 'learner_observation', resourceId: amendment.id,
      metadata: { reason: body.reason, amendedFrom: original.id }
    });
    return amendment;
  }, { permission: 'assessments.publish.daycare' });

  router.get('/assessments/periods', async (ctx) => {
    return ctx.db.many('SELECT * FROM assessment_periods WHERE organisation_id = $1 ORDER BY starts_on DESC', [ctx.organisationId]);
  }, { permission: 'assessments.read.daycare' });

  router.post('/assessments/periods', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 120 },
      startsOn: { type: 'string', date: true },
      endsOn: { type: 'string', date: true }
    });
    if (body.endsOn < body.startsOn) fail('VALIDATION', [{ field: 'endsOn', message: 'The end date must follow the start date.' }]);
    const period = await ctx.db.one(
      `INSERT INTO assessment_periods (organisation_id, name, starts_on, ends_on) VALUES ($1,$2,$3,$4) RETURNING *`,
      [ctx.organisationId, body.name, body.startsOn, body.endsOn]
    );
    ctx.status = 201;
    return period;
  }, { permission: 'assessments.publish.daycare' });

  router.get('/assessments/learner/:learnerId', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.learnerId);
    const assessments = await ctx.db.many(
      `SELECT la.*, d.name AS domain_name, ap.name AS period_name FROM learner_assessments la
       LEFT JOIN curriculum_domains d ON d.id = la.domain_id
       LEFT JOIN assessment_periods ap ON ap.id = la.assessment_period_id
       WHERE la.learner_id = $1 ORDER BY ap.starts_on DESC, d.sort_order`, [learner.id]
    );
    const observations = await ctx.db.many(
      `SELECT o.*, ob.code AS objective_code, d.name AS domain_name FROM learner_observations o
       LEFT JOIN learning_objectives ob ON ob.id = o.objective_id
       LEFT JOIN curriculum_domains d ON d.id = ob.domain_id
       WHERE o.learner_id = $1 AND o.assessment_status IN ('published','amended')
       ORDER BY o.observation_date DESC`, [learner.id]
    );
    return { assessments, observations };
  }, { permission: ['assessments.read.daycare', 'assessments.read.assigned'], permissionMode: 'any' });

  router.post('/assessments/learner', async (ctx) => {
    const body = validate(ctx.body, {
      learnerId: { type: 'string', uuid: true },
      assessmentPeriodId: { type: 'string', uuid: true },
      domainId: { type: 'string', uuid: true },
      summary: { type: 'string', min: 5, max: 5000 }
    });
    const learner = await getLearner(ctx, body.learnerId);
    const existing = await ctx.db.one(
      `SELECT id FROM learner_assessments WHERE learner_id = $1 AND assessment_period_id = $2 AND domain_id = $3`,
      [learner.id, body.assessmentPeriodId, body.domainId]
    );
    if (existing) {
      await ctx.db.query(
        `UPDATE learner_assessments SET summary = $1, assessed_by = $2, assessment_status = 'published',
          reviewed_by = $2, published_at = now(), updated_at = now() WHERE id = $3`,
        [body.summary, ctx.user.id, existing.id]
      );
      await recordAudit(ctx.db, ctx, { action: 'assessment.learner_updated', resourceType: 'learner_assessment', resourceId: existing.id });
      return ctx.db.one('SELECT * FROM learner_assessments WHERE id = $1', [existing.id]);
    }
    const assessment = await ctx.db.one(
      `INSERT INTO learner_assessments (organisation_id, learner_id, assessment_period_id, domain_id, assessment_status,
        summary, assessed_by, reviewed_by, published_at)
       VALUES ($1,$2,$3,$4,'published',$5,$6,$6,now()) RETURNING *`,
      [ctx.organisationId, learner.id, body.assessmentPeriodId, body.domainId, body.summary, ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, { action: 'assessment.learner_created', resourceType: 'learner_assessment', resourceId: assessment.id });
    ctx.status = 201;
    return assessment;
  }, { permission: ['assessments.create.assigned', 'assessments.publish.daycare'], permissionMode: 'any' });

  router.get('/learners/:id/progress', async (ctx) => {
    const learner = await getLearner(ctx, ctx.params.id, { parent: true });
    return progressFor(ctx, learner);
  }, { permission: ['assessments.read.daycare', 'assessments.read.assigned', 'parent.read.own'], permissionMode: 'any' });

  router.post('/assessments/reports/generate', async (ctx) => {
    const body = validate(ctx.body, {
      learnerId: { type: 'string', uuid: true },
      assessmentPeriodId: { type: 'string', uuid: true, optional: true },
      format: { type: 'string', enum: ['json', 'html', 'csv'], optional: true }
    });
    const learner = await getLearner(ctx, body.learnerId);
    let period = null;
    if (body.assessmentPeriodId) {
      period = await ctx.db.one('SELECT * FROM assessment_periods WHERE id = $1 AND organisation_id = $2',
        [body.assessmentPeriodId, ctx.organisationId]);
      if (!period) fail('VALIDATION', [{ field: 'assessmentPeriodId', message: 'Unknown assessment period.' }]);
    }
    const progress = await progressFor(ctx, learner);
    const from = period ? dayOf(period.starts_on) : null;
    const to = period ? dayOf(period.ends_on) : null;
    const inPeriod = (date) => {
      const day = dayOf(date);
      return (!from || day >= from) && (!to || day <= to);
    };
    const observations = progress.observations.filter((o) => inPeriod(o.observation_date));
    const assessments = progress.assessments.filter((a) => !period || a.assessment_period_id === period.id);
    const domains = progress.domains.map((domain) => {
      const objectives = domain.objectives.map((objective) => Object.assign({}, objective, {
        lastObservation: objective.lastObservation && inPeriod(objective.lastObservation.observation_date)
          ? objective.lastObservation : null
      }));
      return Object.assign({}, domain, {
        objectives,
        observed: objectives.filter((o) => o.lastObservation).length
      });
    });
    const totalObjectives = domains.reduce((sum, d) => sum + d.total, 0);
    const observedObjectives = domains.reduce((sum, d) => sum + d.observed, 0);
    const report = {
      learner: progress.learner,
      period: period ? { id: period.id, name: period.name, startsOn: from, endsOn: to } : null,
      generatedAt: new Date().toISOString(),
      totals: {
        domains: domains.length,
        objectives: totalObjectives,
        observed: observedObjectives,
        observations: observations.length,
        assessments: assessments.length,
        coverage: totalObjectives ? Math.round((observedObjectives / totalObjectives) * 100) : 0
      },
      domains,
      observations,
      assessments,
      note: progress.note
    };
    report.html = renderProgressReport(ctx, report);
    if (body.format === 'csv') report.csv = progressCsv(report);
    const job = await ctx.db.one(
      `INSERT INTO report_jobs (organisation_id, report_key, parameters, status, requested_by, completed_at, row_count)
       VALUES ($1,'learner_progress',$2,'completed',$3,now(),$4) RETURNING *`,
      [ctx.organisationId, JSON.stringify({ learnerId: body.learnerId, assessmentPeriodId: body.assessmentPeriodId || null,
        format: body.format || 'html' }), ctx.user.id, observations.length + assessments.length]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'assessment.report_generated', resourceType: 'report_job', resourceId: job.id,
      metadata: { learnerId: learner.id, periodId: period ? period.id : null }
    });
    ctx.status = 201;
    return { job, report };
  }, { permission: 'assessments.read.daycare' });

  router.get('/assessments/overview', async (ctx) => {
    const learners = await ctx.db.one(
      "SELECT COUNT(*)::int AS total FROM learners WHERE organisation_id = $1 AND status = 'enrolled'", [ctx.organisationId]
    );
    const withObservations = await ctx.db.one(
      `SELECT COUNT(DISTINCT o.learner_id)::int AS total FROM learner_observations o
       JOIN learners l ON l.id = o.learner_id
       WHERE o.organisation_id = $1 AND o.observation_date > CURRENT_DATE - 60 AND l.status = 'enrolled'`,
      [ctx.organisationId]
    );
    const pending = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM learner_observations WHERE organisation_id = $1 AND assessment_status IN ('draft','submitted')`,
      [ctx.organisationId]
    );
    const published = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM learner_observations WHERE organisation_id = $1 AND assessment_status = 'published'`,
      [ctx.organisationId]
    );
    const coverage = await ctx.db.many(
      `SELECT d.name, COUNT(o.id)::int AS observations FROM curriculum_domains d
       LEFT JOIN learning_objectives ob ON ob.domain_id = d.id
       LEFT JOIN learner_observations o ON o.objective_id = ob.id AND o.organisation_id = $1
       GROUP BY d.id, d.name, d.sort_order ORDER BY d.sort_order`, [ctx.organisationId]
    );
    const missingObservations = await ctx.db.many(
      `SELECT l.id, l.first_name, l.last_name, c.name AS classroom_name FROM learners l
       LEFT JOIN classrooms c ON c.id = l.classroom_id
       WHERE l.organisation_id = $1 AND l.status = 'enrolled'
         AND NOT EXISTS (SELECT 1 FROM learner_observations o WHERE o.learner_id = l.id AND o.observation_date > CURRENT_DATE - 60)
       ORDER BY l.last_name LIMIT 20`, [ctx.organisationId]
    );
    return {
      learners: learners.total,
      learnersWithObservations: withObservations.total,
      completionRate: learners.total ? Math.round((withObservations.total / learners.total) * 100) : 0,
      pendingReview: pending.total,
      published: published.total,
      domainCoverage: coverage,
      missingObservations
    };
  }, { permission: 'assessments.read.daycare' });
}

async function notifyGuardians(ctx, learnerId, observation) {
  const guardians = await ctx.db.many(
    `SELECT g.user_id FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
     WHERE lg.learner_id = $1 AND lg.can_receive_reports = true AND g.user_id IS NOT NULL
       AND lg.portal_access_status = 'active'`,
    [learnerId]
  );
  if (!guardians.length) return;
  const learner = await ctx.db.one('SELECT first_name FROM learners WHERE id = $1', [learnerId]);
  await createNotification(ctx.db, ctx, {
    recipientUserIds: guardians.map((g) => g.user_id),
    type: 'progress_published',
    title: 'New progress update',
    body: `A new observation for ${learner.first_name} has been published to your portal.`,
    resourceType: 'learner_observation',
    resourceId: observation.id
  });
}

async function progressFor(ctx, learner) {
  const objectives = await ctx.db.many(
    `SELECT o.id, o.code, o.description, d.id AS domain_id, d.name AS domain_name
     FROM learning_objectives o JOIN curriculum_domains d ON d.id = o.domain_id
     JOIN curriculum_frameworks f ON f.id = d.framework_id
     WHERE (f.organisation_id = $1 OR f.organisation_id IS NULL) AND o.status = 'active'
     ORDER BY d.sort_order, o.code`, [ctx.organisationId]
  );
  const observations = await ctx.db.many(
    `SELECT o.id, o.objective_id, o.observation_date, o.context, o.observation_text, o.assessment_status
     FROM learner_observations o WHERE o.learner_id = $1 AND o.assessment_status IN ('published','amended')
     ORDER BY o.observation_date DESC`, [learner.id]
  );
  const domains = new Map();
  for (const objective of objectives) {
    if (!domains.has(objective.domain_name)) {
      domains.set(objective.domain_name, { name: objective.domain_name, objectives: [], observed: 0 });
    }
    const domain = domains.get(objective.domain_name);
    const related = observations.filter((o) => o.objective_id === objective.id);
    if (related.length) domain.observed += 1;
    domain.objectives.push({
      code: objective.code, description: objective.description,
      observed: related.length > 0, lastObservation: related[0] || null, observationCount: related.length
    });
  }
  const assessments = await ctx.db.many(
    `SELECT la.*, d.name AS domain_name, ap.name AS period_name FROM learner_assessments la
     LEFT JOIN curriculum_domains d ON d.id = la.domain_id
     LEFT JOIN assessment_periods ap ON ap.id = la.assessment_period_id
     WHERE la.learner_id = $1 AND la.assessment_status = 'published' ORDER BY la.published_at DESC`, [learner.id]
  );
  return {
    learner: { id: learner.id, firstName: learner.first_name, lastName: learner.last_name },
    domains: Array.from(domains.values()).map((d) => ({
      name: d.name,
      observed: d.observed,
      total: d.objectives.length,
      objectives: d.objectives
    })),
    observations,
    assessments,
    note: 'Progress is based on recorded observations. A skill without an observation is not treated as a developmental concern.'
  };
}

function dayOf(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  const iso = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderProgressReport(ctx, report) {
  const org = escapeHtml(ctx.organisation && ctx.organisation.name);
  const child = escapeHtml(report.learner.firstName + ' ' + report.learner.lastName);
  const periodLabel = report.period
    ? escapeHtml(report.period.name + ' (' + report.period.startsOn + ' to ' + report.period.endsOn + ')')
    : 'All recorded observations';
  const domainBlocks = report.domains.map((domain) => {
    const rows = domain.objectives.map((objective) => (
      '<tr><td class="mono">' + escapeHtml(objective.code) + '</td>' +
      '<td>' + escapeHtml(objective.description) + '</td>' +
      '<td>' + (objective.lastObservation ? '<span class="yes">Observed</span>' : '<span class="no">Not yet observed</span>') + '</td>' +
      '<td>' + (objective.lastObservation ? escapeHtml(dayOf(objective.lastObservation.observation_date)) : '—') + '</td></tr>'
    )).join('');
    return '<section><h3>' + escapeHtml(domain.name) + '</h3>' +
      '<p class="muted">' + domain.observed + ' of ' + domain.total + ' objectives observed.</p>' +
      '<table><thead><tr><th>Code</th><th>Learning objective</th><th>Status</th><th>Last observation</th></tr></thead><tbody>' +
      rows + '</tbody></table></section>';
  }).join('');
  const narrative = report.observations.slice(0, 40).map((o) => (
    '<li><strong>' + escapeHtml(dayOf(o.observation_date)) + '</strong> — ' +
    escapeHtml(o.observation_text) + (o.context ? ' <em>(' + escapeHtml(o.context) + ')</em>' : '') + '</li>'
  )).join('');
  return '<article class="progress-report">' +
    '<header><p class="eyebrow">' + org + '</p><h2>Developmental progress report</h2>' +
    '<p><strong>' + child + '</strong><br>' + periodLabel + '</p>' +
    '<p class="muted">Generated ' + escapeHtml(report.generatedAt.slice(0, 10)) + ' · ' +
    report.totals.observed + ' of ' + report.totals.objectives + ' objectives observed (' + report.totals.coverage + '%) · ' +
    report.totals.observations + ' observations in this period</p></header>' +
    domainBlocks +
    (narrative ? '<section><h3>Observation narrative</h3><ul>' + narrative + '</ul></section>' : '') +
    '<footer><p class="muted">' + escapeHtml(report.note) + '</p></footer></article>';
}

function progressCsv(report) {
  const lines = [['Domain', 'Code', 'Objective', 'Observed', 'Last observation'].join(',')];
  for (const domain of report.domains) {
    for (const objective of domain.objectives) {
      lines.push([
        csvCell(domain.name), csvCell(objective.code), csvCell(objective.description),
        objective.lastObservation ? 'yes' : 'no',
        objective.lastObservation ? dayOf(objective.lastObservation.observation_date) : ''
      ].join(','));
    }
  }
  return lines.join('\n');
}

function csvCell(value) {
  const text = String(value === undefined || value === null ? '' : value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

module.exports = { register, progressFor };
