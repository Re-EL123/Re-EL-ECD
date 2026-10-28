'use strict';

/* Developmental assessment: observations, periods and progress reports. */
(function () {
  const R = window.Reel;
  const V = R.views;

  V.assessments = {
    async load(ctx) {
      const status = ctx.filters.status ? '?status=' + encodeURIComponent(ctx.filters.status) : '';
      const [overview, observations, periods, learners, frameworks, classrooms] = await Promise.all([
        ctx.has('assessments.read.daycare') ? R.api('GET', '/assessments/overview').then((p) => p.data).catch(() => ({})) : Promise.resolve({}),
        R.api('GET', '/assessments/observations' + status).then((p) => p.data).catch(() => []),
        ctx.has('assessments.read.daycare') ? R.api('GET', '/assessments/periods').then((p) => p.data).catch(() => []) : Promise.resolve([]),
        R.api('GET', '/learners?pageSize=200').then((p) => p.data).catch(() => []),
        R.api('GET', '/curriculum/frameworks').then((p) => p.data).catch(() => []),
        R.api('GET', '/classrooms').then((p) => p.data).catch(() => [])
      ]);
      const objectives = frameworks.flatMap((f) => (f.domains || []).map((d) => ({ domain: d, framework: f })));
      const allObjectives = await R.api('GET', '/curriculum/objectives').then((p) => p.data).catch(() => []);
      return { overview, observations, periods, learners, frameworks, classrooms, objectives: allObjectives };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'overview';
      const o = page.overview || {};
      const observations = page.observations || [];
      return R.pageHead('Assessments', 'Observe, record and understand each child\'s development.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'period\')">' + R.icon('calendar-plus') + ' New period</button>' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'observation\')">' + R.icon('plus') + ' Record observation</button>') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Coverage', value: R.percent(o.completionRate), icon: 'target', foot: R.number(o.learnersWithObservations) + ' of ' + R.number(o.learners) + ' children' }) +
        R.statCard({ label: 'Observations', value: R.number(observations.length), icon: 'eye', tone: 'sky', foot: R.number(o.published) + ' published' }) +
        R.statCard({ label: 'Awaiting review', value: R.number(o.pendingReview), icon: 'clipboard-list', tone: 'sun', foot: 'Draft and submitted' }) +
        R.statCard({ label: 'Assessment periods', value: R.number((page.periods || []).length), icon: 'calendar-range', tone: 'plum', foot: 'Active reporting windows' }) +
        '</div>' +
        R.tabs([{ key: 'overview', label: 'Overview' }, { key: 'observations', label: 'Observations' }, { key: 'periods', label: 'Periods' }, { key: 'reports', label: 'Reports' }], tab) +
        (tab === 'observations' ? this.renderObservations(ctx, page) : tab === 'periods' ? this.renderPeriods(page) : tab === 'reports' ? this.renderReports(ctx, page) : this.renderOverview(page));
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
      return R.filterBar(
        R.selectFilter(ctx, 'status', [{ value: 'draft', label: 'Draft' }, { value: 'submitted', label: 'Submitted' }, { value: 'published', label: 'Published' }], 'All statuses')) +
        R.table({ rows: page.observations || [], columns: [
          { label: 'Child', render: (o) => '<a class="cell-strong" href="#/app/learners/' + R.attr(o.learner_id) + '">' + R.esc(o.first_name + ' ' + o.last_name) + '</a>' },
          { label: 'Objective', render: (o) => '<span class="mono badge badge-muted">' + R.esc(o.objective_code) + '</span><span class="cell-sub">' + R.esc(o.domain_name) + '</span>' },
          { label: 'Observation', render: (o) => R.esc(R.truncate(o.observation_text, 90)) + '<span class="cell-sub">' + R.esc(o.context || '') + '</span>' },
          { label: 'Date', render: (o) => R.date(o.observation_date) },
          { label: 'Status', render: (o) => R.badge(o.assessment_status) + (o.visibility_status === 'shared' ? ' <span class="badge badge-green">Shared</span>' : '') },
          { label: 'By', render: (o) => R.esc(o.recorded_by_name || '—') },
          { label: '', align: 'right', render: (o) => '<div class="btn-group">' +
            (o.assessment_status !== 'published' ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/assessments/observations/' + R.attr(o.id) + '/publish\',{},{successMessage:\'Observation published\'})">Publish</button>' : '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'amend\',\'' + R.attr(o.id) + '\')">Amend</button>') +
            '</div>' }
        ], emptyTitle: 'No observations', emptyMessage: 'Record what you see children doing — that is the heart of assessment.' });
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
        R.card('Progress reports', '<p class="muted small">Generate a report for one child and assessment period. The report gathers published observations, domain summaries and next steps.</p>' +
          '<div class="form-grid"><div class="field"><label>Child</label><select class="select" id="report-learner"><option value="">Select a child…</option>' +
          learners.map((l) => '<option value="' + R.attr(l.id) + '">' + R.esc(l.first_name + ' ' + l.last_name) + '</option>').join('') + '</select></div>' +
          '<div class="field"><label>Period</label><select class="select" id="report-period"><option value="">Select a period…</option>' +
          (page.periods || []).map((p) => '<option value="' + R.attr(p.id) + '">' + R.esc(p.name) + '</option>').join('') + '</select></div>' +
          '<div class="field"><label>Format</label><select class="select" id="report-format"><option value="pdf">PDF</option><option value="html">HTML</option></select></div></div>' +
          '<button class="btn btn-primary" @click="generateAssessmentReport()">' + R.icon('file-text') + ' Generate report</button>') +
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
        ctx.openModal({ title: 'Generate progress report', endpoint: '/assessments/reports/generate', submitLabel: 'Generate', fields: [
          { name: 'learnerId', label: 'Child', type: 'select', required: true, options: learners.map((l) => ({ value: l.id, label: l.first_name + ' ' + l.last_name })) },
          { name: 'assessmentPeriodId', label: 'Period', type: 'select', required: true, options: (page.periods || []).map((p) => ({ value: p.id, label: p.name })) },
          { name: 'format', label: 'Format', type: 'select', options: ['pdf', 'html'], value: 'pdf' }
        ] });
      }
    },

    observationModal(ctx, learnerId) {
      const page = ctx.page || {};
      const learners = page.learners || [];
      const objectives = page.objectives || [];
      ctx.openModal({ title: 'Record observation', endpoint: '/assessments/observations', submitLabel: 'Save observation', size: 'wide', fields: [
        { name: 'learnerId', label: 'Child', type: 'select', required: true, value: learnerId || '', options: learners.map((l) => ({ value: l.id, label: l.first_name + ' ' + l.last_name + (l.classroom_name ? ' · ' + l.classroom_name : '') })) },
        { name: 'objectiveId', label: 'Learning objective', type: 'select', required: true, options: objectives.map((o) => ({ value: o.id, label: o.code + ' · ' + R.truncate(o.description, 60) })) },
        { name: 'observationDate', label: 'Date', type: 'date', value: R.today(), required: true },
        { name: 'context', label: 'Context', placeholder: 'Outdoor play, story time…' },
        { name: 'observationText', label: 'What did you see?', type: 'textarea', required: true, span: 2 },
        { name: 'publishNow', label: 'Publish now', type: 'checkbox', value: false, help: 'Skip the review step and share with the family' }
      ] });
    }
  };

})();
