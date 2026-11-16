'use strict';

/**
 * Dynamic slide add-ons for lesson presentations: live multiple-choice
 * questions, polls and drag-and-drop activities injected into lesson guide
 * steps. Teachers run a presentation session; responses are collected and
 * aggregated so results can be shown live (clients poll the results endpoint).
 */

const { validate } = require('../../../../packages/contracts/validate');
const { AppError } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');

function isInteractiveType(type) {
  return type === 'poll' || type === 'mcq' || type === 'dragdrop';
}

function aggregate(step, responses) {
  const data = step.interactive_data || step.interactiveData || {};
  const type = step.step_type || step.stepType;
  if (type === 'poll' || type === 'mcq') {
    const options = Array.isArray(data.options) ? data.options.map((o) => (typeof o === 'string' ? o : (o && o.label) || String(o))) : [];
    const counts = options.map(() => 0);
    for (const r of responses) {
      const resp = r.response || {};
      const pick = resp.choice != null ? resp.choice : resp.answer;
      if (Array.isArray(pick)) {
        pick.forEach((idx) => { const i = Number(idx); if (i >= 0 && i < counts.length) counts[i] += 1; });
      } else {
        const i = Number(pick);
        if (Number.isInteger(i) && i >= 0 && i < counts.length) counts[i] += 1;
      }
    }
    return { type, options, counts, total: responses.length, correct: Array.isArray(data.correct) ? data.correct : (data.correct != null ? [Number(data.correct)] : null) };
  }
  if (type === 'dragdrop') {
    const items = Array.isArray(data.items) ? data.items : [];
    const targets = Array.isArray(data.targets) ? data.targets : [];
    // count correct placements per target index
    const placementCounts = targets.map(() => ({}));
    let correctCount = 0;
    for (const r of responses) {
      const placements = (r.response && r.response.placements) || {};
      let ok = true;
      items.forEach((item, i) => {
        const t = placements[String(i)] != null ? Number(placements[String(i)]) : (placements[i] != null ? Number(placements[i]) : -1);
        if (t >= 0 && t < targets.length) {
          placementCounts[t][String(i)] = (placementCounts[t][String(i)] || 0) + 1;
          if (Number(item.correctTarget) !== t) ok = false;
        } else { ok = false; }
      });
      if (ok) correctCount += 1;
    }
    return { type, items: items.map((it) => (typeof it === 'string' ? it : (it && it.label) || String(it))), targets: targets.map((t) => (typeof t === 'string' ? t : (t && t.label) || String(t))), placementCounts, total: responses.length, correctCount };
  }
  return { type, total: responses.length };
}

