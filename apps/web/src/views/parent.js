'use strict';

/* Parent portal: a family's view of their children, progress, money and messages. */
(function () {
  const R = window.Reel;
  const V = R.views;

  function childLabel(child) {
    return (child.firstName || '') + ' ' + (child.lastName || '');
  }

  function selectedChild(ctx, children) {
    const id = ctx.filters.childId;
    return (children || []).find((c) => c.id === id) || (children || [])[0] || null;
  }

  V.parentOverview = {
    async load(ctx) {
      const payload = await R.api('GET', '/parent/overview').then((p) => p.data).catch(() => ({}));
      return payload || {};
    },

    render(ctx, params, page) {
      const children = page.children || [];
      const announcements = page.announcements || [];
      const forms = page.forms || [];
      const name = (ctx.session.user.displayName || '').split(' ')[0];
      return R.pageHead('Hello, ' + name, 'Everything about your family, in one calm place.',
        '<a class="btn btn-secondary btn-sm" href="#/parent/messages">' + R.icon('message-circle') + ' Messages</a>' +
        '<a class="btn btn-primary btn-sm" href="#/parent/attendance">' + R.icon('calendar-plus') + ' Report absence</a>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Children', value: R.number(children.length), icon: 'users', foot: 'In our care' }) +
        R.statCard({ label: 'Unread', value: R.number(page.unread), icon: 'bell', tone: Number(page.unread) ? 'sun' : 'green', foot: 'Notifications for you' }) +
        R.statCard({ label: 'Outstanding', value: R.money(children.reduce((sum, c) => sum + Number(c.outstandingBalance || 0), 0)), icon: 'wallet', tone: children.some((c) => Number(c.outstandingBalance) > 0) ? 'clay' : 'green', foot: 'Across your children' }) +
        R.statCard({ label: 'Forms to complete', value: R.number(forms.length), icon: 'clipboard-list', tone: 'plum', foot: 'Published by the centre' }) +
        '</div>' +
        '<div class="split section"><div class="stack">' +
        children.map((c) => R.card(childLabel(c),
          '<div class="row" style="margin-bottom:10px">' +
          R.badge(c.status) +
          (c.classroom ? '<span class="badge badge-sky">' + R.esc(c.classroom.name) + '</span>' : '') +
          '<span class="muted small">' + R.esc(R.ageYears(c.dateOfBirth)) + ' old</span></div>' +
          '<div class="detail-list">' +
          R.detailItem('Today', c.attendanceToday ? R.titleCase(c.attendanceToday.attendance_status) : 'Not marked yet') +
          R.detailItem('Checked in', c.attendanceToday && c.attendanceToday.check_in_at ? R.time(c.attendanceToday.check_in_at) : '—') +
          R.detailItem('Balance', R.money(c.outstandingBalance)) +
          R.detailItem('Latest observation', c.latestObservation ? R.date(c.latestObservation.observation_date) : 'None yet') +
          '</div>',
          '<a class="btn btn-sm btn-secondary" href="#/parent/children/' + R.attr(c.id) + '">Open profile</a>')).join('') +
        (children.length ? '' : R.emptyState('No children linked', 'Ask the centre to link your account to your child.', '', 'users')) +
        '</div><div class="stack">' +
        R.card('Latest news', announcements.length ? '<div class="stack">' + announcements.map((a) => '<div><div class="strong" style="font-size:0.9rem">' + R.esc(a.title) + '</div><div class="muted small">' + R.relative(a.published_at) + '</div><p class="muted small" style="white-space:pre-wrap;margin-top:4px">' + R.esc(R.truncate(a.body, 160)) + '</p></div>').join('') + '</div>' : '<p class="muted small">No announcements right now.</p>', '<a class="btn btn-sm btn-ghost" href="#/parent/activities">All updates ' + R.icon('arrow-right') + '</a>') +
        R.card('Forms waiting for you', forms.length ? '<div class="stack">' + forms.map((f) => '<div class="row" style="justify-content:space-between"><span>' + R.esc(f.name) + '</span><a class="btn btn-sm btn-secondary" href="#/parent/forms">Open</a></div>').join('') + '</div>' : '<p class="muted small">Nothing to complete.</p>') +
        '</div></div>';
    }
  };

  V.parentChildren = {
    async load() {
      const children = await R.api('GET', '/parent/children').then((p) => p.data).catch(() => []);
      return { children: children || [] };
    },

    render(ctx, params, page) {
      const children = page.children || [];
      return R.pageHead('My children', 'Profiles, classrooms and the people who care for them.') +
        '<div class="grid grid-3 section">' + children.map((c) => R.card(childLabel(c),
          '<div class="row" style="margin-bottom:8px">' + R.badge(c.status) +
          (c.canReceiveReports ? '<span class="badge badge-green">Reports shared</span>' : '<span class="badge badge-muted">Reports not shared</span>') + '</div>' +
          '<div class="detail-list">' +
          R.detailItem('Reference', '<span class="mono">' + R.esc(c.learnerReference) + '</span>') +
          R.detailItem('Age', R.esc(R.ageYears(c.dateOfBirth))) +
          R.detailItem('Relationship', R.esc(c.relationship || '—')) +
          '</div>',
          '<a class="btn btn-sm btn-primary" href="#/parent/children/' + R.attr(c.id) + '">Open profile</a>')).join('') + '</div>' +
        (children.length ? '' : R.emptyState('No children linked', 'Contact the centre if a child is missing.', '', 'users'));
    }
  };

  V.parentChild = {
    async load(ctx, params) {
      const child = await R.api('GET', '/parent/children/' + encodeURIComponent(params.id))
        .then((p) => p.data).catch(() => null);
      const settled = await Promise.allSettled([
        R.api('GET', '/parent/children/' + encodeURIComponent(params.id) + '/progress').then((p) => p.data),
        R.api('GET', '/parent/children/' + encodeURIComponent(params.id) + '/portfolio').then((p) => p.data),
        R.api('GET', '/parent/children/' + encodeURIComponent(params.id) + '/assessments').then((p) => p.data),
        R.api('GET', '/parent/children/' + encodeURIComponent(params.id) + '/daily-reports').then((p) => p.data)
      ]);
      return {
        child,
        progress: settled[0].status === 'fulfilled' ? settled[0].value : null,
        portfolio: settled[1].status === 'fulfilled' ? settled[1].value : [],
        assessments: settled[2].status === 'fulfilled' ? settled[2].value : [],
        reports: settled[3].status === 'fulfilled' ? settled[3].value : []
      };
    },

    render(ctx, params, page) {
      const child = page.child;
      if (!child) return R.emptyState('Child not found', 'This profile is not available to your account.', '<a class="btn btn-secondary" href="#/parent/children">Back to my children</a>', 'user-x');
      const learner = child.learner || {};
      const classroom = child.classroom || {};
      const branch = child.branch || {};
      const relationship = child.relationship || {};
      const attendance = child.attendance || [];
      const tab = ctx.tab || 'overview';
      return R.pageHead(childLabel(learner), 'Profile, progress and the everyday record for your child.',
        '<a class="btn btn-secondary btn-sm" href="#/parent/attendance">' + R.icon('calendar-plus') + ' Report absence</a>' +
        '<a class="btn btn-primary btn-sm" href="#/parent/messages">' + R.icon('message-circle') + ' Message the centre</a>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Classroom', value: classroom.name || 'Not assigned', icon: 'door-open', foot: R.esc(branch.name || '') }) +
        R.statCard({ label: 'Age', value: R.ageYears(learner.dateOfBirth), icon: 'cake', tone: 'sky', foot: 'Born ' + R.date(learner.dateOfBirth) }) +
        R.statCard({ label: 'Attendance', value: R.number(attendance.filter((a) => ['present', 'late', 'collected'].includes(a.attendance_status)).length), icon: 'calendar-check', tone: 'green', foot: 'Days recorded in the last 14' }) +
        R.statCard({ label: 'Balance', value: R.money(child.outstandingBalance), icon: 'wallet', tone: Number(child.outstandingBalance) ? 'clay' : 'green', foot: 'Outstanding fees' }) +
        '</div>' +
        R.tabs([{ key: 'overview', label: 'Overview' }, { key: 'progress', label: 'Development' }, { key: 'portfolio', label: 'Portfolio' }, { key: 'reports', label: 'Daily reports' }], tab) +
        (tab === 'progress' ? this.renderProgress(page) : tab === 'portfolio' ? this.renderPortfolio(page) : tab === 'reports' ? this.renderReports(page) : this.renderOverview(child, relationship));
    },

    renderOverview(child, relationship) {
      const learner = child.learner || {};
      const branch = child.branch || {};
      const attendance = child.attendance || [];
      const medical = child.medical || [];
      return '<div class="split"><div class="stack">' +
        R.card('Attendance record', R.table({ rows: attendance, compact: true, columns: [
          { label: 'Date', render: (a) => R.date(a.attendance_date) },
          { label: 'Status', render: (a) => R.badge(a.attendance_status) },
          { label: 'In', render: (a) => a.check_in_at ? R.time(a.check_in_at) : '—' },
          { label: 'Out', render: (a) => a.check_out_at ? R.time(a.check_out_at) : '—' },
          { label: 'Reason', render: (a) => R.esc(a.absence_reason || '') }
        ], emptyTitle: 'No attendance yet', emptyMessage: 'Attendance appears once the centre marks the register.' })) +
        R.card('Medical notes shared with you', medical.length ? '<div class="stack">' + medical.map((m) => '<div class="detail-item"><div class="d-label">' + R.esc(R.titleCase(m.record_type)) + '</div><div style="white-space:pre-wrap">' + R.esc(m.details) + '</div></div>').join('') + '</div>' : '<p class="muted small">No medical notes have been shared.</p>') +
        '</div><div class="stack">' +
        R.card('Your relationship', '<div class="detail-list">' +
          R.detailItem('Relationship', R.esc(relationship.type || '—')) +
          R.detailItem('Can collect', R.esc(relationship.canCollect ? 'Yes' : 'No')) +
          R.detailItem('Receives reports', R.esc(relationship.canReceiveReports ? 'Yes' : 'No')) +
          R.detailItem('Receives financial information', R.esc(relationship.canReceiveFinancialInformation ? 'Yes' : 'No')) +
          '</div>') +
        R.card('The centre', '<div class="detail-list">' +
          R.detailItem('Branch', R.esc(branch.name || '—')) +
          R.detailItem('Address', R.esc(branch.address || '—')) +
          R.detailItem('Email', R.esc(branch.contact_email || '—')) +
          R.detailItem('Phone', R.esc(branch.contact_phone || '—')) +
          '</div>') +
        R.card('Enrolment', '<div class="detail-list">' +
          R.detailItem('Reference', '<span class="mono">' + R.esc(learner.learnerReference || '—') + '</span>') +
          R.detailItem('Status', R.badge(learner.status || '—')) +
          R.detailItem('Enrolled', R.date(learner.enrolmentDate)) +
          '</div>') +
        '</div></div>';
    },

    renderProgress(page) {
      const progress = page.progress;
      if (!progress) return R.emptyState('Progress not shared', 'The centre has not enabled progress reports for your account.', '', 'lock');
      const domains = progress.domains || [];
      const assessments = page.assessments || [];
      return '<div class="grid grid-2 section">' + domains.map((d) => {
        const pct = d.total ? Math.round((d.observed / d.total) * 100) : 0;
        return R.card(d.name,
          '<div class="metric-bar"><span>Observed</span><div class="bar"><span style="width:' + pct + '%"></span></div><span class="val">' + d.observed + '/' + d.total + '</span></div>' +
          '<div class="stack" style="margin-top:10px">' + (d.objectives || []).slice(0, 8).map((o) =>
            '<div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border-subtle)">' +
            '<span style="font-size:0.84rem">' + R.esc(o.description) + '</span>' +
            (o.observed ? '<span class="badge badge-green">Seen</span>' : '<span class="badge badge-muted">Not yet</span>') + '</div>').join('') + '</div>');
      }).join('') + '</div>' +
        '<div class="section"></div>' + R.card('Published assessments', R.table({ rows: assessments, columns: [
          { label: 'Period', render: (a) => R.esc(a.period_name || '—') },
          { label: 'Domain', render: (a) => R.esc(a.domain_name || 'All domains') },
          { label: 'Summary', render: (a) => R.esc(R.truncate(a.summary || '', 120)) },
          { label: 'Published', render: (a) => R.date(a.published_at) }
        ], emptyTitle: 'No assessments published', emptyMessage: 'Assessment summaries appear here once teachers publish them.' })) +
        '<p class="muted small" style="margin-top:10px">' + R.esc(progress.note || '') + '</p>';
    },

    renderPortfolio(page) {
      const items = page.portfolio || [];
      return '<div class="grid grid-3 section">' + items.map((item) => R.card(item.title,
        '<div class="row" style="margin-bottom:8px"><span class="badge badge-sky">' + R.esc(R.titleCase(item.media_type || 'note')) + '</span>' +
        '<span class="muted small">' + R.relative(item.created_at) + '</span></div>' +
        (item.media_url ? '<div style="margin-bottom:8px">' + R.mediaHtml(item.media_url, R.kindForUrl(item.media_url), { alt: item.title }) + '</div>' : '') +
        '<p class="muted small">' + R.esc(item.description || '') + '</p>')).join('') + '</div>' +
        (items.length ? '' : R.emptyState('Portfolio is empty', 'Photos, artwork and moments shared by the teachers will appear here.', '', 'image'));
    },

    renderReports(page) {
      const reports = page.reports || [];
      return '<div class="stack section">' + reports.map((r) => R.card(R.date(r.report_date),
        '<div class="row" style="margin-bottom:8px">' + (r.mood ? '<span class="badge badge-sun">' + R.esc(R.titleCase(r.mood)) + '</span>' : '') + '</div>' +
        '<div class="detail-list">' +
        R.detailItem('Meals', R.esc(r.meals || '—')) +
        R.detailItem('Naps', R.esc(r.naps || '—')) +
        R.detailItem('Toileting', R.esc(r.toileting || '—')) +
        '</div>' +
        (r.activities_summary ? '<p class="muted small" style="margin-top:10px"><strong>Activities:</strong> ' + R.esc(r.activities_summary) + '</p>' : '') +
        (r.notes ? '<p class="muted small" style="white-space:pre-wrap"><strong>Notes:</strong> ' + R.esc(r.notes) + '</p>' : '') +
        (R.mediaList(r.photo_urls).length ? '<div class="media-grid" style="margin-top:10px">' +
          R.mediaList(r.photo_urls).map((url) => '<div class="media-card">' + R.mediaHtml(url, R.kindForUrl(url), { alt: 'Daily report photo' }) + '</div>').join('') + '</div>' : ''))).join('') + '</div>' +
        (reports.length ? '' : R.emptyState('No daily reports yet', 'Daily reports appear once a teacher shares one.', '', 'notebook-pen'));
    }
  };

  V.parentActivities = {
    async load(ctx) {
      const children = await R.api('GET', '/parent/children').then((p) => p.data).catch(() => []);
      const reports = [];
      const portfolio = [];
      const announcements = await R.api('GET', '/parent/announcements').then((p) => p.data).catch(() => []);
      for (const child of children || []) {
        const [r, p] = await Promise.allSettled([
          R.api('GET', '/parent/children/' + encodeURIComponent(child.id) + '/daily-reports').then((x) => x.data),
          R.api('GET', '/parent/children/' + encodeURIComponent(child.id) + '/portfolio').then((x) => x.data)
        ]);
        if (r.status === 'fulfilled') (r.value || []).forEach((row) => reports.push(Object.assign({ childName: childLabel(child) }, row)));
        if (p.status === 'fulfilled') (p.value || []).forEach((row) => portfolio.push(Object.assign({ childName: childLabel(child) }, row)));
      }
      return { reports, portfolio, announcements: announcements || [], children: children || [] };
    },

    render(ctx, params, page) {
      const reports = (page.reports || []).sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)));
      const portfolio = page.portfolio || [];
      const announcements = page.announcements || [];
      return R.pageHead('Activity feed', 'The small moments and the important notices, newest first.') +
        '<div class="split section"><div class="stack">' +
        R.card('Daily reports', reports.length ? '<div class="timeline">' + reports.slice(0, 12).map((r) =>
          '<div class="timeline-item"><div class="t-time">' + R.date(r.report_date) + ' · ' + R.esc(r.childName) + '</div>' +
          '<div class="t-title">' + R.esc(r.mood ? R.titleCase(r.mood) : 'Daily report') + '</div>' +
          '<div class="t-body">' + R.esc(R.truncate(r.activities_summary || r.notes || '', 140)) + '</div></div>').join('') + '</div>' :
          '<p class="muted small">No daily reports yet.</p>') +
        R.card('Portfolio moments', portfolio.length ? '<div class="grid grid-2">' + portfolio.slice(0, 6).map((item) =>
          '<div class="detail-item"><div class="d-label">' + R.esc(item.childName) + ' · ' + R.relative(item.created_at) + '</div>' +
          (item.media_url ? '<div style="margin:6px 0">' + R.mediaHtml(item.media_url, R.kindForUrl(item.media_url), { alt: item.title }) + '</div>' : '') +
          '<div class="d-value">' + R.esc(item.title) + '</div><div class="muted small">' + R.esc(item.description || '') + '</div></div>').join('') + '</div>' :
          '<p class="muted small">No portfolio items yet.</p>') +
        '</div><div class="stack">' +
        R.card('Announcements', announcements.length ? '<div class="stack">' + announcements.map((a) => '<div><div class="strong" style="font-size:0.9rem">' + R.esc(a.title) + '</div><div class="muted small">' + R.relative(a.published_at) + '</div><p class="muted small" style="white-space:pre-wrap;margin-top:4px">' + R.esc(R.truncate(a.body, 180)) + '</p>' +
          (R.mediaList(a.attachment_urls).length ? '<div class="media-grid" style="margin-top:8px">' + R.mediaList(a.attachment_urls).map((url) => '<div class="media-card">' + R.mediaHtml(url, R.kindForUrl(url), { alt: a.title }) + '</div>').join('') + '</div>' : '') + '</div>').join('') + '</div>' : '<p class="muted small">Nothing published.</p>') +
        '</div></div>';
    }
  };

  V.parentProgress = {
    async load(ctx) {
      const children = await R.api('GET', '/parent/children').then((p) => p.data).catch(() => []);
      const child = selectedChild(ctx, children);
      const progress = child
        ? await R.api('GET', '/parent/children/' + encodeURIComponent(child.id) + '/progress').then((p) => p.data).catch(() => null)
        : null;
      const assessments = child
        ? await R.api('GET', '/parent/children/' + encodeURIComponent(child.id) + '/assessments').then((p) => p.data).catch(() => [])
        : [];
      return { children: children || [], child, progress, assessments: assessments || [] };
    },

    render(ctx, params, page) {
      const children = page.children || [];
      if (!children.length) return R.pageHead('Development', 'How your child is growing.') + R.emptyState('No children linked', 'Ask the centre to link your account.', '', 'users');
      const child = page.child;
      const progress = page.progress;
      const domains = (progress && progress.domains) || [];
      return R.pageHead('Development', 'Observations recorded by teachers, shown without judgement.',
        R.selectFilter(ctx, 'childId', children.map((c) => ({ value: c.id, label: childLabel(c) })), 'Choose a child')) +
        (progress ? '<div class="grid grid-2 section">' + domains.map((d) => {
          const pct = d.total ? Math.round((d.observed / d.total) * 100) : 0;
          return R.card(d.name, '<div class="metric-bar"><span>Observed</span><div class="bar"><span style="width:' + pct + '%"></span></div><span class="val">' + d.observed + '/' + d.total + '</span></div>' +
            '<div class="stack" style="margin-top:10px">' + (d.objectives || []).map((o) =>
              '<div class="row" style="justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border-subtle)">' +
              '<span style="font-size:0.84rem">' + R.esc(o.description) + '</span>' +
              (o.observed ? '<span class="badge badge-green">Seen ' + R.number(o.observationCount) + '×</span>' : '<span class="badge badge-muted">Not yet</span>') + '</div>').join('') + '</div>');
        }).join('') + '</div>' : R.emptyState('Progress not shared', 'The centre has not enabled progress reports for your account.', '', 'lock')) +
        '<div class="section"></div>' + R.card('Published assessments', R.table({ rows: page.assessments || [], columns: [
          { label: 'Period', render: (a) => R.esc(a.period_name || '—') },
          { label: 'Domain', render: (a) => R.esc(a.domain_name || 'All domains') },
          { label: 'Summary', render: (a) => R.esc(R.truncate(a.summary || '', 120)) },
          { label: 'Published', render: (a) => R.date(a.published_at) }
        ], emptyTitle: 'No assessments yet', emptyMessage: 'Summaries appear after a teacher publishes them.' })) +
        (progress && progress.note ? '<p class="muted small" style="margin-top:10px">' + R.esc(progress.note) + '</p>' : '');
    }
  };

  V.parentAttendance = {
    async load(ctx) {
      const children = await R.api('GET', '/parent/children').then((p) => p.data).catch(() => []);
      const child = selectedChild(ctx, children);
      const query = new URLSearchParams();
      if (ctx.filters.from) query.set('from', ctx.filters.from);
      if (ctx.filters.to) query.set('to', ctx.filters.to);
      const attendance = child
        ? await R.api('GET', '/parent/children/' + encodeURIComponent(child.id) + '/attendance' + (query.toString() ? '?' + query : ''))
          .then((p) => p.data).catch(() => null)
        : null;
      return { children: children || [], child, attendance };
    },

    render(ctx, params, page) {
      const children = page.children || [];
      if (!children.length) return R.pageHead('Attendance', 'Your child\'s days at the centre.') + R.emptyState('No children linked', 'Ask the centre to link your account.', '', 'users');
      const child = page.child;
      const attendance = page.attendance || { rows: [], summary: {} };
      const summary = attendance.summary || {};
      return R.pageHead('Attendance', 'Every day marked, with the reason when your child was away.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'absence\')">' + R.icon('calendar-plus') + ' Report absence</button>') +
        R.filterBar(
          R.selectFilter(ctx, 'childId', children.map((c) => ({ value: c.id, label: childLabel(c) })), 'Choose a child') +
          '<label class="small muted">From</label><input class="input" type="date" value="' + R.attr(ctx.filters.from || '') + '" @change="setFilter(\'from\',$event.target.value)">' +
          '<label class="small muted">To</label><input class="input" type="date" value="' + R.attr(ctx.filters.to || '') + '" @change="setFilter(\'to\',$event.target.value)">') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Days marked', value: R.number(summary.marked), icon: 'calendar-check', foot: 'In this range' }) +
        R.statCard({ label: 'Present', value: R.number(summary.present), icon: 'user-check', tone: 'green', foot: 'Including late arrivals' }) +
        R.statCard({ label: 'Absent', value: R.number(summary.absent), icon: 'user-x', tone: Number(summary.absent) ? 'clay' : 'green', foot: 'Unexplained absences' }) +
        R.statCard({ label: 'Attendance rate', value: R.percent(summary.rate), icon: 'percent', tone: 'sky', foot: 'Present ÷ marked' }) +
        '</div>' +
        R.table({ rows: attendance.rows || [], columns: [
          { label: 'Date', render: (a) => '<span class="cell-strong">' + R.date(a.attendance_date) + '</span>' },
          { label: 'Status', render: (a) => R.badge(a.attendance_status) },
          { label: 'Checked in', render: (a) => a.check_in_at ? R.time(a.check_in_at) : '—' },
          { label: 'Checked out', render: (a) => a.check_out_at ? R.time(a.check_out_at) : '—' },
          { label: 'Reason', render: (a) => R.esc(a.absence_reason || '—') }
        ], emptyTitle: 'No attendance in this range', emptyMessage: 'Try a wider date range.' });
    },

    openModal(ctx) {
      const children = (ctx.page || {}).children || [];
      ctx.openModal({
        title: 'Report an absence', endpoint: '/parent/children', submitLabel: 'Report absence',
        description: 'Tell the centre which day your child will be away and why.',
        fields: [
          { name: 'childId', label: 'Child', type: 'select', required: true, options: children.map((c) => ({ value: c.id, label: childLabel(c) })) },
          { name: 'date', label: 'Date', type: 'date', required: true, value: R.today() },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true, span: 2 }
        ],
        onSubmit: async (data) => {
          await R.api('POST', '/parent/children/' + encodeURIComponent(data.childId) + '/absence', {
            date: data.date, reason: data.reason
          });
        },
        successMessage: 'Absence reported. The centre has been notified.'
      });
    }
  };

  V.parentForms = {
    async load() {
      const [forms, children] = await Promise.all([
        R.api('GET', '/parent/forms').then((p) => p.data).catch(() => []),
        R.api('GET', '/parent/children').then((p) => p.data).catch(() => [])
      ]);
      return { forms: forms || [], children: children || [] };
    },

    render(ctx, params, page) {
      const forms = page.forms || [];
      const children = page.children || [];
      return R.pageHead('Forms', 'Permissions, consents and the paperwork the centre needs from you.') +
        '<div class="grid grid-2 section">' + forms.map((f) => {
          const schema = f.schema_json || {};
          const fields = schema.fields || [];
          return R.card(f.name,
            '<p class="muted small">' + R.esc(f.description || 'Please complete this form.') + '</p>' +
            '<div class="row" style="margin-bottom:8px"><span class="badge badge-muted">' + R.number(fields.length) + ' questions</span>' +
            (fields.some((x) => x.required) ? '<span class="badge badge-sun">Required fields</span>' : '') + '</div>',
            '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'completeForm\',\'' + R.attr(f.id) + '\')">Complete form</button>');
        }).join('') + '</div>' +
        (forms.length ? '' : R.emptyState('No forms to complete', 'When the centre publishes a form it will appear here.', '', 'clipboard-list')) +
        (children.length ? '' : '<div class="alert alert-warn" style="margin-top:16px">' + R.icon('alert-triangle') + '<span>Your account is not linked to a child yet. Forms that need a child cannot be submitted.</span></div>');
    },

    openModal(ctx, name, id) {
      if (name !== 'completeForm' || !id) return;
      const page = ctx.page || {};
      const form = (page.forms || []).find((f) => f.id === id);
      if (!form) { ctx.toast('That form is no longer available.', 'warn'); return; }
      const schema = form.schema_json || {};
      const children = page.children || [];
      const fields = (schema.fields || []).map((field) => ({
        name: field.key,
        label: field.label,
        type: field.type === 'textarea' ? 'textarea' : field.type === 'checkbox' ? 'checkbox' : field.type === 'select' || field.type === 'radio' ? 'select' : field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text',
        required: field.required === true,
        options: (field.options || []).map((o) => ({ value: o, label: o })),
        help: field.helpText || null,
        span: field.type === 'textarea' ? 2 : undefined,
        value: field.type === 'checkbox' ? false : ''
      }));
      ctx.openModal({
        title: form.name, endpoint: '/forms/' + id + '/submit', submitLabel: 'Submit form', size: 'wide',
        description: form.description || 'Complete every required question.',
        fields: [
          ...(children.length ? [{ name: 'learnerId', label: 'Child this relates to', type: 'select', options: children.map((c) => ({ value: c.id, label: childLabel(c) })) }] : []),
          ...fields
        ],
        transform: (data) => {
          const payload = {};
          for (const field of fields) payload[field.name] = data[field.name];
          return { data: payload, learnerId: data.learnerId || undefined };
        }
      });
    }
  };

  V.parentMessages = {
    async load(ctx) {
      const conversations = await R.api('GET', '/conversations').then((p) => p.data).catch(() => []);
      const selectedId = ctx.filters.conversationId || (conversations[0] && conversations[0].id) || null;
      const thread = selectedId
        ? await R.api('GET', '/conversations/' + encodeURIComponent(selectedId)).then((p) => p.data).catch(() => null)
        : null;
      return { conversations: conversations || [], selectedId, thread };
    },

    render(ctx, params, page) {
      const conversations = page.conversations || [];
      const thread = page.thread;
      return R.pageHead('Messages', 'A direct line to the people caring for your child.') +
        '<div class="split section"><div class="stack">' +
        R.card('Conversations', conversations.length ? '<div class="conversation-list">' + conversations.map((c) => {
          const active = c.id === page.selectedId;
          return '<button class="conversation-item' + (active ? ' active' : '') + '" @click="setFilter(\'conversationId\',\'' + R.attr(c.id) + '\')">' +
            '<div class="avatar">' + R.icon('message-circle') + '</div>' +
            '<div style="flex:1;min-width:0;text-align:left"><div class="strong truncate" style="font-size:0.88rem">' + R.esc(c.subject || (c.learner_first_name ? c.learner_first_name + ' ' + c.learner_last_name : 'Conversation')) + '</div>' +
            '<div class="muted small truncate">' + R.esc(R.truncate(c.last_message || 'No messages yet', 60)) + '</div></div>' +
            '<div class="muted small">' + (c.last_message_at ? R.relative(c.last_message_at) : '') + '</div></button>';
        }).join('') + '</div>' : R.emptyState('No messages', 'Messages from the centre will appear here.', '', 'messages-square')) +
        '</div><div class="stack">' +
        (thread ? R.card(thread.subject || 'Conversation',
          '<div class="row" style="margin-bottom:12px">' + R.badge(thread.status) +
          '<span class="muted small">' + (thread.participants || []).length + ' participants</span></div>' +
          '<div class="message-thread">' + ((thread.messages || []).length ? thread.messages.map((m) => {
            const mine = ctx.session && ctx.session.user && m.sender_user_id === ctx.session.user.id;
            return '<div class="message' + (mine ? ' mine' : '') + '"><div class="message-meta">' + R.esc(m.sender_name || 'Unknown') + ' · ' + R.relative(m.created_at) + '</div>' +
              '<div class="message-body">' + R.esc(m.body) + '</div></div>';
          }).join('') : '<p class="muted small">No messages yet.</p>') + '</div>' +
          (thread.status === 'closed' ? '<div class="alert alert-info" style="margin-top:12px">This conversation is closed.</div>' :
            '<div class="message-compose"><textarea class="textarea" id="message-body" rows="3" placeholder="Write a reply…"></textarea>' +
            '<button class="btn btn-primary" @click="sendMessage(\'' + R.attr(thread.id) + '\')">' + R.icon('send') + ' Send</button></div>'),
          '<div class="muted small">' + (thread.participants || []).map((p) => R.esc(p.display_name)).join(', ') + '</div>') :
          R.card('Select a conversation', '<p class="muted small">Choose a thread to read it.</p>')) +
        '</div></div>';
    }
  };

  V.parentFinance = {
    async load() {
      const summary = await R.api('GET', '/parent/finance/summary').then((p) => p.data).catch(() => ({ invoices: [], outstanding: 0 }));
      return summary || { invoices: [], outstanding: 0 };
    },

    render(ctx, params, page) {
      const invoices = page.invoices || [];
      const outstanding = Number(page.outstanding || 0);
      const overdue = invoices.filter((i) => ['overdue', 'partially_paid', 'issued'].includes(i.status) && Number(i.total_amount) > Number(i.amount_paid));
      const paymentState = ctx.query && ctx.query.payment;
      const banner = paymentState === 'return'
        ? '<div class="alert alert-info section">' + R.icon('clock') + '<span>Thank you — we are confirming your payment with PayFast. Refresh this page in a moment; the invoice updates as soon as the confirmation arrives.</span></div>'
        : paymentState === 'cancelled'
          ? '<div class="alert alert-warn section">' + R.icon('alert-circle') + '<span>Payment cancelled. Nothing has been charged. You can try again whenever you are ready.</span></div>'
          : '';
      return R.pageHead('Fees', 'What has been billed, what has been paid and what is still open.') +
        banner +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Outstanding', value: R.money(outstanding), icon: 'wallet', tone: outstanding ? 'clay' : 'green', foot: 'Across all invoices' }) +
        R.statCard({ label: 'Invoices', value: R.number(invoices.length), icon: 'file-text', tone: 'sky', foot: 'Issued to your family' }) +
        R.statCard({ label: 'Open', value: R.number(overdue.length), icon: 'clock', tone: overdue.length ? 'sun' : 'green', foot: 'Awaiting payment' }) +
        R.statCard({ label: 'Paid', value: R.number(invoices.filter((i) => i.status === 'paid').length), icon: 'check-circle', tone: 'green', foot: 'Settled in full' }) +
        '</div>' +
        R.table({ rows: invoices, columns: [
          { label: 'Invoice', render: (i) => '<button class="link-strong mono" @click="openNamedModal(\'parentInvoice\',\'' + R.attr(i.id) + '\')">' + R.esc(i.invoice_number) + '</button><span class="cell-sub">' + R.esc((i.first_name || '') + ' ' + (i.last_name || '')) + '</span>' },
          { label: 'Issued', render: (i) => R.date(i.issued_at) },
          { label: 'Due', render: (i) => R.date(i.due_at) },
          { label: 'Total', align: 'right', render: (i) => R.money(i.total_amount) },
          { label: 'Paid', align: 'right', render: (i) => R.money(i.amount_paid) },
          { label: 'Outstanding', align: 'right', render: (i) => R.money(Number(i.total_amount) - Number(i.amount_paid)) },
          { label: 'Status', render: (i) => R.badge(i.status) },
          { label: '', align: 'right', render: (i) => (['issued', 'partially_paid', 'overdue'].includes(i.status) && Number(i.total_amount) > Number(i.amount_paid)
            ? '<button class="btn btn-sm btn-primary" @click="payInvoice(\'' + R.attr(i.id) + '\')">' + R.icon('credit-card') + ' Pay online</button>'
            : '') }
        ], emptyTitle: 'No invoices', emptyMessage: 'Invoices issued to your family will appear here.' }) +
        '<div class="alert alert-info section">' + R.icon('info') + '<span>Contact the centre office if an invoice looks wrong. Payments are recorded against the invoice, never deleted.</span></div>';
    },

    async payInvoice(ctx, id) {
      try {
        const payload = await R.api('POST', '/parent/invoices/' + encodeURIComponent(id) + '/pay', {});
        const checkout = (payload.data && payload.data.checkout) || {};
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = checkout.action;
        form.style.display = 'none';
        Object.entries(checkout.fields || {}).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') return;
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
      } catch (error) {
        ctx.toast(error.message || 'Online payment could not be started.', 'error');
      }
    },

    async openModal(ctx, name, id) {
      if (name !== 'parentInvoice' || !id) return;
      try {
        const payload = await R.api('GET', '/parent/invoices/' + encodeURIComponent(id));
        const invoice = payload.data || {};
        const items = invoice.items || [];
        const payments = invoice.payments || [];
        const parentOrg = invoice.organisation || {};
        const orgLogo = parentOrg.logoUrl
          ? '<span class="brand-logo" style="width:34px;height:34px;flex:0 0 34px"><img src="' + R.attr(parentOrg.logoUrl) + '" alt=""></span>'
          : '';
        const html = '<div class="row" style="justify-content:space-between;align-items:flex-start">' +
          '<div class="row" style="gap:10px">' + orgLogo +
          '<div><div class="mono cell-strong" style="font-size:1.05rem">' + R.esc(invoice.invoice_number) + '</div>' +
          '<div class="muted small">' + R.esc(parentOrg.name || '') + ' · Issued ' + R.date(invoice.issued_at) + '</div></div></div>' +
          '<div style="text-align:right">' + R.badge(invoice.status) + '<div class="muted small">Due ' + R.date(invoice.due_at) + '</div></div></div>' +
          '<div class="section"></div>' + R.table({ rows: items, compact: true, columns: [
            { label: 'Description', render: (x) => R.esc(x.description) },
            { label: 'Qty', align: 'right', render: (x) => R.number(x.quantity) },
            { label: 'Unit', align: 'right', render: (x) => R.money(x.unit_amount, invoice.currency) },
            { label: 'Total', align: 'right', render: (x) => R.money(x.line_total, invoice.currency) }
          ] }) +
          '<div class="kpi-list" style="margin-top:12px">' +
          '<div class="kpi-row"><span class="kpi-label">Total</span><span class="kpi-value">' + R.money(invoice.total_amount, invoice.currency) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Paid</span><span class="kpi-value">' + R.money(invoice.amount_paid, invoice.currency) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Outstanding</span><span class="kpi-value">' + R.money(invoice.outstanding, invoice.currency) + '</span></div>' +
          '</div>' +
          (payments.length ? '<div class="section"></div><h3>Payments</h3>' + R.table({ rows: payments, compact: true, columns: [
            { label: 'Received', render: (p) => R.date(p.received_at) },
            { label: 'Method', render: (p) => R.esc(R.titleCase(p.payment_method)) },
            { label: 'Amount', align: 'right', render: (p) => R.money(p.allocated_amount, invoice.currency) },
            { label: 'Status', render: (p) => R.badge(p.status) }
          ] }) : '');
        ctx.openDetail('Invoice ' + invoice.invoice_number, html);
      } catch (error) {
        ctx.toast(error.message || 'The invoice could not be opened.', 'error');
      }
    }
  };

  V.parentSettings = {
    async load(ctx) {
      const [children, consents] = await Promise.all([
        R.api('GET', '/parent/children').then((p) => p.data).catch(() => []),
        R.api('GET', '/parent/consents').then((p) => p.data).catch(() => [])
      ]);
      return { children: children || [], consents: consents || [] };
    },

    render(ctx, params, page) {
      const user = (ctx.session && ctx.session.user) || {};
      const membership = ctx.activeMembership || {};
      const organisation = membership.organisation || {};
      const consents = page.consents || [];
      return R.pageHead('Profile and consent', 'Your details, your permissions and the consents you have given.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'password\')">' + R.icon('key-round') + ' Change password</button>') +
        '<div class="split section"><div class="stack">' +
        R.card('Your profile', '<div class="detail-list">' +
          R.detailItem('Name', R.esc(user.displayName || '—')) +
          R.detailItem('Email', R.esc(user.email || '—')) +
          R.detailItem('Last sign-in', user.lastLoginAt ? R.dateTime(user.lastLoginAt) : '—') +
          R.detailItem('Organisation', R.esc(organisation.name || '—')) +
          '</div><p class="muted small" style="margin-top:10px">To change your name or email, contact the centre office so the change is recorded.</p>') +
        R.card('Consent records', R.table({ rows: consents, columns: [
          { label: 'Child', render: (c) => R.esc((c.first_name || '') + ' ' + (c.last_name || '')) },
          { label: 'Consent', render: (c) => '<span class="cell-strong">' + R.esc(R.titleCase(c.consent_type)) + '</span><span class="cell-sub">' + R.esc(R.truncate(c.purpose, 80)) + '</span>' },
          { label: 'Status', render: (c) => R.badge(c.status) },
          { label: 'Granted', render: (c) => c.granted_at ? R.date(c.granted_at) : '—' },
          { label: 'Withdrawn', render: (c) => c.withdrawn_at ? R.date(c.withdrawn_at) : '—' },
          { label: '', align: 'right', render: (c) => c.status !== 'withdrawn' ? '<button class="btn btn-sm btn-ghost" @click="confirmAction(\'Withdraw consent\',\'Withdrawing consent stops the centre using this permission. The record stays for audit.\',\'/consent/' + R.attr(c.id) + '/withdraw\',{body:{reason:\'Withdrawn by guardian from the parent portal\'},submitLabel:\'Withdraw\',successMessage:\'Consent withdrawn\'})">Withdraw</button>' : '' }
        ], emptyTitle: 'No consent records', emptyMessage: 'Consents recorded by the centre will appear here.' })) +
        '</div><div class="stack">' +
        R.card('What the centre can share', '<div class="detail-list">' +
          (page.children || []).map((c) => R.detailItem(childLabel(c), c.canReceiveReports ? 'Reports shared' : 'Reports not shared')).join('') +
          '</div><p class="muted small" style="margin-top:10px">These permissions are set by the centre when your account is linked to a child. Ask the office if something looks wrong.</p>') +
        R.card('Privacy and safety', '<ul class="list-clean">' +
          '<li>' + R.icon('shield-check') + '<div><div class="strong">Your data is isolated</div><div class="muted small">You only ever see the children linked to your account and the organisation caring for them.</div></div></li>' +
          '<li>' + R.icon('eye') + '<div><div class="strong">Access is logged</div><div class="muted small">Staff access to records is audited, and consent changes are kept.</div></div></li>' +
          '<li>' + R.icon('lock') + '<div><div class="strong">Sessions are protected</div><div class="muted small">Changing your password signs out every other session.</div></div></li>' +
          '</ul>') +
        '</div></div>';
    },

    openModal(ctx, name) {
      if (name === 'password') {
        ctx.openModal({
          title: 'Change password', endpoint: '/auth/change-password', submitLabel: 'Change password',
          description: 'Use at least 10 characters. Every other session will be signed out.',
          fields: [
            { name: 'currentPassword', label: 'Current password', type: 'password', required: true, span: 2 },
            { name: 'newPassword', label: 'New password', type: 'password', required: true, span: 2 }
          ],
          successMessage: 'Password changed. Other sessions were signed out.'
        });
      }
    }
  };
})();
