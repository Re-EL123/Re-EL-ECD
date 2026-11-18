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
const { rateLimit } = require('../middleware/rate-limit');
const { assignedClassroomIds, has, getLearner } = require('./helpers');

function isInteractiveType(type) {
  return type === 'poll' || type === 'mcq' || type === 'dragdrop';
}

/** Objective tags stored on the step's interactive_data. */
function objectiveIdsOf(step) {
  const data = step.interactive_data || step.interactiveData || {};
  return Array.isArray(data.objectiveIds) ? data.objectiveIds.filter(Boolean) : [];
}

/** Per-child correctness for a response against a step (null = not scored). */
function isCorrect(step, response) {
  const data = step.interactive_data || step.interactiveData || {};
  const type = step.step_type || step.stepType;
  const resp = response || {};
  if (type === 'mcq') {
    const correct = Array.isArray(data.correct) ? data.correct : (data.correct != null ? [Number(data.correct)] : []);
    if (!correct.length) return null;
    const pick = resp.choice != null ? resp.choice : resp.answer;
    const picks = Array.isArray(pick) ? pick.map(Number) : [Number(pick)];
    if (picks.some((n) => !Number.isInteger(n))) return false;
    return correct.every((c) => picks.includes(Number(c)));
  }
  if (type === 'dragdrop') {
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) return null;
    const placements = resp.placements || {};
    let allOk = true;
    items.forEach((item, i) => {
      const correctTarget = item.correctTarget == null ? i : Number(item.correctTarget);
      const t = placements[String(i)] != null ? Number(placements[String(i)]) : -1;
      if (t !== correctTarget) allOk = false;
    });
    return allOk;
  }
  return null;
}

