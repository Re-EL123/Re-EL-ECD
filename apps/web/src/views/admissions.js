'use strict';

/* Admissions pipeline: enquiries, applications, review and enrolment. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const ENQUIRY_STATUSES = ['new', 'contacted', 'tour_scheduled', 'waitlisted', 'converted', 'closed', 'spam'];
  const APPLICATION_STATUSES = ['submitted', 'under_review', 'approved', 'waitlisted', 'rejected', 'enrolled', 'withdrawn'];

  V.admissions = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.q) query.set('q', ctx.filters.q);
      if (ctx.filters.status) query.set('status', ctx.filters.status);
      const [overview, enquiries, applications, classrooms, feePlans] = await Promise.all([
        R.api('GET', '/admissions/overview'),
        R.api('GET', '/admissions/enquiries' + (query.toString() ? '?' + query : '')),
        R.api('GET', '/admissions/applications' + (query.toString() ? '?' + query : '')),
        R.api('GET', '/classrooms').catch(() => ({ data: [] })),
        R.api('GET', '/fee-plans').catch(() => ({ data: [] }))
      ]);
      return {
        overview: overview.data, enquiries: enquiries.data, applications: applications.data,
        classrooms: classrooms.data || [], feePlans: feePlans.data || []
      };
    },

    render(ctx, params, page) {
      const o = page.overview || {};
      const capacityRows = Array.isArray(o.capacity) ? o.capacity : [];
      const totalCapacity = capacityRows.reduce((sum, c) => sum + Number(c.configured_capacity || 0), 0);
      const tab = ctx.tab || 'enquiries';
      const enquiries = page.enquiries || [];
      const applications = page.applications || [];
      return R.pageHead('Admissions', 'From the first enquiry to the first day — one clear pipeline.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'enquiry\')">' + R.icon('inbox') + ' Log enquiry</button>' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'application\')">' + R.icon('user-plus') + ' New application</button>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'New enquiries', value: R.number(o.new_enquiries), icon: 'inbox', tone: 'sky', foot: 'Awaiting first contact' }) +
        R.statCard({ label: 'Pending review', value: R.number(o.pending_applications), icon: 'clipboard-list', tone: 'sun', foot: 'Applications to assess' }) +
        R.statCard({ label: 'Approved', value: R.number(o.approved_applications), icon: 'check-circle', foot: 'Ready to enrol' }) +
        R.statCard({ label: 'Capacity', value: R.number(totalCapacity), icon: 'door-open', tone: 'clay', foot: (o.waitlisted || 0) + ' waitlisted · ' + (o.enrolled || 0) + ' enrolled' }) +
        '</div>' +
        R.tabs([{ key: 'enquiries', label: 'Enquiries (' + enquiries.length + ')' }, { key: 'applications', label: 'Applications (' + applications.length + ')' }], tab) +
        (tab === 'enquiries' ? this.renderEnquiries(ctx, page) : this.renderApplications(ctx, page));
    },

    renderEnquiries(ctx, page) {
      const canManage = ctx.has('admissions.manage.daycare');
      return R.filterBar(R.searchFilter(ctx, 'q', 'Search guardian or child…') +
        R.selectFilter(ctx, 'status', ENQUIRY_STATUSES.map((s) => ({ value: s, label: R.titleCase(s) })), 'All enquiry statuses')) +
        (canManage ? R.bulkBar([
          { label: 'Mark contacted', icon: 'phone', path: '/admissions/enquiries/bulk', action: 'contacted' },
          { label: 'Close', icon: 'check-circle', path: '/admissions/enquiries/bulk', action: 'close' },
          { label: 'Reopen', icon: 'rotate-ccw', path: '/admissions/enquiries/bulk', action: 'reopen' },
          { label: 'Mark spam', icon: 'shield', path: '/admissions/enquiries/bulk', action: 'spam', tone: 'danger' }
        ], { hint: 'Converted enquiries cannot be reopened.' }) : '') +
        R.table({ rows: page.enquiries || [], selectable: canManage, columns: [
          { label: 'Enquiry', render: (e) => '<span class="cell-strong">' + R.esc(e.guardian_name) + '</span><span class="cell-sub">' + R.esc(e.guardian_email || e.guardian_phone || '') + '</span>' },
          { label: 'Child', render: (e) => R.esc(e.child_name || '—') + '<span class="cell-sub">' + (e.child_date_of_birth ? 'Born ' + R.date(e.child_date_of_birth) : '') + '</span>' },
          { label: 'Age group', render: (e) => R.esc(e.requested_age_group || '—') + '<span class="cell-sub">' + R.esc(e.branch_name || '') + '</span>' },
          { label: 'Source', render: (e) => '<span class="badge badge-muted">' + R.esc(R.titleCase(e.source || 'website')) + '</span>' },
          { label: 'Status', render: (e) => R.badge(e.status) },
          { label: 'Received', render: (e) => R.date(e.created_at) },
          { label: '', align: 'right', render: (e) => '<div class="btn-group">' +
            '<button class="btn btn-sm btn-secondary" @click="openNamedDetail(\'enquiry\',\'' + R.attr(e.id) + '\')">View</button>' +
            (['converted', 'closed', 'spam'].includes(e.status) ? '' : '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'convert\',\'' + R.attr(e.id) + '\')">Convert</button>') +
            '</div>' }
        ], emptyTitle: 'No enquiries', emptyMessage: 'Enquiries from your public website and phone calls appear here.' });
    },

    renderApplications(ctx, page) {
      const canManage = ctx.has('admissions.manage.daycare');
      return R.filterBar(R.searchFilter(ctx, 'q', 'Search child or guardian…') +
        R.selectFilter(ctx, 'status', APPLICATION_STATUSES.map((s) => ({ value: s, label: R.titleCase(s) })), 'All application statuses')) +
        (canManage ? R.bulkBar([
          { label: 'Approve', icon: 'check-circle', path: '/admissions/applications/bulk', action: 'approve' },
          { label: 'Waitlist', icon: 'clock', path: '/admissions/applications/bulk', action: 'waitlist' },
          { label: 'Send for review', icon: 'clipboard-list', path: '/admissions/applications/bulk', action: 'review' },
          { label: 'Reject', icon: 'x', path: '/admissions/applications/bulk', action: 'reject', tone: 'danger' }
        ], { hint: 'Enrolled applications are left untouched. Guardians are notified of the decision.' }) : '') +
        R.table({ rows: page.applications || [], selectable: canManage, columns: [
          { label: 'Applicant', render: (a) => '<span class="cell-strong">' + R.esc(a.child_first_name + ' ' + a.child_last_name) + '</span><span class="cell-sub mono">' + R.esc(a.application_reference) + '</span>' },
          { label: 'Guardian', render: (a) => R.esc(a.guardian_name) + '<span class="cell-sub">' + R.esc(a.guardian_email || '') + '</span>' },
          { label: 'Classroom', render: (a) => R.esc(a.requested_classroom_name || '—') + '<span class="cell-sub">' + R.esc(a.branch_name || '') + '</span>' },
          { label: 'Start', render: (a) => R.date(a.preferred_start_date) },
          { label: 'Status', render: (a) => R.badge(a.status) },
          { label: '', align: 'right', render: (a) => '<div class="btn-group">' +
            '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'review\',\'' + R.attr(a.id) + '\')">Review</button>' +
            (a.status === 'approved' ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'enrol\',\'' + R.attr(a.id) + '\')">Enrol</button>' : '') +
            '</div>' }
        ], emptyTitle: 'No applications', emptyMessage: 'Convert an enquiry to start an application.' });
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      if (name === 'enquiry') {
        ctx.openModal({ title: 'Log an enquiry', endpoint: '/admissions/enquiries', submitLabel: 'Save enquiry', size: 'wide', fields: [
          { name: 'branchId', label: 'Branch', type: 'select', options: R.branchOptions(ctx) },
          { name: 'source', label: 'Source', type: 'select', options: ['phone', 'walk_in', 'website', 'referral', 'social'], value: 'phone' },
          { name: 'guardianName', label: 'Guardian name', required: true },
          { name: 'guardianEmail', label: 'Guardian email', type: 'email' },
          { name: 'guardianPhone', label: 'Guardian phone' },
          { name: 'childName', label: 'Child name' },
          { name: 'childDateOfBirth', label: 'Child date of birth', type: 'date' },
          { name: 'requestedAgeGroup', label: 'Age group' },
          { name: 'preferredStartDate', label: 'Preferred start', type: 'date' },
          { name: 'message', label: 'Notes', type: 'textarea', span: 2 }
        ] });
      } else if (name === 'application') {
        ctx.openModal({ title: 'New application', endpoint: '/admissions/applications', submitLabel: 'Create application', size: 'wide', fields: [
          { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx) },
          { name: 'requestedClassroomId', label: 'Requested classroom', type: 'select', options: R.classroomOptions(page) },
          { name: 'childFirstName', label: 'Child first name', required: true },
          { name: 'childLastName', label: 'Child last name', required: true },
          { name: 'childDateOfBirth', label: 'Child date of birth', type: 'date', required: true },
          { name: 'guardianName', label: 'Guardian name', required: true },
          { name: 'guardianEmail', label: 'Guardian email', type: 'email' },
          { name: 'guardianPhone', label: 'Guardian phone' },
          { name: 'preferredStartDate', label: 'Preferred start', type: 'date' },
          { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
        ] });
      } else if (name === 'convert' && id) {
        const enquiry = (page.enquiries || []).find((e) => e.id === id) || {};
        const parts = String(enquiry.child_name || '').trim().split(/\s+/);
        ctx.openModal({ title: 'Convert enquiry', endpoint: '/admissions/enquiries/' + id + '/convert', submitLabel: 'Create application', fields: [
          { name: 'childFirstName', label: 'Child first name', value: parts[0] || '', required: true },
          { name: 'childLastName', label: 'Child last name', value: parts.slice(1).join(' ') || '', required: true },
          { name: 'childDateOfBirth', label: 'Date of birth', type: 'date', value: (enquiry.child_date_of_birth || '').slice(0, 10) },
          { name: 'requestedClassroomId', label: 'Classroom', type: 'select', options: R.classroomOptions(page) },
          { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
        ] });
      } else if (name === 'review' && id) {
        ctx.openModal({ title: 'Review application', endpoint: '/admissions/applications/' + id + '/review', submitLabel: 'Record decision', fields: [
          { name: 'decision', label: 'Decision', type: 'select', required: true, options: ['approve', 'waitlist', 'reject'] },
          { name: 'reason', label: 'Reason', type: 'textarea', span: 2 }
        ] });
      } else if (name === 'enrol' && id) {
        ctx.openModal({ title: 'Enrol learner', endpoint: '/admissions/applications/' + id + '/enrol', submitLabel: 'Enrol learner', fields: [
          { name: 'classroomId', label: 'Classroom', type: 'select', required: true, options: R.classroomOptions(page) },
          { name: 'startDate', label: 'Start date', type: 'date', value: R.today(), required: true },
          { name: 'learnerReference', label: 'Learner reference', help: 'Leave blank to generate' },
          { name: 'feePlanId', label: 'Fee plan', type: 'select', options: (page.feePlans || []).map((f) => ({ value: f.id, label: f.name })) }
        ] });
      }
    }
  };

  V.admissions.detail = function detail(ctx, name, id) {
    if (name !== 'enquiry') return null;
    const enquiry = (((ctx.page || {}).enquiries) || []).find((e) => e.id === id);
    if (!enquiry) return { title: 'Enquiry', html: '<p class="muted">Enquiry not found.</p>' };
    return {
      title: 'Enquiry from ' + enquiry.guardian_name,
      html: '<div class="detail-list">' +
        R.detailItem('Guardian', R.esc(enquiry.guardian_name)) +
        R.detailItem('Email', R.esc(enquiry.guardian_email)) +
        R.detailItem('Phone', R.esc(enquiry.guardian_phone)) +
        R.detailItem('Child', R.esc(enquiry.child_name)) +
        R.detailItem('Date of birth', R.date(enquiry.child_date_of_birth)) +
        R.detailItem('Age group', R.esc(enquiry.requested_age_group)) +
        R.detailItem('Preferred start', R.date(enquiry.preferred_start_date)) +
        R.detailItem('Branch', R.esc(enquiry.branch_name)) +
        R.detailItem('Status', R.badge(enquiry.status)) +
        R.detailItem('Received', R.dateTime(enquiry.created_at)) +
        '</div><div class="section"></div><h3>Message</h3><p class="muted">' + R.esc(enquiry.message || 'No message provided.') + '</p>'
    };
  };
})();
