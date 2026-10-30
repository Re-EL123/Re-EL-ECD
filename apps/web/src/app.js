'use strict';

/* Application shell, router, session state and shared actions. */
(function () {
  const Reel = window.Reel;
  const V = Reel.views;

  function route(path, area, view, permission, title) {
    return { path, area, view, permission, title };
  }

  const ROUTES = [
    route('/login', 'login', null, null, 'Sign in'),
    route('/site', 'public', 'publicSite', null, 'Daycare website'),
    route('/site/:slug', 'public', 'publicSite', null, 'Daycare website'),
    route('/site/:slug/apply', 'public', 'publicApply', null, 'Enquire'),
    route('/site/:slug/forms/:formSlug', 'public', 'publicForm', null, 'Form'),
    route('/reset-password', 'public', 'resetPassword', null, 'Reset password'),
    route('/accept-invite', 'public', 'acceptInvite', null, 'Accept invitation'),

    route('/platform/overview', 'platform', 'platformOverview', 'platform.organisations.read', 'Platform overview'),
    route('/platform/organisations', 'platform', 'platformOrganisations', 'platform.organisations.read', 'Organisation directory'),
    route('/platform/organisations/:id', 'platform', 'platformOrganisationDetail', 'platform.organisations.read', 'Organisation detail'),
    route('/platform/subscriptions', 'platform', 'platformSubscriptions', 'platform.subscriptions.read', 'Subscriptions'),
    route('/platform/access', 'platform', 'platformAccess', 'platform.organisations.read', 'Platform access'),
    route('/platform/audit', 'platform', 'platformAudit', 'platform.audit.read', 'Platform audit'),
    route('/platform/health', 'platform', 'platformHealth', 'platform.health.read', 'System health'),
    route('/platform/settings', 'platform', 'platformSettings', 'platform.organisations.read', 'Platform settings'),
    route('/platform/support', 'platform', 'platformSupport', 'platform.support.manage', 'Support workspace'),

    route('/app/overview', 'app', 'overview', ['reports.read.daycare', 'tasks.read.own', 'attendance.read.assigned'], 'Overview'),
    route('/app/learners', 'app', 'learners', ['learners.read.daycare', 'learners.read.assigned'], 'Learners'),
    route('/app/learners/:id', 'app', 'learnerDetail', ['learners.read.daycare', 'learners.read.assigned'], 'Learner profile'),
    route('/app/admissions', 'app', 'admissions', 'admissions.read.daycare', 'Admissions'),
    route('/app/classrooms', 'app', 'classrooms', 'classrooms.read.daycare', 'Classrooms'),
    route('/app/curriculum', 'app', 'curriculum', 'curriculum.read.daycare', 'Curriculum'),
    route('/app/activities', 'app', 'activities', 'curriculum.read.daycare', 'Activities'),
    route('/app/calendar', 'app', 'calendar', 'curriculum.read.daycare', 'Calendar'),
    route('/app/assessments', 'app', 'assessments', ['assessments.read.daycare', 'assessments.read.assigned'], 'Assessments'),
    route('/app/learner-attendance', 'app', 'attendance', ['attendance.read.daycare', 'attendance.read.assigned'], 'Learner attendance'),
    route('/app/staff', 'app', 'staff', 'staff.read.daycare', 'Staff'),
    route('/app/staff/:id', 'app', 'staffDetail', 'staff.read.daycare', 'Staff profile'),
    route('/app/staff-shifts', 'app', 'shifts', ['shifts.read.daycare', 'shifts.read.assigned'], 'Shift calendar'),
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
    route('/app/access', 'app', 'access', 'access.read.daycare', 'Users and access'),
    route('/app/audit', 'app', 'audit', 'audit.read.daycare', 'Audit log'),
    route('/app/automation', 'app', 'automation', 'organisation.settings.manage', 'Automation'),

    route('/parent/overview', 'parent', 'parentOverview', 'parent.read.own', 'Family home'),
    route('/parent/children', 'parent', 'parentChildren', 'parent.read.own', 'My children'),
    route('/parent/children/:id', 'parent', 'parentChild', 'parent.read.own', 'Child profile'),
    route('/parent/activities', 'parent', 'parentActivities', 'parent.read.own', 'Activity feed'),
    route('/parent/progress', 'parent', 'parentProgress', 'parent.read.own', 'Development'),
    route('/parent/attendance', 'parent', 'parentAttendance', 'parent.read.own', 'Attendance'),
    route('/parent/forms', 'parent', 'parentForms', 'parent.forms.submit.own', 'Forms'),
    route('/parent/messages', 'parent', 'parentMessages', 'messages.read.own', 'Messages'),
    route('/parent/finance', 'parent', 'parentFinance', 'parent.finance.read.own', 'Fees'),
    route('/parent/settings', 'parent', 'parentSettings', 'parent.read.own', 'Profile and consent')
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
        { path: '/platform/subscriptions', label: 'Subscriptions', icon: 'credit-card', permission: 'platform.subscriptions.read' },
        { path: '/platform/access', label: 'Platform access', icon: 'shield-check', permission: 'platform.organisations.read' }
      ] },
      { label: 'Governance', items: [
        { path: '/platform/audit', label: 'Audit explorer', icon: 'scroll-text', permission: 'platform.audit.read' },
        { path: '/platform/health', label: 'System health', icon: 'activity', permission: 'platform.health.read' },
        { path: '/platform/support', label: 'Support', icon: 'life-buoy', permission: 'platform.support.manage' },
        { path: '/platform/settings', label: 'Configuration', icon: 'settings', permission: 'platform.organisations.read' }
      ] }
    ],
    app: [
      { label: 'Today', items: [
        { path: '/app/overview', label: 'Overview', icon: 'layout-dashboard', permission: ['reports.read.daycare', 'tasks.read.own', 'attendance.read.assigned'] }
      ] },
      { label: 'Children', items: [
        { path: '/app/learners', label: 'Learners', icon: 'users', permission: ['learners.read.daycare', 'learners.read.assigned'] },
        { path: '/app/admissions', label: 'Admissions', icon: 'user-plus', permission: 'admissions.read.daycare' },
        { path: '/app/classrooms', label: 'Classrooms', icon: 'door-open', permission: 'classrooms.read.daycare' },
        { path: '/app/learner-attendance', label: 'Attendance', icon: 'calendar-check', permission: ['attendance.read.daycare', 'attendance.read.assigned'] }
      ] },
      { label: 'Learning', items: [
        { path: '/app/curriculum', label: 'Curriculum', icon: 'book-open', permission: 'curriculum.read.daycare' },
        { path: '/app/activities', label: 'Activities', icon: 'puzzle', permission: 'curriculum.read.daycare' },
        { path: '/app/calendar', label: 'Calendar', icon: 'calendar-days', permission: 'curriculum.read.daycare' },
        { path: '/app/assessments', label: 'Assessments', icon: 'clipboard-list', permission: ['assessments.read.daycare', 'assessments.read.assigned'] }
      ] },
      { label: 'People', items: [
        { path: '/app/staff', label: 'Staff', icon: 'id-card', permission: 'staff.read.daycare' },
        { path: '/app/staff-shifts', label: 'Shifts', icon: 'calendar-clock', permission: ['shifts.read.daycare', 'shifts.read.assigned'] },
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
        { path: '/app/automation', label: 'Automation', icon: 'workflow', permission: 'organisation.settings.manage' }
      ] }
    ],
    parent: [
      { label: 'Family', items: [
        { path: '/parent/overview', label: 'Home', icon: 'home', permission: 'parent.read.own' },
        { path: '/parent/children', label: 'My children', icon: 'users', permission: 'parent.read.own' },
        { path: '/parent/activities', label: 'Activity feed', icon: 'sparkles', permission: 'parent.read.own' },
        { path: '/parent/progress', label: 'Development', icon: 'line-chart', permission: 'parent.read.own' },
        { path: '/parent/attendance', label: 'Attendance', icon: 'calendar-check', permission: 'parent.read.own' }
      ] },
      { label: 'Connect', items: [
        { path: '/parent/forms', label: 'Forms', icon: 'file-text', permission: 'parent.forms.submit.own' },
        { path: '/parent/messages', label: 'Messages', icon: 'messages-square', permission: 'messages.read.own' },
        { path: '/parent/finance', label: 'Fees', icon: 'wallet', permission: 'parent.finance.read.own' },
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
      tab: null,
      filters: {},
      sidebarOpen: false,
      theme: 'light',
      commandOpen: false,
      commandQuery: '',
      commandResults: [],
      commandIndex: 0,
      quickOpen: false,
      modal: null,
      toasts: [],
      unread: 0,
      _charts: [],
      _chartInstances: [],
      _searchSeq: 0,
      _lastHash: null,
      activeOrganisationId: null,
      platformBrand: null,
      selectedIds: [],
      libraryBusy: false,

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
        try { this.theme = localStorage.getItem('reel.theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { this.theme = 'light'; }
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
        if (!location.hash) {
          // replaceState avoids a second hashchange-driven navigate on boot.
          history.replaceState(null, '', '#' + (this.session ? this.defaultRoute() : '/login'));
        }
        await this.navigate();
      },

      installIconObserver() {
        if (!window.MutationObserver) return;
        let scheduled = false;
        const render = () => {
          scheduled = false;
          if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
        };
        const observer = new MutationObserver(() => {
          if (scheduled) return;
          scheduled = true;
          window.requestAnimationFrame(render);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      },

      applySession(payload) {
        this.session = payload;
        if (Reel.setCsrf) Reel.setCsrf(payload.csrfToken || null);
        const stored = (() => { try { return localStorage.getItem('reel.activeOrganisation'); } catch { return null; } })();
        const candidate = payload.memberships.find((m) => m.organisation.id === stored);
        this.activeOrganisationId = (candidate && candidate.organisation.id) || payload.activeOrganisationId || (payload.memberships[0] && payload.memberships[0].organisation.id) || null;
        try { if (this.activeOrganisationId) localStorage.setItem('reel.activeOrganisation', this.activeOrganisationId); } catch { /* ignore */ }
        if (Reel.applyTheme) Reel.applyTheme(this.organisationTheme);
        this.refreshUnread();
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
          if (this.platformBrand && this.platformBrand.branding && Reel.applyTheme) {
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
        return '/app/overview';
      },

      async switchOrganisation(id) {
        if (!id || id === this.activeOrganisationId) return;
        this.activeOrganisationId = id;
        try { localStorage.setItem('reel.activeOrganisation', id); } catch { /* ignore */ }
        if (Reel.applyTheme) Reel.applyTheme(this.organisationTheme);
        const target = this.isPlatformAdmin ? '/platform/overview' : (this.isParentOnly ? '/parent/overview' : '/app/overview');
        if (this.area === 'platform' && !this.isPlatformAdmin) location.hash = target;
        else await this.navigate(true);
      },

      parseHash() {
        const raw = (location.hash || '#/login').replace(/^#/, '') || '/login';
        const [path, queryString] = raw.split('?');
        const query = {};
        new URLSearchParams(queryString || '').forEach((value, key) => { query[key] = value; });
        return { path: path || '/login', query };
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
        this.selectedIds = [];
        this.query = query;
        const matched = matchRoute(path);
        if (!matched) {
          this.mode = this.session ? 'app' : 'login';
          if (this.session) {
            this.area = this.isPlatformAdmin ? 'platform' : (this.isParentOnly ? 'parent' : 'app');
            this.denied = false;
            this.loading = false;
            this.pageTitle = 'Page not found';
            this.renderHtml('<div class="empty-state"><div class="empty-icon"><i data-lucide="compass"></i></div><h3>Page not found</h3><p>The page <span class="mono">' + Reel.esc(path) + '</span> does not exist.</p><a class="btn btn-primary" href="#' + this.defaultRoute() + '">Go to your overview</a></div>');
          }
          return;
        }
        this.route = matched.route;
        this.params = matched.params;
        this.area = matched.route.area;
        this.pageTitle = matched.route.title;
        if (query.tab) this.tab = query.tab;

        if (matched.route.area === 'public') {
          this.mode = 'public';
          this.loading = false;
          await this.renderPublic(matched.route, matched.params, seq);
          return;
        }

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
          this.loading = false;
          return;
        }

        if (matched.route.area === 'parent' && !this.has('parent.read.own')) {
          this.mode = 'app';
          this.denied = true;
          this.loading = false;
          return;
        }

        this.mode = 'app';
        this.denied = false;
        this.error = null;
        this.loading = true;
        this.sidebarOpen = false;
        if (!force) {
          this.tab = query.tab || null;
          this.filters = {};
        }
        this._charts = [];
        this.destroyCharts();

        if (!this.has(matched.route.permission)) {
          this.denied = true;
          this.loading = false;
          return;
        }

        try {
          const view = V[matched.route.view];
          if (!view) throw new Error('This screen has not been implemented.');
          const page = (view.load ? await view.load(this, matched.params) : {}) || {};
          if (seq !== this._navSeq) return;
          this.page = page;
          const html = view.render ? view.render(this, matched.params, this.page) : '';
          this.renderHtml(html);
          this.loading = false;
          await this.$nextTick();
          this.afterRender();
        } catch (error) {
          if (seq !== this._navSeq) return;
          this.loading = false;
          if (error instanceof Reel.ApiError && (error.code === 'FORBIDDEN' || error.status === 403)) {
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
        if (window.Alpine && window.Alpine.destroyTree) window.Alpine.destroyTree(root);
        root.innerHTML = html;
        if (window.Alpine && window.Alpine.initTree) window.Alpine.initTree(root);
      },

      afterRender() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
        this.mountCharts();
        if (window.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const root = document.getElementById('view-root');
          if (root) {
            window.gsap.fromTo(root.querySelectorAll('.card, .page-head, .table-wrap'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.32, stagger: 0.035, ease: 'power2.out', overwrite: true });
          }
        }
        this.refreshUnread();
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
      },

      setTab(tab) {
        this.tab = tab;
        const { path } = this.parseHash();
        history.replaceState(null, '', '#' + path + '?tab=' + encodeURIComponent(tab));
        this.navigate(true);
      },

      setFilter(name, value) {
        this.filters[name] = value;
        this.navigate(true);
      },

      isActive(path) {
        if (!this.route) return false;
        if (this.route.path === path) return true;
        if (path !== '/app/overview' && this.route.path.startsWith(path + '/')) return true;
        return false;
      },

      roleLabel() {
        const membership = this.activeMembership;
        if (!membership || !membership.roles || !membership.roles.length) return 'Member';
        return membership.roles.map((r) => Reel.titleCase(r)).join(' · ');
      },

      initials(name) { return Reel.initials(name); },

      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = this.theme;
        if (Reel.applyTheme) Reel.applyTheme(this.organisationTheme);
        try { localStorage.setItem('reel.theme', this.theme); } catch { /* ignore */ }
        this.mountCharts();
      },

      async refreshUnread() {
        if (!this.session) return;
        try {
          const payload = await Reel.api('GET', '/notifications/unread-count');
          this.unread = payload.data.unread || 0;
        } catch { /* non-critical */ }
      },

      async signOut() {
        try { await Reel.api('POST', '/auth/logout', {}); } catch { /* ignore */ }
        if (Reel.setCsrf) Reel.setCsrf(null);
        this.session = null;
        this.mode = 'login';
        location.hash = '/login';
        // The sign-in screen belongs to the platform, not to the tenant that
        // just signed out. Reload the platform palette and logo so the next
        // person never sees the previous organisation's colours.
        this.platformBrand = null;
        await this.loadPlatformBranding();
        this.renderAuth();
      },

      reload() { return this.navigate(true); },

      toast(message, type) {
        const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        this.toasts.push({ id, message, type: type || 'success' });
        setTimeout(() => this.dismissToast(id), 5200);
      },

      dismissToast(id) { this.toasts = this.toasts.filter((t) => t.id !== id); },

      closeOverlays() {
        this.commandOpen = false;
        this.quickOpen = false;
        if (this.modal && !this.modal.saving) this.closeModal();
      },

      async apiAction(method, path, body, options) {
        const opts = options || {};
        try {
          const result = await Reel.api(method, path, body, opts);
          if (opts.successMessage) this.toast(opts.successMessage);
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

      act(method, path, body, options) {
        return this.apiAction(method, path, body, options);
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

      exportCurrentCsv(filename, keys, labels) {
        const source = (this.page && (this.page.rows || this.page.items || this.page.events)) || [];
        const columns = keys || [];
        const header = labels && labels.length === columns.length ? labels : columns;
        const csv = [header.join(',')].concat(source.map((row) => columns.map((key) =>
          '"' + String(row[key] === null || row[key] === undefined ? '' : row[key]).replace(/"/g, '""') + '"').join(','))).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'export.csv';
        a.click();
        URL.revokeObjectURL(url);
        this.toast('Export downloaded.');
      },

      openModal(config) {
        const data = {};
        (config.fields || []).forEach((field) => {
          if (field.type === 'checkbox') {
            data[field.name] = field.value === undefined ? false : field.value;
          } else if (field.multiple) {
            const initial = field.value === undefined ? [] : field.value;
            data[field.name] = Array.isArray(initial) ? initial.slice() : (initial ? [initial] : []);
          } else {
            data[field.name] = field.value === undefined ? '' : field.value;
          }
        });
        this.modal = {
          type: 'form',
          title: config.title,
          description: config.description || null,
          fields: config.fields || [],
          data,
          submitLabel: config.submitLabel || 'Save',
          successMessage: config.successMessage || 'Saved successfully.',
          size: config.size || null,
          endpoint: config.endpoint,
          method: config.method || 'POST',
          transform: config.transform || null,
          onSubmit: config.onSubmit || null,
          onSuccess: config.onSuccess || null,
          mediaBusy: {},
          mediaDraft: {},
          saving: false,
          error: null
        };
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

      closeModal() {
        if (this.modal && this.modal.saving) return;
        this.modal = null;
      },

      mediaPreview(field, url) {
        if (!url) return '';
        return Reel.mediaHtml(url, field.kind || Reel.kindForUrl(url), { compact: true, alt: field.label || '' });
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
              ownerId: field.ownerId || undefined
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

      addModalMediaUrl(field) {
        if (!this.modal) return;
        const draft = ((this.modal.mediaDraft || {})[field.name] || '').trim();
        if (!draft) return;
        const list = Array.isArray(this.modal.data[field.name]) ? this.modal.data[field.name] : [];
        list.push(draft);
        this.modal.data[field.name] = list;
        this.modal.mediaDraft[field.name] = '';
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

      async submitModal() {
        if (!this.modal || this.modal.saving) return;
        const missing = (this.modal.fields || []).filter((f) => {
          if (!f.required) return false;
          const value = this.modal.data[f.name];
          if (Array.isArray(value)) return value.length === 0;
          return value === '' || value === null || value === undefined;
        });
        if (missing.length) {
          this.modal.error = 'Please complete: ' + missing.map((f) => f.label).join(', ');
          return;
        }
        this.modal.saving = true;
        this.modal.error = null;
        const endpoint = this.modal.endpoint || '';
        try {
          let body = this.modal.transform ? this.modal.transform(this.modal.data) : Object.assign({}, this.modal.data);
          if (this.modal.onSuccess) body = this.modal.onSuccess(body) || body;
          if (this.modal.onSubmit) await this.modal.onSubmit(body, this.modal.data);
          else await Reel.api(this.modal.method, this.modal.endpoint, body);
          const message = this.modal.successMessage || 'Saved successfully.';
          this.modal = null;
          if (/^\/organisations\/current$/.test(endpoint) || /^\/platform\/settings$/.test(endpoint)) await this.refreshSession();
          this.toast(message);
          await this.navigate(true);
        } catch (error) {
          this.modal.error = error.message || 'The action failed.';
          if (error.details && Array.isArray(error.details)) {
            this.modal.error += ' ' + error.details.map((d) => d.message || d.field).join(' · ');
          }
          this.modal.saving = false;
        }
      },

      async confirmModal() {
        if (!this.modal || this.modal.saving) return;
        this.modal.saving = true;
        try {
          await Reel.api(this.modal.method, this.modal.endpoint, this.modal.body || {});
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
        if (!this.session) return;
        this.commandOpen = true;
        this.commandQuery = '';
        this.commandIndex = 0;
        this.runCommandSearch();
        this.$nextTick(() => { if (this.$refs.commandInput) this.$refs.commandInput.focus(); });
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
            const payload = await Reel.api('GET', '/search?q=' + encodeURIComponent(this.commandQuery.trim()));
            if (seq !== this._searchSeq) return;
            const data = payload.data || {};
            apiResults = [
              ...(data.learners || []).map((l) => ({ key: 'learner-' + l.id, label: l.first_name + ' ' + l.last_name, route: '/app/learners/' + l.id, kind: 'Learner', icon: 'user' })),
              ...(data.staff || []).map((s) => ({ key: 'staff-' + s.id, label: s.display_name, route: '/app/staff/' + s.id, kind: 'Staff', icon: 'id-card' }))
            ];
          } catch { apiResults = []; }
        }
        const pages = (this.area === 'app' && this.has(['learners.create.daycare'])) ? [{ key: 'action-learner', label: 'Add a learner', route: '/app/learners', kind: 'Action', icon: 'user-plus', action: 'learner' }] : [];
        this.commandResults = [...apiResults, ...navResults, ...pages].slice(0, 18);
        this.commandIndex = 0;
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

      async markAllPresent() {
        const rows = ((this.page && this.page.rows) || []).filter((r) => !r.attendance_id);
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
      },

      async renderPublic(route, params, seq) {
        const root = document.getElementById('public-root');
        if (!root) return;
        const view = V[route.view];
        try {
          const page = view && view.load ? await view.load(this, params) : {};
          if (seq && seq !== this._navSeq) return;
          root.innerHTML = view.render(this, params, page);
          if (window.Alpine && window.Alpine.initTree) window.Alpine.initTree(root);
          if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
        } catch (error) {
          root.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;padding:24px"><div class="card" style="max-width:520px;text-align:center"><h2>Website unavailable</h2><p class="muted">' + Reel.esc(error.message) + '</p><a class="btn btn-primary" href="#/login">Staff sign in</a></div></div>';
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

      fillDemo(email) {
        this.loginEmail = email;
        this.loginPassword = 'Re-EL-Demo-2026!';
        this.$nextTick(() => {
          const form = document.getElementById('login-form');
          if (form) { form.email.value = email; form.password.value = 'Re-EL-Demo-2026!'; }
        });
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

      async submitPublicForm(event, slug, formSlug) {
        this.publicError = null;
        this.publicResult = null;
        try {
          const payload = await Reel.api('POST', '/public/forms/' + encodeURIComponent(slug) + '/' + encodeURIComponent(formSlug) + '/submit', { data: this.publicFormData });
          this.publicResult = payload.data && payload.data.received ? 'Thank you. Your response has been submitted.' : 'Thank you.';
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

      loginEmail: 'principal@littlesprouts.local',
      loginPassword: 'Re-EL-Demo-2026!',
      loginError: null,
      loginBusy: false,
      forgotOpen: false,
      resetSent: null
    };
  }

  Reel.reelApp = reelApp;
  window.reelApp = reelApp;
  Reel.ROUTES = ROUTES;
  Reel.matchRoute = matchRoute;
})();