function csvEsc(value) {
  let s = String(value == null ? '' : value);
  // Spreadsheet formula injection: a cell whose text starts with =, +, - or @
  // executes as a formula in Excel/LibreOffice. Prefix with an apostrophe.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Classroom-scoped access for a presentation session. Org-wide staff
 * (learners.read.daycare) and the session's creator keep access; an assigned
 * staff member only sees sessions for their own classrooms — never the
 * whole centre's evidence.
 */
async function assertPresentationAccess(ctx, session) {
  if (has(ctx, 'learners.read.daycare')) return;
  if (session && session.created_by === ctx.user.id) return;
  const assigned = await assignedClassroomIds(ctx);
  if (session && session.classroom_id && assigned.includes(session.classroom_id)) return;
  throw new AppError('FORBIDDEN');
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
        const correctTarget = item.correctTarget == null ? i : Number(item.correctTarget);
        const t = placements[String(i)] != null ? Number(placements[String(i)]) : (placements[i] != null ? Number(placements[i]) : -1);
        if (t >= 0 && t < targets.length) {
          placementCounts[t][String(i)] = (placementCounts[t][String(i)] || 0) + 1;
          if (correctTarget !== t) ok = false;
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
      classroomId: { type: 'string', uuid: true, optional: true },
      participantMode: { type: 'string', enum: ['anonymous', 'class_roster'], optional: true }
    });
    const mode = body.participantMode || 'anonymous';
    if (mode === 'class_roster' && !body.classroomId) {
      throw new AppError('VALIDATION', [{ field: 'classroomId', message: 'Choose the classroom whose roster answers this check.' }]);
    }
    const plan = await ctx.db.one('SELECT id, organisation_id, title FROM lesson_plans WHERE id = $1 AND (organisation_id = $2 OR organisation_id IS NULL)', [body.lessonPlanId, ctx.organisationId]);
    if (!plan) throw new AppError('NOT_FOUND');
    if (body.classroomId) {
      const room = await ctx.db.one('SELECT id FROM classrooms WHERE id = $1 AND organisation_id = $2', [body.classroomId, ctx.organisationId]);
      if (!room) throw new AppError('NOT_FOUND');
      // Assigned staff may only run sessions for their own classrooms.
      if (!has(ctx, 'learners.read.daycare')) {
        const assigned = await assignedClassroomIds(ctx);
        if (!assigned.includes(body.classroomId)) throw new AppError('FORBIDDEN');
      }
    }
    const row = await ctx.db.one(
      `INSERT INTO presentation_sessions (organisation_id, lesson_plan_id, title, created_by, classroom_id, participant_mode)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [ctx.organisationId, plan.id, body.title || plan.title || 'Presentation', ctx.user.id, body.classroomId || null, mode]
    );
    await recordAudit(ctx.db, ctx, { action: 'presentation.session_started', resourceType: 'presentation_session', resourceId: row.id, metadata: { participantMode: mode } });
    ctx.status = 201;
    return row;
  }, { permission: 'curriculum.create.daycare' });

  // The roster used for class_roster sessions — ids + names only, nothing else.
  router.get('/presentations/sessions/:id/roster', async (ctx) => {
    const session = await getSession(ctx, ctx.params.id);
    await assertPresentationAccess(ctx, session);
    if (!session.classroom_id) return { learners: [] };
    const rows = await ctx.db.many(
      `SELECT id, first_name, last_name FROM learners
       WHERE classroom_id = $1 AND organisation_id = $2 AND status = 'enrolled'
       ORDER BY first_name, last_name`,
      [session.classroom_id, ctx.organisationId]
    );
    return { learners: rows.map((r) => ({ id: r.id, name: (r.first_name + ' ' + r.last_name).trim() })) };
  }, { permission: 'curriculum.read.daycare' });

  router.get('/presentations/sessions', async (ctx) => {
    const planId = ctx.query.lessonPlanId;
    const wide = has(ctx, 'learners.read.daycare');
    const assigned = wide ? [] : await assignedClassroomIds(ctx);
    const params = [ctx.organisationId];
    let extra = '';
    if (!wide) {
      // Assigned staff see their own sessions and their own classrooms' sessions.
      params.push(ctx.user.id);
      extra = ' AND (s.created_by = $' + params.length;
      if (assigned.length) {
        params.push(assigned);
        extra += ' OR s.classroom_id = ANY($' + params.length + '::uuid[])';
      }
      extra += ')';
    }
    if (planId) { params.push(planId); extra += ' AND s.lesson_plan_id = $' + params.length; }
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
    await assertPresentationAccess(ctx, session);
    // include results snapshot
    const results = await buildResults(ctx, session);
    return { session: { id: session.id, status: session.status, participantMode: session.participant_mode, lessonPlanId: session.lesson_plan_id }, results };
  }, { permission: 'curriculum.read.daycare' });

  async function buildResults(ctx, session) {
    const steps = await ctx.db.many(
      `SELECT id, position, step_type, title, interactive_data FROM lesson_steps
       WHERE lesson_plan_id = $1 AND step_type IN ('poll','mcq','dragdrop') ORDER BY position`,
      [session.lesson_plan_id]
    );
    const respRows = await ctx.db.many(
      `SELECT pr.id, pr.step_id, pr.participant_id, pr.participant_name,
              COALESCE(l.first_name || ' ' || l.last_name, pr.participant_name) AS display_name,
              pr.response, pr.updated_at
       FROM presentation_responses pr
       LEFT JOIN learners l ON l.id = pr.participant_id
       WHERE pr.session_id = $1`,
      [session.id]
    );
    const byStep = new Map();
    for (const r of respRows) {
      if (!byStep.has(r.step_id)) byStep.set(r.step_id, []);
      byStep.get(r.step_id).push(r);
    }
    const childLevel = session.participant_mode === 'class_roster';
    return steps.map((s) => ({
      stepId: s.id, position: s.position, type: s.step_type, title: s.title, interactive: s.interactive_data || {},
      aggregate: aggregate(s, byStep.get(s.id) || []),
      responses: (byStep.get(s.id) || []).map((r) => ({
        learnerId: childLevel ? r.participant_id : null,
        participantName: r.display_name,
        response: r.response,
        correct: isCorrect(s, r.response),
        updatedAt: r.updated_at
      }))
    }));
  }

  router.get('/presentations/sessions/:id/results', async (ctx) => {
    const session = await getSession(ctx, ctx.params.id);
    await assertPresentationAccess(ctx, session);
    return { session: { id: session.id, status: session.status, participantMode: session.participant_mode, lessonPlanId: session.lesson_plan_id }, results: await buildResults(ctx, session) };
  }, { permission: 'curriculum.read.daycare' });

  router.get('/presentations/sessions/:id/export.csv', async (ctx) => {
    const session = await getSession(ctx, ctx.params.id);
    await assertPresentationAccess(ctx, session);
    const plan = await ctx.db.one('SELECT title FROM lesson_plans WHERE id = $1', [session.lesson_plan_id]).catch(() => null);
    const steps = await ctx.db.many(
      `SELECT id, title, step_type, interactive_data FROM lesson_steps WHERE lesson_plan_id = $1 AND step_type IN ('poll','mcq','dragdrop') ORDER BY position`,
      [session.lesson_plan_id]
    );
    const stepById = new Map(steps.map((s) => [s.id, s]));
    const lines = [];
    if (session.participant_mode === 'class_roster') {
      const respRows = await ctx.db.many(
        `SELECT pr.step_id, pr.response, pr.created_at,
                COALESCE(l.first_name || ' ' || l.last_name, pr.participant_name) AS child
         FROM presentation_responses pr LEFT JOIN learners l ON l.id = pr.participant_id
         WHERE pr.session_id = $1 ORDER BY pr.created_at`,
        [session.id]
      );
      const stepPos = new Map(steps.map((s) => [s.id, s.position || 0]));
      respRows.sort((a, b) => (stepPos.get(a.step_id) || 0) - (stepPos.get(b.step_id) || 0));
      lines.push(['Session', 'Plan', 'Step', 'Type', 'Child', 'Answer', 'Correct', 'Answered at'].map(csvEsc).join(','));
      for (const r of respRows) {
        const st = stepById.get(r.step_id) || {};
        const corr = isCorrect(st, r.response);
        lines.push([session.title || (plan && plan.title) || 'Live check', plan && plan.title, st.title || st.step_type, st.step_type, r.child, JSON.stringify(r.response || {}), corr === null ? '' : corr ? 'yes' : 'no', r.created_at].map(csvEsc).join(','));
      }
    } else {
      lines.push(['Session', 'Plan', 'Step', 'Type', 'Metric', 'Value', '', ''].map(csvEsc).join(','));
      const snapshot = session.aggregate_snapshot || { steps: [] };
      for (const agg of (snapshot.steps || [])) {
        lines.push([session.title || (plan && plan.title) || 'Live check', plan && plan.title, agg.title || agg.type, agg.type, 'Total votes', (agg.aggregate && agg.aggregate.total) || 0, '', ''].map(csvEsc).join(','));
        if (agg.aggregate && Array.isArray(agg.aggregate.options)) {
          agg.aggregate.options.forEach((opt, i) => {
            lines.push([session.title || (plan && plan.title) || 'Live check', plan && plan.title, agg.title || agg.type, agg.type, 'Option ' + (i + 1) + ' — ' + opt, (agg.aggregate.counts && agg.aggregate.counts[i]) || 0, '', ''].map(csvEsc).join(','));
          });
        }
      }
      if (!(snapshot.steps || []).length) lines.push([session.title || 'Live check', plan && plan.title, '', 'anonymous', 'Votes', 'No aggregate snapshot yet — close the session first', '', ''].map(csvEsc).join(','));
    }
    const body = lines.join('\r\n');
    await recordAudit(ctx.db, ctx, { action: 'presentation.export', resourceType: 'presentation_session', resourceId: session.id, metadata: { participantMode: session.participant_mode } });
    ctx.rawResponse = true;
    ctx.res.statusCode = 200;
    ctx.res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    ctx.res.setHeader('Content-Disposition', 'attachment; filename="re-el-live-check-' + String(session.id).slice(0, 8) + '.csv"');
    ctx.res.setHeader('Cache-Control', 'no-store');
    ctx.res.end(body);
  }, { permission: 'curriculum.read.daycare' });

  router.post('/presentations/sessions/:id/close', async (ctx) => {
    const session = await getSession(ctx, ctx.params.id);
    if (session.status === 'closed') return { session, evidence: { drafts: 0 } };
    const row = await ctx.db.one(
      `UPDATE presentation_sessions SET status = 'closed', closed_at = now() WHERE id = $1 AND organisation_id = $2 RETURNING *`,
      [session.id, ctx.organisationId]
    );
    // Persist an anonymous-safe snapshot: aggregate counts only, never a child's name.
    const snapshot = await buildSnapshot(ctx, row);
    await ctx.db.query('UPDATE presentation_sessions SET aggregate_snapshot = $1::jsonb WHERE id = $2', [JSON.stringify(snapshot), row.id]);
    // Evidence for the classroom: draft observations from roster responses,
    // never published automatically — a human reviews in the normal flow.
    let evidence = { drafts: 0 };
    if (row.participant_mode === 'class_roster') {
      try { evidence = await draftEvidence(ctx, row); } catch (e) { console.warn('live-check evidence drafting failed:', e && e.message); }
    }
    await recordAudit(ctx.db, ctx, { action: 'presentation.session_closed', resourceType: 'presentation_session', resourceId: row.id, metadata: { participantMode: row.participant_mode, drafts: evidence.drafts } });
    return { session: row, evidence };
  }, { permission: 'curriculum.create.daycare' });

  // Build the close-of-session snapshot: anonymous aggregates per step, no identities.
  async function buildSnapshot(ctx, session) {
    const steps = await ctx.db.many(
      `SELECT id, position, step_type, title, interactive_data FROM lesson_steps
       WHERE lesson_plan_id = $1 AND step_type IN ('poll','mcq','dragdrop') ORDER BY position`,
      [session.lesson_plan_id]
    );
    const respRows = await ctx.db.many('SELECT step_id, response FROM presentation_responses WHERE session_id = $1', [session.id]);
    const byStep = new Map();
    for (const r of respRows) {
      if (!byStep.has(r.step_id)) byStep.set(r.step_id, []);
      byStep.get(r.step_id).push(r);
    }
    return {
      closedAt: new Date().toISOString(),
      participantMode: session.participant_mode || 'anonymous',
      lessonPlanId: session.lesson_plan_id,
      steps: steps.map((s) => ({
        stepId: s.id, position: s.position, type: s.step_type, title: s.title,
        objectiveIds: objectiveIdsOf(s),
        aggregate: aggregate(s, byStep.get(s.id) || [])
      }))
    };
  }

  // Draft observations from roster-tagged evidence: one per (child, step, objective)
  // the child has a scored answer for. Drafts, always — a teacher reviews them.
  async function draftEvidence(ctx, session) {
    const plan = await ctx.db.one('SELECT title FROM lesson_plans WHERE id = $1', [session.lesson_plan_id]).catch(() => null);
    const room = session.classroom_id
      ? await ctx.db.one('SELECT name, branch_id FROM classrooms WHERE id = $1', [session.classroom_id]).catch(() => null)
      : null;
    const steps = await ctx.db.many(
      `SELECT id, title, step_type, interactive_data FROM lesson_steps
       WHERE lesson_plan_id = $1 AND step_type IN ('mcq','dragdrop') ORDER BY position`,
      [session.lesson_plan_id]
    );
    const tagged = steps.filter((s) => objectiveIdsOf(s).length > 0);
    if (!tagged.length) return { drafts: 0 };
    const respRows = await ctx.db.many(
      `SELECT participant_id, step_id, response FROM presentation_responses
       WHERE session_id = $1 AND participant_id IS NOT NULL`,
      [session.id]
    );
    const learnerIds = Array.from(new Set(respRows.map((r) => r.participant_id)));
    if (!learnerIds.length) return { drafts: 0 };
    const learners = await ctx.db.many(
      `SELECT id, first_name, last_name, branch_id FROM learners WHERE id = ANY($1::uuid[])`,
      [learnerIds]
    );
    const learnerById = new Map(learners.map((l) => [l.id, l]));
    let drafts = 0;
    for (const step of tagged) {
      for (const objectiveId of objectiveIdsOf(step)) {
        const context = 'live:' + session.id + ':' + step.id + ':' + objectiveId;
        for (const r of respRows) {
          if (drafts >= 60) return { drafts };
          if (r.step_id !== step.id) continue;
          const ok = isCorrect(step, r.response);
          if (ok === null) continue;
          const learner = learnerById.get(r.participant_id);
          if (!learner) continue;
          const existing = await ctx.db.one(
            `SELECT id FROM learner_observations WHERE organisation_id = $1 AND learner_id = $2 AND context = $3 LIMIT 1`,
            [ctx.organisationId, learner.id, context]
          );
          if (existing) continue;
          const branchId = learner.branch_id || (room && room.branch_id) || null;
          if (!branchId) continue;
          const text = (ok
            ? 'Live check in “' + ((plan && plan.title) || 'the guide') + '”: answered “' + step.title + '” correctly.'
            : 'Live check in “' + ((plan && plan.title) || 'the guide') + '”: struggled with “' + step.title + '” — worth a targeted look.')
            + ' Auto-drafted from the interactive slide — review and publish or discard.';
          await ctx.db.query(
            `INSERT INTO learner_observations (organisation_id, branch_id, learner_id, objective_id, observation_date, context, observation_text, assessment_status, visibility_status, recorded_by)
             VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,'draft','internal',$7)`,
            [ctx.organisationId, branchId, learner.id, objectiveId, context, text, ctx.user.id]
          );
          drafts += 1;
        }
      }
    }
    return { drafts };
  }

  router.post('/presentations/sessions/:id/responses', async (ctx) => {
    // One member may submit at most 120 responses to one session per 10 minutes
    // — enough for a class of 30 answering 3 questions, not a poll-flood.
    const flood = rateLimit('livecheck-resp:' + ctx.params.id + ':' + ctx.user.id, 120, 10 * 60 * 1000);
    if (!flood.allowed) throw new AppError('RATE_LIMITED');
    const session = await getSession(ctx, ctx.params.id);
    await assertPresentationAccess(ctx, session);
    if (session.status === 'closed') throw new AppError('CONFLICT', 'This presentation session is closed.');
    const body = validate(ctx.body, {
      stepId: { type: 'string', uuid: true },
      learnerId: { type: 'string', uuid: true, optional: true },
      participantName: { type: 'string', min: 1, max: 120, optional: true },
      response: { type: 'object' }
    });
    const step = await ctx.db.one('SELECT id, step_type, lesson_plan_id FROM lesson_steps WHERE id = $1', [body.stepId]);
    if (!step || step.lesson_plan_id !== session.lesson_plan_id || !isInteractiveType(step.step_type)) {
      throw new AppError('VALIDATION', [{ field: 'stepId', message: 'Not an interactive step in this presentation.' }]);
    }
    const rosterMode = session.participant_mode === 'class_roster';
    let learner = null;
    if (rosterMode) {
      if (!body.learnerId) throw new AppError('VALIDATION', [{ field: 'learnerId', message: 'Pick the child answering from the roster.' }]);
      learner = await ctx.db.one(
        'SELECT id, first_name, last_name FROM learners WHERE id = $1 AND organisation_id = $2 AND classroom_id = $3',
        [body.learnerId, ctx.organisationId, session.classroom_id]
      );
      if (!learner) throw new AppError('FORBIDDEN', [{ field: 'learnerId', message: 'That child is not on this classroom’s roster.' }]);
    }
    const name = learner
      ? (learner.first_name + ' ' + learner.last_name).trim().slice(0, 120)
      : null; // anonymous sessions store NO identity at all
    const participantId = learner ? learner.id : null;
    let row = null;
    if (rosterMode) {
      row = await ctx.db.one(
        `INSERT INTO presentation_responses (organisation_id, session_id, step_id, participant_id, participant_name, response)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (session_id, step_id, participant_id) WHERE participant_id IS NOT NULL
         DO UPDATE SET response = EXCLUDED.response, participant_name = EXCLUDED.participant_name, updated_at = now()
         RETURNING *`,
        [ctx.organisationId, session.id, step.id, participantId, name, JSON.stringify(body.response || {})]
      );
    } else {
      row = await ctx.db.one(
        `INSERT INTO presentation_responses (organisation_id, session_id, step_id, participant_id, participant_name, response)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
        [ctx.organisationId, session.id, step.id, null, null, JSON.stringify(body.response || {})]
      );
    }
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

  // A child's live-check history — staff-only; guardians see published observations only.
  router.get('/learners/:id/live-checks', async (ctx) => {
    // Enforces org + (daycare read | assigned classroom | parent link) instead
    // of org-only, so live-check history is never visible centre-wide.
    const learner = await getLearner(ctx, ctx.params.id);
    const rows = await ctx.db.many(
      `SELECT s.id AS session_id, s.title AS session_title, s.closed_at, lp.title AS plan_title,
              st.id AS step_id, st.title AS step_title, st.step_type, st.interactive_data, pr.response, pr.created_at
       FROM presentation_responses pr
       JOIN presentation_sessions s ON s.id = pr.session_id
       JOIN lesson_plans lp ON lp.id = s.lesson_plan_id
       JOIN lesson_steps st ON st.id = pr.step_id
       WHERE pr.participant_id = $1 AND pr.organisation_id = $2
       ORDER BY pr.created_at DESC LIMIT 50`,
      [learner.id, ctx.organisationId]
    );
    return rows.map((r) => {
      const step = { step_type: r.step_type, interactive_data: r.interactive_data || {} };
      return {
        sessionId: r.session_id, sessionTitle: r.session_title, planTitle: r.plan_title,
        stepTitle: r.step_title, stepType: r.step_type,
        correct: isCorrect(step, r.response),
        objectiveIds: objectiveIdsOf(step),
        answeredAt: r.created_at
      };
    });
  }, { permission: ['assessments.read.daycare', 'assessments.read.assigned', 'learners.read.daycare', 'learners.read.assigned'], permissionMode: 'any' });

  // POPIA erasure for a child's raw live-check answers. Aggregates are anonymous and stay.
  router.delete('/presentations/responses/learner/:learnerId', async (ctx) => {
    const learner = await ctx.db.one('SELECT id FROM learners WHERE id = $1 AND organisation_id = $2', [ctx.params.learnerId, ctx.organisationId]);
    if (!learner) throw new AppError('NOT_FOUND');
    const result = await ctx.db.query(
      'DELETE FROM presentation_responses WHERE participant_id = $1 AND organisation_id = $2',
      [learner.id, ctx.organisationId]
    );
    await recordAudit(ctx.db, ctx, { action: 'presentation.erase_learner', resourceType: 'learner', resourceId: learner.id, metadata: { deleted: result.rowCount || 0, actor: ctx.user.id } });
    return { deleted: result.rowCount || 0 };
  }, { permission: 'organisation.settings.manage' });

  // Platform item analysis: which interactive slides trip children up most —
  // AGGREGATE ONLY over official (NCF) content. No child ever appears here.
  router.get('/platform/item-analysis', async (ctx) => {
    const steps = await ctx.db.many(
      `SELECT st.id AS step_id, st.title AS step_title, st.step_type, lp.title AS plan_title, lp.id AS plan_id, st.interactive_data
       FROM lesson_steps st
       JOIN lesson_plans lp ON lp.id = st.lesson_plan_id AND lp.organisation_id IS NULL
       WHERE st.step_type IN ('mcq','dragdrop')
       LIMIT 5000`,
      []
    );
    if (!steps.length) return { steps: [] };
    const respRows = await ctx.db.many(
      `SELECT st.id AS step_id, pr.response
       FROM presentation_responses pr
       JOIN lesson_steps st ON st.id = pr.step_id
       JOIN lesson_plans lp ON lp.id = st.lesson_plan_id AND lp.organisation_id IS NULL
       LIMIT 100000`,
      []
    );
    const stats = new Map(steps.map((s) => [s.step_id, { attempts: 0, correct: 0, wrong: 0, unscored: 0 }]));
    for (const r of respRows) {
      const step = steps.find((s) => s.step_id === r.step_id);
      if (!step) continue;
      const s = stats.get(step.step_id);
      s.attempts += 1;
      const corr = isCorrect(step, r.response);
      if (corr === true) s.correct += 1;
      else if (corr === false) s.wrong += 1;
      else s.unscored += 1;
    }
    const out = steps
      .map((s) => {
        const st = stats.get(s.step_id);
        const scored = st.correct + st.wrong;
        const successRate = scored ? Math.round((st.correct / scored) * 100) : null;
        return {
          stepTitle: s.step_title, planTitle: s.plan_title, type: s.step_type,
          attempts: st.attempts, scored, successRate,
          objectiveIds: objectiveIdsOf(s),
          lowData: st.attempts < 5
        };
      })
      .filter((s) => s.attempts > 0)
      .sort((a, b) => (a.successRate == null ? 101 : a.successRate) - (b.successRate == null ? 101 : b.successRate));
    return { steps: out, note: 'Aggregate only. No child is identifiable here; official NCF content only.' };
  }, { platformOnly: true, permission: 'platform.organisations.read' });
}

module.exports = { register };
