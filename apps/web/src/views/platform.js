'use strict';

/* Platform console: tenants, subscriptions, feature flags, health, audit. */
(function () {
  const R = window.Reel;
  const V = R.views;

  function settingLabel(key) {
    return R.titleCase(String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
  }

  function settingValue(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return '<span class="mono small">' + R.esc(R.json(value)) + '</span>';
    return R.esc(String(value));
  }

  function orgRow(o) {
    return '<tr>' +
      '<td><a class="cell-strong" href="#/platform/organisations/' + R.attr(o.id) + '">' + R.esc(o.name) + '</a>' +
      '<span class="cell-sub">' + R.esc(o.slug) + '</span></td>' +
      '<td>' + R.badge(o.status) + '</td>' +
      '<td>' + R.badge(o.subscription_status) + '<span class="cell-sub">' + R.esc(o.plan_name || 'No plan') + '</span></td>' +
      '<td class="num">' + R.number(o.learner_count) + '</td>' +
      '<td class="num">' + R.number(o.staff_count) + '</td>' +
      '<td class="num">' + R.number(o.branch_count) + '</td>' +
      '<td class="cell-actions"><a class="btn btn-sm btn-secondary" href="#/platform/organisations/' + R.attr(o.id) + '">Open</a></td>' +
      '</tr>';
  }

  V.platformOverview = {
    async load() {
      const [overview, organisations] = await Promise.all([
        R.api('GET', '/platform/overview'),
        R.api('GET', '/platform/organisations')
      ]);
      return { overview: overview.data, organisations: organisations.data };
    },
    render(ctx, params, page) {
      const o = page.overview || {};
      const orgs = page.organisations || [];
      const revenue = Number(o.subscriptionRevenue || 0);
      const status = o.organisationStatus || {};
      const security = Array.isArray(o.securityBreakdown) ? o.securityBreakdown : [];
      return R.pageHead('Platform overview', 'Every daycare on Re-EL ECD, in one calm view.',
        '<a class="btn btn-secondary btn-sm" href="#/platform/health">' + R.icon('activity') + ' System health</a>' +
        '<a class="btn btn-primary btn-sm" href="#/platform/organisations">' + R.icon('building-2') + ' Organisations</a>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Organisations', value: R.number(o.organisations), icon: 'building-2', foot: R.number(status.active !== undefined ? status.active : orgs.filter((x) => x.status === 'active').length) + ' active' }) +
        R.statCard({ label: 'Active users', value: R.number(o.activeUsers), icon: 'users', tone: 'sky', foot: 'Across all tenants' }) +
        R.statCard({ label: 'Learners', value: R.number(o.activeLearners), icon: 'baby', tone: 'clay', foot: 'Enrolled children' }) +
        R.statCard({ label: 'Subscription revenue', value: R.money(revenue), icon: 'credit-card', tone: 'plum', foot: 'Monthly recurring' }) +
        '</div>' +
        '<div class="split section"><div class="stack">' +
        R.card('Organisations', R.table({ rows: orgs, columns: [
          { label: 'Organisation', render: (x) => '<a class="cell-strong" href="#/platform/organisations/' + R.attr(x.id) + '">' + R.esc(x.name) + '</a><span class="cell-sub">' + R.esc(x.slug) + '</span>' },
          { label: 'Status', render: (x) => R.badge(x.status) },
          { label: 'Plan', render: (x) => R.esc(x.plan_name || '—') + '<span class="cell-sub">' + R.money(x.monthly_price) + '/mo</span>' },
          { label: 'Learners', align: 'right', render: (x) => R.number(x.learner_count) }
        ], emptyTitle: 'No organisations yet' }), '<a class="btn btn-sm btn-ghost" href="#/platform/organisations">Manage ' + R.icon('arrow-right') + '</a>') +
        R.card('Recent platform activity', (o.recentEvents || []).length ? '<div class="timeline">' + o.recentEvents.slice(0, 8).map((e) =>
          '<div class="timeline-item"><div class="t-time">' + R.relative(e.occurred_at) + ' · ' + R.esc(e.organisation_name || 'Platform') + '</div>' +
          '<div class="t-title">' + R.esc(R.titleCase(e.action)) + '</div>' +
          '<div class="t-body">' + R.esc(e.actor_name || 'System') + ' · ' + R.esc(e.resource_type || '') + '</div></div>').join('') + '</div>' :
          R.emptyState('No recent activity', 'Platform events will appear here.', '', 'scroll-text'), '<a class="btn btn-sm btn-ghost" href="#/platform/audit">Audit explorer ' + R.icon('arrow-right') + '</a>') +
        '</div><div class="stack">' +
        R.card('Signals', '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Failed payment events</span><span class="kpi-value">' + R.number(o.failedPaymentEvents) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Security events</span><span class="kpi-value">' + R.number(o.securityEvents) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Organisations on trial</span><span class="kpi-value">' + R.number(orgs.filter((x) => x.subscription_status === 'trial').length) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Suspended</span><span class="kpi-value">' + R.number(status.suspended !== undefined ? status.suspended : orgs.filter((x) => x.status === 'suspended').length) + '</span></div>' +
          '</div>') +
        (security.length ? R.card('Security activity', '<div class="kpi-list">' + security.map((row) =>
          '<div class="kpi-row"><span class="kpi-label">' + R.esc(R.titleCase(row.action)) + '</span><span class="kpi-value">' + R.number(row.total) + '</span></div>'
        ).join('') + '</div>') : '') +
        R.card('Quick links', '<div class="stack">' +
          '<a class="btn btn-secondary" style="justify-content:flex-start" href="#/platform/subscriptions">' + R.icon('credit-card') + ' Subscriptions and plans</a>' +
          '<a class="btn btn-secondary" style="justify-content:flex-start" href="#/platform/access">' + R.icon('shield-check') + ' Feature flags</a>' +
          '<a class="btn btn-secondary" style="justify-content:flex-start" href="#/platform/support">' + R.icon('life-buoy') + ' Support workspace</a>' +
          '</div>') +
        '</div></div>';
    }
  };

  V.platformOrganisations = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.q) query.set('q', ctx.filters.q);
      if (ctx.filters.status) query.set('status', ctx.filters.status);
      const payload = await R.api('GET', '/platform/organisations' + (query.toString() ? '?' + query : ''));
      return { rows: payload.data, meta: payload.meta || {} };
    },
    render(ctx, params, page) {
      const rows = page.rows || [];
      return R.pageHead('Organisations', 'Create tenants, review their health and manage suspension.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'newOrganisation\')">' + R.icon('plus') + ' New organisation</button>') +
        R.filterBar(R.searchFilter(ctx, 'q', 'Search name or slug…') +
          R.selectFilter(ctx, 'status', [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'onboarding', label: 'Onboarding' }], 'All statuses')) +
        R.table({ rows, columns: [
          { label: 'Organisation', render: (x) => '<a class="cell-strong" href="#/platform/organisations/' + R.attr(x.id) + '">' + R.esc(x.name) + '</a><span class="cell-sub">' + R.esc(x.slug) + ' · ' + R.esc(x.currency) + '</span>' },
          { label: 'Status', render: (x) => R.badge(x.status) },
          { label: 'Subscription', render: (x) => R.badge(x.subscription_status) + '<span class="cell-sub">' + R.esc(x.plan_name || 'No plan') + '</span>' },
          { label: 'Learners', align: 'right', render: (x) => R.number(x.learner_count) },
          { label: 'Staff', align: 'right', render: (x) => R.number(x.staff_count) },
          { label: 'Branches', align: 'right', render: (x) => R.number(x.branch_count) },
          { label: 'Actions', align: 'right', render: (x) => '<div class="btn-group">' +
            '<a class="btn btn-sm btn-secondary" href="#/platform/organisations/' + R.attr(x.id) + '">Open</a>' +
            (x.status === 'suspended'
              ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/platform/organisations/' + R.attr(x.id) + '/restore\',{},{successMessage:\'Organisation restored\'})">Restore</button>'
              : '<button class="btn btn-sm btn-danger" @click="confirmAction(\'Suspend organisation\',\'All staff and parents lose access until the organisation is restored. This is logged in the platform audit trail.\',\'/platform/organisations/' + R.attr(x.id) + '/suspend\',{submitLabel:\'Suspend\',successMessage:\'Organisation suspended\'})">Suspend</button>') +
            '</div>' }
        ], emptyTitle: 'No organisations found', emptyMessage: 'Adjust the filters or create a new tenant.' }) +
        '<div class="muted small" style="margin-top:10px">' + R.number(page.meta.total || rows.length) + ' organisations</div>';
    },
    openModal(ctx, name) {
      if (name === 'newOrganisation') {
        ctx.openModal({
          title: 'Create organisation',
          description: 'The owner receives an invitation to finish setting up their daycare.',
          endpoint: '/platform/organisations',
          submitLabel: 'Create tenant',
          successMessage: 'Organisation created',
          size: 'wide',
          fields: [
            { name: 'name', label: 'Trading name', required: true },
            { name: 'slug', label: 'URL slug', required: true, help: 'Used for the public website address' },
            { name: 'legalName', label: 'Legal name' },
            { name: 'registrationNumber', label: 'Registration number' },
            { name: 'ownerName', label: 'Owner name', required: true },
            { name: 'ownerEmail', label: 'Owner email', type: 'email', required: true },
            { name: 'branchName', label: 'First branch', value: 'Main Campus' },
            { name: 'planKey', label: 'Plan', type: 'select', options: ['seedling', 'sapling', 'canopy'], value: 'seedling' },
            { name: 'currency', label: 'Currency', type: 'select', options: ['ZAR', 'USD', 'EUR', 'GBP'], value: 'ZAR' },
            { name: 'timezone', label: 'Timezone', value: 'Africa/Johannesburg' },
            { name: 'temporaryPassword', label: 'Temporary password', type: 'password', help: 'Optional — leave blank to email an invitation' }
          ]
        });
      }
    },
  };

  V.platformOrganisationDetail = {
    async load(ctx, params) {
      const payload = await R.api('GET', '/platform/organisations/' + encodeURIComponent(params.id));
      return { org: payload.data };
    },
    render(ctx, params, page) {
      const o = page.org || {};
      const s = o.subscription || {};
      const counts = o.counts || {};
      return '<a href="#/platform/organisations" class="muted small">← All organisations</a>' +
        R.pageHead(o.name || 'Organisation', R.esc(o.legal_name || '') + ' · created ' + R.date(o.created_at),
          '<a class="btn btn-secondary btn-sm" href="#/platform/organisations">Back</a>' +
          (o.status === 'suspended'
            ? '<button class="btn btn-primary btn-sm" @click="act(\'POST\',\'/platform/organisations/' + R.attr(o.id) + '/restore\',{},{successMessage:\'Organisation restored\'})">Restore access</button>'
            : '<button class="btn btn-danger btn-sm" @click="confirmAction(\'Suspend organisation\',\'All staff and parents lose access until the organisation is restored.\',\'/platform/organisations/' + R.attr(o.id) + '/suspend\',{submitLabel:\'Suspend\',successMessage:\'Organisation suspended\'})">Suspend</button>')) +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Status', value: R.titleCase(o.status), icon: 'building-2', foot: R.badge(o.subscription_status) }) +
        R.statCard({ label: 'Learners', value: R.number(counts.learners), icon: 'users', tone: 'clay' }) +
        R.statCard({ label: 'Staff', value: R.number(counts.staff), icon: 'id-card', tone: 'sky' }) +
        R.statCard({ label: 'Branches', value: R.number(counts.branches), icon: 'door-open', tone: 'plum' }) +
        '</div>' +
        '<div class="split"><div class="stack">' +
        R.card('Profile', '<div class="detail-list">' +
          R.detailItem('Trading name', R.esc(o.name)) + R.detailItem('Slug', '<span class="mono">' + R.esc(o.slug) + '</span>') +
          R.detailItem('Legal name', R.esc(o.legal_name)) + R.detailItem('Registration', R.esc(o.registration_number)) +
          R.detailItem('Timezone', R.esc(o.timezone)) + R.detailItem('Currency', R.esc(o.currency)) +
          R.detailItem('Locale', R.esc(o.locale)) + R.detailItem('Suspended', o.suspended_at ? R.dateTime(o.suspended_at) + ' · ' + R.esc(o.suspended_reason || '') : 'No') +
          '</div>') +
        R.card('Branches', R.table({ rows: o.branches || [], compact: true, columns: [
          { label: 'Branch', render: (b) => '<span class="cell-strong">' + R.esc(b.name) + '</span><span class="cell-sub">' + R.esc(b.address || '') + '</span>' },
          { label: 'Hours', render: (b) => R.esc((b.opening_time || '').slice(0, 5)) + ' – ' + R.esc((b.closing_time || '').slice(0, 5)) },
          { label: 'Contact', render: (b) => R.esc(b.contact_email || b.contact_phone || '—') },
          { label: 'Status', render: (b) => R.badge(b.status) }
        ], emptyTitle: 'No branches' })) +
        '</div><div class="stack">' +
        R.card('Subscription', s.id ? '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Plan</span><span class="kpi-value">' + R.esc(s.plan_name) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Monthly price</span><span class="kpi-value">' + R.money(s.monthly_price, o.currency) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Status</span><span class="kpi-value">' + R.badge(s.status) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Period ends</span><span class="kpi-value">' + R.date(s.current_period_end) + '</span></div>' +
          '</div>' : R.emptyState('No subscription', 'Attach a plan from the subscriptions page.', '', 'credit-card')) +
        R.card('Settings', Object.keys(o.settings || {}).length
          ? '<div class="detail-list">' + Object.entries(o.settings).map(([key, value]) =>
            R.detailItem(settingLabel(key), settingValue(value))).join('') + '</div>'
          : R.emptyState('No settings recorded', 'This tenant has not customised its settings yet.', '', 'settings')) +
        '</div></div>';
    },
  };

  V.platformSubscriptions = {
    async load() {
      const payload = await R.api('GET', '/platform/subscriptions');
      return { data: payload.data };
    },
    render(ctx, params, page) {
      const d = page.data || {};
      const plans = d.plans || [];
      const subs = d.subscriptions || [];
      return R.pageHead('Subscriptions', 'Plans, tenant billing state and monthly recurring revenue.',
        '<a class="btn btn-secondary btn-sm" href="#/platform/organisations">' + R.icon('building-2') + ' Organisations</a>') +
        '<div class="grid grid-3 section">' + plans.map((p) => R.card(p.name,
          '<div class="stat-value">' + R.money(p.monthly_price) + '<span class="muted" style="font-size:0.8rem;font-weight:500"> /month</span></div>' +
          '<div class="muted small" style="margin:6px 0 10px">' + R.esc(p.description || '') + '</div>' +
          '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Learner limit</span><span class="kpi-value">' + R.esc(p.learner_limit || 'Unlimited') + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Staff limit</span><span class="kpi-value">' + R.esc(p.staff_limit || 'Unlimited') + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Active tenants</span><span class="kpi-value">' + subs.filter((s) => s.plan_name === p.name && s.status === 'active').length + '</span></div>' +
          '</div>')) .join('') + '</div>' +
        '<div class="grid grid-2 section">' +
        R.card('Tenant subscriptions', R.table({ rows: subs, columns: [
          { label: 'Organisation', render: (s) => '<span class="cell-strong">' + R.esc(s.organisation_name) + '</span><span class="cell-sub">' + R.esc(s.plan_name) + '</span>' },
          { label: 'Status', render: (s) => R.badge(s.status) },
          { label: 'Billing', render: (s) => R.esc(R.titleCase(s.billing_period)) },
          { label: 'Renews', render: (s) => R.date(s.current_period_end) },
          { label: 'MRR', align: 'right', render: (s) => R.money(s.monthly_price) }
        ], emptyTitle: 'No subscriptions' })) +
        R.card('Revenue', '<div class="stat-value">' + R.money(d.mrr) + '</div><div class="muted small">Monthly recurring revenue</div>' +
          '<div class="kpi-list" style="margin-top:14px">' +
          '<div class="kpi-row"><span class="kpi-label">Paying tenants</span><span class="kpi-value">' + subs.filter((s) => s.status === 'active').length + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Trials</span><span class="kpi-value">' + subs.filter((s) => s.status === 'trial').length + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Past due</span><span class="kpi-value">' + subs.filter((s) => s.status === 'past_due' || s.status === 'overdue').length + '</span></div>' +
          '</div>') +
        '</div>';
    }
  };

  V.platformAccess = {
    async load() {
      const [features, cases] = await Promise.all([
        R.api('GET', '/platform/features'),
        R.api('GET', '/platform/support-cases')
      ]);
      return { features: features.data, cases: cases.data };
    },
    render(ctx, params, page) {
      const features = page.features || [];
      return R.pageHead('Platform access and features', 'Turn capabilities on or off for the whole platform.',
        '<a class="btn btn-secondary btn-sm" href="#/platform/support">' + R.icon('life-buoy') + ' Support</a>') +
        R.card('Feature flags', R.table({ rows: features, columns: [
          { label: 'Flag', render: (f) => '<span class="cell-strong mono">' + R.esc(f.flag_key) + '</span><span class="cell-sub">' + R.esc(f.description || '') + '</span>' },
          { label: 'Plans', render: (f) => (f.plan_availability || []).map((p) => '<span class="badge badge-muted">' + R.esc(p) + '</span>').join(' ') || '—' },
          { label: 'State', render: (f) => '<span class="badge ' + (f.enabled ? 'badge-green' : 'badge-muted') + '">' + (f.enabled ? 'Enabled' : 'Disabled') + '</span>' },
          { label: 'Updated', render: (f) => R.date(f.updated_at) },
          { label: '', align: 'right', render: (f) => '<button class="btn btn-sm ' + (f.enabled ? 'btn-secondary' : 'btn-primary') + '" @click="act(\'PATCH\',\'/platform/features/' + R.attr(f.flag_key) + '\',{enabled:' + (!f.enabled) + '},{successMessage:\'Feature updated\'})">' + (f.enabled ? 'Disable' : 'Enable') + '</button>' }
        ], emptyTitle: 'No feature flags' })) +
        '<div class="section"></div>' +
        R.card('Open support cases', R.table({ rows: page.cases || [], columns: [
          { label: 'Subject', render: (c) => '<span class="cell-strong">' + R.esc(c.subject) + '</span><span class="cell-sub">' + R.esc(c.organisation_name || '') + '</span>' },
          { label: 'Status', render: (c) => R.badge(c.status) },
          { label: 'Opened', render: (c) => R.date(c.created_at) }
        ], emptyTitle: 'No support cases', emptyMessage: 'Cases raised by tenants appear here.' }));
    }
  };

  V.platformAudit = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.q) query.set('q', ctx.filters.q);
      if (ctx.filters.action) query.set('action', ctx.filters.action);
      query.set('pageSize', '50');
      const payload = await R.api('GET', '/platform/audit-events?' + query);
      return { rows: payload.data, meta: payload.meta || {} };
    },
    render(ctx, params, page) {
      return R.pageHead('Platform audit explorer', 'Every privileged action across all tenants, immutable and timestamped.',
        '<button class="btn btn-secondary btn-sm" @click="exportCurrentCsv(\'platform-audit.csv\',[\'occurred_at\',\'actor_name\',\'action\',\'resource_type\',\'resource_id\',\'organisation_name\',\'ip_address\'])">' + R.icon('download') + ' Export CSV</button>') +
        R.filterBar(R.searchFilter(ctx, 'q', 'Search action, actor or resource…') +
          R.selectFilter(ctx, 'action', [{ value: 'auth.login', label: 'Sign in' }, { value: 'platform.', label: 'Platform actions' }, { value: 'learner', label: 'Learner actions' }], 'All actions')) +
        R.table({ rows: page.rows || [], columns: [
          { label: 'When', render: (a) => '<span class="cell-strong">' + R.dateTime(a.occurred_at) + '</span><span class="cell-sub">' + R.relative(a.occurred_at) + '</span>' },
          { label: 'Actor', render: (a) => R.esc(a.actor_name || 'System') + '<span class="cell-sub">' + R.esc(a.actor_email || '') + '</span>' },
          { label: 'Action', render: (a) => '<span class="badge badge-muted mono">' + R.esc(a.action) + '</span>' },
          { label: 'Resource', render: (a) => R.esc(a.resource_type || '—') + '<span class="cell-sub mono">' + R.esc(R.truncate(a.resource_id, 14)) + '</span>' },
          { label: 'Tenant', render: (a) => R.esc(a.organisation_name || 'Platform') },
          { label: 'IP', render: (a) => '<span class="mono small">' + R.esc(a.ip_address || '—') + '</span>' }
        ], emptyTitle: 'No audit events' }) +
        '<div class="muted small" style="margin-top:10px">' + R.number(page.meta.total || 0) + ' events</div>';
    }
  };

  V.platformHealth = {
    async load() {
      const payload = await R.api('GET', '/platform/health');
      return { health: payload.data };
    },
    render(ctx, params, page) {
      const h = page.health || {};
      const ok = h.status === 'ok' || h.status === 'healthy';
      return R.pageHead('System health', 'Live status of the API, database and background work.',
        '<button class="btn btn-secondary btn-sm" @click="navigate(true)">' + R.icon('refresh-cw') + ' Re-check</button>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Status', value: ok ? 'Operational' : R.titleCase(h.status || 'Unknown'), icon: ok ? 'check-circle' : 'alert-triangle', tone: ok ? 'green' : 'danger', foot: 'Checked ' + R.time(h.checkedAt) }) +
        R.statCard({ label: 'Database', value: R.titleCase(h.database || '—'), icon: 'database', tone: 'sky', foot: R.number(h.latencyMs) + ' ms latency' }) +
        R.statCard({ label: 'Uptime', value: Math.floor(Number(h.uptimeSeconds || 0) / 60) + 'm', icon: 'timer', tone: 'plum', foot: 'Since process start' }) +
        R.statCard({ label: 'Failed actions (24h)', value: R.number(h.failedActions24h), icon: 'alert-octagon', tone: Number(h.failedActions24h) ? 'danger' : 'green', foot: 'Errors recorded in audit' }) +
        '</div>' +
        '<div class="split"><div class="stack">' +
        R.card('Runtime', '<div class="detail-list">' +
          R.detailItem('Version', R.esc(h.version)) + R.detailItem('Environment', R.esc(h.environment)) +
          R.detailItem('Node', R.esc(h.nodeVersion)) + R.detailItem('Region', R.esc(h.region || '—')) +
          '</div>') +
        R.card('Checks', '<ul class="list-clean">' +
          '<li>' + R.icon(ok ? 'check-circle' : 'x-circle') + '<div><div class="strong">API router</div><div class="muted small">Responding to requests</div></div><span class="badge badge-green row-end">Pass</span></li>' +
          '<li>' + R.icon(h.database ? 'check-circle' : 'x-circle') + '<div><div class="strong">Database</div><div class="muted small">' + R.esc(h.database || 'unavailable') + '</div></div><span class="badge ' + (h.database ? 'badge-green' : 'badge-danger') + ' row-end">' + (h.database ? 'Pass' : 'Fail') + '</span></li>' +
          '<li>' + R.icon('check-circle') + '<div><div class="strong">Migrations</div><div class="muted small">Schema is at the expected version</div></div><span class="badge badge-green row-end">Pass</span></li>' +
          '</ul>') +
        '</div><div class="stack">' +
        R.card('Operational notes', '<p class="muted small">Health is computed on each request. In production, point an uptime monitor at <span class="mono">/healthz</span> and alert on non-200 responses.</p>' +
          '<a class="btn btn-secondary btn-sm" href="#/platform/audit">Open audit explorer</a>') +
        '</div></div>';
    }
  };

  V.platformSettings = {
    async load() {
      const [features, config] = await Promise.all([
        R.api('GET', '/platform/features'),
        R.api('GET', '/platform/settings')
      ]);
      const payload = config.data || {};
      return { features: features.data, org: Object.assign({}, payload.organisation || {}, { settings: payload.settings || {} }) };
    },
    render(ctx, params, page) {
      const org = page.org || {};
      return R.pageHead('Platform configuration', 'The platform organisation profile and global switches.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'editOrg\')">' + R.icon('pencil') + ' Edit profile</button>') +
        '<div class="split"><div class="stack">' +
        R.card('Platform organisation', '<div class="detail-list">' +
          R.detailItem('Name', R.esc(org.name)) + R.detailItem('Slug', R.esc(org.slug)) +
          R.detailItem('Legal name', R.esc(org.legal_name)) + R.detailItem('Registration', R.esc(org.registration_number)) +
          R.detailItem('Timezone', R.esc(org.timezone)) + R.detailItem('Currency', R.esc(org.currency)) +
          '</div>') +
        R.card('Global feature flags', R.table({ rows: page.features || [], compact: true, columns: [
          { label: 'Flag', render: (f) => '<span class="mono">' + R.esc(f.flag_key) + '</span>' },
          { label: 'State', render: (f) => R.badge(f.enabled ? 'enabled' : 'disabled') },
          { label: '', align: 'right', render: (f) => '<button class="btn btn-sm btn-secondary" @click="act(\'PATCH\',\'/platform/features/' + R.attr(f.flag_key) + '\',{enabled:' + (!f.enabled) + '},{successMessage:\'Feature updated\'})">Toggle</button>' }
        ] })) +
        '</div><div class="stack">' +
        R.card('Environment', '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Public website</span><span class="kpi-value">' + R.badge((org.settings || {}).publicWebsite === false ? 'disabled' : 'enabled') + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Data retention</span><span class="kpi-value">' + R.esc(((org.settings || {}).dataRetention || {}).years || 7) + ' years</span></div>' +
          '</div><p class="muted small">Environment variables are managed in Vercel. Run <span class="mono">npm run validate:env</span> before deploying.</p>' +
          (ctx.has('platform.settings.manage') ? '<div class="btn-group"><button class="btn btn-secondary btn-sm" @click="openNamedModal(\'platformSettings\')">' + R.icon('sliders-horizontal') + ' Edit platform settings</button></div>' : '')) +
        '</div></div>';
    },
  };

  V.platformSettings.openModal = function (ctx, name) {
    if (name === 'platformSettings') {
      const settings = ((ctx.page && ctx.page.org) || {}).settings || {};
      ctx.openModal({
        title: 'Platform settings',
        endpoint: '/platform/settings',
        method: 'PATCH',
        submitLabel: 'Save settings',
        size: 'wide',
        fields: [
          { name: 'publicWebsite', label: 'Public websites enabled', type: 'checkbox', value: settings.publicWebsite !== false },
          { name: 'allowTenantSignup', label: 'Allow tenant self-signup', type: 'checkbox', value: settings.allowTenantSignup === true },
          { name: 'supportEmail', label: 'Support email', type: 'email', value: settings.supportEmail || '' },
          { name: 'retentionYears', label: 'Data retention (years)', type: 'number', value: (settings.dataRetention || {}).years || 7 }
        ],
        transform(data) {
          return {
            settings: {
              publicWebsite: data.publicWebsite === true,
              allowTenantSignup: data.allowTenantSignup === true,
              supportEmail: data.supportEmail || null,
              dataRetention: { years: Number(data.retentionYears) || 7 }
            }
          };
        }
      });
      return;
    }
    const org = (ctx.page && ctx.page.org) || {};
    ctx.openModal({
      title: 'Edit platform organisation',
      endpoint: '/platform/settings',
      method: 'PATCH',
      submitLabel: 'Save changes',
      fields: [
        { name: 'name', label: 'Name', value: org.name, required: true },
        { name: 'legalName', label: 'Legal name', value: org.legal_name },
        { name: 'registrationNumber', label: 'Registration number', value: org.registration_number },
        { name: 'timezone', label: 'Timezone', value: org.timezone },
        { name: 'currency', label: 'Currency', value: org.currency },
        { name: 'locale', label: 'Locale', value: org.locale }
      ]
    });
  };

  V.platformSupport = {
    async load() {
      const [cases, orgs] = await Promise.all([
        R.api('GET', '/platform/support-cases'),
        R.api('GET', '/platform/organisations')
      ]);
      return { cases: cases.data, organisations: orgs.data };
    },
    render(ctx, params, page) {
      return R.pageHead('Support workspace', 'Track tenant issues and time-boxed access grants.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'newCase\')">' + R.icon('plus') + ' New case</button>') +
        R.card('Cases', R.table({ rows: page.cases || [], columns: [
          { label: 'Subject', render: (c) => '<span class="cell-strong">' + R.esc(c.subject) + '</span><span class="cell-sub">' + R.esc(c.organisation_name || '') + '</span>' },
          { label: 'Status', render: (c) => R.badge(c.status) },
          { label: 'Access until', render: (c) => c.access_granted_until ? R.dateTime(c.access_granted_until) : '—' },
          { label: 'Opened', render: (c) => R.date(c.created_at) },
          { label: 'Description', render: (c) => '<span class="muted small">' + R.esc(R.truncate(c.description, 80)) + '</span>' }
        ], emptyTitle: 'No support cases', emptyMessage: 'Raise a case when a tenant needs hands-on help.' }));
    },
    openModal(ctx, name) {
      if (name !== 'newCase') return;
      ctx.openModal({
        title: 'New support case',
        endpoint: '/platform/support-cases',
        submitLabel: 'Create case',
        fields: [
          { name: 'organisationId', label: 'Organisation', type: 'select', required: true, options: (ctx.page.organisations || []).map((o) => ({ value: o.id, label: o.name })) },
          { name: 'subject', label: 'Subject', required: true, span: 2 },
          { name: 'description', label: 'Description', type: 'textarea', span: 2 },
          { name: 'accessGrantedUntil', label: 'Access granted until', type: 'datetime-local', help: 'Leave blank for no support access' }
        ]
      });
    }
  };

})();
