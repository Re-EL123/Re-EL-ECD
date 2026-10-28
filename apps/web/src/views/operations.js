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
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'task\')">' + R.icon('list-plus') + ' New task</button>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Open', value: R.number(counts.open), icon: 'circle-dot', tone: 'sky', foot: 'Waiting to start' }) +
        R.statCard({ label: 'In progress', value: R.number(counts.in_progress), icon: 'loader', tone: 'sun', foot: 'Being worked on' }) +
        R.statCard({ label: 'Blocked', value: R.number(counts.blocked), icon: 'octagon-alert', tone: Number(counts.blocked) ? 'danger' : 'green', foot: 'Needs unblocking' }) +
        R.statCard({ label: 'Overdue', value: R.number(counts.overdue), icon: 'alarm-clock', tone: Number(counts.overdue) ? 'danger' : 'green', foot: R.number(counts.recently_done) + ' done in 7 days' }) +
        '</div>' +
        R.filterBar(
          R.selectFilter(ctx, 'status', TASK_STATUSES.map((s) => ({ value: s, label: R.titleCase(s) })), 'All statuses') +
          R.selectFilter(ctx, 'mine', [{ value: 'true', label: 'Assigned to me' }], 'Everyone')) +
        R.table({ rows, columns: [
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
            ...(assigneeOptions.length ? [{ name: 'assignedTo', label: 'Assign to', type: 'select', options: assigneeOptions }] : []),
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
        '<a class="btn btn-secondary btn-sm" href="/api/v1/reports/' + R.attr(selected || 'enrolment_summary') + '?from=' + R.attr(page.from) + '&to=' + R.attr(page.to) + '&format=csv" target="_blank" rel="noopener">' + R.icon('download') + ' Export CSV</a>') +
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

  V.website = {
    async load(ctx) {
      const payload = await R.api('GET', '/website').then((p) => p.data).catch(() => ({ config: null, domains: [] }));
      return { config: payload.config, domains: payload.domains || [] };
    },

    render(ctx, params, page) {
      const config = page.config;
      const draft = (config && config.draft_content) || {};
      const published = (config && config.published_content) || {};
      const hero = draft.hero || {};
      const contact = draft.contact || {};
      const domains = page.domains || [];
      const slug = (config && config.slug) || ctx.activeMembership.organisation.slug;
      const canManage = ctx.has('website.manage.daycare');
      const tab = ctx.tab || 'content';
      const status = config ? config.status : 'not_configured';
      return R.pageHead('Public website', 'The shopfront families see before they ever walk through the door.',
        (config ? '<a class="btn btn-secondary btn-sm" href="#/site/' + R.attr(slug) + '" target="_blank" rel="noopener">' + R.icon('external-link') + ' Preview</a>' : '') +
        (canManage ? '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'websiteContent\')">' + R.icon('pencil') + ' Edit content</button>' : '')) +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Status', value: R.titleCase(status), icon: 'globe', tone: status === 'published' ? 'green' : 'sun', foot: config && config.published_at ? 'Published ' + R.relative(config.published_at) : 'Not published yet' }) +
        R.statCard({ label: 'Theme', value: R.titleCase((config && config.theme) || 'nature'), icon: 'palette', tone: 'sky', foot: 'Look and feel' }) +
        R.statCard({ label: 'Custom domains', value: R.number(domains.length), icon: 'link', tone: 'plum', foot: 'Verified addresses' }) +
        R.statCard({ label: 'Public address', value: '/' + slug, icon: 'at-sign', tone: 'clay', foot: 'Share this link with families' }) +
        '</div>' +
        R.tabs([{ key: 'content', label: 'Content' }, { key: 'published', label: 'Published copy' }, { key: 'domains', label: 'Domains' }], tab) +
        (tab === 'domains' ? this.renderDomains(ctx, page) : tab === 'published' ? this.renderPublished(published, slug) : this.renderContent(ctx, page, draft, hero, contact, slug, canManage));
    },

    renderContent(ctx, page, draft, hero, contact, slug, canManage) {
      const routine = draft.routine || [];
      const faqs = draft.faqs || [];
      return '<div class="split"><div class="stack">' +
        R.card('Hero', '<div class="hero-panel"><div class="muted small" style="opacity:.8">' + R.esc((contact.address || 'Your centre')) + '</div><h2 style="margin:6px 0">' + R.esc(hero.headline || 'Add a headline') + '</h2><p style="margin:0">' + R.esc(hero.subheadline || 'Add a subheadline') + '</p><span class="btn btn-sm" style="margin-top:12px;background:#fff;color:#1f4d27">' + R.esc(hero.cta || 'Enquire now') + '</span></div>',
          canManage ? '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'websiteContent\')">Edit</button>' : '') +
        R.card('About the centre', '<p class="muted" style="white-space:pre-wrap">' + R.esc(draft.about || 'No description yet.') + '</p>' +
          '<div class="detail-list" style="margin-top:12px">' +
          R.detailItem('Fees', R.esc(draft.fees || 'Not set')) +
          R.detailItem('Email', R.esc(contact.email || 'Not set')) +
          R.detailItem('Phone', R.esc(contact.phone || 'Not set')) +
          R.detailItem('Address', R.esc(contact.address || 'Not set')) +
          '</div>') +
        R.card('Daily routine', routine.length ? R.table({ rows: routine, compact: true, columns: [
          { label: 'Time', render: (r) => '<span class="mono">' + R.esc(r.time) + '</span>' },
          { label: 'Activity', render: (r) => R.esc(r.activity) }
        ] }) : '<p class="muted small">No routine added.</p>') +
        '</div><div class="stack">' +
        R.card('Publish', '<p class="muted small">Publishing copies the draft to the live website. Editing afterwards never changes the live copy until you publish again.</p>' +
          '<div class="btn-group" style="margin-top:10px">' +
          (canManage ? '<button class="btn btn-primary" @click="confirmAction(\'Publish website\',\'The draft content will replace the live website immediately.\',\'/website/publish\',{submitLabel:\'Publish\',successMessage:\'Website published\',danger:false})">' + R.icon('rocket') + ' Publish</button>' : '') +
          (canManage && page.config && page.config.status === 'published' ? '<button class="btn btn-secondary" @click="confirmAction(\'Unpublish website\',\'The public site will stop accepting visitors until you publish again.\',\'/website/unpublish\',{submitLabel:\'Unpublish\',successMessage:\'Website unpublished\'})">Unpublish</button>' : '') +
          '</div>') +
        R.card('Frequently asked questions', faqs.length ? '<div class="stack">' + faqs.map((f) => '<div><div class="strong" style="font-size:0.88rem">' + R.esc(f.question) + '</div><div class="muted small">' + R.esc(f.answer) + '</div></div>').join('') + '</div>' : '<p class="muted small">No questions added yet.</p>') +
        R.card('Share your page', '<div class="detail-item"><div class="d-label">Public link</div><div class="d-value mono">#/site/' + R.esc(slug) + '</div></div>') +
        '</div></div>';
    },

    renderPublished(published, slug) {
      const hero = published.hero || {};
      return R.card('Live website copy',
        '<div class="hero-panel" style="margin-bottom:14px"><h2 style="margin:0 0 6px">' + R.esc(hero.headline || 'Nothing published yet') + '</h2><p style="margin:0">' + R.esc(hero.subheadline || '') + '</p></div>' +
        '<p class="muted" style="white-space:pre-wrap">' + R.esc(published.about || '') + '</p>' +
        '<div class="section"></div><a class="btn btn-secondary btn-sm" href="#/site/' + R.attr(slug) + '" target="_blank" rel="noopener">' + R.icon('external-link') + ' Open live site</a>');
    },

    renderDomains(ctx, page) {
      const canManage = ctx.has('website.manage.daycare');
      const domains = page.domains || [];
      return R.card('Custom domains', R.table({ rows: domains, columns: [
        { label: 'Domain', render: (d) => '<span class="mono">' + R.esc(d.domain_name) + '</span>' },
        { label: 'Verified', render: (d) => d.verified_at ? R.badge('verified') : R.badge('pending') },
        { label: 'Added', render: (d) => R.date(d.created_at) }
      ], emptyTitle: 'No custom domains', emptyMessage: 'The public site is reachable at its Re-EL address until you add one.' }),
        canManage ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'domain\')">' + R.icon('plus') + ' Add domain</button>' : '') +
        '<div class="section"></div>' + R.card('How domains work', '<p class="muted small">Point a CNAME record at the Re-EL edge, then add the domain here. Domains are checked before traffic is served. The default address always keeps working.</p>');
    },

    openModal(ctx, name) {
      const page = ctx.page || {};
      const draft = (page.config && page.config.draft_content) || {};
      if (name === 'websiteContent') {
        const hero = draft.hero || {};
        const contact = draft.contact || {};
        ctx.openModal({
          title: 'Edit website content', endpoint: '/website', method: 'PATCH', submitLabel: 'Save draft', size: 'wide',
          description: 'Saving updates the draft only. Publish when you are ready for families to see it.',
          fields: [
            { name: 'headline', label: 'Hero headline', required: true, value: hero.headline || '', span: 2 },
            { name: 'subheadline', label: 'Hero subheadline', value: hero.subheadline || '', span: 2 },
            { name: 'cta', label: 'Call to action', value: hero.cta || 'Book a visit' },
            { name: 'theme', label: 'Theme', type: 'select', value: (page.config && page.config.theme) || 'nature', options: ['nature', 'sunrise', 'ocean', 'berry'].map((t) => ({ value: t, label: R.titleCase(t) })) },
            { name: 'about', label: 'About the centre', type: 'textarea', value: draft.about || '', span: 2 },
            { name: 'fees', label: 'Fees summary', type: 'textarea', value: draft.fees || '', span: 2 },
            { name: 'email', label: 'Contact email', type: 'email', value: contact.email || '' },
            { name: 'phone', label: 'Contact phone', value: contact.phone || '' },
            { name: 'address', label: 'Address', value: contact.address || '', span: 2 }
          ],
          transform: (data) => ({
            theme: data.theme,
            draftContent: {
              hero: { headline: data.headline, subheadline: data.subheadline, cta: data.cta },
              about: data.about,
              fees: data.fees,
              contact: { email: data.email, phone: data.phone, address: data.address }
            }
          })
        });
      } else if (name === 'domain') {
        ctx.openModal({
          title: 'Add custom domain', endpoint: '/website/domains', submitLabel: 'Add domain',
          description: 'Enter the hostname without https:// — for example www.littlesprouts.co.za.',
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
