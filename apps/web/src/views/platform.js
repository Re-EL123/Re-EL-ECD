'use strict';

/* Platform console: tenants, subscriptions, feature flags, health, audit. */
(function () {
  const R = window.Reel;
  const V = R.views;

  function storageLabel(bytes) {
    const value = Number(bytes || 0);
    if (!value) return 'Unlimited';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = value, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return (i === 0 ? Math.round(n) : Math.round(n * 10) / 10) + ' ' + units[i];
  }

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
        '<button class="btn btn-secondary btn-sm" @click="openCommand()">' + R.icon('search') + ' Global search</button>' +
        '<button class="btn btn-secondary btn-sm" @click="act(\'POST\',\'/platform/subscriptions/sweep\',{},{successMessage:\'Billing sweep complete.\'})">' + R.icon('refresh-cw') + ' Run billing sweep</button>' +
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'broadcast\')">' + R.icon('megaphone') + ' Broadcast</button>' +
        '<a class="btn btn-secondary btn-sm" href="#/platform/health">' + R.icon('activity') + ' System health</a>' +
        '<a class="btn btn-primary btn-sm" href="#/platform/organisations">' + R.icon('building-2') + ' Organisations</a>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Organisations', value: R.number(o.organisations), icon: 'building-2', foot: R.number(status.active !== undefined ? status.active : orgs.filter((x) => x.status === 'active').length) + ' active' }) +
        R.statCard({ label: 'Active users', value: R.number(o.activeUsers), icon: 'users', tone: 'sky', foot: 'Across all tenants' }) +
        R.statCard({ label: 'Learners', value: R.number(o.activeLearners), icon: 'baby', tone: 'clay', foot: 'Enrolled children' }) +
        R.statCard({ label: 'Subscription revenue', value: R.money(revenue), icon: 'credit-card', tone: 'plum', foot: 'Monthly recurring' }) +
        R.statCard({ label: 'Fees collected (30d)', value: R.money(Number(o.feesCollectedLast30Days || 0)), icon: 'banknote', tone: 'sky', foot: 'Parent fees through the platform account' }) +
        R.statCard({ label: 'Outstanding to settle', value: R.money(Number(o.platformOutstanding || 0)), icon: 'hand-coins', tone: Number(o.platformOutstanding || 0) > 0 ? 'sun' : 'green', foot: 'Tenants awaiting EFT payouts' }) +
        R.statCard({ label: 'Past-due subscriptions', value: R.number(Number(o.pastDueSubscriptions || 0)), icon: 'alarm-clock', tone: Number(o.pastDueSubscriptions || 0) > 0 ? 'danger' : 'green', foot: 'Awaiting payment' }) +
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
    },
    openModal(ctx, name) {
      if (name !== 'broadcast') return;
      const organisations = ((ctx.page && ctx.page.organisations) || []);
      ctx.openModal({
        title: 'Broadcast to tenants',
        description: 'Send an in-app notification and an email to every active member of the selected tenants. Leave the tenants blank to reach every active organisation.',
        endpoint: '/platform/broadcast',
        submitLabel: 'Send broadcast',
        successMessage: 'Broadcast queued',
        size: 'wide',
        fields: [
          { name: 'organisationIds', label: 'Organisations', type: 'multiselect', span: 2,
            options: organisations.map((o) => ({ value: o.id, label: o.name, subtitle: o.slug })),
            placeholder: 'Leave blank for every active tenant' },
          { name: 'title', label: 'Title', required: true, span: 2 },
          { name: 'message', label: 'Message', type: 'textarea', required: true, span: 2 },
          { name: 'email', label: 'Also send by email', type: 'checkbox', value: true }
        ]
      });
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

  V.platformUsers = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.q) query.set('q', ctx.filters.q);
      if (ctx.filters.status) query.set('status', ctx.filters.status);
      if (ctx.filters.organisationId) query.set('organisationId', ctx.filters.organisationId);
      const [users, organisations] = await Promise.all([
        R.api('GET', '/platform/users' + (query.toString() ? '?' + query : '')),
        R.api('GET', '/platform/organisations').catch(() => ({ data: [] }))
      ]);
      return { rows: users.data || [], meta: users.meta || {}, organisations: organisations.data || [] };
    },
    render(ctx, params, page) {
      const rows = page.rows || [];
      const canManage = ctx.has('platform.organisations.manage');
      const statusTone = (status) => status === 'active' ? 'badge-green'
        : status === 'suspended' ? 'badge-danger'
          : status === 'invited' ? 'badge-sun' : 'badge-muted';
      return R.pageHead('Platform users', 'Every account on Re-EL ECD, their tenant memberships and their access state.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'broadcast\')">' + R.icon('megaphone') + ' Broadcast</button>') +
        R.filterBar(R.searchFilter(ctx, 'q', 'Search name or email…') +
          R.selectFilter(ctx, 'status', [
            { value: 'active', label: 'Active' },
            { value: 'invited', label: 'Invited' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'disabled', label: 'Disabled' }
          ], 'All statuses') +
          R.selectFilter(ctx, 'organisationId', (page.organisations || []).map((o) => ({ value: o.id, label: o.name })), 'All organisations')) +
        (canManage ? R.bulkBar([
          { label: 'Activate selected', icon: 'play', path: '/platform/users/bulk', action: 'activate' },
          { label: 'Suspend selected', icon: 'pause', path: '/platform/users/bulk', action: 'suspend', tone: 'danger' },
          { label: 'Revoke sessions', icon: 'log-out', path: '/platform/users/bulk', action: 'revoke_sessions' }
        ], { hint: 'Suspending or disabling an account revokes every active session immediately.' }) : '') +
        R.table({ rows, selectable: canManage, columns: [
          { label: 'User', render: (u) => '<div class="row" style="gap:9px">' +
            R.avatar(u, u.display_name, { size: 'xs', tip: u.display_name + ' · ' + u.email }) +
            '<span><span class="cell-strong">' + R.esc(u.display_name) + '</span><span class="cell-sub">' + R.esc(u.email) + '</span></span></div>' },
          { label: 'Status', render: (u) => '<span class="badge ' + statusTone(u.status) + '">' + R.esc(R.titleCase(u.status)) + '</span>' +
            (u.mfa_enabled ? ' <span class="badge badge-green">MFA</span>' : '') },
          { label: 'Organisations', render: (u) => (u.memberships || []).length
            ? (u.memberships || []).map((m) => '<a class="badge badge-muted" href="#/platform/organisations/' + R.attr(m.organisation_id) + '">' +
              R.esc(m.organisation_name) + '</a>').join(' ')
            : '<span class="muted small">No memberships</span>' },
          { label: 'Roles', render: (u) => (u.memberships || []).flatMap((m) => m.roles || []).length
            ? Array.from(new Set((u.memberships || []).flatMap((m) => m.roles || []))).slice(0, 4).map((role) =>
              '<span class="badge badge-muted mono">' + R.esc(role) + '</span>').join(' ')
            : '—' },
          { label: 'Sessions', align: 'right', render: (u) => R.number(u.active_sessions) },
          { label: 'Last sign-in', render: (u) => u.last_login_at ? '<span class="cell-strong">' + R.date(u.last_login_at) + '</span><span class="cell-sub">' + R.relative(u.last_login_at) + '</span>' : '<span class="muted small">Never</span>' },
          { label: 'Actions', align: 'right', render: (u) => canManage ? '<div class="btn-group">' +
            (u.status === 'active'
              ? '<button class="btn btn-sm btn-danger" @click="openNamedModal(\'userStatus\', ' + R.attr(JSON.stringify(u.id)) + ')">Manage</button>'
              : '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/platform/users/' + R.attr(u.id) + '/status\',{status:\'active\'},{successMessage:\'User activated\'})">Activate</button>') +
            '<button class="btn btn-sm btn-secondary" @click="act(\'POST\',\'/platform/users/' + R.attr(u.id) + '/revoke-sessions\',{},{successMessage:\'Sessions revoked\'})">Revoke sessions</button>' +
            (u.status === 'active' ? '<button class="btn btn-sm btn-secondary" @click="impersonateUser(\'' + R.attr(u.id) + '\')">' + R.icon('eye') + ' View as</button>' : '') +
            '</div>' : '' }
        ], emptyTitle: 'No users found', emptyMessage: 'Adjust the filters or invite a tenant owner.' }) +
        '<div class="muted small" style="margin-top:10px">' + R.number(page.meta.total || rows.length) + ' users</div>';
    },
    openModal(ctx, name, id) {
      if (name === 'broadcast') {
        const organisations = ((ctx.page && ctx.page.organisations) || []);
        ctx.openModal({
          title: 'Broadcast to tenants',
          description: 'Send an in-app notification and an email to every active member of the selected tenants. Leave the tenants blank to reach every active organisation.',
          endpoint: '/platform/broadcast',
          submitLabel: 'Send broadcast',
          successMessage: 'Broadcast queued',
          size: 'wide',
          fields: [
            { name: 'organisationIds', label: 'Organisations', type: 'multiselect', span: 2,
              options: organisations.map((o) => ({ value: o.id, label: o.name, subtitle: o.slug })),
              placeholder: 'Leave blank for every active tenant' },
            { name: 'title', label: 'Title', required: true, span: 2 },
            { name: 'message', label: 'Message', type: 'textarea', required: true, span: 2 },
            { name: 'email', label: 'Also send by email', type: 'checkbox', value: true }
          ]
        });
        return;
      }
      if (name === 'userStatus' && id) {
        const user = ((ctx.page && ctx.page.rows) || []).find((u) => u.id === id);
        ctx.openModal({
          title: 'Manage ' + (user ? user.display_name : 'user'),
          description: 'Suspending or disabling an account revokes every active session immediately. The account keeps its history.',
          endpoint: '/platform/users/' + encodeURIComponent(id) + '/status',
          submitLabel: 'Update access',
          successMessage: 'User access updated',
          fields: [
            { name: 'status', label: 'Access status', type: 'select', required: true,
              options: [
                { value: 'active', label: 'Active' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'disabled', label: 'Disabled' }
              ], value: user ? user.status : 'active' }
          ]
        });
      }
    }
  };

  V.platformOrganisationDetail = {
    async load(ctx, params) {
      const [payload, plans, paymentAccount] = await Promise.all([
        R.api('GET', '/platform/organisations/' + encodeURIComponent(params.id)),
        R.api('GET', '/platform/plans').catch(() => ({ data: [] })),
        R.api('GET', '/platform/organisations/' + encodeURIComponent(params.id) + '/payment-account').catch(() => ({ data: null }))
      ]);
      return { org: payload.data, plans: plans.data || [], paymentAccount: paymentAccount.data || null };
    },
    render(ctx, params, page) {
      const o = page.org || {};
      const s = o.subscription || {};
      const sf = o.setupFee || null;
      const counts = o.counts || {};
      return '<a href="#/platform/organisations" class="muted small">← All organisations</a>' +
        R.pageHead(o.name || 'Organisation', R.esc(o.legal_name || '') + ' · created ' + R.date(o.created_at),
          '<a class="btn btn-secondary btn-sm" href="#/platform/organisations">Back</a>' +
          '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'broadcastOrg\')">' + R.icon('megaphone') + ' Message tenant</button>' +
          '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'assignPlan\')">' + R.icon('credit-card') + ' Assign plan</button>' +
          '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'manualSubscriptionPayment\')">' + R.icon('wallet') + ' Record sub payment</button>' +
          (sf && sf.status === 'issued' ? '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'manualSetupFeePayment\')">' + R.icon('badge-check') + ' Record setup payment</button><button class="btn btn-secondary btn-sm" @click="openNamedModal(\'waiveSetupFee\')">' + R.icon('badge-minus') + ' Waive setup fee</button>' : '') +
          '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'paymentAccount\')">' + R.icon('banknote') + ' Payment account</button>' +
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
          '</div>' : R.emptyState('No subscription', 'Attach a plan from the subscriptions page.', '', 'credit-card'),
          s.id && Number(s.monthly_price) > 0
            ? '<button class="btn btn-sm btn-primary" @click="billSubscription(\'' + R.attr(o.id) + '\')">' + R.icon('credit-card') + ' Bill via PayFast</button>'
            : '') +
        R.card('Once-off setup package (R700)', sf ? '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Status</span><span class="kpi-value">' + R.badge(sf.status === 'paid' ? 'active' : (sf.status === 'issued' ? 'overdue' : 'completed')) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Base amount</span><span class="kpi-value">' + R.money(sf.amount, sf.currency || o.currency) + '</span></div>' +
          (sf.paidAt ? '<div class="kpi-row"><span class="kpi-label">Paid</span><span class="kpi-value">' + R.date(sf.paidAt) + '</span></div>' : '') +
          (sf.paymentReference ? '<div class="kpi-row"><span class="kpi-label">Reference</span><span class="kpi-value mono small">' + R.esc(sf.paymentReference) + '</span></div>' : '') +
          (sf.waivedAt ? '<div class="kpi-row"><span class="kpi-label">Waived</span><span class="kpi-value">' + R.date(sf.waivedAt) + (sf.waivedReason ? ' · ' + R.esc(sf.waivedReason) : '') + '</span></div>' : '') +
          '</div><p class="muted small" style="margin-top:8px">Includes: 3 days staff training, platform setup, public website setup, curriculum template, module templates, activities templates, launch marketing.</p>' : R.emptyState('No setup fee', 'Setup fee tracking not found for this organisation.', '', 'badge-check')) +
        R.card('Settings', Object.keys(o.settings || {}).length
          ? '<div class="detail-list">' + Object.entries(o.settings).map(([key, value]) =>
            R.detailItem(settingLabel(key), settingValue(value))).join('') + '</div>'
          : R.emptyState('No settings recorded', 'This tenant has not customised its settings yet.', '', 'settings')) +
        '</div></div>';
    },
    openModal(ctx, name, id) {
      const org = (ctx.page && ctx.page.org) || {};
      if (name === 'suspendOrg') {
        openSuspendOrgModal(ctx, id || org.id);
        return;
      }
      if (name === 'broadcastOrg') {
        ctx.openModal({
          title: 'Message ' + (org.name || 'tenant'),
          description: 'Send an in-app notification and an email to every active member of this organisation.',
          endpoint: '/platform/broadcast',
          submitLabel: 'Send message',
          successMessage: 'Message sent',
          size: 'wide',
          fields: [
            { name: 'title', label: 'Title', required: true, span: 2 },
            { name: 'message', label: 'Message', type: 'textarea', required: true, span: 2 },
            { name: 'email', label: 'Also send by email', type: 'checkbox', value: true }
          ],
          transform: (data) => Object.assign({}, data, { organisationIds: [org.id] })
        });
        return;
      }
      if (name === 'assignPlan') {
        const plans = ((ctx.page && ctx.page.plans) || []).filter((plan) => plan.status === 'active');
        ctx.openModal({
          title: 'Assign a plan',
          description: 'The current subscription is replaced and the tenant sees the new limits immediately.',
          endpoint: '/platform/organisations/' + encodeURIComponent(org.id) + '/subscription',
          submitLabel: 'Assign plan',
          successMessage: 'Subscription assigned',
          fields: [
            { name: 'planId', label: 'Plan', type: 'select', required: true,
              options: plans.map((plan) => ({ value: plan.id, label: plan.name + ' · ' + R.money(plan.monthly_price, plan.currency) + '/mo' })) },
            { name: 'status', label: 'Status', type: 'select',
              options: [{ value: 'active', label: 'Active' }, { value: 'trial', label: 'Trial' }, { value: 'past_due', label: 'Past due' }], value: 'active' },
            { name: 'billingPeriod', label: 'Billing period', type: 'select',
              options: [{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }], value: 'monthly' }
          ]
        });
        return;
      }
      if (name === 'manualSetupFeePayment') {
        ctx.openModal({
          title: 'Record setup fee payment — ' + (org.name || 'organisation'),
          description: 'Records a manual/EFT payment for the once-off R700 setup & launch package and marks it paid.',
          endpoint: '/platform/organisations/' + encodeURIComponent(org.id) + '/setup-fee/manual-payment',
          submitLabel: 'Record setup payment',
          successMessage: 'Setup fee payment recorded',
          fields: [
            { name: 'reference', label: 'Bank/reference', placeholder: 'e.g. EFT-SETUP-0001' },
            { name: 'amount', label: 'Amount (optional)', type: 'number', value: 700, help: 'Defaults to R700 (base setup fee).' },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
          ]
        });
        return;
      }
      if (name === 'waiveSetupFee') {
        ctx.openModal({
          title: 'Waive setup fee — ' + (org.name || 'organisation'),
          description: 'Mark the once-off R700 setup & launch package as waived for this organisation.',
          endpoint: '/platform/organisations/' + encodeURIComponent(org.id) + '/setup-fee/waive',
          submitLabel: 'Waive setup fee',
          successMessage: 'Setup fee waived',
          fields: [
            { name: 'reason', label: 'Reason', placeholder: 'e.g. Pilot partner / promo' },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
          ]
        });
        return;
      }
      if (name === 'manualSubscriptionPayment') {
        ctx.openModal({
          title: 'Record a subscription payment',
          description: 'Records an EFT (or other manual payment) from this tenant: marks the current invoice paid and extends the subscription by one period. Leave the amount blank to pay the invoice as issued.',
          endpoint: '/platform/organisations/' + encodeURIComponent(org.id) + '/subscription/manual-payment',
          submitLabel: 'Record payment',
          successMessage: 'Subscription payment recorded',
          fields: [
            { name: 'reference', label: 'Bank reference', placeholder: 'e.g. EFT-2026-0142', help: 'Receipt quoting happens against the tenant.' },
            { name: 'amount', label: 'Amount (optional)', type: 'number', placeholder: 'Leave blank to pay the invoice as issued' },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
          ]
        });
        return;
      }
      if (name === 'paymentAccount') {
        const account = (ctx.page && ctx.page.paymentAccount) || {};
        const payout = account.payout || {};
        ctx.openModal({
          title: 'Tenant fee collection',
          description: 'Choose where this tenant’s parent payments go. Platform collection takes the fee and settles to the tenant by EFT; own PayFast pays the tenant directly and takes no fee. Credentials are stored encrypted and never shown again.',
          endpoint: '/platform/organisations/' + encodeURIComponent(org.id) + '/payment-account',
          method: 'PUT',
          submitLabel: 'Save account',
          successMessage: 'Payment account saved',
          size: 'wide',
          fields: [
            { name: 'mode', label: 'Collection mode', type: 'select', value: account.mode || 'platform_collected',
              options: [
                { value: 'platform_collected', label: 'Platform collects (settle by EFT)' },
                { value: 'own_payfast', label: 'Tenant’s own PayFast account' }
              ] },
            { name: 'feePercent', label: 'Collection fee (%)', type: 'number', value: account.feePercent !== undefined ? account.feePercent : 0, help: 'Deducted from each payout when the platform collects. 0–50.' },
            { name: 'merchantId', label: 'Merchant id', value: account.merchantId || '', placeholder: 'Only for the tenant’s own account' },
            { name: 'merchantKey', label: 'Merchant key', placeholder: account.merchantKeySet ? 'Currently saved — enter to replace' : 'Only for the tenant’s own account' },
            { name: 'passphrase', label: 'Passphrase', help: account.passphraseSet ? 'Currently saved. Enter a new value or leave blank to keep it.' : 'Only if the tenant’s PayFast account sets one.' },
            { name: 'clearCredentials', label: 'Forget stored credentials', type: 'checkbox', value: false, help: 'Drops the saved key and passphrase. Does not change the mode.' },
            { name: 'payoutAccountHolder', label: 'Payout account holder', value: payout.accountHolder || '' },
            { name: 'payoutBankName', label: 'Payout bank', value: payout.bankName || '' },
            { name: 'payoutBranchCode', label: 'Branch code', value: payout.branchCode || '' },
            { name: 'payoutAccountNumber', label: 'Account number', placeholder: payout.accountNumberLast4 ? 'Currently •••• ' + payout.accountNumberLast4 + ' — re-enter to change' : 'Tenant’s settlement account', help: 'Encrypted at rest; used only if the platform collects.' },
            { name: 'payoutAccountType', label: 'Account type', type: 'select', value: payout.accountType || 'cheque',
              options: [
                { value: 'cheque', label: 'Current / cheque' },
                { value: 'savings', label: 'Savings' },
                { value: 'transmission', label: 'Transmission' },
                { value: 'bond', label: 'Bond' }
              ] }
          ]
        });
      }
    },
  };

  V.platformSubscriptions = {
    async load(ctx) {
      const filters = ctx.filters || {};
      const params = [];
      if (filters.scopeOrg) params.push('orgId=' + encodeURIComponent(filters.scopeOrg));
      if (filters.scopePlan) params.push('planId=' + encodeURIComponent(filters.scopePlan));
      if (filters.scopeFrom) params.push('from=' + encodeURIComponent(filters.scopeFrom));
      if (filters.scopeTo) params.push('to=' + encodeURIComponent(filters.scopeTo));
      const qs = params.length ? '?' + params.join('&') : '';
      const [subscriptions, organisations] = await Promise.all([
        R.api('GET', '/platform/subscriptions' + qs),
        R.api('GET', '/platform/organisations?pageSize=100' +
          (filters.orgQuery ? '&q=' + encodeURIComponent(filters.orgQuery) : ''))
      ]);
      return {
        data: subscriptions.data, organisations: organisations.data || [],
        orgTotal: (organisations.meta && organisations.meta.total) || ((organisations.data || []).length)
      };
    },
    render(ctx, params, page) {
      const d = page.data || {};
      const plans = d.plans || [], subs = d.subscriptions || [], invoices = d.invoices || [];
      const activity = d.activity || [], setupFees = d.setupFees || [];
      const canSubs = ctx.has('platform.subscriptions.manage');
      const canOrg = ctx.has('platform.organisations.manage');
      const canAudit = ctx.has('platform.audit.read');
      const filters = ctx.filters || {};
      const tab = filters.subTab || 'overview';
      const scopeOrg = filters.scopeOrg || '', scopePlan = filters.scopePlan || '';
      const scopeFrom = filters.scopeFrom || '', scopeTo = filters.scopeTo || '';
      const scoped = Boolean(scopeOrg || scopePlan || scopeFrom || scopeTo);

      const today = new Date();
      const day = today.toISOString().slice(0, 10);
      const soon = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
      const expiring = subs.filter((row) => row.status === 'trial' && row.current_period_end >= day && row.current_period_end <= soon);
      const pastDue = subs.filter((row) => row.status === 'past_due');
      const aged = (low, high) => pastDue.filter((row) => {
        const days = Math.floor((today - new Date(row.current_period_end + 'T00:00:00Z')) / 86400000);
        return days >= low && days < high;
      }).length;
      const limitState = (row) => {
        const pairs = [[row.learner_count, row.max_learners], [row.staff_count, row.max_staff], [row.storage_bytes, row.max_storage_bytes]];
        let worst = 'ok';
        pairs.forEach(([used, max]) => {
          if (Number(max) > 0 && Number(used || 0) >= Number(max)) worst = 'over';
          else if (Number(max) > 0 && Number(used || 0) >= Number(max) * 0.9 && worst !== 'over') worst = 'near';
        });
        return worst;
      };
      const nearLimit = subs.filter((row) => limitState(row) === 'near');
      const overLimit = subs.filter((row) => limitState(row) === 'over');
      const mrrByCurrency = d.mrrByCurrency || [];
      const singleCurrency = Boolean(d.singleCurrency);
      const activeCount = subs.filter((row) => row.status === 'active').length;

      const orgOptions = (page.organisations || []).map((org) => ({
        value: org.id, label: org.name + ' · ' + org.slug
      }));
      const planOptions = plans.map((p) => ({ value: p.id, label: p.name + ' · ' + p.plan_key }));
      const scopeBanner = '<div class="sub-scope' + (scoped ? ' is-scoped' : '') + '">' +
        '<span class="sub-scope-label">' + R.icon(scoped ? 'filter' : 'globe') + ' ' +
          (scoped ? 'Scoped view' : 'All tenants') + '</span>' +
        '<select class="select" aria-label="Scope by organisation" @change="setFilter(\'scopeOrg\',$event.target.value)">' +
          '<option value="">All organisations</option>' +
          orgOptions.map((o) => '<option value="' + R.attr(o.value) + '"' + (scopeOrg === o.value ? ' selected' : '') + '>' + R.esc(o.label) + '</option>').join('') +
        '</select>' +
        '<input class="input" type="search" placeholder="Find an organisation…" value="' + R.attr(filters.orgQuery || '') + '" @input.debounce.350ms="setFilter(\'orgQuery\',$event.target.value)">' +
        '<select class="select" aria-label="Scope by plan" @change="setFilter(\'scopePlan\',$event.target.value)">' +
          '<option value="">All plans</option>' +
          planOptions.map((o) => '<option value="' + R.attr(o.value) + '"' + (scopePlan === o.value ? ' selected' : '') + '>' + R.esc(o.label) + '</option>').join('') +
        '</select>' +
        '<label>From <input class="input" type="date" value="' + R.attr(scopeFrom) + '" @change="setFilter(\'scopeFrom\',$event.target.value)"></label>' +
        '<label>To <input class="input" type="date" value="' + R.attr(scopeTo) + '" @change="setFilter(\'scopeTo\',$event.target.value)"></label>' +
        (scoped ? '<button type="button" class="btn btn-sm btn-ghost" @click="clearSubscriptionScope()">' + R.icon('x') + ' Clear scope</button>' : '') +
        '<span class="muted small">' + R.number(subs.length) + ' subscriptions</span>' +
      '</div>';

      const tabsHtml = '<div class="tabs sub-tabs">' + [
        { key: 'overview', label: 'Overview', icon: 'activity' },
        { key: 'tenants', label: 'Tenants', icon: 'building-2' },
        { key: 'plans', label: 'Plans', icon: 'layers' },
        { key: 'billing', label: 'Billing', icon: 'receipt' },
        { key: 'activity', label: 'Activity', icon: 'history' }
      ].map((item) => '<button class="tab' + (tab === item.key ? ' active' : '') + '" @click="setFilter(\'subTab\',\'' + item.key + '\')">' +
        R.icon(item.icon) + ' ' + item.label + '</button>').join('') + '</div>';

      const moneyCell = (amount, currency) => R.money(amount, currency || (singleCurrency ? mrrByCurrency[0].currency : 'ZAR'));
      const mrrLabel = singleCurrency ? R.money(d.mrr, mrrByCurrency[0].currency) : mrrByCurrency.map((row) => R.money(row.amount, row.currency)).join(' + ');
      const mrrNote = singleCurrency ? 'Normalised monthly · ' + activeCount + ' paying tenants'
        : 'Split by currency — totals are never mixed';

      const overview = '<div class="grid grid-3 section">' +
        R.statCard({ label: 'Monthly recurring', value: mrrLabel, icon: 'credit-card', foot: mrrNote }) +
        R.statCard({ label: 'Active plans', value: R.number(plans.filter((p) => p.status === 'active').length), icon: 'layers', tone: 'sky', foot: plans.length + ' in catalogue' }) +
        R.statCard({ label: 'Trials', value: R.number(subs.filter((row) => row.status === 'trial').length), icon: 'hourglass', tone: 'plum', foot: expiring.length + ' ending within 7 days' }) +
        (overLimit.length ? R.statCard({ label: 'Over limit', value: R.number(overLimit.length), icon: 'alert-triangle', tone: 'danger', foot: 'Tenants past a plan limit' }) : '') +
        '</div>' +
        (mrrByCurrency.length > 1 ? '<div class="card sub-currency-card"><h3>Revenue by currency</h3>' +
          mrrByCurrency.map((row) => '<div class="kpi-row"><span class="kpi-label">' + R.esc(row.currency) + ' · ' + row.tenants + ' tenants</span><span class="kpi-value">' + R.money(row.amount, row.currency) + '</span></div>').join('') + '</div>' : '') +
        '<div class="grid grid-2 section">' +
        R.card('Risk and health', '<div class="sub-risk-grid">' +
          '<div class="sub-risk"><span class="sub-risk-value">' + expiring.length + '</span><span class="muted small">Trials ending in 7 days</span></div>' +
          '<div class="sub-risk"><span class="sub-risk-value">' + nearLimit.length + '</span><span class="muted small">Near or over plan limits</span></div>' +
          '<div class="sub-risk"><span class="sub-risk-value">' + aged(0, 7) + '</span><span class="muted small">Past due under 7 days</span></div>' +
          '<div class="sub-risk"><span class="sub-risk-value">' + aged(7, 30) + '</span><span class="muted small">Past due 7–30 days</span></div>' +
          '<div class="sub-risk"><span class="sub-risk-value">' + aged(30, 36500) + '</span><span class="muted small">Past due over 30 days</span></div>' +
          '</div>') +
        R.card('Revenue by plan', mrrByCurrency.length ? '<div class="sub-mrr-list">' + plans.map((p) => {
          const value = subs.filter((row) => row.plan_id === p.id && row.status === 'active')
            .reduce((sum, row) => sum + Number(row.monthly_price || 0), 0);
          const max = Math.max(1, ...plans.map((p2) => subs.filter((row) => row.plan_id === p2.id && row.status === 'active').reduce((s, row) => s + Number(row.monthly_price || 0), 0)));
          const pct = value > 0 ? Math.max(3, Math.round(value / max * 100)) : 0;
          const tenants = subs.filter((row) => row.plan_id === p.id && row.status === 'active').length;
          return '<button type="button" class="sub-mrr-row' + (value > 0 ? '' : ' is-empty') + '" title="Scope to ' + R.attr(p.name) + '" @click="setFilter(\'scopePlan\',\'' + R.attr(p.id) + '\')">' +
            '<span class="sub-mrr-name">' + R.esc(p.name) + (value > 0 ? '<small>' + tenants + ' paying tenant' + (tenants === 1 ? '' : 's') + '</small>' : '') + '</span>' +
            '<span class="sub-mrr-track"><span class="sub-mrr-bar" style="width:' + pct + '%"></span></span>' +
            '<strong>' + R.money(value, p.currency) + '</strong></button>';
        }).join('') + '</div>' : '<p class="muted small">No active revenue in this scope.</p>') +
        '</div>';

      const q = String(filters.subQ || '').trim().toLowerCase();
      const statusFilter = filters.subStatus || '';
      const periodFilter = filters.subPeriod || '';
      let rows = subs.filter((row) => {
        if (q && !String(row.organisation_name || '').toLowerCase().includes(q) && !String(row.plan_name || '').toLowerCase().includes(q)) return false;
        if (statusFilter && row.status !== statusFilter) return false;
        if (periodFilter && row.billing_period !== periodFilter) return false;
        return true;
      });
      const pageSize = 10;
      const pageNum = Math.max(1, Number(filters.subPage) || 1);
      const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      const currentPage = Math.min(pageNum, totalPages);
      const shown = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      const pager = totalPages > 1 ? '<div class="sub-pager"><span class="muted small">Page ' + currentPage + ' of ' + totalPages + '</span>' +
        '<button type="button" class="btn btn-sm btn-ghost" ' + (currentPage <= 1 ? 'disabled' : '') + ' @click="setFilter(\'subPage\',' + (currentPage - 1) + ')">' + R.icon('chevron-left') + ' Previous</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" ' + (currentPage >= totalPages ? 'disabled' : '') + ' @click="setFilter(\'subPage\',' + (currentPage + 1) + ')">Next ' + R.icon('chevron-right') + '</button></div>' : '';
      const bulk = canOrg ? R.bulkBar([
        { label: 'Assign plan', icon: 'user-plus', modal: 'bulkAssignPlan' },
        { label: 'Suspend', icon: 'ban', modal: 'bulkSuspend' },
        { label: 'Restore', icon: 'rotate-ccw', path: '/platform/organisations/bulk', action: 'restore' }
      ], { hint: 'Suspending a centre revokes all sessions across every branch.' }) : '';
      const subColumns = [
        { label: 'Organisation', render: (row) => '<a class="cell-strong" href="#/platform/organisations/' + R.attr(row.organisation_id) + '">' + R.esc(row.organisation_name) + '</a><span class="cell-sub">' + R.esc(row.plan_name || 'No plan') + '</span>' },
        { label: 'Status', render: (row) => R.badge(row.status) +
          (overLimit.includes(row) ? ' <span class="badge badge-danger">Over limit</span>' : nearLimit.includes(row) ? ' <span class="badge badge-sun">Near limit</span>' : '') },
        { label: 'Entitlements', render: (row) => {
          const learners = Number(row.learner_count || 0), maxL = Number(row.max_learners || 0);
          const staff = Number(row.staff_count || 0), maxS = Number(row.max_staff || 0);
          const cell = (value, max) => value + (max > 0 ? ' / ' + max : ' / ∞');
          const maxStorage = Number(row.max_storage_bytes || 0);
          return '<span class="cell-sub">Learners ' + cell(learners, maxL) + '</span><span class="cell-sub">Staff ' + cell(staff, maxS) + '</span>' +
            '<span class="cell-sub">Storage ' + storageLabel(row.storage_bytes) + (maxStorage ? ' / ' + storageLabel(maxStorage) : ' / ∞') + '</span>' +
            '<span class="cell-sub">' + R.number(row.branch_count || 0) + ' branch' + (Number(row.branch_count) === 1 ? '' : 'es') + '</span>';
        } },
        { label: 'Billing', render: (row) => R.esc(R.titleCase(row.billing_period)) + '<span class="cell-sub">' + row.billing_period + ' contract</span>' },
        { label: 'Renews', render: (row) => R.date(row.current_period_end) },
        { label: 'Normalised MRR', align: 'right', render: (row) => R.money(row.monthly_price, row.plan_currency || row.organisation_currency) },
        { label: 'Actions', align: 'right', render: (row) => {
          if (!canSubs) return '';
          return '<div class="btn-group" style="flex-wrap:nowrap">' +
            '<button class="btn btn-sm btn-secondary" @click="openNamedDetail(\'subscription\',\'' + R.attr(row.id) + '\')">Manage</button>' +
            '<button class="btn btn-sm btn-ghost" title="Online payment link" @click="billSubscription(\'' + R.attr(row.organisation_id) + '\',\'' + R.attr(row.billing_period || 'monthly') + '\')">' + R.icon('link') + '</button>' +
            '<button class="btn btn-sm btn-ghost" title="Record payment" @click="openNamedModal(\'manualSubscriptionPayment\',' + R.attr(JSON.stringify(row.organisation_id)) + ')">' + R.icon('banknote') + '</button>' +
            '</div>';
        } }
      ];
      const tenants = R.card('Tenant subscriptions', bulk + R.filterBar(
        R.searchFilter(ctx, 'subQ', 'Search organisation or plan…') +
        R.selectFilter(ctx, 'subStatus', [
          { value: 'trial', label: 'Trial' }, { value: 'active', label: 'Active' },
          { value: 'past_due', label: 'Past due' }, { value: 'cancelled', label: 'Cancelled' }
        ], 'All statuses') +
        R.selectFilter(ctx, 'subPeriod', [{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }], 'All billing')
      ) + R.table({ rows: shown, columns: subColumns, selectable: canOrg,
        emptyTitle: 'No matching subscriptions', emptyMessage: 'Try a different search or filter.' }) + pager);

      const activePlans = plans.filter((p) => p.status === 'active');
      const planCard = (p) => '<div class="plan-card ' + (p.status === 'archived' ? 'archived' : '') + '">' +
        '<div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="cell-strong" style="font-size:1rem">' + R.esc(p.name) + '</div><div class="cell-sub mono">' + R.esc(p.plan_key) + '</div></div>' + R.badge(p.status) + '</div>' +
        '<div class="plan-price">' + R.money(p.monthly_price, p.currency) + '<span> /month</span></div>' +
        '<div class="muted small">' + R.esc(p.description || 'No description yet.') + '</div>' +
        '<div class="muted small" style="margin-top:6px">Base price · annual is charged as 12 months upfront · PayFast fees added at checkout.</div>' +
        '<div class="kpi-list">' +
        '<div class="kpi-row"><span class="kpi-label">Learner limit</span><span class="kpi-value">' + (p.max_learners ? R.number(p.max_learners) : 'Unlimited') + '</span></div>' +
        '<div class="kpi-row"><span class="kpi-label">Staff limit</span><span class="kpi-value">' + (p.max_staff ? R.number(p.max_staff) : 'Unlimited') + '</span></div>' +
        '<div class="kpi-row"><span class="kpi-label">Storage limit</span><span class="kpi-value">' + storageLabel(p.max_storage_bytes) + '</span></div>' +
        '<button type="button" class="kpi-row kpi-link" @click="setFilter(\'scopePlan\',\'' + R.attr(p.id) + '\')">' +
          '<span class="kpi-label">Active tenants →</span><span class="kpi-value">' + R.number(p.tenant_count || 0) + '</span></button></div>' +
        ((p.features || []).length ? '<div class="plan-features">' + (p.features || []).map((f) => '<span class="badge badge-muted">' + R.esc(R.titleCase(String(f).replace(/_/g, ' '))) + '</span>').join('') + '</div>' : '') +
        (canSubs ? '<div class="plan-actions">' +
          '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'editPlan\',' + R.attr(JSON.stringify(p.id)) + ')">' + R.icon('pencil') + ' Edit</button>' +
          '<button class="btn btn-sm ' + (p.status === 'archived' ? 'btn-secondary' : 'btn-ghost') + '" @click="act(\'PATCH\',\'/platform/plans/' + R.attr(p.id) + '\',{status:\'' + (p.status === 'archived' ? 'active' : 'archived') + '\'},{successMessage:\'Plan ' + (p.status === 'archived' ? 'restored' : 'archived') + '\'})">' + R.icon(p.status === 'archived' ? 'rotate-ccw' : 'archive') + ' ' + (p.status === 'archived' ? 'Restore' : 'Archive') + '</button>' +
          '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'assignPlan\')">' + R.icon('user-plus') + ' Assign</button>' +
          '</div>' : '') + '</div>';
      const plansView = R.card('Plan catalogue', '<div class="plan-grid">' + plans.map(planCard).join('') + '</div>',
        canSubs ? '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'newPlan\')">' + R.icon('plus') + ' New plan</button>' : '');

      const invoiceColumns = [
        { label: 'Invoice', render: (inv) => '<span class="cell-strong mono">' + R.esc(inv.invoice_number) + '</span><span class="cell-sub">' + R.esc(inv.organisation_name || '') + '</span>' },
        { label: 'Amount', align: 'right', render: (inv) => R.money(inv.amount, inv.currency || inv.organisation_currency) },
        { label: 'Period', render: (inv) => R.date(inv.period_start) + ' → ' + R.date(inv.period_end) },
        { label: 'Status', render: (inv) => R.badge(inv.status) + (inv.refunded_at ? ' <span class="badge badge-sun">Refunded</span>' : '') },
        { label: 'Paid / voided', render: (inv) => inv.paid_at ? '<span class="cell-strong">Paid ' + R.date(inv.paid_at) + '</span><span class="cell-sub">' + R.esc(inv.paid_by_name || 'Platform') + '</span>'
          : inv.voided_at ? '<span class="cell-sub">Voided by ' + R.esc(inv.voided_by_name || 'Platform') + '</span>' : '<span class="muted">—</span>' },
        { label: 'Due', render: (inv) => R.date(inv.due_at) },
        { label: '', align: 'right', render: (inv) => canSubs ? '<div class="btn-group" style="flex-wrap:nowrap">' +
          (inv.status === 'issued' ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'confirmMoney\',\'' + R.attr(inv.id) + '|mark-paid|' + R.attr(inv.invoice_number) + '\')">Mark paid</button>' +
            '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'confirmMoney\',\'' + R.attr(inv.id) + '|void|' + R.attr(inv.invoice_number) + '\')">Void</button>' : '') +
          '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'recordRefund\',\'' + R.attr(inv.id) + '\')">Refund</button></div>' : '' }
      ];
      const invoiceCount = Number(d.invoiceCount || 0);
      const billing = R.card('Subscription invoices',
        '<div class="sub-count-note">Showing ' + R.number(invoices.length) + ' of ' + R.number(invoiceCount) + ' matching invoices' +
          (invoiceCount > invoices.length ? ' — narrow the scope or date range to see more.' : '.') + '</div>' +
        R.table({ rows: invoices, columns: invoiceColumns, emptyTitle: 'No invoices in this scope', emptyMessage: 'Widen the scope or date range, or assign a plan to begin billing.' }),
        canAudit ? '<a class="btn btn-sm btn-ghost" href="#/platform/audit">' + R.icon('history') + ' Full audit trail</a>' : '');

      const activityCount = Number(d.activityCount || 0);
      const activityView = R.card('Billing activity',
        '<div class="sub-count-note">Showing ' + R.number(activity.length) + ' of ' + R.number(activityCount) + ' matching events.</div>' +
        (activity.length ? '<div class="sub-activity">' + activity.map((event) => '<div class="sub-activity-row">' +
          '<span class="cell-strong">' + R.esc(R.titleCase(String(event.action).replace(/^platform\./, '').replace(/[._]/g, ' '))) + '</span>' +
          '<span class="muted small">' + R.esc(event.actor_name || 'System') + (event.organisation_id ? ' · ' + R.esc(event.organisation_id) : '') + '</span>' +
          '<span class="muted small">' + R.relative(event.occurred_at) + '</span></div>').join('') + '</div>'
          : '<p class="muted small">No billing activity in this scope.</p>'),
        canAudit ? '<a class="btn btn-sm btn-ghost" href="#/platform/audit">' + R.icon('history') + ' Full audit trail</a>' : '');

      const toolActions = (canSubs ? '<button type="button" class="btn btn-secondary btn-sm" @click="act(\'POST\',\'/platform/subscriptions/sweep\',{},{successMessage:\'Billing sweep complete\'})">' + R.icon('refresh-cw') + ' Run billing sweep</button>' : '') +
        (canSubs ? '<button type="button" class="btn btn-secondary btn-sm" @click="openNamedModal(\'newPlan\')">' + R.icon('plus') + ' New plan</button>' : '') +
        '<a class="btn btn-secondary btn-sm" href="#/platform/organisations">' + R.icon('building-2') + ' Organisations</a>';
      const content = tab === 'tenants' ? tenants
        : tab === 'plans' ? plansView
          : tab === 'billing' ? billing
            : tab === 'activity' ? activityView : overview;
      return R.pageHead('Subscriptions', 'Plans, tenant billing state and monthly recurring revenue.', toolActions) +
        scopeBanner + tabsHtml + content;
    },
    detail(ctx, name, id) {
      if (name !== 'subscription') return null;
      const d = (ctx.page && ctx.page.data) || {};
      const row = (d.subscriptions || []).find((entry) => entry.id === id);
      if (!row) return { title: 'Subscription', html: '<p class="muted">Subscription not found.</p>' };
      const fee = (d.setupFees || []).find((entry) => entry.organisation_id === row.organisation_id);
      const canSubs = ctx.has('platform.subscriptions.manage');
      const actions = canSubs ? '<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:14px">' +
        '<button type="button" class="btn btn-sm btn-secondary" @click="openNamedModal(\'extendTrial\',\'' + R.attr(row.id) + '\')">' + R.icon('calendar-plus') + ' Extend trial / period</button>' +
        '<button type="button" class="btn btn-sm btn-secondary" @click="openNamedModal(\'confirmMoney\',\'' + R.attr(row.id) + '|waive|' + R.attr(row.organisation_name) + '\')">' + R.icon('gift') + ' Waive fee</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" @click="openNamedModal(\'confirmMoney\',\'' + R.attr(row.id) + '|cancel|' + R.attr(row.organisation_name) + '\')">' + R.icon('ban') + ' Cancel</button>' +
        (fee && fee.status !== 'paid' && fee.status !== 'waived' ? '<button type="button" class="btn btn-sm btn-secondary" @click="openNamedModal(\'setupFeePayment\',\'' + R.attr(row.organisation_id) + '\')">' + R.icon('banknote') + ' Setup fee</button>' : '') +
        '</div>' : '';
      return {
        title: row.organisation_name + ' — subscription',
        html: '<div class="detail-list">' +
          R.detailItem('Plan', R.esc(row.plan_name || 'No plan') + ' · ' + R.esc(row.plan_currency || row.organisation_currency || 'ZAR')) +
          R.detailItem('Status', R.badge(row.status)) +
          R.detailItem('Billing', R.esc(R.titleCase(row.billing_period)) + ' · ' + row.billing_period + ' contract') +
          R.detailItem('Current period', R.date(row.current_period_start) + ' → ' + R.date(row.current_period_end)) +
          R.detailItem('Normalised monthly', R.money(row.monthly_price, row.plan_currency || row.organisation_currency)) +
          R.detailItem('Entitlements', 'Learners ' + (row.learner_count || 0) + '/' + (row.max_learners || '∞') + ' · Staff ' + (row.staff_count || 0) + '/' + (row.max_staff || '∞')) +
          R.detailItem('Storage used', storageLabel(row.storage_bytes) + (row.max_storage_bytes ? ' / ' + storageLabel(row.max_storage_bytes) : ' / Unlimited')) +
          R.detailItem('Branches', R.number(row.branch_count || 0)) +
          R.detailItem('Setup fee', fee ? R.esc(R.titleCase(fee.status)) + ' · ' + R.money(fee.amount, row.organisation_currency) : 'None') +
          '</div>' + actions +
          '<div class="section"></div><button type="button" class="btn btn-sm btn-ghost" @click="setFilter(\'scopeOrg\',\'' + R.attr(row.organisation_id) + '\'); closeModal()">' + R.icon('filter') + ' Scope console to this tenant</button>' +
          '<a class="btn btn-sm btn-ghost" href="#/platform/organisations/' + R.attr(row.organisation_id) + '">' + R.icon('external-link') + ' Open organisation</a>'
      };
    },
    openModal(ctx, name, id) {
      const page = ctx.page || {};
      const data = page.data || {};
      const plans = data.plans || [];
      const subs = data.subscriptions || [];
      const organisations = page.organisations || [];
      if (name === 'manualSubscriptionPayment' && id) {
        const subscription = subs.find((entry) => entry.organisation_id === id);
        ctx.openModal({
          title: 'Record subscription payment — ' + (subscription ? subscription.organisation_name : 'tenant'),
          description: 'Records an EFT: marks the current invoice paid and extends the subscription by one period. Leave the amount blank to pay the invoice as issued.',
          endpoint: '/platform/organisations/' + encodeURIComponent(id) + '/subscription/manual-payment',
          submitLabel: 'Record payment', successMessage: 'Subscription payment recorded',
          fields: [
            { name: 'reference', label: 'Bank reference', placeholder: 'e.g. EFT-2026-0142' },
            { name: 'amount', label: 'Amount (optional)', type: 'number', placeholder: 'Leave blank to pay the invoice as issued' },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
          ]
        });
        return;
      }
      if (name === 'confirmMoney' && id) {
        const [resourceId, action, label] = String(id).split('|');
        const meta = {
          cancel: { title: 'Cancel subscription', label: 'subscription', endpoint: '/platform/subscriptions/' + resourceId + '/cancel', submit: 'Cancel subscription' },
          waive: { title: 'Waive this period', label: 'invoice', endpoint: '/platform/subscriptions/' + resourceId + '/waive', submit: 'Waive fee' },
          void: { title: 'Void invoice', label: 'invoice', endpoint: '/platform/subscription-invoices/' + resourceId + '/void', submit: 'Void invoice' },
          'mark-paid': { title: 'Mark invoice paid', label: 'invoice', endpoint: '/platform/subscription-invoices/' + resourceId + '/mark-paid', submit: 'Mark paid' }
        }[action];
        if (!meta) return;
        ctx.openModal({
          title: meta.title + ' — ' + (label || ''),
          descriptionHtml: '<p class="muted small">This changes billing state immediately and is recorded in the platform audit trail. Type <strong>' + R.esc(label) + '</strong> to confirm.</p>',
          endpoint: meta.endpoint, method: 'POST', submitLabel: meta.submit,
          successMessage: meta.title + ' complete', confirmText: label,
          fields: [{ name: 'confirmation', label: 'Type “' + label + '” to confirm', required: true, span: 2 }]
        });
        return;
      }
      if (name === 'bulkAssignPlan') {
        ctx.openModal({
          title: 'Assign a plan to selected centres',
          description: 'Each selected organisation gets the chosen plan and a fresh 30-day period.',
          submitLabel: 'Assign plan', successMessage: 'Plans assigned',
          fields: [
            { name: 'planId', label: 'Plan', type: 'select', required: true, options: plans.filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name + ' · ' + R.money(p.monthly_price, p.currency) + '/mo' })) },
            { name: 'billingPeriod', label: 'Billing period', type: 'select', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }], value: 'monthly' }
          ],
          async onSubmit(body) {
            await R.api('POST', '/platform/organisations/bulk', {
              ids: (ctx.selectedIds || []).slice(), action: 'assign_plan',
              planId: body.planId, billingPeriod: body.billingPeriod
            });
            ctx.clearSelection(); await ctx.navigate(true);
          }
        });
        return;
      }
      if (name === 'bulkSuspend') {
        ctx.openModal({
          title: 'Suspend selected centres',
          descriptionHtml: '<p class="muted small">Suspension revokes <strong>every session in every branch</strong> of the selected centres immediately.</p>',
          submitLabel: 'Suspend', successMessage: 'Centres suspended',
          fields: [{ name: 'reason', label: 'Reason', required: true, span: 2, placeholder: 'e.g. Non-payment after 60 days' }],
          async onSubmit(body) {
            await R.api('POST', '/platform/organisations/bulk', { ids: (ctx.selectedIds || []).slice(), action: 'suspend', reason: body.reason });
            ctx.clearSelection(); await ctx.navigate(true);
          }
        });
        return;
      }
      if (name === 'extendTrial' && id) {
        ctx.openModal({
          title: 'Extend a subscription period', endpoint: '/platform/subscriptions/' + encodeURIComponent(id) + '/period',
          method: 'POST', submitLabel: 'Extend period', successMessage: 'Period updated',
          fields: [
            { name: 'extendDays', label: 'Extend by (days)', type: 'number', min: 1, max: 3650, value: 30 },
            { name: 'currentPeriodEnd', label: 'Or set an exact end date', type: 'date', help: 'Leave blank to use the number of days above.' }
          ],
          transform(data) {
            if (data.currentPeriodEnd) return { currentPeriodEnd: data.currentPeriodEnd };
            return { extendDays: Number(data.extendDays) || 30 };
          }
        });
        return;
      }
      if (name === 'recordRefund' && id) {
        ctx.openModal({
          title: 'Record a refund', endpoint: '/platform/subscription-invoices/' + encodeURIComponent(id) + '/refund',
          method: 'POST', submitLabel: 'Record refund', successMessage: 'Refund recorded',
          description: 'Records a refund against this invoice in the platform audit trail.',
          fields: [
            { name: 'reference', label: 'Payment / refund reference', placeholder: 'e.g. REF-1234' },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
          ]
        });
        return;
      }
      if (name === 'setupFeePayment' && id) {
        ctx.openModal({
          title: 'Record setup fee payment', endpoint: '/platform/organisations/' + encodeURIComponent(id) + '/setup-fee/manual-payment',
          method: 'POST', submitLabel: 'Record payment', successMessage: 'Setup fee payment recorded',
          fields: [
            { name: 'reference', label: 'Bank reference', placeholder: 'e.g. EFT-2026-0142' },
            { name: 'amount', label: 'Amount (optional)', type: 'number', placeholder: 'Leave blank for the full fee' },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
          ]
        });
        return;
      }
      if (name === 'newPlan' || name === 'editPlan') {
        const plan = name === 'editPlan' ? plans.find((p) => p.id === id) : null;
        if (name === 'editPlan' && !plan) { ctx.toast('That plan could not be found.', 'warn'); return; }
        ctx.openModal({
          title: plan ? 'Edit ' + plan.name : 'Create a subscription plan',
          description: plan ? 'Price, limits and features are read live from this catalogue. Saving a change affects existing tenants on their next invoice or upgrade — there is no price lock.' : 'Plans define price, limits and the features a tenant can use.',
          endpoint: plan ? '/platform/plans/' + encodeURIComponent(plan.id) : '/platform/plans',
          method: plan ? 'PATCH' : 'POST', submitLabel: plan ? 'Save plan' : 'Create plan',
          successMessage: plan ? 'Plan updated' : 'Plan created', size: 'wide',
          fields: [
            { name: 'name', label: 'Plan name', required: true, value: plan ? plan.name : '' },
            { name: 'planKey', label: 'Plan key', required: true, value: plan ? plan.plan_key : '', help: 'Lowercase letters, numbers and hyphens.' },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, value: plan ? (plan.description || '') : '' },
            { name: 'monthlyPrice', label: 'Monthly price', type: 'number', min: 0, step: '0.01', required: true, value: plan ? plan.monthly_price : 0 },
            { name: 'currency', label: 'Currency', type: 'select', options: ['ZAR'], value: 'ZAR', help: 'PayFast settles in South African rand. Online checkout cannot charge other currencies.' },
            { name: 'maxLearners', label: 'Learner limit', type: 'number', min: 0, value: plan ? plan.max_learners : 50, help: '0 means unlimited' },
            { name: 'maxStaff', label: 'Staff limit', type: 'number', min: 0, value: plan ? plan.max_staff : 10, help: '0 means unlimited' },
            { name: 'maxStorageGb', label: 'Storage limit (GB)', type: 'number', min: 0, step: '0.001', value: plan ? Math.round(Number(plan.max_storage_bytes || 0) / (1024 * 1024 * 1024) * 1000) / 1000 : 5, help: 'Uploaded files and media. 0 means unlimited.' },
            { name: 'features', label: 'Features', type: 'textarea', span: 2, value: plan ? (plan.features || []).join(', ') : 'attendance, assessments, parent_portal, finance', help: 'Comma-separated feature keys.' },
            { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }], value: plan ? plan.status : 'active' }
          ],
          transform(data) {
            return {
              name: data.name, planKey: String(data.planKey || '').trim().toLowerCase(),
              description: data.description || null, monthlyPrice: Number(data.monthlyPrice) || 0,
              currency: (data.currency || 'ZAR').toUpperCase(), maxLearners: Number(data.maxLearners) || 0,
              maxStaff: Number(data.maxStaff) || 0, maxStorageGb: Number(data.maxStorageGb) || 0,
              features: String(data.features || '').split(',').map((f) => f.trim()).filter(Boolean),
              status: data.status || 'active'
            };
          }
        });
        return;
      }
      if (name === 'assignPlan') {
        ctx.openModal({
          title: 'Assign a subscription plan',
          description: 'The current subscription is cancelled and replaced. The tenant sees the new limits immediately.',
          submitLabel: 'Assign plan', successMessage: 'Subscription assigned',
          fields: [
            { name: 'organisationId', label: 'Organisation', type: 'select', required: true, options: organisations.map((o) => ({ value: o.id, label: o.name + ' · ' + o.slug })) },
            { name: 'planId', label: 'Plan', type: 'select', required: true, options: plans.filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name + ' · ' + R.money(p.monthly_price, p.currency) + '/mo' })) },
            { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'trial', label: 'Trial' }, { value: 'past_due', label: 'Past due' }], value: 'active' },
            { name: 'billingPeriod', label: 'Billing period', type: 'select', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }], value: 'monthly' },
            { name: 'trialDays', label: 'Days in period', type: 'number', min: 1, max: 3650, value: 30 },
            { name: 'currentPeriodStart', label: 'Period start', type: 'date' },
            { name: 'currentPeriodEnd', label: 'Period end (override)', type: 'date' }
          ],
          async onSubmit(body) {
            const payload = {
              planId: body.planId, status: body.status, billingPeriod: body.billingPeriod,
              currentPeriodStart: body.currentPeriodStart || undefined,
              currentPeriodEnd: body.currentPeriodEnd || undefined
            };
            if (!payload.currentPeriodEnd) {
              const start = payload.currentPeriodStart || new Date().toISOString().slice(0, 10);
              const end = new Date(start + 'T00:00:00Z');
              end.setUTCDate(end.getUTCDate() + (Number(body.trialDays) || 30));
              payload.currentPeriodEnd = end.toISOString().slice(0, 10);
            }
            await R.api('POST', '/platform/organisations/' + encodeURIComponent(body.organisationId) + '/subscription', payload);
          }
        });
      }
    }
  };

  V.platformSettlements = {
    async load(ctx) {
      const [settlements, payouts] = await Promise.allSettled([
        R.api('GET', '/platform/settlements'),
        R.api('GET', '/platform/settlements/payouts')
      ]);
      return {
        settlements: settlements.status === 'fulfilled' ? settlements.value.data : { rows: [], totalOutstanding: 0 },
        payouts: payouts.status === 'fulfilled' ? payouts.value.data : []
      };
    },
    render(ctx, params, page) {
      const settlements = page.settlements || { rows: [], totalOutstanding: 0 };
      const rows = settlements.rows || [];
      const total = Number(settlements.totalOutstanding || 0);
      const payouts = page.payouts || [];
      const modeBadge = (mode) => mode === 'own_payfast'
        ? '<span class="badge badge-sky">Own PayFast</span>'
        : '<span class="badge badge-sun">Platform collects</span>';
      const configured = rows.filter((row) => row.payout && row.payout.accountNumberLast4).length;
      const awaiting = rows.filter((row) => row.outstanding > 0 && !(row.payout && row.payout.accountNumberLast4)).length;
      return R.pageHead('Settlements', 'Parent fees collected through the platform account, settled to each tenant by EFT.',
        R.exportButtons('/exports/platform/settlements') + R.exportButtons('/exports/platform/payouts')) +
        '<div class="grid grid-3 section">' +
          R.statCard({ label: 'Outstanding to settle', value: R.money(total, 'ZAR'), icon: 'hand-coins', tone: total > 0 ? 'sun' : 'green', foot: rows.length + ' organisation' + (rows.length === 1 ? '' : 's') + ' with activity' }) +
          R.statCard({ label: 'Bank details set', value: R.number(configured), icon: 'building', foot: 'Ready to pay out' }) +
          R.statCard({ label: 'Missing bank details', value: R.number(awaiting), icon: 'alert-triangle', tone: awaiting ? 'danger' : 'green', foot: awaiting ? 'Ask the tenant to add them' : 'Nothing blocked' }) +
        '</div>' +
        R.card('Balances', R.table({ rows, columns: [
          { label: 'Organisation', render: (row) => R.esc(row.organisationName) },
          { label: 'Mode', render: (row) => modeBadge(row.mode) },
          { label: 'Collected', align: 'right', render: (row) => R.money(row.collectedGross, row.currency) },
          { label: 'Fee', render: (row) => R.number(row.feePercent) + '%' },
          { label: 'Fees paid', align: 'right', render: (row) => R.money(row.feesPaid, row.currency) },
          { label: 'Settled', align: 'right', render: (row) => R.money(row.settledNet, row.currency) },
          { label: 'Outstanding', align: 'right', render: (row) => '<span class="cell-strong">' + R.money(row.outstanding, row.currency) + '</span>' },
          { label: '', align: 'right', render: (row) => '<div class="btn-group">' +
            '<a class="btn btn-sm btn-ghost" href="#/platform/organisations/' + R.attr(row.organisationId) + '">' + R.icon('settings') + ' Account</a>' +
            (row.outstanding > 0
              ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'recordPayout\', ' + R.attr(JSON.stringify(row.organisationId)) + ')">Pay out</button>'
              : '') +
            '</div>' }
        ], emptyTitle: 'Nothing collected yet', emptyMessage: 'Once a parent pays through an organisation’s platform account, the balance appears here.' })) +
        '<div class="section">' + R.card('Payout history', R.table({ rows: payouts, compact: true, columns: [
          { label: 'Paid', render: (row) => R.date(row.paid_at) },
          { label: 'Organisation', render: (row) => R.esc(row.organisation_name) },
          { label: 'Period', render: (row) => R.esc(R.date(row.period_start)) + ' → ' + R.esc(R.date(row.period_end)) },
          { label: 'Gross', align: 'right', render: (row) => R.money(row.gross_amount, row.currency) },
          { label: 'Fee', align: 'right', render: (row) => R.money(row.fee_amount, row.currency) },
          { label: 'Net', align: 'right', render: (row) => '<span class="cell-strong">' + R.money(row.net_amount, row.currency) + '</span>' },
          { label: 'Reference', render: (row) => row.reference ? '<span class="mono small">' + R.esc(row.reference) + '</span>' : '—' },
          { label: '', align: 'right', render: (row) => row.status === 'void' ? '<span class="badge badge-muted">Void</span>'
            : '<button class="btn btn-sm btn-ghost" @click="act(\'POST\',\'/platform/settlements/payouts/' + R.attr(row.id) + '/void\',{},{successMessage:\'Payout voided\'})">Void</button>' }
        ], emptyTitle: 'No payouts yet', emptyMessage: 'Record a payout once you have made the EFT.' })) + '</div>';
    },
    openModal(ctx, name, id) {
      if (name !== 'recordPayout' || !id) return;
      const rows = ((ctx.page && ctx.page.settlements && ctx.page.settlements.rows) || []);
      const row = rows.find((entry) => entry.organisationId === id);
      const outstanding = row ? Number(row.outstanding) : 0;
      ctx.openModal({
        title: 'Record payout to ' + (row ? row.organisationName : 'tenant'),
        description: 'Confirm the EFT has been made. The gross amount defaults to the full outstanding balance and the configured collection fee is deducted; the tenant receives the net.',
        endpoint: '/platform/settlements/payout',
        submitLabel: 'Record payout',
        successMessage: 'Payout recorded',
        fields: [
          { name: 'grossAmount', label: 'Gross amount (ZAR)', type: 'number', required: true, value: outstanding.toFixed(2) },
          { name: 'reference', label: 'EFT reference', required: true, placeholder: 'e.g. EFT-2026-0142' },
          { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
        ],
        transform: (data) => ({ organisationId: id, grossAmount: Number(data.grossAmount), reference: data.reference, notes: data.notes })
      });
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
        R.exportButtons('/exports/platform/platform-audit')) +
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
    async load(ctx) {
      const [features, config, documents] = await Promise.all([
        R.api('GET', '/platform/features'),
        R.api('GET', '/platform/settings'),
        R.api('GET', '/documents?pageSize=100').catch(() => ({ data: [] }))
      ]);
      const payload = config.data || {};
      let health = null;
      if (ctx.has('platform.health.read')) {
        health = await R.api('GET', '/platform/health').then((result) => result.data).catch(() => null);
      }
      return {
        features: features.data,
        health,
        documents: documents.data || [],
        org: Object.assign({}, payload.organisation || {}, { settings: payload.settings || {} }),
        theme: payload.theme || R.PLATFORM_BRAND.theme
      };
    },
    render(ctx, params, page) {
      const org = page.org || {};
      const theme = page.theme || R.PLATFORM_BRAND.theme;
      const logo = org.logo_url || R.PLATFORM_LOGO;
      const canManage = ctx.has('platform.settings.manage');
      const storage = (page.health && page.health.storage) || {};
      const swatch = (label, value) => '<div style="text-align:center"><span class="swatch" style="display:inline-block;background:' + R.attr(value) + '"></span><div class="muted small mono">' + R.esc(value) + '</div><div class="muted small">' + R.esc(label) + '</div></div>';
      return R.pageHead('Platform configuration', 'The Re-EL ECD brand, the platform organisation profile and global switches.',
        (canManage ? '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'platformSeo\')">' + R.icon('search') + ' Search & analytics</button>' : '') +
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
        (canManage ? R.card('Platform banner',
          (((org.settings || {}).banner || {}).enabled
            ? '<div class="alert alert-info"><i data-lucide="info"></i><span>' + R.esc(((org.settings || {}).banner || {}).message || '') + '</span></div>'
            : '<p class="muted small">Show a short message at the top of every workspace.</p>'),
          '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'platformBanner\')">' + R.icon('megaphone') + ' ' + (((org.settings || {}).banner || {}).enabled ? 'Edit banner' : 'Enable banner') + '</button>') : '') +
        (canManage ? (() => {
          const settings = (org.settings || {});
          const seo = settings.seo || {}, analytics = settings.analytics || {};
          return R.card('Search and analytics',
            '<div class="kpi-list">' +
            '<div class="kpi-row"><span class="kpi-label">Homepage title</span><span class="kpi-value">' + R.esc(seo.title || 'Platform default') + '</span></div>' +
            '<div class="kpi-row"><span class="kpi-label">Site URL</span><span class="kpi-value mono small">' + R.esc(seo.siteUrl || 'https://ecd.re-el.co.za') + '</span></div>' +
            '<div class="kpi-row"><span class="kpi-label">Google Analytics</span><span class="kpi-value">' + (analytics.measurementId ? R.badge(analytics.measurementId) : R.badge('not connected')) + '</span></div>' +
            '<div class="kpi-row"><span class="kpi-label">Search Console</span><span class="kpi-value">' + R.badge(analytics.verification ? 'verified' : 'not verified') + '</span></div>' +
            '</div><p class="muted small" style="margin-top:10px">These values appear in the platform homepage metadata and are read by the browser at runtime — no deploy or code change needed.</p>',
            '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'platformSeo\')">' + R.icon('settings-2') + ' Edit SEO & analytics</button>');
        })() : '') +
        (canManage ? R.card('Manuals and legal documents',
          '<p class="muted small">Role manuals with SOPs and every legal document. Edit any document, including legal ones — downloads update everywhere instantly.</p>' +
          R.table({ rows: page.documents || [], compact: true, columns: [
            { label: 'Document', render: (d) => '<a class="cell-strong" href="#/app/manuals/' + R.attr(d.slug) + '">' + R.esc(d.title) + '</a><span class="cell-sub">' + R.esc(d.category === 'legal' ? 'Legal' : (d.role_key || 'Manual')) + ' · v' + R.esc(d.version) + '</span>' },
            { label: '', align: 'right', render: (d) => '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'editDocument\', ' + R.attr(JSON.stringify(d.slug)) + ')">Edit</button> <button class="btn btn-sm btn-secondary" @click="downloadExport(\'/documents/' + R.attr(d.slug) + '/pdf\')">PDF</button>' }
          ] })) : '') +
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
        R.card('Media storage',
          '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Provider</span><span class="kpi-value">Cloudflare R2</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Configured</span><span class="kpi-value">' + R.badge(storage.configured ? 'enabled' : 'disabled') + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Bucket</span><span class="kpi-value mono small">' + R.esc(storage.bucket || 'not set') + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Public URL</span><span class="kpi-value">' + R.badge(storage.publicBase ? 'enabled' : 'disabled') + '</span></div>' +
          '</div>' +
          (storage.accessKeyLooksLikeAccountId ? '<div class="alert alert-danger" style="margin-top:12px"><i data-lucide="alert-triangle"></i><span>R2_ACCESS_KEY_ID is set to the account ID. Create an R2 API token and use its key instead.</span></div>' : '') +
          '<p class="muted small" style="margin-top:10px">Logo, photo and video uploads go straight from the browser to R2. This check runs on the server, so it separates credentials from CORS.</p>' +
          (canManage ? '<div class="btn-group"><button class="btn btn-secondary btn-sm" @click="checkStorage()" :disabled="storageChecking"><span class="spinner" x-show="storageChecking" style="width:14px;height:14px"></span> ' + R.icon('plug-zap') + ' Test storage</button></div>' : '') +
          '<div x-show="storageCheck" x-cloak style="margin-top:12px">' +
          '<template x-for="step in (storageCheck && storageCheck.steps) || []" :key="step.step"><div class="storage-check-row">' +
          '<span class="storage-check-dot" :class="step.ok ? \'is-ok\' : \'is-bad\'"></span>' +
          '<div style="flex:1;min-width:0"><div class="strong small" x-text="step.label"></div><div class="muted small" x-text="step.detail"></div></div>' +
          '<span class="mono small muted" x-text="step.status || \'\'"></span></div></template>' +
          '<div class="alert alert-danger" x-show="storageCheck && storageCheck.diagnosis" style="margin-top:8px"><i data-lucide="alert-circle"></i><span><strong x-text="storageCheck && storageCheck.diagnosis ? storageCheck.diagnosis.message : \'\'"></strong><br><span x-text="storageCheck && storageCheck.diagnosis ? storageCheck.diagnosis.fix : \'\'"></span></span></div>' +
          '<div class="alert alert-success" x-show="storageCheck && storageCheck.ok" style="margin-top:8px"><i data-lucide="check-circle"></i><span>Uploads, public reads and deletes all work.</span></div>' +
          '</div>') +
        R.card('Environment', '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Public website</span><span class="kpi-value">' + R.badge((org.settings || {}).publicWebsite === false ? 'disabled' : 'enabled') + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Data retention</span><span class="kpi-value">' + R.esc(((org.settings || {}).dataRetention || {}).years || 7) + ' years</span></div>' +
          '</div><p class="muted small">Environment variables are managed in Vercel. Run <span class="mono">npm run validate:env</span> before deploying.</p>' +
          (ctx.has('platform.settings.manage') ? '<div class="btn-group"><button class="btn btn-secondary btn-sm" @click="openNamedModal(\'platformSettings\')">' + R.icon('sliders-horizontal') + ' Edit platform settings</button></div>' : '')) +
        '</div></div>';
    },
  };

  V.platformSettings.openModal = function (ctx, name, id) {
    if (name === 'editDocument') {
      const slug = String(id || '').trim();
      if (!slug) return;
      R.api('GET', '/documents/' + encodeURIComponent(slug)).then((payload) => {
        const doc = payload.data || {};
        ctx.openModal({
          title: 'Edit document: ' + (doc.title || slug),
          description: 'Full edit access (super admin). Saving bumps the version; tenants and legal pages update immediately. Audited.',
          endpoint: '/platform/documents/' + encodeURIComponent(slug),
          method: 'PATCH',
          submitLabel: 'Save document',
          successMessage: 'Document saved and version bumped.',
          size: 'wide',
          fields: [
            { name: 'title', label: 'Title', required: true, value: doc.title || '' },
            { name: 'lede', label: 'Subtitle / lede', value: doc.lede || '', span: 2 },
            { name: 'intro', label: 'Introduction (one paragraph per line)', type: 'textarea', span: 2, help: 'Separate paragraphs with a blank line in the PDF.', value: (doc.intro || []).join('\n\n') },
            { name: 'sections', label: 'Sections', type: 'repeater', span: 2, itemLabel: 'Section', addLabel: 'Add section', value: (doc.sections || []).map((s) => ({
              heading: s.heading || '',
              body: (s.paragraphs || []).join('\n\n'),
              stepsText: (s.steps || []).join('\n')
            })), columns: [
              { key: 'heading', label: 'Heading', placeholder: 'e.g. Morning register SOP' },
              { key: 'body', label: 'Paragraphs (blank line between)', type: 'textarea', span: 2, placeholder: 'Explain the section…' },
              { key: 'stepsText', label: 'Steps (one per line)', type: 'textarea', span: 2, placeholder: '1. …' }
            ] }
          ],
          transform: (data) => ({
            title: data.title,
            lede: data.lede,
            intro: String(data.intro || '').split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean),
            sections: (data.sections || []).map((s) => ({
              heading: s.heading,
              paragraphs: String(s.body || '').split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean),
              steps: String(s.stepsText || '').split(/\n+/).map((p) => p.trim()).filter(Boolean)
            }))
          })
        });
      }).catch((error) => ctx.toast(error.message || 'Could not load the document.', 'error'));
      return;
    }
    if (name === 'platformSeo') {
      const settings = ((ctx.page && ctx.page.org) || {}).settings || {};
      const seo = settings.seo || {}, analytics = settings.analytics || {};
      ctx.openModal({
        title: 'Search and analytics',
        description: 'Control how Re-EL ECD appears in search results and social shares, and connect Google Analytics. Analytics stays off until you enter a measurement ID and a visitor accepts the optional banner.',
        endpoint: '/platform/settings', method: 'PATCH', submitLabel: 'Save settings',
        successMessage: 'Search and analytics settings saved', size: 'wide',
        fields: [
          { name: 'title', label: 'Homepage title', required: true, span: 2, value: seo.title || 'Re-EL ECD | Run your ECD centre with calm, clarity and care', help: 'Shown as the browser tab title and the main search result heading.' },
          { name: 'description', label: 'Meta description', type: 'textarea', span: 2, value: seo.description || '', placeholder: 'A clear one-or-two sentence summary for search results.' },
          { name: 'keywords', label: 'Keywords', span: 2, value: (seo.keywords || []).join(', '), help: 'Comma separated. Lower priority than the title and description.' },
          { name: 'siteUrl', label: 'Public site URL', value: seo.siteUrl || 'https://ecd.re-el.co.za', help: 'Used as the canonical homepage address.' },
          { name: 'image', label: 'Social share image', type: 'media', accept: 'image/jpeg,image/png,image/webp', scope: 'branding', absolute: true,
            value: seo.image || '', placeholder: 'Upload an image, or paste a link',
            help: 'Recommended 1200 × 630 px. Uploaded images are stored on the platform media account.' },
          { name: 'twitterHandle', label: 'Twitter / X handle', value: seo.twitterHandle || '', placeholder: '@reel_ecd' },
          { name: 'sameAs', label: 'Social profiles', type: 'textarea', span: 2, value: (seo.sameAs || []).join('\n'), help: 'One full URL per line, used in structured data.' },
          { name: 'measurementId', label: 'GA4 measurement ID', value: analytics.measurementId || '', placeholder: 'G-XXXXXXXXXX', help: 'Find this in Google Analytics → Admin → Data streams.' },
          { name: 'verification', label: 'Search Console verification token', value: analytics.verification || '', help: 'The content value from the Google site verification meta tag.' }
        ],
        transform(data) {
          return {
            seo: {
              title: data.title,
              description: data.description || '',
              keywords: String(data.keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
              siteUrl: data.siteUrl || '',
              image: data.image || '',
              twitterHandle: String(data.twitterHandle || '').replace(/^@/, ''),
              sameAs: String(data.sameAs || '').split('\n').map((s) => s.trim()).filter(Boolean)
            },
            analytics: {
              measurementId: data.measurementId || '',
              verification: data.verification || ''
            }
          };
        }
      });
      return;
    }
    if (name === 'platformBanner') {
      const settings = ((ctx.page && ctx.page.org) || {}).settings || {};
      const banner = settings.banner || {};
      ctx.openModal({
        title: banner.enabled ? 'Update platform banner' : 'Enable platform banner',
        description: 'The banner appears at the top of every workspace and on the sign-in screen. Keep it short and useful.',
        endpoint: '/platform/settings',
        method: 'PATCH',
        submitLabel: 'Save banner',
        successMessage: 'Platform banner updated.',
        fields: [
          { name: 'enabled', label: 'Show this banner', type: 'checkbox', value: banner.enabled === true },
          { name: 'message', label: 'Message', type: 'textarea', required: true, value: banner.message || '', span: 2, help: 'For example: Scheduled maintenance Sunday 20:00–21:00. Tenants will see this notice.' },
          { name: 'tone', label: 'Tone', type: 'select', value: banner.tone || 'info', options: [
            { value: 'info', label: 'Info' },
            { value: 'warning', label: 'Warning' },
            { value: 'danger', label: 'Danger' },
            { value: 'success', label: 'Success' }
          ] }
        ],
        transform: (data) => ({
          banner: {
            enabled: data.enabled === true,
            message: String(data.message || '').slice(0, 300),
            tone: data.tone || 'info'
          }
        })
      });
      return;
    }
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
          { label: 'Description', render: (c) => '<span class="muted small">' + R.esc(R.truncate(c.description, 80)) + '</span>' },
          { label: 'Actions', align: 'right', render: (c) => '<div class="btn-group">' +
            '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'editCase\', ' + R.attr(JSON.stringify(c.id)) + ')">Update</button>' +
            (c.status !== 'resolved' && c.status !== 'closed'
              ? '<button class="btn btn-sm btn-primary" @click="act(\'PATCH\',\'/platform/support-cases/' + R.attr(c.id) + '\',{status:\'resolved\'},{successMessage:\'Case resolved\'})">Resolve</button>'
              : '') +
            '</div>' }
        ], emptyTitle: 'No support cases', emptyMessage: 'Raise a case when a tenant needs hands-on help.' }));
    },
    openModal(ctx, name, id) {
      if (name === 'editCase' && id) {
        const supportCase = ((ctx.page && ctx.page.cases) || []).find((c) => c.id === id);
        ctx.openModal({
          title: 'Update support case',
          endpoint: '/platform/support-cases/' + encodeURIComponent(id),
          method: 'PATCH',
          submitLabel: 'Save case',
          successMessage: 'Case updated',
          fields: [
            { name: 'subject', label: 'Subject', required: true, value: supportCase ? supportCase.subject : '' },
            { name: 'status', label: 'Status', type: 'select', value: supportCase ? supportCase.status : 'open',
              options: [
                { value: 'open', label: 'Open' },
                { value: 'in_progress', label: 'In progress' },
                { value: 'resolved', label: 'Resolved' },
                { value: 'closed', label: 'Closed' }
              ] },
            { name: 'accessGrantedUntil', label: 'Access granted until', type: 'datetime-local',
              value: supportCase && supportCase.access_granted_until
                ? String(supportCase.access_granted_until).slice(0, 16) : '',
              help: 'Leave blank to withdraw support access.' },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, value: supportCase ? (supportCase.description || '') : '' }
          ]
        });
        return;
      }
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

  V.platformItemAnalysis = {
    async load(ctx) {
      const payload = await R.api('GET', '/platform/item-analysis').then((p) => p.data).catch(() => ({ steps: [] }));
      return { analysis: payload || { steps: [] } };
    },

    render(ctx, params, page) {
      const analysis = page.analysis || { steps: [] };
      const steps = (analysis.steps || []).filter((s) => !s.lowData);
      const lowData = (analysis.steps || []).filter((s) => s.lowData).length;
      const tone = (rate) => rate == null ? 'var(--text-muted)' : rate < 40 ? 'var(--reel-danger-500)' : rate < 65 ? 'var(--reel-warn-500)' : 'var(--reel-green-600)';
      const worst = steps.slice(0, 5);
      return R.pageHead('Item analysis', 'Which interactive slides trip children up across every centre — aggregate only, no child ever identifiable.',
          '<span class="badge badge-muted">Official NCF content · aggregate only</span>') +
        '<div class="section"></div>' +
        (steps.length
          ? '<div class="split"><div class="stack">' +
              R.card('Needs work first (weakest slides)', '<div class="stack">' + worst.map((s) => {
                const width = s.successRate == null ? 100 : Math.max(2, s.successRate);
                return '<div class="metric-bar"><span title="' + R.attr(s.planTitle + ' · ' + s.stepTitle) + '">' + R.esc(s.planTitle) + ' — ' + R.esc(R.truncate(s.stepTitle, 34)) + '</span><div class="bar"><span style="width:' + width + '%;background:' + tone(s.successRate) + '"></span></div><span class="val">' + (s.successRate == null ? '—' : R.percent(s.successRate)) + '</span></div>';
              }).join('') + '</div>', '<span class="muted small">Sorted weakest first · ' + R.number(steps.length) + ' scored slides</span>') +
              '<div class="section"></div>' +
              R.card('All scored slides', R.table({ rows: steps, columns: [
                { label: 'Plan', render: (s) => '<span class="cell-strong">' + R.esc(s.planTitle) + '</span>' },
                { label: 'Slide', render: (s) => R.esc(s.stepTitle) + '<span class="cell-sub">' + R.esc(R.titleCase(s.type)) + '</span>' },
                { label: 'Attempts', align: 'right', render: (s) => R.number(s.attempts) },
                { label: 'Success rate', render: (s) => '<span style="font-variant-numeric:tabular-nums;font-weight:700;color:' + tone(s.successRate) + '">' + (s.successRate == null ? '—' : R.percent(s.successRate)) + '</span>' }
              ], emptyTitle: 'No scored slides yet' })) +
            '</div><div class="stack">' +
              R.card('How to read this', '<ol class="stack" style="gap:8px;padding-left:18px;margin:0">' +
                '<li>Slides under <strong>40%</strong> are costing learning time — re-teach, re-word, or re-order the step.</li>' +
                '<li>Slides between <strong>40–65%</strong> are worth watching before the next term.</li>' +
                '<li>Every number here is an aggregate across centres. No child appears, no centre is named.</li>' +
                '<li>Fixes feed <em>official</em> content — centres keep their own adaptations.</li>' +
              '</ol>') +
              R.card('Data quality', '<div class="kpi-list">' +
                '<div class="kpi-row"><span class="kpi-label">Success rate</span><span class="kpi-value">share of fully correct answers (MCQ needs the exact option; matches need every pair right)</span></div>' +
                '<div class="kpi-row"><span class="kpi-label">Low data</span><span class="kpi-value">' + R.number(lowData) + ' slide(s) hidden — fewer than 5 attempts</span></div>' +
                '<div class="kpi-row"><span class="kpi-label">POPIA</span><span class="kpi-value">aggregate only · official NCF content only · no identifying data leaves the centre</span></div>' +
              '</div>') +
            '</div></div>'
          : R.emptyState('No attempts yet', 'Interactive slides in official lesson plans will appear here once centres run them with learners.', '', 'target'));
    }
  };

})();
