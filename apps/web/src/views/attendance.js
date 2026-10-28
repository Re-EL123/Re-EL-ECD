'use strict';

/* Learner attendance register, live presence, reports and corrections. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const STATUSES = ['present', 'absent', 'late', 'excused', 'expected', 'collected'];

  V.attendance = {
    async load(ctx) {
      const date = ctx.filters.date || R.today();
      const query = new URLSearchParams({ date });
      if (ctx.filters.classroomId) query.set('classroomId', ctx.filters.classroomId);
      if (ctx.filters.branchId) query.set('branchId', ctx.filters.branchId);
      const [register, presence, classrooms, adjustments] = await Promise.all([
        R.api('GET', '/learner-attendance?' + query),
        ctx.has('attendance.read.daycare') ? R.api('GET', '/learner-attendance/current-presence').catch(() => ({ data: { present: 0, expected: 0, learners: [] } })) : Promise.resolve({ data: { present: 0, expected: 0, learners: [] } }),
        R.api('GET', '/classrooms').catch(() => ({ data: [] })),
        ctx.has('attendance.correct.daycare') ? R.api('GET', '/learner-attendance/adjustments').catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
      ]);
      let reports = null;
      const from = ctx.filters.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const to = ctx.filters.to || R.today();
      if (ctx.tab === 'reports') {
        reports = await R.api('GET', '/learner-attendance/reports?from=' + from + '&to=' + to).then((p) => p.data).catch(() => null);
      }
      return { date, register: register.data, presence: presence.data, classrooms: classrooms.data || [], adjustments: adjustments.data || [], reports, reportRange: { from, to } };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'register';
      const reg = page.register || { rows: [], summary: {} };
      const summary = reg.summary || {};
      const canRecord = ctx.has('attendance.record.daycare') || ctx.has('attendance.record.assigned');
      return R.pageHead('Learner attendance', 'The daily register, live presence and attendance patterns.',
        '<a class="btn btn-secondary btn-sm" href="#/app/learners">' + R.icon('users') + ' Learners</a>' +
        (canRecord ? '<button class="btn btn-primary btn-sm" @click="markAllPresent()">' + R.icon('check-check') + ' Mark all present</button>' : '')) +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Expected', value: R.number((reg.rows || []).length), icon: 'users', foot: R.date(page.date) }) +
        R.statCard({ label: 'Present', value: R.number(summary.present), icon: 'check-circle', foot: R.percent(summary.rate) + ' attendance' }) +
        R.statCard({ label: 'Absent', value: R.number(summary.absent), icon: 'user-x', tone: 'danger', foot: 'Including excused' }) +
        R.statCard({ label: 'Unmarked', value: R.number(summary.unmarked), icon: 'clipboard-list', tone: 'sun', foot: 'Still to record' }) +
        '</div>' +
        R.tabs([{ key: 'register', label: 'Register' }, { key: 'presence', label: 'Live presence' }, { key: 'reports', label: 'Reports' }, { key: 'adjustments', label: 'Corrections' }], tab) +
        (tab === 'presence' ? this.renderPresence(page) : tab === 'reports' ? this.renderReports(page) : tab === 'adjustments' ? this.renderAdjustments(page) : this.renderRegister(ctx, page, canRecord));
    },

    renderRegister(ctx, page, canRecord) {
      const reg = page.register || { rows: [] };
      return R.filterBar(
        '<label class="small muted">Date</label><input class="input" type="date" value="' + R.attr(page.date) + '" @change="setFilter(\'date\',$event.target.value)">' +
        R.selectFilter(ctx, 'classroomId', (page.classrooms || []).map((c) => ({ value: c.id, label: c.name })), 'All classrooms') +
        R.selectFilter(ctx, 'branchId', R.branchOptions(ctx), 'All branches')) +
        R.table({ rows: reg.rows || [], columns: [
          { label: 'Child', render: (r) => '<a class="cell-strong" href="#/app/learners/' + R.attr(r.learner_id) + '">' + R.esc(r.first_name + ' ' + r.last_name) + '</a><span class="cell-sub mono">' + R.esc(r.learner_reference) + '</span>' },
          { label: 'Classroom', render: (r) => R.esc(r.classroom_name || '—') },
          { label: 'Status', render: (r) => r.attendance_status ? R.badge(r.attendance_status) : '<span class="badge badge-muted">Unmarked</span>' },
          { label: 'In', render: (r) => R.time(r.check_in_at) },
          { label: 'Out', render: (r) => R.time(r.check_out_at) },
          { label: 'Note', render: (r) => R.esc(r.absence_reason || '') },
          { label: '', align: 'right', render: (r) => {
            if (!canRecord) return '';
            if (!r.attendance_id) {
              return '<div class="btn-group">' +
                '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/learner-attendance/check-in\',{learnerId:\'' + R.attr(r.learner_id) + '\'},{successMessage:\'Checked in\'})">Check in</button>' +
                '<button class="btn btn-sm btn-secondary" @click="openViewModal(\'absence\',\'' + R.attr(r.learner_id) + '\')">Absent</button></div>';
            }
            if (r.check_in_at && !r.check_out_at) {
              return '<button class="btn btn-sm btn-secondary" @click="act(\'POST\',\'/learner-attendance/check-out\',{learnerId:\'' + R.attr(r.learner_id) + '\'},{successMessage:\'Checked out\'})">Check out</button>';
            }
            return '<span class="muted small">' + (r.check_out_at ? 'Collected' : 'Recorded') + '</span>';
          } }
        ], emptyTitle: 'No children to show', emptyMessage: 'Adjust the date or filters, or enrol a learner first.' });
    },

    renderPresence(page) {
      const p = page.presence || {};
      const learners = p.learners || [];
      return '<div class="split"><div class="stack">' +
        R.card('On site now', learners.length ? '<div class="grid grid-2">' + learners.map((l) =>
          '<div class="row" style="gap:10px;padding:10px;border:1px solid var(--border-subtle);border-radius:12px">' +
          '<div class="avatar">' + R.initials(l.first_name + ' ' + l.last_name) + '</div>' +
          '<div style="flex:1;min-width:0"><div class="strong" style="font-size:0.88rem">' + R.esc(l.first_name + ' ' + l.last_name) + '</div>' +
          '<div class="muted small">' + R.esc(l.classroom_name || '') + ' · in at ' + R.time(l.check_in_at) + '</div></div>' +
          '<span class="dot"></span></div>').join('') + '</div>' : R.emptyState('No children checked in', 'Check children in from the register as they arrive.', '<a class="btn btn-secondary" href="#/app/learner-attendance">Open register</a>', 'users')) +
        '</div><div class="stack">' +
        R.card('Today at a glance', '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Present</span><span class="kpi-value">' + R.number(p.present) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Expected</span><span class="kpi-value">' + R.number(p.expected) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Not yet arrived</span><span class="kpi-value">' + Math.max(0, Number(p.expected || 0) - Number(p.present || 0)) + '</span></div>' +
          '</div>') +
        R.card('Collection safety', '<p class="muted small">Only authorised collectors may collect a child. Record each collection against the child profile so there is a clear chain of custody.</p>' +
          '<a class="btn btn-secondary btn-sm" href="#/app/learners">Open learner profiles</a>') +
        '</div></div>';
    },

    renderReports(page) {
      const rep = page.reports;
      if (!rep) return R.emptyState('No report data', 'Choose a date range to see attendance patterns.', '', 'bar-chart-3');
      const range = page.reportRange || { from: R.today(), to: R.today() };
      return R.filterBar(
        '<label class="small muted">From</label><input class="input" type="date" value="' + R.attr(range.from) + '" @change="setFilter(\'from\',$event.target.value)">' +
        '<label class="small muted">To</label><input class="input" type="date" value="' + R.attr(range.to) + '" @change="setFilter(\'to\',$event.target.value)">') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Attendance rate', value: R.percent(rep.attendanceRate), icon: 'percent', foot: R.date(rep.from) + ' – ' + R.date(rep.to) }) +
        R.statCard({ label: 'Present', value: R.number((rep.totals || {}).present), icon: 'check-circle', tone: 'sky' }) +
        R.statCard({ label: 'Absent', value: R.number((rep.totals || {}).absent), icon: 'user-x', tone: 'danger' }) +
        R.statCard({ label: 'Excused', value: R.number((rep.totals || {}).excused), icon: 'shield-check', tone: 'sun' }) +
        '</div>' +
        '<div class="split"><div class="stack">' +
        R.card('By day', R.table({ rows: rep.byDay || [], compact: true, columns: [
          { label: 'Date', render: (d) => R.date(d.attendance_date) },
          { label: 'Marked', align: 'right', render: (d) => R.number(d.marked) },
          { label: 'Present', align: 'right', render: (d) => R.number(d.present) },
          { label: 'Absent', align: 'right', render: (d) => R.number(d.absent) },
          { label: 'Rate', align: 'right', render: (d) => R.percent(d.marked ? (d.present / d.marked) * 100 : 0) }
        ] })) +
        '</div><div class="stack">' +
        R.card('By classroom', R.table({ rows: rep.byClassroom || [], compact: true, columns: [
          { label: 'Classroom', render: (c) => R.esc(c.classroom_name) },
          { label: 'Present', align: 'right', render: (c) => R.number(c.present) },
          { label: 'Marked', align: 'right', render: (c) => R.number(c.marked) },
          { label: 'Rate', align: 'right', render: (c) => R.percent(c.marked ? (c.present / c.marked) * 100 : 0) }
        ] })) +
        R.card('Definition', '<p class="muted small">' + R.esc(rep.definition || 'Attendance rate is present days divided by marked days for enrolled learners.') + '</p>') +
        '</div></div>';
    },

    renderAdjustments(page) {
      return R.card('Attendance corrections', R.table({ rows: page.adjustments || [], columns: [
        { label: 'Child', render: (a) => R.esc((a.first_name || '') + ' ' + (a.last_name || '')) + '<span class="cell-sub">' + R.date(a.attendance_date) + '</span>' },
        { label: 'Reason', render: (a) => R.esc(R.truncate(a.reason, 80)) },
        { label: 'Requested by', render: (a) => R.esc(a.requested_by_name || '—') },
        { label: 'Status', render: (a) => R.badge(a.status) },
        { label: '', align: 'right', render: (a) => a.status === 'pending' ? '<div class="btn-group">' +
          '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/learner-attendance/adjustments/' + R.attr(a.id) + '/approve\',{decision:\'approved\'},{successMessage:\'Adjustment approved\'})">Approve</button>' +
          '<button class="btn btn-sm btn-danger" @click="act(\'POST\',\'/learner-attendance/adjustments/' + R.attr(a.id) + '/approve\',{decision:\'rejected\'},{successMessage:\'Adjustment rejected\'})">Reject</button></div>' : '' }
      ], emptyTitle: 'No corrections', emptyMessage: 'Requests to change a recorded register appear here for approval.' }));
    },

    openModal(ctx, name, id) {
      if (name === 'absence' && id) {
        const learner = ((ctx.page.register || {}).rows || []).find((r) => r.learner_id === id) || {};
        ctx.openModal({ title: 'Report absence', endpoint: '/learner-attendance/absence', submitLabel: 'Record absence', fields: [
          { name: 'learnerId', label: 'Child', type: 'hidden', value: id },
          { name: 'date', label: 'Date', type: 'date', value: (ctx.page || {}).date || R.today(), required: true },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true, span: 2, placeholder: 'Unwell, family emergency…' },
          { name: 'excused', label: 'Excused absence', type: 'checkbox', value: false, help: 'Count as an excused absence' }
        ] });
      }
    }
  };
})();
