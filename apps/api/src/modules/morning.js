'use strict';

/**
 * The teacher's morning cockpit: everything a teacher needs in the first five
 * minutes of the day in one call — register state, today's absences, the
 * children who most need an observation, and how the month is going.
 */

const { assignedClassroomIds } = require('./helpers');

function register(router) {
  router.get('/staff/morning', async (ctx) => {
    const assigned = await assignedClassroomIds(ctx);
    const scoped = assigned.length > 0;
    const learnerRows = await ctx.db.many(
      scoped
        ? `SELECT l.id, l.first_name, l.last_name, l.classroom_id, c.name AS classroom_name
           FROM learners l LEFT JOIN classrooms c ON c.id = l.classroom_id
           WHERE l.organisation_id = $1 AND l.status = 'enrolled' AND l.classroom_id = ANY($2::uuid[])`
        : `SELECT l.id, l.first_name, l.last_name, l.classroom_id, c.name AS classroom_name
           FROM learners l LEFT JOIN classrooms c ON c.id = l.classroom_id
           WHERE l.organisation_id = $1 AND l.status = 'enrolled'`,
      scoped ? [ctx.organisationId, assigned] : [ctx.organisationId]
    );
    const ids = learnerRows.map((row) => row.id);
    const expected = ids.length;
    const today = new Date().toISOString().slice(0, 10);

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
      classroom: row.classroom_name || null,
      reason: (presence.find((presenceRow) => presenceRow.learner_id === row.id) || {}).absence_reason || null
    }));

    const focusChildren = ids.length
      ? await ctx.db.many(
          `SELECT l.id, l.first_name, l.last_name, l.classroom_id, c.name AS classroom_name,
                  MAX(o.observation_date) AS last_observation
           FROM learners l
           LEFT JOIN classrooms c ON c.id = l.classroom_id
           LEFT JOIN learner_observations o
             ON o.learner_id = l.id AND o.assessment_status IN ('published','amended')
           WHERE l.organisation_id = $1 AND l.id = ANY($2::uuid[])
           GROUP BY l.id, l.first_name, l.last_name, l.classroom_id, c.name
           HAVING MAX(o.observation_date) IS NULL OR MAX(o.observation_date) < CURRENT_DATE - interval '30 days'
           ORDER BY MAX(o.observation_date) ASC NULLS FIRST, l.first_name
           LIMIT 4`,
          [ctx.organisationId, ids]
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
           WHERE organisation_id = $1 AND report_date >= CURRENT_DATE - interval '2 days'
             AND shared_with_guardians = false AND learner_id = ANY($2::uuid[])`,
          [ctx.organisationId, ids]
        )
      : { count: 0 };
    const tasksDueToday = await ctx.db.one(
      `SELECT COUNT(*)::int AS count FROM tasks
       WHERE organisation_id = $1 AND assigned_to = $2 AND due_at = CURRENT_DATE
         AND status IN ('open','in_progress','blocked')`,
      [ctx.organisationId, ctx.user.id]
    );

    const children = learnerRows.map((row) => ({
      id: row.id,
      name: row.first_name + ' ' + row.last_name,
      firstName: row.first_name,
      classroom: row.classroom_name || null
    }));

    const momentsThisWeek = ids.length
      ? await ctx.db.many(
          `SELECT learner_id, COUNT(*)::int AS count
           FROM learner_observations
           WHERE organisation_id = $1 AND learner_id = ANY($2::uuid[])
             AND assessment_status IN ('published','amended')
             AND date_trunc('week', observation_date) = date_trunc('week', CURRENT_DATE)
           GROUP BY learner_id`,
          [ctx.organisationId, ids]
        )
      : [];
    const momentMap = new Map(momentsThisWeek.map((row) => [row.learner_id, row.count]));
    const momentsChildren = children.map((child) => ({
      ...child,
      thisWeek: momentMap.get(child.id) || 0,
      done: (momentMap.get(child.id) || 0) >= 1
    }));
    // Streak: consecutive weeks where EVERY assigned child had ≥1 moment.
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
        detail: 'Hasn’t opened this week’s digest yet',
        sharedAt: null
      }))
    ].slice(0, 5);

    const deniedToday = ids.length
      ? await ctx.db.many(
          `SELECT l.first_name AS child_first, ce.collector_name, ce.denial_reason, ce.recorded_at
           FROM learner_collection_events ce
           JOIN learners l ON l.id = ce.learner_id
           WHERE ce.organisation_id = $1 AND ce.learner_id = ANY($2::uuid[])
             AND ce.event_type = 'denied' AND ce.recorded_at::date = CURRENT_DATE
           ORDER BY ce.recorded_at DESC`,
          [ctx.organisationId, ids]
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
             AND date_trunc('month', observation_date) = date_trunc('month', CURRENT_DATE)`,
          [ctx.organisationId, ids]
        )
      : { count: 0 };
    const reportsThisWeek = ids.length
      ? await ctx.db.one(
          `SELECT COUNT(DISTINCT learner_id)::int AS count FROM daily_reports
           WHERE organisation_id = $1 AND learner_id = ANY($2::uuid[])
             AND report_date >= date_trunc('week', CURRENT_DATE)`,
          [ctx.organisationId, ids]
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
        classroom: row.classroom_name || null,
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
      }
    };
  }, { permission: ['curriculum.create.daycare', 'assessments.create.assigned', 'attendance.record.assigned', 'attendance.record.own', 'staff_attendance.record.assigned', 'staff_attendance.record.own'], permissionMode: 'any' });
}

module.exports = { register };
