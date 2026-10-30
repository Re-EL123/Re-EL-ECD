'use strict';

/* Learner register and full child profile. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const STATUSES = ['enrolled', 'waitlisted', 'withdrawn', 'graduated', 'archived'];

  V.learners = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.q) query.set('q', ctx.filters.q);
      if (ctx.filters.status) query.set('status', ctx.filters.status);
      if (ctx.filters.branchId) query.set('branchId', ctx.filters.branchId);
      if (ctx.filters.classroomId) query.set('classroomId', ctx.filters.classroomId);
      if (ctx.filters.page) query.set('page', ctx.filters.page);
      query.set('pageSize', '25');
      const [learners, classrooms] = await Promise.all([
        R.api('GET', '/learners?' + query),
        ctx.has('classrooms.read.daycare') ? R.api('GET', '/classrooms').catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
      ]);
      return { rows: learners.data, meta: learners.meta || {}, classrooms: classrooms.data || [] };
    },

    render(ctx, params, page) {
      const rows = page.rows || [];
      const classrooms = page.classrooms || [];
      const canCreate = ctx.has('learners.create.daycare');
      return R.pageHead('Learners', 'Every child in your care, with the details their teachers need.',
        (canCreate ? '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'learner\')">' + R.icon('user-plus') + ' Add learner</button>' : '') +
        '<button class="btn btn-secondary btn-sm" @click="exportCurrentCsv(\'learners.csv\',[\'learner_reference\',\'first_name\',\'last_name\',\'classroom_name\',\'branch_name\',\'status\'])">' + R.icon('download') + ' Export</button>') +
        R.filterBar(
          R.searchFilter(ctx, 'q', 'Search name or reference…') +
          R.selectFilter(ctx, 'status', STATUSES.map((s) => ({ value: s, label: R.titleCase(s) })), 'All statuses') +
          R.selectFilter(ctx, 'classroomId', classrooms.map((c) => ({ value: c.id, label: c.name })), 'All classrooms') +
          R.selectFilter(ctx, 'branchId', R.branchOptions(ctx), 'All branches')
        ) +
        (ctx.has('learners.archive.daycare') ? R.bulkBar([
          { label: 'Archive selected', icon: 'archive', path: '/learners/bulk', action: 'archive', tone: 'danger' },
          { label: 'Restore selected', icon: 'rotate-ccw', path: '/learners/bulk', action: 'restore' }
        ], { hint: 'Archiving withdraws the learner from active enrolments.' }) : '') +
        R.table({ rows, selectable: ctx.has('learners.archive.daycare') || ctx.has('learners.update.daycare'), columns: [
          { label: 'Learner', render: (l) => '<div class="row" style="gap:10px">' + R.mediaThumb(l.profile_image_url, l.first_name + ' ' + l.last_name) + '<div><a class="cell-strong" href="#/app/learners/' + R.attr(l.id) + '">' + R.esc(l.first_name) + ' ' + R.esc(l.last_name) + '</a><span class="cell-sub mono">' + R.esc(l.learner_reference) + '</span></div></div>' },
          { label: 'Age', render: (l) => R.esc(l.age_years) + ' yrs<span class="cell-sub">' + R.date(l.date_of_birth) + '</span>' },
          { label: 'Classroom', render: (l) => R.esc(l.classroom_name || 'Unassigned') + '<span class="cell-sub">' + R.esc(l.branch_name || '') + '</span>' },
          { label: 'Guardian', render: (l) => l.primary_guardian ? R.esc(l.primary_guardian.first_name + ' ' + l.primary_guardian.last_name) + '<span class="cell-sub">' + R.esc(l.primary_guardian.phone || l.primary_guardian.email || '') + '</span>' : '<span class="muted">Not linked</span>' },
          { label: 'Status', render: (l) => R.badge(l.status) },
          { label: '', align: 'right', render: (l) => '<a class="btn btn-sm btn-secondary" href="#/app/learners/' + R.attr(l.id) + '">Open profile</a>' }
        ], emptyTitle: 'No learners found', emptyMessage: 'Try a different filter, or add your first learner.',
          emptyAction: canCreate ? '<button class="btn btn-primary" @click="openNamedModal(\'learner\')">Add learner</button>' : '' }) +
        R.pager(page.meta, "setFilter('page', " + Math.max(1, (page.meta.page || 1) - 1) + ")", "setFilter('page', " + Math.min(page.meta.totalPages || 1, (page.meta.page || 1) + 1) + ")");
    },

    openModal(ctx, name) {
      if (name !== 'learner') return;
      ctx.openModal({
        title: 'Add a learner',
        endpoint: '/learners',
        submitLabel: 'Create learner',
        size: 'wide',
        fields: [
          { name: 'firstName', label: 'First name', required: true },
          { name: 'lastName', label: 'Last name', required: true },
          { name: 'preferredName', label: 'Preferred name' },
          { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
          { name: 'gender', label: 'Gender', type: 'select', options: ['female', 'male', 'other', 'prefer not to say'] },
          { name: 'homeLanguage', label: 'Home language' },
          { name: 'profileImageUrl', label: 'Profile photo', type: 'media', scope: 'learner-photo', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif', span: 2, help: 'Optional. Stored in R2; only the URL is saved.' },
          { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx) },
          { name: 'classroomId', label: 'Classroom', type: 'select', options: R.classroomOptions(ctx.page) },
          { name: 'learnerReference', label: 'Reference', help: 'Leave blank to generate automatically' },
          { name: 'enrolmentDate', label: 'Enrolment date', type: 'date', value: R.today() },
          { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
        ]
      });
    }
  };

  V.learnerDetail = {
    async load(ctx, params) {
      const id = params.id;
      const safe = (path) => R.api('GET', path).then((p) => p.data).catch(() => null);
      const [learner, timeline, portfolio, medical, collections, documents, dailyReports, consents, finance, progress] = await Promise.all([
        R.api('GET', '/learners/' + id).then((p) => p.data),
        safe('/learners/' + id + '/timeline'),
        safe('/learners/' + id + '/portfolio'),
        safe('/learners/' + id + '/medical'),
        safe('/learners/' + id + '/collections'),
        safe('/learners/' + id + '/documents'),
        safe('/learners/' + id + '/daily-reports'),
        safe('/learners/' + id + '/consents'),
        safe('/learners/' + id + '/finance'),
        safe('/learners/' + id + '/progress')
      ]);
      const classrooms = ctx.has('classrooms.read.daycare')
        ? await R.api('GET', '/classrooms').catch(() => ({ data: [] })) : { data: [] };
      return {
        learner, timeline: timeline || [], portfolio: portfolio || [], medical: medical || [],
        collections: collections || [], documents: documents || [], dailyReports: dailyReports || [],
        consents: consents || [], finance: finance || { invoices: [], balance: 0 }, progress: progress || {},
        classrooms: classrooms.data || []
      };
    },

    render(ctx, params, page) {
      const l = page.learner || {};
      const classroom = l.classroom || {};
      const branch = l.branch || {};
      const guardians = l.guardians || [];
      const attendance = l.attendance || [];
      const canUpdate = (l.permissions && l.permissions.canUpdate) || ctx.has('learners.update.daycare');
      const tab = ctx.tab || 'overview';

      const head = '<a href="#/app/learners" class="muted small">← All learners</a>' +
        '<div class="row" style="gap:14px;align-items:flex-start">' + R.mediaThumb(l.profile_image_url, (l.first_name || '') + ' ' + (l.last_name || '')) +
        '<div style="flex:1">' +
        R.pageHead((l.first_name || '') + ' ' + (l.last_name || ''), (l.learner_reference || '') + ' · ' + R.esc(classroom.name || 'No classroom') + ' · ' + R.esc(branch.name || ''),
          (canUpdate ? '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'editLearner\')">' + R.icon('pencil') + ' Edit</button>' : '') +
          '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'dailyReport\')">' + R.icon('notebook-pen') + ' Daily report</button>' +
          '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'guardian\')">' + R.icon('user-plus') + ' Add guardian</button>') +
        '</div></div>';

      const summary = '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Age', value: (R.ageYears(l.date_of_birth) || '—') + ' yrs', icon: 'cake', foot: 'Born ' + R.date(l.date_of_birth) }) +
        R.statCard({ label: 'Attendance', value: attendance.length ? R.percent((attendance.filter((a) => a.attendance_status === 'present').length / attendance.length) * 100) : '—', icon: 'calendar-check', tone: 'sky', foot: attendance.length + ' recorded days' }) +
        R.statCard({ label: 'Outstanding', value: R.money((page.finance || {}).balance), icon: 'wallet', tone: 'clay', foot: ((page.finance || {}).invoices || []).length + ' invoices' }) +
        R.statCard({ label: 'Observations', value: R.number(((page.progress || {}).observations || []).length), icon: 'sparkles', tone: 'plum', foot: 'Developmental notes' }) +
        '</div>';

      const tabs = R.tabs([
        { key: 'overview', label: 'Overview' }, { key: 'guardians', label: 'Family' }, { key: 'attendance', label: 'Attendance' },
        { key: 'progress', label: 'Development' }, { key: 'daily', label: 'Daily reports' }, { key: 'portfolio', label: 'Portfolio' },
        { key: 'medical', label: 'Medical' }, { key: 'documents', label: 'Documents' }, { key: 'finance', label: 'Fees' },
        { key: 'timeline', label: 'Timeline' }
      ], tab);

      let body = '';
      if (tab === 'overview') {
        body = '<div class="split"><div class="stack">' +
          R.card('Child details', '<div class="detail-list">' +
            R.detailItem('Full name', R.esc(l.first_name + ' ' + l.last_name)) +
            R.detailItem('Preferred name', R.esc(l.preferred_name)) +
            R.detailItem('Date of birth', R.date(l.date_of_birth)) +
            R.detailItem('Gender', R.esc(R.titleCase(l.gender))) +
            R.detailItem('Home language', R.esc(l.home_language)) +
            R.detailItem('Enrolled', R.date(l.enrolment_date)) +
            R.detailItem('Status', R.badge(l.status)) +
            R.detailItem('Classroom', R.esc(classroom.name || 'Unassigned')) +
            '</div>') +
          R.card('Recent timeline', (page.timeline || []).length ? '<div class="timeline">' + page.timeline.slice(0, 6).map((t) =>
            '<div class="timeline-item"><div class="t-time">' + R.dateTime(t.at) + ' · ' + R.esc(t.type) + '</div><div class="t-title">' + R.esc(t.title) + '</div><div class="t-body">' + R.esc(t.detail || '') + '</div></div>').join('') + '</div>' : R.emptyState('No activity yet', 'Events will appear as the child settles in.', '', 'clock')) +
          '</div><div class="stack">' +
          R.card('Primary contacts', guardians.length ? '<ul class="list-clean">' + guardians.map((g) => '<li><div class="avatar">' + R.initials((g.first_name || '') + ' ' + (g.last_name || '')) + '</div><div style="flex:1"><div class="strong">' + R.esc(g.first_name + ' ' + g.last_name) + (g.is_primary_contact ? ' <span class="badge badge-green">Primary</span>' : '') + '</div><div class="muted small">' + R.esc(R.titleCase(g.relationship_type || 'guardian')) + ' · ' + R.esc(g.phone || g.email || '') + '</div></div></li>').join('') + '</ul>' : R.emptyState('No guardians linked', 'Link a parent or caregiver so they can receive updates.', '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'guardian\')">Add guardian</button>', 'users')) +
          R.card('Medical alerts', (page.medical || []).length ? '<ul class="list-clean">' + page.medical.map((m) => '<li>' + R.icon('heart-pulse') + '<div><div class="strong">' + R.esc(R.titleCase(m.record_type)) + '</div><div class="muted small">' + R.esc(R.truncate(m.details, 100)) + '</div></div></li>').join('') + '</ul>' : '<p class="muted small">No medical records on file.</p>', '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'medical\')">Add</button>') +
          '</div></div>';
      } else if (tab === 'guardians') {
        body = R.card('Guardians and authorised collectors', R.table({ rows: guardians, columns: [
          { label: 'Name', render: (g) => '<span class="cell-strong">' + R.esc(g.first_name + ' ' + g.last_name) + '</span><span class="cell-sub">' + R.esc(R.titleCase(g.relationship_type || '')) + '</span>' },
          { label: 'Contact', render: (g) => R.esc(g.email || '—') + '<span class="cell-sub">' + R.esc(g.phone || '') + '</span>' },
          { label: 'Portal', render: (g) => R.badge(g.portal_access_status) },
          { label: 'Permissions', render: (g) => [g.is_primary_contact ? 'Primary' : null, g.can_collect ? 'Collect' : null, g.can_receive_reports ? 'Reports' : null, g.can_receive_financial_information ? 'Finance' : null].filter(Boolean).map((x) => '<span class="badge badge-muted">' + x + '</span>').join(' ') }
        ], emptyTitle: 'No guardians linked', emptyMessage: 'Add a parent or caregiver to open the family portal.' }),
          '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'guardian\')">' + R.icon('plus') + ' Add guardian</button>') +
          '<div class="section"></div>' +
          R.card('Collection history', R.table({ rows: page.collections || [], compact: true, columns: [
            { label: 'When', render: (c) => R.dateTime(c.occurred_at || c.created_at) },
            { label: 'Collector', render: (c) => R.esc(c.collector_name || '—') },
            { label: 'Verified by', render: (c) => R.esc(R.titleCase(c.verification_method || '—')) },
            { label: 'Notes', render: (c) => R.esc(R.truncate(c.notes, 60)) }
          ], emptyTitle: 'No collections recorded' }), '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'collection\')">Record collection</button>');
      } else if (tab === 'attendance') {
        body = R.card('Attendance history', R.table({ rows: attendance, columns: [
          { label: 'Date', render: (a) => R.date(a.attendance_date) },
          { label: 'Status', render: (a) => R.badge(a.attendance_status) },
          { label: 'Check in', render: (a) => R.time(a.check_in_at) },
          { label: 'Check out', render: (a) => R.time(a.check_out_at) },
          { label: 'Reason', render: (a) => R.esc(a.absence_reason || '—') }
        ], emptyTitle: 'No attendance yet', emptyMessage: 'Registers recorded by the classroom will appear here.' }), '<a class="btn btn-sm btn-ghost" href="#/app/learner-attendance">Open register</a>');
      } else if (tab === 'progress') {
        const p = page.progress || {};
        body = R.card('Developmental progress', (p.domains || []).length ? '<div class="stack">' + p.domains.map((d) =>
          '<div class="metric-bar"><span>' + R.esc(d.name) + '</span><div class="bar"><span style="width:' + Math.max(2, Math.min(100, Number(d.percentage || 0))) + '%"></span></div><span class="val">' + R.number(d.observations) + '</span></div>').join('') + '</div>' : R.emptyState('No progress data', 'Observations and assessments will build this picture.', '<a class="btn btn-sm btn-secondary" href="#/app/assessments">Open assessments</a>', 'line-chart')) +
          '<div class="section"></div>' +
          R.card('Recent observations', R.table({ rows: p.observations || [], compact: true, columns: [
            { label: 'Date', render: (o) => R.date(o.observation_date) },
            { label: 'Domain', render: (o) => R.esc(o.domain_name || '—') },
            { label: 'Observation', render: (o) => R.esc(R.truncate(o.observation_text, 100)) },
            { label: 'Status', render: (o) => R.badge(o.assessment_status) }
          ], emptyTitle: 'No observations' }), '<a class="btn btn-sm btn-ghost" href="#/app/assessments">Assessments ' + R.icon('arrow-right') + '</a>');
      } else if (tab === 'daily') {
        body = R.card('Daily reports', R.table({ rows: page.dailyReports || [], columns: [
          { label: 'Date', render: (d) => R.date(d.report_date) },
          { label: 'Mood', render: (d) => R.badge(d.mood) },
          { label: 'Meals', render: (d) => R.esc(d.meals || '—') },
          { label: 'Naps', render: (d) => R.esc(d.naps || '—') },
          { label: 'Summary', render: (d) => R.esc(R.truncate(d.activities_summary || d.notes, 80)) },
          { label: 'Photos', render: (d) => R.mediaList(d.photo_urls).length ? R.mediaThumb(R.mediaList(d.photo_urls)[0], 'Report photo') : '<span class="muted">—</span>' },
          { label: 'Shared', render: (d) => d.shared_with_guardians ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-muted">No</span>' }
        ], emptyTitle: 'No daily reports', emptyMessage: 'Write a report to share the child\'s day with their family.' }), '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'dailyReport\')">' + R.icon('plus') + ' New report</button>');
      } else if (tab === 'portfolio') {
        body = R.card('Portfolio', (page.portfolio || []).length ? '<div class="media-grid">' + page.portfolio.map((item) =>
          '<div class="media-card">' + (item.media_url ? R.mediaHtml(item.media_url, item.media_type === 'video' ? 'video' : (item.media_type === 'document' ? 'document' : 'image'), { alt: item.title }) : '') +
          '<div class="media-card-body"><div class="row" style="justify-content:space-between"><strong>' + R.esc(item.title) + '</strong>' + R.badge(item.sharing_status) + '</div>' +
          '<p class="muted small" style="margin:6px 0">' + R.esc(item.description || '') + '</p>' +
          '<span class="badge badge-muted">' + R.esc(R.titleCase(item.media_type || 'note')) + '</span></div></div>').join('') + '</div>' : R.emptyState('Portfolio is empty', 'Capture photos, work samples and moments worth remembering.', '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'portfolio\')">Add item</button>', 'images'), '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'portfolio\')">' + R.icon('plus') + ' Add item</button>');
      } else if (tab === 'medical') {
        body = R.card('Medical records', R.table({ rows: page.medical || [], columns: [
          { label: 'Type', render: (m) => '<span class="cell-strong">' + R.esc(R.titleCase(m.record_type)) + '</span>' },
          { label: 'Details', render: (m) => R.esc(R.truncate(m.details, 120)) },
          { label: 'Visibility', render: (m) => R.badge(m.visibility_level) },
          { label: 'Effective', render: (m) => R.date(m.effective_from) + (m.effective_until ? ' – ' + R.date(m.effective_until) : '') }
        ], emptyTitle: 'No medical records', emptyMessage: 'Allergies, conditions and medication plans belong here.' }), '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'medical\')">' + R.icon('plus') + ' Add record</button>');
      } else if (tab === 'documents') {
        body = R.card('Documents', R.table({ rows: page.documents || [], columns: [
          { label: 'Document', render: (d) => '<span class="cell-strong">' + R.esc(d.title) + '</span><span class="cell-sub">' + R.esc(R.titleCase(d.document_type)) + '</span>' },
          { label: 'File', render: (d) => d.file_url ? '<a class="btn btn-sm btn-ghost" href="' + R.attr(d.file_url) + '" target="_blank" rel="noopener">' + R.icon('external-link') + ' Open</a>' : '<span class="muted">—</span>' },
          { label: 'Type', render: (d) => R.esc(R.titleCase(d.media_type || '—')) },
          { label: 'Visibility', render: (d) => R.badge(d.visibility) },
          { label: 'Expires', render: (d) => R.date(d.expires_at) },
          { label: 'Added', render: (d) => R.date(d.created_at) }
        ], emptyTitle: 'No documents', emptyMessage: 'Store consent forms, certificates and reports.' }), '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'document\')">' + R.icon('plus') + ' Add document</button>');
      } else if (tab === 'finance') {
        const f = page.finance || {};
        body = '<div class="grid grid-3 section">' +
          R.statCard({ label: 'Balance', value: R.money(f.balance), icon: 'wallet', tone: Number(f.balance) > 0 ? 'danger' : 'green' }) +
          R.statCard({ label: 'Invoices', value: R.number((f.invoices || []).length), icon: 'receipt', tone: 'sky' }) +
          R.statCard({ label: 'Paid', value: R.money((f.invoices || []).reduce((s, i) => s + Number(i.amount_paid || 0), 0)), icon: 'check-circle', tone: 'plum' }) +
          '</div>' +
          R.card('Invoices', R.table({ rows: f.invoices || [], columns: [
            { label: 'Invoice', render: (i) => '<span class="cell-strong mono">' + R.esc(i.invoice_number) + '</span>' },
            { label: 'Issued', render: (i) => R.date(i.issued_at) },
            { label: 'Due', render: (i) => R.date(i.due_at) },
            { label: 'Total', align: 'right', render: (i) => R.money(i.total_amount, i.currency) },
            { label: 'Paid', align: 'right', render: (i) => R.money(i.amount_paid, i.currency) },
            { label: 'Status', render: (i) => R.badge(i.status) }
          ], emptyTitle: 'No invoices' }), '<a class="btn btn-sm btn-ghost" href="#/app/finance">Finance ' + R.icon('arrow-right') + '</a>');
      } else {
        body = R.card('Timeline', (page.timeline || []).length ? '<div class="timeline">' + page.timeline.map((t) =>
          '<div class="timeline-item"><div class="t-time">' + R.dateTime(t.at) + ' · ' + R.esc(t.type) + '</div><div class="t-title">' + R.esc(t.title) + '</div><div class="t-body">' + R.esc(t.detail || '') + '</div></div>').join('') + '</div>' : R.emptyState('Nothing yet', 'The child\'s history will appear here.', '', 'clock'));
      }

      return head + summary + tabs + body;
    },

    openModal(ctx, name) {
      const l = (ctx.page && ctx.page.learner) || {};
      const id = l.id;
      if (name === 'editLearner') {
        ctx.openModal({ title: 'Edit learner', endpoint: '/learners/' + id, method: 'PATCH', submitLabel: 'Save', fields: [
          { name: 'firstName', label: 'First name', value: l.first_name, required: true },
          { name: 'lastName', label: 'Last name', value: l.last_name, required: true },
          { name: 'preferredName', label: 'Preferred name', value: l.preferred_name },
          { name: 'dateOfBirth', label: 'Date of birth', type: 'date', value: (l.date_of_birth || '').slice(0, 10) },
          { name: 'gender', label: 'Gender', type: 'select', options: ['female', 'male', 'other', 'prefer not to say'], value: l.gender },
          { name: 'homeLanguage', label: 'Home language', value: l.home_language },
          { name: 'profileImageUrl', label: 'Profile photo', type: 'media', scope: 'learner-photo', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif', value: l.profile_image_url || '', span: 2 },
          { name: 'classroomId', label: 'Classroom', type: 'select', options: R.classroomOptions(ctx.page), value: l.classroom_id },
          { name: 'status', label: 'Status', type: 'select', options: STATUSES, value: l.status },
          { name: 'departureDate', label: 'Departure date', type: 'date', value: (l.departure_date || '').slice(0, 10) }
        ] });
      } else if (name === 'guardian') {
        ctx.openModal({ title: 'Add guardian', endpoint: '/learners/' + id + '/guardians', submitLabel: 'Link guardian', size: 'wide', fields: [
          { name: 'firstName', label: 'First name', required: true },
          { name: 'lastName', label: 'Last name', required: true },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'phone', label: 'Phone' },
          { name: 'relationshipType', label: 'Relationship', type: 'select', options: ['mother', 'father', 'grandparent', 'guardian', 'other'], value: 'mother' },
          { name: 'portalAccessStatus', label: 'Portal access', type: 'select', options: [{ value: 'invited', label: 'Invited' }, { value: 'active', label: 'Active' }, { value: 'none', label: 'No access' }], value: 'invited' },
          { name: 'isPrimaryContact', label: 'Primary contact', type: 'checkbox', value: true, help: 'Primary contact for the child' },
          { name: 'canCollect', label: 'Can collect', type: 'checkbox', value: true, help: 'Authorised to collect the child' },
          { name: 'canReceiveReports', label: 'Receives reports', type: 'checkbox', value: true, help: 'Can receive developmental reports' },
          { name: 'canReceiveFinancialInformation', label: 'Receives finance', type: 'checkbox', value: false, help: 'Can see invoices and statements' }
        ] });
      } else if (name === 'medical') {
        ctx.openModal({ title: 'Add medical record', endpoint: '/learners/' + id + '/medical', submitLabel: 'Save record', fields: [
          { name: 'recordType', label: 'Record type', type: 'select', required: true, options: ['allergy', 'condition', 'medication', 'immunisation', 'emergency'] },
          { name: 'visibilityLevel', label: 'Visibility', type: 'select', options: ['all_staff', 'teachers', 'management'], value: 'teachers' },
          { name: 'details', label: 'Details', type: 'textarea', required: true, span: 2 },
          { name: 'effectiveFrom', label: 'Effective from', type: 'date', value: R.today() },
          { name: 'effectiveUntil', label: 'Effective until', type: 'date' }
        ] });
      } else if (name === 'portfolio') {
        ctx.openModal({ title: 'Add portfolio item', endpoint: '/learners/' + id + '/portfolio', submitLabel: 'Add to portfolio', fields: [
          { name: 'title', label: 'Title', required: true, span: 2 },
          { name: 'description', label: 'Description', type: 'textarea', span: 2 },
          { name: 'mediaType', label: 'Media type', type: 'select', options: ['photo', 'video', 'drawing', 'note', 'document'], value: 'photo' },
          { name: 'mediaUrl', label: 'Photo or video', type: 'media', scope: 'portfolio', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,application/pdf', mediaTypeField: 'mediaType', span: 2 },
          { name: 'sharingStatus', label: 'Sharing', type: 'select', options: [{ value: 'private', label: 'Staff only' }, { value: 'guardians', label: 'Share with guardians' }], value: 'private' }
        ] });
      } else if (name === 'dailyReport') {
        ctx.openModal({ title: 'Daily report', endpoint: '/learners/' + id + '/daily-reports', submitLabel: 'Save report', size: 'wide', fields: [
          { name: 'reportDate', label: 'Date', type: 'date', value: R.today(), required: true },
          { name: 'mood', label: 'Mood', type: 'select', options: ['happy', 'calm', 'tired', 'unsettled', 'energetic'] },
          { name: 'meals', label: 'Meals', placeholder: 'Ate well at breakfast and lunch' },
          { name: 'naps', label: 'Naps', placeholder: 'Slept 45 minutes' },
          { name: 'toileting', label: 'Toileting' },
          { name: 'activitiesSummary', label: 'What we did', type: 'textarea', span: 2 },
          { name: 'notes', label: 'Notes for the family', type: 'textarea', span: 2 },
          { name: 'photoUrl', label: 'Photo', type: 'media', scope: 'daily-report', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif', span: 2 },
          { name: 'sharedWithGuardians', label: 'Share with guardians', type: 'checkbox', value: true, help: 'Publish to the family portal' }
        ] });
      } else if (name === 'document') {
        ctx.openModal({ title: 'Add document', endpoint: '/learners/' + id + '/documents', submitLabel: 'Save document', fields: [
          { name: 'documentType', label: 'Document type', type: 'select', required: true, options: ['consent', 'medical', 'report', 'certificate', 'other'] },
          { name: 'title', label: 'Title', required: true },
          { name: 'fileUrl', label: 'File', type: 'media', scope: 'learner-document', accept: 'application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png', span: 2, help: 'PDF, Word, Excel, text, CSV or an image.' },
          { name: 'mediaType', label: 'Media type', type: 'select', options: ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'], value: 'application/pdf' },
          { name: 'visibility', label: 'Visibility', type: 'select', options: ['staff', 'guardians', 'management'], value: 'staff' },
          { name: 'expiresAt', label: 'Expires', type: 'date' }
        ] });
      } else if (name === 'collection') {
        ctx.openModal({ title: 'Record collection', endpoint: '/learners/' + id + '/collections', submitLabel: 'Record', fields: [
          { name: 'collectorName', label: 'Collector name', required: true, span: 2 },
          { name: 'verificationMethod', label: 'Verification', type: 'select', options: ['id_document', 'password', 'photo', 'known_to_staff'], value: 'id_document' },
          { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
        ] });
      }
    }
  };
})();
