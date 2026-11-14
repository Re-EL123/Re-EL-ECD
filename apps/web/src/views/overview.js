'use strict';

(function () {
  const R = window.Reel;
  const V = R.views;

  V.overview = {
    async load(ctx) {
      const data = { date: R.today() };
      const settled = await Promise.allSettled([
        ctx.has('reports.read.daycare') ? R.api('GET', '/dashboard') : Promise.resolve(null),
        R.api('GET', '/tasks?status=open'),
        R.api('GET', '/notifications?pageSize=6').catch(() => null),
        ctx.has(['staff_attendance.read.assigned', 'staff_attendance.read.daycare', 'staff_attendance.record.own'])
          ? R.api('GET', '/staff-attendance/me').catch(() => null) : Promise.resolve(null),
        ctx.has('attendance.read.daycare') ? R.api('GET', '/learner-attendance/current-presence').catch(() => null) : Promise.resolve(null),
        ctx.has('curriculum.read.daycare')
          ? R.api('GET', '/curriculum/calendar?from=' + R.today() + '&to=' + R.today()).catch(() => null) : Promise.resolve(null),
        ctx.has(['curriculum.create.daycare', 'assessments.create.assigned', 'attendance.record.assigned', 'staff_attendance.record.own', 'attendance.record.own'])
          ? R.api('GET', '/staff/morning').catch(() => null) : Promise.resolve(null)
      ]);
      const [dashboard, tasks, notifications, myAttendance, presence, calendar, morning] = settled;
      data.dashboard = dashboard.status === 'fulfilled' && dashboard.value ? dashboard.value.data : null;
      data.tasks = tasks.status === 'fulfilled' ? tasks.value.data : [];
      data.notifications = notifications.status === 'fulfilled' && notifications.value ? notifications.value.data : [];
      data.myAttendance = myAttendance.status === 'fulfilled' && myAttendance.value ? myAttendance.value.data : null;
      data.presence = presence.status === 'fulfilled' && presence.value ? presence.value.data : [];
      data.calendar = calendar.status === 'fulfilled' && calendar.value ? calendar.value.data : [];
      data.morning = morning.status === 'fulfilled' && morning.value ? morning.value.data : null;
      data.canDashboard = ctx.has('reports.read.daycare');
      return data;
    },

    render(ctx, params, page) {
      const d = page.dashboard || {};
      const finance = d.finance || {};
      const attendance = d.attendance || {};
      const learners = d.learners || {};
      const tasks = page.tasks || [];
      const upcoming = d.upcoming || page.calendar || [];
      const alerts = d.alerts || [];
      const isTeacher = !page.canDashboard;

      if (isTeacher) {
        const me = page.myAttendance || {};
        const shift = me.shift;
        const status = me.status || 'not_clocked_in';
        const presenceRows = page.presence || [];
        ctx.chart('teacher-attendance', 'doughnut', {
          labels: ['Present', 'Not yet arrived'],
          datasets: [{ data: [presenceRows.filter((p) => p.attendance_status === 'present' || p.check_in_at).length, Math.max(0, presenceRows.length - presenceRows.filter((p) => p.attendance_status === 'present' || p.check_in_at).length)], backgroundColor: ['#3A7D44', '#E8E3D8'], borderWidth: 0 }]
        }, { cutout: '68%' });
        const morning = page.morning || {};
        const rings = morning.rings || {};
const focusChildren = morning.focusChildren || [];
      const absentees = morning.absentees || [];
      const unfinished = morning.unfinished || {};
      const pendingReleases = (morning.gateScans || []).length || 0;
      const urgent = (unfinished.tasksDueToday || 0) + (unfinished.draftObservations || 0) + (unfinished.reportsPendingSignoff || 0) + pendingReleases + focusChildren.length + (morning.unverifiedDropoffs || []).length + ((morning.unopened || []).length);
      return R.pageHead('Good day, ' + ctx.session.user.displayName.split(' ')[0], urgent ? 'Here is what actually needs you today.' : 'Nothing needs you right now — go teach.') +
          (urgent ?
            '<div class="grid grid-4 section">' +
              (focusChildren.length ? R.statCard({ label: 'Watch', value: R.number(focusChildren.length), icon: 'eye', tone: 'sun', foot: 'children flagged by you' }) : '') +
              (pendingReleases ? R.statCard({ label: 'Release', value: R.number(pendingReleases), icon: 'door-open', tone: 'sun', foot: 'waiting at the gate' }) : '') +
              (unfinished.draftObservations ? R.statCard({ label: 'Drafts', value: R.number(unfinished.draftObservations), icon: 'pen-tool', tone: 'sun', foot: 'unfinished observations' }) : '') +
              (unfinished.reportsPendingSignoff ? R.statCard({ label: 'Sign off', value: R.number(unfinished.reportsPendingSignoff), icon: 'check-check', tone: 'sky', foot: 'reports awaiting share' }) : '') +
            '</div>' +
            '<div class="section"></div>' +
            ((focusChildren.length) ?
              '<div class="muted small" style="margin-bottom:6px">Children who could use an observation today:</div><div class="stack">' +
                focusChildren.map((child) => '<div class="row" style="gap:10px;justify-content:space-between;padding:8px 10px;background:var(--surface-2);border-radius:12px">' +
                  '<div class="row" style="gap:10px;min-width:0"><span class="avatar avatar-xs">' + R.esc((String(child.name || '?')[0] || '?').toUpperCase()) + '</span><div style="min-width:0"><div class="strong" style="font-size:0.88rem">' + R.esc(child.name) + '</div><div class="muted small">' + R.esc(child.classroom || 'Not in a classroom yet') + ' · no observation in 30 days</div></div></div>' +
                  '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'observationFor\',\'' + R.attr(child.id) + '\')">' + R.icon('plus') + ' Observe</button></div>').join('') + '</div><div class="section"></div>'
              : '') +
            ((morning.gateScans || []).length
              ? '<div class="muted small" style="margin-bottom:6px">Waiting at the gate — verified, needing your release:</div><div class="stack">' +
                  (morning.gateScans || []).map((s) => '<div class="row" style="gap:10px;justify-content:space-between;padding:8px 10px;background:var(--surface-2);border-radius:12px">' +
                    '<div style="min-width:0"><span class="strong" style="font-size:0.86rem">' + R.esc(s.collectorName) + '</span><div class="muted small">' + R.esc(s.childFirst) + (s.classroom ? ' · ' + R.esc(s.classroom) : '') + ' · signed in ' + R.time(s.confirmedAt) + (s.onHold ? ' · hold at reception' : '') + '</div></div>' +
                    '<span class="badge ' + (s.onHold ? 'badge-danger' : 'badge-sun') + '">' + (s.onHold ? 'Hold' : 'Release needed') + '</span></div>').join('') +
                  '<a class="btn btn-sm btn-secondary" href="#/app/learner-attendance" style="align-self:flex-start">' + R.icon('arrow-right') + ' Release on the register</a></div><div class="section"></div>'
              : '') +
            ((morning.unverifiedDropoffs || []).length
              ? '<div class="alert alert-sun" style="margin:0 0 14px;align-items:center">' + R.icon('user-plus') + '<div style="flex:1"><strong>Who brought these?</strong><div class="muted small">' +
                  (morning.unverifiedDropoffs || []).map((d) => '<strong>' + R.esc(d.childFirst) + '</strong> — ' + R.esc(d.broughtByName)).join(' · ') + '</div></div><a class="btn btn-sm btn-secondary" href="#/app/learner-attendance">Fix on register</a></div>'
              : '') +
            ((absentees.length)
              ? '<div class="muted small" style="margin-bottom:6px">Away today:</div><div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:14px">' + absentees.map((a) => '<span class="badge badge-danger">' + R.esc(a.name) + (a.reason ? ' · ' + R.esc(R.truncate(a.reason, 40)) : '') + '</span>').join('') + '</div>'
              : '') +
            ((morning.unopened || []).length
              ? '<div class="muted small" style="margin-bottom:6px">Families who opened nothing yet:</div><div class="stack">' +
                  (morning.unopened || []).map((u) => '<div class="row" style="gap:10px;justify-content:space-between;padding:8px 10px;background:var(--surface-2);border-radius:12px">' +
                    '<div style="min-width:0"><span class="strong" style="font-size:0.86rem">' + R.esc(u.guardianFirst) + '</span><div class="muted small">' + R.esc(R.truncate(u.detail || '', 80)) + '</div></div>' +
                    '<span class="badge ' + (u.kind === 'digest' ? 'badge-sky' : 'badge-sun') + '">' + (u.kind === 'digest' ? 'Digest' : 'New') + '</span></div>').join('') +
                  '</div>'
              : '') +
            (unfinished.tasksDueToday
              ? '<div class="section"></div><div class="muted small" style="margin-bottom:6px">Tasks due today (' + unfinished.tasksDueToday + '):</div>' +
                R.table({ compact: true, rows: (tasks || []).filter((t) => t.due_at === R.today()).slice(0, 5), columns: [
                  { label: 'Task', render: (t) => '<span class="cell-strong">' + R.esc(t.title) + '</span>' },
                  { label: '', align: 'right', render: (t) => '<button class="btn btn-sm btn-secondary" @click="act(\'PATCH\',\'/tasks/' + R.attr(t.id) + '\',{status:\'done\'},{successMessage:\'Done\'})">Done</button>' }
                ] }) +
                '<div class="section"></div>'
              : '') +
            (absentees.length || (morning.unopened || []).length || focusChildren.length || (morning.unverifiedDropoffs || []).length ? ' ' : '')
          : '<div class="alert alert-success" style="align-items:center;margin-top:8px">' + R.icon('sparkles') + '<div style="flex:1"><strong>Nothing is waiting for you.</strong> Enjoy the classroom.</div></div>');
      }

      const trend = d.attendanceTrend || [];
      const revenue = d.revenueByMonth || [];
      ctx.chart('attendance-trend', 'line', {
        labels: trend.map((t) => new Date(t.attendance_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })),
        datasets: [
          { label: 'Present', data: trend.map((t) => t.present), borderColor: '#3A7D44', backgroundColor: 'rgba(58,125,68,0.12)', fill: true, tension: 0.35, pointRadius: 2 },
          { label: 'Marked', data: trend.map((t) => t.marked), borderColor: '#E89A2B', backgroundColor: 'transparent', borderDash: [4, 4], tension: 0.35, pointRadius: 0 }
        ]
      });
      ctx.chart('revenue-chart', 'bar', {
        labels: revenue.map((r) => r.month),
        datasets: [
          { label: 'Invoiced', data: revenue.map((r) => r.invoiced), backgroundColor: '#A8D5AE', borderRadius: 6 },
          { label: 'Collected', data: revenue.map((r) => r.collected), backgroundColor: '#3A7D44', borderRadius: 6 }
        ]
      });

      return R.pageHead('Good day, ' + ctx.session.user.displayName.split(' ')[0], 'Here is what is happening across ' + R.esc(ctx.activeMembership.organisation.name) + ' on ' + R.date(d.date || R.today()) + '.',
        '<button class="btn btn-secondary btn-sm" @click="navigate(true)">' + R.icon('refresh-cw') + ' Refresh</button>' +
        (ctx.has('learners.create.daycare') ? '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'learner\')">' + R.icon('user-plus') + ' Add learner</button>' : '')) +
        (alerts.length ? '<div class="stack" style="margin-bottom:18px">' + alerts.map((a) => '<div class="alert ' + (a.severity === 'critical' || a.severity === 'warning' ? 'alert-warn' : 'alert-info') + '">' + R.icon('info') + '<span>' + R.esc(a.message) + '</span>' + (a.link ? '<a class="btn btn-sm btn-ghost row-end" href="' + R.attr(a.link) + '">Open</a>' : '') + '</div>').join('') + '</div>' : '') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Enrolled learners', value: R.number(learners.enrolled), icon: 'users', foot: learners.waitlisted ? learners.waitlisted + ' waitlisted' : 'All places confirmed' }) +
        R.statCard({ label: 'Attendance today', value: R.percent(attendance.rate), icon: 'calendar-check', tone: 'sky', foot: (attendance.present || 0) + ' present · ' + (attendance.absent || 0) + ' absent' }) +
        R.statCard({ label: 'Outstanding fees', value: R.money(finance.outstanding), icon: 'wallet', tone: 'clay', foot: 'Collected today ' + R.money(finance.collected) }) +
        R.statCard({ label: 'Open incidents', value: R.number((d.incidents || {}).total), icon: 'shield-alert', tone: (d.incidents || {}).total ? 'danger' : 'green', foot: 'Health and safety register' }) +
        '</div>' +
        '<div class="split section"><div class="stack">' +
        R.card('Attendance trend', '<div style="position:relative;height:270px"><canvas id="attendance-trend"></canvas></div>', '<a class="btn btn-sm btn-ghost" href="#/app/learner-attendance">Open register ' + R.icon('arrow-right') + '</a>') +
        R.card('Revenue and collections', '<div style="position:relative;height:250px"><canvas id="revenue-chart"></canvas></div>', '<a class="btn btn-sm btn-ghost" href="#/app/finance">Finance ' + R.icon('arrow-right') + '</a>') +
        R.card('Tasks needing attention', tasks.length ? '<div class="stack">' + tasks.slice(0, 6).map((t) => '<div class="row" style="gap:10px;align-items:flex-start"><span class="badge ' + R.priorityTone(t.priority) + '">' + R.esc(t.priority) + '</span><div style="flex:1;min-width:0"><div class="strong" style="font-size:0.88rem">' + R.esc(t.title) + '</div><div class="muted small">' + R.esc(t.assignee_name || 'Unassigned') + ' · due ' + R.date(t.due_at) + '</div></div><button class="btn btn-sm btn-secondary" @click="act(\'PATCH\',\'/tasks/' + R.attr(t.id) + '\',{status:\'done\'},{successMessage:\'Task completed\'})">Done</button></div>').join('') + '</div>' : R.emptyState('No open tasks', 'Everything assigned is complete.', '', 'check-circle'), '<a class="btn btn-sm btn-ghost" href="#/app/tasks">All tasks ' + R.icon('arrow-right') + '</a>') +
        '</div><div class="stack">' +
        R.card('Coming up', upcoming.length ? '<div class="timeline">' + upcoming.map((event) => '<div class="timeline-item"><div class="t-time">' + R.time(event.starts_at) + ' · ' + R.esc(event.classroom_name || '') + '</div><div class="t-title">' + R.esc(event.title) + '</div><div class="t-body">' + R.esc(R.titleCase(event.status || 'scheduled')) + '</div></div>').join('') + '</div>' : R.emptyState('Nothing scheduled', 'The calendar is clear for now.', '<a class="btn btn-sm btn-secondary" href="#/app/calendar">Open calendar</a>', 'calendar'), '<a class="btn btn-sm btn-ghost" href="#/app/calendar">Calendar ' + R.icon('arrow-right') + '</a>') +
        R.card('At a glance', '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Staff on record</span><span class="kpi-value">' + R.number((d.staff || {}).total) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Applications in progress</span><span class="kpi-value">' + R.number((d.applications || {}).total) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Published observations</span><span class="kpi-value">' + R.number((d.observations || {}).total) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Unread notifications</span><span class="kpi-value">' + R.number(ctx.unread) + '</span></div>' +
          '</div>') +
        R.card('Latest notifications', (page.notifications || []).length ? '<ul class="list-clean">' + page.notifications.map((n) => '<li><span class="dot ' + (n.read_at ? 'muted' : '') + '"></span><div style="flex:1"><div class="strong" style="font-size:0.86rem">' + R.esc(n.title) + '</div><div class="muted small">' + R.esc(R.truncate(n.body, 90)) + '</div><div class="muted" style="font-size:0.72rem">' + R.relative(n.created_at) + '</div></div></li>').join('') + '</ul>' : R.emptyState('All caught up', 'No notifications right now.', '', 'bell'), '<a class="btn btn-sm btn-ghost" href="#/app/communications">Open ' + R.icon('arrow-right') + '</a>') +
        '</div></div>';
    },

    openModal(ctx, name, id) {
      if (name === 'observationFor' && id) {
        Promise.all([
          R.api('GET', '/curriculum/objectives').then((p) => p.data).catch(() => []),
          R.api('GET', '/learners?pageSize=200').then((p) => p.data).catch(() => []),
          R.api('GET', '/templates?kind=observation').then((p) => (p.data && p.data.data) || []).catch(() => [])
        ]).then(([objectives, learners, observationTemplates]) => {
          V.assessments.observationModal({ ...ctx, page: Object.assign({}, ctx.page || {}, { objectives, learners, observationTemplates }) }, id);
        });
        return;
      }
      if (name === 'quickMoment') {
        const children = ((((ctx.page || {}).morning || {}).children) || []);
        const options = children.map((child) => ({ value: child.id, label: child.name + (child.classroom ? ' · ' + child.classroom : '') }));
        R.api('GET', '/curriculum/domains').then((p) => p.data).catch(() => []).then((domains) => {
          ctx.openModal({
            title: 'Capture a moment',
            description: 'One photo, one tag, one sentence — the family sees it in moments.',
            endpoint: '/assessments/quick-moments',
            submitLabel: 'Share with the family',
            successMessage: 'Moment shared — the family will see it shortly.',
            fields: [
              { name: 'learnerId', label: 'Child', type: 'select', required: true, options },
              { name: 'domainId', label: 'What was it about? (optional)', type: 'select', options: (domains || []).map((d) => ({ value: d.id, label: d.name })), placeholder: 'Pick the domain it showed' },
              { name: 'photoUrls', label: 'Photo', type: 'media', multiple: true, accept: 'image/*', capture: 'environment', scope: 'observation', ownerType: 'learner', ownerId: options.length === 1 ? options[0].value : undefined },
              { name: 'note', label: 'One sentence', type: 'textarea', span: 2, placeholder: 'Mia comforted a new friend at snack and was our kindness star.', help: 'Leave blank and we will write “Captured a lovely moment in the classroom.”' }
            ]
          });
        });
        return;
      }
      if (name === 'learner') {
        ctx.openModal({
          title: 'Add a learner',
          endpoint: '/learners',
          submitLabel: 'Create learner',
          fields: [
            { name: 'firstName', label: 'First name', required: true },
            { name: 'lastName', label: 'Last name', required: true },
            { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
            { name: 'branchId', label: 'Branch', type: 'select', required: true, options: ctx.branches.map((b) => ({ value: b.id, label: b.name })) },
            { name: 'gender', label: 'Gender', type: 'select', options: ['female', 'male', 'other', 'prefer not to say'] },
            { name: 'homeLanguage', label: 'Home language' },
            { name: 'enrolmentDate', label: 'Enrolment date', type: 'date', value: R.today() },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
          ]
        });
      } else if (name === 'task') {
        ctx.openModal({ title: 'New task', endpoint: '/tasks', submitLabel: 'Create task', fields: [
          { name: 'title', label: 'Task title', required: true, span: 2 },
          { name: 'description', label: 'Description', type: 'textarea', span: 2 },
          { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'], value: 'medium' },
          { name: 'dueAt', label: 'Due date', type: 'date' }
        ] });
      }
    }
  };
})();
