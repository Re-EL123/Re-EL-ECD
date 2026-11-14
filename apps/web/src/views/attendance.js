'use strict';

/* Learner attendance register, live presence, reports and corrections. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const STATUSES = ['present', 'absent', 'late', 'excused', 'expected'];

  V.attendance = {
    async load(ctx) {
      const date = ctx.filters.date || R.today();
      const query = new URLSearchParams({ date });
      if (ctx.filters.classroomId) query.set('classroomId', ctx.filters.classroomId);
      if (ctx.filters.branchId) query.set('branchId', ctx.filters.branchId);
      const [register, presence, classrooms, adjustments, gateScans] = await Promise.all([
        R.api('GET', '/learner-attendance?' + query),
        ctx.has('attendance.read.daycare') ? R.api('GET', '/learner-attendance/current-presence').catch(() => ({ data: { present: 0, expected: 0, learners: [] } })) : Promise.resolve({ data: { present: 0, expected: 0, learners: [] } }),
        R.api('GET', '/classrooms').catch(() => ({ data: [] })),
        ctx.has('attendance.correct.daycare') ? R.api('GET', '/learner-attendance/adjustments').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        R.api('GET', '/gate/scans').then((p) => p.data).catch(() => ({ pending: [] }))
      ]);
      let reports = null;
      const from = ctx.filters.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const to = ctx.filters.to || R.today();
      if (ctx.tab === 'reports') {
        reports = await R.api('GET', '/learner-attendance/reports?from=' + from + '&to=' + to).then((p) => p.data).catch(() => null);
      }
      return { date, register: register.data, presence: presence.data, classrooms: classrooms.data || [], adjustments: adjustments.data || [], scans: gateScans.pending || [], reports, reportRange: { from, to } };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'register';
      const reg = page.register || { rows: [], summary: {} };
      const summary = reg.summary || {};
      const canRecord = ctx.has('attendance.record.daycare') || ctx.has('attendance.record.assigned');
      const range = page.reportRange || { from: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), to: R.today() };
      return R.pageHead('Learner attendance', 'The daily register, live presence and attendance patterns.',
        '<a class="btn btn-secondary btn-sm" href="#/app/learners">' + R.icon('users') + ' Learners</a>' + R.exportButtons('/exports/attendance', 'from=' + encodeURIComponent(range.from) + '&to=' + encodeURIComponent(range.to)) +
        (canRecord ? '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'register\')">' + R.icon('clipboard-list') + ' Record register</button>' +
          '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'markAllPresent\')">' + R.icon('check-check') + ' Mark all expected present</button>' : '')) +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Expected', value: R.number((reg.rows || []).length), icon: 'users', foot: R.date(page.date) }) +
        R.statCard({ label: 'Present', value: R.number(summary.present), icon: 'check-circle', foot: R.percent(summary.rate) + ' attendance' }) +
        R.statCard({ label: 'Absent', value: R.number(summary.absent), icon: 'user-x', tone: 'danger', foot: 'Including excused' }) +
        R.statCard({ label: 'Unmarked', value: R.number(summary.unmarked), icon: 'clipboard-list', tone: 'sun', foot: 'Still to record' }) +
        '</div>' +
        this.renderGatePanel(ctx, page) +
        R.tabs([{ key: 'register', label: 'Register' }, { key: 'presence', label: 'Live presence' }, { key: 'reports', label: 'Reports' }, { key: 'adjustments', label: 'Corrections' }], tab) +
        (tab === 'presence' ? this.renderPresence(page) : tab === 'reports' ? this.renderReports(page) : tab === 'adjustments' ? this.renderAdjustments(page) : this.renderRegister(ctx, page, canRecord));
    },

    renderGatePanel(ctx, page) {
      const scans = (page.scans || []).slice(0, 8);
      const refresh = '<button class="btn btn-ghost btn-sm" @click="navigate(true)">' + R.icon('refresh-cw') + ' Refresh</button>';
      if (!scans.length) {
        return '<div class="section"></div>' + R.card('Today at the gate', '<p class="muted small" style="margin:0 0 8px">No-one has tapped their way through the entrance yet. Parents and approved transport drivers sign in with the centre QR; the system shows their name here as soon as they arrive.</p>', refresh);
      }
      return '<div class="section"></div>' + R.card('Today at the gate', '<div class="stack" style="gap:8px">' +
        scans.map((scan) =>
          '<div class="row" style="gap:12px;align-items:center;padding:8px 10px;border:1px solid var(--border-subtle);border-radius:14px;background:var(--surface-2)">' +
            '<div class="avatar" style="width:48px;height:48px;font-size:1.1rem;background:var(--forest-100);color:var(--forest-700)">' + R.esc((scan.first_name || '?')[0].toUpperCase()) + '</div>' +
            '<div style="flex:1;min-width:0"><div class="strong" style="font-size:0.9rem">' + R.esc(scan.collector_name) + '</div>' +
            '<div class="muted small">' + R.esc(scan.first_name + ' ' + (scan.last_name || '')) + (scan.classroom_name ? ' · ' + R.esc(scan.classroom_name) : '') + (scan.collector_type === 'driver' || scan.collector_type === 'taxi' ? ' · driver' : '') + ' · signed in ' + R.time(scan.confirmed_at) + '</div></div>' +
            (scan.on_hold ? '<span class="badge badge-danger">Hold — blocked</span>' : '') +
            '<button class="btn btn-primary btn-sm" @click="releaseScan(\'' + R.attr(scan.id) + '\')" ' + (scan.on_hold || scan.check_out_at ? 'disabled' : '') + '>Release</button>' +
          '</div>').join('') +
        (scans.length > 8 ? '<div class="muted small" style="margin-top:4px">' + (scans.length - 8) + ' more…</div>' : '') +
      '</div>', refresh);
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
          { label: 'In by', render: (r) => {
              const needsFix = r.brought_by_unverified || !r.brought_by_name;
              const id = r.attendance_id;
              const childId = r.learner_id;
              const firstName = r.first_name;
              if (!needsFix) return '<span class="cell-strong">' + R.esc(r.brought_by_name) + '</span>';
              return '<div class="stack" style="gap:4px" x-data="{ open: false, loading: false, options: null, sel: \'\', busy: false, name: \'\' }">' +
                '<button type="button" class="btn btn-sm" style="justify-content:flex-start" @click="open = true; if (!options) { loading = true; window.Reel.api(\'GET\',\'/learner-attendance/bring-options/' + R.attr(childId) + '\').then(p => { options = p.data; loading = false; }); }">' +
                  R.icon('user-plus') + ' Who brought ' + R.esc(firstName) + '?' +
                '</button>' +
                '<div x-cloak x-show="open" style="border:1px solid var(--border-subtle);border-radius:14px;padding:10px;margin-top:4px">' +
                  '<div class="muted small" style="margin-bottom:6px">Who brought ' + R.esc(firstName) + '?</div>' +
                  '<div x-show="loading"><span class="spinner" style="width:14px;height:14px"></span></div>' +
                  '<template x-if="options"><div class="stack" style="gap:6px;max-height:240px;overflow:auto">' +
                    '<template x-for="g in options.guardians" :key="g.id">' +
                      '<label class="collector-pick" style="display:flex;gap:10px;align-items:center;padding:6px 8px;border:1px solid var(--border-subtle);border-radius:10px;cursor:pointer">' +
                        '<input type="radio" :value="\'g:\' + g.id" x-model="sel">' +
                        '<span class="strong" style="min-width:0;font-size:0.86rem" x-text="g.name"></span>' +
                        '<span class="badge badge-green" style="margin-left:auto">Guardian</span>' +
                      '</label>' +
                    '</template>' +
                    '<template x-for="c in options.collectors" :key="c.id">' +
                      '<label class="collector-pick" style="display:flex;gap:10px;align-items:center;padding:6px 8px;border:1px solid var(--border-subtle);border-radius:10px;cursor:pointer">' +
                        '<input type="radio" :value="\'c:\' + c.id" x-model="sel">' +
                        '<span class="strong" style="min-width:0;font-size:0.86rem" x-text="c.name"></span>' +
                        '<span class="badge badge-sky" style="margin-left:auto">List</span>' +
                      '</label>' +
                    '</template>' +
                    '<div class="divider" style="margin:6px 0"></div>' +
                    '<input class="input" type="text" placeholder="Someone else (name)" x-model="name">' +
                    '<div class="row" style="gap:6px;justify-content:flex-end">' +
                      '<button class="btn btn-ghost btn-sm" @click="open = false">Cancel</button>' +
                      '<button class="btn btn-primary btn-sm" :disabled="busy || (!sel && !name.trim())" @click="busy = true; const p = {}; if (sel && sel.startsWith(\'g:\')) p.broughtByGuardianId = sel.slice(2); else if (sel && sel.startsWith(\'c:\')) p.broughtByCollectorId = sel.slice(2); else p.broughtByName = name.trim(); window.Reel.api(\'PATCH\',\'/learner-attendance/record/' + R.attr(id) + '/bringer\', p).then(() => { toast(\'Bringer recorded.\'); navigate(true); }).catch((e) => { busy = false; toast(e.message || \'Could not save the bringer.\', \'error\'); })">Save</button>' +
                    '</div>' +
                  '</div></template>' +
                '</div>' +
              '</div>';
            } },
          { label: 'Status', render: (r) => r.attendance_status ? R.badge(r.attendance_status) : '<span class="badge badge-muted">Unmarked</span>' },
          { label: 'In', render: (r) => R.time(r.check_in_at) },
          { label: 'Out', render: (r) => R.time(r.check_out_at) },
          { label: 'Note', render: (r) => R.esc(r.absence_reason || '') },
          { label: '', align: 'right', render: (r) => {
            if (!canRecord) return '';
            if (!r.attendance_id) {
              return '<div class="stack" style="gap:6px;max-width:340px" x-data="{ open: false, loading: false, options: null, sel: \'\', name: \'\', busy: false }">' +
                '<div class="btn-group">' +
                  '<button class="btn btn-sm btn-primary" @click="open = true; if (!options) { loading = true; window.Reel.api(\'GET\',\'/learner-attendance/bring-options/' + R.attr(r.learner_id) + '\').then(p => { options = p.data; loading = false; }); }">In</button>' +
                  '<button class="btn btn-sm btn-secondary" @click="openViewModal(\'absence\',\'' + R.attr(r.learner_id) + '\')">Absent</button>' +
                '</div>' +
                '<div x-cloak x-show="open" style="border:1px solid var(--border-subtle);border-radius:14px;padding:10px">' +
                  '<div class="muted small" style="margin-bottom:6px">Who brought ' + R.esc(r.first_name) + '?</div>' +
                  '<div x-show="loading"><span class="spinner" style="width:14px;height:14px"></span></div>' +
                  '<template x-if="options"><div class="stack" style="gap:6px;max-height:280px;overflow:auto">' +
                    '<template x-for="g in options.guardians" :key="g.id">' +
                      '<label class="collector-pick" style="display:flex;gap:10px;align-items:center;padding:6px 8px;border:1px solid var(--border-subtle);border-radius:10px;cursor:pointer">' +
                        '<input type="radio" :value="\'g:\' + g.id" x-model="sel">' +
                        '<span class="strong" style="min-width:0;font-size:0.86rem" x-text="g.name"></span>' +
                        '<span class="badge badge-green" style="margin-left:auto">Guardian</span>' +
                      '</label>' +
                    '</template>' +
                    '<template x-for="c in options.collectors" :key="c.id">' +
                      '<label class="collector-pick" style="display:flex;gap:10px;align-items:center;padding:6px 8px;border:1px solid var(--border-subtle);border-radius:10px;cursor:pointer">' +
                        '<input type="radio" :value="\'c:\' + c.id" x-model="sel">' +
                        '<span class="strong" style="min-width:0;font-size:0.86rem" x-text="c.name"></span>' +
                        '<span class="badge badge-sky" style="margin-left:auto">List</span>' +
                      '</label>' +
                    '</template>' +
                    '<div class="divider" style="margin:6px 0"></div>' +
                    '<input class="input" type="text" placeholder="Someone else (unverified)" x-model="name">' +
                    '<div class="row" style="gap:6px;justify-content:flex-end">' +
                      '<button class="btn btn-ghost btn-sm" @click="open = false">Cancel</button>' +
                      '<button class="btn btn-primary btn-sm" :disabled="busy || (!sel && !name.trim())" @click="busy = true; const p = { learnerId: \'' + R.attr(r.learner_id) + '\' }; if (sel && sel.startsWith(\'g:\')) p.broughtByGuardianId = sel.slice(2); else if (sel && sel.startsWith(\'c:\')) p.broughtByCollectorId = sel.slice(2); else p.broughtByName = name.trim(); window.Reel.api(\'POST\',\'/learner-attendance/check-in\', p).then(() => { toast(\'' + R.attr(r.first_name) + ' in.\'); navigate(true); }).catch((e) => { busy = false; toast(e.message || \'Could not check in.\', \'error\'); })">Confirm</button>' +
                    '</div>' +
                  '</div></template>' +
                '</div>' +
              '</div>';
            }
            if (r.check_in_at && !r.check_out_at) {
              // Release only where a verified gate scan is waiting — the
              // register has no silent check-out path.
              const pendingScan = (page.scans || []).find((s) => s.learner_id === r.learner_id);
              if (pendingScan) {
                return '<button class="btn btn-sm btn-primary" @click="releaseScan(\'' + R.attr(pendingScan.id) + '\')" ' + (pendingScan.on_hold ? 'disabled' : '') + '>' + R.icon('shield-check') + ' Release</button>';
              }
              return '<span class="muted small">Waiting on the gate QR</span>';
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
          '<div class="muted small">' + R.esc(l.classroom_name || '') + ' · in at ' + R.time(l.check_in_at) + (l.brought_by_name ? ' · with <strong>' + R.esc(l.brought_by_name) + '</strong>' + (l.brought_by_unverified ? ' <span style="color:var(--danger)">(unverified)</span>' : '') : '') + '</div></div>' +
          '<span class="dot"></span></div>').join('') + '</div>' : R.emptyState('No children checked in', 'Check children in from the register as they arrive.', '<a class="btn btn-secondary" href="#/app/learner-attendance">Open register</a>', 'users')) +
        '</div><div class="stack">' +
        R.card('Today at a glance', '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Present</span><span class="kpi-value">' + R.number(p.present) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Expected</span><span class="kpi-value">' + R.number(p.expected) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Not yet arrived</span><span class="kpi-value">' + Math.max(0, Number(p.expected || 0) - Number(p.present || 0)) + '</span></div>' +
          '</div>') +
        R.card('Collection', '<p class="muted small">Children leave through the collection gate — whoever releases them there has been verified. Parents are told instantly.</p>' +
          '<a class="btn btn-primary btn-sm" href="#/app/learner-attendance">Go to the register</a>') +
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
      if (name === 'markAllPresent') {
        ctx.openModal({
          title: 'Mark all expected present — unverified',
          description: 'Every child on the register today will be marked present without a recorded adult walking them in. Use this only if the queue was too long to field everyone — then open each row and set the actual bringer on the register afterwards.',
          endpoint: '/learner-attendance/register',
          method: 'POST',
          submitLabel: 'Mark all unverified',
          successMessage: 'Marked — update bringers on the register before the gate.',
          fields: [
            { name: 'date', label: 'Date', type: 'date', required: true, value: (ctx.page || {}).date || R.today() },
            { name: 'status', label: 'Status', type: 'select', span: 2, value: 'present', options: ['present'] }
          ],
          transform: (data) => {
            const rows = ((ctx.page && ctx.page.register && ctx.page.register.rows) || []).filter((r) => !r.attendance_id);
            return {
              date: data.date,
              records: rows.map((r) => ({ learnerId: r.learner_id, status: 'present' }))
            };
          }
        });
        return;
      }
      if (name === 'register') {
        const rows = ((ctx.page.register || {}).rows || []).map((r) => ({
          id: r.learner_id, first_name: r.first_name, last_name: r.last_name, classroom_name: r.classroom_name
        }));
        ctx.openModal({
          title: 'Record register',
          endpoint: '/learner-attendance/register',
          submitLabel: 'Save register',
          size: 'wide',
          description: 'Choose the children and one status for the whole group. Children already marked are updated.',
          fields: [
            { name: 'date', label: 'Date', type: 'date', required: true, value: (ctx.page || {}).date || R.today() },
            { name: 'status', label: 'Status', type: 'select', required: true, value: 'present', options: STATUSES.map((s) => ({ value: s, label: R.titleCase(s) })) },
            { name: 'learnerIds', label: 'Children', type: 'multiselect', span: 2, required: true, options: R.learnerOptions(rows), placeholder: 'Search children…', help: 'Select one, several or every child in the register.' }
          ],
          transform: (data) => ({
            date: data.date,
            records: (data.learnerIds || []).map((learnerId) => ({ learnerId, status: data.status }))
          })
        });
      } else if (name === 'absence' && id) {
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
