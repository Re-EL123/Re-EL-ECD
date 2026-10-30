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

  /**
   * Suspension always needs a reason: it revokes every session and is shown to
   * the tenant in the audit trail. Both the directory and the detail screen use
   * this form so neither path can send an empty reason.
   */
  function openSuspendOrgModal(ctx, id) {
    if (!id) { ctx.toast('That organisation could not be found.', 'warn'); return; }
    ctx.openModal({
      title: 'Suspend organisation',
      description: 'All staff and parents lose access immediately and every active session is revoked. The reason is recorded in the platform audit trail and shown to the tenant.',
      endpoint: '/platform/organisations/' + encodeURIComponent(id) + '/suspend',
      submitLabel: 'Suspend organisation',
      successMessage: 'Organisation suspended',
      fields: [
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, span: 2, help: 'Explain why access is being withdrawn so the tenant understands what to fix.' }
      ]
    });
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
      const [payload, plans] = await Promise.all([
        R.api('GET', '/platform/organisations' + (query.toString() ? '?' + query : '')),
        R.api('GET', '/platform/plans').catch(() => ({ data: [] }))
      ]);
      return { rows: payload.data, meta: payload.meta || {}, plans: plans.data || [] };
    },
    render(ctx, params, page) {
      const rows = page.rows || [];
      return R.pageHead('Organisations', 'Create tenants, review their health and manage suspension.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'newOrganisation\')">' + R.icon('plus') + ' New organisation</button>') +
        R.filterBar(R.searchFilter(ctx, 'q', 'Search name or slug…') +
          R.selectFilter(ctx, 'status', [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'onboarding', label: 'Onboarding' }], 'All statuses')) +
        (ctx.has('platform.organisations.manage')
          ? R.bulkBar([
            { label: 'Suspend selected', icon: 'pause', modal: 'bulkSuspendOrgs', tone: 'danger' },
            { label: 'Restore selected', icon: 'play', path: '/platform/organisations/bulk', action: 'restore' }
          ], { hint: 'Bulk changes are recorded in the platform audit trail.' })
          : '') +
        R.table({ rows, selectable: ctx.has('platform.organisations.manage'), columns: [
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
              : '<button class="btn btn-sm btn-danger" @click="openNamedModal(\'suspendOrg\', ' + R.attr(JSON.stringify(x.id)) + ')">Suspend</button>') +
            '</div>' }
        ], emptyTitle: 'No organisations found', emptyMessage: 'Adjust the filters or create a new tenant.' }) +
        '<div class="muted small" style="margin-top:10px">' + R.number(page.meta.total || rows.length) + ' organisations</div>';
    },
    openModal(ctx, name, id) {
      if (name === 'newOrganisation') {
        const plans = ((ctx.page && ctx.page.plans) || []).filter((plan) => plan.status === 'active');
        const planOptions = plans.length
          ? plans.map((plan) => ({ value: plan.plan_key, label: plan.name + ' · ' + R.money(plan.monthly_price, plan.currency) + '/mo' }))
          : ['seedling', 'sapling', 'evergreen'];
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
            { name: 'planKey', label: 'Plan', type: 'select', options: planOptions, value: plans.length ? plans[0].plan_key : 'seedling' },
            { name: 'currency', label: 'Currency', type: 'select', options: ['ZAR', 'USD', 'EUR', 'GBP'], value: 'ZAR' },
            { name: 'timezone', label: 'Timezone', value: 'Africa/Johannesburg' },
            { name: 'temporaryPassword', label: 'Temporary password', type: 'password', help: 'Optional — leave blank to email an invitation' }
          ]
        });
        return;
      }
      if (name === 'suspendOrg') {
        openSuspendOrgModal(ctx, id);
        return;
      }
      if (name === 'bulkSuspendOrgs') {
        ctx.openModal({
          title: 'Suspend selected organisations',
          description: 'Every selected tenant loses access immediately and its sessions are revoked. The reason is recorded once per organisation in the audit trail.',
          submitLabel: 'Suspend ' + ctx.selectedCount,
          successMessage: 'Bulk suspension complete.',
          fields: [
            { name: 'reason', label: 'Reason', type: 'textarea', required: true, span: 2, help: 'Shared with the platform audit trail and shown to the tenant.' }
          ],
          async onSubmit(body) {
            const result = await ctx.runBulk('/platform/organisations/bulk', 'suspend', { reason: body.reason }, { reload: false, silent: true });
            if (!result) throw new Error('The bulk suspension could not be completed.');
            if (!Number(result.updated)) throw new Error('No organisations were suspended. They may already be suspended.');
          }
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
            : '<button class="btn btn-danger btn-sm" @click="openNamedModal(\'suspendOrg\', ' + R.attr(JSON.stringify(o.id)) + ')">Suspend</button>')) +
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
    openModal(ctx, name, id) {
      if (name === 'suspendOrg') openSuspendOrgModal(ctx, id || (ctx.page && ctx.page.org && ctx.page.org.id));
    },
  };

  V.platformSubscriptions = {
    async load() {
      const [subscriptions, organisations] = await Promise.all([
        R.api('GET', '/platform/subscriptions'),
        R.api('GET', '/platform/organisations')
      ]);
      return { data: subscriptions.data, organisations: organisations.data || [] };
    },
    render(ctx, params, page) {
      const d = page.data || {};
      const plans = d.plans || [];
      const subs = d.subscriptions || [];
      const canManage = ctx.has('platform.subscriptions.manage');
      const activePlanCount = (plan) => subs.filter((s) => s.plan_id === plan.id && ['trial', 'active', 'past_due'].includes(s.status)).length;
      const planCard = (p) => '<div class="plan-card ' + (p.status === 'archived' ? 'archived' : '') + '">' +
        '<div class="row" style="justify-content:space-between;align-items:flex-start">' +
        '<div><div class="cell-strong" style="font-size:1rem">' + R.esc(p.name) + '</div>' +
        '<div class="cell-sub mono">' + R.esc(p.plan_key) + '</div></div>' +
        R.badge(p.status) + '</div>' +
        '<div class="plan-price">' + R.money(p.monthly_price, p.currency) + '<span> /month</span></div>' +
        '<div class="muted small">' + R.esc(p.description || 'No description yet.') + '</div>' +
        '<div class="kpi-list">' +
        '<div class="kpi-row"><span class="kpi-label">Learner limit</span><span class="kpi-value">' + (p.max_learners ? R.number(p.max_learners) : 'Unlimited') + '</span></div>' +
        '<div class="kpi-row"><span class="kpi-label">Staff limit</span><span class="kpi-value">' + (p.max_staff ? R.number(p.max_staff) : 'Unlimited') + '</span></div>' +
        '<div class="kpi-row"><span class="kpi-label">Active tenants</span><span class="kpi-value">' + R.number(activePlanCount(p)) + '</span></div>' +
        '</div>' +
        ((p.features || []).length ? '<div class="plan-features">' + (p.features || []).map((f) => '<span class="badge badge-muted">' + R.esc(R.titleCase(String(f).replace(/_/g, ' '))) + '</span>').join('') + '</div>' : '') +
        (canManage ? '<div class="plan-actions">' +
          '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'editPlan\',' + R.attr(JSON.stringify(p.id)) + ')">' + R.icon('pencil') + ' Edit</button>' +
          '<button class="btn btn-sm ' + (p.status === 'archived' ? 'btn-secondary' : 'btn-ghost') + '" @click="act(\'PATCH\',\'/platform/plans/' + R.attr(p.id) + '\',{status:\'' + (p.status === 'archived' ? 'active' : 'archived') + '\'},{successMessage:\'Plan ' + (p.status === 'archived' ? 'restored' : 'archived') + '\'})">' + R.icon(p.status === 'archived' ? 'rotate-ccw' : 'archive') + ' ' + (p.status === 'archived' ? 'Restore' : 'Archive') + '</button>' +
          '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'assignPlan\')">' + R.icon('user-plus') + ' Assign</button>' +
          '</div>' : '') +
        '</div>';
      return R.pageHead('Subscriptions', 'Plans, tenant billing state and monthly recurring revenue.',
        (canManage ? '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'newPlan\')">' + R.icon('plus') + ' New plan</button>' : '') +
        '<a class="btn btn-secondary btn-sm" href="#/platform/organisations">' + R.icon('building-2') + ' Organisations</a>') +
        '<div class="grid grid-3 section">' +
        R.statCard({ label: 'Monthly recurring', value: R.money(d.mrr), icon: 'credit-card', foot: subs.filter((s) => s.status === 'active').length + ' paying tenants' }) +
        R.statCard({ label: 'Active plans', value: R.number(plans.filter((p) => p.status === 'active').length), icon: 'layers', tone: 'sky', foot: plans.length + ' in catalogue' }) +
        R.statCard({ label: 'Trials', value: R.number(subs.filter((s) => s.status === 'trial').length), icon: 'hourglass', tone: 'plum', foot: 'Awaiting conversion' }) +
        '</div>' +
        R.card('Plan catalogue', '<div class="plan-grid">' + plans.map(planCard).join('') + '</div>',
          canManage ? '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'newPlan\')">' + R.icon('plus') + ' New plan</button>' : '') +
        '<div class="section"></div>' +
        '<div class="grid grid-2 section">' +
        R.card('Tenant subscriptions', R.table({ rows: subs, columns: [
          { label: 'Organisation', render: (s) => '<a class="cell-strong" href="#/platform/organisations/' + R.attr(s.organisation_id) + '">' + R.esc(s.organisation_name) + '</a><span class="cell-sub">' + R.esc(s.plan_name || 'No plan') + '</span>' },
          { label: 'Status', render: (s) => R.badge(s.status) },
          { label: 'Billing', render: (s) => R.esc(R.titleCase(s.billing_period)) },
          { label: 'Renews', render: (s) => R.date(s.current_period_end) },
          { label: 'MRR', align: 'right', render: (s) => R.money(s.monthly_price, s.organisation_currency) }
        ], emptyTitle: 'No subscriptions', emptyMessage: 'Assign a plan to an organisation to begin billing.' })) +
        R.card('Revenue', '<div class="stat-value">' + R.money(d.mrr) + '</div><div class="muted small">Monthly recurring revenue</div>' +
          '<div class="kpi-list" style="margin-top:14px">' +
          '<div class="kpi-row"><span class="kpi-label">Paying tenants</span><span class="kpi-value">' + subs.filter((s) => s.status === 'active').length + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Trials</span><span class="kpi-value">' + subs.filter((s) => s.status === 'trial').length + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Past due</span><span class="kpi-value">' + subs.filter((s) => s.status === 'past_due' || s.status === 'overdue').length + '</span></div>' +
          '</div>') +
        '</div>';
    },
    openModal(ctx, name, id) {
      const page = ctx.page || {};
      const plans = ((page.data || {}).plans) || [];
      const organisations = page.organisations || [];
      if (name === 'newPlan' || name === 'editPlan') {
        const plan = name === 'editPlan' ? plans.find((p) => p.id === id) : null;
        if (name === 'editPlan' && !plan) { ctx.toast('That plan could not be found.', 'warn'); return; }
        ctx.openModal({
          title: plan ? 'Edit ' + plan.name : 'Create a subscription plan',
          description: plan ? 'Changes apply to new subscriptions; existing subscriptions keep their agreed price until renewed.' : 'Plans define price, limits and the features a tenant can use.',
          endpoint: plan ? '/platform/plans/' + encodeURIComponent(plan.id) : '/platform/plans',
          method: plan ? 'PATCH' : 'POST',
          submitLabel: plan ? 'Save plan' : 'Create plan',
          successMessage: plan ? 'Plan updated' : 'Plan created',
          size: 'wide',
          fields: [
            { name: 'name', label: 'Plan name', required: true, value: plan ? plan.name : '' },
            { name: 'planKey', label: 'Plan key', required: true, value: plan ? plan.plan_key : '', help: 'Lowercase letters, numbers and hyphens. Cannot be changed casually — it identifies the plan in billing.' },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, value: plan ? (plan.description || '') : '' },
            { name: 'monthlyPrice', label: 'Monthly price', type: 'number', min: 0, step: '0.01', required: true, value: plan ? plan.monthly_price : 0 },
            { name: 'currency', label: 'Currency', type: 'select', options: ['ZAR', 'USD', 'EUR', 'GBP'], value: plan ? plan.currency : 'ZAR' },
            { name: 'maxLearners', label: 'Learner limit', type: 'number', min: 0, value: plan ? plan.max_learners : 50, help: '0 means unlimited' },
            { name: 'maxStaff', label: 'Staff limit', type: 'number', min: 0, value: plan ? plan.max_staff : 10, help: '0 means unlimited' },
            { name: 'features', label: 'Features', type: 'textarea', span: 2, value: plan ? (plan.features || []).join(', ') : 'attendance, assessments, parent_portal, finance', help: 'Comma-separated feature keys.' },
            { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }], value: plan ? plan.status : 'active' }
          ],
          transform(data) {
            const body = {
              name: data.name,
              planKey: String(data.planKey || '').trim().toLowerCase(),
              description: data.description || null,
              monthlyPrice: Number(data.monthlyPrice) || 0,
              currency: data.currency || 'ZAR',
              maxLearners: Number(data.maxLearners) || 0,
              maxStaff: Number(data.maxStaff) || 0,
              features: String(data.features || '').split(',').map((f) => f.trim()).filter(Boolean),
              status: data.status || 'active'
            };
            return body;
          }
        });
        return;
      }
      if (name === 'assignPlan') {
        const activePlans = plans.filter((p) => p.status === 'active');
        ctx.openModal({
          title: 'Assign a subscription plan',
          description: 'The current subscription is cancelled and replaced. The tenant sees the new limits immediately.',
          endpoint: '/platform/organisations',
          submitLabel: 'Assign plan',
          successMessage: 'Subscription assigned',
          fields: [
            { name: 'organisationId', label: 'Organisation', type: 'select', required: true, options: organisations.map((o) => ({ value: o.id, label: o.name + ' · ' + o.slug })) },
            { name: 'planId', label: 'Plan', type: 'select', required: true, options: activePlans.map((p) => ({ value: p.id, label: p.name + ' · ' + R.money(p.monthly_price, p.currency) + '/mo' })) },
            { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'trial', label: 'Trial' }, { value: 'past_due', label: 'Past due' }], value: 'active' },
            { name: 'billingPeriod', label: 'Billing period', type: 'select', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }], value: 'monthly' }
          ],
          async onSubmit(body) {
            await R.api('POST', '/platform/organisations/' + encodeURIComponent(body.organisationId) + '/subscription', {
              planId: body.planId, status: body.status, billingPeriod: body.billingPeriod
            });
          }
        });
      }
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
        R.card('Integrations', '<div class="detail-list">' +
          R.detailItem('Email', R.esc((h.email || {}).provider || '—') + ' · ' + ((h.email || {}).configured ? '<span class="badge badge-green">Configured</span>' : '<span class="badge badge-danger">Not configured</span>')) +
          R.detailItem('Sender', R.esc((h.email || {}).from || '—')) +
          R.detailItem('PayFast', (((h.payments || {}).payfast || {}).configured ? '<span class="badge badge-green">Configured</span>' : '<span class="badge badge-danger">Not configured</span>') + ' · ' + (((h.payments || {}).payfast || {}).sandbox ? 'Sandbox' : 'Live')) +
          R.detailItem('Media storage', ((h.storage || {}).configured ? '<span class="badge badge-green">Configured</span>' : '<span class="badge badge-danger">Not configured</span>') + ' · ' + R.esc((h.storage || {}).provider || '—')) +
          R.detailItem('Bucket', R.esc((h.storage || {}).bucket || '—')) +
          '</div>') +
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
      return {
        features: features.data,
        org: Object.assign({}, payload.organisation || {}, { settings: payload.settings || {} }),
        theme: payload.theme || R.PLATFORM_BRAND.theme
      };
    },
    render(ctx, params, page) {
      const org = page.org || {};
      const theme = page.theme || R.PLATFORM_BRAND.theme;
      const logo = org.logo_url || R.PLATFORM_LOGO;
      const canManage = ctx.has('platform.settings.manage');
      const swatch = (label, value) => '<div style="text-align:center"><span class="swatch" style="display:inline-block;background:' + R.attr(value) + '"></span><div class="muted small mono">' + R.esc(value) + '</div><div class="muted small">' + R.esc(label) + '</div></div>';
      return R.pageHead('Platform configuration', 'The Re-EL ECD brand, the platform organisation profile and global switches.',
        (canManage ? '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'platformBranding\')">' + R.icon('palette') + ' Edit brand colours</button>' : '') +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'editOrg\')">' + R.icon('pencil') + ' Edit profile</button>') +
        R.card('Platform brand',
          '<div class="platform-logo-card">' +
          '<img class="logo-preview" src="' + R.attr(logo) + '" alt="Re-EL ECD logo">' +
          '<div style="flex:1;min-width:200px">' +
          '<div class="cell-strong" style="font-size:1.05rem">' + R.esc(org.name || R.PLATFORM_BRAND.name) + '</div>' +
          '<div class="muted small">' + R.esc(R.PLATFORM_BRAND.tagline) + ' · shown on the sign-in screen, sidebar and platform console.</div>' +
          (canManage ? '<div class="btn-group" style="margin-top:10px">' +
            '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'platformLogo\')">' + R.icon('upload') + ' Upload logo</button>' +
            '<button class="btn btn-sm btn-secondary" @click="extractLogoPalette()">' + R.icon('pipette') + ' Extract colours</button>' +
            '</div>' : '') +
          '</div></div>' +
          '<div class="swatch-row" style="margin-top:16px">' +
          swatch('Primary', theme.primary) + swatch('Secondary', theme.secondary) + swatch('Accent', theme.accent) +
          swatch('Background', theme.background) + swatch('Surface', theme.surface) + swatch('Text', theme.text) +
          '</div>',
          canManage ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'platformBranding\')">Edit palette ' + R.icon('arrow-right') + '</button>' : '') +
        '<div class="section"></div>' +
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
    if (name === 'platformLogo') {
      const org = (ctx.page && ctx.page.org) || {};
      ctx.openModal({
        title: 'Platform logo',
        description: 'Shown in the sidebar, on the sign-in screen, in browser tabs and in transactional email. A square PNG or WebP on a transparent or white background works best.',
        endpoint: '/platform/settings',
        method: 'PATCH',
        submitLabel: 'Save logo',
        successMessage: 'Platform logo updated',
        fields: [
          { name: 'logoUrl', label: 'Logo', type: 'media', kind: 'image', scope: 'branding', accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif', value: org.logo_url || '', help: 'Upload a file or paste a hosted image URL. Leave empty to keep using the bundled Re-EL logo.' }
        ],
        transform(data) {
          return { logoUrl: data.logoUrl || null };
        }
      });
      return;
    }
    if (name === 'platformBranding') {
      const theme = (ctx.page && ctx.page.theme) || R.PLATFORM_BRAND.theme;
      ctx.openModal({
        title: 'Platform brand colours',
        description: 'These colours cascade across the platform console, the sign-in screen and platform email accents. Use Extract colours on the platform brand card to sample them from the logo.',
        endpoint: '/platform/settings',
        method: 'PATCH',
        submitLabel: 'Apply palette',
        successMessage: 'Platform palette updated',
        size: 'wide',
        fields: [
          { name: 'primary', label: 'Primary', type: 'colour', required: true, value: theme.primary || '#0B534A' },
          { name: 'secondary', label: 'Secondary', type: 'colour', required: true, value: theme.secondary || '#2B9A58' },
          { name: 'accent', label: 'Accent', type: 'colour', required: true, value: theme.accent || '#6FC79B' },
          { name: 'background', label: 'Background', type: 'colour', value: theme.background || '#F6F9F7' },
          { name: 'surface', label: 'Surface', type: 'colour', value: theme.surface || '#FFFFFF' },
          { name: 'text', label: 'Text', type: 'colour', value: theme.text || '#0E2B26' }
        ],
        transform(data) {
          return {
            primaryColour: data.primary,
            secondaryColour: data.secondary,
            accentColour: data.accent,
            themeTokens: {
              primary: data.primary,
              secondary: data.secondary,
              accent: data.accent,
              background: data.background,
              surface: data.surface,
              text: data.text
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
