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
        const ringRow = (label, pct) => {
          const value = Math.max(0, Math.min(100, Number(pct) || 0));
          return '<div class="metric-bar"><span>' + R.esc(label) + '</span><div class="bar"><span style="width:' + Math.max(2, value) + '%"></span></div><span class="val">' + R.number(value) + '%</span></div>';
        };
        return R.pageHead('Good day, ' + ctx.session.user.displayName.split(' ')[0], 'Your classroom, your shift and what needs attention today.') +
          R.card('Start your day',
            '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">' +
              '<div class="row" style="gap:8px;flex-wrap:wrap">' +
                '<span class="badge ' + ((morning.expected || 0) === (morning.present || 0) && (morning.expected || 0) > 0 ? 'badge-green' : 'badge-sun') + '">' + R.number(morning.present || 0) + ' of ' + R.number(morning.expected || 0) + ' in today</span>' +
                ((morning.absentees || []).length ? '<span class="badge badge-danger">' + (morning.absentees.length) + ' away</span>' : '') +
                (unfinished.draftObservations ? '<span class="badge badge-sun">' + unfinished.draftObservations + ' drafts</span>' : '') +
                (unfinished.reportsPendingSignoff ? '<span class="badge badge-sky">' + unfinished.reportsPendingSignoff + ' reports to share</span>' : '') +
                (unfinished.tasksDueToday ? '<span class="badge badge-plum">' + unfinished.tasksDueToday + ' tasks today</span>' : '') +
              '</div>' +
              ((morning.unmarkedIds || []).length
                ? '<button class="btn btn-secondary btn-sm" @click="markMorningAllPresent()">' + R.icon('check-check') + ' Mark all expected present (' + morning.unmarkedIds.length + ')</button>'
                : '<span class="badge badge-green">Register done</span>') +
              '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'quickMoment\')">' + R.icon('camera') + ' Moment</button>' +
            '</div>' +
            (focusChildren.length
              ? '<div class="section"></div><div class="muted small" style="margin-bottom:6px">Children who could use an observation today:</div><div class="stack">' +
                  focusChildren.map((child) => '<div class="row" style="gap:10px;justify-content:space-between;padding:8px 10px;background:var(--surface-2);border-radius:12px">' +
                    '<div class="row" style="gap:10px;min-width:0"><span class="avatar avatar-xs">' + R.esc((String(child.name || '?')[0] || '?').toUpperCase()) + '</span><div style="min-width:0"><div class="strong" style="font-size:0.88rem">' + R.esc(child.name) + '</div><div class="muted small">' + R.esc(child.classroom || 'Not in a classroom yet') + ' · no observation in 30 days</div></div></div>' +
                    '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'observationFor\',\'' + R.attr(child.id) + '\')">' + R.icon('plus') + ' Observe</button></div>').join('') +
                '</div>'
              : '') +
            ((morning.unverifiedDropoffs || []).length
              ? '<div class="alert alert-sun" style="margin:14px 0;align-items:center">' + R.icon('user-plus') + '<div style="flex:1"><strong>Who brought these children?</strong><div class="muted small">' + (morning.unverifiedDropoffs || []).map((d) => '<strong>' + R.esc(d.childFirst) + '</strong> — ' + R.esc(d.broughtByName)).join(' · ') + '</div></div><a class="btn btn-sm btn-secondary" href="#/app/learner-attendance">Confirm on the register</a></div>'
              : '') +
            ((morning.deniedToday || []).length
              ? '<div class="alert alert-danger" style="margin:14px 0;align-items:center">' + R.icon('alert-triangle') + '<div style="flex:1"><strong>Pickup blocked today</strong><div class="muted small">' +
                  morning.deniedToday.map((d) => R.esc(d.collectorName) + ' was turned away for ' + R.esc(d.childFirst) + (d.reason ? ' — ' + R.esc(d.reason) : '')).join(' · ') + '</div></div></div>'
              : '') +
        (absentees.length
              ? '<div class="section"></div><div class="muted small" style="margin-bottom:6px">Away today:</div><div class="row" style="gap:8px;flex-wrap:wrap">' + absentees.map((a) => '<span class="badge badge-danger">' + R.esc(a.name) + (a.reason ? ' · ' + R.esc(R.truncate(a.reason, 40)) : '') + '</span>').join('') + '</div>'
              : '') +
            '<div class="section"></div><div class="muted small" style="margin-bottom:6px">Moments this week — one per child keeps families close:</div>' +
            '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">' +
              ((morning.moments && morning.moments.children) || []).map((child) =>
                '<span class="badge ' + (child.done ? 'badge-green' : 'badge-muted') + '" style="gap:6px">' + (child.done ? '✓ ' : '○ ') + R.esc(child.firstName || child.name) + '</span>').join('') +
              (morning.moments && morning.moments.streak ? '<span class="badge badge-sun">🔥 ' + R.number(morning.moments.streak) + ' week streak</span>' : '') +
              (morning.moments && morning.moments.allDone ? '<span class="badge badge-sky">Every child seen this week</span>' : '') +
            '</div>' +
            ((morning.unopened || []).length
              ? '<div class="section"></div><div class="muted small" style="margin-bottom:6px">Waiting to be seen — mention these at pickup:</div><div class="stack">' +
                  (morning.unopened || []).map((u) => '<div class="row" style="gap:10px;justify-content:space-between;padding:8px 10px;background:var(--surface-2);border-radius:12px">' +
                    '<div style="min-width:0"><span class="strong" style="font-size:0.86rem">' + R.esc(u.guardianFirst) + (u.childName ? ' · ' + R.esc(u.childName) : '') + '</span><div class="muted small">' + R.esc(R.truncate(u.detail || '', 90)) + '</div></div>' +
                    '<span class="badge ' + (u.kind === 'digest' ? 'badge-sky' : 'badge-sun') + '">' + (u.kind === 'digest' ? 'Digest' : 'New') + '</span></div>').join('') +
                  '</div>'
              : '') +
            ((morning.reactions || []).length
              ? '<div class="section"></div><div class="muted small" style="margin-bottom:6px">Loved by families this week:</div><div class="stack">' +
                  (morning.reactions || []).map((r) => {
                    const emoji = r.reaction === 'heart' ? '❤️' : r.reaction === 'thumb' ? '👍' : '💬';
                    const verb = r.reaction === 'more' ? 'wants to know more about' : r.reaction === 'heart' ? 'loved' : 'gave a thumbs-up to';
                    return '<div class="row" style="gap:10px;padding:8px 10px;background:var(--surface-2);border-radius:12px">' +
                      '<span style="font-size:1.1rem">' + emoji + '</span>' +
                      '<div style="min-width:0"><div class="strong" style="font-size:0.86rem">' + R.esc(r.guardianFirst || r.guardianName) + ' ' + verb + ' ' + R.esc(r.childFirst) + '’s moment</div>' +
                      (r.detail ? '<div class="muted small">' + R.esc(R.truncate(r.detail, 80)) + '</div>' : '') + '</div></div>';
                  }).join('') + '</div>'
              : '') +
            '<div class="section"></div><div class="grid grid-2">' +
              '<div class="card" style="margin:0"><h4 style="margin-top:0;margin-bottom:8px">Your rhythm this month</h4>' +
                ringRow('Register filed today', rings.registerPct) +
                ringRow('Observations published', rings.observationsPublishedPct) +
                ringRow('Daily reports this week', rings.dailyReportsPct) +
              '</div>' +
              '<div class="card" style="margin:0"><h4 style="margin-top:0;margin-bottom:8px">Jump straight to</h4><div class="stack">' +
                '<a class="btn btn-secondary btn-sm" href="#/app/learner-attendance">' + R.icon('calendar-check') + ' Take today’s register</a>' +
                '<a class="btn btn-secondary btn-sm" href="#/app/assessments">' + R.icon('clipboard-list') + ' Record an observation</a>' +
                '<a class="btn btn-secondary btn-sm" href="#/app/collection-gate">' + R.icon('shield-check') + ' The collection gate</a>' +
                '<a class="btn btn-secondary btn-sm" href="#/app/learners">' + R.icon('users') + ' Daily reports</a>' +
                '<a class="btn btn-secondary btn-sm" href="#/app/calendar">' + R.icon('calendar-days') + ' Today’s activities</a>' +
              '</div></div>' +
            '</div>') +
          '<div class="grid grid-4 section">' +
          R.statCard({ label: 'My shift', value: shift ? R.time(shift.starts_at) + ' – ' + R.time(shift.ends_at) : 'No shift', icon: 'calendar-clock', tone: 'sky', foot: shift ? R.esc(R.titleCase(shift.status)) + ' · ' + R.esc(shift.branch_name || '') : 'Speak to your manager' }) +
          R.statCard({ label: 'Clock status', value: R.titleCase(status), icon: 'fingerprint', tone: status === 'on_site' ? 'green' : 'sun', foot: '<span class="dot ' + (status === 'on_site' ? '' : 'warn') + '"></span> ' + (me.today ? me.today.length + ' events today' : 'No events yet') }) +
          R.statCard({ label: 'Children present', value: String(presenceRows.filter((p) => p.check_in_at).length), icon: 'users', tone: 'clay', foot: presenceRows.length + ' expected today' }) +
          R.statCard({ label: 'Open tasks', value: String(tasks.length), icon: 'list-checks', tone: 'plum', foot: tasks.filter((t) => t.priority === 'high' || t.priority === 'urgent').length + ' high priority' }) +
          '</div>' +
          '<div class="split section"><div class="stack">' +
          R.card('Today\'s schedule', upcoming.length ? '<div class="timeline">' + upcoming.map((event) => '<div class="timeline-item"><div class="t-time">' + R.time(event.starts_at || event.start_time) + ' · ' + R.esc(event.classroom_name || '') + '</div><div class="t-title">' + R.esc(event.title) + '</div><div class="t-body">' + R.esc(R.titleCase(event.status || 'scheduled')) + '</div></div>').join('') + '</div>' : R.emptyState('A clear day', 'No activities are scheduled for today.', '<a class="btn btn-secondary" href="#/app/calendar">Open calendar</a>', 'calendar-days'), '<a class="btn btn-sm btn-ghost" href="#/app/calendar">Calendar ' + R.icon('arrow-right') + '</a>') +
          R.card('My tasks', R.table({ compact: true, rows: tasks.slice(0, 6), columns: [
            { label: 'Task', render: (t) => '<span class="cell-strong">' + R.esc(t.title) + '</span><span class="cell-sub">' + R.esc(R.titleCase(t.status)) + '</span>' },
            { label: 'Priority', render: (t) => '<span class="badge ' + R.priorityTone(t.priority) + '">' + R.esc(t.priority) + '</span>' },
            { label: 'Due', render: (t) => R.date(t.due_at) },
            { label: '', align: 'right', render: (t) => '<button class="btn btn-sm btn-secondary" @click="act(\'PATCH\',\'/tasks/' + R.attr(t.id) + '\',{status:\'done\'},{successMessage:\'Task completed\'})">Done</button>' }
          ] })) +
          '</div><div class="stack">' +
          R.card('Classroom presence', '<div style="position:relative;height:190px"><canvas id="teacher-attendance"></canvas></div><div class="kpi-list" style="margin-top:10px"><div class="kpi-row"><span class="kpi-label">Expected</span><span class="kpi-value">' + presenceRows.length + '</span></div><div class="kpi-row"><span class="kpi-label">Checked in</span><span class="kpi-value">' + presenceRows.filter((p) => p.check_in_at).length + '</span></div></div>') +
          R.card('Clock in and out', '<div class="stack"><div class="muted small">Record your attendance against today\'s shift.</div><div class="btn-group">' +
            '<button class="btn btn-primary btn-sm" @click="act(\'POST\',\'/staff-attendance/clock-in\',{},{successMessage:\'Clocked in\'})">Clock in</button>' +
            '<button class="btn btn-secondary btn-sm" @click="act(\'POST\',\'/staff-attendance/break-start\',{},{successMessage:\'Break started\'})">Break</button>' +
            '<button class="btn btn-secondary btn-sm" @click="act(\'POST\',\'/staff-attendance/break-end\',{},{successMessage:\'Break ended\'})">End break</button>' +
            '<button class="btn btn-secondary btn-sm" @click="act(\'POST\',\'/staff-attendance/clock-out\',{},{successMessage:\'Clocked out\'})">Clock out</button></div></div>') +
          '</div></div>';
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
