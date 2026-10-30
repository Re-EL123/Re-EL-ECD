'use strict';

/* Finance: overview, invoices, payments, fee plans, expenses and inventory. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void', 'cancelled', 'written_off'];
  const PAYMENT_STATUSES = ['confirmed', 'reconciled', 'reversed', 'failed'];
  const PAYMENT_METHODS = ['eft', 'cash', 'card', 'debit_order', 'snapscan', 'payfast', 'other'];
  const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'paid'];

  function statusFilter(ctx, key, values, label) {
    return R.selectFilter(ctx, key, values.map((v) => ({ value: v, label: R.titleCase(v) })), label);
  }

  function agingRow(label, value) {
    return '<div class="kpi-row"><span class="kpi-label">' + R.esc(label) + '</span><span class="kpi-value">' + R.money(value) + '</span></div>';
  }

  V.finance = {
    async load(ctx) {
      const invoiceQuery = new URLSearchParams({ pageSize: '25' });
      if (ctx.filters.q) invoiceQuery.set('q', ctx.filters.q);
      if (ctx.filters.status) invoiceQuery.set('status', ctx.filters.status);
      if (ctx.filters.page) invoiceQuery.set('page', ctx.filters.page);
      const paymentQuery = new URLSearchParams({ pageSize: '25' });
      if (ctx.filters.paymentStatus) paymentQuery.set('status', ctx.filters.paymentStatus);
      const from = ctx.filters.from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
      const to = ctx.filters.to || R.today();

      const [overview, invoices, payments, feePlans, aging, learners, reports] = await Promise.all([
        R.api('GET', '/finance/overview').then((p) => p.data).catch(() => ({})),
        R.api('GET', '/invoices?' + invoiceQuery).then((p) => p).catch(() => ({ data: [], meta: {} })),
        R.api('GET', '/payments?' + paymentQuery).then((p) => p).catch(() => ({ data: [], meta: {} })),
        R.api('GET', '/fee-plans').then((p) => p.data).catch(() => []),
        R.api('GET', '/finance/aging').then((p) => p.data).catch(() => []),
        R.api('GET', '/learners?pageSize=200').then((p) => p.data).catch(() => []),
        ctx.has('finance.reports.daycare')
          ? R.api('GET', '/finance/reports?from=' + from + '&to=' + to).then((p) => p.data).catch(() => null)
          : Promise.resolve(null)
      ]);

      return {
        overview: overview || {}, invoices: invoices.data || [], invoiceMeta: invoices.meta || {},
        payments: payments.data || [], paymentMeta: payments.meta || {}, feePlans: feePlans || [],
        aging: aging || [], learners: learners || [], reports, from, to
      };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'overview';
      const o = page.overview || {};
      return R.pageHead('Finance', 'Fees, payments and the money that keeps the doors open.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'payment\')">' + R.icon('banknote') + ' Record payment</button>' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'invoice\')">' + R.icon('file-plus') + ' New invoice</button>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Outstanding', value: R.money(o.outstanding), icon: 'wallet', tone: Number(o.outstanding) ? 'danger' : 'green', foot: R.number(o.overdueCount) + ' overdue invoices' }) +
        R.statCard({ label: 'Overdue', value: R.money(o.overdue), icon: 'alert-circle', tone: 'clay', foot: 'Needs follow-up' }) +
        R.statCard({ label: 'Collected this month', value: R.money(o.collectedThisMonth), icon: 'trending-up', tone: 'sky', foot: R.money(o.expensesThisMonth) + ' expenses' }) +
        R.statCard({ label: 'Net this month', value: R.money(o.netThisMonth), icon: 'scale', tone: Number(o.netThisMonth) >= 0 ? 'green' : 'danger', foot: R.number(o.draftCount) + ' draft invoices' }) +
        '</div>' +
        R.tabs([
          { key: 'overview', label: 'Overview' }, { key: 'invoices', label: 'Invoices' },
          { key: 'payments', label: 'Payments' }, { key: 'plans', label: 'Fee plans' },
          { key: 'aging', label: 'Aging' }, { key: 'reports', label: 'Reports' }
        ], tab) +
        (tab === 'invoices' ? this.renderInvoices(ctx, page) : tab === 'payments' ? this.renderPayments(ctx, page) :
          tab === 'plans' ? this.renderPlans(ctx, page) : tab === 'aging' ? this.renderAging(page) :
            tab === 'reports' ? this.renderReports(ctx, page) : this.renderOverview(ctx, page));
    },

    renderOverview(ctx, page) {
      const o = page.overview || {};
      const aging = o.aging || {};
      return '<div class="split"><div class="stack">' +
        R.card('Recent payments', R.table({ rows: o.recentPayments || [], columns: [
          { label: 'Received', render: (p) => '<span class="cell-strong">' + R.date(p.received_at) + '</span><span class="cell-sub">' + R.esc(R.titleCase(p.payment_method)) + '</span>' },
          { label: 'Guardian', render: (p) => R.esc(p.guardian_name || 'Unallocated') },
          { label: 'Amount', align: 'right', render: (p) => R.money(p.amount, p.currency) },
          { label: 'Status', render: (p) => R.badge(p.status) }
        ], emptyTitle: 'No payments yet', emptyMessage: 'Record a payment when money arrives.' }),
          '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'payment\')">' + R.icon('plus') + ' Record payment</button>') +
        R.card('Aging buckets', '<div class="kpi-list">' +
          agingRow('Current', aging.current) + agingRow('1 – 30 days', aging.days30) +
          agingRow('31 – 60 days', aging.days60) + agingRow('61 – 90 days', aging.days90) +
          agingRow('Older than 90 days', aging.older) + '</div>',
          '<button class="btn btn-sm btn-ghost" @click="setTab(\'aging\')">Open aging ' + R.icon('arrow-right') + '</button>') +
        '</div><div class="stack">' +
        R.card('Quick actions', '<div class="stack">' +
          '<button class="btn btn-secondary" style="justify-content:flex-start" @click="openNamedModal(\'generateInvoices\')">' + R.icon('files') + ' Generate monthly invoices</button>' +
          '<button class="btn btn-secondary" style="justify-content:flex-start" @click="openNamedModal(\'feePlan\')">' + R.icon('layers') + ' Create a fee plan</button>' +
          '<button class="btn btn-secondary" style="justify-content:flex-start" @click="setTab(\'reports\')">' + R.icon('bar-chart-3') + ' Financial reports</button>' +
          '<a class="btn btn-secondary" style="justify-content:flex-start" href="#/app/expenses">' + R.icon('receipt') + ' Expenses</a>' +
          '</div>') +
        R.card('How billing works', '<p class="muted small">Fee plans describe what a month costs. Invoices are issued to a guardian, and payments are allocated against them. Nothing is deleted — corrections are reversed and audited.</p>') +
        '</div></div>';
    },

    renderInvoices(ctx, page) {
      return R.filterBar(
        R.searchFilter(ctx, 'q', 'Search invoice or learner…') +
        statusFilter(ctx, 'status', INVOICE_STATUSES, 'All statuses')) +
        (ctx.has('finance.invoice.issue.daycare') ? R.bulkBar([
          { label: 'Issue selected', icon: 'send', path: '/invoices/bulk', action: 'issue' },
          { label: 'Void selected', icon: 'ban', path: '/invoices/bulk', action: 'void', tone: 'danger' }
        ], { hint: 'Only drafts can be issued; invoices with payments cannot be voided.' }) : '') +
        R.table({ rows: page.invoices || [], selectable: ctx.has('finance.invoice.issue.daycare'), columns: [
          { label: 'Invoice', render: (i) => '<button class="link-strong mono" @click="openNamedModal(\'invoiceView\',\'' + R.attr(i.id) + '\')">' + R.esc(i.invoice_number) + '</button><span class="cell-sub">' + R.esc((i.first_name || '') + ' ' + (i.last_name || '')) + '</span>' },
          { label: 'Guardian', render: (i) => R.esc(i.guardian_name || '—') + '<span class="cell-sub">' + R.esc(i.guardian_email || '') + '</span>' },
          { label: 'Issued', render: (i) => R.date(i.issued_at) },
          { label: 'Due', render: (i) => R.date(i.due_at) },
          { label: 'Total', align: 'right', render: (i) => R.money(i.total_amount, i.currency) },
          { label: 'Outstanding', align: 'right', render: (i) => R.money(Number(i.total_amount) - Number(i.amount_paid), i.currency) },
          { label: 'Status', render: (i) => R.badge(i.status) },
          { label: '', align: 'right', render: (i) => '<div class="btn-group">' +
            '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'invoiceView\',\'' + R.attr(i.id) + '\')">View</button>' +
            (i.status === 'draft' ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/invoices/' + R.attr(i.id) + '/issue\',{},{successMessage:\'Invoice issued\'})">Issue</button>' : '') +
            (['issued', 'partially_paid', 'overdue'].includes(i.status) && Number(i.total_amount) > Number(i.amount_paid) ? '<button class="btn btn-sm btn-secondary" @click="paymentLink(\'' + R.attr(i.id) + '\')">Payment link</button>' : '') +
            (!['paid', 'void', 'cancelled', 'written_off'].includes(i.status) ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'writeOff\',\'' + R.attr(i.id) + '\')">Write off</button>' : '') +
            '</div>' }
        ], emptyTitle: 'No invoices found', emptyMessage: 'Issue an invoice or generate them from a fee plan.' }) +
        R.pager(page.invoiceMeta, "setFilter('page', " + Math.max(1, (page.invoiceMeta.page || 1) - 1) + ")", "setFilter('page', " + Math.min(page.invoiceMeta.totalPages || 1, (page.invoiceMeta.page || 1) + 1) + ")") +
        '<div class="section"></div><div class="row"><button class="btn btn-secondary btn-sm" @click="openNamedModal(\'generateInvoices\')">' + R.icon('files') + ' Generate from fee plan</button>' +
        '<a class="btn btn-ghost btn-sm" href="/api/v1/finance/export/invoices" target="_blank" rel="noopener">' + R.icon('download') + ' Export invoices</a></div>';
    },

    renderPayments(ctx, page) {
      const canReconcile = ctx.has('finance.payment.reconcile.daycare');
      const canReverse = ctx.has('finance.manage.daycare');
      return R.filterBar(statusFilter(ctx, 'paymentStatus', PAYMENT_STATUSES, 'All statuses')) +
        R.table({ rows: page.payments || [], columns: [
          { label: 'Received', render: (p) => '<span class="cell-strong">' + R.dateTime(p.received_at) + '</span><span class="cell-sub">' + R.esc(R.titleCase(p.payment_method)) + '</span>' },
          { label: 'Guardian', render: (p) => R.esc(p.guardian_name || '—') },
          { label: 'Reference', render: (p) => '<span class="mono small">' + R.esc(p.provider_reference || '—') + '</span>' },
          { label: 'Allocated to', render: (p) => (p.allocations || []).map((a) => '<span class="badge badge-muted mono">' + R.esc(a.invoice_number) + '</span>').join(' ') || '<span class="muted">Unallocated</span>' },
          { label: 'Amount', align: 'right', render: (p) => R.money(p.amount, p.currency) },
          { label: 'Status', render: (p) => R.badge(p.status) },
          { label: 'Recorded by', render: (p) => R.esc(p.recorded_by_name || '—') },
          { label: '', align: 'right', render: (p) => '<div class="btn-group">' +
            (canReconcile && p.status === 'confirmed' ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/payments/' + R.attr(p.id) + '/reconcile\',{},{successMessage:\'Payment reconciled\'})">Reconcile</button>' : '') +
            (canReverse && p.status !== 'reversed' ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'reversePayment\',\'' + R.attr(p.id) + '\')">Reverse</button>' : '') +
            '</div>' }
        ], emptyTitle: 'No payments', emptyMessage: 'Payments recorded against invoices will appear here.' });
    },

    renderPlans(ctx, page) {
      const plans = page.feePlans || [];
      return '<div class="grid grid-2">' + plans.map((p) => R.card(p.name,
        '<div class="row" style="margin-bottom:8px">' + R.badge(p.status) +
        '<span class="badge badge-muted">' + R.esc(R.titleCase(p.billing_frequency)) + '</span>' +
        '<span class="badge badge-sky">' + R.esc(p.currency) + '</span></div>' +
        '<div class="stat-value" style="font-size:1.4rem">' + R.money(p.monthly_total, p.currency) + '<span class="muted" style="font-size:0.75rem;font-weight:500"> / cycle</span></div>' +
        '<div class="stack" style="margin-top:10px">' + (p.items || []).map((i) =>
          '<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-subtle)">' +
          '<span style="font-size:0.85rem">' + R.esc(i.description) + '</span><span class="mono small">' + R.money(i.amount, p.currency) + '</span></div>').join('') + '</div>',
        '<div class="btn-group">' +
          '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'generateInvoices\',\'' + R.attr(p.id) + '\')">Generate</button>' +
        '</div>')).join('') + '</div>' +
        (plans.length ? '' : R.emptyState('No fee plans', 'A fee plan is the template for monthly invoices.', '<button class="btn btn-primary" @click="openNamedModal(\'feePlan\')">Create fee plan</button>', 'layers'));
    },

    renderAging(page) {
      return R.card('Outstanding invoices by age', R.table({ rows: page.aging || [], columns: [
        { label: 'Invoice', render: (i) => '<button class="link-strong mono" @click="openNamedModal(\'invoiceView\',\'' + R.attr(i.id) + '\')">' + R.esc(i.invoice_number) + '</button>' },
        { label: 'Learner', render: (i) => R.esc((i.first_name || '') + ' ' + (i.last_name || '')) },
        { label: 'Guardian', render: (i) => R.esc(i.guardian_name || '—') + '<span class="cell-sub">' + R.esc(i.guardian_email || '') + '</span>' },
        { label: 'Due', render: (i) => R.date(i.due_at) },
        { label: 'Days overdue', align: 'right', render: (i) => Number(i.days_overdue) > 0 ? '<span class="badge badge-danger">' + R.number(i.days_overdue) + '</span>' : '<span class="badge badge-green">Current</span>' },
        { label: 'Outstanding', align: 'right', render: (i) => R.money(i.outstanding) }
      ], emptyTitle: 'Nothing outstanding', emptyMessage: 'Every issued invoice has been paid.' }), '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'payment\')">Record payment</button>');
    },

    renderReports(ctx, page) {
      const r = page.reports;
      if (!r) return R.emptyState('Reports unavailable', 'Your role does not include financial reporting.', '', 'bar-chart-3');
      return R.filterBar(
        '<label class="small muted">From</label><input class="input" type="date" value="' + R.attr(page.from) + '" @change="setFilter(\'from\',$event.target.value)">' +
        '<label class="small muted">To</label><input class="input" type="date" value="' + R.attr(page.to) + '" @change="setFilter(\'to\',$event.target.value)">') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Invoiced', value: R.money(r.invoiced), icon: 'file-text', foot: R.number(r.invoiceCount) + ' invoices' }) +
        R.statCard({ label: 'Collected', value: R.money(r.collected), icon: 'banknote', tone: 'sky', foot: R.number(r.paymentCount) + ' payments' }) +
        R.statCard({ label: 'Expenses', value: R.money(r.expenses), icon: 'receipt', tone: 'clay', foot: R.number(r.expenseCount) + ' entries' }) +
        R.statCard({ label: 'Collection rate', value: R.percent(r.collectionRate), icon: 'percent', tone: 'plum', foot: 'Collected ÷ invoiced' }) +
        '</div>' +
        '<div class="split"><div class="stack">' +
        R.card('Monthly position', R.table({ rows: r.monthly || [], columns: [
          { label: 'Month', render: (m) => '<span class="cell-strong">' + R.esc(m.month) + '</span>' },
          { label: 'Invoiced', align: 'right', render: (m) => R.money(m.invoiced) },
          { label: 'Collected', align: 'right', render: (m) => R.money(m.collected) },
          { label: 'Gap', align: 'right', render: (m) => R.money(Number(m.invoiced) - Number(m.collected)) }
        ], emptyTitle: 'No invoices in this range' })) +
        '</div><div class="stack">' +
        R.card('Payments by method', R.table({ rows: r.byMethod || [], compact: true, columns: [
          { label: 'Method', render: (m) => R.esc(R.titleCase(m.payment_method)) },
          { label: 'Count', align: 'right', render: (m) => R.number(m.count) },
          { label: 'Total', align: 'right', render: (m) => R.money(m.total) }
        ], emptyTitle: 'No payments' })) +
        R.card('Expenses by category', R.table({ rows: r.expenseByCategory || [], compact: true, columns: [
          { label: 'Category', render: (c) => R.esc(c.category) },
          { label: 'Total', align: 'right', render: (c) => R.money(c.total) }
        ], emptyTitle: 'No expenses' })) +
        '</div></div>';
    },

    async paymentLink(ctx, id) {
      try {
        const payload = await R.api('POST', '/invoices/' + encodeURIComponent(id) + '/payfast-link', {});
        const checkout = payload.data.checkout || {};
        const url = checkout.action + '?' + checkout.query;
        ctx.openDetail('PayFast payment link',
          '<p class="muted small">Share this link with the guardian, or open it to pay now. The invoice is marked paid only when PayFast confirms the transaction.</p>' +
          '<div class="field"><label class="label">Payment link</label>' +
          '<input class="input mono" readonly value="' + R.attr(url) + '" onclick="this.select()"></div>' +
          '<div class="row" style="margin-top:14px">' +
          '<a class="btn btn-primary" href="' + R.attr(url) + '" target="_blank" rel="noopener">' + R.icon('external-link') + ' Open PayFast</a>' +
          '</div>');
      } catch (error) {
        ctx.toast(error.message || 'The payment link could not be created.', 'error');
      }
    },

    async openModal(ctx, name, id) {
      const page = ctx.page || {};
      if (name === 'invoice') {
        ctx.openModal({
          title: 'New invoice', endpoint: '/invoices', submitLabel: 'Create invoice', size: 'wide',
          description: 'One line item is created per invoice here. Use a fee plan to bill every enrolled child at once.',
          fields: [
            { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx) },
            { name: 'learnerId', label: 'Learner', type: 'select', options: (page.learners || []).map((l) => ({ value: l.id, label: l.first_name + ' ' + l.last_name + ' · ' + l.learner_reference })) },
            { name: 'lineDescription', label: 'Line description', required: true, placeholder: 'Monthly care fee' },
            { name: 'unitAmount', label: 'Amount per unit', type: 'number', step: '0.01', required: true },
            { name: 'quantity', label: 'Quantity', type: 'number', step: '0.01', value: 1 },
            { name: 'dueAt', label: 'Due date', type: 'date' },
            { name: 'description', label: 'Invoice note', span: 2 },
            { name: 'issueNow', label: 'Issue immediately', type: 'checkbox', value: true, help: 'Send the invoice to the guardian now' }
          ],
          transform: (data) => {
            const body = Object.assign({}, data);
            body.items = [{ description: body.lineDescription, quantity: Number(body.quantity || 1), unitAmount: Number(body.unitAmount || 0) }];
            delete body.lineDescription; delete body.unitAmount; delete body.quantity;
            return body;
          }
        });
      } else if (name === 'payment') {
        ctx.openModal({
          title: 'Record payment', endpoint: '/payments', submitLabel: 'Record payment', size: 'wide',
          description: 'Record money received. Allocate it to invoices from the invoice view if needed.',
          fields: [
            { name: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
            { name: 'paymentMethod', label: 'Method', type: 'select', required: true, options: PAYMENT_METHODS.map((m) => ({ value: m, label: R.titleCase(m) })) },
            { name: 'receivedAt', label: 'Received at', type: 'datetime-local', value: new Date().toISOString().slice(0, 16) },
            { name: 'providerReference', label: 'Reference', placeholder: 'Bank or card reference' },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
          ]
        });
      } else if (name === 'feePlan') {
        ctx.openModal({
          title: 'New fee plan', endpoint: '/fee-plans', submitLabel: 'Create fee plan', size: 'wide',
          fields: [
            { name: 'name', label: 'Plan name', required: true, span: 2 },
            { name: 'billingFrequency', label: 'Billing frequency', type: 'select', options: ['weekly', 'monthly', 'termly', 'annual'], value: 'monthly' },
            { name: 'currency', label: 'Currency', value: 'ZAR' },
            { name: 'itemDescription', label: 'First line item', required: true, placeholder: 'Full-day care' },
            { name: 'itemAmount', label: 'Amount', type: 'number', step: '0.01', required: true }
          ],
          transform: (data) => {
            const body = Object.assign({}, data);
            body.items = [{ description: body.itemDescription, amount: Number(body.itemAmount || 0) }];
            delete body.itemDescription; delete body.itemAmount;
            return body;
          }
        });
      } else if (name === 'generateInvoices') {
        ctx.openModal({
          title: 'Generate invoices', endpoint: '/invoices/generate', submitLabel: 'Generate',
          description: 'Every actively enrolled child on the selected fee plan receives an issued invoice.',
          fields: [
            { name: 'feePlanId', label: 'Fee plan', type: 'select', required: true, value: id || '', options: (page.feePlans || []).map((p) => ({ value: p.id, label: p.name })) },
            { name: 'branchId', label: 'Branch', type: 'select', options: R.branchOptions(ctx) },
            { name: 'dueAt', label: 'Due date', type: 'date' },
            { name: 'description', label: 'Invoice note', span: 2 }
          ]
        });
      } else if (name === 'writeOff' && id) {
        ctx.openModal({
          title: 'Write off invoice', endpoint: '/invoices/' + id + '/write-off', submitLabel: 'Write off',
          description: 'Writing off closes the invoice without payment. The reason is kept in the audit trail.',
          fields: [{ name: 'reason', label: 'Reason', type: 'textarea', required: true, span: 2 }]
        });
      } else if (name === 'reversePayment' && id) {
        ctx.openModal({
          title: 'Reverse payment', endpoint: '/payments/' + id + '/reverse', submitLabel: 'Reverse payment',
          description: 'Reversing removes the allocations and reopens the invoices it paid.',
          fields: [{ name: 'reason', label: 'Reason', required: true, type: 'textarea', span: 2 }]
        });
      } else if (name === 'invoiceView' && id) {
        try {
          const payload = await R.api('GET', '/invoices/' + encodeURIComponent(id));
          const i = payload.data || {};
          const items = i.items || [];
          const allocations = i.allocations || [];
          const invoiceOrg = i.organisation || {};
          const orgLogo = invoiceOrg.logoUrl
            ? '<span class="brand-logo" style="width:34px;height:34px;flex:0 0 34px"><img src="' + R.attr(invoiceOrg.logoUrl) + '" alt=""></span>'
            : '';
          const html = '<div class="row" style="justify-content:space-between;align-items:flex-start">' +
            '<div class="row" style="gap:10px">' + orgLogo +
            '<div><div class="mono cell-strong" style="font-size:1.1rem">' + R.esc(i.invoice_number) + '</div>' +
            '<div class="muted small">' + R.esc(invoiceOrg.name || '') + '</div></div></div>' +
            '<div style="text-align:right">' + R.badge(i.status) + '<div class="muted small">Issued ' + R.date(i.issued_at) + '</div></div></div>' +
            '<div class="section"></div><div class="detail-list">' +
            R.detailItem('Learner', R.esc(((i.learner || {}).first_name || '') + ' ' + ((i.learner || {}).last_name || ''))) +
            R.detailItem('Guardian', R.esc(((i.guardian || {}).first_name || '') + ' ' + ((i.guardian || {}).last_name || '')) + (i.guardian && i.guardian.email ? '<span class="cell-sub">' + R.esc(i.guardian.email) + '</span>' : '')) +
            R.detailItem('Branch', R.esc((i.branch || {}).name || '')) +
            R.detailItem('Due', R.date(i.due_at)) +
            '</div><div class="section"></div>' +
            R.table({ rows: items, compact: true, columns: [
              { label: 'Description', render: (x) => R.esc(x.description) },
              { label: 'Qty', align: 'right', render: (x) => R.number(x.quantity) },
              { label: 'Unit', align: 'right', render: (x) => R.money(x.unit_amount, i.currency) },
              { label: 'Total', align: 'right', render: (x) => R.money(x.line_total, i.currency) }
            ] }) +
            '<div class="kpi-list" style="margin-top:12px">' +
            '<div class="kpi-row"><span class="kpi-label">Subtotal</span><span class="kpi-value">' + R.money(i.subtotal, i.currency) + '</span></div>' +
            '<div class="kpi-row"><span class="kpi-label">Discount</span><span class="kpi-value">' + R.money(i.discount_total, i.currency) + '</span></div>' +
            '<div class="kpi-row"><span class="kpi-label">Total</span><span class="kpi-value">' + R.money(i.total_amount, i.currency) + '</span></div>' +
            '<div class="kpi-row"><span class="kpi-label">Paid</span><span class="kpi-value">' + R.money(i.amount_paid, i.currency) + '</span></div>' +
            '<div class="kpi-row"><span class="kpi-label">Outstanding</span><span class="kpi-value">' + R.money(Number(i.total_amount) - Number(i.amount_paid), i.currency) + '</span></div>' +
            '</div>' +
            (allocations.length ? '<div class="section"></div><h3>Payments applied</h3>' + R.table({ rows: allocations, compact: true, columns: [
              { label: 'Received', render: (a) => R.date(a.received_at) },
              { label: 'Method', render: (a) => R.esc(R.titleCase(a.payment_method)) },
              { label: 'Amount', align: 'right', render: (a) => R.money(a.allocated_amount, i.currency) },
              { label: 'Status', render: (a) => R.badge(a.payment_status) }
            ] }) : '');
          ctx.openDetail('Invoice ' + i.invoice_number, html, 'wide');
        } catch (error) {
          ctx.toast(error.message || 'The invoice could not be opened.', 'error');
        }
      }
    }
  };

  V.expenses = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.status) query.set('status', ctx.filters.status);
      if (ctx.filters.from) query.set('from', ctx.filters.from);
      if (ctx.filters.to) query.set('to', ctx.filters.to);
      const [expenses, categories, suppliers] = await Promise.all([
        R.api('GET', '/expenses' + (query.toString() ? '?' + query : '')).then((p) => p.data).catch(() => []),
        R.api('GET', '/expense-categories').then((p) => p.data).catch(() => []),
        R.api('GET', '/suppliers').then((p) => p.data).catch(() => [])
      ]);
      return { rows: expenses || [], categories: categories || [], suppliers: suppliers || [] };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'expenses';
      const rows = page.rows || [];
      const total = rows.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const approved = rows.filter((e) => ['approved', 'paid'].includes(e.approval_status)).reduce((sum, e) => sum + Number(e.amount || 0), 0);
      return R.pageHead('Expenses', 'What the centre spends, who approved it and which supplier it went to.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'supplier\')">' + R.icon('truck') + ' Add supplier</button>' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'expense\')">' + R.icon('plus') + ' New expense</button>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Entries', value: R.number(rows.length), icon: 'receipt', foot: 'In this view' }) +
        R.statCard({ label: 'Total', value: R.money(total), icon: 'wallet', tone: 'sky' }) +
        R.statCard({ label: 'Approved', value: R.money(approved), icon: 'check-circle', tone: 'green' }) +
        R.statCard({ label: 'Awaiting review', value: R.number(rows.filter((e) => e.approval_status === 'submitted').length), icon: 'clock', tone: 'sun' }) +
        '</div>' +
        R.tabs([{ key: 'expenses', label: 'Expenses' }, { key: 'suppliers', label: 'Suppliers' }, { key: 'categories', label: 'Categories' }], tab) +
        (tab === 'suppliers' ? this.renderSuppliers(page) : tab === 'categories' ? this.renderCategories(page) : this.renderExpenses(ctx, page));
    },

    renderExpenses(ctx, page) {
      const canReview = ctx.has('finance.manage.daycare');
      return R.filterBar(
        statusFilter(ctx, 'status', EXPENSE_STATUSES, 'All statuses') +
        '<label class="small muted">From</label><input class="input" type="date" value="' + R.attr(ctx.filters.from || '') + '" @change="setFilter(\'from\',$event.target.value)">' +
        '<label class="small muted">To</label><input class="input" type="date" value="' + R.attr(ctx.filters.to || '') + '" @change="setFilter(\'to\',$event.target.value)">') +
        R.table({ rows: page.rows || [], columns: [
          { label: 'Date', render: (e) => R.date(e.expense_date) },
          { label: 'Description', render: (e) => '<span class="cell-strong">' + R.esc(e.description) + '</span><span class="cell-sub">' + R.esc(e.category_name || 'Uncategorised') + '</span>' },
          { label: 'Supplier', render: (e) => R.esc(e.supplier_name || '—') },
          { label: 'Branch', render: (e) => R.esc(e.branch_name || '—') },
          { label: 'Amount', align: 'right', render: (e) => R.money(e.amount, e.currency) },
          { label: 'Status', render: (e) => R.badge(e.approval_status) },
          { label: 'Captured by', render: (e) => R.esc(e.created_by_name || '—') },
          { label: '', align: 'right', render: (e) => canReview && ['draft', 'submitted'].includes(e.approval_status) ? '<div class="btn-group">' +
            '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/expenses/' + R.attr(e.id) + '/review\',{decision:\'approved\'},{successMessage:\'Expense approved\'})">Approve</button>' +
            '<button class="btn btn-sm btn-secondary" @click="act(\'POST\',\'/expenses/' + R.attr(e.id) + '/review\',{decision:\'paid\'},{successMessage:\'Expense marked paid\'})">Paid</button>' +
            '<button class="btn btn-sm btn-danger" @click="openNamedModal(\'rejectExpense\',\'' + R.attr(e.id) + '\')">Reject</button></div>' : '' }
        ], emptyTitle: 'No expenses', emptyMessage: 'Capture a supplier invoice or a petty-cash slip to get started.' });
    },

    renderSuppliers(page) {
      return R.card('Suppliers', R.table({ rows: page.suppliers || [], columns: [
        { label: 'Name', render: (s) => '<span class="cell-strong">' + R.esc(s.name) + '</span>' },
        { label: 'Contact', render: (s) => R.esc((s.contact_details || {}).email || (s.contact_details || {}).phone || '—') },
        { label: 'Added', render: (s) => R.date(s.created_at) }
      ], emptyTitle: 'No suppliers', emptyMessage: 'Add the shops and services the centre buys from.' }), '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'supplier\')">' + R.icon('plus') + ' Add supplier</button>');
    },

    renderCategories(page) {
      return R.card('Expense categories', R.table({ rows: page.categories || [], columns: [
        { label: 'Category', render: (c) => '<span class="cell-strong">' + R.esc(c.name) + '</span>' },
        { label: 'Created', render: (c) => R.date(c.created_at) }
      ], emptyTitle: 'No categories', emptyMessage: 'Categories make spending patterns visible.' }), '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'category\')">' + R.icon('plus') + ' Add category</button>');
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      if (name === 'expense') {
        ctx.openModal({
          title: 'New expense', endpoint: '/expenses', submitLabel: 'Save expense', size: 'wide',
          fields: [
            { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx) },
            { name: 'categoryId', label: 'Category', type: 'select', options: (page.categories || []).map((c) => ({ value: c.id, label: c.name })) },
            { name: 'supplierId', label: 'Supplier', type: 'select', options: (page.suppliers || []).map((s) => ({ value: s.id, label: s.name })) },
            { name: 'description', label: 'Description', required: true, span: 2 },
            { name: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true },
            { name: 'expenseDate', label: 'Date', type: 'date', value: R.today() },
            { name: 'submit', label: 'Submit for approval', type: 'checkbox', value: true, span: 2 }
          ]
        });
      } else if (name === 'supplier') {
        ctx.openModal({
          title: 'Add supplier', endpoint: '/suppliers', submitLabel: 'Save supplier',
          fields: [
            { name: 'name', label: 'Supplier name', required: true, span: 2 },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'phone', label: 'Phone' }
          ],
          transform: (data) => {
            const body = { name: data.name, contactDetails: { email: data.email || null, phone: data.phone || null } };
            return body;
          }
        });
      } else if (name === 'category') {
        ctx.openModal({ title: 'Add expense category', endpoint: '/expense-categories', submitLabel: 'Add category', fields: [
          { name: 'name', label: 'Category name', required: true, span: 2 }
        ] });
      } else if (name === 'rejectExpense' && id) {
        ctx.openModal({ title: 'Reject expense', endpoint: '/expenses/' + id + '/review', submitLabel: 'Reject', fields: [
          { name: 'decision', label: 'Decision', type: 'hidden', value: 'rejected' },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true, span: 2 }
        ] });
      }
    }
  };

  V.inventory = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.branchId) query.set('branchId', ctx.filters.branchId);
      if (ctx.filters.low === 'true') query.set('low', 'true');
      const [items, branches] = await Promise.all([
        R.api('GET', '/inventory' + (query.toString() ? '?' + query : '')).then((p) => p.data).catch(() => []),
        ctx.has('organisation.read.daycare') ? R.api('GET', '/branches').then((p) => p.data).catch(() => []) : Promise.resolve([])
      ]);
      let transactions = [];
      let selected = null;
      if (ctx.filters.itemId) {
        selected = (items || []).find((i) => i.id === ctx.filters.itemId) || null;
        transactions = await R.api('GET', '/inventory/' + encodeURIComponent(ctx.filters.itemId) + '/transactions')
          .then((p) => p.data).catch(() => []);
      }
      return { rows: items || [], branches: branches || [], transactions, selected };
    },

    render(ctx, params, page) {
      const rows = page.rows || [];
      const low = rows.filter((r) => r.is_low);
      return R.pageHead('Inventory', 'Stock, supplies and the things a classroom runs out of at the worst moment.',
        '<button class="btn btn-secondary btn-sm" @click="setFilter(\'low\', \'' + (ctx.filters.low === 'true' ? '' : 'true') + '\')">' + R.icon('alert-triangle') + ' ' + (ctx.filters.low === 'true' ? 'Show all' : 'Low stock only') + '</button>' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'inventoryItem\')">' + R.icon('plus') + ' Add item</button>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Items', value: R.number(rows.length), icon: 'package', foot: 'Active stock lines' }) +
        R.statCard({ label: 'Low stock', value: R.number(low.length), icon: 'alert-triangle', tone: low.length ? 'danger' : 'green', foot: 'At or below minimum' }) +
        R.statCard({ label: 'Branches', value: R.number(new Set(rows.map((r) => r.branch_id)).size), icon: 'building-2', tone: 'sky' }) +
        R.statCard({ label: 'Units on hand', value: R.number(rows.reduce((s, r) => s + Number(r.quantity_on_hand || 0), 0)), icon: 'boxes', tone: 'plum' }) +
        '</div>' +
        R.filterBar(R.selectFilter(ctx, 'branchId', R.branchOptions(ctx), 'All branches')) +
        '<div class="split"><div class="stack">' +
        R.card('Stock register', R.table({ rows, columns: [
          { label: 'Item', render: (i) => '<button class="link-strong" @click="setFilter(\'itemId\',\'' + R.attr(i.id) + '\')">' + R.esc(i.name) + '</button><span class="cell-sub">' + R.esc(R.titleCase(i.category)) + '</span>' },
          { label: 'Branch', render: (i) => R.esc(i.branch_name || '—') },
          { label: 'On hand', align: 'right', render: (i) => R.number(i.quantity_on_hand) + ' <span class="muted small">' + R.esc(i.unit) + '</span>' },
          { label: 'Minimum', align: 'right', render: (i) => R.number(i.minimum_quantity) },
          { label: 'Location', render: (i) => R.esc(i.storage_location || '—') },
          { label: 'State', render: (i) => i.is_low ? '<span class="badge badge-danger">Low</span>' : '<span class="badge badge-green">OK</span>' },
          { label: '', align: 'right', render: (i) => '<div class="btn-group">' +
            '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'stock\',\'' + R.attr(i.id) + '\')">Adjust</button>' +
            '<button class="btn btn-sm btn-ghost" @click="setFilter(\'itemId\',\'' + R.attr(i.id) + '\')">History</button></div>' }
        ], emptyTitle: 'No stock items', emptyMessage: 'Add nappies, paint, snacks — anything you need to keep count of.' }),
          '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'inventoryItem\')">' + R.icon('plus') + ' Add item</button>') +
        '</div><div class="stack">' +
        (page.selected ? R.card('History · ' + page.selected.name, R.table({ rows: page.transactions || [], compact: true, columns: [
          { label: 'When', render: (t) => R.dateTime(t.created_at) },
          { label: 'Type', render: (t) => '<span class="badge badge-muted">' + R.esc(R.titleCase(t.transaction_type)) + '</span>' },
          { label: 'Change', align: 'right', render: (t) => (Number(t.quantity_delta) > 0 ? '+' : '') + R.number(t.quantity_delta) },
          { label: 'By', render: (t) => R.esc(t.created_by_name || '—') }
        ], emptyTitle: 'No movements yet' }), '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'stock\',\'' + R.attr(page.selected.id) + '\')">Record movement</button>') :
          R.card('Stock history', '<p class="muted small">Choose an item to see every receipt, issue and adjustment.</p>')) +
        '</div></div>';
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      if (name === 'inventoryItem') {
        ctx.openModal({
          title: 'Add stock item', endpoint: '/inventory', submitLabel: 'Add item', size: 'wide',
          fields: [
            { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx) },
            { name: 'name', label: 'Item name', required: true },
            { name: 'category', label: 'Category', placeholder: 'consumables' },
            { name: 'unit', label: 'Unit', value: 'units' },
            { name: 'quantityOnHand', label: 'Opening quantity', type: 'number', value: 0 },
            { name: 'minimumQuantity', label: 'Minimum quantity', type: 'number', value: 0 },
            { name: 'storageLocation', label: 'Storage location', span: 2 }
          ]
        });
      } else if (name === 'stock' && id) {
        const item = (page.rows || []).find((i) => i.id === id) || {};
        ctx.openModal({
          title: 'Stock movement · ' + (item.name || ''), endpoint: '/inventory/' + id + '/transactions', submitLabel: 'Record movement',
          fields: [
            { name: 'transactionType', label: 'Movement', type: 'select', required: true, options: [
              { value: 'received', label: 'Received' }, { value: 'issued', label: 'Issued' },
              { value: 'adjustment', label: 'Adjustment (set counted quantity)' }, { value: 'write_off', label: 'Write off' }
            ] },
            { name: 'quantity', label: 'Quantity', type: 'number', step: '0.01', required: true },
            { name: 'reference', label: 'Reference' },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
          ]
        });
      }
    }
  };
})();