function register(router) {
  // List interactive steps for a lesson plan (for authoring/runtime context)
  router.get('/curriculum/lesson-plans/:id/interactions', async (ctx) => {
    const plan = await ctx.db.one('SELECT id, organisation_id FROM lesson_plans WHERE id = $1 AND (organisation_id = $2 OR organisation_id IS NULL)', [ctx.params.id, ctx.organisationId]);
    if (!plan) throw new AppError('NOT_FOUND');
    const steps = await ctx.db.many(
      `SELECT id, position, step_type, title, body, interactive_data FROM lesson_steps
       WHERE lesson_plan_id = $1 AND step_type IN ('poll','mcq','dragdrop','whiteboard') ORDER BY position`,
      [plan.id]
    );
    return steps.map((s) => ({ id: s.id, position: s.position, type: s.step_type, title: s.title, body: s.body, interactive: s.interactive_data || {} }));
  }, { permission: 'curriculum.read.daycare' });

  router.post('/presentations/sessions', async (ctx) => {
    const body = validate(ctx.body, {
      lessonPlanId: { type: 'string', uuid: true },
      title: { type: 'string', max: 200, optional: true },
      classroomId: { type: 'string', uuid: true, optional: true }
    });
    const plan = await ctx.db.one('SELECT id, organisation_id, title FROM lesson_plans WHERE id = $1 AND (organisation_id = $2 OR organisation_id IS NULL)', [body.lessonPlanId, ctx.organisationId]);
    if (!plan) throw new AppError('NOT_FOUND');
    const row = await ctx.db.one(
      `INSERT INTO presentation_sessions (organisation_id, lesson_plan_id, title, created_by, classroom_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ctx.organisationId, plan.id, body.title || plan.title || 'Presentation', ctx.user.id, body.classroomId || null]
    );
    await recordAudit(ctx.db, ctx, { action: 'presentation.session_started', resourceType: 'presentation_session', resourceId: row.id });
    ctx.status = 201;
    return row;
  }, { permission: 'curriculum.create.daycare' });

  router.get('/presentations/sessions', async (ctx) => {
    const planId = ctx.query.lessonPlanId;
    const params = [ctx.organisationId];
    let extra = '';
    if (planId) { params.push(planId); extra = ' AND s.lesson_plan_id = $2'; }
    const rows = await ctx.db.many(
      `SELECT s.*, lp.title AS plan_title, u.display_name AS created_by_name
       FROM presentation_sessions s
       LEFT JOIN lesson_plans lp ON lp.id = s.lesson_plan_id
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.organisation_id = $1${extra}
       ORDER BY s.created_at DESC LIMIT 50`, params
    );
    return rows;
  }, { permission: 'curriculum.read.daycare' });

  async function getSession(ctx, id) {
    const session = await ctx.db.one('SELECT * FROM presentation_sessions WHERE id = $1 AND organisation_id = $2', [id, ctx.organisationId]);
    if (!session) throw new AppError('NOT_FOUND');
    return session;
  }

  router.get('/presentations/sessions/:id', async (ctx) => {
    const session = await getSession(ctx, ctx.params.id);
    // include results snapshot
    const results = await buildResults(ctx, session);
    return { session, results };
  }, { permission: 'curriculum.read.daycare' });

  async function buildResults(ctx, session) {
    const steps = await ctx.db.many(
      `SELECT id, position, step_type, title, interactive_data FROM lesson_steps
       WHERE lesson_plan_id = $1 AND step_type IN ('poll','mcq','dragdrop') ORDER BY position`,
      [session.lesson_plan_id]
    );
    const respRows = await ctx.db.many(
      `SELECT id, step_id, participant_id, participant_name, response, updated_at FROM presentation_responses WHERE session_id = $1`,
      [session.id]
    );
    const byStep = new Map();
    for (const r of respRows) {
      if (!byStep.has(r.step_id)) byStep.set(r.step_id, []);
      byStep.get(r.step_id).push(r);
    }
    return steps.map((s) => ({
      stepId: s.id, position: s.position, type: s.step_type, title: s.title, interactive: s.interactive_data || {},
      aggregate: aggregate(s, byStep.get(s.id) || []),
      responses: (byStep.get(s.id) || []).map((r) => ({ participantName: r.participant_name, response: r.response, updatedAt: r.updated_at }))
    }));
  }

  router.get('/presentations/sessions/:id/results', async (ctx) => {
    const session = await getSession(ctx, ctx.params.id);
    return { session: { id: session.id, status: session.status, lessonPlanId: session.lesson_plan_id }, results: await buildResults(ctx, session) };
  }, { permission: 'curriculum.read.daycare' });

  router.post('/presentations/sessions/:id/close', async (ctx) => {
    const session = await getSession(ctx, ctx.params.id);
    if (session.status === 'closed') return session;
    const row = await ctx.db.one(
      `UPDATE presentation_sessions SET status = 'closed', closed_at = now() WHERE id = $1 AND organisation_id = $2 RETURNING *`,
      [session.id, ctx.organisationId]
    );
    await recordAudit(ctx.db, ctx, { action: 'presentation.session_closed', resourceType: 'presentation_session', resourceId: row.id });
    return row;
  }, { permission: 'curriculum.create.daycare' });

  router.post('/presentations/sessions/:id/responses', async (ctx) => {
    const session = await getSession(ctx, ctx.params.id);
    if (session.status === 'closed') throw new AppError('CONFLICT', 'This presentation session is closed.');
    const body = validate(ctx.body, {
      stepId: { type: 'string', uuid: true },
      participantName: { type: 'string', min: 1, max: 120, optional: true },
      participantId: { type: 'string', uuid: true, optional: true },
      response: { type: 'object' }
    });
    const step = await ctx.db.one('SELECT id, step_type, lesson_plan_id FROM lesson_steps WHERE id = $1', [body.stepId]);
    if (!step || step.lesson_plan_id !== session.lesson_plan_id || !isInteractiveType(step.step_type)) {
      throw new AppError('VALIDATION', [{ field: 'stepId', message: 'Not an interactive step in this presentation.' }]);
    }
    const name = (body.participantName || (ctx.user && ctx.user.displayName) || 'Participant').toString().trim().slice(0, 120);
    const row = await ctx.db.one(
      `INSERT INTO presentation_responses (organisation_id, session_id, step_id, participant_id, participant_name, response)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (session_id, step_id, participant_name)
       DO UPDATE SET response = EXCLUDED.response, participant_id = COALESCE(EXCLUDED.participant_id, presentation_responses.participant_id), updated_at = now()
       RETURNING *`,
      [ctx.organisationId, session.id, step.id, body.participantId || null, name, JSON.stringify(body.response || {})]
    );
    ctx.status = 201;
    return row;
  }, { permission: ['curriculum.read.daycare', 'curriculum.create.daycare'], permissionMode: 'any' });

  // Upsert interactive payload on a step (authoring). Only for tenant-owned plans.
  router.put('/curriculum/lesson-steps/:stepId/interactive', async (ctx) => {
    const body = validate(ctx.body, {
      type: { type: 'string', enum: ['poll', 'mcq', 'dragdrop', 'whiteboard'] },
      title: { type: 'string', max: 200, optional: true },
      body: { type: 'string', max: 4000, optional: true },
      interactive: { type: 'object', optional: true }
    });
    const step = await ctx.db.one(
      `SELECT s.*, p.organisation_id AS plan_org FROM lesson_steps s
       JOIN lesson_plans p ON p.id = s.lesson_plan_id WHERE s.id = $1`,
      [ctx.params.stepId]
    );
    if (!step) throw new AppError('NOT_FOUND');
    if (step.plan_org !== ctx.organisationId) throw new AppError('FORBIDDEN', 'Official content is read-only. Adopt it to make it yours.');
    const interactive = body.interactive && typeof body.interactive === 'object' ? body.interactive : {};
    const row = await ctx.db.one(
      `UPDATE lesson_steps SET step_type = $1, title = COALESCE($2,title), body = COALESCE($3,body), interactive_data = $4::jsonb
       WHERE id = $5 RETURNING id, position, step_type, title, body, interactive_data`,
      [body.type, body.title || null, body.body || null, JSON.stringify(interactive), step.id]
    );
    return { id: row.id, position: row.position, type: row.step_type, title: row.title, body: row.body, interactive: row.interactive_data || {} };
  }, { permission: 'curriculum.create.daycare' });
}

module.exports = { register };
