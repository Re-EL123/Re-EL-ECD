'use strict';

/**
 * Teacher "Today" workspace + morning cockpit: one payload that powers a
 * unified day view — people/context (register, absentees, gate, focus),
 * a time-ordered timeline of today's scheduled blocks enriched with their
 * lesson plan, activity, module/sequence context and guide, plus the
 * evidence/wrap-up signals needed to close the loop.
 */

const { assignedClassroomIds, has, orgDayBounds } = require('./helpers');

/**
 * Fail closed. A staff member with no classroom assignments can only see
 * centre-wide data when they hold an org-wide read; otherwise they get an
 * intentionally empty day (nothing scheduled, no children) — never the whole
 * centre's PII.
 */
const WIDE_READ_PERMS = ['learners.read.daycare', 'reports.read.daycare', 'organisation.settings.manage', 'attendance.record.daycare'];

function wideRead(ctx) {
  return WIDE_READ_PERMS.some((key) => has(ctx, key));
}

function emptyMorning(today) {
  return {
    scopedEmpty: true,
    expected: 0,
    present: 0,
    recorded: 0,
    registerPct: 0,
    date: today,
    children: [],
    timeline: [],
    absentees: [],
    focusChildren: [],
    unverifiedDropoffs: [],
    gateScans: [],
    unopened: [],
    unfinished: { tasksDueToday: 0, draftObservations: 0 },
    dailyReports: { children: [], missing: 0, draft: 0, presentCount: 0 },
    rings: {},
    moments: { children: [], streak: 0 },
    unmarkedIds: [],
    wrapUp: { unfinishedBlocks: [], unfinishedCount: 0 }
  };
}

