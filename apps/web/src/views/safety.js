'use strict';

/* Health and safety: incidents, corrective actions and compliance registers. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const SEVERITIES = ['low', 'medium', 'high', 'critical'];
  const INCIDENT_TYPES = ['injury', 'illness', 'near_miss', 'behaviour', 'safeguarding', 'property', 'medication', 'other'];
  const STATUS_FLOW = {
    reported: ['reviewed', 'closed'],
    reviewed: ['action_assigned', 'follow_up', 'closed'],
    action_assigned: ['follow_up', 'closed'],
    follow_up: ['closed', 'action_assigned'],
    closed: []
  };

  V.safety = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.status) query.set('status', ctx.filters.status);
      if (ctx.filters.severity) query.set('severity', ctx.filters.severity);
      if (ctx.filters.branchId) query.set('branchId', ctx.filters.branchId);
      if (ctx.filters.from) query.set('from', ctx.filters.from);
      if (ctx.filters.to) query.set('to', ctx.filters.to);
      const [overview, incidents, compliance, learners, staff] = await Promise.all([
        R.api('GET', '/safety/overview').then((p) => p.data).catch(() => ({})),
        R.api('GET', '/incidents' + (query.toString() ? '?' + query : '')).then((p) => p).catch(() => ({ data: [], meta: {} })),
        R.api('GET', '/safety/compliance').then((p) => p.data).catch(() => null),
        R.api('GET', '/learners?pageSize=200').then((p) => p.data).catch(() => []),
        ctx.has('staff.read.daycare') ? R.api('GET', '/staff').then((p) => p.data).catch(() => []) : Promise.resolve([])
      ]);
      return {
        overview: overview || {}, rows: incidents.data || [], meta: incidents.meta || {},
        compliance, learners: learners || [], staff: staff || []
      };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'incidents';
      const o = page.overview || {};
      const counts = o.incidents || {};
      return R.pageHead('Health and safety', 'Report what happened, fix what caused it, and keep the record straight.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'incident\')">' + R.icon('shield-alert') + ' Report incident</button>' +
        (page.compliance ? '<a class="btn btn-primary btn-sm" href="#/app/safety?tab=compliance">' + R.icon('clipboard-check') + ' Compliance</a>' : '')) +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Open incidents', value: R.number(counts.open), icon: 'shield-alert', tone: Number(counts.open) ? 'danger' : 'green', foot: R.number(counts.total) + ' recorded all time' }) +
        R.statCard({ label: 'Critical open', value: R.number(counts.critical_open), icon: 'alert-octagon', tone: Number(counts.critical_open) ? 'danger' : 'green', foot: 'Needs immediate review' }) +
        R.statCard({ label: 'Corrective actions', value: R.number(o.openActions), icon: 'list-checks', tone: 'sun', foot: 'Open or in progress' }) +
        R.statCard({ label: 'Awaiting guardian notice', value: R.number(counts.awaiting_notification), icon: 'bell-ring', tone: 'clay', foot: R.number(o.expiringStaffDocuments) + ' staff documents expiring' }) +
        '</div>' +
        R.tabs([{ key: 'incidents', label: 'Incidents' }, { key: 'compliance', label: 'Compliance' }, { key: 'patterns', label: 'Patterns' }], tab) +
        (tab === 'compliance' ? this.renderCompliance(page) : tab === 'patterns' ? this.renderPatterns(page) : this.renderIncidents(ctx, page));
    },

    renderIncidents(ctx, page) {
      const canManage = ctx.has('safety.manage.daycare');
      return R.filterBar(
        R.selectFilter(ctx, 'status', ['reported', 'reviewed', 'action_assigned', 'follow_up', 'closed'].map((s) => ({ value: s, label: R.titleCase(s) })), 'All statuses') +
        R.selectFilter(ctx, 'severity', SEVERITIES.map((s) => ({ value: s, label: R.titleCase(s) })), 'All severities') +
        R.selectFilter(ctx, 'branchId', R.branchOptions(ctx), 'All branches') +
        '<label class="small muted">From</label><input class="input" type="date" value="' + R.attr(ctx.filters.from || '') + '" @change="setFilter(\'from\',$event.target.value)">' +
        '<label class="small muted">To</label><input class="input" type="date" value="' + R.attr(ctx.filters.to || '') + '" @change="setFilter(\'to\',$event.target.value)">') +
        (canManage ? R.bulkBar([
          { label: 'Mark reviewed', icon: 'check-circle', path: '/incidents/bulk', action: 'review' },
          { label: 'Close', icon: 'archive', path: '/incidents/bulk', action: 'close', tone: 'danger' }
        ], { hint: 'Incidents with open corrective actions cannot be closed.' }) : '') +
        R.table({ rows: page.rows || [], selectable: canManage, columns: [
          { label: 'When', render: (i) => '<span class="cell-strong">' + R.dateTime(i.occurred_at) + '</span><span class="cell-sub">' + R.esc(i.branch_name || '') + '</span>' },
          { label: 'Incident', render: (i) => '<span class="cell-strong">' + R.esc(R.titleCase(i.incident_type)) + '</span><span class="cell-sub">' + R.esc(R.truncate(i.description, 70)) + '</span>' },
          { label: 'Severity', render: (i) => R.badge(i.severity) },
          { label: 'Status', render: (i) => R.badge(i.status) },
          { label: 'Open actions', align: 'right', render: (i) => Number(i.open_actions) ? '<span class="badge badge-sun">' + R.number(i.open_actions) + '</span>' : '<span class="badge badge-green">0</span>' },
          { label: 'Reported by', render: (i) => R.esc(i.reported_by_name || '—') },
          { label: '', align: 'right', render: (i) => '<div class="btn-group">' +
            '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'incidentView\',\'' + R.attr(i.id) + '\')">Open</button>' +
            (canManage && i.status !== 'closed' ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'incidentStatus\',\'' + R.attr(i.id) + '\')">Update</button>' : '') +
            '</div>' }
        ], emptyTitle: 'No incidents recorded', emptyMessage: 'That is good news. Report anything that does happen so patterns can be seen early.' });
    },

    renderCompliance(page) {
      const c = page.compliance;
      if (!c) return R.emptyState('Compliance unavailable', 'Your role does not include compliance records.', '', 'clipboard-check');
      return '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Expiring documents', value: R.number((c.expiringDocuments || []).length), icon: 'file-clock', tone: (c.expiringDocuments || []).length ? 'danger' : 'green', foot: 'Next 60 days' }) +
        R.statCard({ label: 'Training due', value: R.number((c.trainingDue || []).length), icon: 'graduation-cap', tone: 'sun', foot: 'Next 60 days' }) +
        R.statCard({ label: 'Unverified documents', value: R.number(c.unverifiedDocuments), icon: 'file-question', tone: 'clay', foot: 'Awaiting a human check' }) +
        R.statCard({ label: 'Open incidents', value: R.number(c.openIncidents), icon: 'shield-alert', tone: 'danger', foot: 'Not yet closed' }) +
        '</div>' +
        '<div class="split"><div class="stack">' +
        R.card('Documents expiring', R.table({ rows: c.expiringDocuments || [], columns: [
          { label: 'Staff', render: (d) => '<span class="cell-strong">' + R.esc(d.display_name || '—') + '</span><span class="cell-sub">' + R.esc(d.job_title || '') + '</span>' },
          { label: 'Document', render: (d) => R.esc(d.title) + '<span class="cell-sub">' + R.esc(R.titleCase(d.document_type)) + '</span>' },
          { label: 'Expires', render: (d) => R.date(d.expires_at) },
          { label: 'Status', render: (d) => R.badge(d.verification_status) }
        ], emptyTitle: 'Nothing expiring', emptyMessage: 'All staff documents are valid beyond 60 days.' })) +
        '</div><div class="stack">' +
        R.card('Training due', R.table({ rows: c.trainingDue || [], compact: true, columns: [
          { label: 'Staff', render: (t) => R.esc(t.display_name || '—') },
          { label: 'Course', render: (t) => R.esc(t.course_name) },
          { label: 'Expires', render: (t) => R.date(t.expires_on) }
        ], emptyTitle: 'No training expiring' })) +
        R.card('How compliance works', '<p class="muted small">' + R.esc(c.note || '') + '</p>') +
        '</div></div>';
    },

    renderPatterns(page) {
      const o = page.overview || {};
      const byType = o.byType || [];
      const bySeverity = o.bySeverity || [];
      const max = Math.max(1, ...byType.map((t) => Number(t.total || 0)));
      return '<div class="split"><div class="stack">' +
        R.card('Incidents by type', byType.length ? '<div class="stack">' + byType.map((t) =>
          '<div class="metric-bar"><span>' + R.esc(R.titleCase(t.incident_type)) + '</span><div class="bar"><span style="width:' + Math.max(2, Math.round((Number(t.total) / max) * 100)) + '%"></span></div><span class="val">' + R.number(t.total) + '</span></div>').join('') + '</div>' :
          '<p class="muted small">No incidents recorded yet.</p>') +
        '</div><div class="stack">' +
        R.card('Open incidents by severity', R.table({ rows: bySeverity, compact: true, columns: [
          { label: 'Severity', render: (s) => R.badge(s.severity) },
          { label: 'Open', align: 'right', render: (s) => R.number(s.total) }
        ], emptyTitle: 'No open incidents' })) +
        R.card('Recent incidents', R.table({ rows: (o.recent || []).slice(0, 6), compact: true, columns: [
          { label: 'When', render: (i) => R.date(i.occurred_at) },
          { label: 'Type', render: (i) => R.esc(R.titleCase(i.incident_type)) },
          { label: 'Severity', render: (i) => R.badge(i.severity) },
          { label: 'Status', render: (i) => R.badge(i.status) }
        ], emptyTitle: 'Nothing recent' })) +
        '</div></div>';
    },

    async openModal(ctx, name, id) {
      const page = ctx.page || {};
      if (name === 'incident') {
        ctx.openModal({
          title: 'Report incident', endpoint: '/incidents', submitLabel: 'Record incident', size: 'wide',
          description: 'Record facts, not opinions. This record may be reviewed by management and, where required, shared with a guardian.',
          fields: [
            { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx) },
            { name: 'incidentType', label: 'Type', type: 'select', required: true, options: INCIDENT_TYPES.map((t) => ({ value: t, label: R.titleCase(t) })) },
            { name: 'severity', label: 'Severity', type: 'select', required: true, options: SEVERITIES.map((s) => ({ value: s, label: R.titleCase(s) })) },
            { name: 'occurredAt', label: 'When', type: 'datetime-local', value: new Date().toISOString().slice(0, 16) },
            { name: 'locationDescription', label: 'Location', placeholder: 'Outdoor play area' },
            { name: 'learnerId', label: 'Child involved', type: 'select', options: (page.learners || []).map((l) => ({ value: l.id, label: l.first_name + ' ' + l.last_name })) },
            { name: 'description', label: 'What happened', type: 'textarea', required: true, span: 2 },
            { name: 'attachmentUrls', label: 'Photos or files', type: 'media', multiple: true, scope: 'incident', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,audio/mpeg,application/pdf,text/plain,text/csv', span: 2, help: 'Add photos, video, audio or documents that support the record.' },
            { name: 'restricted', label: 'Restrict access', type: 'checkbox', value: false, help: 'Limit to management until reviewed' }
          ],
          transform: (data) => {
            const body = Object.assign({}, data);
            body.learnerIds = body.learnerId ? [body.learnerId] : [];
            delete body.learnerId;
            return body;
          }
        });
      } else if (name === 'incidentStatus' && id) {
        const incident = (page.rows || []).find((i) => i.id === id) || {};
        ctx.openModal({
          title: 'Update incident', endpoint: '/incidents/' + id, method: 'PATCH', submitLabel: 'Save update',
          fields: [
            { name: 'status', label: 'Status', type: 'select', required: true, options: (STATUS_FLOW[incident.status] || []).map((s) => ({ value: s, label: R.titleCase(s) })) },
            { name: 'severity', label: 'Severity', type: 'select', options: SEVERITIES.map((s) => ({ value: s, label: R.titleCase(s) })) },
            { name: 'locationDescription', label: 'Location', value: incident.location_description },
            { name: 'description', label: 'Description', type: 'textarea', value: incident.description, span: 2 },
            { name: 'attachmentUrls', label: 'Photos or files', type: 'media', multiple: true, scope: 'incident', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,audio/mpeg,application/pdf,text/plain,text/csv', value: R.mediaList(incident.attachment_urls), span: 2 }
          ]
        });
      } else if (name === 'incidentView' && id) {
        try {
          const payload = await R.api('GET', '/incidents/' + encodeURIComponent(id));
          const i = payload.data || {};
          const participants = i.participants || [];
          const actions = i.actions || [];
          const html = '<div class="row" style="justify-content:space-between;align-items:flex-start">' +
            '<div><div class="cell-strong" style="font-size:1.05rem">' + R.esc(R.titleCase(i.incident_type)) + '</div>' +
            '<div class="muted small">' + R.dateTime(i.occurred_at) + ' · ' + R.esc(i.location_description || 'Location not recorded') + '</div></div>' +
            '<div style="text-align:right">' + R.badge(i.severity) + ' ' + R.badge(i.status) + '</div></div>' +
            '<div class="section"></div><p style="white-space:pre-wrap">' + R.esc(i.description) + '</p>' +
            (R.mediaList(i.attachment_urls).length ? '<div class="section"></div><h3>Attachments</h3><div class="media-grid">' +
              R.mediaList(i.attachment_urls).map((url) => '<div class="media-card">' +
                R.mediaHtml(url, R.kindForUrl(url), { alt: 'Incident attachment' }) + '</div>').join('') + '</div>' : '') +
            '<div class="section"></div><div class="detail-list">' +
            R.detailItem('Reported by', R.esc((i.reportedBy || {}).display_name || '—')) +
            R.detailItem('Reviewed by', R.esc((i.reviewedBy || {}).display_name || 'Not yet')) +
            R.detailItem('Guardian notified', i.guardian_notified_at ? R.dateTime(i.guardian_notified_at) : 'No') +
            R.detailItem('Restricted', i.restricted ? 'Yes' : 'No') +
            R.detailItem('Closed', i.closed_at ? R.dateTime(i.closed_at) : 'Open') +
            '</div>' +
            '<div class="section"></div><h3>People involved</h3>' +
            (participants.length ? '<ul class="list-clean">' + participants.map((p) => {
              const label = p.learner ? p.learner.first_name + ' ' + p.learner.last_name : (p.staff ? (p.staff.display_name || p.staff.job_title) : 'Unknown');
              return '<li>' + R.icon(p.participant_type === 'learner' ? 'user' : 'id-card') + '<div><div class="strong">' + R.esc(label) + '</div><div class="muted small">' + R.esc(R.titleCase(p.participant_type)) + ' · ' + R.esc(R.titleCase(p.involvement_type)) + '</div></div></li>';
            }).join('') + '</ul>' : '<p class="muted small">No participants recorded.</p>') +
            '<div class="section"></div><h3>Corrective actions</h3>' +
            (actions.length ? R.table({ rows: actions, compact: true, columns: [
              { label: 'Action', render: (a) => R.esc(a.action_description) },
              { label: 'Owner', render: (a) => R.esc(a.assigned_to_name || 'Unassigned') },
              { label: 'Due', render: (a) => R.date(a.due_at) },
              { label: 'Status', render: (a) => R.badge(a.status) },
              { label: '', align: 'right', render: (a) => ['open', 'in_progress'].includes(a.status) ? '<button class="btn btn-sm btn-secondary" @click="closeModal(); act(\'PATCH\',\'/incident-actions/' + R.attr(a.id) + '\',{status:\'done\'},{successMessage:\'Action completed\'})">Mark done</button>' : '' }
            ] }) : '<p class="muted small">No corrective actions yet.</p>') +
            '<div class="row" style="margin-top:12px">' +
            (i.status !== 'closed' ? '<button class="btn btn-secondary btn-sm" @click="closeModal(); openNamedModal(\'incidentAction\',\'' + R.attr(i.id) + '\')">' + R.icon('plus') + ' Add action</button>' : '') +
            '<button class="btn btn-secondary btn-sm" @click="closeModal(); openNamedModal(\'notifyGuardians\',\'' + R.attr(i.id) + '\')">' + R.icon('bell-ring') + ' Notify guardians</button>' +
            '</div>';
          ctx.openDetail('Incident · ' + R.date(i.occurred_at), html, 'wide');
        } catch (error) {
          ctx.toast(error.message || 'The incident could not be opened.', 'error');
        }
      } else if (name === 'incidentAction' && id) {
        ctx.openModal({
          title: 'Add corrective action', endpoint: '/incidents/' + id + '/actions', submitLabel: 'Add action',
          fields: [
            { name: 'description', label: 'Action', type: 'textarea', required: true, span: 2 },
            { name: 'dueAt', label: 'Due date', type: 'date' },
            { name: 'assignedTo', label: 'Assign to', type: 'select', options: (page.staff || []).map((s) => ({ value: s.user_id, label: s.display_name })).filter((o) => o.value) }
          ]
        });
      } else if (name === 'notifyGuardians' && id) {
        ctx.openModal({
          title: 'Notify guardians', endpoint: '/incidents/' + id + '/notify-guardians', submitLabel: 'Send notification',
          description: 'Guardians with active portal access and report permissions will receive a notification.',
          fields: [{ name: 'message', label: 'Message', type: 'textarea', span: 2, placeholder: 'An incident involving your child was recorded. Please contact the centre…' }]
        });
      }
    }
  };
})();
