'use strict';

/* Operations: tasks, reports, the public website and automation rules. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const TASK_STATUSES = ['open', 'in_progress', 'blocked', 'done', 'cancelled'];
  const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
  const TRIGGERS = [
    { value: 'learner.absent', label: 'Learner marked absent' },
    { value: 'invoice.overdue', label: 'Invoice becomes overdue' },
    { value: 'incident.reported', label: 'Incident reported' },
    { value: 'application.received', label: 'Application received' },
    { value: 'staff_document.expiring', label: 'Staff document expiring' },
    { value: 'observation.published', label: 'Observation published' }
  ];
  const ACTIONS = [
    { value: 'send_notification', label: 'Send a notification' },
    { value: 'create_task', label: 'Create a task' },
    { value: 'send_email', label: 'Send an email' }
  ];

  V.tasks = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.status) query.set('status', ctx.filters.status);
      if (ctx.filters.mine === 'true') query.set('mine', 'true');
      const [counts, tasks, members] = await Promise.all([
        R.api('GET', '/tasks/overview/counts').then((p) => p.data).catch(() => ({})),
        R.api('GET', '/tasks' + (query.toString() ? '?' + query : '')).then((p) => p.data).catch(() => []),
        ctx.has('tasks.manage.daycare')
          ? R.api('GET', '/access/memberships').then((p) => p.data).catch(() => [])
          : Promise.resolve([])
      ]);
      return { counts: counts || {}, rows: tasks || [], members: members || [] };
    },

    render(ctx, params, page) {
      const counts = page.counts || {};
      const rows = page.rows || [];
      const mine = ctx.filters.mine === 'true';
      return R.pageHead('Tasks', 'The work that keeps the centre running, assigned and visible.',
        '<button class="btn btn-secondary btn-sm" @click="setFilter(\'mine\', \'' + (mine ? '' : 'true') + '\')">' + R.icon('user-check') + ' ' + (mine ? 'Show all' : 'Only mine') + '</button>' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'task\')">' + R.icon('list-plus') + ' New task</button>' + R.exportButtons('/exports/tasks')) +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Open', value: R.number(counts.open), icon: 'circle-dot', tone: 'sky', foot: 'Waiting to start' }) +
        R.statCard({ label: 'In progress', value: R.number(counts.in_progress), icon: 'loader', tone: 'sun', foot: 'Being worked on' }) +
        R.statCard({ label: 'Blocked', value: R.number(counts.blocked), icon: 'octagon-alert', tone: Number(counts.blocked) ? 'danger' : 'green', foot: 'Needs unblocking' }) +
        R.statCard({ label: 'Overdue', value: R.number(counts.overdue), icon: 'alarm-clock', tone: Number(counts.overdue) ? 'danger' : 'green', foot: R.number(counts.recently_done) + ' done in 7 days' }) +
        '</div>' +
        R.filterBar(
          R.selectFilter(ctx, 'status', TASK_STATUSES.map((s) => ({ value: s, label: R.titleCase(s) })), 'All statuses') +
          R.selectFilter(ctx, 'mine', [{ value: 'true', label: 'Assigned to me' }], 'Everyone')) +
        (ctx.has('tasks.manage.daycare') ? R.bulkBar([
          { label: 'Complete selected', icon: 'check-circle-2', path: '/tasks/bulk', action: 'complete' },
          { label: 'Reopen selected', icon: 'rotate-ccw', path: '/tasks/bulk', action: 'reopen' }
        ]) : '') +
        R.table({ rows, selectable: ctx.has('tasks.manage.daycare'), columns: [
          { label: 'Task', render: (t) => '<button class="link-strong" @click="openNamedModal(\'taskView\',\'' + R.attr(t.id) + '\')">' + R.esc(t.title) + '</button><span class="cell-sub">' + R.esc(R.truncate(t.description || '', 80)) + '</span>' },
          { label: 'Status', render: (t) => R.badge(t.status) },
          { label: 'Priority', render: (t) => '<span class="badge ' + R.priorityTone(t.priority) + '">' + R.esc(t.priority) + '</span>' },
          { label: 'Assignee', render: (t) => R.esc(t.assignee_name || 'Unassigned') },
          { label: 'Checklist', render: (t) => Number(t.checklist_total)
            ? '<span class="badge ' + (Number(t.checklist_done) === Number(t.checklist_total) ? 'badge-success' : 'badge-muted') + '">' + R.number(t.checklist_done) + '/' + R.number(t.checklist_total) + '</span>'
            : '<span class="muted small">—</span>' },
          { label: 'Due', render: (t) => '<span class="' + (t.due_at && new Date(t.due_at) < new Date() && !['done', 'cancelled'].includes(t.status) ? 'badge badge-danger' : '') + '">' + R.date(t.due_at) + '</span>' },
          { label: '', align: 'right', render: (t) => '<div class="btn-group">' +
            (['open', 'in_progress', 'blocked'].includes(t.status) ? '<button class="btn btn-sm btn-secondary" @click="act(\'PATCH\',\'/tasks/' + R.attr(t.id) + '\',{status:\'done\'},{successMessage:\'Task completed\'})">Done</button>' : '') +
            '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'editTask\',\'' + R.attr(t.id) + '\')">Edit</button></div>' }
        ], emptyTitle: 'No tasks', emptyMessage: 'Create a task so nothing is forgotten.', emptyAction: '<button class="btn btn-primary" @click="openNamedModal(\'task\')">New task</button>' });
    },

    renderChecklist(task) {
      const items = task.checklist || [];
      const done = items.filter((i) => i.completed_at).length;
      const body = items.length
        ? '<div class="stack">' + items.map((item) => (
          '<div class="row" style="align-items:flex-start;gap:10px">' +
          '<button class="btn btn-ghost btn-icon btn-sm" aria-label="' + (item.completed_at ? 'Reopen item' : 'Complete item') + '" ' +
          '@click="toggleChecklist(\'' + R.attr(task.id) + '\',\'' + R.attr(item.id) + '\',' + (item.completed_at ? 'true' : 'false') + ')">' +
          R.icon(item.completed_at ? 'check-circle-2' : 'circle') + '</button>' +
          '<div style="flex:1"><span class="' + (item.completed_at ? 'muted' : '') + '"' + (item.completed_at ? ' style="text-decoration:line-through"' : '') + '>' + R.esc(item.label) + '</span>' +
          (item.completed_at ? '<span class="cell-sub">Completed ' + R.relative(item.completed_at) + (item.completed_by_name ? ' by ' + R.esc(item.completed_by_name) : '') + '</span>' : '') +
          '</div></div>'
        )).join('') + '</div>'
        : '<p class="muted small">No checklist on this task.</p>';
      return '<div class="section"></div><div class="row" style="justify-content:space-between;align-items:center">' +
        '<h3>Checklist</h3>' +
        (items.length ? '<span class="badge ' + (done === items.length ? 'badge-success' : 'badge-muted') + '">' + done + '/' + items.length + '</span>' : '') +
        '</div>' + body +
        '<div class="row" style="margin-top:12px"><button class="btn btn-secondary btn-sm" @click="closeModal(); openNamedModal(\'taskChecklist\',\'' + R.attr(task.id) + '\')">' + R.icon('list-plus') + ' Add items</button></div>';
    },

    async openModal(ctx, name, id) {
      const page = ctx.page || {};
      const members = page.members || [];
      const assigneeOptions = members.filter((m) => m.user_id).map((m) => ({ value: m.user_id, label: m.display_name }));
      if (name === 'task') {
        ctx.openModal({
          title: 'New task', endpoint: '/tasks', submitLabel: 'Create task', size: 'wide',
          fields: [
            { name: 'title', label: 'Task title', required: true, span: 2 },
            { name: 'description', label: 'Description', type: 'textarea', span: 2 },
            { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES.map((p) => ({ value: p, label: R.titleCase(p) })), value: 'medium' },
            { name: 'dueAt', label: 'Due date', type: 'date' },
            ...(assigneeOptions.length ? [{ name: 'staffIds', label: 'Assign to', type: 'multiselect', span: 2, options: R.memberOptions(members), placeholder: 'Search people…', help: 'Select one or more people. Each person receives their own task.' }] : []),
            ...(R.branchOptions(ctx).length ? [{ name: 'branchId', label: 'Branch', type: 'select', options: R.branchOptions(ctx) }] : []),
            { name: 'checklist', label: 'Checklist', type: 'textarea', span: 2, help: 'One item per line. Useful for cleaning rounds, kitchen preparation or trip preparation.' }
          ],
          transform(data) {
            return Object.assign({}, data, {
              checklist: String(data.checklist || '').split('\n').map((line) => line.trim()).filter(Boolean)
            });
          }
        });
      } else if (name === 'editTask' && id) {
        const task = (page.rows || []).find((t) => t.id === id) || {};
        ctx.openModal({
          title: 'Edit task', endpoint: '/tasks/' + id, method: 'PATCH', submitLabel: 'Save changes', size: 'wide',
          fields: [
            { name: 'title', label: 'Task title', value: task.title, required: true, span: 2 },
            { name: 'description', label: 'Description', type: 'textarea', value: task.description, span: 2 },
            { name: 'status', label: 'Status', type: 'select', value: task.status, options: TASK_STATUSES.map((s) => ({ value: s, label: R.titleCase(s) })) },
            { name: 'priority', label: 'Priority', type: 'select', value: task.priority, options: PRIORITIES.map((p) => ({ value: p, label: R.titleCase(p) })) },
            { name: 'dueAt', label: 'Due date', type: 'date', value: task.due_at ? String(task.due_at).slice(0, 10) : '' },
            ...(assigneeOptions.length ? [{ name: 'assignedTo', label: 'Assign to', type: 'select', value: task.assigned_to || '', options: assigneeOptions }] : [])
          ]
        });
      } else if (name === 'taskView' && id) {
        try {
          const payload = await R.api('GET', '/tasks/' + encodeURIComponent(id));
          const t = payload.data || {};
          const comments = t.comments || [];
          const html = '<div class="row" style="justify-content:space-between;align-items:flex-start">' +
            '<div><div class="cell-strong" style="font-size:1.05rem">' + R.esc(t.title) + '</div>' +
            '<div class="muted small">Created ' + R.relative(t.created_at) + ' by ' + R.esc(t.creator_name || 'Unknown') + '</div></div>' +
            '<div style="text-align:right">' + R.badge(t.status) + ' <span class="badge ' + R.priorityTone(t.priority) + '">' + R.esc(t.priority) + '</span></div></div>' +
            '<div class="section"></div><p style="white-space:pre-wrap">' + R.esc(t.description || 'No description provided.') + '</p>' +
            '<div class="section"></div><div class="detail-list">' +
            R.detailItem('Assignee', R.esc((t.assignee || {}).display_name || 'Unassigned')) +
            R.detailItem('Due', R.date(t.due_at)) +
            R.detailItem('Completed', t.completed_at ? R.dateTime(t.completed_at) : 'Not yet') +
            '</div>' +
            this.renderChecklist(t) +
            '<div class="section"></div><h3>Comments</h3>' +
            (comments.length ? '<div class="stack">' + comments.map((c) => '<div class="detail-item"><div class="d-label">' + R.esc(c.author_name || 'Unknown') + ' · ' + R.relative(c.created_at) + '</div><div style="white-space:pre-wrap">' + R.esc(c.body) + '</div></div>').join('') + '</div>' : '<p class="muted small">No comments yet.</p>') +
            '<div class="row" style="margin-top:12px"><button class="btn btn-secondary btn-sm" @click="closeModal(); openNamedModal(\'taskComment\',\'' + R.attr(t.id) + '\')">' + R.icon('message-plus') + ' Add comment</button>' +
            (['open', 'in_progress', 'blocked'].includes(t.status) ? '<button class="btn btn-primary btn-sm" @click="closeModal(); act(\'PATCH\',\'/tasks/' + R.attr(t.id) + '\',{status:\'done\'},{successMessage:\'Task completed\'})">Mark done</button>' : '') +
            '</div>';
          ctx.openDetail('Task · ' + t.title, html, 'wide');
        } catch (error) {
          ctx.toast(error.message || 'The task could not be opened.', 'error');
        }
      } else if (name === 'taskChecklist' && id) {
        ctx.openModal({
          title: 'Add checklist items', endpoint: '/tasks/' + id + '/checklist', submitLabel: 'Add items',
          fields: [{ name: 'items', label: 'Items', type: 'textarea', required: true, span: 2, help: 'One item per line.' }],
          transform(data) {
            return { items: String(data.items || '').split('\n').map((line) => line.trim()).filter(Boolean) };
          }
        });
      } else if (name === 'taskComment' && id) {
        ctx.openModal({
          title: 'Add comment', endpoint: '/tasks/' + id + '/comments', submitLabel: 'Post comment',
          fields: [{ name: 'body', label: 'Comment', type: 'textarea', required: true, span: 2 }]
        });
      }
    }
  };

  V.reports = {
    async load(ctx) {
      const catalogue = await R.api('GET', '/reports').then((p) => p.data).catch(() => ({ catalogue: [], jobs: [] }));
      const list = catalogue.catalogue || [];
      const selected = ctx.filters.report || (list[0] && list[0].key) || null;
      const from = ctx.filters.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = ctx.filters.to || R.today();
      let report = null;
      if (selected) {
        report = await R.api('GET', '/reports/' + encodeURIComponent(selected) + '?from=' + from + '&to=' + to)
          .then((p) => p.data).catch(() => null);
      }
      return { catalogue: list, jobs: catalogue.jobs || [], selected, report, from, to };
    },

    render(ctx, params, page) {
      const catalogue = page.catalogue || [];
      const report = page.report;
      const selected = page.selected;
      const rows = (report && report.rows) || [];
      const keys = rows.length ? Object.keys(rows[0]) : [];
      const columns = keys.map((key) => ({
        label: R.titleCase(key.replace(/_/g, ' ')),
        render: (row) => {
          const value = row[key];
          if (value === null || value === undefined) return '';
          if (typeof value === 'number') return R.number(value);
          if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) return R.date(value);
          if (typeof value === 'boolean') return value ? 'Yes' : 'No';
          return R.esc(String(value));
        }
      }));
      return R.pageHead('Reports', 'The numbers behind the decisions — exported, dated and auditable.',
        R.exportButtons('/reports/' + (selected || 'enrolment_summary'), 'from=' + encodeURIComponent(page.from) + '&to=' + encodeURIComponent(page.to))) +
        '<div class="grid grid-3 section">' + catalogue.map((c) => R.card(c.name,
          '<p class="muted small" style="margin:0 0 10px">' + R.esc(c.description) + '</p>' +
          '<div class="row"><span class="badge badge-muted mono">' + R.esc(c.key) + '</span>' +
          '<button class="btn btn-sm ' + (c.key === selected ? 'btn-primary' : 'btn-secondary') + ' row-end" @click="setFilter(\'report\',\'' + R.attr(c.key) + '\')">' + (c.key === selected ? 'Viewing' : 'Open') + '</button></div>')).join('') +
        '</div>' +
        (catalogue.length ? '' : R.emptyState('No reports available', 'Your role does not include any report permissions.', '', 'bar-chart-3')) +
        (report ? '<div class="section"></div>' + R.filterBar(
          '<label class="small muted">From</label><input class="input" type="date" value="' + R.attr(page.from) + '" @change="setFilter(\'from\',$event.target.value)">' +
          '<label class="small muted">To</label><input class="input" type="date" value="' + R.attr(page.to) + '" @change="setFilter(\'to\',$event.target.value)">' +
          '<span class="badge badge-sky row-end">' + R.number(rows.length) + ' rows</span>') +
          R.card(report.report ? report.report.name : 'Report', R.table({ rows, columns, compact: true, emptyTitle: 'No data in this range', emptyMessage: 'Try widening the date range.' }),
            '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'reportJob\',\'' + R.attr(selected) + '\')">' + R.icon('calendar-plus') + ' Save as job</button>') : '') +
        '<div class="section"></div>' + R.card('Recent report jobs', R.table({ rows: page.jobs || [], compact: true, columns: [
          { label: 'Report', render: (j) => '<span class="mono small">' + R.esc(j.report_key) + '</span>' },
          { label: 'Status', render: (j) => R.badge(j.status) },
          { label: 'Rows', align: 'right', render: (j) => R.number(j.row_count) },
          { label: 'Requested by', render: (j) => R.esc(j.requested_by_name || '—') },
          { label: 'When', render: (j) => R.relative(j.created_at) }
        ], emptyTitle: 'No report jobs', emptyMessage: 'Export a report to record a job.' }));
    },

    openModal(ctx, name, id) {
      if (name === 'reportJob') {
        ctx.openModal({
          title: 'Queue a report job', endpoint: '/reports/jobs', submitLabel: 'Create job',
          description: 'Record this report request so the export is traceable in the audit trail.',
          fields: [
            { name: 'reportKey', label: 'Report', type: 'select', required: true, value: id || '', options: ((ctx.page || {}).catalogue || []).map((c) => ({ value: c.key, label: c.name })) },
            { name: 'note', label: 'Note', type: 'textarea', span: 2 }
          ],
          transform: (data) => ({ reportKey: data.reportKey, parameters: { note: data.note || null } })
        });
      }
    }
  };

  function editorField(label, model, options) {
    const opts = options || {};
    const control = opts.textarea
      ? '<textarea class="textarea" rows="' + (opts.rows || 3) + '" x-model="' + model + '"' +
        (opts.placeholder ? ' placeholder="' + R.attr(opts.placeholder) + '"' : '') + '></textarea>'
      : '<input class="input" type="' + (opts.type || 'text') + '" x-model="' + model + '"' +
        (opts.placeholder ? ' placeholder="' + R.attr(opts.placeholder) + '"' : '') +
        (opts.list ? ' list="' + R.attr(opts.list) + '"' : '') + '>';
    return '<div class="field' + (opts.span ? ' span-2' : '') + '"><label>' + R.esc(label) + '</label>' +
      control + (opts.help ? '<div class="hint">' + R.esc(opts.help) + '</div>' : '') + '</div>';
  }

  // Suggestions for the button-link fields. Any value is still allowed — these
  // just save the owner from remembering the page paths.
  const SITE_LINK_OPTIONS = [
    { value: '/apply', label: 'Enquiry form' },
    { value: '/', label: 'Home' },
    { value: '/about', label: 'About' },
    { value: '/programmes', label: 'Programmes' },
    { value: '/admissions', label: 'Admissions' },
    { value: '/gallery', label: 'Gallery' },
    { value: '/contact', label: 'Contact' },
    { value: '/forms', label: 'Forms' }
  ];

  function siteLinkDatalist() {
    return '<datalist id="site-link-options">' + SITE_LINK_OPTIONS.map((option) =>
      '<option value="' + R.attr(option.value) + '">' + R.esc(option.label) + '</option>').join('') + '</datalist>';
  }

  function editorImage(label, model, pathExpression, help) {
    return '<div class="field span-2"><label>' + R.esc(label) + '</label>' +
      '<div class="site-image-row">' +
      '<input class="input" type="url" x-model="' + model + '" placeholder="https://… or /assets/…">' +
      '<label class="btn btn-secondary btn-sm site-file-btn">' + R.icon('upload') + ' Upload' +
      '<input type="file" accept="image/*" @change="uploadSiteImage(' + pathExpression + ', $event)"></label>' +
      '<button type="button" class="btn btn-ghost btn-sm" x-show="' + model + '" @click="setSiteValue(' + pathExpression + ', \'\')" aria-label="Remove image">' + R.icon('x') + '</button>' +
      '</div>' +
      '<div class="hint" x-show="siteBusy === ' + pathExpression + '">Uploading…</div>' +
      '<div class="hint">' + R.esc(help || 'Upload a photo or paste a direct image URL.') + '</div>' +
      '<template x-if="' + model + '"><img class="site-edit-thumb" :src="' + model + '" alt=""></template>' +
      '</div>';
  }

  function repeatHead(title, path, indexExpression) {
    return '<div class="site-repeat-head"><strong>' + R.esc(title) + '</strong><div class="row" style="gap:4px">' +
      '<button type="button" class="btn btn-ghost btn-sm" @click="siteMove(\'' + path + '\', ' + indexExpression + ', -1)" aria-label="Move up">' + R.icon('arrow-up') + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" @click="siteMove(\'' + path + '\', ' + indexExpression + ', 1)" aria-label="Move down">' + R.icon('arrow-down') + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" @click="siteRemove(\'' + path + '\', ' + indexExpression + ')" aria-label="Remove">' + R.icon('trash-2') + '</button>' +
      '</div></div>';
  }

  function repeatAdd(label, expression) {
    return '<button type="button" class="btn btn-secondary btn-sm" @click="' + expression + '">' + R.icon('plus') + ' ' + R.esc(label) + '</button>';
  }

  function editorCard(title, body, actions) {
    return '<div class="card site-editor-card"><div class="card-head"><h3>' + R.esc(title) + '</h3>' +
      (actions ? '<div class="card-actions">' + actions + '</div>' : '') + '</div>' + body + '</div>';
  }

  function pagePreview(slug, key) {
    const page = SITE_PAGE_LINKS.find((entry) => entry.key === key);
    return '<a class="btn btn-ghost btn-sm" href="#/site/' + R.attr(slug) + (page && page.path ? '/' + page.path : '') + '" target="_blank" rel="noopener">' + R.icon('external-link') + ' Preview</a>';
  }

  const SITE_PAGE_LINKS = [
    { key: 'home', path: '' },
    { key: 'about', path: 'about' },
    { key: 'programmes', path: 'programmes' },
    { key: 'admissions', path: 'admissions' },
    { key: 'gallery', path: 'gallery' },
    { key: 'contact', path: 'contact' }
  ];

  V.website = {
    async load(ctx) {
      const payload = await R.api('GET', '/website').then((p) => p.data).catch(() => ({
        config: null, domains: [], content: null, seo: null, pages: [], branding: {}, organisation: null
      }));
      // Reachability is a separate probe so a slow DNS/TLS lookup never delays
      // the editor. A failure leaves `addresses` null and the card stays honest
      // by not claiming an address is live.
      const addresses = await R.api('GET', '/website/addresses').then((p) => p.data).catch(() => null);
      const config = payload.config;
      const content = payload.content || {};
      const seo = content.seo || payload.seo || {};
      // The editor works on one local draft object. Keywords are a comma list
      // in the input and are normalised back into an array by the API.
      const draft = Object.assign({}, content, {
        theme: (config && config.theme) || 'nature',
        seo: Object.assign({}, seo, {
          keywords: Array.isArray(seo.keywords) ? seo.keywords.join(', ') : (seo.keywords || '')
        })
      });
      ctx.siteDraft = draft;
      ctx.siteTab = ctx.siteTab || 'home';
      ctx.siteBusy = null;
      ctx.siteSaving = false;
      ctx.siteError = null;
      ctx.siteSavedAt = (config && (config.updated_at || config.published_at)) || null;
      return {
        config,
        domains: payload.domains || [],
        content,
        seo: payload.seo || seo,
        pages: payload.pages || SITE_PAGE_LINKS.map((entry) => ({ key: entry.key, label: R.titleCase(entry.key), path: entry.path })),
        branding: payload.branding || {},
        addresses,
        organisation: payload.organisation || (ctx.activeMembership && ctx.activeMembership.organisation) || {}
      };
    },

    render(ctx, params, page) {
      const config = page.config;
      const organisation = page.organisation || {};
      const slug = organisation.slug || (config && config.slug) || (ctx.activeMembership && ctx.activeMembership.organisation.slug) || '';
      const canManage = ctx.has('website.manage.daycare');
      const branding = page.branding || {};
      const seo = page.seo || {};
      const status = config ? config.status : 'not_configured';
      const keywords = Array.isArray(seo.keywords) ? seo.keywords.length : 0;
      const tabs = [
        { key: 'home', label: 'Home' },
        { key: 'about', label: 'About' },
        { key: 'programmes', label: 'Programmes' },
        { key: 'admissions', label: 'Admissions' },
        { key: 'gallery', label: 'Gallery' },
        { key: 'contact', label: 'Contact' },
        { key: 'seo', label: 'SEO' },
        { key: 'domains', label: 'Domains' }
      ];
      const tabButtons = tabs.map((tab) => '<button type="button" class="tab" :class="siteTab === \'' + tab.key + '\' ? \'tab active\' : \'tab\'" @click="siteTab = \'' + tab.key + '\'">' + R.esc(tab.label) + '</button>').join('');

      return R.pageHead('Public website', 'The shopfront families see before they ever walk through the door.',
        (config ? '<a class="btn btn-secondary btn-sm" href="#/site/' + R.attr(slug) + '" target="_blank" rel="noopener">' + R.icon('external-link') + ' Open site</a>' : '') +
        (canManage ? '<button class="btn btn-secondary btn-sm" @click="saveSiteDraft()" :disabled="siteSaving"><span class="spinner" x-show="siteSaving" style="width:14px;height:14px"></span> Save draft</button>' : '') +
        (canManage ? '<button class="btn btn-primary btn-sm" @click="publishSite()" :disabled="siteSaving">' + R.icon('rocket') + ' Publish</button>' : '')) +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Status', value: R.titleCase(status), icon: 'globe', tone: status === 'published' ? 'green' : 'sun', foot: config && config.published_at ? 'Published ' + R.relative(config.published_at) : 'Not published yet' }) +
        R.statCard({ label: 'Pages', value: R.number((page.pages || []).length || 6), icon: 'files', tone: 'sky', foot: 'Home, about, programmes, admissions, gallery, contact' }) +
        R.statCard({ label: 'SEO keywords', value: R.number(keywords), icon: 'search', tone: 'plum', foot: 'Used in the page meta tags' }) +
        R.statCard({ label: 'Last saved', value: ctx.siteSavedAt ? R.relative(ctx.siteSavedAt) : 'Not yet', icon: 'save', tone: 'clay', foot: 'Draft changes' }) +
        '</div>' +
        '<div class="alert alert-danger" x-show="siteError" x-cloak style="margin-bottom:12px"><i data-lucide="alert-circle"></i><span x-text="siteError"></span></div>' +
        editorCard('Branding',
          '<div class="site-branding-strip">' +
          '<div class="site-branding-logo">' + (organisation.logoUrl ? '<img src="' + R.attr(organisation.logoUrl) + '" alt="' + R.attr(organisation.name || '') + '">' : '<span class="brand-logo-fallback">' + R.esc(String(organisation.name || 'R').charAt(0).toUpperCase()) + '</span>') + '</div>' +
          '<div class="site-branding-copy"><div class="strong">' + R.esc(organisation.name || 'Your centre') + '</div>' +
          '<p class="muted small">Your website automatically uses your organisation logo, colours and typography. Update them once in Organisation settings and every page follows.</p>' +
          '<div class="swatch-row">' + ['primary', 'secondary', 'accent', 'background', 'surface', 'text'].map((token) =>
            '<span class="swatch" style="background:' + R.attr(branding[token] || '#cccccc') + '" title="' + R.esc(token) + '"></span>').join('') + '</div></div>' +
          '<a class="btn btn-secondary btn-sm" href="#/app/settings">' + R.icon('palette') + ' Manage branding</a>' +
          '</div>', pagePreview(slug, 'home')) +
        '<div class="site-tabs section">' + tabButtons + '</div>' +
        siteLinkDatalist() +
        '<p class="muted small" style="margin:-4px 0 14px">Wrap words in *asterisks* to make them bold, and leave a blank line between paragraphs. Button links can be a page path such as /programmes, a full https:// address, mailto: or tel:.</p>' +
        this.renderHomePanel(ctx, slug, canManage, config) +
        this.renderAboutPanel(ctx, slug, canManage) +
        this.renderProgrammesPanel(ctx, slug, canManage) +
        this.renderAdmissionsPanel(ctx, slug, canManage) +
        this.renderGalleryPanel(ctx, slug, canManage) +
        this.renderContactPanel(ctx, slug, canManage) +
        this.renderSeoPanel(ctx, slug, canManage) +
        '<div class="site-editor-panel" x-show="siteTab === \'domains\'" x-cloak>' + this.renderDomains(ctx, page) + '</div>' +
        (canManage ? '<div class="site-save-bar"><span class="muted small">Changes stay private until you publish.</span><span class="spacer"></span>' +
          '<button type="button" class="btn btn-secondary" @click="saveSiteDraft()" :disabled="siteSaving">Save draft</button>' +
          '<button type="button" class="btn btn-primary" @click="publishSite()" :disabled="siteSaving">Publish website</button></div>' : '');
    },

    renderHomePanel(ctx, slug, canManage) {
      return '<div class="site-editor-panel" x-show="siteTab === \'home\'" x-cloak>' +
        editorCard('Hero', '<div class="form-grid">' +
          editorField('Badge', 'siteDraft.hero.badge', { placeholder: 'Registered ECD centre' }) +
          editorField('Headline', 'siteDraft.hero.headline', { span: true, placeholder: 'Where little minds grow' }) +
          editorField('Subheadline', 'siteDraft.hero.subheadline', { span: true, textarea: true, rows: 3, placeholder: 'A warm, play-based early learning home.' }) +
          editorField('Button label', 'siteDraft.hero.cta', { placeholder: 'Book a visit' }) +
          editorField('First button link', 'siteDraft.hero.ctaHref', { list: 'site-link-options', placeholder: '/apply', help: 'Where the main button goes. Leave blank to use the enquiry form.' }) +
          editorField('Second button label', 'siteDraft.hero.secondaryCta', { placeholder: 'Explore programmes' }) +
          editorField('Second button link', 'siteDraft.hero.secondaryHref', { list: 'site-link-options', placeholder: '/programmes', help: 'Where the second button goes. Leave blank to use the programmes page.' }) +
          editorImage('Hero image', 'siteDraft.hero.image', '\'hero.image\'', 'A bright, welcoming photo works best. It appears beside the headline on the home page.') +
          editorField('Announcement', 'siteDraft.announcement', { span: true, textarea: true, rows: 2, placeholder: 'Optional notice shown at the top of the home page' }) +
          '</div>', pagePreview(slug, 'home')) +
        editorCard('Hero statistics', '<p class="muted small">Short facts shown under the hero buttons.</p>' +
          '<template x-for="(stat, index) in siteDraft.hero.stats" :key="index"><div class="site-repeat">' +
          repeatHead('Fact', 'hero.stats', 'index') +
          '<div class="form-grid">' +
          '<div class="field"><label>Label</label><input class="input" x-model="stat.label" placeholder="Ages welcomed"></div>' +
          '<div class="field"><label>Value</label><input class="input" x-model="stat.value" placeholder="18m – 6y"></div>' +
          '</div></div></template>' +
          repeatAdd('Add a fact', 'siteAdd(\'hero.stats\', { label: \'\', value: \'\' })')) +
        editorCard('What families value', '<p class="muted small">The three or four promises shown on the home page and About page.</p>' +
          '<template x-for="(value, index) in siteDraft.about.values" :key="index"><div class="site-repeat">' +
          repeatHead('Value', 'about.values', 'index') +
          '<div class="form-grid">' +
          '<div class="field"><label>Title</label><input class="input" x-model="value.title"></div>' +
          '<div class="field span-2"><label>Description</label><textarea class="textarea" rows="2" x-model="value.description"></textarea></div>' +
          '</div></div></template>' +
          repeatAdd('Add a value', 'siteAdd(\'about.values\', { title: \'\', description: \'\' })')) +
        editorCard('About teaser', '<div class="form-grid">' +
          editorField('Heading', 'siteDraft.about.heading', { span: true }) +
          editorField('Introduction', 'siteDraft.about.body', { span: true, textarea: true, rows: 4 }) +
          editorField('Approach', 'siteDraft.about.approach', { span: true, textarea: true, rows: 3, help: 'A short statement about how children learn at your centre.' }) +
          editorImage('About image', 'siteDraft.about.image', '\'about.image\'') +
          '</div>') +
        editorCard('Family testimonials', '<p class="muted small">Optional quotes from families. Leave empty to hide the section.</p>' +
          '<template x-for="(item, index) in siteDraft.testimonials" :key="index"><div class="site-repeat">' +
          repeatHead('Testimonial', 'testimonials', 'index') +
          '<div class="form-grid">' +
          '<div class="field span-2"><label>Quote</label><textarea class="textarea" rows="2" x-model="item.quote"></textarea></div>' +
          '<div class="field"><label>Author</label><input class="input" x-model="item.author" placeholder="A parent"></div>' +
          '<div class="field"><label>Relationship</label><input class="input" x-model="item.role" placeholder="Parent of a 3-year-old"></div>' +
          '</div></div></template>' +
          repeatAdd('Add a testimonial', 'siteAdd(\'testimonials\', { quote: \'\', author: \'\', role: \'\' })')) +
        '</div>';
    },

    renderAboutPanel(ctx, slug, canManage) {
      return '<div class="site-editor-panel" x-show="siteTab === \'about\'" x-cloak>' +
        editorCard('About page', '<div class="form-grid">' +
          editorField('Page heading', 'siteDraft.about.heading', { span: true }) +
          editorField('Your story', 'siteDraft.about.body', { span: true, textarea: true, rows: 6 }) +
          editorField('Mission', 'siteDraft.about.mission', { span: true, textarea: true, rows: 3 }) +
          editorField('Our approach', 'siteDraft.about.approach', { span: true, textarea: true, rows: 4 }) +
          editorImage('About page image', 'siteDraft.about.image', '\'about.image\'') +
          '</div>', pagePreview(slug, 'about')) +
        editorCard('Our spaces and facilities', '<p class="muted small">Rooms, outdoor space, meals, security and anything else families should know.</p>' +
          '<template x-for="(facility, index) in siteDraft.facilities" :key="index"><div class="site-repeat">' +
          repeatHead('Facility', 'facilities', 'index') +
          '<div class="form-grid">' +
          '<div class="field"><label>Name</label><input class="input" x-model="facility.name" placeholder="Outdoor play garden"></div>' +
          '<div class="field span-2"><label>Description</label><textarea class="textarea" rows="2" x-model="facility.description"></textarea></div>' +
          '</div></div></template>' +
          repeatAdd('Add a facility', 'siteAdd(\'facilities\', { name: \'\', description: \'\' })')) +
        editorCard('A day at the centre', '<p class="muted small">The routine shown on the About page.</p>' +
          '<template x-for="(row, index) in siteDraft.routine" :key="index"><div class="site-repeat">' +
          repeatHead('Routine item', 'routine', 'index') +
          '<div class="form-grid">' +
          '<div class="field"><label>Time</label><input class="input" x-model="row.time" placeholder="08:00"></div>' +
          '<div class="field"><label>Activity</label><input class="input" x-model="row.activity" placeholder="Morning ring and free play"></div>' +
          '</div></div></template>' +
          repeatAdd('Add a routine item', 'siteAdd(\'routine\', { time: \'\', activity: \'\' })')) +
        '</div>';
    },

    renderProgrammesPanel(ctx, slug, canManage) {
      return '<div class="site-editor-panel" x-show="siteTab === \'programmes\'" x-cloak>' +
        editorCard('Programmes', '<p class="muted small">Each programme appears as a card with its age group, photo and fee note.</p>' +
          '<template x-for="(programme, index) in siteDraft.programmes" :key="index"><div class="site-repeat">' +
          repeatHead('Programme', 'programmes', 'index') +
          '<div class="form-grid">' +
          '<div class="field"><label>Name</label><input class="input" x-model="programme.name" placeholder="Toddler room"></div>' +
          '<div class="field"><label>Age group</label><input class="input" x-model="programme.ages" placeholder="18 months – 3 years"></div>' +
          '<div class="field"><label>Fee note</label><input class="input" x-model="programme.price" placeholder="From R4 200 per month"></div>' +
          '<div class="field span-2"><label>Description</label><textarea class="textarea" rows="3" x-model="programme.description"></textarea></div>' +
          editorImage('Programme image', 'programme.image', '\'programmes.\' + index + \'.image\'') +
          '</div></div></template>' +
          repeatAdd('Add a programme', 'siteAdd(\'programmes\', { name: \'\', ages: \'\', description: \'\', image: \'\', price: \'\' })'), pagePreview(slug, 'programmes')) +
        editorCard('Fees', '<div class="form-grid">' +
          editorField('Fee summary', 'siteDraft.fees.summary', { span: true, textarea: true, rows: 3, placeholder: 'Our fees include meals, nappies and all learning materials.' }) +
          editorField('Fee note', 'siteDraft.fees.note', { span: true, textarea: true, rows: 2, placeholder: 'Sibling discounts and annual increases are explained in the enrolment pack.' }) +
          '</div>' +
          '<template x-for="(item, index) in siteDraft.fees.items" :key="index"><div class="site-repeat">' +
          repeatHead('Fee line', 'fees.items', 'index') +
          '<div class="form-grid">' +
          '<div class="field"><label>Label</label><input class="input" x-model="item.label" placeholder="Full day (6:30 – 17:30)"></div>' +
          '<div class="field"><label>Amount</label><input class="input" x-model="item.amount" placeholder="R4 500 per month"></div>' +
          '<div class="field span-2"><label>Note</label><input class="input" x-model="item.note"></div>' +
          '</div></div></template>' +
          repeatAdd('Add a fee line', 'siteAdd(\'fees.items\', { label: \'\', amount: \'\', note: \'\' })')) +
        editorCard('Frequently asked questions', '<template x-for="(faq, index) in siteDraft.faqs" :key="index"><div class="site-repeat">' +
          repeatHead('Question', 'faqs', 'index') +
          '<div class="form-grid">' +
          '<div class="field span-2"><label>Question</label><input class="input" x-model="faq.question"></div>' +
          '<div class="field span-2"><label>Answer</label><textarea class="textarea" rows="3" x-model="faq.answer"></textarea></div>' +
          '</div></div></template>' +
          repeatAdd('Add a question', 'siteAdd(\'faqs\', { question: \'\', answer: \'\' })')) +
        '</div>';
    },

    renderAdmissionsPanel(ctx, slug, canManage) {
      return '<div class="site-editor-panel" x-show="siteTab === \'admissions\'" x-cloak>' +
        editorCard('Admissions page', '<div class="form-grid">' +
          editorField('Page heading', 'siteDraft.admissions.heading', { span: true, placeholder: 'Joining our centre' }) +
          editorField('Introduction', 'siteDraft.admissions.intro', { span: true, textarea: true, rows: 4 }) +
          editorField('Open days', 'siteDraft.admissions.openDays', { span: true, placeholder: 'Open mornings every Tuesday, 09:00 – 11:00' }) +
          editorField('Closing call to action', 'siteDraft.admissions.cta', { span: true, placeholder: 'Come and see us' }) +
          editorField('Closing call to action link', 'siteDraft.admissions.ctaHref', { span: true, list: 'site-link-options', placeholder: '/apply', help: 'Where the closing button goes. Leave blank to use the enquiry form.' }) +
          '</div>', pagePreview(slug, 'admissions')) +
        editorCard('Admissions steps', '<template x-for="(step, index) in siteDraft.admissions.steps" :key="index"><div class="site-repeat">' +
          repeatHead('Step', 'admissions.steps', 'index') +
          '<div class="form-grid">' +
          '<div class="field span-2"><label>Title</label><input class="input" x-model="step.title"></div>' +
          '<div class="field span-2"><label>Description</label><textarea class="textarea" rows="2" x-model="step.description"></textarea></div>' +
          '</div></div></template>' +
          repeatAdd('Add a step', 'siteAdd(\'admissions.steps\', { title: \'\', description: \'\' })')) +
        editorCard('What to have ready', '<p class="muted small">A short checklist for families. Shown on the admissions page.</p>' +
          '<template x-for="(item, index) in siteDraft.admissions.checklist" :key="index"><div class="site-checklist-edit">' +
          '<input class="input" x-model="siteDraft.admissions.checklist[index]" placeholder="Your child\'s birth certificate">' +
          '<button type="button" class="btn btn-ghost btn-sm" @click="siteRemove(\'admissions.checklist\', index)" aria-label="Remove">' + R.icon('x') + '</button>' +
          '</div></template>' +
          repeatAdd('Add a checklist item', 'siteAdd(\'admissions.checklist\', \'\')')) +
        '</div>';
    },

    renderGalleryPanel(ctx, slug, canManage) {
      return '<div class="site-editor-panel" x-show="siteTab === \'gallery\'" x-cloak>' +
        editorCard('Gallery', '<p class="muted small">Upload as many photos as you like. The first photo is also used as the social sharing image when no dedicated image is set.</p>' +
          '<div class="site-gallery-edit">' +
          '<template x-for="(item, index) in siteDraft.gallery" :key="index"><div class="site-repeat">' +
          repeatHead('Photo', 'gallery', 'index') +
          '<div class="form-grid">' +
          editorImage('Photo', 'item.url', '\'gallery.\' + index + \'.url\'') +
          '<div class="field span-2"><label>Caption</label><input class="input" x-model="item.caption" placeholder="Our outdoor play garden"></div>' +
          '</div></div></template>' +
          '</div>' +
          repeatAdd('Add a photo', 'siteAdd(\'gallery\', { url: \'\', caption: \'\' })'), pagePreview(slug, 'gallery')) +
        '</div>';
    },

    renderContactPanel(ctx, slug, canManage) {
      return '<div class="site-editor-panel" x-show="siteTab === \'contact\'" x-cloak>' +
        editorCard('Contact details', '<div class="form-grid">' +
          editorField('Heading', 'siteDraft.contact.heading', { span: true, placeholder: 'Come and see us' }) +
          editorField('Email', 'siteDraft.contact.email', { type: 'email' }) +
          editorField('Phone', 'siteDraft.contact.phone', { type: 'tel' }) +
          editorField('WhatsApp', 'siteDraft.contact.whatsapp', { type: 'tel' }) +
          editorField('Opening hours', 'siteDraft.contact.hours', { placeholder: 'Monday to Friday, 06:30 – 17:30' }) +
          editorField('Address', 'siteDraft.contact.address', { span: true, textarea: true, rows: 2 }) +
          editorField('Map link', 'siteDraft.contact.mapUrl', { span: true, type: 'url', placeholder: 'https://maps.google.com/…' }) +
          '</div>', pagePreview(slug, 'contact')) +
        editorCard('Social links', '<p class="muted small">Full profile URLs. Empty links are hidden from the website.</p><div class="form-grid">' +
          editorField('Facebook', 'siteDraft.social.facebook', { type: 'url' }) +
          editorField('Instagram', 'siteDraft.social.instagram', { type: 'url' }) +
          editorField('WhatsApp', 'siteDraft.social.whatsapp', { type: 'url' }) +
          editorField('YouTube', 'siteDraft.social.youtube', { type: 'url' }) +
          editorField('TikTok', 'siteDraft.social.tiktok', { type: 'url' }) +
          editorField('X', 'siteDraft.social.x', { type: 'url' }) +
          '</div>') +
        editorCard('Centre locations', '<p class="muted small">Branch names, addresses and photos are managed once in Organisation settings and appear on the contact page automatically.</p>' +
          '<a class="btn btn-secondary btn-sm" href="#/app/settings">' + R.icon('building-2') + ' Manage branches</a>') +
        '</div>';
    },

    renderSeoPanel(ctx, slug, canManage) {
      return '<div class="site-editor-panel" x-show="siteTab === \'seo\'" x-cloak>' +
        editorCard('Search and social sharing', '<div class="form-grid">' +
          editorField('Page title', 'siteDraft.seo.title', { span: true, help: 'Shown in the browser tab and search results. Keep it under 60 characters.' }) +
          editorField('Meta description', 'siteDraft.seo.description', { span: true, textarea: true, rows: 3, help: 'The sentence search engines show under your title.' }) +
          editorField('Keywords', 'siteDraft.seo.keywords', { span: true, textarea: true, rows: 3, help: 'Comma-separated. We add your centre name, suburb and programme names automatically.' }) +
          editorImage('Social sharing image', 'siteDraft.seo.image', '\'seo.image\'', 'Used for WhatsApp, Facebook and X previews. Landscape images work best.') +
          editorField('X handle', 'siteDraft.seo.twitterHandle', { placeholder: '@yourcentre' }) +
          '</div>' +
          '<div class="site-seo-preview"><div class="site-seo-preview-label">Search preview</div>' +
          '<div class="site-seo-title" x-text="siteDraft.seo.title || \'Your page title\'"></div>' +
          '<div class="site-seo-url" x-text="siteDraft.seo.canonical || ' + R.attr(JSON.stringify(R.siteUrl(slug, ''))) + '"></div>' +
          '<div class="site-seo-description" x-text="siteDraft.seo.description || \'Your meta description\'"></div></div>', pagePreview(slug, 'home')) +
        editorCard('Technical SEO', '<div class="detail-list">' +
          R.detailItem('Canonical address', '<span class="mono small">' + R.esc(R.siteUrl(slug, '')) + '</span>') +
          R.detailItem('Structured data', 'ChildCare schema with your name, address, phone and logo') +
          R.detailItem('Social cards', 'Open Graph and Twitter cards generated from the fields above') +
          R.detailItem('Sitemap', 'Each public page has its own canonical address') +
          '</div>') +
        '</div>';
    },

    renderDomains(ctx, page) {
      const canManage = ctx.has('website.manage.daycare');
      const domains = page.domains || [];
      const organisation = page.organisation || {};
      const slug = organisation.slug || '';
      const addresses = page.addresses || {};
      const freeHost = organisation.freeSubdomain || '';
      const freeUrl = freeHost ? 'https://' + freeHost : '';
      // The platform address always resolves with a valid certificate, so it is
      // the one link an owner can share the moment the site is published.
      const platformUrl = slug ? R.siteUrl(slug, '') : '';
      // Reachability comes from a real DNS/TLS probe. Until it says the free
      // subdomain answers, the card must not call it "always on".
      const freeReady = addresses.freeSubdomainReady === true;

      const statusBadge = (domain) => {
        if (domain.verification_status === 'verified' || domain.verified) return '<span class="badge badge-green">Verified</span>';
        if (domain.verification_status === 'failed') return '<span class="badge badge-danger">Needs attention</span>';
        return '<span class="badge badge-sun">Pending</span>';
      };
      const tlsBadge = (domain) => (domain.ssl_status === 'active'
        ? '<span class="badge badge-green">TLS active</span>'
        : '<span class="badge badge-muted">TLS pending</span>');

      const copyButton = (value, label) => '<button type="button" class="btn btn-ghost btn-sm" @click="copyToClipboard(' +
        R.attr(JSON.stringify(value)) + ', ' + R.attr(JSON.stringify(label)) + ')" title="Copy ' + R.attr(label) + '">' +
        R.icon('copy') + '<span class="sr-only">Copy ' + R.esc(label) + '</span></button>';

      const recordRow = (type, host, value, note) => '<div class="domain-record">' +
        '<div class="domain-record-head"><span class="badge badge-sky">' + R.esc(type) + '</span>' +
        '<span class="mono small domain-record-host">' + R.esc(host) + '</span>' + copyButton(value, type + ' value') + '</div>' +
        '<div class="domain-record-value mono">' + R.esc(value) + '</div>' +
        (note ? '<div class="hint">' + R.esc(note) + '</div>' : '') + '</div>';

      const domainCard = (domain) => {
        const records = domain.records || {};
        const cname = records.cname || {};
        const txt = records.txt || {};
        const verified = domain.verification_status === 'verified' || domain.verified;
        return '<div class="domain-card">' +
          '<div class="domain-card-head">' +
          '<div style="min-width:0"><div class="strong mono domain-name">' + R.esc(domain.domain_name) + '</div>' +
          '<div class="row" style="gap:6px;margin-top:6px">' + statusBadge(domain) + tlsBadge(domain) +
          (domain.verification_method ? '<span class="badge badge-muted">' + R.esc(String(domain.verification_method).toUpperCase()) + '</span>' : '') +
          '</div></div>' +
          '<div class="btn-group row-end">' +
          (verified && domain.ssl_status === 'active' ? '<a class="btn btn-secondary btn-sm" href="https://' + R.attr(domain.domain_name) + '" target="_blank" rel="noopener">' + R.icon('external-link') + ' Open</a>' : '') +
          (canManage ? '<button type="button" class="btn btn-secondary btn-sm" @click="verifyDomain(' + R.attr(JSON.stringify(domain.id)) + ')" :disabled="domainBusy === ' + R.attr(JSON.stringify(domain.id)) + '">' +
            '<span class="spinner" x-show="domainBusy === ' + R.attr(JSON.stringify(domain.id)) + '" style="width:13px;height:13px"></span>' +
            R.icon('refresh-cw') + ' Check DNS</button>' : '') +
          (canManage ? '<button type="button" class="btn btn-ghost btn-sm" @click="removeDomain(' + R.attr(JSON.stringify(domain.id)) + ', ' + R.attr(JSON.stringify(domain.domain_name)) + ')">' + R.icon('trash-2') + ' Remove</button>' : '') +
          '</div></div>' +
          (domain.failure_reason ? '<div class="alert alert-warn" style="margin:12px 0 0"><i data-lucide="alert-triangle"></i><span>' + R.esc(domain.failure_reason) + '</span></div>' : '') +
          '<div class="domain-record-grid">' +
          (cname.host ? recordRow('CNAME', cname.host, cname.value, cname.note || 'Point the hostname at the Re-EL website edge.') : '') +
          (txt.host ? recordRow('TXT', txt.host, txt.value, txt.note || 'Proves ownership when a CNAME cannot be used, such as at an apex domain.') : '') +
          '</div>' +
          '<div class="domain-meta muted small">Added ' + R.date(domain.created_at) +
          (domain.last_checked_at ? ' · Last checked ' + R.relative(domain.last_checked_at) : ' · Not checked yet') +
          (domain.verified_at ? ' · Verified ' + R.relative(domain.verified_at) : '') + '</div>' +
          '</div>';
      };

      const freeStatus = freeReady
        ? '<span class="badge badge-green">Live</span><span class="badge badge-muted">Platform managed</span>'
        : '<span class="badge badge-sun">Not serving yet</span><span class="badge badge-muted">Platform managed</span>';
      const freeNote = freeReady
        ? 'This address answers over HTTPS and is safe to share.'
        : 'This address is reserved for your centre, but it is not answering over HTTPS yet. Share the platform link below until it is live.';

      const freeCard = '<div class="domain-card domain-card-free">' +
        '<div class="domain-card-head"><div style="min-width:0">' +
        '<div class="strong mono domain-name">' + R.esc(freeHost || 'Not available') + '</div>' +
        '<div class="row" style="gap:6px;margin-top:6px">' + freeStatus + '</div>' +
        '</div><div class="btn-group row-end">' +
        (freeReady && freeUrl ? '<a class="btn btn-secondary btn-sm" href="' + R.attr(freeUrl) + '" target="_blank" rel="noopener">' + R.icon('external-link') + ' Open</a>' : '') +
        (freeReady && freeHost ? copyButton(freeUrl, 'Website address') : '') + '</div></div>' +
        '<p class="muted small" style="margin:12px 0 0">' + freeNote + '</p>' +
        (platformUrl ? '<div class="domain-record" style="margin-top:12px"><div class="domain-record-head">' +
          '<span class="badge badge-sky">Share now</span>' +
          '<span class="mono small domain-record-host">' + R.esc(platformUrl) + '</span>' + copyButton(platformUrl, 'Platform address') + '</div>' +
          '<div class="hint">This platform link always resolves with a valid certificate, so it is safe to share today.</div></div>' : '') +
        '</div>';

      const custom = domains.length
        ? '<div class="domain-list">' + domains.map(domainCard).join('') + '</div>'
        : R.emptyState('No custom domain yet', 'Add a domain you own, publish the DNS records below, then run Check DNS. Your site stays reachable on the platform address throughout.', '', 'globe');

      return R.card('Your public addresses',
        freeCard +
        '<div class="section-head" style="margin-top:22px"><h3>Custom domains</h3>' +
        '<div class="section-actions">' +
        (canManage ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'domain\')">' + R.icon('plus') + ' Add domain</button>' : '') +
        '</div></div>' +
        custom) +
        '<div class="section"></div>' +
        R.card('How verification works', '<div class="domain-help-grid">' +
          '<div><div class="strong">1. Add the domain</div><p class="muted small">Enter the hostname without <span class="mono">https://</span>. We generate a private verification token for your organisation.</p></div>' +
          '<div><div class="strong">2. Publish one DNS record</div><p class="muted small">A <span class="mono">CNAME</span> to the Re-EL edge is best for <span class="mono">www</span> and other subdomains. Use the <span class="mono">TXT</span> record at <span class="mono">_reel-verify</span> for an apex domain.</p></div>' +
          '<div><div class="strong">3. Check DNS</div><p class="muted small">We look up the record from our servers. A CNAME also proves traffic is pointed at us, so the secure certificate can go live immediately.</p></div>' +
          '</div>' +
          '<p class="muted small" style="margin-top:12px">DNS changes can take a few hours to propagate. The domain is only served after it is verified for your organisation.</p>');
    },

    openModal(ctx, name) {
      if (name === 'domain') {
        ctx.openModal({
          title: 'Add custom domain', endpoint: '/website/domains', submitLabel: 'Add domain',
          description: 'Enter the hostname without https:// — for example www.littlesprouts.co.za. We will show the exact DNS records to publish next.',
          fields: [{ name: 'domainName', label: 'Domain name', required: true, span: 2, placeholder: 'www.example.co.za' }]
        });
      }
    }
  };

  V.automation = {
    async load(ctx) {
      const rules = await R.api('GET', '/automation-rules').then((p) => p.data).catch(() => []);
      return { rows: rules || [] };
    },

    render(ctx, params, page) {
      const rows = page.rows || [];
      return R.pageHead('Automation', 'Rules that quietly do the follow-up so people do not have to remember.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'rule\')">' + R.icon('zap') + ' New rule</button>') +
        '<div class="grid grid-3 section">' +
        R.statCard({ label: 'Rules', value: R.number(rows.length), icon: 'zap', foot: 'Configured workflows' }) +
        R.statCard({ label: 'Active', value: R.number(rows.filter((r) => r.active).length), icon: 'play-circle', tone: 'green', foot: 'Running now' }) +
        R.statCard({ label: 'Paused', value: R.number(rows.filter((r) => !r.active).length), icon: 'pause-circle', tone: 'sun', foot: 'Not currently running' }) +
        '</div>' +
        (rows.length ? '<div class="grid grid-2 section">' + rows.map((rule) => {
          const action = rule.action || {};
          const conditions = rule.conditions || {};
          const conditionKeys = Object.keys(conditions);
          return R.card(rule.name,
            '<div class="row" style="margin-bottom:8px">' + (rule.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-muted">Paused</span>') +
            '<span class="badge badge-sky mono">' + R.esc(rule.trigger_event) + '</span></div>' +
            '<div class="detail-item" style="margin-bottom:8px"><div class="d-label">Action</div><div class="d-value">' + R.esc(R.titleCase(action.type || 'not set')) + (action.message ? ' · ' + R.esc(R.truncate(action.message, 80)) : '') + '</div></div>' +
            (conditionKeys.length ? '<div class="muted small">Conditions: ' + R.esc(conditionKeys.map((k) => k + '=' + conditions[k]).join(', ')) + '</div>' : '<div class="muted small">No conditions — runs on every event.</div>') +
            '<div class="muted small" style="margin-top:8px">Created ' + R.relative(rule.created_at) + '</div>',
            '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'rule\')">' + R.icon('copy-plus') + ' Duplicate</button>');
        }).join('') + '</div>' : R.emptyState('No automation yet', 'Start with an overdue invoice reminder or an absence notification.', '<button class="btn btn-primary" @click="openNamedModal(\'rule\')">Create a rule</button>', 'zap')) +
        '<div class="section"></div>' + R.card('What automation can do', '<div class="grid grid-3">' +
          '<div><div class="strong" style="font-size:0.86rem">Send notifications</div><p class="muted small">Tell the right people when something happens — an absence, an overdue invoice, a new application.</p></div>' +
          '<div><div class="strong" style="font-size:0.86rem">Create tasks</div><p class="muted small">Give a named person a follow-up with a due date, instead of hoping someone notices.</p></div>' +
          '<div><div class="strong" style="font-size:0.86rem">Stay auditable</div><p class="muted small">Every rule is recorded, so you can see why a message was sent and who configured it.</p></div>' +
          '</div>');
    },

    openModal(ctx) {
      ctx.openModal({
        title: 'New automation rule', endpoint: '/automation-rules', submitLabel: 'Create rule', size: 'wide',
        fields: [
          { name: 'name', label: 'Rule name', required: true, span: 2, placeholder: 'Remind guardians about overdue fees' },
          { name: 'triggerEvent', label: 'When this happens', type: 'select', required: true, options: TRIGGERS },
          { name: 'actionType', label: 'Then do this', type: 'select', required: true, options: ACTIONS },
          { name: 'message', label: 'Message or task title', type: 'textarea', span: 2, placeholder: 'Your account has an outstanding balance. Please contact the office.' },
          { name: 'active', label: 'Enable immediately', type: 'checkbox', value: true }
        ],
        transform: (data) => ({
          name: data.name,
          triggerEvent: data.triggerEvent,
          conditions: {},
          action: { type: data.actionType, message: data.message || null },
          active: data.active !== false
        })
      });
    }
  };
})();