async function buildMorning(ctx, opts) {
  const bounds = (opts && opts.bounds) || orgDayBounds(ctx);
  const today = bounds.today;
  const assigned = await assignedClassroomIds(ctx);
  if (!assigned.length && !wideRead(ctx)) return emptyMorning(today);
  const scoped = assigned.length > 0;
  const learnerRows = await ctx.db.many(
    scoped
      ? `SELECT l.id, l.first_name, l.last_name, l.classroom_id, c.name AS classroom_name, l.profile_image_url
         FROM learners l LEFT JOIN classrooms c ON c.id = l.classroom_id
         WHERE l.organisation_id = $1 AND l.status = 'enrolled' AND l.classroom_id = ANY($2::uuid[])`
      : `SELECT l.id, l.first_name, l.last_name, l.classroom_id, c.name AS classroom_name, l.profile_image_url
         FROM learners l LEFT JOIN classrooms c ON c.id = l.classroom_id
         WHERE l.organisation_id = $1 AND l.status = 'enrolled'`,
    scoped ? [ctx.organisationId, assigned] : [ctx.organisationId]
  );
  const ids = learnerRows.map((row) => row.id);
  const expected = ids.length;

  const presence = ids.length
    ? await ctx.db.many(
        `SELECT learner_id, attendance_status, check_in_at, absence_reason
         FROM learner_attendance
         WHERE organisation_id = $1 AND attendance_date = $2 AND learner_id = ANY($3::uuid[])`,
        [ctx.organisationId, today, ids]
      )
    : [];
  const present = presence.filter((row) => row.attendance_status === 'present' || row.attendance_status === 'late' || row.check_in_at).length;
  const recorded = presence.length;
  const absentees = learnerRows.filter((row) => {
    const attendance = presence.find((presenceRow) => presenceRow.learner_id === row.id);
    return attendance && ['absent', 'excused'].includes(attendance.attendance_status);
  }).map((row) => ({
    id: row.id,
    name: row.first_name + ' ' + row.last_name,
    firstName: row.first_name,
    classroom: row.classroom_name || null,
    avatarUrl: row.profile_image_url || null,
    reason: (presence.find((presenceRow) => presenceRow.learner_id === row.id) || {}).absence_reason || null
  }));

  const focusChildren = ids.length
    ? await ctx.db.many(
        `SELECT l.id, l.first_name, l.last_name, l.classroom_id, c.name AS classroom_name,
                l.profile_image_url, MAX(o.observation_date) AS last_observation
         FROM learners l
         LEFT JOIN classrooms c ON c.id = l.classroom_id
         LEFT JOIN learner_observations o
           ON o.learner_id = l.id AND o.assessment_status IN ('published','amended')
         WHERE l.organisation_id = $1 AND l.id = ANY($2::uuid[])
         GROUP BY l.id, l.first_name, l.last_name, l.classroom_id, c.name, l.profile_image_url
         HAVING MAX(o.observation_date) IS NULL OR MAX(o.observation_date) < $3::date - interval '30 days'
         ORDER BY MAX(o.observation_date) ASC NULLS FIRST, l.first_name
         LIMIT 4`,
        [ctx.organisationId, ids, today]
      )
    : [];

  const draftMiss = await ctx.db.one(
    `SELECT COUNT(*)::int AS count FROM learner_observations
     WHERE organisation_id = $1 AND assessment_status = 'draft'
       AND ((learner_id = ANY($2::uuid[])) OR recorded_by = $3)`,
    [ctx.organisationId, ids, ctx.user.id]
  );
  const reportsPendingSignoff = ids.length
    ? await ctx.db.one(
        `SELECT COUNT(*)::int AS count FROM daily_reports
         WHERE organisation_id = $1 AND report_date >= $3::date - interval '2 days'
           AND shared_with_guardians = false AND learner_id = ANY($2::uuid[])`,
        [ctx.organisationId, ids, today]
      )
    : { count: 0 };
  const tasksDueToday = await ctx.db.one(
    `SELECT COUNT(*)::int AS count FROM tasks
     WHERE organisation_id = $1 AND assigned_to = $2 AND due_at = $3::date
       AND status IN ('open','in_progress','blocked')`,
    [ctx.organisationId, ctx.user.id, today]
  );

  const children = learnerRows.map((row) => ({
    id: row.id,
    name: row.first_name + ' ' + row.last_name,
    firstName: row.first_name,
    classroom: row.classroom_name || null,
    classroomId: row.classroom_id || null,
    avatarUrl: row.profile_image_url || null
  }));

  const momentsThisWeek = ids.length
    ? await ctx.db.many(
        `SELECT learner_id, COUNT(*)::int AS count
         FROM learner_observations
         WHERE organisation_id = $1 AND learner_id = ANY($2::uuid[])
           AND assessment_status IN ('published','amended')
           AND observation_date >= date_trunc('week', $3::date)::date
           AND observation_date < (date_trunc('week', $3::date) + interval '7 days')::date
         GROUP BY learner_id`,
        [ctx.organisationId, ids, today]
      )
    : [];
  const momentMap = new Map(momentsThisWeek.map((row) => [row.learner_id, row.count]));
  const momentsChildren = children.map((child) => ({
    ...child,
    thisWeek: momentMap.get(child.id) || 0,
    done: (momentMap.get(child.id) || 0) >= 1
  }));
  const weekCounts = ids.length
    ? await ctx.db.many(
        `SELECT date_trunc('week', observation_date)::date AS week, COUNT(DISTINCT learner_id)::int AS covered
         FROM learner_observations
         WHERE organisation_id = $1 AND learner_id = ANY($2::uuid[])
           AND assessment_status IN ('published','amended')
         GROUP BY 1 ORDER BY 1 DESC LIMIT 26`,
        [ctx.organisationId, ids]
      )
    : [];
  let streak = 0;
  for (const row of weekCounts) {
    if (row.covered >= (expected || 1)) streak += 1; else break;
  }

  const unopenedObservations = ids.length
    ? await ctx.db.many(
        `SELECT DISTINCT ON (o.learner_id)
                o.id, o.learner_id, o.observation_date, o.context, o.observation_text,
                (SELECT g.first_name FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
                 WHERE lg.learner_id = o.learner_id AND lg.portal_access_status = 'active' AND g.user_id IS NOT NULL LIMIT 1) AS guardian_first
         FROM learner_observations o
         WHERE o.organisation_id = $1 AND o.learner_id = ANY($2::uuid[])
           AND o.assessment_status IN ('published','amended')
           AND o.parent_viewed_at IS NULL
           AND o.published_at IS NOT NULL AND o.published_at < now() - interval '48 hours'
         ORDER BY o.learner_id, o.observation_date DESC`,
        [ctx.organisationId, ids]
      )
    : [];
  const lastDigest = await ctx.db.one(
    "SELECT MAX(sent_at) AS sent FROM email_deliveries WHERE organisation_id = $1 AND template = 'weeklyDigest' AND status = 'sent'",
    [ctx.organisationId]
  ).catch(() => null);
  let unopenedDigest = [];
  if (lastDigest && lastDigest.sent && new Date(lastDigest.sent).getTime() < Date.now() - 48 * 3600000) {
    unopenedDigest = ids.length
      ? await ctx.db.many(
          `SELECT DISTINCT g.first_name AS guardian_first, l.first_name AS child_first
           FROM learner_guardians lg
           JOIN guardians g ON g.id = lg.guardian_id
           JOIN learners l ON l.id = lg.learner_id
           JOIN memberships m ON m.user_id = g.user_id AND m.organisation_id = $1 AND m.status = 'active'
           WHERE lg.learner_id = ANY($2::uuid[]) AND lg.portal_access_status = 'active'
             AND g.user_id IS NOT NULL
             AND COALESCE(m.digest_opened_at, 'epoch'::timestamptz) < $3
           LIMIT 4`,
          [ctx.organisationId, ids, lastDigest.sent]
        )
      : [];
  }
  const unopened = [
    ...unopenedObservations.map((row) => ({
      kind: 'observation',
      guardianFirst: row.guardian_first || 'A parent',
      childName: (children.find((c) => c.id === row.learner_id) || {}).name || '',
      detail: (row.context ? row.context + ' · ' : '') + String(row.observation_text || '').split('\n')[0].slice(0, 90),
      sharedAt: row.observation_date
    })),
    ...unopenedDigest.map((row) => ({
      kind: 'digest',
      guardianFirst: row.guardian_first,
      childName: row.child_first,
      detail: 'Hasn\u2019t opened this week\u2019s digest yet',
      sharedAt: null
    }))
  ].slice(0, 5);

  const unverifiedDropoffs = ids.length
    ? await ctx.db.many(
        `SELECT l.first_name, l.last_name, a.brought_by_name, a.check_in_at
         FROM learner_attendance a JOIN learners l ON l.id = a.learner_id
         WHERE a.organisation_id = $1 AND a.learner_id = ANY($2::uuid[])
           AND a.attendance_date = $3
           AND a.brought_by_unverified = TRUE AND a.check_out_at IS NULL
         ORDER BY a.check_in_at`,
        [ctx.organisationId, ids, today]
      )
    : [];

  const gateScans = ids.length
    ? await ctx.db.many(
        `SELECT gs.id, gs.collector_name, gs.collector_type, gs.confirmed_at, gs.source,
                l.first_name, l.last_name, l.profile_image_url, c.name AS classroom_name,
                (l.collection_hold_reason IS NOT NULL) AS on_hold
         FROM gate_scans gs JOIN learners l ON l.id = gs.learner_id
         LEFT JOIN classrooms c ON c.id = l.classroom_id
         WHERE gs.organisation_id = $1 AND gs.learner_id = ANY($2::uuid[])
           AND gs.released_at IS NULL AND gs.confirmed_at::date = $3
         ORDER BY gs.confirmed_at ASC`,
        [ctx.organisationId, ids, today]
      )
    : [];

  const deniedToday = ids.length
    ? await ctx.db.many(
        `SELECT l.first_name AS child_first, ce.collector_name, ce.denial_reason, ce.recorded_at
         FROM learner_collection_events ce
         JOIN learners l ON l.id = ce.learner_id
         WHERE ce.organisation_id = $1 AND ce.learner_id = ANY($2::uuid[])
           AND ce.event_type = 'denied' AND ce.recorded_at::date = $3
         ORDER BY ce.recorded_at DESC`,
        [ctx.organisationId, ids, today]
      )
    : [];

  const reactions = ids.length
    ? await ctx.db.many(
        `SELECT r.reaction, r.created_at, r.resource_type,
                l.first_name AS child_first,
                u.display_name AS guardian_name,
                o.observation_date, o.context, o.observation_text
         FROM guardian_reactions r
         JOIN learners l ON l.id = r.learner_id
         JOIN users u ON u.id = r.guardian_user_id
         LEFT JOIN learner_observations o ON r.resource_type = 'observation' AND o.id = r.resource_id
         WHERE r.organisation_id = $1 AND r.learner_id = ANY($2::uuid[])
           AND r.created_at > now() - interval '7 days'
         ORDER BY r.created_at DESC LIMIT 4`,
        [ctx.organisationId, ids]
      )
    : [];

  const obsPublishedThisMonth = ids.length
    ? await ctx.db.one(
        `SELECT COUNT(DISTINCT learner_id)::int AS count FROM learner_observations
         WHERE organisation_id = $1 AND learner_id = ANY($2::uuid[])
           AND assessment_status IN ('published','amended')
           AND observation_date >= date_trunc('month', $3::date)::date
           AND observation_date < (date_trunc('month', $3::date) + interval '1 month')::date`,
        [ctx.organisationId, ids, today]
      )
    : { count: 0 };
  const reportsThisWeek = ids.length
    ? await ctx.db.one(
        `SELECT COUNT(DISTINCT learner_id)::int AS count FROM daily_reports
         WHERE organisation_id = $1 AND learner_id = ANY($2::uuid[])
           AND report_date >= date_trunc('week', $3::date)::date
           AND report_date < (date_trunc('week', $3::date) + interval '7 days')::date`,
        [ctx.organisationId, ids, today]
      )
    : { count: 0 };

  return {
    scoped: scoped,
    expected,
    present,
    recorded,
    registerPct: expected ? Math.round((recorded / expected) * 100) : 0,
    absentees,
    focusChildren: focusChildren.map((row) => ({
      id: row.id,
      name: row.first_name + ' ' + row.last_name,
      firstName: row.first_name,
      classroom: row.classroom_name || null,
      avatarUrl: row.profile_image_url || null,
      lastObservation: row.last_observation || null
    })),
    unfinished: {
      draftObservations: draftMiss.count,
      reportsPendingSignoff: reportsPendingSignoff.count,
      tasksDueToday: tasksDueToday.count
    },
    children,
    moments: {
      target: 1,
      children: momentsChildren,
      allDone: momentsChildren.length > 0 && momentsChildren.every((c) => c.done),
      streak
    },
    unopened,
    unverifiedDropoffs: unverifiedDropoffs.map((row) => ({
      childFirst: row.first_name,
      childName: row.first_name + ' ' + row.last_name,
      broughtByName: row.brought_by_name || 'Unknown adult'
    })),
    gateScans: gateScans.map((row) => ({
      id: row.id,
      childFirst: row.first_name,
      childName: row.first_name + ' ' + row.last_name,
      classroom: row.classroom_name || null,
      avatarUrl: row.profile_image_url || null,
      collectorName: row.collector_name,
      collectorType: row.collector_type || 'family',
      source: row.source || 'gate_qr',
      confirmedAt: row.confirmed_at,
      onHold: row.on_hold
    })),
    deniedToday: deniedToday.map((row) => ({
      childFirst: row.child_first,
      collectorName: row.collector_name,
      reason: row.denial_reason || 'No reason recorded',
      at: row.recorded_at
    })),
    reactions: reactions.map((row) => ({
      reaction: row.reaction,
      guardianName: row.guardian_name,
      guardianFirst: String(row.guardian_name || '').trim().split(' ')[0],
      childFirst: row.child_first,
      date: row.observation_date || row.created_at,
      detail: String(row.observation_text || '').split('\n')[0].slice(0, 90)
    })),
    unmarkedIds: ids.filter((id) => !presence.find((row) => row.learner_id === id)),
    rings: {
      registerPct: expected ? Math.round((present / expected) * 100) : 0,
      observationsPublishedPct: expected ? Math.round((obsPublishedThisMonth.count / expected) * 100) : 0,
      dailyReportsPct: expected ? Math.round((reportsThisWeek.count / expected) * 100) : 0,
      label: 'This month'
    },
    _ids: ids,
    _presence: presence,
    _assigned: assigned
  };
}

