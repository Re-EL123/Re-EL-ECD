'use strict';

/* Workforce: staff directory, profiles, shifts, attendance and leave. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const EMPLOYMENT = ['active', 'on_leave', 'suspended', 'ended'];

  V.staff = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.q) query.set('q', ctx.filters.q);
      if (ctx.filters.status) query.set('status', ctx.filters.status);
      if (ctx.filters.branchId) query.set('branchId', ctx.filters.branchId);
      const [overview, staff, classrooms] = await Promise.all([
        R.api('GET', '/staff/overview').then((p) => p.data).catch(() => ({})),
        R.api('GET', '/staff?' + query),
        R.api('GET', '/classrooms').catch(() => ({ data: [] }))
      ]);
      return { overview, rows: staff.data, meta: staff.meta || {}, classrooms: classrooms.data || [] };
    },

    render(ctx, params, page) {
      const o = page.overview || {};
      const counts = o.staff || {};
      return R.pageHead('Staff', 'Your team, their classrooms and everything the week requires.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'staff\')">' + R.icon('user-plus') + ' Add staff profile</button>' +
        '<a class="btn btn-primary btn-sm" href="#/app/staff-shifts">' + R.icon('calendar-clock') + ' Shifts</a>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Team', value: R.number(counts.total), icon: 'id-card', foot: R.number(counts.active) + ' active' }) +
        R.statCard({ label: 'On site', value: R.number(o.onSiteCount), icon: 'fingerprint', tone: 'sky', foot: R.number(o.onBreakCount) + ' on break' }) +
        R.statCard({ label: 'Shifts today', value: R.number((o.shiftsToday || {}).total), icon: 'calendar-clock', tone: 'sun', foot: R.number((o.shiftsToday || {}).approved) + ' approved' }) +
        R.statCard({ label: 'Pending leave', value: R.number(o.pendingLeave), icon: 'plane', tone: 'plum', foot: R.number(o.pendingTimesheets) + ' timesheets to approve' }) +
        '</div>' +
        (o.expiringDocuments ? '<div class="alert alert-warn" style="margin-bottom:16px">' + R.icon('alert-triangle') + '<span>' + R.number(o.expiringDocuments) + ' staff documents expire within 60 days.</span><a class="btn btn-sm btn-ghost row-end" href="#/app/staff-attendance">Review</a></div>' : '') +
        R.filterBar(R.searchFilter(ctx, 'q', 'Search name, role or reference…') +
          R.selectFilter(ctx, 'status', EMPLOYMENT.map((s) => ({ value: s, label: R.titleCase(s) })), 'All employment statuses') +
          R.selectFilter(ctx, 'branchId', R.branchOptions(ctx), 'All branches')) +
        R.table({ rows: page.rows || [], columns: [
          { label: 'Staff member', render: (s) => '<div class="row" style="gap:10px">' + R.mediaThumb(s.avatar_url, s.display_name) + '<div><a class="cell-strong" href="#/app/staff/' + R.attr(s.id) + '">' + R.esc(s.display_name) + '</a><span class="cell-sub mono">' + R.esc(s.employee_reference) + '</span></div></div>' },
          { label: 'Role', render: (s) => R.esc(s.job_title) },
          { label: 'Classrooms', render: (s) => (s.classrooms || []).map((c) => '<span class="badge badge-muted">' + R.esc(c.name) + '</span>').join(' ') || '<span class="muted">Unassigned</span>' },
          { label: 'Contact', render: (s) => R.esc(s.email || '—') + '<span class="cell-sub">' + R.esc(s.phone || '') + '</span>' },
          { label: 'Status', render: (s) => R.badge(s.employment_status) },
          { label: 'Last sign in', render: (s) => s.last_login_at ? R.relative(s.last_login_at) : '<span class="muted">Never</span>' },
          { label: '', align: 'right', render: (s) => '<a class="btn btn-sm btn-secondary" href="#/app/staff/' + R.attr(s.id) + '">Open</a>' }
        ], emptyTitle: 'No staff found', emptyMessage: 'Invite a colleague, then create their staff profile.' });
    },

    openModal(ctx, name) {
      if (name !== 'staff') return;
      ctx.openModal({ title: 'Add staff profile', endpoint: '/staff', submitLabel: 'Create profile', size: 'wide',
        description: 'The person must already be an active member of this organisation. Invite them under Users and access first.',
        fields: [
          { name: 'email', label: 'Work email', type: 'email', required: true, help: 'Must match an active member of this organisation' },
          { name: 'displayName', label: 'Display name' },
          { name: 'employeeReference', label: 'Employee reference', required: true, placeholder: 'EMP-011' },
          { name: 'jobTitle', label: 'Job title', required: true },
          { name: 'startDate', label: 'Start date', type: 'date', value: R.today() },
          { name: 'classroomId', label: 'Primary classroom', type: 'select', options: R.classroomOptions(ctx.page) }
        ],
        transform: (data) => {
          const body = Object.assign({}, data);
          if (body.classroomId) body.classroomIds = [body.classroomId];
          delete body.classroomId;
          return body;
        }
      });
    }
  };

  V.staffDetail = {
    async load(ctx, params) {
      const payload = await R.api('GET', '/staff/' + encodeURIComponent(params.id));
      const classrooms = await R.api('GET', '/classrooms').catch(() => ({ data: [] }));
      return { staff: payload.data, classrooms: classrooms.data || [] };
    },
    render(ctx, params, page) {
      const s = page.staff || {};
      const user = s.user || {};
      const canManage = ctx.has('staff.manage.daycare');
      return '<a href="#/app/staff" class="muted small">← All staff</a>' +
        '<div class="row" style="gap:14px;align-items:flex-start">' + R.mediaThumb(user.avatarUrl, user.displayName || 'Staff') +
        '<div style="flex:1">' +
        R.pageHead(user.displayName || 'Staff profile', R.esc(s.job_title) + ' · ' + R.esc(s.employee_reference),
          (canManage ? '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'editStaff\')">' + R.icon('pencil') + ' Edit</button>' : '') +
          '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'document\')">' + R.icon('file-plus') + ' Add document</button>' +
          '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'training\')">' + R.icon('graduation-cap') + ' Add training</button>') +
        '</div></div>' +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Status', value: R.titleCase(s.employment_status), icon: 'id-card', foot: 'Started ' + R.date(s.start_date) }) +
        R.statCard({ label: 'Classrooms', value: R.number((s.classrooms || []).length), icon: 'door-open', tone: 'sky' }) +
        R.statCard({ label: 'Documents', value: R.number((s.documents || []).length), icon: 'file-text', tone: 'sun', foot: R.number((s.documents || []).filter((d) => d.verification_status === 'verified').length) + ' verified' }) +
        R.statCard({ label: 'Training', value: R.number((s.training || []).length), icon: 'graduation-cap', tone: 'plum' }) +
        '</div>' +
        '<div class="split"><div class="stack">' +
        R.card('Profile', '<div class="detail-list">' +
          R.detailItem('Name', R.esc(user.displayName)) + R.detailItem('Email', R.esc(user.email)) +
          R.detailItem('Phone', R.esc((s.contact_details || {}).phone || user.phone)) +
          R.detailItem('Job title', R.esc(s.job_title)) + R.detailItem('Employment', R.badge(s.employment_status)) +
          R.detailItem('Started', R.date(s.start_date)) + R.detailItem('Ended', R.date(s.end_date)) +
          R.detailItem('Last sign in', user.lastLoginAt ? R.dateTime(user.lastLoginAt) : 'Never') +
          '</div>') +
        R.card('Classrooms', (s.classrooms || []).length ? '<div class="row">' + s.classrooms.map((c) => '<span class="chip">' + R.icon('door-open') + R.esc(c.name) + '</span>').join('') + '</div>' : '<p class="muted small">No classrooms assigned.</p>', canManage ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'classrooms\')">Manage</button>' : '') +
        R.card('Recent shifts', R.table({ rows: (s.shifts || []).slice(0, 8), compact: true, columns: [
          { label: 'Date', render: (x) => R.date(x.shift_date) },
          { label: 'Hours', render: (x) => R.time(x.starts_at) + ' – ' + R.time(x.ends_at) },
          { label: 'Break', render: (x) => R.number(x.break_minutes) + ' min' },
          { label: 'Status', render: (x) => R.badge(x.status) }
        ], emptyTitle: 'No shifts' })) +
        '</div><div class="stack">' +
        R.card('Documents', R.table({ rows: s.documents || [], compact: true, columns: [
          { label: 'Document', render: (d) => '<span class="cell-strong">' + R.esc(d.title) + '</span><span class="cell-sub">' + R.esc(R.titleCase(d.document_type)) + '</span>' },
          { label: 'File', render: (d) => d.file_url ? '<a class="btn btn-sm btn-ghost" href="' + R.attr(d.file_url) + '" target="_blank" rel="noopener">' + R.icon('external-link') + ' Open</a>' : '<span class="muted">—</span>' },
          { label: 'Expires', render: (d) => R.date(d.expires_at) },
          { label: 'Status', render: (d) => R.badge(d.verification_status) },
          { label: '', align: 'right', render: (d) => d.verification_status !== 'verified' && canManage ? '<button class="btn btn-sm btn-secondary" @click="act(\'POST\',\'/staff/' + R.attr(s.id) + '/documents/' + R.attr(d.id) + '/verify\',{verificationStatus:\'verified\'},{successMessage:\'Document verified\'})">Verify</button>' : '' }
        ], emptyTitle: 'No documents', emptyMessage: 'Qualifications, first aid and police clearance belong here.' })) +
        R.card('Training', R.table({ rows: s.training || [], compact: true, columns: [
          { label: 'Course', render: (t) => '<span class="cell-strong">' + R.esc(t.course_name) + '</span><span class="cell-sub">' + R.esc(t.provider || '') + '</span>' },
          { label: 'Completed', render: (t) => R.date(t.completed_on) },
          { label: 'Expires', render: (t) => R.date(t.expires_on) }
        ], emptyTitle: 'No training records' })) +
        '</div></div>';
    },
    openModal(ctx, name) {
      const s = (ctx.page && ctx.page.staff) || {};
      const user = s.user || {};
      if (name === 'editStaff') {
        ctx.openModal({ title: 'Edit staff profile', endpoint: '/staff/' + s.id, method: 'PATCH', submitLabel: 'Save', fields: [
          { name: 'jobTitle', label: 'Job title', value: s.job_title, required: true },
          { name: 'employmentStatus', label: 'Employment status', type: 'select', options: EMPLOYMENT, value: s.employment_status },
          { name: 'startDate', label: 'Start date', type: 'date', value: (s.start_date || '').slice(0, 10) },
          { name: 'endDate', label: 'End date', type: 'date', value: (s.end_date || '').slice(0, 10) },
          { name: 'avatarUrl', label: 'Profile photo', type: 'media', scope: 'staff-avatar', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif', value: user.avatarUrl || '', span: 2 },
          { name: 'contactDetails', label: 'Contact details (JSON)', type: 'textarea', value: R.json(s.contact_details || {}), span: 2 }
        ], transform: (data) => {
          const body = Object.assign({}, data);
          try { body.contactDetails = JSON.parse(body.contactDetails || '{}'); } catch { delete body.contactDetails; }
          return body;
        } });
      } else if (name === 'document') {
        ctx.openModal({ title: 'Add staff document', endpoint: '/staff/' + s.id + '/documents', submitLabel: 'Add document', fields: [
          { name: 'documentType', label: 'Type', type: 'select', required: true, options: ['qualification', 'first_aid', 'police_clearance', 'contract', 'id', 'other'] },
          { name: 'title', label: 'Title', required: true },
          { name: 'fileUrl', label: 'File', type: 'media', scope: 'staff-document', accept: 'application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png', span: 2, help: 'PDF, Word, Excel, text, CSV or an image.' },
          { name: 'issuedAt', label: 'Issued', type: 'date' },
          { name: 'expiresAt', label: 'Expires', type: 'date' }
        ] });
      } else if (name === 'training') {
        ctx.openModal({ title: 'Add training record', endpoint: '/staff/' + s.id + '/training', submitLabel: 'Save training', fields: [
          { name: 'courseName', label: 'Course', required: true, span: 2 },
          { name: 'provider', label: 'Provider' },
          { name: 'completedOn', label: 'Completed', type: 'date', value: R.today() },
          { name: 'expiresOn', label: 'Expires', type: 'date' },
          { name: 'certificateStorageKey', label: 'Certificate reference', span: 2 }
        ] });
      } else if (name === 'classrooms') {
        const options = (ctx.page.classrooms || []).map((c) => ({ value: c.id, label: c.name }));
        ctx.openModal({ title: 'Assign classrooms', endpoint: '/staff/' + s.id + '/classrooms', method: 'POST', submitLabel: 'Save assignments', fields: [
          { name: 'classroomId', label: 'Primary classroom', type: 'select', options, value: ((s.classrooms || [])[0] || {}).id }
        ], transform: (data) => ({ classroomIds: data.classroomId ? [data.classroomId] : [] }) });
      }
    }
  };

  V.shifts = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.from) query.set('from', ctx.filters.from);
      if (ctx.filters.to) query.set('to', ctx.filters.to);
      const [shifts, staff, classrooms] = await Promise.all([
        R.api('GET', '/shifts' + (query.toString() ? '?' + query : '')),
        ctx.has('staff.read.daycare') ? R.api('GET', '/staff').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        R.api('GET', '/classrooms').catch(() => ({ data: [] }))
      ]);
      return { rows: shifts.data, staff: staff.data || [], classrooms: classrooms.data || [] };
    },
    render(ctx, params, page) {
      return R.pageHead('Shift calendar', 'Plan cover, spot clashes before they happen and approve the week.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'shift\')">' + R.icon('calendar-plus') + ' Add shift</button>') +
        R.table({ rows: page.rows || [], columns: [
          { label: 'Date', render: (s) => '<span class="cell-strong">' + R.date(s.shift_date) + '</span>' },
          { label: 'Staff', render: (s) => R.esc(s.staff_name || '—') + '<span class="cell-sub">' + R.esc(s.job_title || '') + '</span>' },
          { label: 'Hours', render: (s) => R.time(s.starts_at) + ' – ' + R.time(s.ends_at) + '<span class="cell-sub">' + R.number(s.break_minutes) + ' min break</span>' },
          { label: 'Classroom', render: (s) => R.esc(s.classroom_name || '—') + '<span class="cell-sub">' + R.esc(s.branch_name || '') + '</span>' },
          { label: 'Status', render: (s) => R.badge(s.status) },
          { label: '', align: 'right', render: (s) => '<div class="btn-group">' +
            (s.status === 'draft' ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/shifts/' + R.attr(s.id) + '/approve\',{},{successMessage:\'Shift approved\'})">Approve</button>' : '') +
            (['draft', 'approved'].includes(s.status) ? '<button class="btn btn-sm btn-secondary" @click="confirmAction(\'Cancel shift\',\'The staff member will be notified that this shift is cancelled.\',\'/shifts/' + R.attr(s.id) + '/cancel\',{submitLabel:\'Cancel shift\',successMessage:\'Shift cancelled\'})">Cancel</button>' : '') +
            '</div>' }
        ], emptyTitle: 'No shifts', emptyMessage: 'Add the first shift to start planning cover.' });
    },
    openModal(ctx, name) {
      if (name !== 'shift') return;
      ctx.openModal({ title: 'Add shift', endpoint: '/shifts', submitLabel: 'Create shift', size: 'wide', fields: [
        { name: 'staffId', label: 'Staff member', type: 'select', required: true, options: (ctx.page.staff || []).map((s) => ({ value: s.id, label: s.display_name + ' · ' + s.job_title })) },
        { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx) },
        { name: 'shiftDate', label: 'Date', type: 'date', required: true, value: R.today() },
        { name: 'startsAt', label: 'Starts at', type: 'datetime-local', required: true },
        { name: 'endsAt', label: 'Ends at', type: 'datetime-local', required: true },
        { name: 'breakMinutes', label: 'Break (minutes)', type: 'number', value: 30 },
        { name: 'assignedClassroomId', label: 'Classroom', type: 'select', options: R.classroomOptions(ctx.page) },
        { name: 'publish', label: 'Publish immediately', type: 'checkbox', value: true, help: 'Approve and notify the staff member' }
      ] });
    }
  };

  V.staffAttendance = {
    async load(ctx) {
      const canTeam = ctx.has(['staff_attendance.read.daycare', 'staff_attendance.read.assigned']);
      if (!canTeam) {
        const mine = await R.api('GET', '/staff-attendance/me').catch(() => ({ data: null }));
        return { personal: mine.data || null, attendance: null, staff: [], timesheets: [] };
      }
      const [attendance, staff, timesheets] = await Promise.all([
        R.api('GET', '/staff-attendance'),
        ctx.has('staff.read.daycare') ? R.api('GET', '/staff').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        ctx.has('timesheets.read.daycare') ? R.api('GET', '/timesheets').catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
      ]);
      return { attendance: attendance.data, staff: staff.data || [], timesheets: timesheets.data || [] };
    },
    render(ctx, params, page) {
      if (page.personal !== undefined && !page.attendance) return this.renderMine(ctx, page);
      const a = page.attendance || { events: [], staff: [] };
      const canRecord = ctx.has('staff_attendance.record.daycare');
      const tab = ctx.tab || 'today';
      const canTimesheets = ctx.has('timesheets.read.daycare');
      return R.pageHead('Staff attendance', 'Clock-in, breaks, timesheets and the record of who is on site.',
        canTimesheets ? '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'timesheet\')">' + R.icon('file-clock') + ' Generate timesheet</button>' : '') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Scheduled today', value: R.number((a.staff || []).filter((s) => s.shift_id).length), icon: 'calendar-clock', foot: R.date(a.date) }) +
        R.statCard({ label: 'Clocked in', value: R.number((a.events || []).filter((e) => e.event_type === 'clock_in').length), icon: 'fingerprint', tone: 'sky' }) +
        R.statCard({ label: 'Events', value: R.number((a.events || []).length), icon: 'activity', tone: 'sun', foot: 'Recorded today' }) +
        R.statCard({ label: 'Timesheets', value: R.number((page.timesheets || []).length), icon: 'file-clock', tone: 'plum', foot: 'Recent periods' }) +
        '</div>' +
        (canTimesheets ? R.tabs([{ key: 'today', label: 'Today' }, { key: 'timesheets', label: 'Timesheets' }], tab) : '') +
        (tab === 'timesheets' && canTimesheets ? this.renderTimesheets(page) : this.renderToday(ctx, page, canRecord));
    },
    renderMine(ctx, page) {
      const state = page.personal;
      if (!state) {
        return R.pageHead('My attendance', 'Clock in, take breaks and review your recorded hours.') +
          R.emptyState('No staff profile', 'Your account is not linked to a staff profile yet. Ask an administrator to link it.', '', 'fingerprint');
      }
      const status = state.status;
      const label = status === 'on_site' ? 'On site' : status === 'on_break' ? 'On a break' : status === 'clocked_out' ? 'Clocked out' : 'Not clocked in';
      const actions = status === 'on_site'
        ? '<button class="btn btn-secondary btn-sm" @click="act(\'POST\',\'/staff-attendance/break-start\',{},{successMessage:\'Break started\'})">Start break</button>' +
          '<button class="btn btn-primary btn-sm" @click="act(\'POST\',\'/staff-attendance/clock-out\',{},{successMessage:\'Clocked out\'})">Clock out</button>'
        : status === 'on_break'
          ? '<button class="btn btn-primary btn-sm" @click="act(\'POST\',\'/staff-attendance/break-end\',{},{successMessage:\'Break ended\'})">End break</button>'
          : '<button class="btn btn-primary btn-sm" @click="act(\'POST\',\'/staff-attendance/clock-in\',{},{successMessage:\'Clocked in\'})">Clock in</button>';
      return R.pageHead('My attendance', 'Clock in, take breaks and review your recorded hours.',
        '<span class="badge ' + (status === 'on_site' ? 'badge-success' : status === 'on_break' ? 'badge-warning' : 'badge-muted') + '">' + R.esc(label) + '</span>') +
        '<div class="grid grid-3 section">' +
        R.statCard({ label: 'Status', value: R.esc(label), icon: 'fingerprint', tone: 'sky', foot: R.esc(state.staff.job_title || '') }) +
        R.statCard({ label: 'Today\'s shift', value: state.shift ? R.time(state.shift.starts_at) + ' – ' + R.time(state.shift.ends_at) : 'None', icon: 'calendar-clock', foot: state.shift ? R.esc(R.titleCase(state.shift.status)) : 'No shift scheduled' }) +
        R.statCard({ label: 'Events today', value: R.number((state.today || []).length), icon: 'activity', tone: 'sun', foot: 'Recorded' }) +
        '</div>' +
        R.card('Record attendance', '<p class="muted small">Your clock events are timestamped on the server and appear on the team attendance record.</p><div class="btn-group">' + actions + '</div>') +
        '<div class="section">' + R.card('Today', (state.today || []).length ? '<div class="timeline">' + state.today.map((e) =>
          '<div class="timeline-item"><div class="t-time">' + R.time(e.recorded_at) + '</div><div class="t-title">' + R.esc(R.titleCase(e.event_type)) + '</div><div class="t-body">' + R.esc(e.source || 'web') + '</div></div>').join('') + '</div>'
          : R.emptyState('No events yet', 'Clock in to start your day.', '', 'fingerprint')) + '</div>' +
        '<div class="section">' + R.card('Last 7 days', (state.week || []).length ? '<div class="timeline">' + state.week.map((e) =>
          '<div class="timeline-item"><div class="t-time">' + R.date(e.recorded_at) + '</div><div class="t-title">' + R.esc(R.titleCase(e.event_type)) + '</div><div class="t-body">' + R.time(e.recorded_at) + '</div></div>').join('') + '</div>'
          : R.emptyState('Nothing recorded', 'Your recent clock events will appear here.', '', 'clock')) + '</div>';
    },
    renderToday(ctx, page, canRecord) {
      const a = page.attendance || {};
      const latest = {};
      (a.events || []).forEach((e) => { if (!latest[e.staff_id]) latest[e.staff_id] = e; });
      return '<div class="split"><div class="stack">' +
        R.card('Team today', R.table({ rows: a.staff || [], columns: [
          { label: 'Staff', render: (s) => '<span class="cell-strong">' + R.esc(s.display_name) + '</span><span class="cell-sub">' + R.esc(s.job_title) + '</span>' },
          { label: 'Shift', render: (s) => s.shift_id ? R.time(s.starts_at) + ' – ' + R.time(s.ends_at) : '<span class="muted">No shift</span>' },
          { label: 'State', render: (s) => {
            const e = latest[s.id];
            if (!e) return '<span class="badge badge-muted">Not clocked in</span>';
            return R.badge(e.event_type === 'clock_in' || e.event_type === 'break_end' ? 'on_site' : e.event_type === 'break_start' ? 'on_break' : 'clocked_out');
          } },
          { label: 'Last event', render: (s) => latest[s.id] ? R.time(latest[s.id].recorded_at) : '—' },
          { label: '', align: 'right', render: (s) => {
            if (!canRecord) return '';
            const e = latest[s.id];
            const state = e ? e.event_type : null;
            if (!state || state === 'clock_out') return '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/staff-attendance/clock-in\',{staffId:\'' + R.attr(s.id) + '\'},{successMessage:\'Clocked in\'})">Clock in</button>';
            if (state === 'break_start') return '<button class="btn btn-sm btn-secondary" @click="act(\'POST\',\'/staff-attendance/break-end\',{staffId:\'' + R.attr(s.id) + '\'},{successMessage:\'Break ended\'})">End break</button>';
            return '<div class="btn-group"><button class="btn btn-sm btn-secondary" @click="act(\'POST\',\'/staff-attendance/break-start\',{staffId:\'' + R.attr(s.id) + '\'},{successMessage:\'Break started\'})">Break</button>' +
              '<button class="btn btn-sm btn-secondary" @click="act(\'POST\',\'/staff-attendance/clock-out\',{staffId:\'' + R.attr(s.id) + '\'},{successMessage:\'Clocked out\'})">Clock out</button></div>';
          } }
        ], emptyTitle: 'No staff scheduled' })) +
        '</div><div class="stack">' +
        R.card('Event log', (a.events || []).length ? '<div class="timeline">' + a.events.map((e) =>
          '<div class="timeline-item"><div class="t-time">' + R.time(e.recorded_at) + '</div><div class="t-title">' + R.esc(e.staff_name) + '</div><div class="t-body">' + R.esc(R.titleCase(e.event_type)) + ' · ' + R.esc(e.source || 'web') + '</div></div>').join('') + '</div>' : R.emptyState('No events yet', 'Clock-ins and breaks will appear here.', '', 'fingerprint')) +
        '</div></div>';
    },
    renderTimesheets(page) {
      return R.card('Timesheets', R.table({ rows: page.timesheets || [], columns: [
        { label: 'Staff', render: (t) => '<span class="cell-strong">' + R.esc(t.staff_name) + '</span><span class="cell-sub">' + R.esc(t.job_title || '') + '</span>' },
        { label: 'Period', render: (t) => R.date(t.period_start) + ' – ' + R.date(t.period_end) },
        { label: 'Hours', align: 'right', render: (t) => (Number(t.total_minutes || 0) / 60).toFixed(1) },
        { label: 'Overtime', align: 'right', render: (t) => (Number(t.overtime_minutes || 0) / 60).toFixed(1) },
        { label: 'Status', render: (t) => R.badge(t.status) },
        { label: '', align: 'right', render: (t) => t.status === 'submitted' ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/timesheets/' + R.attr(t.id) + '/transition\',{status:\'approved\'},{successMessage:\'Timesheet approved\'})">Approve</button>' : '' }
      ], emptyTitle: 'No timesheets', emptyMessage: 'Generate a timesheet from recorded clock events.' }), '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'timesheet\')">' + R.icon('plus') + ' Generate</button>');
    },
    openModal(ctx, name) {
      if (name !== 'timesheet') return;
      ctx.openModal({ title: 'Generate timesheet', endpoint: '/timesheets/generate', submitLabel: 'Generate', fields: [
        { name: 'staffId', label: 'Staff member', type: 'select', required: true, options: (ctx.page.staff || []).map((s) => ({ value: s.id, label: s.display_name })) },
        { name: 'periodStart', label: 'Period start', type: 'date', required: true },
        { name: 'periodEnd', label: 'Period end', type: 'date', required: true }
      ] });
    }
  };

  V.leave = {
    async load(ctx) {
      const [leave, staff] = await Promise.all([
        R.api('GET', '/leave'),
        ctx.has('staff.read.daycare') ? R.api('GET', '/staff').catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
      ]);
      return { rows: leave.data, staff: staff.data || [] };
    },
    render(ctx, params, page) {
      const canReview = ctx.has('leave.approve.daycare');
      return R.pageHead('Leave', 'Requests, approvals and who is away when.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'leave\')">' + R.icon('plane') + ' Request leave</button>') +
        R.table({ rows: page.rows || [], columns: [
          { label: 'Staff', render: (l) => '<span class="cell-strong">' + R.esc(l.staff_name) + '</span><span class="cell-sub">' + R.esc(l.job_title || '') + '</span>' },
          { label: 'Type', render: (l) => '<span class="badge badge-muted">' + R.esc(R.titleCase(l.leave_type)) + '</span>' },
          { label: 'Dates', render: (l) => R.date(l.starts_on) + ' – ' + R.date(l.ends_on) },
          { label: 'Reason', render: (l) => R.esc(R.truncate(l.reason, 60)) },
          { label: 'Status', render: (l) => R.badge(l.status) },
          { label: 'Reviewed by', render: (l) => R.esc(l.reviewed_by_name || '—') },
          { label: '', align: 'right', render: (l) => l.status === 'pending' && canReview ? '<div class="btn-group">' +
            '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/leave/' + R.attr(l.id) + '/review\',{decision:\'approved\'},{successMessage:\'Leave approved\'})">Approve</button>' +
            '<button class="btn btn-sm btn-danger" @click="act(\'POST\',\'/leave/' + R.attr(l.id) + '/review\',{decision:\'rejected\'},{successMessage:\'Leave rejected\'})">Reject</button></div>' : '' }
        ], emptyTitle: 'No leave requests', emptyMessage: 'Requests from staff appear here for review.' });
    },
    openModal(ctx, name) {
      if (name !== 'leave') return;
      ctx.openModal({ title: 'Request leave', endpoint: '/leave', submitLabel: 'Submit request', fields: [
        { name: 'staffId', label: 'Staff member', type: 'select', required: true, options: (ctx.page.staff || []).map((s) => ({ value: s.id, label: s.display_name })) },
        { name: 'leaveType', label: 'Leave type', type: 'select', options: ['annual', 'sick', 'family', 'study', 'unpaid'], value: 'annual' },
        { name: 'startsOn', label: 'From', type: 'date', required: true },
        { name: 'endsOn', label: 'To', type: 'date', required: true },
        { name: 'reason', label: 'Reason', type: 'textarea', span: 2 }
      ] });
    }
  };
})();
