'use strict';

/* Application shell, router, session state and shared actions. */
(function () {
  const Reel = window.Reel;
  const V = Reel.views;

  function route(path, area, view, permission, title) {
    return { path, area, view, permission, title };
  }

  const ROUTES = [
    route('/', 'public', 'platformHome', null, 'Re-EL ECD'),
    route('/home', 'public', 'platformHome', null, 'Re-EL ECD'),
    route('/login', 'login', null, null, 'Sign in'),
    route('/signup', 'public', 'signup', null, 'Sign up'),
    route('/site', 'public', 'publicSite', null, 'Daycare website'),
    route('/site/:slug', 'public', 'publicSite', null, 'Daycare website'),
    route('/site/:slug/apply', 'public', 'publicApply', null, 'Enquire'),
    route('/site/:slug/forms', 'public', 'publicForms', null, 'Forms'),
    route('/site/:slug/forms/:formSlug', 'public', 'publicForm', null, 'Form'),
    // Catch-all for the tenant's own pages (about, programmes, admissions,
    // gallery, contact). It must stay after the more specific routes above.
    route('/site/:slug/:page', 'public', 'publicSite', null, 'Daycare website'),
    route('/reset-password', 'public', 'resetPassword', null, 'Reset password'),
    route('/accept-invite', 'public', 'acceptInvite', null, 'Accept invitation'),
    route('/legal', 'public', 'legalIndex', null, 'Legal'),
    route('/legal/terms', 'public', 'legalTerms', null, 'Terms of Service'),
    route('/legal/privacy', 'public', 'legalPrivacy', null, 'Privacy Policy'),
    route('/legal/cookies', 'public', 'legalCookies', null, 'Cookie Policy'),
    route('/legal/acceptable-use', 'public', 'legalAcceptableUse', null, 'Acceptable Use Policy'),
    route('/legal/safeguarding', 'public', 'legalSafeguarding', null, 'Safeguarding Policy'),
    route('/gate/:slug', 'public', 'gate', null, 'Gate'),
    route('/terms', 'public', 'legalTerms', null, 'Terms of Service'),
    route('/privacy', 'public', 'legalPrivacy', null, 'Privacy Policy'),
    route('/cookies', 'public', 'legalCookies', null, 'Cookie Policy'),

    route('/platform/overview', 'platform', 'platformOverview', 'platform.organisations.read', 'Platform overview'),
    route('/platform/organisations', 'platform', 'platformOrganisations', 'platform.organisations.read', 'Organisation directory'),
    route('/platform/organisations/:id', 'platform', 'platformOrganisationDetail', 'platform.organisations.read', 'Organisation detail'),
    route('/platform/users', 'platform', 'platformUsers', 'platform.organisations.read', 'Platform users'),
    route('/platform/subscriptions', 'platform', 'platformSubscriptions', 'platform.subscriptions.read', 'Subscriptions'),
    route('/platform/settlements', 'platform', 'platformSettlements', 'platform.subscriptions.manage', 'Settlements'),
    route('/platform/access', 'platform', 'platformAccess', 'platform.organisations.read', 'Platform access'),
    route('/platform/item-analysis', 'platform', 'platformItemAnalysis', 'platform.organisations.read', 'Item analysis'),
    route('/platform/audit', 'platform', 'platformAudit', 'platform.audit.read', 'Platform audit'),
    route('/platform/health', 'platform', 'platformHealth', 'platform.health.read', 'System health'),
    route('/platform/settings', 'platform', 'platformSettings', 'platform.organisations.read', 'Platform settings'),
    route('/platform/support', 'platform', 'platformSupport', 'platform.support.manage', 'Support workspace'),

    route('/app/today', 'app', 'today', ['reports.read.daycare', 'tasks.read.own', 'attendance.read.assigned', 'curriculum.create.daycare', 'assessments.create.assigned', 'attendance.record.assigned', 'attendance.record.own', 'staff_attendance.record.assigned', 'staff_attendance.record.own'], 'Today'),
    route('/app/learners', 'app', 'learners', ['learners.read.daycare', 'learners.read.assigned'], 'Learners'),
    route('/app/learners/:id', 'app', 'learnerDetail', ['learners.read.daycare', 'learners.read.assigned'], 'Learner profile'),
    route('/app/admissions', 'app', 'admissions', 'admissions.read.daycare', 'Admissions'),
    route('/app/classrooms', 'app', 'classrooms', 'classrooms.read.daycare', 'Classrooms'),
    route('/app/curriculum', 'app', 'curriculum', 'curriculum.read.daycare', 'Curriculum'),
    route('/app/activities', 'app', 'activities', 'curriculum.read.daycare', 'Activities'),
    route('/app/nursery-rhymes', 'app', 'nurseryRhymes', 'curriculum.read.daycare', 'Nursery rhymes'),
    route('/app/books', 'app', 'books', 'curriculum.read.daycare', 'Books'),
    route('/app/calendar', 'app', 'calendar', 'curriculum.read.daycare', 'Calendar'),
    route('/app/modules', 'app', 'modules', 'curriculum.read.daycare', 'Learning modules'),
    route('/app/modules/:id', 'app', 'moduleDetail', 'curriculum.read.daycare', 'Learning module'),
    route('/app/whiteboards', 'app', 'whiteboards', 'curriculum.read.daycare', 'Whiteboards'),
    route('/app/whiteboards/:id', 'app', 'whiteboardDetail', 'curriculum.read.daycare', 'Whiteboard'),
    route('/app/assessments', 'app', 'assessments', ['assessments.read.daycare', 'assessments.read.assigned'], 'Assessments'),
    route('/app/learner-attendance', 'app', 'attendance', ['attendance.read.daycare', 'attendance.read.assigned'], 'Learner attendance'),
    route('/app/staff', 'app', 'staff', 'staff.read.daycare', 'Staff'),
    route('/app/staff/:id', 'app', 'staffDetail', 'staff.read.daycare', 'Staff profile'),
    route('/app/staff-shifts', 'app', 'shifts', ['shifts.read.daycare', 'shifts.read.assigned'], 'Shift calendar'),
    route('/app/staff-activity', 'app', 'staffActivity', ['reports.read.daycare', 'staff.read.daycare'], 'Staff impact'),
    route('/app/staff-attendance', 'app', 'staffAttendance', ['staff_attendance.read.daycare', 'staff_attendance.read.assigned', 'staff_attendance.record.own'], 'Staff attendance'),
    route('/app/leave', 'app', 'leave', ['leave.read.daycare', 'leave.request.own'], 'Leave'),
    route('/app/forms', 'app', 'forms', ['forms.read.daycare', 'forms.submissions.review.daycare'], 'Forms'),
    route('/app/communications', 'app', 'communications', ['messages.read.own', 'announcements.read.daycare'], 'Communications'),
    route('/app/finance', 'app', 'finance', 'finance.read.daycare', 'Finance'),
    route('/app/expenses', 'app', 'expenses', ['expenses.read.daycare', 'expenses.manage.daycare'], 'Expenses'),
    route('/app/inventory', 'app', 'inventory', 'inventory.read.daycare', 'Inventory'),
    route('/app/safety', 'app', 'safety', 'safety.read.daycare', 'Health and safety'),
    route('/app/tasks', 'app', 'tasks', ['tasks.read.own', 'tasks.read.daycare'], 'Tasks'),
    route('/app/reports', 'app', 'reports', ['reports.read.daycare', 'reports.read.assigned'], 'Reports'),
    route('/app/settings', 'app', 'settings', 'organisation.read.daycare', 'Settings'),
    route('/app/website', 'app', 'website', 'website.read.daycare', 'Public website'),
    route('/app/media', 'app', 'mediaLibrary', 'media.read.daycare', 'Media library'),
    route('/app/manuals', 'app', 'manuals', ['parent.read.own', 'reports.read.daycare', 'tasks.read.own', 'attendance.read.assigned'], 'Manuals'),
    route('/app/manuals/:slug', 'app', 'manualDetail', ['parent.read.own', 'reports.read.daycare', 'tasks.read.own', 'attendance.read.assigned'], 'Manual'),
    route('/app/access', 'app', 'access', 'access.read.daycare', 'Users and access'),
    route('/app/audit', 'app', 'audit', 'audit.read.daycare', 'Audit log'),
    route('/app/automation', 'app', 'automation', 'organisation.settings.manage', 'Automation'),

    route('/parent/overview', 'parent', 'parentOverview', 'parent.read.own', 'Family home'),
    route('/parent/children', 'parent', 'parentChildren', 'parent.read.own', 'My children'),
    route('/parent/children/:id', 'parent', 'parentChild', 'parent.read.own', 'Child profile'),
    route('/parent/activities', 'parent', 'parentActivities', 'parent.read.own', 'Activity feed'),
    route('/parent/progress', 'parent', 'parentProgress', 'parent.read.own', 'Development'),
    route('/parent/attendance', 'parent', 'parentAttendance', 'parent.read.own', 'Attendance'),
    route('/parent/pickup', 'parent', 'parentPickup', 'parent.read.own', 'Pickup'),
    route('/parent/forms', 'parent', 'parentForms', 'parent.forms.submit.own', 'Forms'),
    route('/parent/messages', 'parent', 'parentMessages', 'messages.read.own', 'Messages'),
    route('/parent/finance', 'parent', 'parentFinance', 'parent.finance.read.own', 'Fees'),
    route('/parent/settings', 'parent', 'parentSettings', 'parent.read.own', 'Profile and consent'),
    route('/parent/manuals', 'parent', 'manuals', 'parent.read.own', 'Manuals'),
    route('/parent/pkid-drivers', 'parent', 'pkidDrivers', 'parent.read.own', 'Pickup drivers'),
    route('/parent/manuals/:slug', 'parent', 'manualDetail', 'parent.read.own', 'Manual')
  ];

  function compile(pattern) {
    const keys = [];
    const regex = new RegExp('^' + pattern.split('/').map((segment) => {
      if (segment.startsWith(':')) { keys.push(segment.slice(1)); return '([^/]+)'; }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('/') + '/?$');
    return { regex, keys };
  }

  ROUTES.forEach((r) => { const c = compile(r.path); r.regex = c.regex; r.keys = c.keys; });

  function matchRoute(path) {
    for (const r of ROUTES) {
      const match = r.regex.exec(path);
      if (!match) continue;
      const params = {};
      r.keys.forEach((key, index) => { params[key] = decodeURIComponent(match[index + 1]); });
      return { route: r, params };
    }
    return null;
  }

  const NAV = {
    platform: [
      { label: 'Platform', items: [
        { path: '/platform/overview', label: 'Overview', icon: 'layout-dashboard', permission: 'platform.organisations.read' },
        { path: '/platform/organisations', label: 'Organisations', icon: 'building-2', permission: 'platform.organisations.read' },
        { path: '/platform/users', label: 'Users', icon: 'users', permission: 'platform.organisations.read' },
        { path: '/platform/subscriptions', label: 'Subscriptions', icon: 'credit-card', permission: 'platform.subscriptions.read' },
        { path: '/platform/settlements', label: 'Settlements', icon: 'hand-coins', permission: 'platform.subscriptions.manage' },
        { path: '/platform/access', label: 'Platform access', icon: 'shield-check', permission: 'platform.organisations.read' },
        { path: '/platform/item-analysis', label: 'Item analysis', icon: 'target', permission: 'platform.organisations.read' }
      ] },
      { label: 'Governance', items: [
        { path: '/platform/audit', label: 'Audit explorer', icon: 'scroll-text', permission: 'platform.audit.read' },
        { path: '/platform/health', label: 'System health', icon: 'activity', permission: 'platform.health.read' },
        { path: '/platform/support', label: 'Support', icon: 'life-buoy', permission: 'platform.support.manage' },
        { path: '/platform/settings', label: 'Configuration', icon: 'settings', permission: 'platform.organisations.read' }
      ] }
    ],
    app: [
      { label: 'Teaching', items: [
        { path: '/app/today', label: 'Today', icon: 'sun', permission: ['reports.read.daycare', 'tasks.read.own', 'attendance.read.assigned', 'curriculum.create.daycare', 'assessments.create.assigned', 'attendance.record.assigned', 'attendance.record.own', 'staff_attendance.record.assigned', 'staff_attendance.record.own'] },
        { path: '/app/calendar', label: 'Calendar', icon: 'calendar-days', permission: 'curriculum.read.daycare' },
        { path: '/app/whiteboards', label: 'Whiteboards', icon: 'presentation', permission: 'curriculum.read.daycare' },
        { path: '/app/modules', label: 'Modules', icon: 'blocks', permission: 'curriculum.read.daycare' },
        { path: '/app/curriculum', label: 'Curriculum', icon: 'book-open', permission: 'curriculum.read.daycare' },
        { path: '/app/activities', label: 'Activities', icon: 'puzzle', permission: 'curriculum.read.daycare' },
        { path: '/app/nursery-rhymes', label: 'Nursery rhymes', icon: 'music-2', permission: 'curriculum.read.daycare' },
        { path: '/app/books', label: 'Books', icon: 'book-open', permission: 'curriculum.read.daycare' },
        { path: '/app/assessments', label: 'Assessments', icon: 'clipboard-list', permission: ['assessments.read.daycare', 'assessments.read.assigned'] }
      ] },
      { label: 'Children', items: [
        { path: '/app/learners', label: 'Learners', icon: 'users', permission: ['learners.read.daycare', 'learners.read.assigned'] },
        { path: '/app/admissions', label: 'Admissions', icon: 'user-plus', permission: 'admissions.read.daycare' },
        { path: '/app/classrooms', label: 'Classrooms', icon: 'door-open', permission: 'classrooms.read.daycare' },
        { path: '/app/learner-attendance', label: 'Attendance', icon: 'calendar-check', permission: ['attendance.read.daycare', 'attendance.read.assigned'] },
      ] },
      { label: 'People', items: [
        { path: '/app/staff', label: 'Staff', icon: 'id-card', permission: 'staff.read.daycare' },
        { path: '/app/staff-shifts', label: 'Shifts', icon: 'calendar-clock', permission: ['shifts.read.daycare', 'shifts.read.assigned'] },
        { path: '/app/staff-activity', label: 'Staff impact', icon: 'activity', permission: ['reports.read.daycare', 'staff.read.daycare'] },
        { path: '/app/staff-attendance', label: 'Staff attendance', icon: 'fingerprint', permission: ['staff_attendance.read.daycare', 'staff_attendance.read.assigned', 'staff_attendance.record.own'] },
        { path: '/app/leave', label: 'Leave', icon: 'plane', permission: ['leave.read.daycare', 'leave.request.own'] }
      ] },
      { label: 'Operations', items: [
        { path: '/app/forms', label: 'Forms', icon: 'file-text', permission: ['forms.read.daycare', 'forms.submissions.review.daycare'] },
        { path: '/app/communications', label: 'Communications', icon: 'messages-square', permission: ['messages.read.own', 'announcements.read.daycare'] },
        { path: '/app/tasks', label: 'Tasks', icon: 'list-checks', permission: ['tasks.read.own', 'tasks.read.daycare'] },
        { path: '/app/safety', label: 'Safety', icon: 'shield-alert', permission: 'safety.read.daycare' },
        { path: '/app/inventory', label: 'Inventory', icon: 'package', permission: 'inventory.read.daycare' },
        { path: '/app/reports', label: 'Reports', icon: 'bar-chart-3', permission: ['reports.read.daycare', 'reports.read.assigned'] }
      ] },
      { label: 'Business', items: [
        { path: '/app/finance', label: 'Finance', icon: 'wallet', permission: 'finance.read.daycare' },
        { path: '/app/expenses', label: 'Expenses', icon: 'receipt', permission: ['expenses.read.daycare', 'expenses.manage.daycare'] }
      ] },
      { label: 'Configuration', items: [
        { path: '/app/settings', label: 'Organisation', icon: 'settings', permission: 'organisation.read.daycare' },
        { path: '/app/website', label: 'Public website', icon: 'globe', permission: 'website.read.daycare' },
        { path: '/app/media', label: 'Media library', icon: 'images', permission: 'media.read.daycare' },
        { path: '/app/access', label: 'Users and access', icon: 'shield-check', permission: 'access.read.daycare' },
        { path: '/app/audit', label: 'Audit log', icon: 'scroll-text', permission: 'audit.read.daycare' },
        { path: '/app/manuals', label: 'Manuals', icon: 'book-open', permission: ['parent.read.own', 'reports.read.daycare', 'tasks.read.own', 'attendance.read.assigned'] },
        { path: '/app/automation', label: 'Automation', icon: 'workflow', permission: 'organisation.settings.manage' }
      ] }
    ],
    parent: [
      { label: 'Family', items: [
        { path: '/parent/overview', label: 'Home', icon: 'home', permission: 'parent.read.own' },
        { path: '/parent/children', label: 'My children', icon: 'users', permission: 'parent.read.own' },
        { path: '/parent/activities', label: 'Activity feed', icon: 'sparkles', permission: 'parent.read.own' },
        { path: '/parent/progress', label: 'Development', icon: 'line-chart', permission: 'parent.read.own' },
        { path: '/parent/attendance', label: 'Attendance', icon: 'calendar-check', permission: 'parent.read.own' },
        { path: '/parent/pickup', label: 'Pickup', icon: 'qr-code', permission: 'parent.read.own' }
      ] },
      { label: 'Connect', items: [
        { path: '/parent/forms', label: 'Forms', icon: 'file-text', permission: 'parent.forms.submit.own' },
        { path: '/parent/messages', label: 'Messages', icon: 'messages-square', permission: 'messages.read.own' },
        { path: '/parent/finance', label: 'Fees', icon: 'wallet', permission: 'parent.finance.read.own' },
        { path: '/parent/manuals', label: 'Manuals', icon: 'book-open', permission: 'parent.read.own' },
        { path: '/parent/pkid-drivers', label: 'Pickup drivers', icon: 'car', permission: 'parent.read.own' },
        { path: '/parent/settings', label: 'Profile and consent', icon: 'settings', permission: 'parent.read.own' }
      ] }
    ]
  };

  const QUICK_ACTIONS = [
    { label: 'New learner', icon: 'user-plus', permission: 'learners.create.daycare', route: '/app/learners', modal: 'learner' },
    { label: 'Record payment', icon: 'banknote', permission: 'finance.payment.record.daycare', route: '/app/finance', modal: 'payment' },
    { label: 'Log an incident', icon: 'shield-alert', permission: ['safety.report.daycare', 'safety.manage.daycare'], route: '/app/safety', modal: 'incident' },
    { label: 'New task', icon: 'list-plus', permission: ['tasks.read.own', 'tasks.manage.daycare'], route: '/app/tasks', modal: 'task' },
    { label: 'New announcement', icon: 'megaphone', permission: 'announcements.manage.daycare', route: '/app/communications', modal: 'announcement' },
    { label: 'New enquiry', icon: 'inbox', permission: 'admissions.manage.daycare', route: '/app/admissions', modal: 'enquiry' },
    { label: 'Report absence', icon: 'calendar-x', permission: 'parent.absence.report.own', route: '/parent/attendance', modal: 'parentAbsence' }
  ];

  /**
   * Skeleton shimmer: the page's rough shape painted instantly while data
   * loads. Dashboards get a stat grid plus card columns; every other screen
   * gets a title block and stacked card outlines.
   */
  function skeletonHtml(loadedRoute) {
    const isDashboard = loadedRoute && loadedRoute.path === '/app/today';
    let html = '<div class="skel-wrap" aria-hidden="true"><div class="page-head"><div>' +
      '<div class="skel skel-title"></div><div class="skel skel-line" style="width:64%"></div></div></div>';
    if (isDashboard) {
      html += '<div class="grid grid-4">' + Array(4).fill('<div class="card stat-card"><div class="skel skel-badge"></div><div class="skel skel-big"></div><div class="skel skel-line" style="width:70%"></div></div>').join('') + '</div>';
      html += '<div class="split"><div class="stack">' + Array(2).fill('<div class="card"><div class="skel skel-badge" style="width:34%"></div><div class="skel skel-block"></div><div class="skel skel-line"></div><div class="skel skel-line" style="width:80%"></div></div>').join('') + '</div><div class="stack">' + Array(2).fill('<div class="card"><div class="skel skel-badge" style="width:28%"></div><div class="skel skel-line"></div><div class="skel skel-line" style="width:88%"></div><div class="skel skel-line" style="width:60%"></div></div>').join('') + '</div></div>';
    } else {
      html += '<div class="stack">' + Array(3).fill('<div class="card"><div class="skel skel-badge" style="width:30%"></div><div class="skel skel-line"></div><div class="skel skel-line" style="width:76%"></div><div class="skel skel-block" style="height:64px"></div></div>').join('') + '</div>';
    }
    html += '</div>';
    return html;
  }

  /**
   * Sample data for empty workspaces. Every row is prefixed so it can never
   * collide with real records, and apiAction blocks all writes while this is
   * previewed. Real enough to teach the workflow, obviously fake.
   */
  const SAMPLE_DATA = {
    activities: { rows: [
      { id: 'smp-act-1', title: 'Rainbow finger painting', description: 'Mixing primary colours to make every colour in the rainbow.', age_group: '3-5 Years', activity_type: 'creative', duration_minutes: 40, materials: 'Poster paint, thick brushes, paper', status: 'active', safety_notes: 'Aprons on — this one is gloriously messy.' },
      { id: 'smp-act-2', title: 'Counting with bottle caps', description: 'One-to-one correspondence up to ten, sitting in a circle.', age_group: '4-5 Years', activity_type: 'numeracy', duration_minutes: 20, materials: 'Bottle caps, number cards', status: 'active' },
      { id: 'smp-act-3', title: 'Obstacle course', description: 'Big-muscle climbing, balancing and rolling.', age_group: '4-5 Years', activity_type: 'physical', duration_minutes: 35, materials: 'Cones, hoops, mats', status: 'active', safety_notes: 'Spotters for the climbing section.' }
    ] },
    modules: { modules: [
      { id: 'smp-mod-1', title: 'Our Wonderful World', description: 'Nature, community helpers, weather and the rhythm of the seasons.', theme: 'Nature', age_group: '4-5 Years', duration_weeks: 4, plan_count: 5, done_count: 3, resume_plan_id: null, resume_plan_title: null, status: 'published', created_at: new Date(Date.now() - 86 * 86400000).toISOString() },
      { id: 'smp-mod-2', title: 'Counting, Shapes and Play', description: 'Numbers, shapes and early geometry through play.', theme: 'Numbers', age_group: '4-5 Years', duration_weeks: 4, plan_count: 5, done_count: 1, resume_plan_id: null, resume_plan_title: null, status: 'draft', created_at: new Date(Date.now() - 12 * 86400000).toISOString() }
    ] },
    admissions: { overview: { new_enquiries: 2, pending_applications: 1, approved_applications: 1, waitlisted: 0, capacity: [{ configured_capacity: 65, enrolled: 12 }] },
      enquiries: [
        { id: 'smp-enq-1', guardian_name: 'Naledi Zulu', guardian_email: 'naledi@example.com', guardian_phone: '+27 82 555 0100', child_name: 'Ayanda Zulu', requested_age_group: '3-4 years', source: 'website', branch_name: 'Rosebank', status: 'new', created_at: new Date(Date.now() - 2 * 86400000).toISOString(), updated_at: new Date(Date.now() - 2 * 86400000).toISOString() },
        { id: 'smp-enq-2', guardian_name: 'Pieter Botha', guardian_email: 'pieter.b@example.com', guardian_phone: '+27 83 555 0187', child_name: 'Zoe Botha', requested_age_group: '2-3 years', source: 'phone', branch_name: 'Rosebank', status: 'contacted', created_at: new Date(Date.now() - 9 * 86400000).toISOString(), updated_at: new Date(Date.now() - 4 * 86400000).toISOString() }
      ],
      applications: [
        { id: 'smp-app-1', application_reference: 'APP-2026-0007', child_first_name: 'Ayanda', child_last_name: 'Zulu', guardian_name: 'Naledi Zulu', guardian_email: 'naledi@example.com', requested_classroom_name: 'Butterflies', branch_name: 'Rosebank', preferred_start_date: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10), status: 'submitted', application_fee_amount: 0 }
      ], classrooms: [], feePlans: [] },
    learners: { rows: [
      { id: 'smp-learn-1', first_name: 'Amara', last_name: 'Ncube', learner_reference: 'SAMPLE-2026-001', date_of_birth: new Date(Date.now() - 4 * 365 * 86400000).toISOString().slice(0, 10), age_years: 4, classroom_name: 'Sunflowers', branch_name: 'Rosebank', profile_image_url: null, status: 'enrolled', primary_guardian: { first_name: 'Duduzile', last_name: 'Ncube', phone: '+27 82 555 0111' } },
      { id: 'smp-learn-2', first_name: 'Keano', last_name: 'Botha', learner_reference: 'SAMPLE-2026-002', date_of_birth: new Date(Date.now() - 5 * 365 * 86400000).toISOString().slice(0, 10), age_years: 5, classroom_name: 'Butterflies', branch_name: 'Rosebank', profile_image_url: null, status: 'enrolled', primary_guardian: { first_name: 'Pieter', last_name: 'Botha', email: 'pieter.b@example.com' } },
      { id: 'smp-learn-3', first_name: 'Lia', last_name: 'De Villiers', learner_reference: 'SAMPLE-2026-003', date_of_birth: new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10), age_years: 3, classroom_name: 'Bunnies', branch_name: 'Rosebank', profile_image_url: null, status: 'enrolled', primary_guardian: null }
    ], meta: {}, classrooms: [] }
  };

  function reelApp() {
    return {
      mode: 'loading',
      session: null,
      route: null,
      params: {},
      area: 'app',
      pageTitle: 'Re-EL ECD',
      page: {},
      loading: false,
      error: null,
      errorTitle: null,
      denied: false,
      suspendedWorkspace: false,
      billingLocked: false,
      crumbs: [],
      tab: null,
      filters: {},
      rhymeManage: false,
      rhymeSelect: false,
      rhymeSelection: [],
      sidebarOpen: false,
      sidebarCollapsed: true,
      navFlyout: null,
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1200,
      notifOpen: false,
      notifications: [],
      notifLoading: false,
      theme: 'light',
      density: 'comfortable',
      commandOpen: false,
      guide: null,
      voices: [],
      voiceUri: (function () { try { return localStorage.getItem('reel.voiceUri') || ''; } catch { return ''; } })(),
      commandQuery: '',
      commandResults: [],
      commandIndex: 0,
      quickOpen: false,
      automationSweepBusy: false,
      automationDigestBusy: false,
      modal: null,
      signaturePads: {},
      toasts: [],
      unread: 0,
      _charts: [],
      _chartInstances: [],
      _searchSeq: 0,
      _lastHash: null,
      activeOrganisationId: null,
      platformBrand: null,
      platformBanner: null,
      bannerDismissed: false,
      impersonated: null,
      impersonationTimer: null,
      selectedIds: [],
      libraryBusy: false,
      siteDraft: null,
      siteTab: 'home',
      siteMenuOpen: false,
      publicFormData: {},
      publicFormSchema: [],
      publicUploads: {},
      siteBusy: null,
      storageCheck: null,
      storageChecking: false,
      siteSaving: false,
      siteError: null,
      siteSavedAt: null,
      domainBusy: null,

      get activeMembership() {
        if (!this.session || !this.session.memberships) return null;
        return this.session.memberships.find((m) => m.organisation.id === this.activeOrganisationId) || this.session.memberships[0] || null;
      },
      get activeOrganisation() { return (this.activeMembership && this.activeMembership.organisation) || null; },
      get isPlatformOrg() { return Boolean(this.activeOrganisation && this.activeOrganisation.slug === 're-el-platform'); },
      get brandLogo() {
        const org = this.activeOrganisation;
        if (org && org.logoUrl) return org.logoUrl;
        if (this.area === 'platform' || this.isPlatformOrg || !this.session) return Reel.PLATFORM_LOGO;
        return null;
      },
      get brandName() {
        if (this.area === 'platform') return Reel.PLATFORM_BRAND.name;
        const org = this.activeOrganisation;
        return (org && org.name) || Reel.PLATFORM_BRAND.name;
      },
      get brandTagline() {
        if (this.area === 'platform') return 'Platform console';
        if (this.area === 'parent') return 'Family portal';
        return 'Daycare workspace';
      },
      get brandInitial() { return String(this.brandName || 'R').trim().charAt(0).toUpperCase(); },
      get selectedCount() { return this.selectedIds.length; },
      get permissions() { return (this.activeMembership && this.activeMembership.permissions) || []; },
      get branches() { return (this.activeMembership && this.activeMembership.branches) || []; },
      get organisationTheme() { return (this.activeMembership && this.activeMembership.organisation && this.activeMembership.organisation.theme) || null; },
      get canSwitchOrganisation() { return Boolean(this.session && this.session.memberships && this.session.memberships.length > 1); },
      get isPlatformAdmin() { return Boolean(this.session && this.session.isPlatformAdmin && this.activeMembership && this.activeMembership.roles.some((r) => r.startsWith('platform_'))); },
      get impersonationLabel() {
        return this.impersonated
          ? 'Viewing as ' + (this.session && this.session.user ? this.session.user.displayName + (this.session.user.email ? ' · ' + this.session.user.email : '') : '') + ' · started by ' + (this.impersonated.byName || this.impersonated.byEmail || 'platform admin')
          : '';
      },
      get impersonationTimeLabel() { return this.impersonated && this.impersonated.expiresAt ? 'Expires ' + new Date(this.impersonated.expiresAt).toLocaleTimeString() : ''; },
      get isParentOnly() {
        return this.has('parent.read.own') && !this.has('learners.read.daycare') && !this.has('learners.read.assigned') && !this.has('staff.read.daycare');
      },
      get navGroups() {
        if (!this.session) return [];
        const source = this.area === 'platform' ? NAV.platform : (this.area === 'parent' ? NAV.parent : NAV.app);
        return source.map((group) => ({
          label: group.label,
          items: group.items.filter((item) => this.has(item.permission)).map((item) => Object.assign({}, item, {
            badge: item.path === '/app/tasks' ? () => 0 : null
          }))
        })).filter((group) => group.items.length);
      },
      get quickActions() {
        const isParentAction = (action) => (Array.isArray(action.permission) ? action.permission : [action.permission])
          .some((key) => String(key).startsWith('parent.'));
        return QUICK_ACTIONS.filter((action) => this.has(action.permission) && (this.area === 'app' || (this.area === 'parent' && isParentAction(action))));
      },

      has(permission) {
        if (!permission) return true;
        const permissions = this.permissions;
        const keys = Array.isArray(permission) ? permission : [permission];
        return keys.some((key) => permissions.includes(key) || permissions.includes('*') || permissions.includes('platform.*'));
      },

      async boot() {
        window.ReelApp = this;
        if (window.Reel && Reel.feedback) Reel.feedback.init();
        if (window.Reel && Reel.rhymePlayer) Reel.rhymePlayer.init();
        this._pendingTick = [];
        this.nextTick = (fn) => {
          const tick = () => Promise.resolve().then(() => {
            if (typeof fn === 'function') {
              try { fn.call(this); } catch (err) { console.warn('nextTick callback failed', err); }
            }
          });
          return tick();
        };
        this.refreshVoices();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.onvoiceschanged = () => this.refreshVoices();
        }
        // Default to light for a consistent first impression; honour an explicit choice.
        try { this.theme = localStorage.getItem('reel.theme') || 'light'; } catch { this.theme = 'light'; }
        try {
          this.density = localStorage.getItem('reel.density') === 'compact' ? 'compact' : 'comfortable';
          document.documentElement.dataset.density = this.density;
        } catch { this.density = 'comfortable'; }
        try { this.sidebarCollapsed = localStorage.getItem('reel.sidebar') !== 'expanded'; } catch { this.sidebarCollapsed = true; }
        this.viewportWidth = window.innerWidth;
        window.addEventListener('resize', () => {
          this.viewportWidth = window.innerWidth;
          this.navFlyout = null;
          if (this.viewportWidth >= 961) this.sidebarOpen = false;
          this.syncBodyScroll();
          this.refreshIcons();
        });
        document.documentElement.dataset.theme = this.theme;
        this.installIconObserver();
        window.addEventListener('hashchange', () => this.navigate());
        try {
          const payload = await Reel.api('GET', '/auth/session', null, { organisationId: null });
          this.applySession(payload.data);
        } catch (error) {
          this.session = null;
        }
        if (!this.session) await this.loadPlatformBranding();
        if (!location.hash && Reel.isPlatformHost && Reel.isPlatformHost()) {
          // replaceState avoids a second hashchange-driven navigate on boot.
          history.replaceState(null, '', '#' + (this.session ? this.defaultRoute() : '/'));
        }
        await this.navigate();
        if (window.Reel && Reel.analytics) Reel.analytics.pageView();
      },

      installIconObserver() {
        if (!window.MutationObserver) return;
        let observer = null;
        let scheduled = false;
        const render = () => {
          scheduled = false;
          if (observer) observer.disconnect();
          try { this.renderIconsNow(); } finally {
            if (observer) observer.observe(document.body, { childList: true, subtree: true });
          }
        };
        observer = new MutationObserver(() => {
          if (scheduled) return;
          // Lucide leaves data-lucide on the <svg> it creates. Watching every
          // mutation would therefore re-scan the whole page on each frame, so
          // only wake up when an unconverted placeholder is waiting.
          if (!document.querySelector('i[data-lucide]')) return;
          scheduled = true;
          window.requestAnimationFrame(render);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      },

      /**
       * Draw any pending <i data-lucide> placeholders. Existing <svg> icons
       * also carry data-lucide, so they are hidden from Lucide during the pass
       * and restored afterwards; otherwise every call would rebuild the whole
       * icon set.
       */
      renderIconsNow() {
        if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
        const existing = Array.from(document.querySelectorAll('svg[data-lucide]'))
          .map((node) => [node, node.getAttribute('data-lucide')]);
        existing.forEach(([node]) => node.removeAttribute('data-lucide'));
        try {
          window.lucide.createIcons();
        } finally {
          existing.forEach(([node, name]) => node.setAttribute('data-lucide', name));
        }
      },

      applySession(payload) {
        this.session = payload;
        this.impersonated = payload.impersonated || null;
        if (Reel.setCsrf) Reel.setCsrf(payload.csrfToken || null);
        const stored = (() => { try { return localStorage.getItem('reel.activeOrganisation'); } catch { return null; } })();
        const candidate = payload.memberships.find((m) => m.organisation.id === stored);
        this.activeOrganisationId = (candidate && candidate.organisation.id) || payload.activeOrganisationId || (payload.memberships[0] && payload.memberships[0].organisation.id) || null;
        try { if (this.activeOrganisationId) localStorage.setItem('reel.activeOrganisation', this.activeOrganisationId); } catch { /* ignore */ }
        if (Reel.applyTheme) Reel.applyTheme(this.organisationTheme);
        if (!this.platformBrand) this.loadPlatformBranding();
        this.refreshUnread(true);
      },

      async refreshSession() {
        try {
          const payload = await Reel.api('GET', '/auth/session', null, { organisationId: null });
          this.applySession(payload.data);
        } catch (error) {
          if (window.console) console.warn('Session refresh failed', error);
        }
      },

      /**
       * Public platform branding for the sign-in screen and any signed-out
       * surface. Falls back to the bundled logo when the platform logo has not
       * been uploaded yet, so the brand is never missing.
       */
      async loadPlatformBranding() {
        try {
          const payload = await Reel.api('GET', '/public/platform', null, { organisationId: null });
          this.platformBrand = payload.data || null;
          this.platformBanner = (this.platformBrand && this.platformBrand.banner && this.platformBrand.banner.message) ? this.platformBrand.banner : null;
          if (!this.platformBanner) this.bannerDismissed = true;
          if (this.platformBrand && Reel.analytics && Reel.analytics.configure) {
            Reel.analytics.configure(this.platformBrand.analytics);
          }
          // The platform palette belongs to signed-out surfaces and the
          // platform console. Applying it to a signed-in tenant would clobber
          // that centre's own colours (the tenant theme is applied in
          // applySession before this async lookup returns).
          const platformSurface = !this.session || this.isPlatformAdmin || this.isPlatformOrg;
          if (platformSurface && this.platformBrand && this.platformBrand.branding && Reel.applyTheme) {
            Reel.applyTheme(this.platformBrand.branding);
          }
        } catch (error) {
          this.platformBrand = null;
        }
      },

      async applyOrganisationTheme(id) {
        try {
          await Reel.api('POST', '/organisation/themes/' + encodeURIComponent(id) + '/apply', {});
          await this.refreshSession();
          this.toast('Theme applied to your workspace and website.');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'The theme could not be applied.', 'error');
        }
      },

      /**
       * Run the server-side R2 round trip. This is the honest answer to "why
       * does my logo upload fail?" — a 401 here is credentials, not CORS.
       */
      async checkStorage() {
        this.storageChecking = true;
        this.storageCheck = null;
        try {
          const payload = await Reel.api('POST', '/platform/storage/check', {});
          this.storageCheck = payload.data;
          const diagnosis = payload.data && payload.data.diagnosis;
          this.toast(payload.data && payload.data.ok
            ? 'Object storage is working end to end.'
            : (diagnosis ? diagnosis.message : 'The storage check failed.'),
          payload.data && payload.data.ok ? 'success' : 'error');
        } catch (error) {
          this.toast(error.message || 'The storage check could not run.', 'error');
        } finally {
          this.storageChecking = false;
        }
      },

      async extractLogoPalette() {
        const membership = this.activeMembership;
        const pageOrg = this.page && this.page.organisation;
        const platform = this.area === 'platform';
        const logo = (membership && membership.organisation && membership.organisation.logoUrl)
          || (pageOrg && (pageOrg.logo_url || pageOrg.logoUrl))
          || (platform ? Reel.PLATFORM_LOGO : null);
        if (!logo) { this.toast('Upload a logo first, then extract its colours.', 'warn'); return; }
        this.toast('Reading colours from your logo…', 'info');
        try {
          const palette = await Reel.paletteFromImage(logo, 8);
          const picked = Reel.brandPalette(palette);
          const primary = picked.primary;
          const secondary = picked.secondary;
          const accent = picked.accent;
          const background = Reel.mix(primary, '#FFFFFF', 0.93);
          const text = Reel.onColour(background);
          const tokens = {
            primary, secondary, accent, background,
            surface: '#FFFFFF', text, onPrimary: Reel.onColour(primary)
          };
          if (platform) {
            this.openModal({
              title: 'Apply the Re-EL palette',
              endpoint: '/platform/settings',
              method: 'PATCH',
              submitLabel: 'Apply colours',
              size: 'wide',
              description: 'We sampled the strongest colours from the Re-EL ECD logo. Adjust anything before applying it across the platform.',
              fields: [
                { name: 'primary', label: 'Primary', type: 'colour', value: primary, required: true },
                { name: 'secondary', label: 'Secondary', type: 'colour', value: secondary, required: true },
                { name: 'accent', label: 'Accent', type: 'colour', value: accent, required: true },
                { name: 'background', label: 'Background', type: 'colour', value: background },
                { name: 'surface', label: 'Surface', type: 'colour', value: '#FFFFFF' },
                { name: 'text', label: 'Text', type: 'colour', value: text }
              ],
              transform: (data) => ({
                primaryColour: data.primary,
                secondaryColour: data.secondary,
                accentColour: data.accent,
                themeTokens: {
                  primary: data.primary, secondary: data.secondary, accent: data.accent,
                  background: data.background, surface: data.surface, text: data.text,
                  onPrimary: Reel.onColour(data.primary)
                }
              })
            });
            return;
          }
          this.openModal({
            title: 'Create a theme from your logo',
            endpoint: '/organisation/themes',
            submitLabel: 'Save theme',
            size: 'wide',
            description: 'We sampled the strongest colours from your logo. Adjust anything before saving.',
            fields: [
              { name: 'name', label: 'Theme name', required: true, value: 'Logo palette' },
              { name: 'primary', label: 'Primary', type: 'colour', value: primary, required: true },
              { name: 'secondary', label: 'Secondary', type: 'colour', value: secondary, required: true },
              { name: 'accent', label: 'Accent', type: 'colour', value: accent, required: true },
              { name: 'background', label: 'Background', type: 'colour', value: background },
              { name: 'surface', label: 'Surface', type: 'colour', value: '#FFFFFF' },
              { name: 'text', label: 'Text', type: 'colour', value: text }
            ],
            transform: (data) => ({
              name: data.name,
              tokens: {
                primary: data.primary, secondary: data.secondary, accent: data.accent,
                background: data.background, surface: data.surface, text: data.text
              }
            })
          });
        } catch (error) {
          this.toast(error.message || 'The logo colours could not be read.', 'error');
        }
      },

      defaultRoute() {
        if (!this.session) return '/login';
        if (this.isPlatformAdmin) return '/platform/overview';
        if (this.isParentOnly) return '/parent/overview';
        return '/app/today';
      },

      /**
       * Morph breadcrumb trail: workspace/portal › section › current page.
       * Parent crumbs are links; the current page is the highlighted crumb.
       */
      computeCrumbs(route) {
        if (!route || route.area === 'public') return [];
        const groups = NAV[route.area] || [];
        const home = route.area === 'app'
          ? { label: this.brandName || 'Workspace', path: '/app/today' }
          : route.area === 'platform'
            ? { label: 'Platform', path: '/platform/overview' }
            : route.area === 'parent'
              ? { label: 'Parent portal', path: '/parent/overview' }
              : null;
        let match = null;
        for (const group of groups) {
          const item = group.items.find((entry) => entry.path === route.path);
          if (item) { match = { group, item }; break; }
        }
        // Detail pages (for example /app/learners/:id) belong to the section
        // whose landing route matches the first two path segments.
        if (!match && route.area && groups.length) {
          const prefix = '/' + String(route.path || '').split('/').filter(Boolean).slice(0, 2).join('/');
          for (const group of groups) {
            const item = group.items.find((entry) => prefix === entry.path || prefix.startsWith(entry.path + '/'));
            if (item) { match = { group, item }; break; }
          }
        }
        const crumbs = [];
        if (home) crumbs.push(home);
        if (match) {
          const landing = match.group.items[0].path;
          if (match.item.path !== landing) crumbs.push({ label: match.group.label, path: landing });
          if (route.path !== match.item.path) {
            crumbs.push({ label: match.item.label, path: match.item.path });
            crumbs.push({ label: route.title, path: null });
          } else {
            crumbs.push({ label: match.item.label, path: null });
          }
        } else {
          crumbs.push({ label: route.title, path: null });
        }
        return crumbs;
      },

      /** Position the morph highlight behind the current crumb. */
      updateCrumbHighlight() {
        const nav = document.querySelector('.crumbs');
        if (!nav) return;
        const current = nav.querySelector('.crumb.current');
        if (!current || current.offsetParent === null) {
          nav.style.removeProperty('--crumb-left');
          nav.style.removeProperty('--crumb-width');
          return;
        }
        const navRect = nav.getBoundingClientRect();
        const rect = current.getBoundingClientRect();
        nav.style.setProperty('--crumb-left', Math.max(0, rect.left - navRect.left) + 'px');
        nav.style.setProperty('--crumb-width', Math.max(0, rect.width) + 'px');
        nav.classList.add('is-measured');
      },

      async switchOrganisation(id) {
        if (!id || id === this.activeOrganisationId) return;
        this.activeOrganisationId = id;
        try { localStorage.setItem('reel.activeOrganisation', id); } catch { /* ignore */ }
        if (Reel.applyTheme) Reel.applyTheme(this.organisationTheme);
        const target = this.isPlatformAdmin ? '/platform/overview' : (this.isParentOnly ? '/parent/overview' : '/app/today');
        if (this.area === 'platform' && !this.isPlatformAdmin) location.hash = target;
        else await this.navigate(true);
      },

      parseHash() {
        // On a tenant-owned domain the root address is the public website, not
        // the staff sign-in screen. On the platform host, show the marketing homepage.
        const fallback = Reel.isPlatformHost && Reel.isPlatformHost() ? '/' : '/site';
        const raw = (location.hash || '#' + fallback).replace(/^#/, '') || fallback;
        const [path, queryString] = raw.split('?');
        const query = {};
        new URLSearchParams(queryString || '').forEach((value, key) => { query[key] = value; });
        return { path: path || fallback, query };
      },

      async navigate(force) {
        // Two navigations can overlap (for example a hash change plus a direct
        // call). Only the newest one may render, otherwise stale data and
        // duplicate charts leak onto the screen.
        const seq = (this._navSeq = (this._navSeq || 0) + 1);
        try {
          return await this.navigateInner(force, seq);
        } finally {
          // Alpine can coalesce the final loading change when navigations
          // overlap; make the spinner state match the data exactly.
          if (seq === this._navSeq) this.syncLoading();
        }
      },

      syncLoading() {
        const block = document.querySelector('.content > .loading-block');
        if (!block) return;
        block.style.display = this.loading ? 'flex' : 'none';
      },

      async navigateInner(force, seq) {
        const { path, query } = this.parseHash();
        // Overview has been merged into Today.
        if (path === '/app/overview') { location.hash = '#/app/today'; return; }
        this.selectedIds = [];
        this.query = query;
        const matched = matchRoute(path);
        if (!matched) {
          if (Reel.resetSeo) Reel.resetSeo();
          this.crumbs = [];
          this.denied = false;
          this.suspendedWorkspace = false;
          this.billingLocked = false;
          this.loading = false;
          this.error = null;
          this.pageTitle = 'Page not found';
          if (this.session) {
            this.mode = 'app';
            this.area = this.isPlatformAdmin ? 'platform' : (this.isParentOnly ? 'parent' : 'app');
            this.renderHtml('<section class="not-found"><div class="not-found-inner">' +
              '<div class="not-found-code">404</div>' +
              '<h1>We could not find that page</h1>' +
              '<p>The page <span class="mono">' + Reel.esc(path) + '</span> does not exist, or it may have moved. ' +
              'Check the address or head back to your overview.</p>' +
              '<div class="not-found-actions"><a class="btn btn-primary" href="#' + this.defaultRoute() + '">Go to your overview</a>' +
              '<button class="btn btn-secondary" @click="navigate()">Try again</button></div></div></section>');
          } else {
            this.renderNotFound(path);
          }
          return;
        }
        this.route = matched.route;
        this.params = matched.params;
        this.area = matched.route.area;
        this.pageTitle = matched.route.title;
        this.crumbs = this.computeCrumbs(matched.route);
        if (query.tab) this.tab = query.tab;

        if (matched.route.area === 'parent' && this.session) {
          // Activation journey: log the visit, remember the digest open when
          // the parent came from Friday's email (src=weekly-digest).
          Reel.api('POST', '/parent/visit', { source: query.src || null }).catch(() => null);
        }

        if (matched.route.area === 'public') {
          this.mode = 'public';
          this.loading = false;
          await this.renderPublic(matched.route, matched.params, seq);
          return;
        }

        // Leaving a tenant website: restore the product's own title, meta tags
        // and favicon so the workspace never inherits a tenant's SEO.
        if (Reel.resetSeo) Reel.resetSeo();

        if (!this.session) {
          this.mode = 'login';
          this.loading = false;
          if (!this.platformBrand) await this.loadPlatformBranding();
          this.renderAuth();
          return;
        }

        if (matched.route.path === '/login') {
          location.hash = this.defaultRoute();
          return;
        }

        if (matched.route.area === 'platform' && !this.isPlatformAdmin) {
          this.mode = 'app';
          this.denied = true;
          this.billingLocked = false;
          this.loading = false;
          return;
        }

        if (matched.route.area === 'parent' && !this.has('parent.read.own')) {
          this.mode = 'app';
          this.denied = true;
          this.billingLocked = false;
          this.loading = false;
          return;
        }

        this.mode = 'app';
        this.denied = false;
        this.suspendedWorkspace = false;
        this.billingLocked = false;
        this.error = null;
        this.loading = true;
        this.sidebarOpen = false;
        this.syncBodyScroll();
        if (!force) {
          this.tab = query.tab || null;
          this.filters = {};
          if (query.unmarked) this.filters.unmarked = query.unmarked;
        if (query.classroomId) this.filters.classroomId = query.classroomId;
        }
        this._charts = [];
        this.destroyCharts();

        if (!this.has(matched.route.permission)) {
          this.denied = true;
          this.billingLocked = false;
          this.loading = false;
          return;
        }

        try {
          const view = V[matched.route.view];
          if (!view) throw new Error('This screen has not been implemented.');
          // Skeleton shimmer: paint the page's shape immediately so the frame
          // feels instant, then swap in real content when the data arrives.
          if (seq === this._navSeq) this.renderHtml(skeletonHtml(matched.route));
          const page = (view.load ? await view.load(this, matched.params) : {}) || {};
          if (seq !== this._navSeq) return;
          this.page = page;
          const html = view.render ? view.render(this, matched.params, this.page) : '';
          this.renderHtml(html);
          this.loading = false;
          await this.nextTick();
          this.afterRender();
        } catch (error) {
          if (seq !== this._navSeq) return;
          this.loading = false;
          if (error instanceof Reel.ApiError && (error.code === 'FORBIDDEN' || error.status === 403)) {
            const billingLock = Boolean(error.details && error.details.billingLock) || /subscription payment is overdue/i.test(error.message || '');
            this.suspendedWorkspace = billingLock || /suspended/i.test(error.message || '');
            this.billingLocked = billingLock;
            this.denied = true;
            return;
          }
          if (error instanceof Reel.ApiError && error.code === 'UNAUTHENTICATED') {
            if (Reel.setCsrf) Reel.setCsrf(null);
            this.session = null;
            this.mode = 'login';
            this.renderAuth();
            return;
          }
          this.error = error.message || 'Unable to load this page.';
          this.errorTitle = 'Could not load ' + matched.route.title;
          if (window.console) console.error(error);
        }
      },

      renderHtml(html) {
        const root = document.getElementById('view-root');
        if (!root) return;
        if (Reel.setRobots && this.route && this.route.area !== 'public') Reel.setRobots('noindex, nofollow');
        if (window.Alpine && window.Alpine.destroyTree) window.Alpine.destroyTree(root);
        root.innerHTML = html;
        if (window.Alpine && window.Alpine.initTree) window.Alpine.initTree(root);
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      },

      /**
       * A signed-out visitor who follows a broken link still gets a branded
       * page instead of a blank screen. It uses the public shell so the sign-in
       * form is not forced on someone who was only looking for a page.
       */
      renderNotFound(path) {
        this.mode = 'public';
        this.loading = false;
        this.pageTitle = 'Page not found';
        const platformOrg = (this.platformBrand && this.platformBrand.organisation) || {};
        const brandLogo = platformOrg.logoUrl || Reel.PLATFORM_LOGO;
        const brandTheme = (this.platformBrand && this.platformBrand.branding) || Reel.PLATFORM_BRAND.theme;
        const html = '<div class="public site" ' + Reel.themeStyle(brandTheme) + '><nav class="public-nav site-nav">' +
          '<a class="site-brand" href="#/login"><span class="auth-brand-logo"><img src="' + Reel.attr(brandLogo) + '" alt="' + Reel.attr(Reel.PLATFORM_BRAND.name) + '"></span>' +
          '<span><span class="brand-name">' + Reel.esc(Reel.PLATFORM_BRAND.name) + '</span><span class="brand-sub">' + Reel.esc(Reel.PLATFORM_BRAND.tagline) + '</span></span></a>' +
          '<div class="links"><a href="#/login">Sign in</a></div></nav>' +
          '<section class="not-found"><div class="not-found-inner">' +
          '<div class="not-found-code">404</div>' +
          '<h1>We could not find that page</h1>' +
          '<p>The page <span class="mono">' + Reel.esc(path) + '</span> does not exist, or it may have moved. ' +
          'If you followed a link from a daycare website, check the address with the centre.</p>' +
          '<div class="not-found-actions"><a class="btn btn-primary" href="#/login">Go to sign in</a>' +
          '<a class="btn btn-secondary" href="https://ecd.re-el.co.za">About Re-EL ECD</a></div></div></section></div>';
        const root = document.getElementById('public-root');
        if (root) {
          if (window.Alpine && window.Alpine.destroyTree) window.Alpine.destroyTree(root);
          root.innerHTML = html;
          if (window.Alpine && window.Alpine.initTree) window.Alpine.initTree(root);
        }
        if (Reel.applySeo) {
          Reel.applySeo({
            title: 'Page not found | Re-EL ECD',
            description: 'The page you followed could not be found.',
            canonical: location.origin + '/'
          }, { robots: 'noindex, nofollow' });
        }
      },

      afterRender(opts) {
        const silent = Boolean(opts && opts.silent);
        this.renderIconsNow();
        this.mountCharts();
        if (this.route && this.route.view === 'whiteboardDetail' && window.Reel && window.Reel.views && window.Reel.views._initWhiteboard) {
          try { window.Reel.views._initWhiteboard(this, this.page); } catch (e) { console.warn('whiteboard init failed', e); }
        }
        if (this.route && this.route.view === 'whiteboards' && window.Reel && window.Reel.views && window.Reel.views._initWhiteboards) {
          try { window.Reel.views._initWhiteboards(this, this.page); } catch (e) { console.warn('whiteboard thumbnails failed', e); }
        }
        if (!silent && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const root = document.getElementById('view-root');
          if (root && window.Reel && window.Reel.anim) {
            // Window transition: the new route zooms into place, then widgets
            // bloom with spring physics, staggered across the page.
            window.Reel.anim.routeZoom(root);
            // Cap the stagger: 33 cards blooming at once reads as noise, and
            // a long queue of delayed animations slows down every navigation.
            window.Reel.anim.bloomStagger([...root.querySelectorAll('.card, .stat-card, .today-pill, .page-head, .table-wrap, .theme-card')].slice(0, 12));
            window.Reel.anim.countUp(root.querySelectorAll('.stat-value'));
            this.animateRings(root);
          }
        }
        // Sample-data banner: visible, unmissable, one click to exit.
        const staleBanner = document.querySelector('.sample-banner');
        if (this.page && this.page.sampleMode) {
          if (staleBanner) staleBanner.remove();
          const banner = document.createElement('div');
          banner.className = 'sample-banner';
          banner.innerHTML = '<strong>Sample data</strong><span>This preview is not saved — nothing you do here reaches the centre.</span><button type="button" class="btn btn-sm btn-secondary" data-sample-exit="1">Exit preview</button>';
          banner.querySelector('[data-sample-exit]').addEventListener('click', () => this.exitSampleData());
          const root = document.getElementById('view-root');
          if (root) root.prepend(banner);
        } else if (staleBanner) {
          staleBanner.remove();
        }
        this.nextTick(() => this.updateCrumbHighlight());
        this.refreshUnread();
        // Live presence tab: refresh every 10s while the app is visible so the
        // gate/register feed never goes stale on a classroom tablet.
        if (this.route && this.route.path === '/app/learner-attendance' && this.tab === 'presence') {
          if (!this._presencePoll) {
            this._presencePoll = setInterval(() => { if (document.visibilityState === 'visible') this.navigate(true); }, 10000);
          }
        } else if (this._presencePoll) {
          clearInterval(this._presencePoll);
          this._presencePoll = null;
        }
        this.syncTodayLive();
        this.initTodayDeck();
        if (this.route && this.route.path === '/app/today') {
          this.initTodayJump();
          this.initTodayInteractionGuard();
        }
        this.installFeedbackSwipes();
        // Liquid-glass scroll edges: fade the edges of real scrollers while
        // leaving short content untouched (dataset guard avoids rebinding).
        if (window.Reel && Reel.anim && Reel.anim.setupScrollEdges) {
          Reel.anim.setupScrollEdges(document);
        }
        if (window.Reel && Reel.feedback && this.route && this.route.path === '/app/today') {
          setTimeout(() => Reel.feedback.maybeRate(), 900);
        }
      },

      /** Swipe right on a day/calendar row for its action sheet. */
      installFeedbackSwipes() {
        if (!window.Reel || !Reel.feedback || !Reel.feedback.swipe) return;
        [...document.querySelectorAll('.cal-agenda-row[data-event-id]')].forEach((row) => {
          const id = row.getAttribute('data-event-id');
          Reel.feedback.swipe(row, { onRight: () => Reel.feedback.sheet({
            title: 'Activity actions',
            actions: [
              { label: 'Open details', icon: 'eye', run: () => this.openNamedModal('calEvent', id) },
              { label: 'Edit / reschedule', icon: 'pencil', run: () => this.openNamedModal('calEdit', id) },
              { label: 'Duplicate', icon: 'copy', run: () => this.openNamedModal('calDuplicate', id) },
              { label: 'Delete', icon: 'trash-2', tone: 'danger', run: () => this.openNamedModal('calDelete', id) }
            ]
          }, row) });
        });
        [...document.querySelectorAll('.today-block[data-block]')].forEach((card) => {
          const id = card.getAttribute('data-block');
          const block = ((this.page || {}).today || {}).timeline
            ? this.page.today.timeline.find((b) => b.id === id) : null;
          if (!block) return;
          Reel.feedback.swipe(card, { threshold: 90, onRight: () => {
            const actions = [];
            actions.push({ label: 'Teach full lesson', icon: 'presentation', run: () => this.openLesson(block.id) });
            if (block.lessonPlanId) actions.push({ label: 'Guide only', icon: 'book-open', run: () => this.openGuide(block.lessonPlanId) });
            if (block.status === 'scheduled') actions.push({ label: 'Start block', icon: 'play', run: () => this.act('POST', '/curriculum/calendar/events/' + id + '/start', {}, { successMessage: 'Block started — enjoy teaching.' }) });
            if (block.status === 'in_progress') actions.push({ label: 'Complete block', icon: 'check-circle', run: () => this.openNamedModal('completeBlock', id) });
            actions.push({ label: 'Capture a moment', icon: 'camera', run: () => this.openNamedModal('blockObserve', id) });
            Reel.feedback.sheet({ title: block.title, message: 'Swipe actions — pick what you want to do next.', actions }, card);
          } });
        });
      },

      toggleFeedback(name) {
        if (!window.Reel || !Reel.feedback) return;
        Reel.feedback.setPref(name, !Reel.feedback.prefs()[name]);
        this.navigate(true);
      },

      /* ---- Whiteboards: creation menu and board actions ------------------ */

      wbNewMenu(anchor) {
        if (!Reel.feedback) return;
        Reel.feedback.sheet({
          title: 'New whiteboard',
          message: 'Start blank, borrow a ready-made frame, or link a board to a lesson plan.',
          actions: [
            { label: 'Blank canvas', icon: 'pen-tool', run: () => this.openNamedModal('whiteboard') },
            { label: 'Maths canvas', icon: 'sigma', run: () => this.openNamedModal('whiteboardTemplate', 'math') },
            { label: 'Story retell', icon: 'book-open', run: () => this.openNamedModal('whiteboardTemplate', 'story') },
            { label: 'Rhyme / song board', icon: 'music', run: () => this.openNamedModal('whiteboardTemplate', 'rhyme') },
            { label: 'Shape sorter', icon: 'shapes', run: () => this.openNamedModal('whiteboardTemplate', 'shape') },
            { label: 'From a lesson plan', icon: 'graduation-cap', run: () => this.openNamedModal('whiteboardFromPlan') }
          ]
        }, anchor);
      },

      wbBoardMenu(id, anchor) {
        if (!Reel.feedback) return;
        const board = ((this.page || {}).boards || []).find((b) => b.id === id) || {};
        Reel.feedback.sheet({
          title: board.title || 'Whiteboard',
          message: 'Manage this board for your whole team.',
          actions: [
            { label: 'Open board', icon: 'external-link', run: () => { location.hash = '#/app/whiteboards/' + encodeURIComponent(id); } },
            { label: 'Rename / edit details', icon: 'pencil', run: () => this.wbRenameBoard(id) },
            { label: 'Duplicate board', icon: 'copy', run: () => this.wbDuplicateBoard(id) },
            { label: board.isArchived ? 'Restore from archive' : 'Archive board', icon: 'archive', run: () => this.wbArchiveBoard(id, Boolean(board.isArchived)) },
            { label: 'Delete board', icon: 'trash-2', tone: 'danger', run: () => this.wbDeleteBoard(id) }
          ]
        }, anchor);
      },

      wbRenameBoard(id) {
        const board = ((this.page || {}).boards || []).find((b) => b.id === id) || {};
        this.openModal({
          title: 'Whiteboard details',
          endpoint: '/whiteboards/' + encodeURIComponent(id),
          method: 'PATCH',
          submitLabel: 'Save details',
          successMessage: 'Whiteboard updated.',
          fields: [
            { name: 'title', label: 'Title', required: true, value: board.title || '' },
            { name: 'description', label: 'Description', type: 'textarea', value: board.description || '' }
          ],
          onSuccess: () => this.navigate(true)
        });
      },

      async wbDuplicateBoard(id) {
        try {
          const res = await Reel.api('GET', '/whiteboards/' + encodeURIComponent(id));
          const board = (res && res.data) || res;
          const copy = await Reel.api('POST', '/whiteboards', {
            title: String((board && board.title) || 'Whiteboard').slice(0, 190) + ' (copy)',
            description: (board && board.description) || '',
            state: (board && board.state) || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } }
          });
          this.toast('Whiteboard duplicated.');
          if (copy && copy.data && copy.data.id) location.hash = '#/app/whiteboards/' + copy.data.id;
          else await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'The board could not be duplicated.', 'error');
        }
      },

      async wbArchiveBoard(id, restore) {
        try {
          await Reel.api('PATCH', '/whiteboards/' + encodeURIComponent(id), { isArchived: !restore });
          this.toast(restore ? 'Whiteboard restored.' : 'Whiteboard archived.');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'The board could not be updated.', 'error');
        }
      },

      wbDeleteBoard(id) {
        if (!Reel.feedback) return;
        Reel.feedback.sheet({
          title: 'Delete this whiteboard?',
          message: 'This removes the board and its saved versions for everyone at your centre.',
          actions: [{
            label: 'Delete whiteboard', icon: 'trash-2', tone: 'danger', run: async () => {
              try {
                await Reel.api('DELETE', '/whiteboards/' + encodeURIComponent(id));
                this.toast('Whiteboard deleted.');
                await this.navigate(true);
              } catch (error) {
                this.toast(error.message || 'The board could not be deleted.', 'error');
              }
            }
          }]
        });
      },

      /* ---- Nursery rhymes: transport, curation and lesson prep ---------- */

      rhymeUrl(id) {
        const audio = (this.page && this.page.rhymeAudio) || {};
        return audio[id] || '';
      },

      playRhyme(id) {
        const url = this.rhymeUrl(id);
        if (!url) { this.toast('No recording attached to this rhyme yet.', 'info'); return; }
        const rhyme = Reel.nurseryRhymes && Reel.nurseryRhymes.find(id);
        if (Reel.rhymeMeta) Reel.rhymeMeta.remember(id);
        if (Reel.rhymePlayer) Reel.rhymePlayer.toggle(id, url, rhyme && rhyme.title);
      },

      openRhymeReader(id) {
        const rhyme = Reel.nurseryRhymes && Reel.nurseryRhymes.find(id);
        if (!rhyme) return;
        if (Reel.rhymeMeta) Reel.rhymeMeta.remember(id);
        if (Reel.rhymePlayer) Reel.rhymePlayer.openReader(rhyme, this.rhymeUrl(id));
      },

      toggleRhymeFav(id) {
        if (!Reel.rhymeMeta) return;
        const favs = Reel.rhymeMeta.toggleFavourite(id);
        const isFav = favs.indexOf(id) !== -1;
        const card = document.querySelector('[data-rhyme-id="' + id + '"]');
        const button = card && card.querySelector('.rhyme-star');
        if (button) {
          button.classList.toggle('is-fav', isFav);
          button.setAttribute('aria-label', isFav ? 'Remove from favourites' : 'Add to favourites');
        }
        this.toast(isFav ? 'Added to your favourites.' : 'Removed from your favourites.');
      },

      requestRhyme(id) {
        if (!Reel.rhymeMeta) return;
        Reel.rhymeMeta.request(id);
        this.toast('Thanks — we’ve noted your request for this recording.', 'success');
      },

      recordRhymeAudio(id) {
        if (this.has('organisation.settings.manage')) {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'audio/*';
          input.setAttribute('capture', 'environment');
          input.addEventListener('change', (event) => this.attachRhymeAudio(event, id));
          input.click();
          return;
        }
        if (Reel.feedback) Reel.feedback.sheet({
          title: 'Add a recording',
          message: 'Only an administrator can attach audio to the centre’s song library. Ask your principal, or let them know which song you need.',
          actions: [
            { label: 'Request this song', icon: 'bell', run: () => this.requestRhyme(id) }
          ]
        });
      },

      toggleRhymeManage() {
        this.rhymeManage = !this.rhymeManage;
        this.navigate(true);
      },

      toggleRhymeSelect() {
        this.rhymeSelect = !this.rhymeSelect;
        if (!this.rhymeSelect) this.rhymeSelection = [];
        this.navigate(true);
      },

      toggleRhymeSelected(id) {
        const list = (this.rhymeSelection || []).slice();
        const at = list.indexOf(id);
        if (at === -1) list.push(id); else list.splice(at, 1);
        this.rhymeSelection = list;
      },

      clearRhymeSelection() {
        this.rhymeSelection = [];
        this.navigate(true);
      },

      printRhymeSongbook() {
        const ids = (this.rhymeSelection || []).slice();
        if (!ids.length) { this.toast('Select a few songs first.', 'warn'); return; }
        const rhymes = ids.map((id) => Reel.nurseryRhymes && Reel.nurseryRhymes.find(id)).filter(Boolean);
        if (!rhymes.length) return;
        const org = (this.activeMembership && this.activeMembership.organisation && this.activeMembership.organisation.name) || 'Nursery rhymes';
        const today = new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
        let sheet = document.getElementById('rhyme-print-sheet');
        if (!sheet) {
          sheet = document.createElement('div');
          sheet.id = 'rhyme-print-sheet';
          document.body.appendChild(sheet);
        }
        sheet.innerHTML = '<section class="songbook-cover"><p class="cover-eyebrow">Nursery rhyme songbook</p>' +
          '<h1>' + Reel.esc(org) + '</h1><p>' + rhymes.length + ' songs · compiled ' + Reel.esc(today) + '</p>' +
          '<p class="cover-note">Traditional public-domain verses. Words vary by region.</p></section>' +
          rhymes.map((r, i) => '<section class="songbook-page">' +
            '<h2>' + Reel.esc(i + 1) + '. ' + Reel.esc(r.title) + '</h2>' +
            '<p class="small muted">' + Reel.esc(r.category || '') + (r.actions ? ' · ' + Reel.esc(r.actions) : '') + '</p>' +
            '<pre>' + Reel.esc((r.lyrics || []).join('\n')) + '</pre>' +
          '</section>').join('');
        window.print();
      },

      rhymeMenu(id, anchor) {
        if (!Reel.feedback) return;
        const rhyme = Reel.nurseryRhymes && Reel.nurseryRhymes.find(id);
        if (!rhyme) return;
        const url = this.rhymeUrl(id);
        const isFav = Reel.rhymeMeta && Reel.rhymeMeta.favourites().indexOf(id) !== -1;
        const queued = Reel.rhymePlayer && Reel.rhymePlayer.getState().queue.some((item) => item.id === id);
        const actions = [];
        if (url) {
          actions.push({ label: 'Play / pause', icon: 'play', run: () => this.playRhyme(id) });
          actions.push({ label: 'Add to session queue', icon: 'list-plus', run: () => {
            if (Reel.rhymePlayer) Reel.rhymePlayer.enqueue(id, url, rhyme.title);
            this.toast('Added to the session queue.');
          } });
          if (queued) actions.push({ label: 'Remove from queue', icon: 'list-x', run: () => {
            if (Reel.rhymePlayer) Reel.rhymePlayer.removeFromQueue(id);
          } });
        }
        actions.push({ label: isFav ? 'Remove from favourites' : 'Add to favourites', icon: 'star', run: () => this.toggleRhymeFav(id) });
        actions.push({ label: 'Read lyrics', icon: 'book-open', run: () => this.openRhymeReader(id) });
        actions.push({ label: 'Download lyrics (.txt)', icon: 'download', run: () => this.downloadRhymeLyrics(id) });
        actions.push({ label: 'Print this song', icon: 'printer', run: () => this.printRhymeLyrics(id) });
        if (rhyme.source) actions.push({ label: 'Get audio / sheet music', icon: 'external-link', run: () => window.open(rhyme.source, '_blank', 'noopener') });
        Reel.feedback.sheet({ title: rhyme.title, message: 'Everything you can do with this song.', actions }, anchor);
      },

      rhymeMoreMenu(anchor) {
        if (!Reel.feedback) return;
        const actions = [
          { label: 'Download all lyrics', icon: 'file-down', run: () => this.downloadAllRhymeLyrics() },
          { label: this.rhymeSelect ? 'Finish selecting' : 'Select songs for a songbook', icon: 'check-square', run: () => this.toggleRhymeSelect() }
        ];
        if ((this.rhymeSelection || []).length) actions.push({ label: 'Print songbook (' + this.rhymeSelection.length + ')', icon: 'printer', run: () => this.printRhymeSongbook() });
        if (this.has('organisation.settings.manage')) actions.push({ label: this.rhymeManage ? 'Leave manage mode' : 'Manage audio & rhymes', icon: 'settings-2', run: () => this.toggleRhymeManage() });
        actions.push({ label: 'Clear all filters', icon: 'filter-x', run: () => {
          this.filters = {};
          this.navigate(true);
        } });
        Reel.feedback.sheet({ title: 'Song library', message: 'Library-wide actions.', actions }, anchor);
      },

      async deleteRhyme(id) {
        if (!Reel.feedback) return;
        const rhyme = Reel.nurseryRhymes && Reel.nurseryRhymes.find(id);
        if (!rhyme) return;
        Reel.feedback.sheet({
          title: 'Delete ' + rhyme.title + '?',
          message: 'This removes the song from every teacher at your centre. Your own recording will be removed too.',
          actions: [{
            label: 'Delete this rhyme', icon: 'trash-2', tone: 'danger', run: async () => {
              try {
                const custom = ((this.page || {}).rhymeCustom || []).filter((r) => r.id !== id);
                await Reel.api('PATCH', '/organisations/current/settings', { settings: { nurseryRhymes: custom } });
                const map = Object.assign({}, ((this.page || {}).rhymeAudio) || {});
                delete map[id];
                await Reel.api('PATCH', '/organisations/current/settings', { settings: { nurseryRhymeAudio: map } });
                if (Reel.rhymePlayer) Reel.rhymePlayer.stop();
                this.toast('Rhyme deleted.');
                await this.navigate(true);
              } catch (error) {
                this.toast(error.message || 'The rhyme could not be deleted.', 'error');
              }
            }
          }]
        });
      },

      /* ---- Nursery rhymes: plain-text download & print ------------------ */

      rhymeText(id) {
        const rhyme = window.Reel && window.Reel.nurseryRhymes ? window.Reel.nurseryRhymes.find(id) : null;
        if (!rhyme) return null;
        const tags = Reel.rhymeMeta && Reel.rhymeMeta.tagsFor(rhyme);
        const minutes = Reel.rhymeMeta && Reel.rhymeMeta.minutesFor(rhyme);
        return [
          rhyme.title.toUpperCase(),
          'Topic: ' + rhyme.category + (tags && tags.length ? ' · ' + tags.join(', ') : '') +
            (minutes ? ' · about ' + minutes + ' min' : ''),
          '',
          rhyme.lyrics.join('\n'),
          '',
          rhyme.actions ? 'Actions: ' + rhyme.actions : '',
          '',
          rhyme.custom ? 'Added by your centre.' : 'Traditional public-domain verses; wording varies by region.',
          rhyme.source ? 'Audio / sheet music: ' + rhyme.source : ''
        ].filter((line, i, arr) => line !== '' || (arr[i + 1] && arr[i + 1] !== '')).join('\n');
      },

      saveTextFile(filename, text) {
        try {
          const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          return true;
        } catch (e) {
          this.toast('Could not prepare the download.', 'error');
          return false;
        }
      },

      downloadRhymeLyrics(id) {
        const text = this.rhymeText(id);
        if (!text) return;
        const rhyme = window.Reel.nurseryRhymes.find(id);
        const name = String(rhyme.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (this.saveTextFile(name + '-lyrics.txt', text)) this.toast('Lyrics downloaded.');
      },

      downloadAllRhymeLyrics() {
        const lib = window.Reel && window.Reel.nurseryRhymes;
        if (!lib) return;
        const text = [
          'NURSERY RHYMES — TRADITIONAL LYRICS',
          lib.all.length + ' rhymes. Public-domain verses; wording varies by region.',
          '',
          lib.all.map((r) => this.rhymeText(r.id)).join('\n\n' + '-'.repeat(48) + '\n\n')
        ].join('\n');
        if (this.saveTextFile('nursery-rhymes-lyrics.txt', text)) this.toast('All lyrics downloaded.');
      },

      printRhymeLyrics(id) {
        const text = this.rhymeText(id);
        if (!text) return;
        let sheet = document.getElementById('rhyme-print-sheet');
        if (!sheet) {
          sheet = document.createElement('div');
          sheet.id = 'rhyme-print-sheet';
          document.body.appendChild(sheet);
        }
        const rhyme = window.Reel.nurseryRhymes.find(id);
        sheet.innerHTML = '<section class="songbook-page"><h1>' + Reel.esc(rhyme.title) + '</h1>' +
          '<p class="small muted">' + Reel.esc(rhyme.category || '') +
          (rhyme.actions ? ' · ' + Reel.esc(rhyme.actions) : '') + '</p>' +
          '<pre>' + Reel.esc((rhyme.lyrics || []).join('\n')) + '</pre></section>';
        window.print();
      },

      async attachRhymeAudio(event, id) {
        const input = event && event.target;
        const file = input && input.files && input.files[0];
        if (!file) return;
        if (!/^audio\//.test(file.type || '') && !/\.(mp3|m4a|aac|ogg|wav|webm)$/i.test(file.name || '')) {
          this.toast('Choose an audio file (MP3, M4A, OGG or WAV).', 'error');
          return;
        }
        try {
          const asset = await Reel.uploadMedia(file, { scope: 'nursery-rhyme', shared: true });
          if (!asset || !asset.url) throw new Error('The upload did not return a playable URL.');
          await Reel.api('PATCH', '/nursery-rhyme-audio', { id, url: asset.url });
          const rhyme = window.Reel.nurseryRhymes.find(id);
          this.toast('Audio shared with every centre' + (rhyme ? ' for ' + rhyme.title : '') + '.');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'The audio could not be attached.', 'error');
        } finally {
          if (input) input.value = '';
        }
      },

      async removeRhymeAudio(id) {
        try {
          await Reel.api('DELETE', '/nursery-rhyme-audio/' + encodeURIComponent(id));
          this.toast('Audio removed from every centre.');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'The audio could not be removed.', 'error');
        }
      },

      // --- Books -------------------------------------------------------------
      openReader(index) {
        const books = (this.page && this.page.books) || [];
        const book = books[Number(index)];
        if (!book) return;
        const editions = (Array.isArray(book.editions) && book.editions.length)
          ? book.editions.slice().sort((a, b) => (/^english$/i.test(a.language) ? -1 : /^english$/i.test(b.language) ? 1 : String(a.language).localeCompare(String(b.language))))
          : [{ language: book.language || 'English', pdfUrl: book.pdfUrl, coverUrl: book.coverUrl }];
        if (!editions.length) return;
        this.closeReader();
        const reader = { book, editions, edition: 0, page: 1, cleanup: [] };
        const canManage = Boolean(this.page && this.page.canManage);
        const overlay = document.createElement('div');
        overlay.className = 'book-reader';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', book.title + ' — reader');
        const langOptions = editions.map((e, i) => '<option value="' + i + '">' + Reel.esc(e.language) + '</option>').join('');
        overlay.innerHTML =
          '<div class="book-reader-bar">' +
            '<div class="book-reader-title"><i data-lucide="book-open"></i><strong>' + Reel.esc(book.title) + '</strong></div>' +
            '<div class="book-reader-tools">' +
              '<label class="book-reader-lang"><span>Language</span><select id="reader-language">' + langOptions + '</select></label>' +
              '<div class="book-reader-pages"><button type="button" class="btn btn-ghost btn-icon btn-sm" id="reader-prev" aria-label="Previous page"><i data-lucide="chevron-left"></i></button>' +
                '<span id="reader-page">Page 1</span>' +
                '<button type="button" class="btn btn-ghost btn-icon btn-sm" id="reader-next" aria-label="Next page"><i data-lucide="chevron-right"></i></button></div>' +
              '<button type="button" class="btn btn-sm btn-ghost" id="reader-full"><i data-lucide="maximize"></i> Fullscreen</button>' +
              '<a class="btn btn-sm btn-ghost" id="reader-open" target="_blank" rel="noopener"><i data-lucide="external-link"></i> New tab</a>' +
              '<button type="button" class="btn btn-sm btn-ghost" id="reader-print"><i data-lucide="printer"></i> Print</button>' +
              (canManage ? '<button type="button" class="btn btn-sm btn-secondary" id="reader-lang-add"><i data-lucide="languages"></i> Add language</button>' : '') +
              '<button type="button" class="btn btn-ghost btn-icon btn-sm" id="reader-close" aria-label="Close reader"><i data-lucide="x"></i></button>' +
            '</div>' +
          '</div>' +
          '<iframe class="book-reader-frame" id="reader-frame" title="' + Reel.attr(book.title) + '" allowfullscreen></iframe>' +
          '<div class="book-reader-hint">Use the PDF toolbar for zoom and search · ← → to turn pages · Esc to close</div>';
        document.body.appendChild(overlay);
        reader.overlay = overlay;
        reader.frame = overlay.querySelector('#reader-frame');
        reader.pageLabel = overlay.querySelector('#reader-page');
        reader.lang = overlay.querySelector('#reader-language');
        reader.openLink = overlay.querySelector('#reader-open');
        document.body.classList.add('book-reading');
        if (window.lucide && lucide.createIcons) lucide.createIcons();

        const load = () => {
          const url = Reel.resolveMediaUrl(reader.editions[reader.edition].pdfUrl);
          if (!url) return;
          reader.frame.src = url + '#page=' + reader.page + '&zoom=page-fit';
          reader.openLink.href = url;
        };
        reader.load = load;
        load();

        const onLang = () => {
          reader.edition = Number(reader.lang.value) || 0;
          reader.page = 1;
          reader.pageLabel.textContent = 'Page 1';
          load();
        };
        const onPrev = () => { if (reader.page > 1) { reader.page--; reader.pageLabel.textContent = 'Page ' + reader.page; load(); } };
        const onNext = () => { reader.page++; reader.pageLabel.textContent = 'Page ' + reader.page; load(); };
        const onClose = () => this.closeReader();
        const onFull = () => {
          if (document.fullscreenElement === overlay) document.exitFullscreen && document.exitFullscreen();
          else if (overlay.requestFullscreen) overlay.requestFullscreen().catch(() => null);
        };
        const onPrint = () => {
          try { reader.frame.contentWindow.print(); }
          catch (e) { window.open(reader.openLink.href, '_blank', 'noopener'); }
        };
        const onKey = (e) => {
          if (e.key === 'Escape') { e.preventDefault(); this.closeReader(); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
        };
        reader.lang.addEventListener('change', onLang);
        overlay.querySelector('#reader-prev').addEventListener('click', onPrev);
        overlay.querySelector('#reader-next').addEventListener('click', onNext);
        overlay.querySelector('#reader-close').addEventListener('click', onClose);
        overlay.querySelector('#reader-full').addEventListener('click', onFull);
        overlay.querySelector('#reader-print').addEventListener('click', onPrint);
        const addLang = overlay.querySelector('#reader-lang-add');
        if (addLang) addLang.addEventListener('click', () => this.openNamedModal('bookEditionAdd', book.id));
        document.addEventListener('keydown', onKey);
        reader.cleanup.push(() => document.removeEventListener('keydown', onKey));
        this._reader = reader;
      },
      openReaderAt(bookIndex, editionIndex) {
        this.closeModal();
        this.modal = null; // skip the window-out animation; the reader covers it
        this.openReader(bookIndex);
        const reader = this._reader;
        if (!reader) return;
        const idx = Math.max(0, Math.min(reader.editions.length - 1, Number(editionIndex) || 0));
        reader.edition = idx;
        reader.page = 1;
        if (reader.pageLabel) reader.pageLabel.textContent = 'Page 1';
        if (reader.lang) reader.lang.value = String(idx);
        reader.load();
      },
      closeReader() {
        const reader = this._reader;
        if (!reader) return;
        reader.cleanup.forEach((fn) => fn());
        if (document.fullscreenElement === reader.overlay && document.exitFullscreen) document.exitFullscreen().catch(() => null);
        if (reader.overlay && reader.overlay.parentNode) reader.overlay.parentNode.removeChild(reader.overlay);
        document.body.classList.remove('book-reading');
        this._reader = null;
      },
      openBook(index) {
        const books = (this.page && this.page.books) || [];
        const book = books[Number(index)];
        if (!book) return;
        const editions = (Array.isArray(book.editions) && book.editions.length)
          ? book.editions.slice().sort((a, b) => (/^english$/i.test(a.language) ? -1 : /^english$/i.test(b.language) ? 1 : String(a.language).localeCompare(String(b.language))))
          : [{ language: book.language || 'English', pdfUrl: book.pdfUrl, coverUrl: book.coverUrl }];
        const cover = book.coverUrl || (editions.find((e) => e.coverUrl) || {}).coverUrl || '';
        const bid = Reel.attr(book.id);
        const bidx = Number(index);
        const canManage = Boolean(this.page && this.page.canManage);
        const body = '<div class="book-detail">' +
          (cover ? '<div class="book-detail-cover"><img src="' + Reel.attr(Reel.resolveMediaUrl(cover)) + '" alt=""></div>' : '') +
          '<div class="book-detail-main"><h3>' + Reel.esc(book.title) + '</h3>' +
          '<p class="muted">' + Reel.esc(book.description || '') + '</p>' +
          '<div class="wb-field-label">Read in a language</div><div class="book-editions">' +
            editions.map((e, i) => '<span class="book-edition">' +
              '<button type="button" class="btn btn-sm ' + (i === 0 ? 'btn-primary' : 'btn-secondary') + '" @click="openReaderAt(' + bidx + ', ' + i + ')">' +
                Reel.icon('book-open') + ' ' + Reel.esc(e.language) + '</button>' +
              (canManage && editions.length > 1 ? '<button type="button" class="btn btn-sm btn-ghost btn-icon" @click="removeBookEdition(\'' + bid + '\', ' + i + ')" aria-label="Remove ' + Reel.attr(e.language) + '">' + Reel.icon('x') + '</button>' : '') +
              '</span>').join('') +
            (canManage ? '<button type="button" class="btn btn-sm btn-secondary" @click="openNamedModal(\'bookEditionAdd\',\'' + bid + '\')">' + Reel.icon('plus') + ' Add a language</button>' : '') +
          '</div>' +
          '<div class="book-detail-actions">' +
            '<a class="btn btn-sm btn-ghost" href="' + Reel.attr(Reel.resolveMediaUrl(editions[0] && editions[0].pdfUrl)) + '" target="_blank" rel="noopener" download>' + Reel.icon('download') + ' Download PDF</a>' +
          '</div>' +
          '<div class="wb-field-label">Credits and licence</div>' +
          '<div class="book-credit">' +
            [['Writer', book.author], ['Illustrator', book.illustrator], ['Designer', book.designer], ['Editor', book.editor]]
              .filter(([, name]) => name)
              .map(([role, name]) => '<span><b>' + Reel.esc(role) + ':</b> ' + Reel.esc(name) + '</span>').join('') +
            (book.sourceUrl ? '<a href="' + Reel.attr(book.sourceUrl) + '" target="_blank" rel="noopener">Read at Book Dash ' + Reel.icon('external-link') + '</a>' : '') +
            '<span class="muted small">' + Reel.esc(book.licence || 'CC BY 4.0') + '</span>' +
          '</div></div></div>';
        this.openDetail(book.title, body, 'wide');
      },
      filterBooks() {
        const q = (document.getElementById('book-search') || {}).value || '';
        const lang = (document.getElementById('book-language') || {}).value || '';
        const theme = (document.getElementById('book-theme') || {}).value || '';
        let shown = 0;
        document.querySelectorAll('.book-card').forEach((card) => {
          const hay = (card.getAttribute('data-search') || '').toLowerCase();
          const langs = (card.getAttribute('data-language') || '').split('|');
          const themes = (card.getAttribute('data-theme') || '');
          const ok = (!q || hay.indexOf(String(q).toLowerCase()) !== -1) &&
            (!lang || langs.indexOf(lang) !== -1) && (!theme || themes.indexOf(theme) !== -1);
          card.style.display = ok ? '' : 'none';
          if (ok) shown++;
        });
        const count = document.getElementById('book-count');
        if (count) count.textContent = shown + ' books';
      },
      async removeBookEdition(id, index) {
        try {
          const res = await Reel.api('GET', '/books');
          const all = [].concat((res.data && res.data.platform) || [], (res.data && res.data.custom) || []);
          const book = all.find((b) => b.id === id);
          if (!book) return;
          const editions = (book.editions || []).slice();
          if (editions.length <= 1) return;
          editions.splice(Number(index), 1);
          await Reel.api('PATCH', '/books/' + encodeURIComponent(id), { book: { editions } });
          this.toast('Language removed.');
          Reel.closeModal();
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not remove the language.', 'error');
        }
      },
      async deleteBook(id) {
        if (!confirm('Remove this book from your centre?')) return;
        try {
          await Reel.api('DELETE', '/books/' + encodeURIComponent(id));
          this.toast('Book removed.');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not remove the book.', 'error');
        }
      },

      /**
       * Alpine handler for in-page jumps inside Today (suggested next steps
       * scroll to the wrap-up card, etc.). Never touches the hash router.
       */
      scrollToTodayBlock(id) {
        const el = document.getElementById(String(id || ''));
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.focus({ preventScroll: true });
      },

      /**
       * The Orbit Deck carousel on Today's timeline. All navigation is
       * vanilla: arrows, status-toned dots, ←/→/Home/End keys, horizontal
       * drag, and click-the-leaning-card-to-travel. The centre position is
       * the honest state the server and clock agree on; once the teacher
       * pages the deck by hand the choice sticks across silent refreshes —
       * "Back to now" recenters to what needs attention.
       */
      initTodayDeck() {
        const deck = document.getElementById('today-deck');
        if (!deck) return;
        const section = deck.closest('.deck-section');
        const stage = document.getElementById('deck-stage');
        const count = document.getElementById('deck-count');
        const prev = section ? section.querySelector('[data-deck-prev]') : null;
        const next = section ? section.querySelector('[data-deck-next]') : null;
        const recenter = section ? section.querySelector('[data-deck-recenter]') : null;
        const cards = Array.prototype.slice.call(stage.querySelectorAll('.deck-card'));
        const dots = Array.prototype.slice.call(deck.querySelectorAll('.deck-dot'));
        const total = cards.length;
        if (!total) return;
        const clampIdx = (i) => Math.max(0, Math.min(total - 1, i));
        let current = clampIdx(Number(stage.getAttribute('data-current')) || 0);
        const paint = (focusCard) => {
          stage.setAttribute('data-current', String(current));
          for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const offset = Math.max(-2, Math.min(2, i - current));
            card.dataset.offset = String(offset);
            card.setAttribute('aria-hidden', i === current ? 'false' : 'true');
            card.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach((el) => { el.tabIndex = i === current ? 0 : -1; });
          }
          dots.forEach((dot, i) => {
            dot.classList.toggle('is-active', i === current);
            dot.setAttribute('aria-current', i === current ? 'true' : 'false');
          });
          if (count) count.textContent = 'Block ' + (current + 1) + ' of ' + total;
          if (prev) prev.disabled = current === 0;
          if (next) next.disabled = current === total - 1;
          this.deckSelection = current;
          // The clicked/activated card becomes the focused one — keyboard and
          // screen-reader users land exactly where the deck visually is.
          if (focusCard) cards[current].focus({ preventScroll: true });
        };
        const goTo = (i) => { current = clampIdx(i); paint(true); };
        if (prev) prev.addEventListener('click', () => goTo(current - 1));
        if (next) next.addEventListener('click', () => goTo(current + 1));
        dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
        if (recenter) recenter.addEventListener('click', () => { this.deckSelection = undefined; this.refreshSilent(); });
        cards.forEach((card, i) => card.addEventListener('click', () => {
          if (Number(card.getAttribute('data-offset')) !== 0) goTo(i);
        }));
        stage.addEventListener('keydown', (event) => {
          const key = event.key;
          if (key === 'ArrowLeft') { event.preventDefault(); goTo(current - 1); }
          else if (key === 'ArrowRight') { event.preventDefault(); goTo(current + 1); }
          else if (key === 'Home') { event.preventDefault(); goTo(0); }
          else if (key === 'End') { event.preventDefault(); goTo(total - 1); }
        });
        // Horizontal drag / swipe. NO setPointerCapture here: capturing on
        // pointerdown retargets the compatibility click to the stage, which
        // silently killed every real mouse/touch click inside the cards.
        // Move/up listeners live on document for the drag session instead.
        let dragX = null;
        const onMove = (event) => {
          if (!dragX) return;
          const dx = event.clientX - dragX.x;
          const dy = event.clientY - dragX.y;
          if (Math.abs(dy) > Math.abs(dx) * 1.2) { dragX = null; return; } // vertical scroll wins
          if (Math.abs(dx) > 12) dragX.moved = true;
        };
        const onUp = (event) => {
          if (!dragX) return;
          const dx = event.clientX - dragX.x;
          const wasDrag = dragX.moved;
          dragX = null;
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
          if (wasDrag && Math.abs(dx) >= 48) {
            // A drag is not a click — suppress the click that follows so a
            // side card isn't accidentally "tapped" into selection.
            const suppress = (e) => { e.stopPropagation(); e.preventDefault(); document.removeEventListener('click', suppress, true); };
            document.addEventListener('click', suppress, true);
            goTo(current + (dx < 0 ? 1 : -1));
          }
        };
        stage.addEventListener('pointerdown', (event) => {
          if (event.button !== 0 && event.pointerType === 'mouse') return;
          dragX = { x: event.clientX, y: event.clientY, moved: false };
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
          document.addEventListener('pointercancel', onUp);
        });
        paint(false);
      },

      /**
       * Today, live: re-reads /staff/today in place every 20s instead of
       * waiting for the teacher to hit Refresh. Deliberately soft — no
       * skeleton, no scroll jump, no replayed animations — and it never
       * swaps content while the user is interacting (modal open, focus
       * inside an input) so the day stays seamless mid-teaching.
       */
      async refreshSilent() {
        if (this._refreshingSilent) return;
        const route = this.route;
        if (!route || route.path !== '/app/today') return;
        if (document.visibilityState !== 'visible') return;
        if (this.loading || this.modal || this.guide || this.quickOpen) return;
        // Never swap the DOM under an active gesture — a 20s tick must not yank
        // a carousel drag or a tap that is about to open a modal.
        if (this._todayInteracting) return;
        const root = document.getElementById('view-root');
        const active = document.activeElement;
        if (active && root && root.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
        this._refreshingSilent = true;
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        // A deck card that has focus must survive the refresh — otherwise
        // every 20s tick drops keyboard/assistive-tech users to <body>.
        const focusCardIndex = (() => {
          const el = document.activeElement;
          const card = el && el.closest ? el.closest('.deck-card') : null;
          return card ? Number(card.getAttribute('data-index')) : null;
        })();
        const seq = (this._navSeq = (this._navSeq || 0) + 1);
        try {
          const view = V[route.view];
          if (!view || !view.load || !view.render) return;
          const page = (await view.load(this, this.params)) || {};
          if (seq !== this._navSeq) return; // a real navigation took over
          this.page = page;
          this._charts = [];
          this.destroyCharts();
          const html = view.render(this, this.params, page);
          if (root) {
            if (window.Alpine && window.Alpine.destroyTree) window.Alpine.destroyTree(root);
            root.innerHTML = html;
            if (window.Alpine && window.Alpine.initTree) window.Alpine.initTree(root);
          }
          window.scrollTo(0, scrollY);
          this.afterRender({ silent: true });
          if (focusCardIndex != null) {
            const cards = root.querySelectorAll('.deck-card');
            if (cards.length) {
              const idx = Math.max(0, Math.min(cards.length - 1, focusCardIndex));
              cards[idx].focus({ preventScroll: true });
            }
          }
        } catch (error) {
          // Realtime is a bonus on top of yesterday's render — keep the
          // last good frame and try again on the next tick.
          if (window.console) console.warn('Today live refresh failed — keeping the last render.', error);
        } finally {
          this._refreshingSilent = false;
        }
      },

      /**
       * Owns the Today auto-refresh poll and the little "Live · updated
       * Ns ago" badge next to the time-of-day chip. Called from
       * afterRender(); any other route tears both down.
       */
      syncTodayLive() {
        const onToday = Boolean(this.route && this.route.path === '/app/today');
        if (!onToday) { this.deckSelection = undefined; this.stopTodayLive(); return; }
        if (!this._todayPoll) {
          this._todayPoll = setInterval(() => { this.refreshSilent(); }, 20000);
          this._todayVis = () => { if (document.visibilityState === 'visible') this.refreshSilent(); };
          document.addEventListener('visibilitychange', this._todayVis);
        }
        const live = document.getElementById('today-live');
        if (!live) return;
        const since = Number(live.getAttribute('data-since')) || Date.now();
        const paint = () => {
          if (!document.body.contains(live)) return;
          const secs = Math.max(0, Math.round((Date.now() - since) / 1000));
          const text = secs < 8 ? 'Live · updated just now' : 'Live · updated ' + secs + 's ago';
          if (!live.querySelector('.today-live-text')) {
            live.innerHTML = '<span class="today-live-dot"></span><span class="today-live-text"></span>';
          }
          const label = live.querySelector('.today-live-text');
          if (label && label.textContent !== text) {
            // A one-second ticker does not need a WAAPI transition: an
            // interrupted fill:both animation left the text invisible in
            // production. Always clear stale animations and set it directly.
            if (label.getAnimations) label.getAnimations().forEach((anim) => { try { anim.cancel(); } catch (error) { /* gone */ } });
            label.style.opacity = '';
            label.style.transform = '';
            label.textContent = text;
          }
        };
        paint();
        if (this._todayTick) clearInterval(this._todayTick);
        this._todayTick = setInterval(paint, 2000);
      },

      stopTodayLive() {
        if (this._todayPoll) { clearInterval(this._todayPoll); this._todayPoll = null; }
        if (this._todayTick) { clearInterval(this._todayTick); this._todayTick = null; }
        if (this._todayVis) { document.removeEventListener('visibilitychange', this._todayVis); this._todayVis = null; }
      },

      /** Highlight the section currently in view in the Today jump rail. */
      initTodayJump() {
        const nav = document.getElementById('today-jump');
        if (!nav) return;
        if (this._jumpObserver) { this._jumpObserver.disconnect(); this._jumpObserver = null; }
        const links = [...nav.querySelectorAll('[data-jump]')];
        if (typeof IntersectionObserver === 'undefined') return;
        this._jumpObserver = new IntersectionObserver((entries) => {
          const visible = entries.filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (!visible) return;
          links.forEach((link) => link.classList.toggle('is-active', link.getAttribute('data-jump') === visible.target.id));
        }, { rootMargin: '-130px 0px -55% 0px', threshold: [0, 0.1, 0.5] });
        links.forEach((link) => {
          const section = document.getElementById(link.getAttribute('data-jump'));
          if (section) this._jumpObserver.observe(section);
        });
      },

      /** Remember that a teacher is mid-gesture so silent refresh never swaps the DOM. */
      initTodayInteractionGuard() {
        if (this._todayGuardBound) return;
        this._todayGuardBound = true;
        document.addEventListener('pointerdown', (event) => {
          const root = document.getElementById('view-root');
          this._todayInteracting = Boolean(root && root.contains(event.target));
        }, { passive: true });
        const release = () => {
          clearTimeout(this._todayInteractTimer);
          this._todayInteractTimer = setTimeout(() => { this._todayInteracting = false; }, 700);
        };
        document.addEventListener('pointerup', release, { passive: true });
        document.addEventListener('pointercancel', release, { passive: true });
      },

      todayTile(key) {
        const page = this.page || {};
        if (key === 'register') { location.hash = '#/app/learner-attendance'; return; }
        if (key === 'outdoor' || key === 'evening') { this.todayWeather(); return; }
        if (key === 'wrapup') { this.scrollToTodayBlock('today-wrapup'); return; }
        this.scrollToTodayBlock('today-schedule');
      },

      todayWeather() {
        const w = (this.page || {}).weather;
        if (!w || !window.Reel || !Reel.feedback) return;
        const bits = [String(w.temp || 0) + '° ' + String(w.label || ''), w.approximate ? 'near ' + (w.city || 'your centre') : (w.city || 'your centre')];
        if (w.sunrise) bits.push('Sunrise ' + String(w.sunrise).slice(-5));
        if (w.sunset) bits.push('Sunset ' + String(w.sunset).slice(-5));
        if (w.uv !== null && w.uv !== undefined) bits.push('UV ' + Reel.number(w.uv));
        bits.push('Wind ' + Reel.number(w.wind || 0) + ' km/h');
        Reel.feedback.sheet({ title: 'Weather at your centre', message: bits.join(' · '), actions: [] });
      },

      _todaySuggestState() {
        try {
          if (typeof sessionStorage === 'undefined') return {};
          return JSON.parse(sessionStorage.getItem('reel.today.suggestions') || '{}') || {};
        } catch (error) { return {}; }
      },

      todaySuggestDone(key) {
        const state = this._todaySuggestState();
        state[key] = 'done';
        try { sessionStorage.setItem('reel.today.suggestions', JSON.stringify(state)); } catch (error) { /* blocked */ }
        this.toast('Marked as done for this session.');
        this.navigate(true);
      },

      todaySuggestSnooze(key) {
        const state = this._todaySuggestState();
        state[key] = state[key] === 'snoozed' ? 'active' : 'snoozed';
        try { sessionStorage.setItem('reel.today.suggestions', JSON.stringify(state)); } catch (error) { /* blocked */ }
        this.toast(state[key] === 'snoozed' ? 'Snoozed until you bring it back.' : 'Back on your list.');
        this.navigate(true);
      },

      toggleTodayDeckDetails() {
        const details = document.querySelector('#today-deck-empty .deck-details');
        if (details) details.hidden = !details.hidden;
      },

      toggleTodayCompleted() {
        const panel = document.querySelector('.deck-section .deck-completed');
        if (panel) panel.hidden = !panel.hidden;
      },

      printDayPack() {
        const page = this.page || {};
        const t = page.today || {};
        const timeline = t.timeline || [];
        const org = (this.activeMembership && this.activeMembership.organisation && this.activeMembership.organisation.name) || 'Today';
        let sheet = document.getElementById('today-print-sheet');
        if (!sheet) { sheet = document.createElement('div'); sheet.id = 'today-print-sheet'; document.body.appendChild(sheet); }
        const materials = [];
        const seen = new Set();
        timeline.forEach((b) => {
          const list = String((b.activity && b.activity.materials) || '').split(/\n|,|•|·/);
          list.map((m) => m.trim()).filter(Boolean).forEach((m) => {
            const key = m.toLowerCase();
            if (!seen.has(key)) { seen.add(key); materials.push(m); }
          });
        });
        const dr = t.dailyReports || {};
        const esc = Reel.esc;
        sheet.innerHTML = '<div class="daypack-cover"><p class="eyebrow">Day pack</p><h1>' + esc(org) + '</h1>' +
          '<p>' + esc(Reel.date(page.date || Reel.today())) + ' · prepared ' + esc(new Date().toLocaleTimeString()) + '</p></div>' +
          '<section><h2>Today at a glance</h2><p>' + esc(t.present || 0) + ' of ' + esc(t.expected || 0) + ' children present · ' +
            esc(timeline.filter((b) => b.status === 'completed').length) + ' of ' + esc(timeline.length) + ' blocks complete · ' +
            esc(dr.missing || 0) + ' daily reports to write.</p>' +
            (page.weather ? '<p>Weather: ' + esc(page.weather.label || '') + ' ' + esc(page.weather.temp || '') + '°' + (page.weather.city ? ' · ' + esc(page.weather.city) : '') + '</p>' : '') + '</section>' +
          '<section><h2>Schedule</h2>' + (timeline.length ? '<ol>' + timeline.map((b) => '<li><strong>' + esc(Reel.time(b.startsAt)) + '</strong> — ' + esc(b.title) +
            (b.classroom ? ' (' + esc(b.classroom) + ')' : '') + (b.activity && b.activity.materials ? '<br><span class="muted">Materials: ' + esc(String(b.activity.materials).replace(/[\n,•·]+/g, ', ')) + '</span>' : '') + '</li>').join('') + '</ol>' : '<p>Nothing scheduled.</p>') + '</section>' +
          '<section><h2>Materials to gather</h2>' + (materials.length ? '<ul>' + materials.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>' : '<p>No materials listed.</p>') + '</section>' +
          '<section><h2>Daily reports</h2>' + (dr.children || []).map((c) => '<p>' + esc(c.name) + ' — ' + (c.reportShared ? 'Shared' : (c.reportId ? 'Draft' : 'Not written')) + '</p>').join('') + '</section>';
        window.print();
      },

      /**
       * Spring-fill conic rings: every [data-ring] carries its target percent;
       * the ring sweeps from 0 to the value on a spring, with the number
       * counting up in the centre.
       */
      animateRings(root) {
        if (!root || !window.Reel || !window.Reel.anim || Reel.anim.reduced()) return;
        root.querySelectorAll('[data-ring]').forEach((el) => {
          const target = Number(el.getAttribute('data-ring')) || 0;
          const label = el.querySelector('.ring-value');
          const start = performance.now();
          const duration = 950;
          const ease = Reel.anim.springEase({ stiffness: 130, damping: 15, duration: 0.95 });
          const tick = (now) => {
            const progress = Math.min(1, (now - start) / duration);
            const value = target * ease(progress);
            el.style.setProperty('--ring-pct', value.toFixed(2));
            if (label) label.textContent = Math.round(value) + '%';
            if (progress < 1) requestAnimationFrame(tick);
            else el.style.setProperty('--ring-pct', String(target));
          };
          requestAnimationFrame(tick);
        });
      },

      chart(id, type, data, options) {
        this._charts.push({ id, type, data, options: options || {} });
      },

      mountCharts() {
        if (!window.Chart || !this._charts.length) return;
        const palette = ['#3A7D44', '#E89A2B', '#3D8FAE', '#B86B4B', '#81599B', '#4F9A58', '#C73B3B'];
        for (const spec of this._charts) {
          const canvas = document.getElementById(spec.id);
          if (!canvas) continue;
          try {
            // A previous render may still own this canvas; reuse would throw
            // "Canvas is already in use" and leave the chart blank.
            if (window.Chart.getChart) {
              const previous = window.Chart.getChart(canvas);
              if (previous) previous.destroy();
            }
            const chart = new window.Chart(canvas, {
              type: spec.type,
              data: spec.data,
              options: Object.assign({
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { boxWidth: 10, usePointStyle: true, color: getComputedStyle(document.documentElement).getPropertyValue('--text') } } },
                scales: spec.type === 'doughnut' || spec.type === 'pie' ? undefined : {
                  x: { grid: { display: false }, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted') } },
                  y: { grid: { color: 'rgba(120,130,120,0.14)' }, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted') }, beginAtZero: true }
                }
              }, spec.options),
              plugins: spec.type === 'doughnut' || spec.type === 'pie' ? [] : []
            });
            this._chartInstances.push(chart);
          } catch (error) {
            if (window.console) console.warn('Chart failed', error);
          }
          canvas.style.maxHeight = '280px';
          if (!canvas.dataset.palette) canvas.dataset.palette = palette.join(',');
        }
      },

      destroyCharts() {
        for (const chart of this._chartInstances) { try { chart.destroy(); } catch { /* ignore */ } }
        this._chartInstances = [];
        try {
          const wb = document.getElementById('wb-canvas-wrap');
          if (wb && wb._wbCleanup) { wb._wbCleanup(); wb._wbCleanup = null; }
        } catch { /* ignore */ }
      },

      setTab(tab) {
        this.tab = tab;
        const { path } = this.parseHash();
        history.replaceState(null, '', '#' + path + '?tab=' + encodeURIComponent(tab));
        this.navigate(true);
      },

      clearSubscriptionScope() {
        ['scopeOrg', 'scopePlan', 'scopeFrom', 'scopeTo', 'orgQuery'].forEach((key) => { this.filters[key] = ''; });
        this.navigate(true);
      },
      setFilter(name, value) {
        this.filters[name] = value;
        this.navigate(true);
      },

      isActive(path) {
        if (!this.route) return false;
        if (this.route.path === path) return true;
        if (path !== '/app/today' && this.route.path.startsWith(path + '/')) return true;
        return false;
      },

      roleLabel() {
        const membership = this.activeMembership;
        if (!membership || !membership.roles || !membership.roles.length) return 'Member';
        return membership.roles.map((r) => Reel.titleCase(r)).join(' · ');
      },

      initials(name) { return Reel.initials(name); },

      toggleSidebar() {
        if (this.viewportWidth < 961) {
          this.sidebarOpen = !this.sidebarOpen;
          this.navFlyout = null;
          this.syncBodyScroll();
          this.refreshIcons();
          return;
        }
        this.sidebarCollapsed = !this.sidebarCollapsed;
        this.navFlyout = null;
        try { localStorage.setItem('reel.sidebar', this.sidebarCollapsed ? 'collapsed' : 'expanded'); } catch { /* ignore */ }
        this.refreshIcons();
      },

      refreshIcons() {
        this.nextTick(() => this.renderIconsNow());
      },

      syncBodyScroll() {
        if (typeof document === 'undefined') return;
        document.body.classList.toggle('nav-open', Boolean(this.sidebarOpen && this.viewportWidth < 961));
      },

      navToggleIcon() {
        if (this.viewportWidth < 961) return this.sidebarOpen ? 'x' : 'menu';
        return this.sidebarCollapsed ? 'panel-left-open' : 'panel-left-close';
      },

      // The icon is re-injected through x-html because Lucide replaces the
      // original <i> with an <svg>; a plain :data-lucide binding would keep
      // writing to the detached element and the glyph would never change.
      navToggleIconMarkup() {
        return '<i data-lucide="' + this.navToggleIcon() + '"></i>';
      },

      themeIconMarkup() {
        return '<i data-lucide="' + (this.theme === 'dark' ? 'sun' : 'moon') + '"></i>';
      },

      navToggleLabel() {
        if (this.viewportWidth < 961) return this.sidebarOpen ? 'Close navigation' : 'Open navigation';
        return this.sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation';
      },

      navExpanded() {
        return this.viewportWidth < 961 ? this.sidebarOpen : !this.sidebarCollapsed;
      },

      closeSidebar() {
        this.sidebarOpen = false;
        this.navFlyout = null;
        this.syncBodyScroll();
        this.refreshIcons();
      },

      newFormFromPreset(key) {
        this.openNamedModal('form');
        const apply = () => this.applyFormPreset(key);
        if (this.$nextTick) this.$nextTick(apply); else setTimeout(apply, 30);
      },
      exportSubmissionsCsv() {
        const page = this.page || {};
        const rows = page.submissions || [];
        if (!rows.length) { this.toast('There are no submissions to export.', 'warn'); return; }
        const schema = ((((page.detail || {}).latest || {}).schema_json || {}).fields || []);
        const labelFor = (key) => {
          const found = schema.find((f) => f.key === key);
          return found ? found.label : key;
        };
        const keys = Array.from(new Set(rows.reduce((all, row) => all.concat(Object.keys(row.submission_data || {})), [])));
        const cell = (value) => {
          const text = Array.isArray(value) ? value.join(', ')
            : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value == null ? '' : value);
          return '"' + text.replace(/"/g, '""') + '"';
        };
        const head = ['Received', 'Submitter', 'Status', 'Payment'].concat(keys.map(labelFor));
        const lines = [head.map(cell).join(',')];
        rows.forEach((row) => {
          const data = row.submission_data || {};
          lines.push([
            row.submitted_at || '', row.submitter_email || 'Anonymous', row.status || '',
            row.payment_status || ''
          ].concat(keys.map((key) => data[key])).map(cell).join(','));
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'form-submissions-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.toast('Submissions exported.');
      },
      copyToClipboard(value, label) {
        const text = String(value || '');
        if (!text) return;
        const done = () => this.toast((label || 'Value') + ' copied.');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => this.toast('Copy failed. Select the value and copy it manually.', 'warn'));
          return;
        }
        this.toast('Copy is not available in this browser. Select the value and copy it manually.', 'warn');
      },

      showNavFlyout(event, group) {
        if (!this.sidebarCollapsed || this.viewportWidth < 961) return;
        this.cancelHideFlyout();
        const rect = event.currentTarget.getBoundingClientRect();
        this.navFlyout = {
          label: group.label,
          items: group.items,
          top: Math.max(10, Math.min(rect.top, window.innerHeight - 360)),
          left: Math.max(rect.right + 14, 88)
        };
      },

      cancelHideFlyout() {
        if (this._flyoutTimer) {
          clearTimeout(this._flyoutTimer);
          this._flyoutTimer = null;
        }
      },

      scheduleHideFlyout() {
        this.cancelHideFlyout();
        this._flyoutTimer = setTimeout(() => {
          this.navFlyout = null;
          this._flyoutTimer = null;
        }, 180);
      },

      async toggleNotifications() {
        this.notifOpen = !this.notifOpen;
        if (!this.notifOpen) return;
        const stale = !this._notifAt || Date.now() - this._notifAt > 30000;
        if (stale && !this.notifLoading) await this.loadNotifications();
      },

      async loadNotifications() {
        this.notifLoading = true;
        try {
          const payload = await Reel.api('GET', '/notifications?pageSize=8');
          this.notifications = (payload.data || []).map((item) => Object.assign({}, item, {
            when: Reel.relative(item.created_at)
          }));
          if (payload.meta && typeof payload.meta.unread === 'number') this.unread = payload.meta.unread;
        } catch {
          this.notifications = [];
        } finally {
          this._notifAt = Date.now();
          this.notifLoading = false;
        }
      },

      async markNotificationRead(item) {
        if (!item || item.read_at) return;
        try {
          await Reel.api('POST', '/notifications/' + encodeURIComponent(item.id) + '/read', {});
          item.read_at = new Date().toISOString();
          this.unread = Math.max(0, this.unread - 1);
        } catch { /* the panel still closes on escape */ }
      },

      async markAllNotificationsRead() {
        if (!this.unread) return;
        try {
          await Reel.api('POST', '/notifications/read-all', {});
          const now = new Date().toISOString();
          this.notifications = this.notifications.map((item) => Object.assign({}, item, {
            read_at: item.read_at || now
          }));
          this.unread = 0;
        } catch { /* leave the badge untouched on failure */ }
      },

      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = this.theme;
        if (Reel.applyTheme) Reel.applyTheme(this.organisationTheme);
        try { localStorage.setItem('reel.theme', this.theme); } catch { /* ignore */ }
        this.mountCharts();
      },

      /**
       * Density toggle: compact spacing for the small screens teachers carry.
       * Persists per device and re-applies on boot.
       */
      toggleDensity() {
        this.density = this.density === 'compact' ? 'comfortable' : 'compact';
        document.documentElement.dataset.density = this.density;
        try { localStorage.setItem('reel.density', this.density); } catch { /* ignore */ }
        this.toast(this.density === 'compact' ? 'Compact spacing on.' : 'Comfortable spacing on.');
      },

      async refreshUnread(force) {
        if (!this.session) return;
        const now = Date.now();
        if (!force && this._unreadAt && now - this._unreadAt < 30000) return;
        this._unreadAt = now;
        try {
          const payload = await Reel.api('GET', '/notifications/unread-count');
          this.unread = payload.data.unread || 0;
        } catch { /* non-critical */ }
      },

      async stopImpersonation() {
        if (!this.impersonated) return;
        try {
          await Reel.api('POST', '/auth/impersonation/stop', {});
          this.impersonated = null;
          this.toast('Returned to Platform.');
          await this.refreshSession();
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not stop impersonating.', 'error');
        }
      },

      /**
       * Start viewing as another user. The CSRF cookie and session cookie are
       * updated together, and the app refreshes into the impersonated
       * organisation's workspace.
       */
      async impersonateUser(userId) {
        if (!userId) return;
        try {
          const payload = await Reel.api('POST', '/platform/users/' + encodeURIComponent(userId) + '/impersonate', {});
          const data = payload.data || {};
          if (data.csrfToken && Reel.setCsrf) Reel.setCsrf(data.csrfToken);
          this.toast('Viewing as ' + (data.user ? data.user.displayName : 'user') + '. Use Return to platform to stop.');
          await this.refreshSession();
          const first = (this.session && this.session.memberships && this.session.memberships[0]) || null;
          const target = first ? first.organisation.id : null;
          if (target) this.activeOrganisationId = target;
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not view as user.', 'error');
        }
      },

      signOut() {
        if (this.signingOut) return;
        this.signingOut = true;
        // Fire the request while the CSRF token is still available, but never
        // make the person wait for a cold serverless function to see the login
        // screen. The local session clears immediately.
        const logout = Reel.api('POST', '/auth/logout', {}).catch(() => {});
        if (Reel.setCsrf) Reel.setCsrf(null);
        this.session = null;
        this.mode = 'login';
        this.platformBrand = null;
        this.renderAuth();
        location.hash = '/login';
        this.loadPlatformBranding().then(() => {
          if (this.mode === 'login') this.renderAuth();
        });
        Promise.resolve(logout).finally(() => { this.signingOut = false; });
      },

      reload() { return this.navigate(true); },

      toast(message, type, action) {
        const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        this.toasts.push({ id, message, type: type || 'success', action: action || null });
        if (window.Reel && Reel.feedback) {
          Reel.feedback.cue(type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'success');
        }
        this._toastTimers = this._toastTimers || {};
        if (this._toastTimers[id]) clearTimeout(this._toastTimers[id]);
        this._toastTimers[id] = setTimeout(() => this.dismissToast(id), action ? 8000 : 5200);
      },

      /** Runs a toast's inline action (e.g. Undo) and dismisses the toast. */
      runToastAction(id) {
        const t = this.toasts.find((x) => x.id === id);
        this.dismissToast(id);
        if (t && t.action && t.action.run) t.action.run();
      },

      dismissToast(id) {
        const root = document.querySelector('.toast-root');
        const el = root ? root.querySelector('[data-toast-id="' + id + '"]') : null;
        if (el && window.Reel && window.Reel.anim && !Reel.anim.reduced()) {
          // Phase exit: settle down, then fade the toast away before removal.
          Reel.anim.phase(el, [
            { frames: [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(4px) scale(1.02)' }], duration: 90, easing: 'ease-out' },
            { frames: [{ opacity: 1, transform: 'translateY(4px) scale(1.02)' }, { opacity: 0, transform: 'translateY(10px) scale(0.96)' }], duration: 140, easing: 'cubic-bezier(0.4, 0, 1, 1)' }
          ]).finished.then(() => {
            this.toasts = this.toasts.filter((t) => t.id !== id);
          });
          return;
        }
        this.toasts = this.toasts.filter((t) => t.id !== id);
      },

      closeOverlays() {
        this.commandOpen = false;
        this.quickOpen = false;
        this.notifOpen = false;
        this.navFlyout = null;
        if (this.modal && !this.modal.saving) this.closeModal();
      },

      async apiAction(method, path, body, options) {
        // Sample-data previews: stop mutations before they reach the API.
        if (this.page && this.page.sampleMode) {
          this.toast('You’re previewing sample data — nothing is saved.', 'info');
          return {};
        }
        const opts = options || {};
        try {
          const result = await Reel.api(method, path, body, opts);
          if (opts.successMessage) this.toast(opts.successMessage);
          // Meaningful completions feed the (rare) rating prompt and get a
          // stronger confirmation than an ordinary save.
          if (window.Reel && Reel.feedback && /\/complete$|\/start$/.test(path)) Reel.feedback.delight();
          if (opts.reload !== false) await this.navigate(true);
          return result;
        } catch (error) {
          this.toast(error.message || 'The action failed.', 'error');
          if (error.details && Array.isArray(error.details)) {
            this.toast(error.details.map((d) => d.message || d.field).join(' · '), 'warn');
          }
          throw error;
        }
      },

      /**
       * Hand a download path (CSV, XLSX or PDF) to the browser. The browser
       * follows the Content-Disposition header and saves the file, using the
       * session cookie for authentication.
       */
      downloadExport(path) {
        Reel.download(path);
      },

      act(method, path, body, options) {
        return this.apiAction(method, path, body, options);
      },

      /* ---- Sample-data previews for empty workspaces ---- */

      /**
       * Render the current view with a small, clearly-labelled set of sample
       * rows instead of the empty state — no API calls are made and nothing
       * is written. Mutations are blocked at apiAction while this is on.
       */
      loadSampleData(viewName) {
        const sample = SAMPLE_DATA[viewName];
        if (!sample) return;
        this.page = Object.assign({ sampleMode: true, sampleView: viewName }, typeof sample === 'function' ? sample() : sample);
        const view = Reel.views[this.route.view] || Reel.views[viewName];
        if (view && view.render) {
          this.renderHtml(view.render(this, this.params, this.page));
          this.nextTick(() => this.afterRender());
        }
      },

      exitSampleData() {
        this.sampleExit = true; // navigate() below clears this
        this.navigate(true);
      },

      /**
       * Undo-able mutation: after a successful PATCH, the toast offers Undo,
       * which re-applies the row's previous values for the fields that were
       * just changed. `row` is the pre-mutation object from page data.
       */
      actUndoable(method, path, body, options, row) {
        const opts = Object.assign({}, options || {});
        const undo = (method === 'PATCH' && row && body && Object.keys(body).length)
          ? Object.keys(body).reduce((acc, key) => { if (key in row) acc[key] = row[key]; return acc; }, {})
          : null;
        if (undo && Object.keys(undo).length) {
          opts.successMessage = opts.successMessage || 'Saved.';
          const prevReload = opts.reload;
          opts.reload = false;
          return this.apiAction(method, path, body, opts).then((result) => {
            this.toast(opts.successMessage, undefined, {
              label: 'Undo',
              run: () => {
                this.apiAction('PATCH', path, undo, { successMessage: 'Change reversed.', reload: prevReload === undefined ? true : prevReload })
                  .catch(() => {});
              }
            });
            const follow = () => this.navigate(true);
            if (prevReload === false) return result;
            setTimeout(follow, 350);
            return result;
          });
        }
        return this.apiAction(method, path, body, options);
      },

      /**
       * Optimistic register row(s): apply the local patch, repaint instantly,
       * then reconcile with the API in the background — reverting if the
       * server refuses. `undoAction` ({ label, run }) is offered on the
       * success toast; the row patch is reversed there if provided.
       */
      optimisticRows(viewName, applyLocal, apiCall, successMessage, undoAction, afterLocal) {
        const view = Reel.views[viewName];
        if (!view || !this.page) return apiCall().then(() => this.navigate(true));
        const prevRegister = JSON.parse(JSON.stringify(this.page.register || {}));
        applyLocal(this.page);
        this.renderHtml(view.render(this, this.params, this.page));
        this.nextTick(() => this.afterRender());
        return apiCall().then(() => {
          this.toast(successMessage || 'Saved.', undefined, undoAction || null);
          setTimeout(() => { if (this.route && this.route.path === '/app/learner-attendance') this.navigate(true); }, 500);
        }).catch((error) => {
          this.page.register = prevRegister;
          this.renderHtml(view.render(this, this.params, this.page));
          this.nextTick(() => this.afterRender());
          this.toast(error.message || 'Could not save.', 'error');
        });
      },
      /** Single-row convenience over optimisticRows. */
      optimisticRow(viewName, rowFinder, patch, apiCall, successMessage) {
        return this.optimisticRows(viewName, (page) => {
          const rows = ((page.register || {}).rows) || [];
          const row = rows.find(rowFinder);
          if (row) Object.assign(row, patch);
        }, apiCall, successMessage);
      },

      /**
       * Register: mark a child present on a past date, optimistically. The row
       * flips to "present" instantly, then the server reconciles. Undo reverts
       * the row to expected.
       */
      registerMarkPresent(learnerId, date, firstName) {
        const patch = (page) => {
          (((page.register || {}).rows) || []).forEach((r) => { if (r.learner_id === learnerId) { r.attendance_id = 'pending'; r.status = 'present'; } });
        };
        const apiCall = () => Reel.api('POST', '/learner-attendance/register', { date, records: [{ learnerId, status: 'present' }] });
        const undo = {
          label: 'Undo',
          run: () => this.optimisticRows('attendance',
            (page) => { (((page.register || {}).rows) || []).forEach((r) => { if (r.learner_id === learnerId) { r.attendance_id = null; r.status = 'expected'; } }); },
            () => Reel.api('POST', '/learner-attendance/register', { date, records: [{ learnerId, status: 'expected' }] }),
            'Marked expected again.')
        };
        return this.optimisticRows('attendance', patch, apiCall, (firstName || 'Learner') + ' marked present', undo);
      },

      /**
       * Register: mark every expected-but-unrecorded child present, optimistically,
       * with an Undo toast that reverts them all to expected.
       */
      markAllExpectedPresent() {
        const page = this.page || {};
        const date = page.date || Reel.today();
        const rows = (((page.register || {}).rows) || []);
        const targets = rows.filter((r) => !r.attendance_id).map((r) => r.learner_id);
        if (!targets.length) { this.toast('Everyone is already marked.'); return Promise.resolve(); }
        const apply = (p) => {
          ((((p.register || {}).rows) || [])).forEach((r) => { if (targets.indexOf(r.learner_id) !== -1) { r.attendance_id = 'pending'; r.status = 'present'; } });
        };
        const apiCall = () => Reel.api('POST', '/learner-attendance/register', { date, records: targets.map((id) => ({ learnerId: id, status: 'present' })) });
        const undo = {
          label: 'Undo',
          run: () => this.optimisticRows('attendance',
            (p) => { ((((p.register || {}).rows) || [])).forEach((r) => { if (targets.indexOf(r.learner_id) !== -1) { r.attendance_id = null; r.status = 'expected'; } }); },
            () => Reel.api('POST', '/learner-attendance/register', { date, records: targets.map((id) => ({ learnerId: id, status: 'expected' })) }),
            'Everyone marked expected again.')
        };
        return this.optimisticRows('attendance', apply, apiCall, targets.length + ' marked present', undo);
      },

      /**
       * Register: confirm a check-in (with the chosen bringer) optimistically.
       */
      registerConfirmIn(learnerId, payload, firstName) {
        return this.optimisticRow('attendance',
          (row) => row.learner_id === learnerId,
          { attendance_id: 'pending', status: 'present', check_in_at: new Date().toISOString() },
          () => Reel.api('POST', '/learner-attendance/check-in', payload),
          (firstName || 'Learner') + ' in.');
      },

      async downloadParentProgress(learnerId) {
        try {
          const payload = await Reel.api('POST', '/assessments/reports/generate', { learnerId, format: 'pdf' });
          const report = payload.data && payload.data.report;
          if (!report || !report.pdf) throw new Error('The report could not be generated.');
          const bytes = Uint8Array.from(atob(report.pdf), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'progress-report.pdf';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          this.toast('Progress report downloaded.');
        } catch (error) {
          this.toast(error.message || 'The report could not be generated.', 'error');
        }
      },

      async runDigest(endpoint, label) {
        this.automationDigestBusy = true;
        try {
          const result = await Reel.api('POST', endpoint, {});
          const data = result.data || {};
          this.toast((label || 'Done') + ' — sent to ' + R.number(data.sent || 0) + ' recipients.');
        } catch (error) {
          this.toast(error.message || 'The job could not be run.', 'error');
        } finally {
          this.automationDigestBusy = false;
        }
      },

      runWeeklyDigest() { return this.runDigest('/automation/weekly-digest', 'Weekly digest sent'); },
      runPortfolioDigest() { return this.runDigest('/automation/portfolio-digest', 'Portfolio digest sent'); },
      runPickupBrief() { return this.runDigest('/automation/pickup-brief', 'Pickup briefs sent'); },
      runOnboardingSweep() { return this.runDigest('/automation/parent-onboarding', 'Onboarding sweep done'); },

      async nudgeFamily(userId, name) {
        try {
          const result = await Reel.api('POST', '/reports/engagement/nudge', { userId });
          this.toast(result.data && result.data.sent ? 'A note is on its way to ' + (name || 'the family') + '.' : 'The email was accepted but not delivered — check the provider settings.', result.data && result.data.sent ? undefined : 'warn');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not send that note.', 'error');
        }
      },

      async nudgeQuietAll() {
        try {
          const result = await Reel.api('POST', '/reports/engagement/nudge-all', { days: 7 });
          const data = result.data || {};
          this.toast('Nudges sent to ' + R.number(data.sent || 0) + ' of ' + R.number(data.total || 0) + ' quiet families.');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not send the nudges.', 'error');
        }
      },

      async runAutomationSweep() {
        this.automationSweepBusy = true;
        try {
          const p = await Reel.api('POST', '/automation/sweep', {});
          const d = p.data || {};
          this.toast('Sweep: ' + (d.childrenWithoutObservations || 0) + ' children need observations · ' + (d.plansAwaitingReview || 0) + ' plans waiting for review · ' + (d.overdueActivities || 0) + ' activities overdue. Notifications sent.');
        } catch (error) {
          this.toast(error.message || 'The sweep failed.', 'error');
        } finally {
          this.automationSweepBusy = false;
        }
      },

      // -----------------------------------------------------------------------
      // Bulk selection
      // -----------------------------------------------------------------------

      isSelected(id) { return this.selectedIds.indexOf(id) !== -1; },

      toggleSelect(id, checked) {
        const next = new Set(this.selectedIds);
        if (checked) next.add(id); else next.delete(id);
        this.selectedIds = Array.from(next);
      },

      toggleSelectAll(checked, ids) {
        this.selectedIds = checked ? (ids || []).slice() : [];
      },

      clearSelection() { this.selectedIds = []; },

      /**
       * Run a bulk action against the current selection. The API contract is
       * `{ ids, action, ...extra }` and every endpoint answers with
       * `{ updated, skipped }`, which is reported back honestly: a partial
       * result says how many records were skipped and why.
       */
      async runBulk(path, action, extra, options) {
        if (!this.selectedIds.length) {
          this.toast('Select at least one record first.', 'warn');
          return null;
        }
        const opts = options || {};
        try {
          const result = await Reel.api('POST', path, Object.assign({ ids: this.selectedIds.slice(), action }, extra || {}));
          const data = (result && result.data) || {};
          const skipped = Array.isArray(data.skipped) ? data.skipped : [];
          const base = opts.successMessage || ('Updated ' + Number(data.updated || 0) + ' record' + (Number(data.updated || 0) === 1 ? '' : 's') + '.');
          if (!opts.silent) {
            this.toast(base + (skipped.length ? ' ' + skipped.length + ' skipped: ' + skipped.slice(0, 2).map((s) => s.reason).join(', ') + (skipped.length > 2 ? '…' : '') : ''),
              skipped.length && !Number(data.updated) ? 'warn' : 'success');
          }
          this.clearSelection();
          if (opts.reload !== false) await this.navigate(true);
          return data;
        } catch (error) {
          this.toast(error.message || 'The bulk action failed.', 'error');
          return null;
        }
      },

      async toggleChecklist(taskId, itemId, completed) {
        try {
          await Reel.api('PATCH', '/tasks/' + taskId + '/checklist/' + itemId, { completed: !completed });
          await this.navigate(true);
          this.openNamedModal('taskView', taskId);
        } catch (error) {
          this.toast(error.message || 'The checklist item could not be updated.', 'error');
        }
      },

      // -----------------------------------------------------------------------
      // PayFast payment links
      //
      // Alpine evaluates a binding against the component scope, so handlers used
      // from view markup must live here. Everything below builds its signed
      // checkout server-side; the browser only ever shows the resulting link.
      // -----------------------------------------------------------------------

      /**
       * Hand off to the PayFast hosted checkout with a real form POST. A form
       * submit (rather than fetch) keeps the payer inside the hosted flow and
       * carries the signed fields exactly as the provider issued them.
       */
      submitCheckout(checkout) {
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
      },

      /**
       * Pay the outstanding Re-EL subscription invoice through PayFast. The
       * server decides the amount from the oldest open invoice, or reuses the
       * pending checkout if the button was already pressed.
       */
      async paySubscription() {
        try {
          const result = await Reel.api('POST', '/billing/subscription/pay', {});
          const checkout = (result && result.data && result.data.checkout) || null;
          if (checkout) {
            this.submitCheckout(checkout);
            return;
          }
          this.toast('There is nothing outstanding to pay right now.', 'success');
        } catch (error) {
          this.toast(error.message || 'We could not start the subscription payment.', 'error');
        }
      },

      async paySetupFee() {
        const page = this.page || {};
        const billing = page.billing || {};
        const setupFee = billing.setupFee || (billing.setupFee === null ? null : null);
        // Try to get latest details if on billing page
        const existing = (setupFee && setupFee.visitDetails) || (this.page && this.page.billing && this.page.billing.setupFee && this.page.billing.setupFee.visitDetails) || {};
        const ctx = this;
        this.openModal({
          title: 'Setup visit details',
          description: 'Before paying the once-off setup online, please provide contact and visit details so Re-EL representatives can come to your centre (training, platform & website setup, launch support).',
          submitLabel: 'Continue to secure payment',
          size: 'wide',
          fields: [
            { name: 'contactName', label: 'Contact person name', required: true, span: 2, value: existing.contactName || ((ctx.session && ctx.session.user && ctx.session.user.displayName) || '') },
            { name: 'contactPhone', label: 'Contact phone number', required: true, value: existing.contactPhone || '' },
            { name: 'contactEmail', label: 'Contact email', type: 'email', value: existing.contactEmail || ((ctx.session && ctx.session.user && ctx.session.user.email) || '') },
            { name: 'centreAddress', label: 'Centre physical address (where we should come)', type: 'textarea', required: true, span: 2, value: existing.centreAddress || '' },
            { name: 'preferredVisitDate', label: 'Preferred visit date', type: 'date', value: existing.preferredVisitDate || '' },
            { name: 'preferredVisitTime', label: 'Preferred time / availability', placeholder: 'e.g. Morning, 09:00–12:00', value: existing.preferredVisitTime || '' },
            { name: 'alternatePhone', label: 'Alternate phone number', value: existing.alternatePhone || '' },
            { name: 'notes', label: 'Notes for our representatives', type: 'textarea', span: 2, placeholder: 'Directions, gate/access info, number of staff to train, or anything else we should know', value: existing.notes || '' }
          ],
          onSubmit: async (data) => {
            try {
              const result = await Reel.api('POST', '/billing/setup/pay', data);
              const checkout = (result && result.data && result.data.checkout) || null;
              if (checkout) {
                ctx.toast('Redirecting you to secure payment…');
                ctx.closeModal();
                ctx.submitCheckout(checkout);
                return { data: result.data, skipNavigate: true };
              }
              throw new Error('Could not start the setup payment.');
            } catch (error) {
              ctx.toast(error.message || 'We could not start the setup payment.', 'error');
              throw error;
            }
          }
        });
      },

      /**
       * Stop collecting through the tenant's own PayFast account. Credentials
       * are forgotten and future checkouts fall back to the platform account.
       */
      async disconnectOwnPayfast() {
        try {
          await Reel.api('PUT', '/billing/payment-account', { mode: 'platform_collected', clearCredentials: true });
          this.toast('Disconnected — parent fees now collect through the platform account.', 'success');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'We could not change the payment account.', 'error');
        }
      },

      async payInvoice(id) {
        try {
          const payload = await Reel.api('POST', '/parent/invoices/' + encodeURIComponent(id) + '/pay', {});
          this.submitCheckout((payload.data && payload.data.checkout) || {});
        } catch (error) {
          this.toast(error.message || 'Online payment could not be started.', 'error');
        }
      },

      async payStatement() {
        try {
          const payload = await Reel.api('POST', '/parent/finance/statement/pay', {});
          this.submitCheckout((payload.data && payload.data.checkout) || {});
        } catch (error) {
          this.toast(error.message || 'Online payment could not be started.', 'error');
        }
      },

      payLinkDetail(title, intro, url) {
        this.openDetail(title,
          '<p class="muted small">' + intro + '</p>' +
          '<div class="field"><label class="label">Payment link</label>' +
          '<input class="input mono" readonly value="' + Reel.attr(url) + '" onclick="this.select()"></div>' +
          '<div class="row" style="margin-top:14px">' +
          '<a class="btn btn-primary" href="' + Reel.attr(url) + '" target="_blank" rel="noopener">' + Reel.icon('external-link') + ' Open PayFast</a>' +
          '</div>');
      },

      async paymentLink(id) {
        try {
          const payload = await Reel.api('POST', '/invoices/' + encodeURIComponent(id) + '/payfast-link', {});
          const checkout = (payload.data && payload.data.checkout) || {};
          this.payLinkDetail('PayFast payment link',
            'Share this link with the guardian, or open it to pay now. The invoice is marked paid only when PayFast confirms the transaction.',
            checkout.action + '?' + checkout.query);
        } catch (error) {
          this.toast(error.message || 'The payment link could not be created.', 'error');
        }
      },

      async remindInvoice(id) {
        try {
          const payload = await Reel.api('POST', '/invoices/' + encodeURIComponent(id) + '/remind', {});
          const result = payload.data || {};
          this.toast(result.payUrl ? 'Reminder sent with a PayFast link.' : 'Reminder sent.');
        } catch (error) {
          this.toast(error.message || 'The reminder could not be sent.', 'error');
        }
      },

      async statementLink(guardianId) {
        try {
          const payload = await Reel.api('POST', '/guardians/' + encodeURIComponent(guardianId) + '/statement-link', {});
          const data = payload.data || {};
          const checkout = data.checkout || {};
          this.payLinkDetail('Statement payment link',
            'One payment settles every open invoice for this guardian (' + Reel.number(data.invoiceCount) + ' invoice(s), ' +
              Reel.money(data.amount) + '). The guardian also receives this by email.',
            checkout.action + '?' + checkout.query);
        } catch (error) {
          this.toast(error.message || 'The statement link could not be created.', 'error');
        }
      },

      async feeLink(applicationId) {
        try {
          const payload = await Reel.api('POST', '/admissions/applications/' + encodeURIComponent(applicationId) + '/fee-link', {});
          const data = payload.data || {};
          const checkout = data.checkout || {};
          this.payLinkDetail('Application fee link',
            'The guardian receives this link by email and pays ' + Reel.money(data.amount, data.currency) +
              ' online. The fee is marked paid when PayFast confirms it.',
            checkout.action + '?' + checkout.query);
        } catch (error) {
          this.toast(error.message || 'The fee link could not be created.', 'error');
        }
      },

      billSubscription(organisationId) {
        if (!organisationId) { this.toast('That organisation could not be found.', 'warn'); return; }
        const id = Reel.attr(organisationId);
        this.openDetail('Bill subscription',
          '<p class="muted small">Create a PayFast checkout for this tenant\'s plan. The subscription is extended only when PayFast confirms the payment.</p>' +
          '<div class="btn-group">' +
          '<button class="btn btn-secondary" @click="createSubscriptionCheckout(\'' + id + '\',\'monthly\')">Monthly</button>' +
          '<button class="btn btn-secondary" @click="createSubscriptionCheckout(\'' + id + '\',\'annual\')">Annual (12 months)</button>' +
          '</div>');
      },

      async createSubscriptionCheckout(organisationId, period) {
        const billingPeriod = period === 'annual' ? 'annual' : 'monthly';
        try {
          const payload = await Reel.api('POST', '/platform/organisations/' + encodeURIComponent(organisationId) + '/subscription/checkout', { billingPeriod });
          const data = payload.data || {};
          const checkout = data.checkout || {};
          this.payLinkDetail('Subscription checkout',
            Reel.titleCase(billingPeriod) + ' billing · ' + Reel.money(data.amount, data.currency) +
              '. Share this link with the tenant or open it to pay now.',
            checkout.action + '?' + checkout.query);
        } catch (error) {
          this.toast(error.message || 'The checkout could not be created.', 'error');
        }
      },

      confirmAction(title, message, endpoint, options) {
        const opts = options || {};
        this.openConfirm(title, message, {
          endpoint,
          method: opts.method || 'POST',
          body: opts.body || {},
          submitLabel: opts.submitLabel || 'Confirm',
          successMessage: opts.successMessage || 'Done.',
          danger: opts.danger !== false
        });
      },


      openModal(config) {
        this.signaturePads = {};
        // Invalidate any pending window-out close so a modal opened during the
        // exit animation is not removed by its predecessor's cleanup.
        this._modalToken = (this._modalToken || 0) + 1;
        this._modalClosing = false;
        const data = {};
        (config.fields || []).forEach((field) => {
          if (field.type === 'checkbox') {
            data[field.name] = field.value === undefined ? false : field.value;
          } else if (field.type === 'multiselect' || field.type === 'checkboxes' || field.type === 'repeater' || field.multiple) {
            const initial = field.value === undefined ? [] : field.value;
            const list = Array.isArray(initial) ? initial.slice() : (initial ? [initial] : []);
            data[field.name] = field.type === 'repeater'
              ? list.map((item) => Object.assign({}, item))
              : list;
          } else {
            data[field.name] = field.value === undefined ? '' : field.value;
          }
        });
        this.modal = {
          type: 'form',
          title: config.title,
          description: config.description || null,
          descriptionHtml: config.descriptionHtml || null,
          fields: config.fields || [],
          data,
          submitLabel: config.submitLabel || 'Save',
          confirmText: config.confirmText || '',
          successMessage: config.successMessage || 'Saved successfully.',
          size: config.size || null,
          label: {},
          endpoint: config.endpoint,
          method: config.method || 'POST',
          transform: config.transform || null,
          onSubmit: config.onSubmit || null,
          onSuccess: config.onSuccess || null,
          mediaBusy: {},
          mediaDraft: {},
          msQuery: {},
          saving: false,
          error: null
        };
        // Zoom-in window transition as the modal opens.
        this.nextTick(() => {
          if (window.Reel && window.Reel.anim) window.Reel.anim.windowIn(document.querySelector('.modal-backdrop:not(.guide-backdrop) .modal'));
        });
      },

      // -----------------------------------------------------------------------
      // Multi-select and repeater fields
      //
      // Both live inside the generic modal so every view gets the same picker
      // and the same row editor without duplicating markup.
      // -----------------------------------------------------------------------

      searchOptions(field, query) {
        const text = String(query || '').trim().toLowerCase();
        const options = (field.options || []).map((option) => (option && typeof option === 'object'
          ? option
          : { value: option, label: String(option) }));
        if (!text) return options.slice(0, 30);
        return options.filter((option) =>
          String(option.label || '').toLowerCase().includes(text) ||
          String(option.subtitle || '').toLowerCase().includes(text) ||
          String(option.value || '').toLowerCase().includes(text)).slice(0, 30);
      },

      selectSearchOption(field, option) {
        if (!this.modal) return;
        this.modal.data[field.name] = option.value;
        this.modal.label = this.modal.label || {};
        this.modal.label[field.name] = option.label;
      },

      // Label shown in the closed searchselect toggle. Falls back to an
      // options lookup when the label was not captured (e.g. reopening).
      ssToggleValue(field) {
        if (!this.modal) return '';
        const label = this.modal.label && this.modal.label[field.name];
        if (label) return label;
        const value = this.modal.data ? this.modal.data[field.name] : null;
        if (value === undefined || value === null || value === '') return '';
        const found = this.msOption(field, value);
        return found ? found.label : '';
      },

      msOptions(field) {
        if (!this.modal) return [];
        const query = String((this.modal.msQuery || {})[field.name] || '').trim().toLowerCase();
        const options = (field.options || []).map((option) => (option && typeof option === 'object'
          ? option
          : { value: option, label: String(option) }));
        if (!query) return options;
        return options.filter((option) => String(option.label || '').toLowerCase().includes(query) ||
          String(option.subtitle || '').toLowerCase().includes(query));
      },

      msOption(field, value) {
        return (field.options || []).map((option) => (option && typeof option === 'object'
          ? option
          : { value: option, label: String(option) })).find((option) => String(option.value) === String(value)) || null;
      },

      isMsSelected(field, value) {
        if (!this.modal) return false;
        return (this.modal.data[field.name] || []).some((entry) => String(entry) === String(value));
      },

      toggleMs(field, value) {
        if (!this.modal) return;
        const current = (this.modal.data[field.name] || []).slice();
        const index = current.findIndex((entry) => String(entry) === String(value));
        if (index >= 0) current.splice(index, 1);
        else current.push(value);
        this.modal.data[field.name] = current;
      },

      msSelectAll(field) {
        if (!this.modal) return;
        const current = (this.modal.data[field.name] || []).slice();
        for (const option of this.msOptions(field)) {
          if (!current.some((entry) => String(entry) === String(option.value))) current.push(option.value);
        }
        this.modal.data[field.name] = current;
      },

      msClear(field) {
        if (!this.modal) return;
        this.modal.data[field.name] = [];
      },

      repOptions(column) {
        return (column.options || []).map((option) => (option && typeof option === 'object'
          ? option
          : { value: option, label: String(option) }));
      },

      fieldVisible(field) {
        if (!field) return true;
        if (typeof field.showIf !== 'function') return true;
        try {
          return field.showIf(this.modal ? this.modal.data : {}) !== false;
        } catch {
          return true;
        }
      },

      applyFormPreset(key) {
        if (!this.modal) return;
        const field = (this.modal.fields || []).find((entry) => entry.type === 'preset');
        const preset = field && (field.presets || []).find((entry) => entry.key === key);
        if (!preset) return;
        const hasRows = (this.modal.data.fields || []).length > 0;
        if (hasRows && preset.fields && preset.fields.length &&
          !window.confirm('Replace the questions you have already added with this template?')) {
          return;
        }
        this.modal.data.preset = key;
        if (preset.name) this.modal.data.name = preset.name;
        if (preset.formType) this.modal.data.formType = preset.formType;
        if (preset.isPublic !== undefined) this.modal.data.isPublic = preset.isPublic;
        if (preset.displayOnWebsite !== undefined) this.modal.data.displayOnWebsite = preset.displayOnWebsite;
        this.modal.data.fields = (preset.fields || []).map((row) => Object.assign({}, row, {
          options: Array.isArray(row.options) ? row.options.join(', ') : (row.options || '')
        }));
      },

      addRepeaterRow(field) {
        if (!this.modal) return;
        const rows = (this.modal.data[field.name] || []).slice();
        const template = field.template || {};
        const row = typeof template === 'function' ? template(rows) : Object.assign({}, template);
        rows.push(row || {});
        this.modal.data[field.name] = rows;
      },

      removeRepeaterRow(field, index) {
        if (!this.modal) return;
        const rows = (this.modal.data[field.name] || []).slice();
        rows.splice(index, 1);
        this.modal.data[field.name] = rows;
      },

      moveRepeaterRow(field, index, delta) {
        if (!this.modal) return;
        const rows = (this.modal.data[field.name] || []).slice();
        const target = index + delta;
        if (target < 0 || target >= rows.length) return;
        const [row] = rows.splice(index, 1);
        rows.splice(target, 0, row);
        this.modal.data[field.name] = rows;
      },

      openDetail(title, html, size) {
        this.modal = { type: 'detail', title, html, size: size || 'wide', saving: false };
      },

      openConfirm(title, message, options) {
        const opts = options || {};
        this.modal = {
          type: 'confirm', title, message, description: opts.description || null,
          submitLabel: opts.submitLabel || 'Confirm', danger: opts.danger !== false,
          endpoint: opts.endpoint, method: opts.method || 'POST', body: opts.body || {},
          successMessage: opts.successMessage || 'Done.', saving: false, error: null
        };
      },

      /**
       * Unified guide access: open a module's lesson-guide sequence straight
       * from anywhere modules are listed. Opens the first plan in the module;
       * the guide player handles the rest (steps, interactive slides, narration).
       */
      async openModuleGuide(moduleId) {
        try {
          const payload = await Reel.api('GET', '/learning-modules/' + encodeURIComponent(moduleId));
          const data = payload.data || {};
          const plans = (data.plans || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
          if (!plans.length) {
            this.toast('This module has no lesson plans yet — open it to add one first.', 'info');
            return;
          }
          const target = plans[0];
          if (plans.length > 1) {
            this.toast('Teaching “' + target.title + '” — plan 1 of ' + plans.length + ' in this module.');
          }
          this.openGuide(target.id);
        } catch (error) {
          this.toast(error.message || 'Could not open the module guide.', 'error');
        }
      },

      /** Build the complete Alpine guide state from a payload. Shared by the
       *  normal guide flow and the instant lesson-workspace shell. */
      buildGuideState(planId, data, block) {
        const steps = (data.steps || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
        let downloaded = false;
        try {
          const saved = JSON.parse(localStorage.getItem('reel.guidesDownloaded') || '[]');
          downloaded = saved.some((entry) => entry && entry.id === planId);
        } catch (error) { downloaded = false; }
        const savedPosition = (data.guidePosition && typeof data.guidePosition.step_index === 'number') ? data.guidePosition.step_index : 0;
        const clampedPosition = Math.max(0, Math.min(Math.max(0, steps.length - 1), savedPosition || 0));
        return {
          planId, title: (data.plan && data.plan.title) || 'Lesson guide',
          theme: (data.plan && data.plan.theme) || '', moduleTitle: (data.module && data.module.title) || '',
          steps, index: clampedPosition, downloaded,
          isOfficial: Boolean(data.plan && data.plan.isOfficial),
          block: block || null,
          toolkit: Boolean(block),
          toolkitOpen: Boolean(block),
          canEdit: !Boolean(data.plan && data.plan.isOfficial) && this.has('curriculum.create.daycare'),
          session: null, roster: null, answerLearner: {}, lastSessionId: null,
          interactiveResults: {}, participantName: (this.session && this.session.user && this.session.user.displayName) || '',
          answerByStep: {}, placementsByStep: {}, others: [], audioStep: null,
          autoplay: (() => { try { return localStorage.getItem('reel.guideAutoplay') === '1'; } catch (error) { return false; } })(),
          resumed: clampedPosition > 0, stepIndex: clampedPosition,
          loading: false
        };
      },

      async openGuide(planId) {        try {
        const pendingBlock = this._lessonBlock || null;
        this._lessonBlock = null;
          let payload;
          try {
            payload = await Reel.api('GET', '/curriculum/lesson-plans/' + encodeURIComponent(planId) + '/guide');
          } catch (error) {
            // Offline fallback: a guide saved for offline still opens with no network.
            try {
              const saved = localStorage.getItem('reel.guide.' + planId);
              if (saved) payload = { data: JSON.parse(saved) };
            } catch { /* corrupted cache — fall through to the error toast */ }
            if (!payload) throw error;
          }
          const data = payload.data || {};
          this.guide = this.buildGuideState(planId, data, pendingBlock);
          this._guidePoll = null;
          // Tell the server this teacher opened the guide (and where they left off).
          Reel.api('PATCH', '/curriculum/lesson-plans/' + encodeURIComponent(planId) + '/guide-position', {
            stepIndex: this.guide.stepIndex, mode: 'open'
          }).catch(() => { /* offline — not critical */ });
          if (this.guide.resumed) this.toast('Picking up from step ' + (this.guide.stepIndex + 1) + ' of ' + this.guide.steps.length + '.');
          this.nextTick(() => {
            if (window.Reel && window.Reel.anim) window.Reel.anim.windowIn(document.querySelector('.guide-backdrop .guide-modal'), { duration: 220 });
            this.guideBindSwipe();
            this.guideBindDragDrop();
            this.guideStartPresence();
            this.guideAutoplayStep();
          });
          if (!steps.length && !this.guide.canEdit) {
            this.toast('This plan does not have a lesson guide yet.', 'info');
          }
          this.renderIconsNow();
        } catch (error) {
          this.toast(error.message || 'The lesson guide could not be opened.', 'error');
        }
      },

      /**
       * Open the guide straight at the first interactive slide (poll, quiz,
       * matching activity or whiteboard). The timeline cards surface these as
       * first-class content, so the jump must land there, not on step 1.
       */
      async openGuideInteractive(planId, stepIndex) {
        const index = Math.max(0, Number(stepIndex) || 0);
        try {
          await Reel.api('PATCH', '/curriculum/lesson-plans/' + encodeURIComponent(planId) + '/guide-position', { stepIndex: index, mode: 'open' });
        } catch { /* offline — the guide still opens, it just resumes where it resumes */ }
        return this.openGuide(planId);
      },

      closeGuide() {
        if (this._guidePoll) { clearInterval(this._guidePoll); this._guidePoll = null; }
        this.guideStopPresence();
        this.guideStopNarration();
        if (this._guideSwipeCleanup) { this._guideSwipeCleanup(); }
        if (this._guideDragCleanup) { this._guideDragCleanup(); }
        this.guide = null;
      },

      guideProgress() {
        if (!this.guide || !this.guide.steps.length) return 0;
        return Math.round(((this.guide.index + 1) / this.guide.steps.length) * 100);
      },

      guideStepLabel(type) {
        return ({ intro: 'Intro', text: 'Step', song: 'Song', rhyme: 'Rhyme', story: 'Story', activity: 'Activity', reflection: 'Reflect', audio: 'Listen', video: 'Watch', image: 'Look', book: 'Book' })[type] || 'Step';
      },

      guideStepTone(type) {
        if (type === 'song' || type === 'rhyme' || type === 'audio') return 'badge-sky';
        if (type === 'story' || type === 'book') return 'badge-sun';
        if (type === 'activity') return 'badge-green';
        if (type === 'reflection') return 'badge-plum';
        return 'badge-muted';
      },

      guideNext() {
        if (!this.guide) return;
        const from = this.guide.index;
        const to = Math.min(this.guide.steps.length - 1, from + 1);
        if (to !== from) this.guideStepTransition(from, to, -1);
      },

      guideBack() {
        if (!this.guide) return;
        const from = this.guide.index;
        const to = Math.max(0, from - 1);
        if (to !== from) this.guideStepTransition(from, to, 1);
      },

      guideGoTo(index) {
        if (!this.guide) return;
        const from = this.guide.index;
        const to = Math.max(0, Math.min(this.guide.steps.length - 1, index));
        if (to === from) return;
        this.guideStepTransition(from, to, to > from ? -1 : 1);
      },

      /**
       * Spring step transition: the outgoing step windows out (~110ms), the
       * index flips, then the incoming step windows in and its content blooms.
       * A token guards against rapid taps racing ahead of the animation.
       */
      guideStepTransition(from, to) {
        const anim = window.Reel && window.Reel.anim;
        const seq = (this._guideStepSeq = (this._guideStepSeq || 0) + 1);
        const finish = () => {
          if (this._guideStepSeq !== seq || !this.guide) return;
          this.guide.index = to;
          this.guide.stepIndex = to;
          this.guide.resumed = to > 0;
          // Persist the position so the teacher can resume later. Silent — non-critical.
          Reel.api('PATCH', '/curriculum/lesson-plans/' + encodeURIComponent(this.guide.planId) + '/guide-position', { stepIndex: to, mode: 'step' })
            .then((p) => { if (p && p.data && p.data.completed) this.toast('Lesson complete — well done.'); })
            .catch(() => {});
          this.scrollGuideToTop();
          this.nextTick(() => {
            if (this._guideStepSeq !== seq || !this.guide) return;
            const next = document.querySelector('.guide-backdrop .guide-step[data-step-index="' + to + '"]');
            if (next && anim && !anim.reduced()) {
              anim.windowIn(next, { duration: 340 });
              anim.bloomStagger(next.querySelectorAll('.interactive-block, .guide-interactive, .guide-body, .guide-step-title'));
            }
            this.guideBindDragDrop();
            this.guideAutoplayStep();
          });
        };
        if (anim && !anim.reduced()) {
          const current = document.querySelector('.guide-backdrop .guide-step[data-step-index="' + from + '"]');
          if (current) {
            anim.windowOut(current, { duration: 110 }).then(finish);
            return;
          }
        }
        finish();
      },

      scrollGuideToTop() {
        this.nextTick(() => {
          const body = document.querySelector('.guide-modal .modal-body');
          if (body) body.scrollTop = 0;
        });
      },

      /* ---- Narration: per-step audio, with optional autoplay ---- */

      guidePlayNarration(step) {
        if (!this.guide || !step || !step.narration_url) return;
        try {
          if (!this._guideAudio) this._guideAudio = new Audio();
          const src = new URL(step.narration_url, window.location.href).href;
          if (this._guideAudio.src !== src) {
            this._guideAudio.pause();
            this._guideAudio.src = step.narration_url;
          }
          this._guideAudio.loop = false;
          this.guide.audioStep = step.id;
          this._guideAudio.onended = () => { if (this.guide) this.guide.audioStep = null; };
          this._guideAudio.play().catch(() => {
            this.guide.audioStep = null;
            this.toast('Narration could not play on this device.', 'warn');
          });
        } catch {
          this.toast('Narration could not play on this device.', 'warn');
        }
      },

      guideStopNarration() {
        if (this._guideAudio) {
          try { this._guideAudio.pause(); this._guideAudio.onended = null; } catch { /* ignore */ }
        }
        this._guideAudio = null;
        if (this.guide) this.guide.audioStep = null;
      },

      toggleGuideAutoplay() {
        if (!this.guide) return;
        this.guide.autoplay = !this.guide.autoplay;
        try { localStorage.setItem('reel.guideAutoplay', this.guide.autoplay ? '1' : '0'); } catch { /* ignore */ }
        if (this.guide.autoplay) this.guideAutoplayStep();
        else this.guideStopNarration();
        this.toast(this.guide.autoplay ? 'Narration will play automatically on each step.' : 'Narration autoplay off.');
      },

      guideAutoplayStep() {
        if (!this.guide || !this.guide.autoplay) return;
        const step = this.guide.steps[this.guide.index];
        if (step && step.narration_url) this.guidePlayNarration(step);
        else this.guideStopNarration();
      },

      /* ---- Full lesson workspace ------------------------------------------ */

      /**
       * Open a scheduled activity in the immersive lesson workspace: the full
       * step-by-step guide plus a teaching toolkit (objectives, materials,
       * safety, participation, moments and the whiteboard) beside it. Works
       * even for activities that have no lesson plan linked.
       */
      async openLesson(blockId) {
        const block = (((this.page || {}).today || {}).timeline || []).find((b) => b.id === blockId) || null;
        if (!block) { this.toast('This activity is no longer available.', 'warn'); return; }
        this._lessonBlock = null;
        this._lessonMaterials = new Set();
        const planId = block.lessonPlanId || null;
        // Paint the workspace immediately; steps arrive in the background.
        const shell = this.buildGuideState(planId || '', {}, block);
        shell.title = (block.lessonPlanTitle || block.title || 'Lesson workspace');
        shell.theme = (block.module && block.module.title) || '';
        shell.moduleTitle = (block.module && block.module.title) || '';
        shell.loading = Boolean(planId);
        this.guide = shell;
        this._guidePoll = null;
        this.nextTick(() => {
          if (window.Reel && Reel.anim) Reel.anim.windowIn(document.querySelector('.guide-backdrop .guide-modal'), { duration: 180 });
          this.renderIconsNow();
        });
        if (planId) this.hydrateLessonGuide(planId, block);
      },

      /** Fill the already-visible workspace with steps, cache-first. */
      async hydrateLessonGuide(planId, block) {
        let payload = null;
        try {
          const saved = localStorage.getItem('reel.guide.' + planId);
          if (saved) payload = { data: JSON.parse(saved) };
        } catch (error) { /* ignore corrupt cache */ }
        try {
          payload = await Reel.api('GET', '/curriculum/lesson-plans/' + encodeURIComponent(planId) + '/guide');
        } catch (error) {
          if (!payload) {
            if (this.guide && this.guide.planId === planId) this.guide.loading = false;
            this.toast(error.message || 'The lesson steps could not be loaded.', 'warn');
            return;
          }
        }
        if (!this.guide || this.guide.planId !== planId) return; // closed or switched
        const data = (payload && payload.data) || {};
        Object.assign(this.guide, this.buildGuideState(planId, data, block));
        Reel.api('PATCH', '/curriculum/lesson-plans/' + encodeURIComponent(planId) + '/guide-position', {
          stepIndex: this.guide.stepIndex, mode: 'open'
        }).catch(() => { /* offline — not critical */ });
        this.nextTick(() => {
          this.guideBindSwipe();
          this.guideBindDragDrop();
          this.guideStartPresence();
          this.renderIconsNow();
          if (this.guide.resumed) this.toast('Picking up from step ' + (this.guide.stepIndex + 1) + '.');
        });
      },

      async shareLessonWithFamilies() {
        const block = this.guide && this.guide.block;
        if (!block) { this.toast('Open a lesson from an activity first.', 'info'); return; }
        if (!window.Reel || !Reel.feedback) return;
        Reel.feedback.sheet({
          title: 'Share this lesson with families',
          message: 'One short note goes to the families of every child in this activity. Teachers without publish rights send it for principal review first.',
          actions: [{
            label: 'Share now', icon: 'send', run: async () => {
              try {
                const res = await Reel.api('POST', '/curriculum/calendar/events/' + encodeURIComponent(block.id) + '/share', { note: '' });
                const data = (res && res.data) || {};
                this.toast(data.message || (data.shared + ' moment' + (data.shared === 1 ? '' : 's') + ' shared.'));
              } catch (error) {
                this.toast(error.message || 'The lesson could not be shared.', 'error');
              }
            }
          }]
        });
      },

      lessonObjectives() {
        const block = this.guide && this.guide.block;
        return (block && block.plan && block.plan.objectives) || [];
      },

      lessonMaterials() {
        const block = this.guide && this.guide.block;
        if (!block) return [];
        const source = String((block.activity && block.activity.materials) || '');
        return source.split(/\n|,|•|·/).map((s) => s.trim()).filter(Boolean);
      },

      lessonToggleMaterial(item) {
        const set = this._lessonMaterials || (this._lessonMaterials = new Set());
        if (set.has(item)) set.delete(item); else set.add(item);
      },

      lessonMaterialDone(item) {
        return Boolean((this._lessonMaterials || new Set()).has(item));
      },

      lessonCapture(learnerId) {
        const block = this.guide && this.guide.block;
        if (!block) return;
        this.openNamedModal('blockObserveMany', learnerId ? block.id + ':' + learnerId : block.id);
      },

      lessonParticipation() {
        const block = this.guide && this.guide.block;
        if (block) this.openNamedModal('completeBlock', block.id);
      },

      lessonWhiteboard() {
        const block = this.guide && this.guide.block;
        if (!block) return;
        this.closeGuide();
        this.openWhiteboardForStep({ id: 'block-' + block.id, title: block.title });
      },

      lessonTeacherGuide() {
        const block = this.guide && this.guide.block;
        if (block && block.module && block.module.id) this.downloadExport('/learning-modules/' + block.module.id + '/teacher-guide');
        else this.toast('No teacher guide is linked to this activity.', 'info');
      },

      /* ---- Swipe left / right between steps (phones & tablets) ---- */

      guideBindSwipe() {
        const body = document.querySelector('.guide-modal .modal-body');
        if (!body) return;
        let sx = 0, sy = 0, tracking = false;
        const start = (e) => {
          if (e.touches.length !== 1) return;
          if (e.target.closest('select, input, textarea, button, .drag-item, .drop-target')) return;
          tracking = true;
          sx = e.touches[0].clientX; sy = e.touches[0].clientY;
        };
        const end = (e) => {
          if (!tracking) return;
          tracking = false;
          const t = e.changedTouches[0];
          const dx = t.clientX - sx;
          const dy = t.clientY - sy;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) this.guideNext(); else this.guideBack();
          }
        };
        body.addEventListener('touchstart', start, { passive: true });
        body.addEventListener('touchend', end, { passive: true });
        this._guideSwipeCleanup = () => {
          body.removeEventListener('touchstart', start);
          body.removeEventListener('touchend', end);
          this._guideSwipeCleanup = null;
        };
      },

      /* ---- Pointer drag-and-drop with spring settle (dragdrop steps) ---- */

      guideBindDragDrop() {
        const body = document.querySelector('.guide-modal .modal-body');
        if (!body) return;
        if (this._guideDragCleanup) { this._guideDragCleanup(); this._guideDragCleanup = null; }
        const anim = window.Reel && window.Reel.anim;
        const down = (e) => {
          const item = e.target.closest('.drag-item');
          if (!item || e.target.closest('select, input, textarea, button')) return;
          const stepEl = item.closest('.guide-step');
          const stepIndex = Number(stepEl && stepEl.dataset.stepIndex);
          const step = this.guide && this.guide.steps[stepIndex];
          if (!step || step.step_type !== 'dragdrop') return;
          e.preventDefault();
          const rect = item.getBoundingClientRect();
          const ghost = item.cloneNode(true);
          ghost.classList.add('drag-ghost');
          ghost.style.width = rect.width + 'px';
          document.body.appendChild(ghost);
          item.classList.add('drag-source');
          const targets = Array.from(stepEl.querySelectorAll('.drop-target'));
          const ii = Array.prototype.indexOf.call(stepEl.querySelectorAll('.drag-item'), item);
          const hitIndex = (ev) => targets.findIndex((t) => {
            const r = t.getBoundingClientRect();
            return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
          });
          const move = (ev) => {
            ghost.style.left = (ev.clientX - rect.width / 2) + 'px';
            ghost.style.top = (ev.clientY - 18) + 'px';
            const over = hitIndex(ev);
            targets.forEach((t, i) => t.classList.toggle('drop-active', i === over));
          };
          const up = (ev) => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            ghost.remove();
            item.classList.remove('drag-source');
            const over = hitIndex(ev);
            targets.forEach((t) => t.classList.remove('drop-active'));
            if (over === -1) return;
            if (anim && !anim.reduced()) {
              // Spring settle on the receiving target.
              anim.keyframes(targets[over], [
                { transform: 'scale(1)' },
                { transform: 'scale(1.05)' },
                { transform: 'scale(1)' }
              ], { duration: 420, spring: { stiffness: 260, damping: 12, duration: 0.42 } });
            }
            this.guideSetPlacement(step.id, ii, over);
          };
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
        };
        body.addEventListener('pointerdown', down);
        this._guideDragCleanup = () => {
          body.removeEventListener('pointerdown', down);
          this._guideDragCleanup = null;
        };
      },

      /* ---- Live co-presence: who else is on this guide right now ---- */

      guideStartPresence() {
        this.guideStopPresence();
        if (!navigator.onLine) return;
        const beat = () => {
          if (!this.guide) return;
          Reel.api('POST', '/curriculum/lesson-plans/' + encodeURIComponent(this.guide.planId) + '/presence', { stepIndex: this.guide.index })
            .then((payload) => {
              const data = (payload && payload.data) || {};
              if (this.guide) this.guide.others = data.others || [];
            })
            .catch(() => { /* best-effort */ });
        };
        beat();
        this._guidePresence = setInterval(beat, 15000);
      },

      guideStopPresence() {
        if (this._guidePresence) { clearInterval(this._guidePresence); this._guidePresence = null; }
        if (this.guide) this.guide.others = [];
      },

      guideIsInteractive(step) {
        return step && ['poll','mcq','dragdrop','whiteboard'].includes(step.step_type);
      },

      guideInteractive(step) {
        return (step && (step.interactive_data || step.interactive)) || {};
      },

      async guideStartSession() {
        if (!this.guide) return;
        // The classroom roster doubles as the "who answered" picker in named mode.
        let classrooms = [];
        try {
          const payload = await Reel.api('GET', '/classrooms');
          classrooms = (Array.isArray(payload.data) ? payload.data : []) || [];
        } catch { classrooms = []; }
        const self = this;
        this.openModal({
          title: 'Start live session',
          description: 'Anonymous is the safest default for a whole class. Named sessions build per-child evidence instead.',
          submitLabel: 'Start session',
          successMessage: 'Live session started — answers will appear here.',
          size: 'wide',
          fields: [
            { name: 'participantMode', label: 'Who answers?', type: 'select', required: true, value: 'anonymous', options: [
              { value: 'anonymous', label: 'Anonymous — votes only, never names' },
              { value: 'class_roster', label: 'Named — this classroom’s roster' }
            ], help: 'Named sessions store which child chose what — assessment evidence, handled as such.' },
            { name: 'classroomId', label: 'Classroom', type: 'select', options: window.Reel.classroomOptions({ classrooms }), help: 'Required for named answers — the roster comes from this class.', showIf: (d) => d.participantMode === 'class_roster' },
            { name: 'title', label: 'Session name (optional)', placeholder: 'e.g. Butterflies — shapes check' }
          ],
          transform: (data) => ({
            lessonPlanId: self.guide.planId,
            title: String(data.title || '').trim() || self.guide.title,
            classroomId: data.participantMode === 'class_roster' ? data.classroomId : null,
            participantMode: data.participantMode || 'anonymous'
          }),
          onSubmit: async (data) => {
            const payload = await Reel.api('POST', '/presentations/sessions', data);
            self.guide.session = payload.data || payload;
            self.guide.roster = [];
            self.guide.answerLearner = {};
            if (self.guide.session.participant_mode === 'class_roster') {
              try {
                const r = await Reel.api('GET', '/presentations/sessions/' + self.guide.session.id + '/roster');
                self.guide.roster = (r.data && r.data.learners) || r.learners || [];
              } catch { self.guide.roster = []; }
            }
            self.guideLoadResults();
            self.guideStartPolling();
            return payload;
          },
          onSuccess: () => {}
        });
      },

      async guideCloseSession() {
        if (!this.guide || !this.guide.session) return;
        const sessionId = this.guide.session.id;
        try {
          const payload = await Reel.api('POST', '/presentations/sessions/' + sessionId + '/close', {});
          const data = payload.data || payload;
          if (this.guide) { this.guide.lastSessionId = sessionId; this.guide.session = null; this.guide.roster = null; this.guide.answerLearner = {}; }
          const drafts = data && data.evidence ? Number(data.evidence.drafts) : 0;
          this.toast(drafts > 0
            ? 'Session closed — ' + drafts + ' draft observation' + (drafts === 1 ? '' : 's') + ' ready for review.'
            : 'Live session closed.');
          this.guideStopPolling();
        } catch (e) {
          this.toast(e.message || 'Could not close the session.', 'error');
        }
      },

      async guideLoadResults() {
        if (!this.guide || !this.guide.session) return;
        try {
          const payload = await Reel.api('GET', '/presentations/sessions/' + this.guide.session.id + '/results');
          const data = payload.data || payload;
          const map = {};
          (data.results || []).forEach((r) => { map[r.stepId] = r; });
          this.guide.interactiveResults = map;
          if (data.session) this.guide.session = Object.assign({}, this.guide.session, data.session);
        } catch (_) { /* polling best-effort */ }
      },

      guideStartPolling() {
        this.guideStopPolling();
        this._guidePoll = setInterval(() => { if (this.guide && this.guide.session && this.guide.session.status !== 'closed') this.guideLoadResults(); }, 3000);
      },

      guideStopPolling() {
        if (this._guidePoll) { clearInterval(this._guidePoll); this._guidePoll = null; }
      },

      guideResultFor(step) {
        if (!this.guide || !step) return null;
        return (this.guide.interactiveResults || {})[step.id] || null;
      },

      guidePick(stepId, idx) {
        if (!this.guide) return;
        this.guide.answerByStep = Object.assign({}, this.guide.answerByStep, { [stepId]: idx });
      },

      guidePicked(stepId) {
        return this.guide && this.guide.answerByStep ? this.guide.answerByStep[stepId] : undefined;
      },

      guideSetPlacement(stepId, itemIdx, targetIdx) {
        if (!this.guide) return;
        const all = Object.assign({}, this.guide.placementsByStep || {});
        const cur = Object.assign({}, all[stepId] || {});
        cur[String(itemIdx)] = Number(targetIdx);
        all[stepId] = cur;
        this.guide.placementsByStep = all;
      },

      guidePlacement(stepId, itemIdx) {
        return this.guide && this.guide.placementsByStep && this.guide.placementsByStep[stepId] ? this.guide.placementsByStep[stepId][String(itemIdx)] : undefined;
      },

      async guideSubmitResponse(step) {
        if (!this.guide || !this.guide.session || !step) return;
        const rosterMode = this.guide.session.participant_mode === 'class_roster';
        let response = {};
        if (step.step_type === 'poll' || step.step_type === 'mcq') {
          const choice = this.guidePicked(step.id);
          if (choice === undefined || choice === null || choice === '') { this.toast('Choose an answer first.', 'warn'); return; }
          response = { choice: Number(choice) };
        } else if (step.step_type === 'dragdrop') {
          response = { placements: (this.guide.placementsByStep || {})[step.id] || {} };
        } else {
          return;
        }
        const body = { stepId: step.id, response };
        if (rosterMode) {
          const learnerId = (this.guide.answerLearner || {})[step.id];
          if (!learnerId) { this.toast('Pick the child answering first — named evidence is per child.', 'warn'); return; }
          body.learnerId = learnerId;
        } else {
          const name = String(this.guide.participantName || '').trim();
          body.participantName = name || 'Participant';
        }
        try {
          await Reel.api('POST', '/presentations/sessions/' + this.guide.session.id + '/responses', body);
          this.toast('Response recorded.');
          this.guideLoadResults();
        } catch (e) {
          this.toast(e.message || 'Could not submit the response.', 'error');
        }
      },

      async openWhiteboardForStep(step) {
        // Resolve the board linked to this exact step, if any.
        const planId = this.guide && this.guide.planId;
        try {
          const payload = await Reel.api('GET', '/whiteboards');
          const boards = Array.isArray(payload.data) ? payload.data : (payload.data && payload.data.data) || [];
          const match = boards.find((b) => !b.isArchived &&
            (b.lessonStepId === (step && step.id) || (planId && b.lessonPlanId === planId)));
          if (match) {
            this.closeGuide();
            location.hash = '#/app/whiteboards/' + match.id;
            return;
          }
          // No board yet — ask for a name (default: lesson — step) then create it.
          const planTitle = this.guide && this.guide.title ? this.guide.title : 'Lesson';
          const stepTitle = (step && step.title) ? step.title : 'Whiteboard';
          this.openModal({
            title: 'Create the board for this step',
            description: 'One board per step — it stays linked to the plan and reopens here next time.',
            submitLabel: 'Create board',
            successMessage: 'Board created — opening canvas.',
            fields: [
              { name: 'title', label: 'Board name', required: true, value: planTitle + ' — ' + stepTitle, span: 2, placeholder: 'e.g. Nature Detectives — Insect traffic stop' },
              { name: 'description', label: 'Description (optional)', type: 'textarea', placeholder: 'What will children explore on this board?' }
            ],
            transform: (data) => Object.assign({}, data, { lessonPlanId: planId, lessonStepId: step && step.id ? step.id : undefined }),
            onSuccess: (data) => {
              if (data && data.id) {
                this.closeGuide();
                location.hash = '#/app/whiteboards/' + data.id;
              }
            }
          });
        } catch (e) {
          this.toast(e.message || 'Could not open the whiteboard for this step.', 'error');
        }
      },

      async guideAddInteractive() {
        if (!this.guide) return;
        const planId = this.guide.planId;
        const self = this;
        let objectiveOptions = [];
        try {
          const payload = await Reel.api('GET', '/curriculum/objectives');
          const list = (payload.data && Array.isArray(payload.data)) ? payload.data : (payload.data && payload.data.data) || [];
          objectiveOptions = list.slice(0, 150).map((o) => ({ value: o.id, label: (o.code ? o.code + ' — ' : '') + String(o.description || '').slice(0, 90) }));
        } catch { objectiveOptions = []; }
        const isChoice = (d) => d && (d.stepType === 'poll' || d.stepType === 'mcq');
        const isMcq = (d) => d && d.stepType === 'mcq';
        const isDrag = (d) => d && d.stepType === 'dragdrop';
        const isWhiteboard = (d) => d && d.stepType === 'whiteboard';
        this.openModal({
          title: 'Add interactive slide',
          description: 'Choose a slide type and fill in only what’s needed. You can start a live session during the lesson to collect responses in real time.',
          fields: [
            { name: 'stepType', label: 'Slide type', type: 'select', required: true, value: 'poll', options: [
              { value: 'poll', label: 'Poll — gather live responses' },
              { value: 'mcq', label: 'Multiple-choice question — check understanding' },
              { value: 'dragdrop', label: 'Match activity — pair items to targets' },
              { value: 'whiteboard', label: 'Whiteboard — draw, sketch & collaborate' }
            ], help: 'The form below updates to show the right fields for the selected type.' },
            { name: 'title', label: 'Slide title', required: true, span: 2, placeholder: 'e.g. Quick check: Shapes around us' },
            { name: 'narrationUrl', label: 'Narration audio (URL, optional)', span: 2, type: 'url',
              placeholder: 'https://…/story.mp3',
              help: 'Paste an audio link — the player can play it per step or automatically. MP3, M4A, WAV and OGG work.', },
            { name: 'question', label: 'Question / prompt', type: 'textarea', span: 2,
              placeholder: 'What should learners answer, think about, or explore?',
              showIf: (d) => !isWhiteboard(d),
              help: 'Shown at the top of the slide to guide learners.' },
            { name: 'objectiveIds', label: 'Linked objectives', type: 'multiselect', span: 2,
              options: objectiveOptions,
              placeholder: 'Search objectives by code or description…',
              help: 'Link this slide to what it teaches — answers become evidence against these objectives.', showIf: (d) => !isWhiteboard(d) },
            { name: 'options', label: 'Answer options', type: 'textarea', span: 2,
              placeholder: 'Circle\nSquare\nTriangle\nRectangle',
              help: 'Enter one option per line (2 or more recommended).',
              showIf: isChoice },
            { name: 'correct', label: 'Correct answer (optional)', placeholder: 'Option number, e.g. 2',
              help: 'For MCQ: which option number is correct? Leave blank for no auto-marking.',
              showIf: isMcq },
            { name: 'items', label: 'Items to match', type: 'textarea', span: 2,
              placeholder: 'Cat\nDog\nBird',
              help: 'Enter one item per line — learners will match each to a target.',
              showIf: isDrag },
            { name: 'targets', label: 'Match targets', type: 'textarea', span: 2,
              placeholder: 'Meow\nWoof\nChirp',
              help: 'Enter one target per line in the order that matches the items (used to check answers).',
              showIf: isDrag },
            { name: 'whiteboardNote', label: 'Whiteboard tip', type: 'textarea', span: 2,
              value: 'Use this slide to draw, annotate, sketch maths/science ideas, or solve problems together on an infinite canvas.',
              help: 'This note appears on the slide. You can open a live whiteboard canvas during the lesson.',
              showIf: isWhiteboard }
          ],
          submitLabel: 'Add interactive slide',
          endpoint: '/curriculum/lesson-plans/' + planId + '/steps',
          transform: (data) => {
            const type = data.stepType || 'poll';
            const interactive = {};
            const title = String(data.title || '').trim() || (type === 'whiteboard' ? 'Whiteboard activity' : 'Interactive slide');
            const question = String(data.question || '').trim();
            if (question && type !== 'whiteboard') interactive.question = question;
            const objectiveIds = Array.isArray(data.objectiveIds) ? data.objectiveIds.filter(Boolean) : [];
            if (objectiveIds.length && type !== 'whiteboard') interactive.objectiveIds = objectiveIds;
            if (type === 'poll' || type === 'mcq') {
              const options = String(data.options || '').split('\n').map(s => s.trim()).filter(Boolean);
              interactive.options = options.length ? options : ['Option 1', 'Option 2'];
              if (type === 'mcq' && data.correct) { const n = parseInt(data.correct, 10); if (!isNaN(n) && n >= 1) interactive.correct = [n - 1]; }
            }
            if (type === 'dragdrop') {
              const items = String(data.items || '').split('\n').map(s => s.trim()).filter(Boolean);
              const targets = String(data.targets || '').split('\n').map(s => s.trim()).filter(Boolean);
              const safeItems = items.length ? items : ['Item 1', 'Item 2'];
              const safeTargets = targets.length ? targets : ['Target 1', 'Target 2'];
              interactive.items = safeItems.map((label) => ({ label }));
              interactive.targets = safeTargets.map((label) => ({ label }));
              if (!interactive.question) interactive.question = question || 'Match each item to the correct target.';
            }
            if (type === 'whiteboard') {
              interactive.note = String(data.whiteboardNote || data.question || '').trim() || 'Draw, annotate and solve together on the whiteboard.';
            }
            const body = type === 'whiteboard' ? interactive.note : (question || interactive.question || '');
            return { stepType: type, title, body, narrationUrl: String(data.narrationUrl || '').trim() || null, interactive };
          },
          onSuccess: async () => {
            self.toast('Interactive slide added to the presentation.');
            try {
              const payload = await Reel.api('GET', '/curriculum/lesson-plans/' + encodeURIComponent(planId) + '/guide');
              const data = payload.data || {};
              const steps = (data.steps || []).slice().sort((a,b)=>(a.position||0)-(b.position||0));
              if (self.guide && self.guide.planId === planId) {
                self.guide.steps = steps;
                self.guide.index = Math.max(0, steps.length - 1);
              }
            } catch (_) { /* ignore */ }
          }
        });
      },


      speechSupported() {
        return typeof window !== 'undefined' && 'speechSynthesis' in window;
      },

      refreshVoices() {
        if (!this.speechSupported()) { this.voices = []; return; }
        // English voices only; device order is not meaningful, rank them ourselves.
        this.voices = (window.speechSynthesis.getVoices() || []).filter((voice) => /^en([-_]|$)/i.test(voice.lang || ''));
      },

      englishVoices() {
        return this.voices.slice().sort((a, b) => this.voiceRank(b) - this.voiceRank(a));
      },

      voiceRank(voice) {
        const name = String(voice.name || '').toLowerCase();
        const lang = String(voice.lang || '').toLowerCase();
        let score = 0;
        if (/en[-_]za/.test(lang)) score += 60;            // South African voices first
        else if (/en[-_]gb|en[-_]au|en[-_]nz|en[-_]ie/.test(lang)) score += 25;
        else if (/en[-_]/.test(lang)) score += 15;
        if (/(natural|neural|online|wavenet|google|enhanced)/.test(name)) score += 40;
        if (/(samantha|daniel|karen|alex|moira|fiona|victoria)/.test(name)) score += 30;
        if (/(female|woman|zira|aria|hazel)/.test(name)) score += 12;
        if (voice.localService) score += 5;
        return score;
      },

      selectedVoice() {
        const voices = this.englishVoices();
        if (!voices.length) return null;
        const saved = voices.find((voice) => voice.voiceURI === this.voiceUri);
        return saved || voices[0];
      },

      selectedVoiceLabel() {
        const voice = this.selectedVoice();
        return voice ? voice.name : 'No voice available on this device';
      },

      selectVoice(uri) {
        this.voiceUri = String(uri || '');
        try { localStorage.setItem('reel.voiceUri', this.voiceUri); } catch { /* private mode */ }
      },

      speakableText(text) {
        // Make prose sound natural when read aloud: breathe at line ends,
        // drop decoration that is visual noise to the synthesizer.
        return String(text || '')
          .replace(/['’`]/g, "'")
          .replace(/[""„]/g, '"')
          .replace(/[•·]/g, '. ')
          .replace(/\s*\n\s*/g, ', ')
          .replace(/,\s*,/g, ',')
          .replace(/\.\s*,/g, '.')
          .replace(/,\s*\./g, '.')
          .replace(/\.\.\./g, '...')
          .replace(/\s+/g, ' ')
          .replace(/\.\s*\./g, '.')
          .trim();
      },

      speakCurrentStep() {
        if (!this.guide || !this.speechSupported()) return;
        const step = this.guide.steps[this.guide.index];
        if (!step || !step.body) return;
        window.speechSynthesis.cancel();
        const body = this.speakableText((step.title ? step.title + '. ' : '') + step.body);
        const utterance = new SpeechSynthesisUtterance(body);
        const voice = this.selectedVoice();
        if (voice) utterance.voice = voice;
        utterance.lang = (voice && voice.lang) || 'en-ZA';
        // Songs, rhymes and stories land better clearly and slower than instructions.
        utterance.rate = /song|rhyme|story|book/.test(String(step.step_type || '')) ? 0.75 : 0.82;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
      },

      guideOfflineDownloaded() {
        if (!this.guide) return false;
        if (this.guide.downloaded) return true;
        try {
          const saved = JSON.parse(localStorage.getItem('reel.guidesDownloaded') || '[]');
          return saved.some((entry) => entry && entry.id === this.guide.planId);
        } catch {
          return false;
        }
      },

      guideOfflineStatus() {
        if (!this.guide) return '';
        return this.guideOfflineDownloaded()
          ? 'Saved for offline — this guide works with no connection.'
          : 'Download first, then this guide works with zero data.';
      },

      async downloadGuideOffline() {
        if (!this.guide) return;
        const planId = this.guide.planId;
        try {
          const payload = await Reel.api('GET', '/curriculum/lesson-plans/' + encodeURIComponent(planId) + '/guide');
          localStorage.setItem('reel.guide.' + planId, JSON.stringify(payload.data));
          const saved = JSON.parse(localStorage.getItem('reel.guidesDownloaded') || '[]').filter((entry) => entry && entry.id !== planId);
          saved.push({ id: planId, title: this.guide.title, downloadedAt: new Date().toISOString() });
          localStorage.setItem('reel.guidesDownloaded', JSON.stringify(saved));
          if (this.guide && this.guide.planId === planId) this.guide.downloaded = true;
          // Also fill the shell cache so the guide and app assets work with no network.
          try {
            if (window.caches) {
              const cache = await caches.open('reel-shell-v1');
              await cache.put('/api/v1/curriculum/lesson-plans/' + encodeURIComponent(planId) + '/guide',
                new Response(JSON.stringify(payload.data), { headers: { 'Content-Type': 'application/json' } }));
            }
          } catch { /* localStorage copy is authoritative */ }
          this.toast('Guide downloaded — it now works offline.');
        } catch (error) {
          this.toast(error.message || 'The guide could not be downloaded.', 'error');
        }
      },

      closeModal() {
        if (this.modal && this.modal.saving) return;
        if (this.stopGateQrScan) this.stopGateQrScan();
        // Window-out transition before the modal unmounts (kept snappy).
        const el = document.querySelector('.modal-backdrop:not(.guide-backdrop) .modal');
        const animatable = el && window.Reel && window.Reel.anim && !Reel.anim.reduced();
        if (animatable && !this._modalClosing) {
          this._modalClosing = true;
          const token = (this._modalToken = (this._modalToken || 0) + 1);
          window.Reel.anim.windowOut(el, { duration: 140 }).then(() => {
            if (this._modalToken !== token) return; // a new modal opened meanwhile
            this._modalClosing = false;
            this.modal = null;
            this.signaturePads = {};
          });
          return;
        }
        this._modalToken = (this._modalToken || 0) + 1;
        this._modalClosing = false;
        this.modal = null;
        this.signaturePads = {};
      },

      mediaPreview(field, url) {
        if (!url) return '';
        const resolved = Reel.resolveMediaUrl ? Reel.resolveMediaUrl(url) : url;
        return Reel.mediaHtml(resolved, field.kind || Reel.kindForUrl(url), { compact: true, alt: field.label || '' });
      },

      async uploadModalMedia(field, event) {
        const input = event && event.target;
        const files = input && input.files ? Array.from(input.files) : [];
        if (!files.length || !this.modal) return;
        this.modal.mediaBusy = this.modal.mediaBusy || {};
        this.modal.mediaBusy[field.name] = true;
        this.modal.error = null;
        try {
          for (const file of files) {
            const asset = await Reel.uploadMedia(file, {
              scope: field.scope || 'general',
              ownerType: field.ownerType || undefined,
              ownerId: field.ownerId || undefined,
              shared: ['nursery-rhyme', 'book'].includes(field.scope) ? true : undefined
            });
            if (field.multiple) {
              const list = Array.isArray(this.modal.data[field.name]) ? this.modal.data[field.name] : [];
              list.push(asset.url);
              this.modal.data[field.name] = list;
            } else {
              this.modal.data[field.name] = asset.url;
            }
            if (field.mediaTypeField && this.modal.data[field.mediaTypeField] !== undefined) {
              const kind = Reel.kindForUrl(asset.url, 'image');
              this.modal.data[field.mediaTypeField] = (field.mediaTypeMap || {})[kind] || kind;
            }
            if (field.storageKeyField && this.modal.data[field.storageKeyField] !== undefined) {
              this.modal.data[field.storageKeyField] = asset.storage_key;
            }
          }
          this.toast(files.length > 1 ? files.length + ' files uploaded.' : 'File uploaded.');
        } catch (error) {
          this.modal.error = error.message || 'The file could not be uploaded.';
        } finally {
          this.modal.mediaBusy[field.name] = false;
          if (input) input.value = '';
        }
      },

      toggleModalChoice(field, value, checked) {
        if (!this.modal) return;
        const current = Array.isArray(this.modal.data[field.name]) ? this.modal.data[field.name].slice() : [];
        const index = current.indexOf(value);
        if (checked && index === -1) current.push(value);
        if (!checked && index !== -1) current.splice(index, 1);
        this.modal.data[field.name] = current;
      },

      async uploadModalFormFile(field, event) {
        const input = event && event.target;
        const file = input && input.files && input.files[0];
        if (!file || !this.modal) return;
        this.modal.mediaBusy = this.modal.mediaBusy || {};
        this.modal.mediaBusy[field.name] = true;
        this.modal.error = null;
        try {
          const asset = await Reel.uploadFormFile(file, { formId: field.formId });
          this.modal.data[field.name] = asset.url;
          this.toast('File uploaded.');
        } catch (error) {
          this.modal.error = error.message || 'The file could not be uploaded.';
        } finally {
          this.modal.mediaBusy[field.name] = false;
          if (input) input.value = '';
        }
      },

      /**
       * Upload one or more files chosen on the media library page. The bytes go
       * straight to R2 via a presigned URL; the library then reloads so the new
       * assets appear in the grid.
       */
      async uploadLibraryFiles(event) {
        const input = event && event.target;
        const files = input && input.files ? Array.from(input.files) : [];
        if (!files.length) return;
        this.libraryBusy = true;
        try {
          for (const file of files) {
            await Reel.uploadMedia(file, { scope: (this.filters && this.filters.scope) || 'general' });
          }
          this.toast(files.length > 1 ? files.length + ' files uploaded.' : 'File uploaded.');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'The file could not be uploaded.', 'error');
        } finally {
          this.libraryBusy = false;
          if (input) input.value = '';
        }
      },

      // -----------------------------------------------------------------------
      // Public website editor
      // -----------------------------------------------------------------------

      /** Read a nested value such as `hero.headline` from the draft. */
      siteValue(path) {
        return String(path || '').split('.').reduce((value, key) => (value && value[key] !== undefined ? value[key] : ''), this.siteDraft);
      },

      /** Write a nested value such as `hero.image` without losing siblings. */
      setSiteValue(path, value) {
        if (!this.siteDraft) return;
        const keys = String(path || '').split('.');
        let target = this.siteDraft;
        for (let index = 0; index < keys.length - 1; index += 1) {
          const key = keys[index];
          if (!target[key] || typeof target[key] !== 'object') target[key] = {};
          target = target[key];
        }
        target[keys[keys.length - 1]] = value;
      },

      siteAdd(path, value) {
        if (!this.siteDraft) return;
        const current = this.siteValue(path);
        const next = Array.isArray(current) ? current.slice() : [];
        next.push(value);
        this.setSiteValue(path, next);
      },

      siteRemove(path, index) {
        const current = this.siteValue(path);
        if (!Array.isArray(current)) return;
        const next = current.slice();
        next.splice(index, 1);
        this.setSiteValue(path, next);
      },

      siteMove(path, index, direction) {
        const current = this.siteValue(path);
        if (!Array.isArray(current)) return;
        const target = index + direction;
        if (target < 0 || target >= current.length) return;
        const next = current.slice();
        const [item] = next.splice(index, 1);
        next.splice(target, 0, item);
        this.setSiteValue(path, next);
      },

      /** Upload one website image and place its URL at the given draft path. */
      async uploadSiteImage(path, event) {
        const input = event && event.target;
        const file = input && input.files ? input.files[0] : null;
        if (!file) return;
        this.siteBusy = path;
        this.siteError = null;
        try {
          const asset = await Reel.uploadMedia(file, { scope: 'website' });
          this.setSiteValue(path, asset.url);
          this.toast('Image uploaded. Save the draft to keep it.');
        } catch (error) {
          this.siteError = error.message || 'The image could not be uploaded.';
          this.toast(this.siteError, 'error');
        } finally {
          this.siteBusy = null;
          if (input) input.value = '';
        }
      },

      /** Upload one website media file and place its URL and kind at the given draft path. */
      async uploadSiteMedia(path, event) {
        const input = event && event.target;
        const file = input && input.files ? input.files[0] : null;
        if (!file) return;
        this.siteBusy = path;
        this.siteError = null;
        try {
          const asset = await Reel.uploadMedia(file, { scope: 'website' });
          this.setSiteValue(path, asset.url);
          // The companion `kind` field lives next to the url on gallery items.
          if (/\.url$/.test(path)) this.setSiteValue(path.replace(/\.url$/, '.kind'),
            asset.kind || Reel.kindForUrl(asset.url));
          this.toast('Media uploaded. Save the draft to keep it.');
        } catch (error) {
          this.siteError = error.message || 'The file could not be uploaded.';
          this.toast(this.siteError, 'error');
        } finally {
          this.siteBusy = null;
          if (input) input.value = '';
        }
      },

      /** Upload several website media files at once and append them to the gallery. */
      async uploadSiteGallery(event) {
        const input = event && event.target;
        const files = input && input.files ? Array.from(input.files) : [];
        if (!files.length) return;
        this.siteBusy = 'gallery';
        this.siteError = null;
        const added = [];
        try {
          for (const file of files) {
            const asset = await Reel.uploadMedia(file, { scope: 'website' });
            added.push({
              url: asset.url,
              caption: '',
              kind: asset.kind || Reel.kindForUrl(asset.url)
            });
          }
          const current = this.siteValue('gallery');
          const next = Array.isArray(current) ? current.slice() : [];
          next.push(...added);
          this.setSiteValue('gallery', next);
          this.toast(added.length + (added.length === 1 ? ' file' : ' files') + ' uploaded. Save the draft to keep them.');
        } catch (error) {
          this.siteError = error.message || 'The files could not be uploaded.';
          this.toast(this.siteError, 'error');
        } finally {
          this.siteBusy = null;
          if (input) input.value = '';
        }
      },

      async saveSiteDraft(options) {
        if (!this.siteDraft) return null;
        const opts = options || {};
        this.siteSaving = true;
        this.siteError = null;
        try {
          const content = Object.assign({}, this.siteDraft);
          delete content.theme;
          const payload = await Reel.api('PATCH', '/website', {
            theme: this.siteDraft.theme || undefined,
            draftContent: content
          });
          this.siteSavedAt = new Date().toISOString();
          if (!opts.silent) this.toast('Website draft saved.');
          if (opts.reload !== false) await this.navigate(true);
          return payload;
        } catch (error) {
          this.siteError = error.message || 'The website draft could not be saved.';
          this.toast(this.siteError, 'error');
          return null;
        } finally {
          this.siteSaving = false;
        }
      },

      /** Save the current editor values, then ask for confirmation to publish. */
      async publishSite() {
        const saved = await this.saveSiteDraft({ reload: false, silent: true });
        if (!saved) return;
        this.openConfirm('Publish website',
          'The saved draft replaces the live website immediately. Families will see these pages at your public address.',
          {
            endpoint: '/website/publish',
            method: 'POST',
            body: {},
            submitLabel: 'Publish',
            successMessage: 'Website published.',
            danger: false
          });
      },

      async addModalMediaUrl(field) {
        if (!this.modal) return;
        const draft = ((this.modal.mediaDraft || {})[field.name] || '').trim();
        if (!draft) return;
        if (!window.Reel || !window.Reel.safeUrl(draft)) {
          this.toast('That link is not an http(s) address — links like javascript: are not allowed.', 'warn');
          return;
        }
        const list = Array.isArray(this.modal.data[field.name]) ? this.modal.data[field.name] : [];
        list.push(draft);
        this.modal.data[field.name] = list;
        this.modal.mediaDraft[field.name] = '';
      },

      async verifyDomain(id) {
        if (!id || this.domainBusy) return;
        this.domainBusy = id;
        try {
          const payload = await Reel.api('POST', '/website/domains/' + encodeURIComponent(id) + '/verify', {});
          const data = payload.data || {};
          if (data.verified) {
            this.toast(data.ssl_status === 'active'
              ? 'Domain verified. The secure site is live.'
              : 'Domain verified. DNS is correct; the certificate is still being issued.');
          } else {
            this.toast((data.check && data.check.reason) || 'No matching DNS record was found yet.', 'warn');
          }
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'The domain could not be checked.', 'error');
        } finally {
          this.domainBusy = null;
        }
      },

      removeDomain(id, name) {
        if (!id) return;
        this.openConfirm('Remove domain',
          'Remove ' + (name || 'this domain') + '? The public website stays available at its Re-EL address, but it will stop loading on this custom domain.',
          {
            endpoint: '/website/domains/' + encodeURIComponent(id),
            method: 'DELETE',
            submitLabel: 'Remove domain',
            successMessage: 'Domain removed.',
            danger: true
          });
      },

      removeModalMedia(field, index) {
        if (!this.modal) return;
        const list = Array.isArray(this.modal.data[field.name]) ? this.modal.data[field.name].slice() : [];
        list.splice(index, 1);
        this.modal.data[field.name] = list;
      },

      clearModalMedia(field) {
        if (!this.modal) return;
        this.modal.data[field.name] = field.multiple ? [] : '';
        if (field.storageKeyField && this.modal.data[field.storageKeyField] !== undefined) {
          this.modal.data[field.storageKeyField] = '';
        }
      },

      // Hand-signature capture for custody events: draw on the canvas, the
      // stroke becomes a PNG data URL in modal.data on pointer release.
      initSignaturePad(field, canvas) {
        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111827';
        const pad = { canvas, ctx, drawing: false, last: null };
        this.signaturePads[field.name] = pad;
        if (this.modal) this.modal.data[field.name] = '';
        const point = (e) => {
          const rect = canvas.getBoundingClientRect();
          return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height)
          };
        };
        const stroke = (e) => {
          if (!pad.drawing) return;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(pad.last ? pad.last.x : p.x, pad.last ? pad.last.y : p.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          pad.last = p;
        };
        canvas.onpointerdown = (e) => {
          pad.drawing = true;
          pad.last = null;
          try { canvas.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
          stroke(e);
        };
        canvas.onpointermove = stroke;
        const finish = () => {
          if (!pad.drawing) return;
          pad.drawing = false;
          if (this.modal && this.modal.data && field.name in this.modal.data) {
            this.modal.data[field.name] = canvas.toDataURL('image/png');
          }
        };
        canvas.onpointerup = finish;
        canvas.onpointercancel = finish;
        canvas.onpointerleave = finish;
      },

      clearSignaturePad(field) {
        if (!this.modal) return;
        this.modal.data[field.name] = '';
        const pad = this.signaturePads[field.name];
        if (pad) {
          pad.ctx.clearRect(0, 0, pad.canvas.width, pad.canvas.height);
          pad.last = null;
        }
      },

      async submitModal() {
        if (!this.modal || this.modal.saving) return;
        const missing = (this.modal.fields || []).filter((f) => {
          if (!f.required || !this.fieldVisible(f)) return false;
          const value = this.modal.data[f.name];
          if (Array.isArray(value)) return value.length === 0;
          return value === '' || value === null || value === undefined;
        });
        if (missing.length) {
          this.modal.error = 'Please complete: ' + missing.map((f) => f.label).join(', ');
          return;
        }
        if (this.modal.confirmText && String(this.modal.data.confirmation || '') !== this.modal.confirmText) {
          this.modal.error = 'Type “' + this.modal.confirmText + '” to confirm this action.';
          return;
        }
        this.modal.saving = true;
        this.modal.error = null;
        const endpoint = this.modal.endpoint || '';
        try {
          // datetime-local fields carry no offset — the browser is the only
          // party that knows the intended wall time. Convert them to
          // offset-aware ISO before sending so the instant is unambiguous
          // (a naive string is interpreted in the server's timezone instead
          // of the user's).
          const declared = (this.modal.fields || []).map((f) => f.name);
          const plain = {};
          for (const key of declared) plain[key] = this.modal.data[key];
          for (const field of (this.modal.fields || [])) {
            const v = plain[field.name];
            if (field.type === 'datetime-local' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && !/Z$|[+-]\d{2}:?\d{2}$/.test(v)) {
              const parsed = new Date(v);
              if (!Number.isNaN(parsed.getTime())) plain[field.name] = parsed.toISOString();
            }
          }
          let body = this.modal.transform ? this.modal.transform(plain) : plain;
          if (body && typeof body === 'object') {
            try { body = JSON.parse(JSON.stringify(body)); } catch { /* send as-is */ }
          }
          let result = null;
          if (this.modal.onSubmit) result = await this.modal.onSubmit(body, this.modal.data);
          else result = await Reel.api(this.modal.method, this.modal.endpoint, body);
          const message = this.modal.successMessage || 'Saved successfully.';
          const onSuccess = this.modal.onSuccess;
          this.modal = null;
          if (/\/complete$/.test(endpoint)) {
            if (window.Reel && Reel.feedback) { Reel.feedback.delight(); Reel.feedback.cue('complete'); }
          }
          if (/^\/organisations\/current$/.test(endpoint) || /^\/platform\/settings$/.test(endpoint)) await this.refreshSession();
          this.toast(message);
          if (typeof onSuccess === 'function') {
            try { onSuccess(result && result.data !== undefined ? result.data : result); } catch (_) { /* ignore */ }
          } else {
            await this.navigate(true);
          }
        } catch (error) {
          this.modal.error = error.message || 'The action failed.';
          if (error.details && Array.isArray(error.details)) {
            this.modal.error += ' ' + error.details.map((d) => d.message || d.field).join(' · ');
          }
          if (window.Reel && Reel.feedback) { Reel.feedback.cue('error'); Reel.feedback.shake(document.querySelector('.modal-backdrop .alert-danger')); }
          this.modal.saving = false;
        }
      },

      async confirmModal() {
        if (!this.modal || this.modal.saving) return;
        this.modal.saving = true;
        try {
          // Modal state lives on a reactive proxy whose nested objects do not
          // always serialise cleanly on the wire — send a plain deep copy.
          const body = JSON.parse(JSON.stringify(this.modal.body || {}));
          await Reel.api(this.modal.method, this.modal.endpoint, body);
          const message = this.modal.successMessage;
          this.modal = null;
          this.toast(message || 'Done.');
          await this.navigate(true);
        } catch (error) {
          this.modal.error = error.message || 'The action failed.';
          this.modal.saving = false;
        }
      },

      openCommand() {
        if (!this.session || this.billingLocked) return;
        this.commandOpen = true;
        this.commandQuery = '';
        this.commandIndex = 0;
        this.runCommandSearch();
        this.nextTick(() => { if (this.$refs.commandInput) this.$refs.commandInput.focus(); });
      },

      async runCommandSearch() {
        const query = this.commandQuery.trim().toLowerCase();
        const navResults = [];
        const groups = this.area === 'platform' ? NAV.platform : (this.area === 'parent' ? NAV.parent : NAV.app);
        for (const group of groups) {
          for (const item of group.items) {
            if (!this.has(item.permission)) continue;
            if (!query || item.label.toLowerCase().includes(query)) {
              navResults.push({ key: 'nav-' + item.path, label: item.label, route: item.path, kind: 'Page', icon: item.icon });
            }
          }
        }
        let apiResults = [];
        if (query.length >= 2) {
          const seq = ++this._searchSeq;
          try {
            if (this.area === 'platform') {
              const payload = await Reel.api('GET', '/platform/search?q=' + encodeURIComponent(this.commandQuery.trim()));
              if (seq !== this._searchSeq) return;
              const data = payload.data || {};
              apiResults = [
                ...(data.organisations || []).map((o) => ({ key: 'org-' + o.id, label: o.name, route: '/platform/organisations/' + o.id, kind: 'Organisation', icon: 'building-2' })),
                ...(data.users || []).map((u) => ({ key: 'puser-' + u.id, label: u.display_name + ' · ' + u.email, route: '/platform/users?q=' + encodeURIComponent(u.email), kind: 'User', icon: 'user' })),
                ...(data.branches || []).map((b) => ({ key: 'branch-' + b.id, label: b.name + ' · ' + (b.organisation_name || ''), route: '/platform/organisations', kind: 'Branch', icon: 'store' })),
                ...(data.learners || []).map((l) => ({ key: 'plearner-' + l.id, label: l.first_name + ' ' + l.last_name + ' · ' + (l.organisation_name || ''), route: '/platform/organisations', kind: 'Learner', icon: 'baby' }))
              ];
            } else {
              const payload = await Reel.api('GET', '/search?q=' + encodeURIComponent(this.commandQuery.trim()));
              if (seq !== this._searchSeq) return;
              const data = payload.data || {};
              apiResults = [
                ...(data.learners || []).map((l) => ({ key: 'learner-' + l.id, label: l.first_name + ' ' + l.last_name, route: '/app/learners/' + l.id, kind: 'Learner', icon: 'user' })),
                ...(data.staff || []).map((s) => ({ key: 'staff-' + s.id, label: s.display_name, route: '/app/staff/' + s.id, kind: 'Staff', icon: 'id-card' }))
              ];
            }
          } catch { apiResults = []; }
        }
        const pages = (this.area === 'app' && this.has(['learners.create.daycare'])) ? [{ key: 'action-learner', label: 'Add a learner', route: '/app/learners', kind: 'Action', icon: 'user-plus', action: 'learner' }] : [];
        // Context-aware: the current page's own actions rank right under search.
        const contextual = (query ? [] : this.contextActions().map((action, index) =>
          Object.assign({ key: 'ctx-' + index, kind: 'On this page', icon: action.icon || 'zap' }, action)));
        this.commandResults = [...contextual, ...apiResults, ...navResults, ...pages].slice(0, 18);
        this.commandIndex = 0;
      },

      /**
       * Context-aware palette actions: what you can do right here, on the
       * page you're standing on. Each maps to an existing quick-add modal or
       * a direct command, so there is no duplicated form logic.
       */
      contextActions() {
        if (this.area !== 'app' || !this.route) return [];
        const can = (perm) => this.has(perm);
        const path = this.route.path;
        const actions = [];
        if (path === '/app/today') {
          if (can(['assessments.create.assigned', 'curriculum.create.daycare'])) actions.push({ label: 'Capture a quick moment', modal: 'quickMoment', icon: 'camera' });
          if (can('curriculum.create.daycare')) actions.push({ label: 'Plan the day on the calendar', route: '/app/calendar', icon: 'calendar-days' });
        }
        if (path === '/app/learner-attendance' && can(['attendance.record.daycare', 'attendance.record.assigned'])) {
          actions.push({ label: 'Open live presence', route: '/app/learner-attendance?tab=presence', icon: 'radio' });
          actions.push({ label: 'View attendance reports', route: '/app/learner-attendance?tab=reports', icon: 'bar-chart-3' });
        }
        if (path === '/app/learners' && can('learners.create.daycare')) actions.push({ label: 'Enrol a new learner', modal: 'learner', icon: 'user-plus' });
        if (path === '/app/tasks' && can(['tasks.read.own', 'tasks.manage.daycare'])) actions.push({ label: 'Create a task', modal: 'task', icon: 'list-plus' });
        if (path === '/app/communications' && can('announcements.manage.daycare')) actions.push({ label: 'Write an announcement', modal: 'announcement', icon: 'megaphone' });
        if (path === '/app/admissions' && can('admissions.manage.daycare')) actions.push({ label: 'Log an enquiry', modal: 'enquiry', icon: 'inbox' });
        if (path === '/app/safety' && can(['safety.report.daycare', 'safety.manage.daycare'])) actions.push({ label: 'Log an incident', modal: 'incident', icon: 'shield-alert' });
        if (path === '/app/finance' && can('finance.payment.record.daycare')) actions.push({ label: 'Record a payment', modal: 'payment', icon: 'banknote' });
        if (path === '/app/calendar' && can('curriculum.create.daycare')) actions.push({ label: 'Schedule an event', modal: 'event', icon: 'calendar-plus' });
        if (path === '/app/staff' && can('staff.manage.daycare')) actions.push({ label: 'Add a staff member', modal: 'staff', icon: 'user-plus' });
        return actions.slice(0, 4);
      },

      selectCommand(result) {
        if (!result) return;
        this.commandOpen = false;
        if (result.action) {
          if (result.route) location.hash = result.route;
          setTimeout(() => this.runQuickAction({ modal: result.action }), 120);
          return;
        }
        if (result.route) location.hash = result.route;
      },

      runQuickAction(action) {
        if (!action) return;
        if (action.route) location.hash = action.route;
        if (action.modal) setTimeout(() => this.openNamedModal(action.modal), 140);
      },

      openNamedModal(name, id) {
        // Cross-cutting actions available from any screen (Today, Overview, etc.).
        if (name === 'observationFor' && id) {
          Promise.all([
            Reel.api('GET', '/curriculum/objectives').then((p) => p.data).catch(() => []),
            Reel.api('GET', '/learners?pageSize=200').then((p) => p.data).catch(() => []),
            Reel.api('GET', '/templates?kind=observation').then((p) => (p.data && p.data.data) || []).catch(() => [])
          ]).then(([objectives, learners, observationTemplates]) => {
            try {
              if (V.assessments && V.assessments.observationModal) {
                V.assessments.observationModal({
                  page: Object.assign({}, this.page || {}, { objectives, learners, observationTemplates }),
                  openModal: (config) => this.openModal(config),
                  toast: (msg, tone) => this.toast(msg, tone),
                  has: (perm) => this.has(perm)
                }, id);
              } else {
                this.toast('The observation form is not available right now.', 'warn');
              }
            } catch (err) {
              this.toast('Could not open the observation form: ' + (err && err.message ? err.message : 'unexpected error'), 'error');
            }
          }).catch(() => this.toast('Could not open the observation form.', 'error'));
          return;
        }
        if (name === 'quickMoment' || name === 'quickMomentFor') {
          const page = this.page || {};
          const children = (page.children || (((page.morning || {}).children) || (((page.today || {}).children) || (((page.dailyReports || {}).children) || []))));
          let options = children.map((child) => ({ value: child.id, label: child.name + (child.classroom ? ' · ' + child.classroom : '') }));
          const presetChild = name === 'quickMomentFor' ? id : (options.length === 1 ? options[0].value : '');
          Reel.api('GET', '/curriculum/domains').then((p) => p.data).catch(() => []).then((domains) => {
            if (!options.length) {
              return Reel.api('GET', '/learners?pageSize=200').then((p) => p.data || []).catch(() => []).then((learners) => {
                options = (learners || []).map((l) => ({ value: l.id, label: (l.first_name || '') + ' ' + (l.last_name || '') }));
                return domains;
              });
            }
            return domains;
          }).then((domains) => {
            this.openModal({
              title: 'Capture a moment',
              description: 'One photo, one tag, one sentence — shared with the family in moments.',
              endpoint: '/assessments/quick-moments',
              submitLabel: 'Share with the family',
              successMessage: 'Moment shared — the family will see it shortly.',
              fields: [
                { name: 'learnerId', label: 'Child', type: 'select', required: true, options: options.length ? options : [{ value: presetChild || '', label: 'Child' }], value: presetChild || undefined },
                { name: 'domainId', label: 'What was it about? (optional)', type: 'select', options: (domains || []).map((d) => ({ value: d.id, label: d.name })), placeholder: 'Pick the domain it showed' },
                { name: 'photoUrls', label: 'Photo', type: 'media', multiple: true, accept: 'image/*', capture: 'environment', scope: 'observation', ownerType: 'learner' },
                { name: 'note', label: 'One sentence', type: 'textarea', span: 2, placeholder: 'A lovely moment from today…', help: 'Leave blank and we will write “Captured a lovely moment in the classroom.”' }
              ]
            });
          });
          return;
        }
        const view = this.route && V[this.route.view];
        if (view && view.openModal) { view.openModal(this, name, id); return; }
        this.toast('Open the relevant page to use this action.', 'warn');
      },

      openViewModal(name, id) {
        const view = this.route && V[this.route.view];
        if (view && view.openModal) { view.openModal(this, name, id); return; }
        this.toast('That action is not available here.', 'warn');
      },

      async postJson(path, body, message) {        try {
          const result = await Reel.api('POST', path, body || {});
          if (message) this.toast(message);
          await this.navigate(true);
          return result;
        } catch (error) {
          this.toast(error.message || 'The action failed.', 'error');
          return null;
        }
      },

      async pushToggle() {
        try {
          if (!(window.Reel && window.Reel.push && window.Reel.push.isSupported())) {
            this.toast('This browser cannot receive push notifications.', 'warn');
            return;
          }
          const current = await window.Reel.push.currentSubscription();
          if (current) {
            await window.Reel.push.unsubscribe();
            await Reel.api('PATCH', '/push/preferences', { preferences: { enabled: false } });
            this.toast('Push disabled on this device.');
          } else {
            await window.Reel.push.subscribe();
            await Reel.api('PATCH', '/push/preferences', { preferences: { enabled: true } });
            this.toast('Push enabled. You will hear when a report or announcement is shared.');
          }
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not change push settings.', 'error');
        }
      },

      async digestToggle() {
        try {
          const current = await Reel.api('GET', '/push/preferences');
          const mine = (current.data || []).find((entry) => entry.organisationId);
          const digest = mine ? mine.preferences.digest !== false : true;
          await Reel.api('PATCH', '/push/preferences', { emailDigest: !digest });
          this.toast(digest ? 'Weekly digest turned off.' : 'Weekly digest turned on. See you on Friday.');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not change the digest.', 'error');
        }
      },

      async saveArc(childId) {
        const field = document.getElementById('arc-' + childId);
        const paragraph = field ? field.value.trim() : '';
        const month = new Date().toISOString().slice(0, 7);
        try {
          await Reel.api('PUT', '/assessments/monthly-arcs', { learnerId: childId, month, paragraph });
          this.toast(paragraph ? 'Saved — ' + month + ' arc will travel with the portfolio.' : 'Cleared.');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not save the paragraph.', 'error');
        }
      },

      async approveCollector(collectorId, name, decision) {
        try {
          await Reel.api('PATCH', '/authorised-collectors/' + encodeURIComponent(collectorId) + '/approval', { decision });
          this.toast((name || 'Collector') + (decision === 'approved' ? ' is approved — the gate will let them through.' : ' has been rejected — the gate will refuse them.'));
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not update the collector.', 'error');
        }
      },

      async respondCollectionApproval(requestId, decision) {
        try {
          await Reel.api('POST', '/parent/collection-approvals/' + encodeURIComponent(requestId) + '/respond', { decision });
          this.toast(decision === 'approved' ? 'Approved — the gate can release now.' : 'Declined — the child stays with us.', decision === 'approved' ? undefined : 'warn');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not answer the gate.', 'error');
        }
      },

      async regenerateCollectorPin(collectorId, name) {
        try {
          const result = await Reel.api('POST', '/parent/children/' + encodeURIComponent(this.collectionChildId()) + '/collectors/' + encodeURIComponent(collectorId) + '/pin', {});
          const pin = (result && result.data && result.data.pin) || '';
          this.openDetail('New collection code for ' + (name || 'your collector'),
            '<div style="text-align:center;padding:10px 0 4px">' +
              '<div class="mono" style="font-size:2.1rem;letter-spacing:0.35em;font-weight:800;color:var(--forest-700)">' + Reel.esc(pin.split('').join(' ')) + '</div>' +
              '<p class="muted small" style="margin:10px 0 14px">Shown once — share it with ' + Reel.esc(name || 'them') + ' now. At the gate they scan the centre QR, type their first name and this code, and the centre sees them as verified. It works until you generate a new one.</p>' +
              '<button type="button" class="btn btn-secondary" onclick="var b=this;navigator.clipboard.writeText(\'' + pin + '\').then(function(){b.innerText=\'✓ Copied\'});">Copy code</button>' +
            '</div>');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not generate a new code.', 'error');
        }
      },

      // The guardian's own gate code: generated in the app, used at the
      // centre QR. Shown once in a modal with a copy button, stored hashed —
      // generating a new one stops the old code immediately. While standing at
      // the gate the parent can scan the printed QR from this modal — the camera
      // reads the centre's QR only, it never opens the gate remotely.
      async parentGateCode() {
        try {
          const result = await Reel.api('POST', '/parent/my-gate-code', {});
          const d = (result && result.data) || {};
          const pin = d.pin || '';
          this.openDetail('Your gate code',
            '<div style="text-align:center;padding:10px 0 4px">' +
              '<div class="mono" style="font-size:2.1rem;letter-spacing:0.35em;font-weight:800;color:var(--forest-700)">' + Reel.esc(pin.split('').join(' ')) + '</div>' +
              '<p class="muted small" style="margin:10px 0 14px">Shown once — this is <strong>your</strong> code. At the centre, scan the printed QR at the gate, type your first name and this code, and you will see your children with Arriving and Collecting taps. It covers every child you guard, it works only at the gate QR, and it stops working the moment you generate a new one.</p>' +
              '<div class="btn-group" style="justify-content:center;flex-wrap:wrap">' +
                '<button type="button" class="btn btn-secondary" onclick="var b=this;navigator.clipboard.writeText(\'' + pin + '\').then(function(){b.innerText=\'✓ Copied\'});">Copy code</button>' +
                '<button type="button" class="btn btn-primary" onclick="Alpine.$data(document.body).startGateQrScan(this)">' + Reel.icon('camera') + ' Scan gate QR</button>' +
              '</div>' +
              '<div id="gate-scan-box" style="display:none;margin-top:14px;text-align:left">' +
                '<div class="alert alert-info" id="gate-scan-status" style="margin-bottom:10px"><i data-lucide="camera"></i><span>Point your camera at the printed QR at the gate.</span></div>' +
                '<video id="gate-scan-video" autoplay playsinline muted style="width:100%;max-height:260px;border-radius:14px;background:#111;object-fit:cover"></video>' +
                '<div class="btn-group" style="margin-top:10px;justify-content:center"><button type="button" class="btn btn-ghost btn-sm" onclick="Alpine.$data(document.body).stopGateQrScan()">Stop camera</button></div>' +
              '</div>' +
            '</div>');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not generate your gate code.', 'error');
        }
      },

      async startGateQrScan(btn) {
        const box = document.getElementById('gate-scan-box');
        const video = document.getElementById('gate-scan-video');
        const status = document.getElementById('gate-scan-status');
        if (!box || !video) return;
        this.stopGateQrScan();
        box.style.display = 'block';
        if (window.lucide) try { window.lucide.createIcons({ nodes: [box] }); } catch { /* best effort */ }
        const setStatus = (msg, kind) => {
          if (!status) return;
          status.className = 'alert ' + (kind || 'alert-info');
          status.innerHTML = '<span>' + Reel.esc(msg) + '</span>';
        };
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setStatus('Camera access is not available in this browser. Use your phone camera to scan the printed QR at the gate.', 'alert-warn');
          return;
        }
        if (typeof BarcodeDetector === 'undefined') {
          setStatus('This browser cannot read QR codes in-app. Use your phone camera to scan the printed QR at the gate.', 'alert-warn');
          return;
        }
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        } catch (err) {
          setStatus('Camera permission was not granted. Allow camera access, or use your phone camera to scan the printed QR.', 'alert-warn');
          return;
        }
        this._gateScan = { stream: stream, timer: null, stopped: false };
        video.srcObject = stream;
        try { await video.play(); } catch { /* autoplay policies */ }
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const expectedSlug = (this.page && this.page.gateSlug) || 'little-sprouts';
        const tick = async () => {
          const scan = this._gateScan;
          if (!scan || scan.stopped) return;
          if (video.readyState >= 2) {
            try {
              const codes = await detector.detect(video);
              for (const code of codes || []) {
                const raw = String(code.rawValue || '');
                const m = raw.match(/#\/gate\/([a-z0-9-]+)/i) || raw.match(/\/gate\/([a-z0-9-]+)/i);
                if (m && m[1]) {
                  const slug = m[1].toLowerCase();
                  if (slug === String(expectedSlug).toLowerCase()) {
                    setStatus('Gate QR recognised — opening…', 'alert-info');
                    this.stopGateQrScan();
                    this.closeModal();
                    location.hash = '#/gate/' + slug;
                    return;
                  }
                }
              }
            } catch { /* detector can throw on some frames */ }
          }
          if (this._gateScan && !this._gateScan.stopped) {
            this._gateScan.timer = setTimeout(tick, 350);
          }
        };
        this._gateScan.timer = setTimeout(tick, 350);
      },

      stopGateQrScan() {
        const scan = this._gateScan;
        if (scan) {
          scan.stopped = true;
          if (scan.timer) clearTimeout(scan.timer);
          if (scan.stream) scan.stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
        }
        this._gateScan = null;
        const video = document.getElementById('gate-scan-video');
        if (video) { try { video.srcObject = null; } catch {} }
        const box = document.getElementById('gate-scan-box');
        if (box) box.style.display = 'none';
      },

      async revokeCollector(collectorId, name) {
        if (!window.confirm('Remove ' + (name || 'this person') + ' from the list? They will no longer be able to collect this child.')) return;
        try {
          await Reel.api('DELETE', '/parent/children/' + encodeURIComponent(this.collectionChildId()) + '/collectors/' + encodeURIComponent(collectorId));
          this.toast((name || 'Collector') + ' removed from the list.');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not remove the collector.', 'error');
        }
      },

      collectionChildId() {
        const page = this.page || {};
        const child = page.child || {};
        return child.id || (this.query && this.query.childId) || '';
      },

      async react(resourceType, resourceId, reaction) {
        try {
          await Reel.api('POST', '/parent/reactions', { resourceType, resourceId, reaction });
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Could not send your reaction.', 'error');
        }
      },

      async releaseScan(scanId) {
        try {
          await Reel.api('POST', '/gate/scans/' + encodeURIComponent(scanId) + '/release', {});
          this.toast('Child released.');
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'Release failed.', 'error');
        }
      },

      async markMorningAllPresent() {
        const morning = (this.page && this.page.morning) || {};
        const ids = morning.unmarkedIds || [];
        if (!ids.length) { this.toast('Everyone is already marked.', 'warn'); return; }
        this.confirmAction('Mark all expected present — unverified',
          'Every child on the register today will be marked present without a recorded adult walking them in. Update bringers on the register before pickup.',
          '/learner-attendance/register',
          { body: { records: ids.map((learnerId) => ({ learnerId, status: 'present' })) },
            submitLabel: 'Mark all unverified',
            successMessage: ids.length + ' children marked unverified — fix bringers on the register.' }
        );
      },

      async markAllPresent() {
        const rows = (((this.page && this.page.register) || {}).rows || []).filter((r) => !r.attendance_id);
        if (!rows.length) { this.toast('Every child is already marked.', 'warn'); return; }
        await this.postJson('/learner-attendance/register', {
          date: (this.page && this.page.date) || Reel.today(),
          records: rows.map((r) => ({ learnerId: r.learner_id, status: 'present' }))
        }, rows.length + ' children marked present.');
      },

      async generateAssessmentReport() {
        const learner = document.getElementById('report-learner');
        const period = document.getElementById('report-period');
        const format = document.getElementById('report-format');
        if (!learner || !learner.value || !period || !period.value) {
          this.toast('Choose a child and an assessment period.', 'warn');
          return;
        }
        try {
          const payload = await Reel.api('POST', '/assessments/reports/generate', {
            learnerId: learner.value, assessmentPeriodId: period.value, format: format ? format.value : 'pdf'
          });
          this.toast('Report generated.');
          const report = payload && payload.data && (payload.data.report || payload.data);
          if (report && report.html) this.openDetail('Progress report', report.html);
          else if (report && report.url) window.open(report.url, '_blank', 'noopener');
          else await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'The report could not be generated.', 'error');
        }
      },

      async sendMessage(conversationId) {
        const el = document.getElementById('message-body');
        const body = el ? String(el.value || '').trim() : '';
        if (!body) { this.toast('Write a message first.', 'warn'); return; }
        try {
          await Reel.api('POST', '/conversations/' + encodeURIComponent(conversationId) + '/messages', { body });
          if (el) el.value = '';
          await this.navigate(true);
        } catch (error) {
          this.toast(error.message || 'The message could not be sent.', 'error');
        }
      },

      openNamedDetail(name, id) {
        const view = this.route && V[this.route.view];
        if (view && view.detail) {
          const result = view.detail(this, name, id);
          if (result) { this.openDetail(result.title, result.html, result.size); return; }
        }
        this.toast('That record could not be opened.', 'warn');
      },

      renderAuth() {
        const root = document.getElementById('auth-root');
        if (!root) return;
        root.innerHTML = Reel.views.auth ? Reel.views.auth.render(this) : '';
        if (window.Alpine && window.Alpine.initTree) window.Alpine.initTree(root);
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      },

      async renderPublic(route, params, seq) {
        const root = document.getElementById('public-root');
        if (!root) return;
        const view = V[route.view];
        try {
          const page = view && view.load ? await view.load(this, params) : {};
          if (seq && seq !== this._navSeq) return;
          if (window.Alpine && window.Alpine.destroyTree) window.Alpine.destroyTree(root);
          root.innerHTML = view.render(this, params, page);
          if (Reel.applySeo) {
            const site = (page && page.site) || page || {};
            const org = site.organisation || (page && page.organisation) || {};
            const baseSeo = (page && page.seo) || site.seo || null;
            const form = page && page.form;
            const isPlatformHome = route.view === 'platformHome';
            let seo = baseSeo || (form ? {
              title: form.name + ' | ' + (org.name || 'Re-EL ECD'),
              description: form.description || '',
              keywords: [org.name, form.name, 'form', 'early childhood development'].filter(Boolean),
              image: org.logoUrl || '',
              organisationName: org.name || 'Re-EL ECD'
            } : (route.area === 'public' ? {
              title: (route.label || 'Re-EL ECD') + ' | Re-EL ECD',
              description: 'Re-EL ECD — a calm, complete workspace for early childhood development centres, families and teams.',
              keywords: ['early childhood development', 'ECD', 'daycare', 'South Africa'],
              image: org.logoUrl || '',
              organisationName: org.name || 'Re-EL ECD'
            } : null));
            // Platform administrators can edit the homepage SEO in Settings;
            // those values override the built-in defaults at runtime.
            if (isPlatformHome && this.platformBrand && this.platformBrand.seo) {
              const saved = this.platformBrand.seo;
              seo = Object.assign({}, seo, {
                title: saved.title || seo.title,
                description: saved.description || seo.description,
                keywords: (saved.keywords && saved.keywords.length ? saved.keywords : seo.keywords),
                image: saved.image || seo.image,
                twitterHandle: saved.twitterHandle || seo.twitterHandle,
                canonical: saved.siteUrl ? String(saved.siteUrl).replace(/\/+$/, '') + '/' : seo.canonical
              });
              if (saved.sameAs && saved.sameAs.length && seo.schema) {
                const schema = JSON.parse(JSON.stringify(seo.schema));
                const org = (schema['@graph'] || []).find((entry) => entry['@type'] === 'Organization');
                if (org) org.sameAs = saved.sameAs;
                seo.schema = schema;
              }
            }
            if (seo && !(page && page.missing)) {
              const pagePath = route.view === 'publicApply'
                ? 'apply'
                : route.view === 'publicForm'
                  ? 'forms/' + (params.formSlug || '')
                  : (params.page || '');
              const orgSlug = params.slug || org.slug || this.publicSlug || '';
              // On a verified custom domain the canonical address is that
              // domain, not the platform's hash URL. The API supplies the host
              // only after checking that the organisation owns it.
              const canonicalHost = site.canonicalHost
                || ((Reel.isPlatformHost && !Reel.isPlatformHost()) ? location.hostname : null);
              const canonicalBase = canonicalHost ? 'https://' + canonicalHost : null;
              const canonical = isPlatformHome
                ? (canonicalBase || (Reel.siteBase ? Reel.siteBase() : 'https://ecd.re-el.co.za')) + '/'
                : Reel.siteUrl(orgSlug, pagePath, canonicalBase);
              Reel.applySeo(Object.assign({}, seo, { canonical }), { logo: org.logoUrl || '' });
            }
          }
          if (window.Alpine && window.Alpine.initTree) window.Alpine.initTree(root);
          this.renderIconsNow();
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        } catch (error) {
          const homeLink = params && params.slug ? '#/site/' + encodeURIComponent(params.slug) : '#/login';
          if (window.Alpine && window.Alpine.destroyTree) window.Alpine.destroyTree(root);
          root.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;padding:24px"><div class="card" style="max-width:520px;text-align:center"><h2>Website unavailable</h2><p class="muted">' + Reel.esc(error.message) + '</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px"><a class="btn btn-primary" href="#/login">Parent sign-in</a><a class="btn btn-secondary" href="' + homeLink + '">Back to website</a></div></div></div>';
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
      },

      async submitMfaChallenge(event) {
        const code = this.mfaCode;
        const challengeId = this.mfaPending && this.mfaPending.challengeId;
        this.loginError = null;
        this.loginBusy = true;
        try {
          if (!challengeId) throw new Error('The sign-in attempt expired. Please start again.');
          const payload = await Reel.api('POST', '/auth/mfa/challenge', { challengeId, code });
          this.mfaPending = null;
          this.mfaCode = '';
          this.applySession(payload.data);
          history.replaceState(null, '', '#' + this.defaultRoute());
          await this.navigate(true);
        } catch (error) {
          this.loginError = error.message || 'That code is not right. Try again.';
        } finally {
          this.loginBusy = false;
        }
      },

      async login(event) {
        const form = event && event.target ? event.target : null;
        const email = form ? form.email.value.trim() : this.loginEmail;
        const password = form ? form.password.value : this.loginPassword;
        this.loginError = null;
        this.loginBusy = true;
        try {
          const payload = await Reel.api('POST', '/auth/login', { email, password });
          if (payload && payload.data && payload.data.mfaRequired) {
            this.mfaPending = { challengeId: payload.data.challengeId };
            this.mfaCode = '';
            return;
          }
          this.applySession(payload.data);
          // replaceState keeps the hashchange handler from starting a second
          // navigation while this one is still loading the first screen.
          history.replaceState(null, '', '#' + this.defaultRoute());
          await this.navigate(true);
        } catch (error) {
          this.loginError = error.message || 'Sign in failed.';
        } finally {
          this.loginBusy = false;
        }
      },

      async submitPublicEnquiry(event, slug) {
        this.publicError = null;
        this.publicResult = null;
        const data = Object.assign({}, this.publicEnquiry, { organisationSlug: slug });
        if (!data.branchId) delete data.branchId;
        try {
          await Reel.api('POST', '/public/enquiries', data);
          this.publicResult = 'Thank you. Your enquiry has been received and the team will be in touch.';
          this.publicEnquiry = { guardianName: '', guardianEmail: '', guardianPhone: '', childName: '', childDateOfBirth: '', requestedAgeGroup: '', preferredStartDate: '', message: '', website: '' };
          if (event && event.target && event.target.reset) event.target.reset();
        } catch (error) {
          this.publicError = error.message || 'We could not send your enquiry. Please try again.';
        }
      },

      togglePublicChoice(key, value, checked) {
        const list = Array.isArray(this.publicFormData[key]) ? this.publicFormData[key].slice() : [];
        const index = list.indexOf(value);
        if (checked && index === -1) list.push(value);
        if (!checked && index !== -1) list.splice(index, 1);
        this.publicFormData[key] = list;
      },

      removePublicFormFile(key) {
        this.publicFormData[key] = '';
      },

      async uploadPublicFormFile(event, key, slug, formSlug) {
        const input = event && event.target;
        const file = input && input.files && input.files[0];
        if (!file) return;
        this.publicError = null;
        this.publicUploads = this.publicUploads || {};
        this.publicUploads[key] = true;
        try {
          const asset = await Reel.uploadFormFile(file, { orgSlug: slug, formSlug });
          this.publicFormData[key] = asset.url;
          if (input) input.value = '';
        } catch (error) {
          this.publicError = error.message || 'The file could not be uploaded. Please try again.';
        } finally {
          this.publicUploads[key] = false;
        }
      },

      async submitPublicForm(event, slug, formSlug) {
        this.publicError = null;
        this.publicResult = null;
        this.publicCheckout = null;
        if (Object.keys(this.publicUploads || {}).some((key) => this.publicUploads[key])) {
          this.publicError = 'Please wait for the file upload to finish.';
          return;
        }
        const missing = (this.publicFormSchema || []).find((field) => {
          if (!field.required) return false;
          const value = this.publicFormData[field.key];
          return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
        });
        if (missing) {
          this.publicError = missing.label + ' is required.';
          return;
        }
        try {
          const payload = await Reel.api('POST', '/public/forms/' + encodeURIComponent(slug) + '/' + encodeURIComponent(formSlug) + '/submit', {
            data: this.publicFormData,
            email: this.publicPayerEmail || undefined,
            payerName: this.publicPayerName || undefined,
            website: this.publicFormData.website || undefined
          });
          const result = (payload && payload.data) || {};
          if (!result.received) {
            this.publicResult = 'Thank you.';
            return;
          }
          if (result.payment && result.payment.checkout) {
            this.publicCheckout = result.payment.checkout;
            this.publicResult = 'Your form has been received. Complete the secure PayFast payment below to finish.';
          } else if (result.payment && result.payment.enabled && !result.payment.available) {
            this.publicResult = 'Your form has been received. Online payment is not available yet; the centre will send a payment link.';
          } else {
            this.publicResult = 'Thank you. Your response has been submitted.';
          }
        } catch (error) {
          this.publicError = error.message || 'We could not submit the form. Please check the fields and try again.';
        }
      },

      async sendPasswordReset(event) {
        const form = event && event.target ? event.target : null;
        const email = form ? form.email.value.trim() : '';
        this.loginError = null;
        this.resetSent = null;
        try {
          await Reel.api('POST', '/auth/forgot-password', { email });
          this.resetSent = 'If that email belongs to an account, a reset link is on its way. Check the inbox and spam folder.';
        } catch (error) {
          this.loginError = error.message || 'The reset email could not be sent.';
        }
      },

      async submitSignup(event) {
        const form = event && event.target ? event.target : null;
        const get = (k) => (this.signupForm && this.signupForm[k] != null && this.signupForm[k] !== '' ? this.signupForm[k] : (form && form[k] ? form[k].value : ''));
        const centreName = String(get('centreName') || '').trim();
        const ownerName = String(get('ownerName') || '').trim();
        const ownerEmail = String(get('ownerEmail') || '').trim();
        const password = String(get('password') || '');
        const confirm = String(get('confirm') || '');
        const planKey = String((this.signupForm && this.signupForm.planKey != null ? this.signupForm.planKey : (form && form.planKey ? form.planKey.value : '')) || '');
        const includeSetup = (this.signupForm && typeof this.signupForm.includeSetup === 'boolean') ? this.signupForm.includeSetup : (form && form.includeSetup ? form.includeSetup.checked === true : false);
        const agreed = (this.signupForm && typeof this.signupForm.agreed === 'boolean') ? this.signupForm.agreed : (form && form.agreed ? form.agreed.checked === true : false);
        this.signupError = null;
        if (centreName.length < 2) { this.signupError = 'Please enter your centre name.'; this.signupStep = 1; return; }
        if (ownerName.length < 2) { this.signupError = 'Please enter your name.'; this.signupStep = 2; return; }
        if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) { this.signupError = 'Please enter a valid email address.'; this.signupStep = 2; return; }
        if (password.length < 10) { this.signupError = 'Use a password of at least 10 characters.'; this.signupStep = 3; return; }
        if (password !== confirm) { this.signupError = 'The two passwords do not match.'; this.signupStep = 3; return; }
        if (!agreed) { this.signupError = 'Please accept the Terms of Service and Privacy Policy to continue.'; this.signupStep = 4; return; }
        this.signupBusy = true;
        try {
          await Reel.api('POST', '/public/signup', { centreName, ownerName, ownerEmail, password, planKey: planKey || undefined, includeSetup: includeSetup === true });
          this.signupDone = true;
        } catch (error) {
          this.signupError = error.message || 'We could not create your account. Please check the details and try again.';
        } finally {
          this.signupBusy = false;
        }
      },

      signupValidateStep(step) {
        const f = this.signupForm || {};
        const s = step || this.signupStep || 1;
        this.signupError = null;
        if (s === 1) {
          if (!String(f.centreName || '').trim() || String(f.centreName || '').trim().length < 2) { this.signupError = 'Please enter your centre name (at least 2 characters).'; return false; }
        } else if (s === 2) {
          if (!String(f.ownerName || '').trim() || String(f.ownerName || '').trim().length < 2) { this.signupError = 'Please enter your name.'; return false; }
          const email = String(f.ownerEmail || '').trim();
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.signupError = 'Please enter a valid email address.'; return false; }
        } else if (s === 3) {
          const pw = String(f.password || '');
          if (pw.length < 10) { this.signupError = 'Choose a password with at least 10 characters.'; return false; }
          if (pw !== String(f.confirm || '')) { this.signupError = 'The two passwords do not match.'; return false; }
        }
        return true;
      },

      signupNext() {
        if (!this.signupValidateStep(this.signupStep)) return;
        this.signupStep = Math.min(4, (this.signupStep || 1) + 1);
      },

      signupBack() {
        this.signupError = null;
        this.signupStep = Math.max(1, (this.signupStep || 1) - 1);
      },

      signupPlanName() {
        const key = this.signupForm && this.signupForm.planKey;
        const plan = (this.signupPlans || []).find((p) => p.plan_key === key);
        return plan ? (plan.name + ' — R' + plan.monthly_price + '/mo') : 'Decide later (you can choose in settings)';
      },

      async submitResetPassword(event) {
        const form = event && event.target ? event.target : null;
        const token = (this.query && this.query.token) || '';
        const password = form ? form.password.value : '';
        const confirm = form ? form.confirm.value : '';
        this.resetError = null;
        if (password.length < 10) { this.resetError = 'Use at least 10 characters.'; return; }
        if (password !== confirm) { this.resetError = 'The two passwords do not match.'; return; }
        try {
          await Reel.api('POST', '/auth/reset-password', { token, password });
          this.resetDone = true;
        } catch (error) {
          this.resetError = error.message || 'This reset link is invalid or has expired.';
        }
      },

      async submitAcceptInvite(event) {
        const form = event && event.target ? event.target : null;
        const token = (this.query && this.query.token) || '';
        const displayName = form ? form.displayName.value.trim() : '';
        const password = form ? form.password.value : '';
        const confirm = form ? form.confirm.value : '';
        this.inviteError = null;
        if (password.length < 10) { this.inviteError = 'Use at least 10 characters.'; return; }
        if (password !== confirm) { this.inviteError = 'The two passwords do not match.'; return; }
        try {
          await Reel.api('POST', '/auth/invitations/accept', { token, displayName, password });
          this.inviteDone = true;
        } catch (error) {
          this.inviteError = error.message || 'This invitation is invalid or has expired.';
        }
      },

      loginEmail: '',
      loginPassword: '',
      loginShowPassword: false,
      loginError: null,
      loginBusy: false,
      mfaPending: null,
      mfaCode: '',
      signingOut: false,
      forgotOpen: false,
      resetSent: null,
      signupBusy: false,
      signupError: null,
      signupDone: false,
      signupPlans: [],
      signupEnabled: false,
      signupStep: 1,
      signupForm: { centreName: '', ownerName: '', ownerEmail: '', password: '', confirm: '', planKey: '', agreed: false }
    };
  }

  Reel.reelApp = reelApp;
  window.reelApp = reelApp;
  Reel.ROUTES = ROUTES;
  Reel.matchRoute = matchRoute;
})();
