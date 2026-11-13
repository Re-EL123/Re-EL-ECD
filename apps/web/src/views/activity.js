'use strict';

/* Staff impact: who is teaching and who needs a nudge. */
(function () {
  const R = window.Reel;
  const V = R.views;

  V.staffActivity = {
    async load(ctx) {
      const from = ctx.filters.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = ctx.filters.to || R.today();
      const query = new URLSearchParams({ from, to });
      const data = await R.api('GET', '/staff/activity-summary?' + query.toString())
        .then((p) => p.data)
        .catch(() => ({ staff: [], classrooms: [], totals: {}, own: false }));
      return Object.assign({ from, to }, data || {});
    },

    render(ctx, params, page) {
      const staff = page.staff || [];
      const classrooms = page.classrooms || [];
      const totals = page.totals || {};
      const own = Boolean(page.own);
      const avgObs = staff.length ? Math.round((totals.observations || 0) / staff.length) : 0;
      const classroomCoverage = classrooms.map((c) => ({
        name: c.name,
        enrolled: Number(c.enrolled) || 0,
        observed: Number(c.observed) || 0,
        coverage: Number(c.enrolled) ? Math.round((Number(c.observed) / Number(c.enrolled)) * 100) : 0,
        reported: Number(c.reported) || 0,
        registerDays: Number(c.register_days) || 0,
        atRisk: Number(c.at_risk) || 0
      }));
      const heatTone = (n) => (n === 0 ? 'badge-danger' : n === 1 ? 'badge-sun' : n < 5 ? 'badge-sun' : 'badge-green');
      return R.pageHead('Staff impact', own
          ? 'Your teaching impact this month.'
          : 'How the centre is teaching, not just running — contribution per person and coverage per classroom.',
        (own ? '' : R.exportButtons('/exports/staff-impact', 'from=' + encodeURIComponent(page.from) + '&to=' + encodeURIComponent(page.to))) +
        '<button class="btn btn-secondary btn-sm" @click="navigate(true)">' + R.icon('refresh-cw') + ' Refresh</button>') +
        '<div class="section"></div>' +
        '<div class="filter-bar">' +
          '<label class="small muted">From</label><input class="input" type="date" value="' + R.attr(page.from) + '" @change="setFilter(\'from\',$event.target.value)">' +
          '<label class="small muted">To</label><input class="input" type="date" value="' + R.attr(page.to) + '" @change="setFilter(\'to\',$event.target.value)">' +
        '</div>' +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Observations', value: R.number(totals.observations), icon: 'clipboard-list', tone: 'sky', foot: R.number(totals.observationsPublished) + ' published · ' + R.number(avgObs) + ' per teacher' }) +
        R.statCard({ label: 'Daily reports', value: R.number(totals.dailyReports), icon: 'notebook-pen', tone: 'plum', foot: 'Sent to families this month' }) +
        R.statCard({ label: 'Attendance rows', value: R.number(totals.attendanceRows), icon: 'calendar-check', tone: 'sun', foot: 'Recorded by the team' }) +
        R.statCard({ label: 'Classrooms', value: R.number(classrooms.length), icon: 'door-open', tone: 'green', foot: classrooms.filter((c) => Number(c.at_risk) > 0).length + ' with children at risk' }) +
        '</div>' +
        R.card('Classroom coverage', R.table({ rows: classroomCoverage, columns: [
          { label: 'Classroom', render: (c) => '<span class="cell-strong">' + R.esc(c.name) + '</span>' },
          { label: 'Enrolled', align: 'right', render: (c) => R.number(c.enrolled) },
          { label: 'Observed', render: (c) => '<div class="metric-bar"><span>' + R.number(c.observed) + '/' + R.number(c.enrolled) + '</span><div class="bar"><span style="width:' + Math.max(2, c.coverage) + '%"></span></div><span class="val">' + c.coverage + '%</span></div>' },
          { label: 'Reported', align: 'right', render: (c) => R.number(c.reported) },
          { label: 'Register days', align: 'right', render: (c) => R.number(c.registerDays) },
          { label: 'At risk', render: (c) => c.atRisk ? '<span class="badge badge-danger">' + R.number(c.atRisk) + '</span>' : '<span class="badge badge-green">0</span>' }
        ], emptyTitle: 'No classrooms', emptyMessage: 'Create classrooms to see coverage here.' }), '<span class="badge badge-muted">30 days</span>') +
        '<div class="section"></div>' +
        R.card('Teacher contribution', R.table({ rows: staff, columns: [
          { label: 'Staff member', render: (s) => '<span class="cell-strong">' + R.esc(s.name) + '</span><span class="cell-sub">' + R.esc(s.job_title || s.employee_reference || '') + '</span>' },
          { label: 'Classrooms', align: 'right', render: (s) => R.number(s.classrooms || s.classroom_links) },
          { label: 'Observations', render: (s) => '<span class="' + heatTone(Number(s.observations)) + '">' + R.number(s.observations) + '</span>' },
          { label: 'Published', align: 'right', render: (s) => R.number(s.observations_published) },
          { label: 'Daily reports', render: (s) => '<span class="' + heatTone(Number(s.daily_reports)) + '">' + R.number(s.daily_reports) + '</span>' },
          { label: 'Register rows', align: 'right', render: (s) => R.number(s.attendance_rows) }
        ], emptyTitle: 'No staff in this range', emptyMessage: 'Teachers who joined this month will appear here.' })) +
        '<div class="alert alert-info" style="margin-top:14px">' + R.icon('info') + '<span>Low numbers are a signal to support, not to punish — a teacher with three observations might be waiting on time, training or a smaller class. Ask before you assume.</span></div>';
    }
  };
})();
