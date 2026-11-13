'use strict';

/* Developmental assessment: observations, periods and progress reports. */
(function () {
  const R = window.Reel;
  const V = R.views;

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadReport(body) {
    return R.api('POST', '/assessments/reports/generate', body).then((p) => {
      const payload = p.data || {};
      const reports = payload.reports || (payload.report ? [payload.report] : []);
      reports.forEach((report) => {
        if (!report) return;
        const safeName = (report.learner && (report.learner.firstName + '-' + report.learner.lastName) || 'progress-report')
          .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'progress-report';
        const periodLabel = report.period && report.period.name ? '-' + report.period.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-') : '';
        if (report.html) downloadFile(report.html, safeName + periodLabel + '.html', 'text/html');
        if (report.csv) downloadFile(report.csv, safeName + periodLabel + '.csv', 'text/csv');
        if (report.pdf) downloadFile(Uint8Array.from(atob(report.pdf), (c) => c.charCodeAt(0)), safeName + periodLabel + '.pdf', 'application/pdf');
      });
      return p;
    });
  }

  V.assessments = {
    async load(ctx) {
      const status = ctx.filters.status ? '?status=' + encodeURIComponent(ctx.filters.status) : '';
      const canPublish = ctx.has('assessments.publish.daycare');
      const [overview, observations, periods, learners, frameworks, classrooms, observationTemplates] = await Promise.all([
        ctx.has('assessments.read.daycare') ? R.api('GET', '/assessments/overview').then((p) => p.data).catch(() => ({})) : Promise.resolve({}),
        R.api('GET', '/assessments/observations' + status).then((p) => p.data).catch(() => []),
        ctx.has('assessments.read.daycare') ? R.api('GET', '/assessments/periods').then((p) => p.data).catch(() => []) : Promise.resolve([]),
        R.api('GET', '/learners?pageSize=200').then((p) => p.data).catch(() => []),
        R.api('GET', '/curriculum/frameworks').then((p) => p.data).catch(() => []),
        R.api('GET', '/classrooms').then((p) => p.data).catch(() => []),
        R.api('GET', '/templates?kind=observation').then((p) => (p.data && p.data.data) || []).catch(() => [])
      ]);
      const objectives = frameworks.flatMap((f) => (f.domains || []).map((d) => ({ domain: d, framework: f })));
      const allObjectives = await R.api('GET', '/curriculum/objectives').then((p) => p.data).catch(() => []);
      const domains = (frameworks || []).flatMap((f) => (f.domains || []).map((d) => ({ id: d.id, name: d.name, framework: f.name })));
      return { overview, observations, periods, learners, frameworks, classrooms, objectives: allObjectives, domains, canPublish, observationTemplates };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'overview';
      const o = page.overview || {};
      const observations = page.observations || [];
      const tabs = [
        { key: 'overview', label: 'Overview' },
        { key: 'observations', label: 'Observations' }
      ];
      if (page.canPublish) tabs.push({ key: 'review', label: 'Review queue' });
      tabs.push({ key: 'periods', label: 'Periods' });
      tabs.push({ key: 'reports', label: 'Reports' });
      tabs.push({ key: 'termAssessments', label: 'Term assessments' });
      return R.pageHead('Assessments', 'Observe, record and understand each child\'s development.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'period\')">' + R.icon('calendar-plus') + ' New period</button>' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'observation\')">' + R.icon('plus') + ' Record observation</button>' +
        R.exportButtons('/exports/observations')) +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Coverage', value: R.percent(o.completionRate), icon: 'target', foot: R.number(o.learnersWithObservations) + ' of ' + R.number(o.learners) + ' children' }) +
        R.statCard({ label: 'Observations', value: R.number(observations.length), icon: 'eye', tone: 'sky', foot: R.number(o.published) + ' published' }) +
        R.statCard({ label: 'Awaiting review', value: R.number(o.pendingReview), icon: 'clipboard-list', tone: 'sun', foot: 'Draft and submitted' }) +
        R.statCard({ label: 'Assessment periods', value: R.number((page.periods || []).length), icon: 'calendar-range', tone: 'plum', foot: 'Active reporting windows' }) +
        '</div>' +
        R.tabs(tabs, tab) +
        (tab === 'observations' ? this.renderObservations(ctx, page)
          : tab === 'review' ? this.renderReview(ctx, page)
          : tab === 'periods' ? this.renderPeriods(page)
          : tab === 'reports' ? this.renderReports(ctx, page)
          : tab === 'termAssessments' ? this.renderTermAssessments(page)
          : this.renderOverview(page));
    },

    renderOverview(page) {
      const o = page.overview || {};
      return '<div class="split"><div class="stack">' +
        R.card('Domain coverage', (o.domainCoverage || []).length ? '<div class="stack">' + o.domainCoverage.map((d) =>
          '<div class="metric-bar"><span>' + R.esc(d.name) + '</span><div class="bar"><span style="width:' + Math.min(100, Number(d.observations) * 4) + '%"></span></div><span class="val">' + R.number(d.observations) + '</span></div>').join('') + '</div>' : '<p class="muted small">No observations recorded yet.</p>') +
        R.card('Children without recent observations', R.table({ rows: o.missingObservations || [], compact: true, columns: [
          { label: 'Child', render: (l) => '<a class="cell-strong" href="#/app/learners/' + R.attr(l.id) + '">' + R.esc(l.first_name + ' ' + l.last_name) + '</a>' },
          { label: 'Classroom', render: (l) => R.esc(l.classroom_name || '—') },
          { label: '', align: 'right', render: (l) => '<button class="btn btn-sm btn-secondary" @click="openViewModal(\'observationFor\',\'' + R.attr(l.id) + '\')">Observe</button>' }
        ], emptyTitle: 'Everyone has recent observations', emptyMessage: 'Great coverage across the centre.' })) +
        '</div><div class="stack">' +
        R.card('How assessment works here', '<p class="muted small">Observations are written against a learning objective, reviewed, then published to families. Each child should have at least one observation per domain every 60 days.</p>' +
          '<div class="kpi-list"><div class="kpi-row"><span class="kpi-label">Review window</span><span class="kpi-value">60 days</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Published</span><span class="kpi-value">' + R.number(o.published) + '</span></div></div>') +
        R.card('Quick actions', '<div class="stack">' +
          '<button class="btn btn-secondary" style="justify-content:flex-start" @click="openNamedModal(\'observation\')">' + R.icon('eye') + ' Record an observation</button>' +
          '<button class="btn btn-secondary" style="justify-content:flex-start" @click="setTab(\'reports\')">' + R.icon('file-text') + ' Generate a progress report</button>' +
          '<button class="btn btn-secondary" style="justify-content:flex-start" @click="setTab(\'periods\')">' + R.icon('calendar-range') + ' Manage periods</button>' +
          '</div>') +
        '</div></div>';
    },

    renderObservations(ctx, page) {
      const rows = page.observations || [];
      const canPublish = page.canPublish;
      const bulkActions = [{ label: 'Submit for review', icon: 'send', path: '/assessments/observations/bulk', action: 'submit' }];
      if (canPublish) bulkActions.push({ label: 'Publish selected', icon: 'upload', path: '/assessments/observations/bulk', action: 'publish' });
      return (bulkActions.length ? R.bulkBar(bulkActions, { hint: 'Unpublished observations are shared with families only after review.' }) : '') +
        R.filterBar(
          R.selectFilter(ctx, 'status', [{ value: 'draft', label: 'Draft' }, { value: 'submitted', label: 'Submitted' }, { value: 'published', label: 'Published' }, { value: 'amended', label: 'Amended' }], 'All statuses')) +
        R.table({ rows, selectable: true, columns: [
          { label: 'Child', render: (o) => '<a class="cell-strong" href="#/app/learners/' + R.attr(o.learner_id) + '">' + R.esc(o.first_name + ' ' + o.last_name) + '</a>' },
          { label: 'Objective', render: (o) => '<span class="mono badge badge-muted">' + R.esc(o.objective_code || '—') + '</span><span class="cell-sub">' + R.esc(o.domain_name || '') + '</span>' },
          { label: 'Observation', render: (o) => R.esc(R.truncate(o.observation_text, 90)) + '<span class="cell-sub">' + R.esc(o.context || '') + '</span>' },
          { label: 'Media', render: (o) => { const media = R.mediaList(o.photo_urls); return media.length ? '<div class="row" style="gap:4px">' + media.slice(0, 3).map((url) => R.mediaThumb(url, 'Observation media')).join('') + '</div>' : '<span class="muted">—</span>'; } },
          { label: 'Date', render: (o) => R.date(o.observation_date) },
          { label: 'Seen', render: (o) => o.parent_viewed_at ? '<span class="badge badge-green" title="' + R.attr('Seen by a parent on ' + R.dateTime(o.parent_viewed_at)) + '">Seen</span>' : '<span class="badge badge-muted">—</span>' },
          { label: 'Status', render: (o) => R.badge(o.assessment_status) + ' ' + R.badge(o.visibility_status || 'internal') },
          { label: 'By', render: (o) => R.esc(o.recorded_by_name || '—') },
          { label: '', align: 'right', render: (o) => '<div class="btn-group">' +
            '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'feedbackThread\',\'' + R.attr(o.id) + '\')">Feedback</button>' +
            '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'saveObservationTemplate\',\'' + R.attr(o.id) + '\')">Save as template</button>' +
            (o.assessment_status === 'draft' ? '<button class="btn btn-sm btn-secondary" @click="act(\'POST\',\'/assessments/observations/' + R.attr(o.id) + '/submit\',{},{successMessage:\'Submitted for review\'})">Submit</button>' : '') +
            (o.assessment_status !== 'published' && canPublish ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/assessments/observations/' + R.attr(o.id) + '/publish\',{},{successMessage:\'Observation published\'})">Publish</button>' : '') +
            (o.assessment_status === 'published' ? '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'amend\',\'' + R.attr(o.id) + '\')">Amend</button>' : '') +
            '</div>' }
        ], emptyTitle: 'No observations', emptyMessage: 'Record what you see children doing — that is the heart of assessment.' });
    },

    renderReview(ctx, page) {
      const rows = (page.observations || []).filter((o) => o.assessment_status === 'submitted');
      const canPublish = page.canPublish;
      return (canPublish ? R.bulkBar([{ label: 'Publish selected', icon: 'upload', path: '/assessments/observations/bulk', action: 'publish' }], { hint: 'Publishing shares the observation with the family.' }) : '') +
        R.table({ rows, selectable: canPublish, columns: [
          { label: 'Child', render: (o) => '<a class="cell-strong" href="#/app/learners/' + R.attr(o.learner_id) + '">' + R.esc(o.first_name + ' ' + o.last_name) + '</a>' },
          { label: 'Objective', render: (o) => '<span class="mono badge badge-muted">' + R.esc(o.objective_code || '—') + '</span><span class="cell-sub">' + R.esc(o.domain_name || '') + '</span>' },
          { label: 'Observation', render: (o) => R.esc(R.truncate(o.observation_text, 90)) + '<span class="cell-sub">' + R.esc(o.context || '') + '</span>' },
          { label: 'Date', render: (o) => R.date(o.observation_date) },
          { label: 'Seen', render: (o) => o.parent_viewed_at ? '<span class="badge badge-green">Seen</span>' : '<span class="badge badge-muted">—</span>' },
          { label: 'By', render: (o) => R.esc(o.recorded_by_name || '—') },
          { label: '', align: 'right', render: (o) => (canPublish ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/assessments/observations/' + R.attr(o.id) + '/publish\',{},{successMessage:\'Observation published\'})">Publish</button>' : '') }
        ], emptyTitle: 'Nothing awaiting review', emptyMessage: 'Submitted observations will appear here for publishing.' });
    },

    renderTermAssessments(page) {
      const periods = page.periods || [];
      const domains = page.domains || [];
      return R.card('Term assessments', '<p class="muted small">Record a domain summary for a child and publish it to the family. Parents see these in their child\'s profile.</p>' +
        '<div class="kpi-list"><div class="kpi-row"><span class="kpi-label">Assessment periods</span><span class="kpi-value">' + R.number(periods.length) + '</span></div>' +
        '<div class="kpi-row"><span class="kpi-label">Domains</span><span class="kpi-value">' + R.number(domains.length) + '</span></div></div>' +
        (periods.length ? '' : '<div class="alert alert-warn" style="margin-top:12px"><i data-lucide="alert-triangle"></i><span>Create an assessment period first.</span></div>'),
        '<div class="btn-group">' + R.exportButtons('/exports/term-assessments') + '<button class="btn btn-primary" @click="openNamedModal(\'termAssessment\')">' + R.icon('clipboard-plus') + ' Record assessment</button></div>');
    },

    renderPeriods(page) {
      return R.card('Assessment periods', R.table({ rows: page.periods || [], columns: [
        { label: 'Period', render: (p) => '<span class="cell-strong">' + R.esc(p.name) + '</span>' },
        { label: 'Starts', render: (p) => R.date(p.starts_on) },
        { label: 'Ends', render: (p) => R.date(p.ends_on) },
        { label: 'Status', render: (p) => R.badge(p.status) },
        { label: '', align: 'right', render: (p) => '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'report\',\'' + R.attr(p.id) + '\')">Generate report</button>' }
      ], emptyTitle: 'No assessment periods', emptyMessage: 'Create a term window before generating reports.' }), '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'period\')">' + R.icon('plus') + ' New period</button>');
    },

    renderReports(ctx, page) {
      const learners = page.learners || [];
      return '<div class="split"><div class="stack">' +
        R.card('Progress reports', '<p class="muted small">Generate reports for one child or a whole group. Each report gathers published observations, domain summaries and next steps.</p>' +
          '<button class="btn btn-primary" @click="openNamedModal(\'report\')">' + R.icon('file-text') + ' Generate reports</button>' +
          '<p class="muted small" style="margin-top:10px">' + R.number(learners.length) + ' children · ' + R.number((page.periods || []).length) + ' periods available.</p>') +
        R.card('Latest observations', R.table({ rows: (page.observations || []).slice(0, 8), compact: true, columns: [
          { label: 'Child', render: (o) => R.esc(o.first_name + ' ' + o.last_name) },
          { label: 'Domain', render: (o) => R.esc(o.domain_name) },
          { label: 'Date', render: (o) => R.date(o.observation_date) }
        ] })) +
        '</div><div class="stack">' +
        R.card('Assessment guidance', '<ul class="list-clean">' +
          '<li>' + R.icon('check') + '<span>Describe what you actually saw, in plain language.</span></li>' +
          '<li>' + R.icon('check') + '<span>Link each observation to one objective only.</span></li>' +
          '<li>' + R.icon('check') + '<span>Review before publishing — families see published observations.</span></li>' +
          '<li>' + R.icon('check') + '<span>Use the report to plan next steps, not to rank children.</span></li>' +
          '</ul>') +
        '</div></div>';
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      const learners = page.learners || [];
      const objectives = page.objectives || [];
      if (name === 'observation') {
        this.observationModal(ctx, null);
      } else if (name === 'observationFor') {
        this.observationModal(ctx, id);
      } else if (name === 'feedbackThread' && id) {
        const observation = (page.observations || []).find((o) => o.id === id) || {};
        Promise.all([
          R.api('GET', '/assessments/observations/' + id + '/comments').then((p) => p.data).catch(() => [])
        ]).then(([comments]) => {
          const thread = (comments || []).map((c) =>
            '<div class="card" style="margin:0;padding:10px 12px"><div class="row" style="justify-content:space-between;gap:10px"><strong style="font-size:0.88rem">' + R.esc(c.author_name) + '</strong><span class="muted small">' + R.relative(c.created_at) + '</span></div><p style="margin:6px 0 0;white-space:pre-wrap;font-size:0.9rem">' + R.esc(c.body) + '</p></div>'
          ).join('');
          ctx.openDetail('Feedback thread',
            '<p class="muted small">Coaching notes on this observation. Leadership and the teacher on duty both see these.</p>' +
            (observation.observation_text ? '<div class="alert alert-info"><i data-lucide="quote"></i><span>' + R.esc(observation.observation_text) + '</span></div>' : '') +
            (thread ? '<div class="stack section">' + thread + '</div>' : '<p class="muted">No feedback yet. Be the first.</p>') +
            '<div class="section"></div>' +
            '<button class="btn btn-primary" @click="openNamedModal(\'feedback\',\'' + R.attr(id) + '\')">Add feedback</button>');
        });
      } else if (name === 'feedback' && id) {
        ctx.openModal({
          title: 'Add feedback', endpoint: '/assessments/observations/' + id + '/comments', submitLabel: 'Send feedback',
          description: 'Be specific — one observation, one next step. The teacher sees this on the observation.',
          fields: [{ name: 'body', label: 'Feedback', type: 'textarea', required: true, span: 2, placeholder: 'Beautiful work — next time try …' }]
        });
      } else if (name === 'saveObservationTemplate' && id) {
        const observation = (page.observations || []).find((o) => o.id === id) || {};
        const defaultName = (String(observation.observation_text || '').split(/\s+/).slice(0, 6).join(' ') || 'Observation template').replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Observation template';
        ctx.openModal({
          title: 'Save as observation template', endpoint: '/templates', submitLabel: 'Save template',
          description: 'Saves the text of this observation as a reusable snippet for future observations.',
          fields: [
            { name: 'templateName', label: 'Template name', required: true, span: 2, value: defaultName },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, placeholder: 'When to use this template…' }
          ],
          transform: (data) => ({
            kind: 'observation',
            name: data.templateName,
            description: data.description || null,
            payload: { text: observation.observation_text || '' }
          })
        });
      } else if (name === 'amend' && id) {
        const o = (page.observations || []).find((x) => x.id === id) || {};
        ctx.openModal({ title: 'Amend observation', endpoint: '/assessments/observations/' + id + '/amend', submitLabel: 'Save amendment', fields: [
          { name: 'observationText', label: 'Observation', type: 'textarea', value: o.observation_text, required: true, span: 2 },
          { name: 'reason', label: 'Reason for amendment', type: 'textarea', required: true, span: 2 }
        ] });
      } else if (name === 'period') {
        ctx.openModal({ title: 'New assessment period', endpoint: '/assessments/periods', submitLabel: 'Create period', fields: [
          { name: 'name', label: 'Name', required: true, placeholder: 'Term 1 2027', span: 2 },
          { name: 'startsOn', label: 'Starts on', type: 'date', required: true },
          { name: 'endsOn', label: 'Ends on', type: 'date', required: true }
        ] });
      } else if (name === 'report') {
        ctx.openModal({ title: 'Generate progress reports', endpoint: '/assessments/reports/generate', method: 'POST', submitLabel: 'Generate & download', size: 'wide',
          description: 'Choose one child or several. Each report is generated now and downloads automatically as HTML or CSV.',
          onSubmit: downloadReport,
          fields: [
            { name: 'learnerIds', label: 'Children', type: 'multiselect', span: 2, required: true, options: R.learnerOptions(learners), placeholder: 'Search children…' },
            { name: 'assessmentPeriodId', label: 'Period', type: 'select', required: true, options: (page.periods || []).map((p) => ({ value: p.id, label: p.name })) },
            { name: 'format', label: 'Format', type: 'select', options: [{ value: 'html', label: 'HTML' }, { value: 'csv', label: 'CSV' }, { value: 'pdf', label: 'PDF' }], value: 'html' }
          ] });
      } else if (name === 'termAssessment') {
        const periods = page.periods || [];
        const domains = page.domains || [];
        ctx.openModal({ title: 'Record term assessment', endpoint: '/assessments/learner', method: 'POST', submitLabel: 'Save assessment', size: 'wide', fields: [
          { name: 'learnerId', label: 'Child', type: 'select', required: true, options: learners.map((l) => ({ value: l.id, label: l.first_name + ' ' + l.last_name })) },
          { name: 'assessmentPeriodId', label: 'Period', type: 'select', required: true, options: periods.map((p) => ({ value: p.id, label: p.name })) },
          { name: 'domainId', label: 'Domain', type: 'select', required: true, options: domains.map((d) => ({ value: d.id, label: d.name })) },
          { name: 'summary', label: 'Summary', type: 'textarea', required: true, span: 2, placeholder: 'Describe what the child can do in this domain and what they are ready to try next.' }
        ] });
      }
    },

    observationModal(ctx, learnerId) {
      const page = ctx.page || {};
      const learners = page.learners || [];
      const objectives = page.objectives || [];
      const observationTemplates = page.observationTemplates || [];
      ctx.openModal({ title: 'Record observation', endpoint: '/assessments/observations', submitLabel: 'Save observation', size: 'wide',
        fields: [
        { name: 'learnerId', label: 'Child', type: 'select', required: true, value: learnerId || '', options: learners.map((l) => ({ value: l.id, label: l.first_name + ' ' + l.last_name + (l.classroom_name ? ' · ' + l.classroom_name : '') })) },
        { name: 'objectiveId', label: 'Learning objective', type: 'searchselect', required: true, placeholder: 'Search by code or description…', options: objectives.map((o) => ({ value: o.id, label: o.code + ' · ' + R.truncate(o.description, 46), subtitle: o.description })) },
        { name: 'template', label: 'Use a template', type: 'select', options: observationTemplates.map((t) => ({ value: t.id, label: t.name })), span: 2, help: 'Applying a template fills the observation text — you can still edit it.',
          onChange: (event, data) => {
            const tpl = observationTemplates.find((t) => t.id === event.target.value);
            if (tpl && tpl.payload && tpl.payload.text) data.observationText = tpl.payload.text;
          } },
        { name: 'observationDate', label: 'Date', type: 'date', value: R.today(), required: true },
        { name: 'context', label: 'Context', placeholder: 'Outdoor play, story time…', required: true, help: 'Where and during what did you see it? The family will read this.' },
        { name: 'observationText', label: 'What did you see?', type: 'textarea', required: true, span: 2 },
        { name: 'photoUrls', label: 'Photos & videos', type: 'media', multiple: true, scope: 'observation', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime', span: 2, help: 'Work samples, paintings, or a short clip. Shared with the family when you publish.' },
        { name: 'publishNow', label: 'Publish now', type: 'checkbox', value: false, help: 'Skip the review step and share with the family' }
      ],
      transform: (data) => {
        const out = Object.assign({}, data);
        delete out.template;
        return out;
      } });
    }
  };

})();