async function buildToday(ctx) {
  const bounds = orgDayBounds(ctx);
  const today = bounds.today;
  const startIso = new Date(bounds.startUtc).toISOString();
  const endIso = new Date(bounds.endUtc).toISOString();
  const morning = await buildMorning(ctx, { today, bounds });
  if (morning.scopedEmpty) return morning;
  const ids = morning._ids || [];
  const presence = morning._presence || [];
  const presentIds = new Set(presence.filter((row) => row.attendance_status === 'present' || row.attendance_status === 'late' || row.check_in_at).map((r) => r.learner_id));
  const presentChildren = (morning.children || []).filter((c) => presentIds.has(c.id));

  const assignedForEvents = morning._assigned || [];
  const restrictEvents = !wideRead(ctx) && assignedForEvents.length > 0;
  // Scope: assigned staff see their own classrooms AND classroom-less,
  // centre-wide blocks AND anything assigned to them personally. Events bound
  // to another classroom stay out of their view.
  const events = await ctx.db.many(
    restrictEvents
      ? `SELECT sa.*, c.name AS classroom_name, u.display_name AS staff_name, lp.title AS lesson_plan_title
         FROM scheduled_activities sa
         LEFT JOIN classrooms c ON c.id = sa.classroom_id
         LEFT JOIN staff_profiles sp ON sp.id = sa.assigned_staff_id
         LEFT JOIN users u ON u.id = sp.user_id
         LEFT JOIN lesson_plans lp ON lp.id = sa.lesson_plan_id
         WHERE sa.organisation_id = $1 AND sa.starts_at >= $2::timestamptz AND sa.starts_at < $3::timestamptz
           AND (sa.classroom_id IS NULL OR sa.classroom_id = ANY($4::uuid[]) OR sa.assigned_staff_id IN (SELECT id FROM staff_profiles WHERE user_id = $5 AND organisation_id = $1))
         ORDER BY sa.starts_at`
      : `SELECT sa.*, c.name AS classroom_name, u.display_name AS staff_name, lp.title AS lesson_plan_title
         FROM scheduled_activities sa
         LEFT JOIN classrooms c ON c.id = sa.classroom_id
         LEFT JOIN staff_profiles sp ON sp.id = sa.assigned_staff_id
         LEFT JOIN users u ON u.id = sp.user_id
         LEFT JOIN lesson_plans lp ON lp.id = sa.lesson_plan_id
         WHERE sa.organisation_id = $1 AND sa.starts_at >= $2::timestamptz AND sa.starts_at < $3::timestamptz
         ORDER BY sa.starts_at`,
    restrictEvents ? [ctx.organisationId, startIso, endIso, assignedForEvents, ctx.user.id] : [ctx.organisationId, startIso, endIso]
  );

  const planIds = [...new Set(events.map((e) => e.lesson_plan_id).filter(Boolean))];
  const activityIds = [...new Set(events.map((e) => e.activity_id).filter(Boolean))];
  const eventIds = events.map((e) => e.id);

  const plans = planIds.length
    ? await ctx.db.many(
        `SELECT lp.*, lm.title AS module_title, lm.theme AS module_theme
         FROM lesson_plans lp LEFT JOIN learning_modules lm ON lm.id = lp.module_id
         WHERE lp.id = ANY($1::uuid[])`, [planIds]
      )
    : [];
  const planById = new Map(plans.map((p) => [p.id, p]));

  const activities = activityIds.length
    ? await ctx.db.many(`SELECT * FROM activities WHERE id = ANY($1::uuid[])`, [activityIds])
    : [];
  const activityById = new Map(activities.map((a) => [a.id, a]));

  const moduleIds = [...new Set(plans.map((p) => p.module_id).filter(Boolean))];
  const modulePlans = moduleIds.length
    ? await ctx.db.many(
        `SELECT id, module_id, title FROM lesson_plans WHERE module_id = ANY($1::uuid[])
         ORDER BY COALESCE(module_position,9999), created_at`, [moduleIds]
      )
    : [];
  const moduleById = new Map();
  for (const mid of moduleIds) {
    const list = modulePlans.filter((p) => p.module_id === mid);
    moduleById.set(mid, { total: list.length, order: list.map((p) => p.id) });
  }

  const objectiveIds = [...new Set(plans.flatMap((p) => (Array.isArray(p.objective_ids) ? p.objective_ids : (p.objective_ids || []))))].filter(Boolean);
  const objectives = objectiveIds.length
    ? await ctx.db.many(
        `SELECT o.id, o.code, o.description, d.name AS domain_name
         FROM learning_objectives o LEFT JOIN curriculum_domains d ON d.id = o.domain_id
         WHERE o.id = ANY($1::uuid[])`, [objectiveIds]
      )
    : [];
  const objectiveById = new Map(objectives.map((o) => [o.id, o]));

  const steps = planIds.length
    ? await ctx.db.many(
        `SELECT lesson_plan_id, COUNT(*)::int AS count, COALESCE(SUM(duration_minutes),0)::int AS total_minutes
         FROM lesson_steps WHERE lesson_plan_id = ANY($1::uuid[]) GROUP BY lesson_plan_id`, [planIds]
      )
    : [];
  const stepsByPlan = new Map(steps.map((s) => [s.lesson_plan_id, s]));

  // Interactive slides per plan (polls, quizzes, matching games, whiteboards):
  // the Today timeline shows them as first-class, jumpable content.
  const interactiveRows = planIds.length
    ? await ctx.db.many(
        `SELECT lesson_plan_id, step_type, COUNT(*)::int AS count
         FROM lesson_steps
         WHERE lesson_plan_id = ANY($1::uuid[])
           AND step_type IN ('poll','mcq','dragdrop','whiteboard')
         GROUP BY lesson_plan_id, step_type`, [planIds]
      )
    : [];
  const firstInteractiveRows = planIds.length
    ? await ctx.db.many(
        `SELECT lesson_plan_id, MIN(ix)::int AS first_interactive_index
         FROM (
           SELECT lesson_plan_id,
                  (row_number() OVER (PARTITION BY lesson_plan_id ORDER BY position) - 1) AS ix,
                  step_type
           FROM lesson_steps
           WHERE lesson_plan_id = ANY($1::uuid[])
         ) s
         WHERE step_type IN ('poll','mcq','dragdrop','whiteboard')
         GROUP BY lesson_plan_id`, [planIds]
      )
    : [];
  const interactiveByPlan = new Map();
  for (const row of interactiveRows) {
    const entry = interactiveByPlan.get(row.lesson_plan_id) || { poll: 0, mcq: 0, dragdrop: 0, whiteboard: 0 };
    entry[row.step_type] = row.count;
    interactiveByPlan.set(row.lesson_plan_id, entry);
  }
  const firstInteractiveByPlan = new Map(firstInteractiveRows.map((r) => [r.lesson_plan_id, r.first_interactive_index]));

  // Per-user guide positions for every plan in today's blocks (resume labels),
  // and today's captured quick moments per classroom (wrap-up "N of M").
  const positions = planIds.length
    ? await ctx.db.many(
        `SELECT lesson_plan_id, step_index, completed_at, updated_at FROM guide_positions
         WHERE organisation_id = $1 AND user_id = $2 AND lesson_plan_id = ANY($3::uuid[])`,
        [ctx.organisationId, ctx.user.id, planIds]
      )
    : [];
  const positionByPlan = new Map(positions.map((p) => [p.lesson_plan_id, p]));

  const momentsToday = presentIds.size
    ? await ctx.db.many(
        `SELECT o.learner_id, COUNT(*)::int AS count FROM learner_observations o
         WHERE o.organisation_id = $1 AND o.observation_date = $2::date AND o.learner_id = ANY($3::uuid[])
         GROUP BY o.learner_id`,
        [ctx.organisationId, today, [...presentIds]]
      )
    : [];
  const momentsByChild = new Map(momentsToday.map((m) => [m.learner_id, m.count]));

  const participation = eventIds.length
    ? await ctx.db.many(
        `SELECT ap.*, l.first_name, l.last_name FROM activity_participation ap
         JOIN learners l ON l.id = ap.learner_id WHERE ap.scheduled_activity_id = ANY($1::uuid[])`,
        [eventIds]
      )
    : [];
  const participationByEvent = new Map();
  for (const row of participation) {
    const list = participationByEvent.get(row.scheduled_activity_id) || [];
    list.push({
      learnerId: row.learner_id,
      name: row.first_name + ' ' + row.last_name,
      status: row.participation_status,
      summary: row.observation_summary || null
    });
    participationByEvent.set(row.scheduled_activity_id, list);
  }

  const timeline = events.map((e) => {
    const plan = e.lesson_plan_id ? planById.get(e.lesson_plan_id) : null;
    const activity = e.activity_id ? activityById.get(e.activity_id) : null;
    const stepMeta = plan ? (stepsByPlan.get(plan.id) || { count: 0, total_minutes: 0 }) : null;
    let moduleCtx = null;
    if (plan && plan.module_id) {
      const m = moduleById.get(plan.module_id);
      const idx = m ? m.order.indexOf(plan.id) : -1;
      moduleCtx = {
        id: plan.module_id,
        title: plan.module_title || null,
        theme: plan.module_theme || null,
        position: idx >= 0 ? idx + 1 : (plan.module_position || null),
        total: m ? m.total : null
      };
    }
    const planObjectives = plan
      ? (Array.isArray(plan.objective_ids) ? plan.objective_ids : (plan.objective_ids || []))
          .map((oid) => objectiveById.get(oid)).filter(Boolean)
          .map((o) => ({ id: o.id, code: o.code, description: o.description, domain: o.domain_name || null }))
      : [];
    return {
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      status: e.status,
      classroomId: e.classroom_id || null,
      classroom: e.classroom_name || null,
      staffName: e.staff_name || null,
      notes: e.notes || null,
      lessonPlanId: e.lesson_plan_id || null,
      lessonPlanTitle: e.lesson_plan_title || (plan ? plan.title : null),
      activityId: e.activity_id || null,
      activity: activity ? {
        id: activity.id,
        title: activity.title,
        type: activity.activity_type || null,
        materials: activity.materials || null,
        safetyNotes: activity.safety_notes || null,
        durationMinutes: activity.duration_minutes || null,
        ageGroup: activity.age_group || null,
        description: activity.description || null
      } : null,
      plan: plan ? {
        id: plan.id,
        title: plan.title,
        theme: plan.theme || null,
        preparationNotes: plan.preparation_notes || null,
        deliveryNotes: plan.delivery_notes || null,
        status: plan.status,
        objectives: planObjectives
      } : null,
      module: moduleCtx,
      guide: plan ? {
        available: stepMeta.count > 0,
        stepCount: stepMeta.count,
        totalMinutes: stepMeta.total_minutes,
        interactive: interactiveByPlan.get(plan.id) || null,
        interactiveCount: (() => { const i = interactiveByPlan.get(plan.id); return i ? (i.poll + i.mcq + i.dragdrop + i.whiteboard) : 0; })(),
        firstInteractiveIndex: firstInteractiveByPlan.has(plan.id) ? firstInteractiveByPlan.get(plan.id) : null
      } : null,
      position: e.lesson_plan_id ? (positionByPlan.get(e.lesson_plan_id) || null) : null,
      momentsCaptured: (() => {
        const scope = e.classroom_id
          ? (morning.children || []).filter((c) => c.classroomId === e.classroom_id)
          : (morning.children || []);
        return { captured: scope.filter((c) => momentsByChild.has(c.id)).length, total: scope.length };
      })(),
      participation: participationByEvent.get(e.id) || []
    };
  });

  const reportRows = presentIds.size
    ? await ctx.db.many(
        `SELECT id, learner_id, shared_with_guardians, activities_summary, notes, mood
         FROM daily_reports WHERE organisation_id = $1 AND report_date = $2 AND learner_id = ANY($3::uuid[])`,
        [ctx.organisationId, today, Array.from(presentIds)]
      )
    : [];
  const reportByLearner = new Map(reportRows.map((r) => [r.learner_id, r]));
  const presentChildReports = presentChildren.map((c) => {
    const r = reportByLearner.get(c.id);
    return {
      id: c.id,
      name: c.name,
      firstName: c.firstName,
      classroom: c.classroom,
      classroomId: c.classroomId,
      avatarUrl: c.avatarUrl || null,
      reportId: r ? r.id : null,
      reportShared: r ? Boolean(r.shared_with_guardians) : false,
      reportStarted: Boolean(r),
      activitiesSummary: r ? (r.activities_summary || '') : '',
      notes: r ? (r.notes || '') : ''
    };
  });
  const reportsMissing = presentChildReports.filter((c) => !c.reportStarted).length;
  const reportsDraft = presentChildReports.filter((c) => c.reportStarted && !c.reportShared).length;

  const unfinishedBlocks = timeline.filter((e) => e.status !== 'completed' && e.status !== 'cancelled');
  const nextBlock = timeline.find((e) => e.status === 'scheduled' || e.status === 'in_progress') || null;

  const participated = participation.filter((p) => ['participated', 'partial'].includes(p.participation_status));
  const eventTitleById = new Map(timeline.map((e) => [e.id, e.title]));
  const activityByChild = new Map();
  for (const p of participated) {
    const list = activityByChild.get(p.learner_id) || [];
    const title = eventTitleById.get(p.scheduled_activity_id);
    if (title && !list.includes(title)) list.push(title);
    activityByChild.set(p.learner_id, list);
  }
  for (const c of presentChildReports) {
    c.todayActivities = activityByChild.get(c.id) || [];
  }

  const base = Object.assign({}, morning);
  delete base._ids;
  delete base._presence;
  delete base._assigned;
  return Object.assign(base, {
    date: today,
    timeline,
    nextBlock: nextBlock ? { id: nextBlock.id, title: nextBlock.title, startsAt: nextBlock.startsAt, status: nextBlock.status } : null,
    dailyReports: {
      presentCount: presentChildren.length,
      missing: reportsMissing,
      draft: reportsDraft,
      children: presentChildReports
    },
    wrapUp: {
      unfinishedBlocks: unfinishedBlocks.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, status: e.status })),
      unfinishedCount: unfinishedBlocks.length
    }
  });
}

const TODAY_PERMS = {
  permission: ['curriculum.create.daycare', 'assessments.create.assigned', 'attendance.record.assigned', 'attendance.record.daycare', 'staff_attendance.record.daycare', 'staff_attendance.record.own'],
  permissionMode: 'any'
};

function register(router) {
  router.get('/staff/morning', async (ctx) => {
    const morning = await buildMorning(ctx);
    const base = Object.assign({}, morning);
    delete base._ids;
    delete base._presence;
    delete base._assigned;
    return base;
  }, TODAY_PERMS);

  router.get('/staff/today', async (ctx) => {
    return buildToday(ctx);
  }, TODAY_PERMS);
}

module.exports = { register };
