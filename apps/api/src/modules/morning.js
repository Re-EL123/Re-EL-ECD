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
