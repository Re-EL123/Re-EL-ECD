'use strict';

/* Curriculum, activities and the learning calendar. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const NCF = '<span class="badge badge-sky">NCF</span>';
  const NCF_OFFICIAL = '<span class="badge badge-sky">NCF Official</span>';
  const isOfficialRow = (row) => row && (row.organisation_id === null || row.organisation_id === undefined);

  const PLAN_STATUSES = ['draft', 'submitted', 'approved', 'published', 'in_progress', 'completed', 'evaluated', 'cancelled'];
  const NEXT_STATUS = {
    draft: ['submitted', 'cancelled'], submitted: ['approved', 'draft', 'cancelled'],
    approved: ['published', 'cancelled'], published: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'], completed: ['evaluated'], evaluated: [], cancelled: []
  };
  const STATUS_CTA = {
    submitted: 'Send for review', approved: 'Approve', published: 'Publish',
    in_progress: 'Start lesson', completed: 'Complete lesson', evaluated: 'Evaluate', draft: 'Send back to draft'
  };
  function nextAction(status) {
    const targets = NEXT_STATUS[status] || [];
    const positive = targets.find((t) => t !== 'cancelled');
    return positive ? { target: positive, label: STATUS_CTA[positive] || ('Next: ' + positive) } : null;
  }

  V.curriculum = {
    async load(ctx) {
      const [overview, frameworks, plans, objectives, periods, classrooms, planTemplates, activityTemplates, frameworkTemplates] = await Promise.all([
        R.api('GET', '/curriculum/overview').then((p) => p.data).catch(() => ({})),
        R.api('GET', '/curriculum/frameworks').then((p) => p.data).catch(() => []),
        R.api('GET', '/curriculum/lesson-plans').then((p) => p.data).catch(() => []),
        R.api('GET', '/curriculum/objectives').then((p) => p.data).catch(() => []),
        R.api('GET', '/curriculum/periods').then((p) => p.data).catch(() => []),
        R.api('GET', '/classrooms').then((p) => p.data).catch(() => []),
        R.api('GET', '/templates?kind=lesson_plan').then((p) => (p.data && p.data.data) || []).catch(() => []),
        R.api('GET', '/templates?kind=activity').then((p) => (p.data && p.data.data) || []).catch(() => []),
        R.api('GET', '/templates?kind=framework').then((p) => (p.data && p.data.data) || []).catch(() => [])
      ]);
      return { overview, frameworks, plans, objectives, periods, classrooms, planTemplates, activityTemplates, frameworkTemplates };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'plans';
      const o = page.overview || {};
      return R.pageHead('Curriculum', 'Frameworks, learning objectives, lesson plans and academic periods.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'framework\')">' + R.icon('book-plus') + ' New framework</button>' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'plan\')">' + R.icon('plus') + ' New lesson plan</button>' +
        R.exportButtons('/exports/lesson-plans') +
        R.refreshButton()) +
        R.teachingNav(ctx, 'curriculum') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Lesson plans', value: R.number(o.plans), icon: 'notebook-pen', foot: R.number(o.published_plans) + ' published' }) +
        R.statCard({ label: 'Activities', value: R.number(o.activities), icon: 'puzzle', tone: 'sky', foot: R.number(o.completed_activities) + ' completed' }) +
        R.statCard({ label: 'Upcoming', value: R.number(o.upcoming_activities), icon: 'calendar-days', tone: 'sun', foot: 'Scheduled activities' }) +
        R.statCard({ label: 'Objectives', value: R.number(o.objectives), icon: 'target', tone: 'plum', foot: 'Across all domains' }) +
        '</div>' +
        R.tabs([
          { key: 'plans', label: 'Lesson plans' }, { key: 'frameworks', label: 'Frameworks' },
          { key: 'objectives', label: 'Objectives' }, { key: 'periods', label: 'Periods' }
        ], tab) +
        (tab === 'plans' ? this.renderPlans(ctx, page) : tab === 'frameworks' ? this.renderFrameworks(ctx, page) : tab === 'objectives' ? this.renderObjectives(ctx, page) : this.renderPeriods(page));
    },

    renderPlans(ctx, page) {
      const canCreate = ctx.has('curriculum.create.daycare');
      const canPublish = ctx.has('curriculum.publish.daycare');
      const actions = [];
      if (canCreate) {
        actions.push({ label: 'Submit for review', icon: 'send', path: '/curriculum/lesson-plans/bulk', action: 'submit' });
        actions.push({ label: 'Approve', icon: 'check-circle', path: '/curriculum/lesson-plans/bulk', action: 'approve' });
      }
      if (canCreate && canPublish) actions.push({ label: 'Publish', icon: 'upload', path: '/curriculum/lesson-plans/bulk', action: 'publish' });
      if (canCreate) actions.push({ label: 'Cancel', icon: 'x', path: '/curriculum/lesson-plans/bulk', action: 'cancel', tone: 'danger' });
      const sortKey = String((ctx.filters || {}).sort || 'created');
      const plans = (page.plans || []).slice().sort((a, b) => {
        if (sortKey === 'title') return String(a.title).localeCompare(String(b.title));
        if (sortKey === 'status') return String(a.status).localeCompare(String(b.status));
        if (sortKey === 'classroom') return String(a.classroom_name || '').localeCompare(String(b.classroom_name || ''));
        return new Date(b.created_at) - new Date(a.created_at);
      });
      return (actions.length ? R.bulkBar(actions, { hint: 'Plans that cannot make the move are skipped and reported.' }) : '') +
        R.filterBar('<select class="select" @change="setFilter(\'sort\',$event.target.value)" aria-label="Sort plans"><option value="created"' + (sortKey === 'created' ? ' selected' : '') + '>Newest first</option><option value="title"' + (sortKey === 'title' ? ' selected' : '') + '>Title A–Z</option><option value="status"' + (sortKey === 'status' ? ' selected' : '') + '>Status</option><option value="classroom"' + (sortKey === 'classroom' ? ' selected' : '') + '>Classroom</option></select>') +
        R.table({ rows: plans, selectable: actions.length > 0, columns: [
        { label: 'Plan', render: (p) => '<span class="cell-strong">' + R.esc(p.title) + '</span><span class="cell-sub">' + R.esc(p.theme || '') + (p.source === 'ncf' ? ' · ' : '') + '</span>' },
        { label: 'Classroom', render: (p) => (p.source === 'ncf' ? NCF : '') + ' ' + R.esc(p.classroom_name || (isOfficialRow(p) ? 'Official' : '—')) },
        { label: 'Module', render: (p) => p.module_id ? '<a href="#/app/modules/' + R.attr(p.module_id) + '">' + R.esc(p.module_title || 'Module') + '</a>' : '<span class="muted">—</span>' },
        { label: 'Objectives', render: (p) => '<span class="badge badge-muted">' + ((p.objective_ids || []).length) + '</span>' },
        { label: 'Status', render: (p) => R.badge(p.status) },
        { label: 'Created', render: (p) => R.date(p.created_at) },
        { label: '', align: 'right', render: (p) => '<div class="btn-group">' +
          (isOfficialRow(p)
            ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/curriculum/adopt\',{kind:\'lesson_plan\',id:\'' + R.attr(p.id) + '\'},{successMessage:\'Adopted to your workspace as a draft plan\'})">' + R.icon('copy') + ' Adapt</button>' +
              '<button class="btn btn-sm btn-ghost" @click="openNamedDetail(\'plan\',\'' + R.attr(p.id) + '\')">Open</button>'
            : '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'duplicatePlan\',\'' + R.attr(p.id) + '\')">Duplicate</button>' +
              (ctx.has('curriculum.create.daycare') ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'savePlanTemplate\',\'' + R.attr(p.id) + '\')">Save template</button>' : '') +
              '<button class="btn btn-sm btn-ghost" @click="openNamedDetail(\'plan\',\'' + R.attr(p.id) + '\')">Open</button>' +
              (() => { const next = nextAction(p.status); return next ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'transition\',\'' + R.attr(p.id) + '\')">' + R.esc(next.label) + '</button>' : ''; })()) +
          '</div>' }
      ], emptyTitle: 'No lesson plans', emptyMessage: 'Plan the week around your children\'s interests and the framework.' });
    },

    renderFrameworks(ctx, page) {
      const frameworks = page.frameworks || [];
      if (!frameworks.length) {
        return R.emptyState('No frameworks', 'Create a framework to organise domains and objectives.',
          '<button class="btn btn-primary" @click="openNamedModal(\'framework\')">New framework</button>', 'book-open');
      }
      return '<div class="grid grid-2">' + frameworks.map((framework) => this.frameworkCard(ctx, page, framework)).join('') + '</div>';
    },

    frameworkCard(ctx, page, f) {
      const objectives = page.objectives || [];
      const domains = (f.domains || []).map((d) => {
        const count = objectives.filter((o) => o.domain_id === d.id).length;
        return '<div class="row" style="gap:10px"><span class="dot"></span><div style="flex:1">' +
          '<div class="strong" style="font-size:0.88rem">' + R.esc(d.name) + '</div>' +
          '<div class="muted small">' + R.esc(d.description || '') + '</div></div>' +
          '<span class="badge badge-muted">' + R.number(count) + ' objectives</span></div>';
      }).join('');
      const attribution = f.source === 'ncf' && !isOfficialRow(f) ? '<div class="row" style="gap:8px;margin-bottom:10px">' + NCF + '</div>' : '';
      const body =
        '<div class="muted small" style="margin-bottom:10px">Version ' + R.esc(f.version) + ' · ' + R.esc(f.description || '') + '</div>' +
        (isOfficialRow(f) ? '<div class="row" style="gap:8px;margin-bottom:10px">' + NCF_OFFICIAL + '</div>' : attribution) +
        '<div class="stack">' + domains + '</div>';
      const actions = isOfficialRow(f)
        ? '<div class="btn-group"><span class="badge badge-muted">Read-only starter pack</span>' + (ctx.has('curriculum.create.daycare') ? ' <button class="btn btn-sm btn-primary" @click="openNamedModal(\'adoptOfficialFramework\')">' + R.icon('copy') + ' Adapt to my centre</button>' : '') + '</div>'
        : '<div class="btn-group">' +
            (ctx.has('curriculum.create.daycare') ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'saveFrameworkTemplate\',\'' + R.attr(f.id) + '\')">Save template</button>' : '') +
            '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'domain\',\'' + R.attr(f.id) + '\')">' + R.icon('plus') + ' Domain</button>' +
          '</div>';
      return R.card(f.name, body, actions);
    },

    renderObjectives(ctx, page) {
      const frameworks = page.frameworks || [];
      const ownFrameworks = frameworks.filter((f) => !isOfficialRow(f));
      const hasOwn = ownFrameworks.length > 0;
      const emptyAction = hasOwn
        ? '<button class="btn btn-primary" @click="openNamedModal(\'objective\')">' + R.icon('plus') + ' Add your first objective</button>'
        : '<div class="btn-group"><button class="btn btn-secondary" @click="openNamedModal(\'adoptOfficialFramework\')">' + R.icon('copy') + ' Adapt the official NCF pack</button>' +
          '<button class="btn btn-primary" @click="openNamedModal(\'framework\')">' + R.icon('plus') + ' Create your own framework</button></div>';
      return '<div class="filter-bar" style="justify-content:flex-end;margin-bottom:10px">' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'objective\')">' + R.icon('plus') + ' Add objective</button></div>' +
        R.table({ rows: page.objectives || [], columns: [
        { label: 'Code', render: (o) => '<span class="mono cell-strong">' + R.esc(o.code) + '</span>' },
        { label: 'Domain', render: (o) => R.esc(o.domain_name) },
        { label: 'Objective', render: (o) => R.esc(o.description) + '<span class="cell-sub">' + R.esc(o.expected_observation_context || '') + '</span>' },
        { label: 'Age group', render: (o) => '<span class="badge badge-muted">' + R.esc(o.age_group || 'All ages') + '</span>' },
        { label: 'Status', render: (o) => R.badge(o.status) }
      ], emptyTitle: 'No objectives yet', emptyMessage: hasOwn
        ? 'Objectives describe what children are learning to do. Add your first one — your framework has domains ready.'
        : 'You do not have your own framework yet. Adapt the official NCF pack (a full framework with six domains and 72 outcomes you fully own and can edit), or create a blank one.',
        emptyAction, emptyIcon: 'target' });
    },

    renderPeriods(page) {
      return R.card('Academic periods', R.table({ rows: page.periods || [], columns: [
        { label: 'Period', render: (p) => '<span class="cell-strong">' + R.esc(p.name) + '</span>' },
        { label: 'Type', render: (p) => '<span class="badge badge-muted">' + R.esc(R.titleCase(p.period_type)) + '</span>' },
        { label: 'Starts', render: (p) => R.date(p.starts_on) },
        { label: 'Ends', render: (p) => R.date(p.ends_on) },
        { label: 'Status', render: (p) => R.badge(p.status) }
      ], emptyTitle: 'No periods', emptyMessage: 'Terms and assessment windows are set here.' }), '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'period\')">' + R.icon('plus') + ' New period</button>');
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      const frameworks = page.frameworks || [];
      if (name === 'framework') {
        const frameworkTemplates = page.frameworkTemplates || [];
        ctx.openModal({ title: 'New curriculum framework', endpoint: '/curriculum/frameworks', submitLabel: 'Create framework', size: 'wide',
          description: 'Pick a template to create the domains and objectives in one go, or start from a blank framework.',
          fields: [
            { name: 'template', label: 'Start from template', type: 'select', span: 2, options: frameworkTemplates.map((t) => ({ value: t.id, label: t.name })), help: 'The domains and objectives from the template are created for you — you can edit them afterwards.',
              onChange: (event, data) => {
                const tpl = frameworkTemplates.find((t) => t.id === event.target.value);
                if (!tpl) return;
                const payload = tpl.payload || {};
                if (payload.name) data.name = payload.name;
                if (payload.version) data.version = payload.version;
                if (payload.description) data.description = payload.description;
              } },
            { name: 'name', label: 'Name', required: true, span: 2 },
            { name: 'version', label: 'Version', value: '1.0', required: true },
            { name: 'description', label: 'Description', type: 'textarea', span: 2 }
          ],
          transform: (data) => {
            const out = Object.assign({}, data);
            delete out.template;
            return out;
          },
          onSubmit: async (body, data) => {
            if (data.template) await R.api('POST', '/curriculum/frameworks/from-template', { templateId: data.template, name: body.name });
            else await R.api('POST', '/curriculum/frameworks', body);
          }
        });
      } else if (name === 'saveFrameworkTemplate' && id) {
        const framework = frameworks.find((f) => f.id === id) || {};
        const objectives = page.objectives || [];
        const domains = (framework.domains || []).map((d) => ({
          name: d.name,
          description: d.description || '',
          objectives: objectives.filter((o) => o.domain_id === d.id).map((o) => ({
            code: o.code,
            description: o.description,
            expected_observation_context: o.expected_observation_context || null,
            ageGroup: o.age_group || null
          }))
        }));
        ctx.openModal({
          title: 'Save as framework template', endpoint: '/templates', submitLabel: 'Save template', size: 'wide',
          description: 'Saves the framework with every domain and objective as a reusable starting point for other centres or future frameworks.',
          fields: [
            { name: 'templateName', label: 'Template name', required: true, span: 2, value: 'Copy of ' + (framework.name || 'Framework') },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, placeholder: 'When to use this template…' }
          ],
          transform: (data) => ({
            kind: 'framework',
            name: data.templateName,
            description: data.description || null,
            payload: {
              name: framework.name,
              version: framework.version || '1.0',
              description: framework.description || '',
              domains
            }
          })
        });
      } else if (name === 'domain' && id) {
        ctx.openModal({ title: 'Add domain', endpoint: '/curriculum/domains', submitLabel: 'Add domain', fields: [
          { name: 'frameworkId', label: 'Framework', type: 'select', options: frameworks.map((f) => ({ value: f.id, label: f.name })), value: id, required: true },
          { name: 'name', label: 'Domain name', required: true },
          { name: 'sortOrder', label: 'Sort order', type: 'number', value: 0 },
          { name: 'description', label: 'Description', type: 'textarea', span: 2 }
        ] });
      } else if (name === 'objective') {
        const ownFrameworks = frameworks.filter((f) => !isOfficialRow(f));
        const domains = ownFrameworks.flatMap((f) => (f.domains || []).map((d) => ({ id: d.id, name: f.name + ' · ' + d.name })));
        if (!domains.length) {
          ctx.toast('Create your own framework first (Frameworks tab → New framework, or Adapt the official pack) — you need at least one domain before objectives can be added to it.', 'warn');
          ctx.setTab('frameworks');
          return;
        }
        ctx.openModal({ title: 'Add learning objective', endpoint: '/curriculum/objectives', submitLabel: 'Add objective', fields: [
          { name: 'domainId', label: 'Domain', type: 'select', required: true, options: domains.map((d) => ({ value: d.id, label: d.name })), help: 'Only your own framework domains are shown. The official NCF pack is added via Adapt, not by editing.' },
          { name: 'code', label: 'Code', required: true, placeholder: 'e.g. MY-01' },
          { name: 'ageGroup', label: 'Age group', type: 'select', options: [{ value: '0-18 months', label: '0-18 months' }, { value: '18-36 months', label: '18-36 months' }, { value: '3-4 years', label: '3-4 years' }, { value: '4-5 years', label: '4-5 years' }, { value: '5-6 years', label: '5-6 years' }, { value: 'All ages', label: 'All ages' }], help: 'Match the band your outcome applies to.' },
          { name: 'description', label: 'Description', required: true, span: 2 },
          { name: 'expectedObservationContext', label: 'Where to observe it', type: 'textarea', span: 2, placeholder: 'Story time, outdoor play, snack time…' }
        ] });
      } else if (name === 'adoptOfficialFramework') {
        const official = frameworks.find((f) => isOfficialRow(f) && f.source === 'ncf') || frameworks.find((f) => isOfficialRow(f));
        if (!official) { ctx.toast('The official pack is not enabled for this centre. Enable it in Settings.', 'warn'); return; }
        ctx.openConfirm(
          'Adapt the official NCF pack',
          'This copies the entire official starter framework — six domains and all their outcomes — into your workspace. You keep full ownership: edit, rename or archive anything, and it will never be overwritten by a future update to the official pack.',
          { endpoint: '/curriculum/adopt', method: 'POST', body: { kind: 'framework', id: official.id }, submitLabel: 'Copy into my workspace', successMessage: 'The official framework is yours — edit it freely.' }
        );
      } else if (name === 'plan') {
        const objectives = page.objectives || [];
        const planTemplates = page.planTemplates || [];
        const moduleId = id || null;
        ctx.openModal({
          title: moduleId ? 'New plan in module' : 'New lesson plan', endpoint: '/curriculum/lesson-plans', submitLabel: 'Create plan', size: 'wide',
          description: moduleId
            ? 'This plan joins the end of the module sequence. Pick the objectives it works towards.'
            : 'Pick the objectives this plan works towards. Search by code, domain or phrase.',
          fields: [
            { name: 'template', label: 'Start from template', type: 'select', options: planTemplates.map((t) => ({ value: t.id, label: t.name })), span: 2, help: 'Applying a template fills the fields below — you can still edit them.',
              onChange: (event, data) => {
                const tpl = planTemplates.find((t) => t.id === event.target.value);
                if (!tpl) return;
                const payload = tpl.payload || {};
                if (payload.title) data.title = payload.title;
                if (payload.theme !== undefined) data.theme = payload.theme;
                if (payload.preparationNotes) data.preparationNotes = payload.preparationNotes;
                if (Array.isArray(payload.objectiveIds)) {
                  data.objectiveIds = payload.objectiveIds.slice();
                } else if (Array.isArray(payload.objectiveCodes)) {
                  const codes = payload.objectiveCodes.map((c) => String(c).toUpperCase());
                  data.objectiveIds = objectives.filter((o) => codes.includes(String(o.code).toUpperCase())).map((o) => o.id);
                }
              } },
            { name: 'title', label: 'Title', required: true, span: 2 },
            { name: 'theme', label: 'Theme' },
            { name: 'classroomId', label: 'Classroom', type: 'select', required: true, options: R.classroomOptions(page) },
            { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx) },
            { name: 'academicPeriodId', label: 'Academic period', type: 'select', options: (page.periods || []).map((p) => ({ value: p.id, label: p.name })) },
            { name: 'objectiveIds', label: 'Objectives', type: 'multiselect', span: 2, placeholder: 'Search by code or description…', options: objectives.map((o) => ({ value: o.id, label: o.code + ' · ' + R.truncate(o.description, 48), subtitle: o.description })) },
            { name: 'preparationNotes', label: 'Preparation notes', type: 'textarea', span: 2 },
            { name: 'publishNow', label: 'Publish immediately', type: 'checkbox', value: false, help: 'Publish the plan to teachers now' }
          ],
          transform: (data) => {
            const out = Object.assign({}, data);
            delete out.template;
            if (moduleId) out.moduleId = moduleId;
            return out;
          }
        });
      } else if (name === 'savePlanTemplate' && id) {
        const plan = (page.plans || []).find((p) => p.id === id) || {};
        const objectives = page.objectives || [];
        const objectiveCodes = (plan.objective_ids || []).map((objectiveId) => {
          const objective = objectives.find((o) => o.id === objectiveId);
          return objective ? objective.code : null;
        }).filter(Boolean);
        ctx.openModal({
          title: 'Save as template', endpoint: '/templates', submitLabel: 'Save template', size: 'wide',
          description: 'Save this lesson plan as a reusable starting point. The objectives are stored as codes, so they work in any centre setup.',
          fields: [
            { name: 'templateName', label: 'Template name', required: true, span: 2, value: 'Copy of ' + (plan.title || '') },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, placeholder: 'When to use this template…' }
          ],
          transform: (data) => ({
            kind: 'lesson_plan',
            name: data.templateName,
            description: data.description || null,
            payload: {
              title: plan.title,
              theme: plan.theme,
              preparationNotes: plan.preparation_notes,
              objectiveCodes
            }
          })
        });
      } else if (name === 'duplicatePlan' && id) {
        const plan = (page.plans || []).find((p) => p.id === id) || {};
        const objectives = page.objectives || [];
        ctx.openModal({
          title: 'Duplicate lesson plan', endpoint: '/curriculum/lesson-plans', submitLabel: 'Create copy', size: 'wide',
          description: 'Creates a copy you can adapt for another week or classroom. The copy starts as a draft.',
          fields: [
            { name: 'title', label: 'Title', required: true, span: 2, value: 'Copy of ' + (plan.title || '') },
            { name: 'theme', label: 'Theme', value: plan.theme },
            { name: 'classroomId', label: 'Classroom', type: 'select', required: true, value: plan.classroom_id, options: R.classroomOptions(page) },
            { name: 'branchId', label: 'Branch', type: 'select', required: true, value: plan.branch_id, options: R.branchOptions(ctx) },
            { name: 'academicPeriodId', label: 'Academic period', type: 'select', value: plan.academic_period_id, options: (page.periods || []).map((p) => ({ value: p.id, label: p.name })) },
            { name: 'objectiveIds', label: 'Objectives', type: 'multiselect', span: 2, value: plan.objective_ids || [], options: objectives.map((o) => ({ value: o.id, label: o.code + ' · ' + R.truncate(o.description, 48), subtitle: o.description })) },
            { name: 'preparationNotes', label: 'Preparation notes', type: 'textarea', span: 2, value: plan.preparation_notes }
          ]
        });
      } else if (name === 'transition' && id) {
        const plan = (page.plans || []).find((p) => p.id === id) || {};
        const next = nextAction(plan.status);
        ctx.openModal({ title: 'Advance plan — ' + (next ? next.label : 'update status'), endpoint: '/curriculum/lesson-plans/' + id + '/transition', submitLabel: 'Confirm', fields: [
          { name: 'status', label: 'New status', type: 'select', required: true, value: next ? next.target : undefined, options: NEXT_STATUS[plan.status] || [] },
          { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
        ] });
      } else if (name === 'period') {
        ctx.openModal({ title: 'New academic period', endpoint: '/curriculum/periods', submitLabel: 'Create period', fields: [
          { name: 'branchId', label: 'Branch', type: 'select', options: R.branchOptions(ctx) },
          { name: 'name', label: 'Name', required: true, placeholder: 'Term 1 2027' },
          { name: 'periodType', label: 'Type', type: 'select', options: ['term', 'semester', 'year', 'assessment'], value: 'term' },
          { name: 'startsOn', label: 'Starts on', type: 'date', required: true },
          { name: 'endsOn', label: 'Ends on', type: 'date', required: true }
        ] });
      }
    },

    detail(ctx, name, id) {
      if (name !== 'plan') return null;
      const plan = (((ctx.page || {}).plans) || []).find((p) => p.id === id);
      if (!plan) return { title: 'Lesson plan', html: '<p class="muted">Plan not found.</p>' };
      const objectives = ((ctx.page || {}).objectives || []).filter((o) => (plan.objective_ids || []).includes(o.id));
      return {
        title: plan.title,
        html: '<div class="detail-list">' +
          R.detailItem('Theme', R.esc(plan.theme)) + R.detailItem('Classroom', R.esc(plan.classroom_name)) +
          R.detailItem('Status', R.badge(plan.status)) + R.detailItem('Created by', R.esc(plan.created_by_name)) +
          R.detailItem('Published', R.date(plan.published_at)) + R.detailItem('Delivered', R.date(plan.delivered_at)) +
          '</div><div class="section"></div><h3>Objectives</h3>' +
          (objectives.length ? '<ul class="list-clean">' + objectives.map((o) => '<li><span class="mono badge badge-muted">' + R.esc(o.code) + '</span><span>' + R.esc(o.description) + '</span></li>').join('') + '</ul>' : '<p class="muted">No objectives linked.</p>') +
          '<h3 style="margin-top:16px">Preparation</h3><p class="muted">' + R.esc(plan.preparation_notes || 'No notes.') + '</p>' +
          (plan.delivery_notes ? '<h3>Delivery notes</h3><p class="muted">' + R.esc(plan.delivery_notes) + '</p>' : '') +
          '<div class="section"></div><button class="btn btn-primary" @click="openGuide(\'' + R.attr(plan.id) + '\')">' + R.icon('play-circle') + ' Open lesson guide</button>'
      };
    }
  };

  V.activities = {
    async load(ctx) {
      const [activities, plans, classrooms, activityTemplates] = await Promise.all([
        R.api('GET', '/curriculum/activities'),
        R.api('GET', '/curriculum/lesson-plans').catch(() => ({ data: [] })),
        R.api('GET', '/classrooms').catch(() => ({ data: [] })),
        R.api('GET', '/templates?kind=activity').then((p) => (p.data && p.data.data) || []).catch(() => [])
      ]);
      return { rows: activities.data, plans: plans.data || [], classrooms: classrooms.data || [], activityTemplates };
    },
    render(ctx, params, page) {
      const filters = ctx.filters || {};
      const query = String(filters.q || '').trim().toLowerCase();
      const type = String(filters.type || '');
      const age = String(filters.age || '');
      const materials = String(filters.materials || '');
      const ageLabel = (a) => String(a.age_group || 'All ages').replace(/(\d+)\s*-\s*(\d+)\s*[Yy]ears?/i, '$1–$2 Years').replace(/(\d+)\s*months?\s*-\s*(\d+)\s*[Yy]ears?/i, '$1 months–$2 Years');
      const all = page.rows || [];
      const shown = all.filter((a) => (!type || a.activity_type === type) && (!age || a.age_group === age)
        && (!materials || (materials === 'has' ? !!a.materials : !a.materials))
        && (!query || (a.title + ' ' + (a.description || '') + ' ' + (a.materials || '') + ' ' + (a.activity_type || '')).toLowerCase().includes(query)));
      const types = Array.from(new Set(all.map((a) => a.activity_type).filter(Boolean))).sort();
      const ages = Array.from(new Set(all.map((a) => a.age_group).filter(Boolean))).sort();
      return R.pageHead('Activities', 'The experiences that fill the day — from sensory play to early literacy.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'activity\')">' + R.icon('plus') + ' New activity</button>' + R.exportButtons('/exports/activities') +
        R.refreshButton()) +
        R.teachingNav(ctx, 'activities') +
        R.filterBar('<input class="input" type="search" placeholder="Search activities…" value="' + R.attr(query) + '" @change="setFilter(\'q\',$event.target.value)" style="max-width:230px" aria-label="Search activities">' +
          R.selectFilter(ctx, 'type', types.map((t) => ({ value: t, label: R.titleCase(t) })), 'All domains') +
          R.selectFilter(ctx, 'age', ages.map((t) => ({ value: t, label: t })), 'All ages') +
          '<select class="select" @change="setFilter(\'materials\',$event.target.value)" aria-label="Filter by materials"><option value="">Materials: any</option><option value="has"' + (materials === 'has' ? ' selected' : '') + '>Has materials</option><option value="missing"' + (materials === 'missing' ? ' selected' : '') + '>No materials listed</option></select>' +
          (query || type || age || materials ? '<a class="btn btn-ghost btn-sm" href="#/app/activities">Clear</a>' : '')) +
        ((query || type || age || materials) && !shown.length ? '<p class="muted small" style="margin:18px 0;text-align:center">Nothing matches those filters. <a href="#/app/activities">Clear filters</a></p>' : '') +
        '<div class="grid grid-3">' + shown.map((a) => R.card(a.title,
          '<div class="row" style="margin-bottom:8px"><span class="badge badge-sun">' + R.esc(ageLabel(a)) + '</span><span class="badge badge-muted">' + R.esc(R.titleCase(a.activity_type || 'activity')) + '</span><span class="badge badge-sky">' + R.number(a.duration_minutes) + ' min</span></div>' +
          '<p class="muted small">' + R.esc(a.description || '') + '</p>' +
          '<div class="muted small"><strong>Materials:</strong> ' + R.esc(a.materials || '—') + '</div>' +
          (a.safety_notes ? '<div class="alert alert-warn" style="margin-top:8px">' + R.icon('shield-alert') + '<span>' + R.esc(a.safety_notes) + '</span></div>' : ''),
          '<div class="btn-group">' + R.badge(a.status) +
            (isOfficialRow(a)
              ? ' ' + NCF +
                '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/curriculum/adopt\',{kind:\'activity\',id:\'' + R.attr(a.id) + '\'},{successMessage:\'Adopted to your workspace\'})">' + R.icon('copy') + ' Adapt</button>'
              : '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'activityEdit\',\'' + R.attr(a.id) + '\')">Edit</button>' +
                '<span class="menu-wrap" x-data="{ open: false }" @click.outside="open = false">' +
                  '<button class="btn btn-sm btn-ghost btn-icon" @click="open = !open" aria-label="More actions" :aria-expanded="open"><i data-lucide="more-horizontal"></i></button>' +
                  '<div class="menu" x-cloak x-show="open">' +
                    '<button class="menu-item" @click="open = false; openNamedModal(\'saveActivityTemplate\',\'' + R.attr(a.id) + '\')"><i data-lucide="bookmark"></i> Save as template</button>' +
                    (a.status === 'active' ? '<button class="menu-item" @click="open = false; act(\'POST\',\'/curriculum/activities/' + R.attr(a.id) + '/archive\',{},{successMessage:\'Activity archived\'})"><i data-lucide="archive"></i> Archive</button>' : '') +
                  '</div>' +
                '</span>') +
          '</div>')).join('') + '</div>' +
        ((page.rows || []).length ? '' : R.emptyState('No activities yet', 'Build a library of activities your team can reuse.', '<div class="btn-group" style="justify-content:center"><button class="btn btn-primary" @click="openNamedModal(\'activity\')">New activity</button>' + '<button class="btn btn-ghost" @click="loadSampleData(\'activities\')">Preview with sample data</button></div>', 'puzzle'));
    },
    openModal(ctx, name, id) {
      const page = ctx.page || {};
      if (name === 'activityEdit' && id) {
        const a = (page.rows || []).find((x) => x.id === id) || {};
        ctx.openModal({ title: 'Edit activity', endpoint: '/curriculum/activities/' + id, method: 'PATCH', submitLabel: 'Save activity', size: 'wide', fields: [
          { name: 'title', label: 'Title', required: true, span: 2, value: a.title },
          { name: 'branchId', label: 'Branch', type: 'select', options: R.branchOptions(ctx), value: a.branch_id },
          { name: 'ageGroup', label: 'Age group', value: a.age_group, placeholder: '3-5 years' },
          { name: 'activityType', label: 'Type', type: 'select', options: ['sensory', 'creative', 'physical', 'literacy', 'numeracy', 'music', 'outdoor', 'quiet'], value: a.activity_type },
          { name: 'durationMinutes', label: 'Duration (minutes)', type: 'number', value: a.duration_minutes || 30 },
          { name: 'description', label: 'Description', type: 'textarea', span: 2, value: a.description },
          { name: 'materials', label: 'Materials', type: 'textarea', span: 2, value: a.materials },
          { name: 'safetyNotes', label: 'Safety notes', type: 'textarea', span: 2, value: a.safety_notes }
        ] });
        return;
      }
      if (name === 'saveActivityTemplate' && id) {
        const a = (page.rows || []).find((x) => x.id === id) || {};
        ctx.openModal({
          title: 'Save as template', endpoint: '/templates', submitLabel: 'Save template', size: 'wide',
          description: 'Save this activity as a reusable starting point for future sessions and lesson plans.',
          fields: [
            { name: 'templateName', label: 'Template name', required: true, span: 2, value: a.title },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, placeholder: 'When to use this template…' }
          ],
          transform: (data) => ({
            kind: 'activity',
            name: data.templateName,
            description: data.description || null,
            payload: {
              title: a.title,
              activityType: a.activity_type,
              durationMinutes: a.duration_minutes,
              description: a.description,
              materials: a.materials,
              safetyNotes: a.safety_notes,
              ageGroup: a.age_group
            }
          })
        });
        return;
      }
      if (name !== 'activity') return;
      const activityTemplates = page.activityTemplates || [];
      ctx.openModal({ title: 'New activity', endpoint: '/curriculum/activities', submitLabel: 'Create activity', size: 'wide',
        fields: [
          { name: 'template', label: 'Start from template', type: 'select', options: activityTemplates.map((t) => ({ value: t.id, label: t.name })), span: 2, help: 'Applying a template fills the fields below — you can still edit them.',
            onChange: (event, data) => {
              const tpl = activityTemplates.find((t) => t.id === event.target.value);
              if (tpl && tpl.payload) Object.assign(data, tpl.payload);
            } },
          { name: 'title', label: 'Title', required: true, span: 2 },
          { name: 'branchId', label: 'Branch', type: 'select', options: R.branchOptions(ctx) },
          { name: 'ageGroup', label: 'Age group', placeholder: '3-5 years' },
          { name: 'activityType', label: 'Type', type: 'select', options: ['sensory', 'creative', 'physical', 'literacy', 'numeracy', 'music', 'outdoor', 'quiet'] },
          { name: 'durationMinutes', label: 'Duration (minutes)', type: 'number', value: 30 },
          { name: 'description', label: 'Description', type: 'textarea', span: 2 },
          { name: 'materials', label: 'Materials', type: 'textarea', span: 2 },
          { name: 'safetyNotes', label: 'Safety notes', type: 'textarea', span: 2 }
        ],
        transform: (data) => {
          const out = Object.assign({}, data);
          delete out.template;
          return out;
        }
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Calendar: interactive planning workspace
  // ---------------------------------------------------------------------------

  function calPad(n) { return String(n).padStart(2, '0'); }
  function calYmd(d) {
    const dt = d instanceof Date ? d : new Date(d);
    return dt.getFullYear() + '-' + calPad(dt.getMonth() + 1) + '-' + calPad(dt.getDate());
  }
  function calAddDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return calYmd(d);
  }
  function calStartOfWeek(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return calYmd(d);
  }
  function calEndOfWeek(dateStr) { return calAddDays(calStartOfWeek(dateStr), 6); }
  function calStartOfMonth(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return calYmd(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  function calEndOfMonth(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return calYmd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }
  function calDiffDays(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }
  function calRangeLabel(from, to) {
    if (!from || !to) return '';
    if (from === to) return R.date(from + 'T00:00:00');
    const f = new Date(from + 'T00:00:00');
    const t = new Date(to + 'T00:00:00');
    const sameMonth = f.getMonth() === t.getMonth() && f.getFullYear() === t.getFullYear();
    const opts = { day: 'numeric', month: 'short' };
    const fromLabel = f.toLocaleDateString('en-ZA', Object.assign({}, opts, { year: sameMonth ? undefined : 'numeric' }));
    const toLabel = t.toLocaleDateString('en-ZA', Object.assign({}, opts, { year: 'numeric' }));
    return fromLabel + ' – ' + toLabel;
  }
  function calToLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + calPad(d.getMonth() + 1) + '-' + calPad(d.getDate()) + 'T' + calPad(d.getHours()) + ':' + calPad(d.getMinutes());
  }
  /**
   * After duplicating or rescheduling, bring the resulting event back into
   * view: a copy lands on the next day and a reschedule can move outside the
   * current range, so otherwise the action looks like it silently failed.
   */
  function revealCalendarEvent(ctx, event) {
    if (!event || !event.id) return;
    const day = String(event.startsAt || event.starts_at || '').slice(0, 10);
    if (day && ctx.filters && (day < ctx.filters.from || day > ctx.filters.to)) {
      ctx.filters.from = day;
      ctx.filters.to = day;
      ctx.filters.rangePreset = 'custom';
    }
    if (ctx.calendarUi) {
      ctx.calendarUi.drawerEventId = event.id;
      ctx.calendarUi.drawerEvent = null; // let the drawer loader re-fetch saved values
    }
  }
  function calDefaultStartForDay(dayStr) {
    const now = new Date();
    const base = new Date(dayStr + 'T09:00:00');
    if (calYmd(now) === dayStr) {
      const rounded = new Date(now);
      rounded.setMinutes(Math.ceil(rounded.getMinutes() / 30) * 30, 0, 0);
      if (rounded.getHours() < 7) return dayStr + 'T09:00';
      if (rounded.getHours() >= 17) return dayStr + 'T09:00';
      return calYmd(rounded) + 'T' + calPad(rounded.getHours()) + ':' + calPad(rounded.getMinutes());
    }
    return dayStr + 'T09:00';
  }
  function calAddMinutesToInput(localInput, minutes) {
    const d = new Date(localInput);
    if (Number.isNaN(d.getTime())) return '';
    d.setMinutes(d.getMinutes() + minutes);
    return d.getFullYear() + '-' + calPad(d.getMonth() + 1) + '-' + calPad(d.getDate()) + 'T' + calPad(d.getHours()) + ':' + calPad(d.getMinutes());
  }
  function calEventMinutes(iso) {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  }
  function calOverlaps(a, b) {
    const aStart = new Date(a.starts_at).getTime();
    const aEnd = new Date(a.ends_at || a.starts_at).getTime() || aStart + 1800000;
    const bStart = new Date(b.starts_at).getTime();
    const bEnd = new Date(b.ends_at || b.starts_at).getTime() || bStart + 1800000;
    return aStart < bEnd && bStart < aEnd;
  }
  function calStatusClass(status) {
    return ({ scheduled: 'is-scheduled', in_progress: 'is-inprogress', completed: 'is-completed', cancelled: 'is-cancelled' })[status] || 'is-scheduled';
  }
  function calStatusLabel(status) {
    return ({ scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' })[status] || R.titleCase(status || '');
  }

  const CAL_PREF_KEY = 'reel.calendar.prefs';

  function calLoadPrefs() {
    try { return JSON.parse(localStorage.getItem(CAL_PREF_KEY) || '{}') || {}; } catch { return {}; }
  }
  function calSavePrefs(patch) {
    try {
      const cur = calLoadPrefs();
      localStorage.setItem(CAL_PREF_KEY, JSON.stringify(Object.assign({}, cur, patch || {})));
    } catch { /* ignore */ }
  }

  V.calendar = {
    async load(ctx) {
      const prefs = calLoadPrefs();
      const today = R.today();
      let from = ctx.filters.from || prefs.from;
      let to = ctx.filters.to || prefs.to;
      let preset = ctx.filters.rangePreset || prefs.rangePreset || 'next2weeks';
      const view = ctx.filters.calendarView || prefs.calendarView || 'agenda';
      if (!from || !to) {
        if (preset === 'today') { from = today; to = today; }
        else if (preset === 'week') { from = calStartOfWeek(today); to = calEndOfWeek(today); }
        else if (preset === 'nextweek') { const s = calStartOfWeek(calAddDays(today, 7)); from = s; to = calEndOfWeek(s); }
        else if (preset === 'month') { from = calStartOfMonth(today); to = calEndOfMonth(today); }
        else { from = calAddDays(today, -7); to = calAddDays(today, 21); preset = 'next2weeks'; }
      } else if (!ctx.filters.rangePreset && !prefs.rangePreset) {
        preset = 'custom';
      }
      ctx.filters.from = from;
      ctx.filters.to = to;
      ctx.filters.calendarView = view;
      ctx.filters.rangePreset = preset;
      ctx.filters.classroomId = ctx.filters.classroomId || '';
      ctx.filters.staffId = ctx.filters.staffId || '';
      ctx.filters.status = ctx.filters.status || '';
      ctx.filters.moduleId = ctx.filters.moduleId || '';
      ctx.filters.density = ctx.filters.density || prefs.density || (typeof document !== 'undefined' && document.documentElement.dataset.density === 'compact' ? 'compact' : 'comfortable');
      if (ctx.calendarUi && ctx.calendarUi.drawerEventId) {
        // keep drawer state across reloads
      } else {
        ctx.calendarUi = Object.assign({}, ctx.calendarUi || {}, { drawerEventId: null, drawerEvent: null, drawerLoading: false, drag: null, miniMonth: from.slice(0, 7), collapsedDays: ctx.calendarUi && ctx.calendarUi.collapsedDays || {}, actionBusy: null, prefetched: {} });
      }
      if (!ctx.calendarUi.miniMonth) ctx.calendarUi.miniMonth = from.slice(0, 7);
      calSavePrefs({ from, to, calendarView: view, rangePreset: preset, density: ctx.filters.density });

      const [events, activities, plans, classrooms, staff, learners] = await Promise.all([
        R.api('GET', '/curriculum/calendar?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to)),
        R.api('GET', '/curriculum/activities').catch(() => ({ data: [] })),
        R.api('GET', '/curriculum/lesson-plans?pageSize=100').catch(() => ({ data: [] })),
        R.api('GET', '/classrooms').catch(() => ({ data: [] })),
        ctx.has('staff.read.daycare') ? R.api('GET', '/staff').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        R.api('GET', '/learners?pageSize=100').catch(() => ({ data: [] }))
      ]);
      const plansData = Array.isArray(plans.data) ? plans.data : (plans.data && plans.data.data) || [];
      const rows = (events.data || []).map((e) => Object.assign({}, e));
      return { rows, from, to, activities: activities.data || [], plans: plansData, classrooms: classrooms.data || [], staff: staff.data || [], learners: learners.data || [] };
    },

    filteredRows(ctx, page) {
      let rows = (page.rows || []).slice();
      const f = ctx.filters || {};
      if (f.classroomId) rows = rows.filter((e) => String(e.classroom_id || '') === String(f.classroomId));
      if (f.staffId) rows = rows.filter((e) => String(e.assigned_staff_id || '') === String(f.staffId));
      if (f.status) rows = rows.filter((e) => String(e.status || '') === String(f.status));
      if (f.moduleId) rows = rows.filter((e) => String(e.lesson_plan_module_id || '') === String(f.moduleId));
      return rows.sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
    },

    render(ctx, params, page) {
      const allRows = page.rows || [];
      const rows = this.filteredRows(ctx, page);
      const view = ctx.filters.calendarView || 'agenda';
      const from = page.from || ctx.filters.from;
      const to = page.to || ctx.filters.to;
      const ui = ctx.calendarUi || {};
      const today = R.today();
      const conflicts = this.computeConflicts(allRows);

      const byDay = {};
      rows.forEach((e) => {
        const day = String(e.starts_at || '').slice(0, 10);
        (byDay[day] = byDay[day] || []).push(e);
      });
      Object.keys(byDay).forEach((d) => byDay[d].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))));

      let body = '';
      if (view === 'grid') body = this.renderGrid(ctx, page, rows, byDay, from, to, today, conflicts);
      else if (view === 'week') body = this.renderWeek(ctx, page, rows, from, to, today, conflicts);
      else if (view === 'day') body = this.renderDay(ctx, page, rows, from, to, today, conflicts);
      else body = this.renderAgenda(ctx, page, rows, byDay, from, to, today, conflicts);

      const drawer = ui.drawerEventId ? this.renderDrawer(ctx, page, ui, conflicts) : '';

      return R.pageHead('Learning calendar', 'Plan, run and track each day — schedule activities, open guides and capture participation.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'event\')">' + R.icon('calendar-plus') + ' Schedule activity</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="window.print()">' + R.icon('printer') + ' Print</button>' +
        R.exportButtons('/exports/activity-participation') +
        R.refreshButton()) +
        R.teachingNav(ctx, 'calendar') +
        this.renderToolbar(ctx, page, view, from, to, rows, allRows) +
        body +
        drawer;
    },

    computeConflicts(rows) {
      const map = {};
      const mark = (id) => { map[id] = (map[id] || 0) + 1; };
      const by = (keyFn) => {
        const groups = {};
        rows.forEach((e) => {
          if (!e || e.status === 'cancelled') return;
          const k = keyFn(e);
          if (!k) return;
          (groups[k] = groups[k] || []).push(e);
        });
        Object.values(groups).forEach((list) => {
          list.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
          for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
              if (calOverlaps(list[i], list[j])) { mark(list[i].id); mark(list[j].id); }
              else break;
            }
          }
        });
      };
      by((e) => e.classroom_id ? 'c:' + e.classroom_id : null);
      by((e) => e.assigned_staff_id ? 's:' + e.assigned_staff_id : null);
      return map;
    },

    renderToolbar(ctx, page, view, from, to, rows, allRows) {
      const preset = ctx.filters.rangePreset || 'custom';
      const presets = [
        ['today', 'Today'], ['week', 'This week'], ['nextweek', 'Next week'], ['month', 'This month']
      ];
      const views = [['agenda','Agenda'],['day','Day'],['week','Week'],['grid','Month/grid']];
      const density = ctx.filters.density || 'comfortable';
      const classrooms = page.classrooms || [];
      const staff = page.staff || [];
      const modules = [];
      const seenM = new Set();
      (page.plans || []).forEach((p) => { if (p.module_id && !seenM.has(p.module_id)) { seenM.add(p.module_id); modules.push({ id: p.module_id, title: p.module_title || 'Module' }); } });
      const statusOpts = [['','All statuses'],['scheduled','Scheduled'],['in_progress','In progress'],['completed','Completed'],['cancelled','Cancelled']];
      const conflictCount = Object.keys(this.computeConflicts(allRows)).length;
      const nowEvents = rows.filter((e) => this.isNow(e, from, to)).length;

      let h = '<div class="cal-toolbar card glass section" id="cal-toolbar">';
      h += '<div class="cal-toolbar-row cal-toolbar-top">';
      h += '<div class="cal-nav-group">';
      h += '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'calStep\',\'prev\')" title="Previous">' + R.icon('chevron-left') + '</button>';
      h += '<button class="btn btn-sm ' + (preset === 'today' && from === R.today() && to === R.today() ? 'btn-primary' : 'btn-secondary') + '" @click="openNamedModal(\'calPreset\',\'today\')">Jump to today</button>';
      h += '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'calStep\',\'next\')" title="Next">' + R.icon('chevron-right') + '</button>';
      h += '<div class="cal-range-label"><strong>' + R.esc(calRangeLabel(from, to)) + '</strong><span class="muted small">' + R.number(rows.length) + ' event' + (rows.length === 1 ? '' : 's') + (rows.length !== allRows.length ? ' · filtered from ' + R.number(allRows.length) : '') + '</span></div>';
      h += '</div>';
      h += '<div class="cal-presets">';
      presets.forEach(([k, label]) => { h += '<button class="chip cal-chip ' + (preset === k ? 'active' : '') + '" @click="openNamedModal(\'calPreset\',\'' + k + '\')">' + R.esc(label) + '</button>'; });
      h += '</div>';
      h += '</div>';

      h += '<div class="cal-toolbar-row cal-toolbar-mid">';
      h += '<div class="cal-views" role="tablist" aria-label="Calendar views">';
      views.forEach(([k, label]) => { h += '<button class="btn btn-sm ' + (view === k ? 'btn-primary' : 'btn-secondary') + '" @click="setFilter(\'calendarView\',\'' + k + '\')" role="tab" aria-selected="' + (view === k) + '">' + R.esc(label) + '</button>'; });
      h += '</div>';
      h += '<div class="cal-inline-dates">';
      h += '<label class="small muted">From <input class="input input-sm" type="date" value="' + R.attr(from) + '" @change="openNamedModal(\'calSetRange\', $event.target.value + \'|\' + \'' + R.attr(to) + '\')"></label>';
      h += '<label class="small muted">To <input class="input input-sm" type="date" value="' + R.attr(to) + '" @change="openNamedModal(\'calSetRange\', \'' + R.attr(from) + '\' + \'|\' + $event.target.value)"></label>';
      h += '</div>';
      h += '<div class="cal-density">';
      h += '<button class="btn btn-sm ' + (density === 'comfortable' ? 'btn-primary' : 'btn-ghost') + '" @click="openNamedModal(\'calDensity\',\'comfortable\')" title="Comfortable">Comfort</button>';
      h += '<button class="btn btn-sm ' + (density === 'compact' ? 'btn-primary' : 'btn-ghost') + '" @click="openNamedModal(\'calDensity\',\'compact\')" title="Compact">Compact</button>';
      h += '</div>';
      h += '</div>';

      h += '<div class="cal-toolbar-row cal-toolbar-filters">';
      h += '<select class="select select-sm" @change="openNamedModal(\'calFilter\', \'classroomId|\' + $event.target.value)"><option value="">All classrooms</option>' + classrooms.map((c) => '<option value="' + R.attr(c.id) + '"' + (ctx.filters.classroomId == c.id ? ' selected' : '') + '>' + R.esc(c.name) + '</option>').join('') + '</select>';
      h += '<select class="select select-sm" @change="openNamedModal(\'calFilter\', \'staffId|\' + $event.target.value)"><option value="">All staff</option>' + staff.map((s) => '<option value="' + R.attr(s.id) + '"' + (ctx.filters.staffId == s.id ? ' selected' : '') + '>' + R.esc(s.display_name || s.name || 'Staff') + '</option>').join('') + '</select>';
      h += '<select class="select select-sm" @change="openNamedModal(\'calFilter\', \'status|\' + $event.target.value)">' + statusOpts.map(([v,l]) => '<option value="' + R.attr(v) + '"' + (ctx.filters.status == v ? ' selected' : '') + '>' + R.esc(l) + '</option>').join('') + '</select>';
      h += '<select class="select select-sm" @change="openNamedModal(\'calFilter\', \'moduleId|\' + $event.target.value)"><option value="">All modules/plans</option>' + modules.map((m) => '<option value="' + R.attr(m.id) + '"' + (ctx.filters.moduleId == m.id ? ' selected' : '') + '>' + R.esc(m.title) + '</option>').join('') + '</select>';
      h += (ctx.filters.classroomId || ctx.filters.staffId || ctx.filters.status || ctx.filters.moduleId ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'calClearFilters\')">' + R.icon('x') + ' Clear filters</button>' : '');
      h += '</div>';

      if (conflictCount || nowEvents) {
        h += '<div class="cal-toolbar-row cal-toolbar-alerts">';
        if (nowEvents) h += '<span class="badge badge-sun"><i data-lucide="radio"></i> ' + R.number(nowEvents) + ' happening now</span>';
        if (conflictCount) h += '<span class="badge badge-danger"><i data-lucide="alert-triangle"></i> ' + R.number(conflictCount) + ' event' + (conflictCount === 1 ? '' : 's') + ' with overlaps</span>';
        h += '<span class="muted small">Tip: click a day to schedule, click an event for details and actions.</span>';
        h += '</div>';
      }

      h += this.renderMiniCalendar(ctx, page, from, to);
      h += '</div>';
      return h;
    },

    renderMiniCalendar(ctx, page, from, to) {
      const ui = ctx.calendarUi || {};
      const monthStr = ui.miniMonth || (from || R.today()).slice(0, 7);
      const parts = monthStr.split('-');
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const start = new Date(first); start.setDate(start.getDate() - first.getDay());
      const eventDays = new Set((page.rows || []).map((e) => String(e.starts_at || '').slice(0, 10)));
      const today = R.today();
      let h = '<div class="cal-mini">';
      h += '<div class="cal-mini-head"><button class="btn btn-sm btn-ghost" @click="openNamedModal(\'calMiniMonth\',\'-1\')">' + R.icon('chevron-left') + '</button>' +
        '<button class="btn btn-sm btn-ghost cal-mini-title" @click="openNamedModal(\'calPreset\',\'month\')">' + R.esc(first.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })) + '</button>' +
        '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'calMiniMonth\',\'1\')">' + R.icon('chevron-right') + '</button></div>';
      h += '<div class="cal-mini-grid">';
      ['S','M','T','W','T','F','S'].forEach((d) => { h += '<div class="cal-mini-wd">' + d + '</div>'; });
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const ds = calYmd(d);
        const inMonth = d.getMonth() === month;
        const inRange = ds >= from && ds <= to;
        const has = eventDays.has(ds);
        h += '<button type="button" class="cal-mini-day' + (inMonth ? '' : ' is-out') + (inRange ? ' is-inrange' : '') + (ds === today ? ' is-today' : '') + '" @click="openNamedModal(\'calFocusDay\',\'' + R.attr(ds) + '\')">' +
          '<span>' + d.getDate() + '</span>' + (has ? '<i class="cal-mini-dot"></i>' : '') + '</button>';
      }
      h += '</div></div>';
      return h;
    },

    isNow(e, from, to) {
      if (!e || (e.status !== 'scheduled' && e.status !== 'in_progress')) return false;
      const now = Date.now();
      const start = new Date(e.starts_at).getTime();
      const end = e.ends_at ? new Date(e.ends_at).getTime() : (start + 30 * 60000);
      return now >= start && now <= end;
    },

    renderEventChip(ctx, e, opts) {
      const o = opts || {};
      const conflicts = o.conflicts || {};
      const compact = o.compact;
      const now = this.isNow(e);
      const conflict = conflicts[e.id];
      const cls = ['cal-event', calStatusClass(e.status), now ? 'is-now' : '', conflict ? 'has-conflict' : '', compact ? 'is-compact' : ''].filter(Boolean).join(' ');
      const label = R.time(e.starts_at) + ' ' + (e.title || 'Activity');
      return '<button type="button" class="' + cls + '" draggable="' + (e.status !== 'completed' && e.status !== 'cancelled') + '" ' +
        'data-event-id="' + R.attr(e.id) + '" ' +
        '@click="openNamedModal(\'calEvent\',\'' + R.attr(e.id) + '\')" ' +
        'ondragstart="window.Reel && window.Reel._calDragStart && window.Reel._calDragStart(event,\'' + R.attr(e.id) + '\')" ' +
        'ondragend="window.Reel && window.Reel._calDragEnd && window.Reel._calDragEnd(event)" ' +
        'title="' + R.attr(label + (conflict ? ' · Overlaps with another event' : '') + (now ? ' · Happening now' : '')) + '" ' +
        'aria-label="' + R.attr(label + ', ' + calStatusLabel(e.status)) + '">' +
        '<span class="cal-event-time">' + R.esc(R.time(e.starts_at)) + '</span>' +
        '<span class="cal-event-title">' + R.esc(e.title || 'Activity') + '</span>' +
        (now ? '<span class="cal-event-now" title="Happening now"></span>' : '') +
        (conflict ? '<i data-lucide="alert-triangle" class="cal-event-conflict" aria-label="Overlap"></i>' : '') +
        '</button>';
    },

    renderAgenda(ctx, page, rows, byDay, from, to, today, conflicts) {
      const days = [];
      for (let d = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00'); d <= end; d.setDate(d.getDate() + 1)) days.push(calYmd(d));
      const density = ctx.filters.density || 'comfortable';
      const ui = ctx.calendarUi || {};
      let h = '<div class="cal-agenda cal-density-' + R.attr(density) + '" id="cal-main">';
      days.forEach((day) => {
        const list = byDay[day] || [];
        const isToday = day === today;
        const past = day < today;
        const collapsed = past && ui.collapsedDays && ui.collapsedDays[day];
        const label = isToday ? 'Today' : (day === calAddDays(today, 1) ? 'Tomorrow' : R.date(day + 'T00:00:00'));
        h += '<div class="card section cal-day-card' + (isToday ? ' cal-day-today' : '') + '" id="cal-day-' + R.attr(day) + '" data-day="' + R.attr(day) + '">';
        h += '<div class="card-head cal-day-head" style="cursor:' + (past ? 'pointer' : 'default') + '" ' + (past ? '@click="openNamedModal(\'calToggleDay\',\'' + R.attr(day) + '\')"' : '') + '>';
        h += '<h3>' + R.icon(isToday ? 'sun' : 'calendar-days') + ' ' + R.esc(label) + ' <span class="muted small" style="font-weight:500">' + R.esc(isToday || day === calAddDays(today,1) ? R.date(day + 'T00:00:00') : '') + '</span></h3>';
        h += '<div class="row" style="gap:8px;align-items:center"><span class="badge badge-muted">' + R.number(list.length) + '</span>' +
          (past ? '<button class="btn btn-sm btn-ghost" @click.stop="openNamedModal(\'calToggleDay\',\'' + R.attr(day) + '\')">' + R.icon(collapsed ? 'chevron-down' : 'chevron-up') + '</button>' : '') +
          '<button class="btn btn-sm btn-secondary" @click.stop="openNamedModal(\'calNewAt\',\'' + R.attr(day) + '\')">' + R.icon('plus') + ' Add</button></div></div>';
        if (!(past && collapsed)) {
          if (!list.length) {
            h += '<div class="cal-day-empty">' + R.emptyState('No activities planned', 'Add a block for this day to build out the schedule.',
              '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'calNewAt\',\'' + R.attr(day) + '\')">' + R.icon('plus') + ' Schedule activity</button>', 'calendar-plus') + '</div>';
          } else {
            h += '<div class="stack cal-day-list">';
            list.forEach((e) => {
              const now = this.isNow(e);
              const conflict = conflicts[e.id];
              h += '<div class="cal-agenda-row ' + calStatusClass(e.status) + (now ? ' is-now' : '') + (conflict ? ' has-conflict' : '') + '" tabindex="0" role="button" ' +
                '@click="if (!$event.target.closest(\'button[data-action]\')) openNamedModal(\'calEvent\',\'' + R.attr(e.id) + '\')" ' +
                '@keydown.enter.prevent="openNamedModal(\'calEvent\',\'' + R.attr(e.id) + '\')" @keydown.space.prevent="openNamedModal(\'calEvent\',\'' + R.attr(e.id) + '\')" ' +
                'aria-label="' + R.attr((e.title || 'Activity') + ' at ' + R.time(e.starts_at) + ', ' + calStatusLabel(e.status)) + '">';
              h += '<div class="cal-agenda-time"><div class="strong">' + R.esc(R.time(e.starts_at)) + '</div><div class="muted small">' + R.esc(e.ends_at ? R.time(e.ends_at) : '') + '</div>' + (now ? '<span class="badge badge-sun" style="margin-top:4px">Now</span>' : '') + '</div>';
              h += '<div class="cal-agenda-main"><div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><span class="strong">' + R.esc(e.title || 'Activity') + '</span>' + R.badge(e.status) + (conflict ? '<span class="badge badge-danger">Overlap</span>' : '') + '</div>' +
                '<div class="muted small">' + R.esc(e.classroom_name || 'Whole centre') + (e.staff_name ? ' · ' + R.esc(e.staff_name) : '') + (e.lesson_plan_title ? ' · ' + R.esc(e.lesson_plan_title) : '') + (e.module_title ? ' · ' + R.esc(e.module_title) : '') + '</div>' +
                (e.activity_materials ? '<div class="muted small">Materials: ' + R.esc(R.truncate(e.activity_materials, 80)) + '</div>' : '') +
                '</div>';
              h += '<div class="cal-agenda-actions btn-group">';
              h += '<button data-action="1" class="btn btn-sm btn-secondary" @click.stop="openNamedModal(\'calEvent\',\'' + R.attr(e.id) + '\')">Details</button>';
              if (e.lesson_plan_id) h += '<button data-action="1" class="btn btn-sm btn-ghost" @click.stop="openGuide(\'' + R.attr(e.lesson_plan_id) + '\')" title="Teach / Guide">' + R.icon('book-open') + '</button>';
              h += '</div></div>';
            });
            h += '</div>';
          }
        }
        h += '</div>';
      });
      h += '</div>';
      return h;
    },

    renderGrid(ctx, page, rows, byDay, from, to, today, conflicts) {
      const start = new Date(calStartOfMonth(from) + 'T00:00:00');
      const monthStart = calStartOfMonth(from);
      const monthEnd = calEndOfMonth(from);
      const gridStart = new Date(start); gridStart.setDate(gridStart.getDate() - start.getDay());
      const cells = [];
      for (let i = 0; i < 42; i++) { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); cells.push(calYmd(d)); }
      const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const density = ctx.filters.density || 'comfortable';
      let h = '<div class="cal-grid-wrap cal-density-' + R.attr(density) + '" id="cal-main">';
      h += '<div class="calendar-grid cal-grid-interactive">';
      h += '<div class="calendar-grid-head">' + weekdayNames.map((d) => '<div class="calendar-grid-weekday">' + d + '</div>').join('') + '</div>';
      for (let w = 0; w < 6; w++) {
        h += '<div class="calendar-grid-row">';
        for (let c = 0; c < 7; c++) {
          const day = cells[w * 7 + c];
          const inMonth = day >= monthStart && day <= monthEnd;
          const list = (byDay[day] || []).slice().sort((a,b) => String(a.starts_at).localeCompare(String(b.starts_at)));
          const isToday = day === today;
          h += '<div class="calendar-grid-cell cal-drop-target' + (inMonth ? '' : ' is-outside') + (isToday ? ' is-today' : '') + '" data-day="' + R.attr(day) + '" ' +
            '@click="if (!$event.target.closest(\'.cal-event\')) openNamedModal(\'calNewAt\',\'' + R.attr(day) + '\')" ' +
            'ondragover="window.Reel&&window.Reel._calDragOver&&window.Reel._calDragOver(event)" ' +
            'ondrop="window.Reel&&window.Reel._calDrop&&window.Reel._calDrop(event,\'' + R.attr(day) + '\')">';
          h += '<div class="calendar-grid-day-row"><button type="button" class="calendar-grid-day-btn" @click.stop="openNamedModal(\'calFocusDay\',\'' + R.attr(day) + '\')" title="Focus this day">' + R.number(new Date(day+'T00:00:00').getDate()) + '</button>' +
            '<button type="button" class="btn btn-xs btn-ghost cal-cell-add" @click.stop="openNamedModal(\'calNewAt\',\'' + R.attr(day) + '\')" title="Schedule">+</button></div>';
          const show = density === 'compact' ? 3 : 4;
          list.slice(0, show).forEach((e) => { h += this.renderEventChip(ctx, e, { conflicts, compact: density === 'compact' }); });
          if (list.length > show) h += '<button type="button" class="cal-more" @click.stop="openNamedModal(\'calFocusDay\',\'' + R.attr(day) + '\')">+' + R.number(list.length - show) + ' more</button>';
          h += '</div>';
        }
        h += '</div>';
      }
      h += '</div></div>';
      return h;
    },

    renderWeek(ctx, page, rows, from, to, today, conflicts) {
      const weekStart = calStartOfWeek(from);
      const days = Array.from({ length: 7 }, (_, i) => calAddDays(weekStart, i));
      const byDay = {};
      rows.forEach((e) => { const d = String(e.starts_at || '').slice(0, 10); (byDay[d] = byDay[d] || []).push(e); });
      const hourStart = 7, hourEnd = 18;
      const hours = [];
      for (let h = hourStart; h <= hourEnd; h++) hours.push(h);
      const density = ctx.filters.density || 'comfortable';
      let h = '<div class="cal-week-wrap cal-density-' + R.attr(density) + '" id="cal-main">';
      h += '<div class="cal-week-grid" style="--cal-hours:' + hours.length + '">';
      h += '<div class="cal-week-corner"></div>';
      days.forEach((day) => {
        const isToday = day === today;
        h += '<div class="cal-week-head' + (isToday ? ' is-today' : '') + '" @click="openNamedModal(\'calFocusDay\',\'' + R.attr(day) + '\')">' +
          '<div class="strong">' + R.esc(new Date(day+'T00:00:00').toLocaleDateString('en-ZA',{weekday:'short'})) + '</div>' +
          '<div class="muted small">' + R.esc(new Date(day+'T00:00:00').toLocaleDateString('en-ZA',{day:'numeric',month:'short'})) + '</div></div>';
      });
      hours.forEach((hour) => {
        h += '<div class="cal-week-hour">' + calPad(hour) + ':00</div>';
        days.forEach((day) => {
          const slotStart = hour * 60;
          const slotEnd = slotStart + 60;
          const slotEvents = (byDay[day] || []).filter((e) => {
            const m = calEventMinutes(e.starts_at);
            return m >= slotStart && m < slotEnd;
          }).sort((a,b) => String(a.starts_at).localeCompare(String(b.starts_at)));
          const calSlot = day + 'T' + calPad(hour) + ':00';
          h += '<div class="cal-week-cell cal-drop-target" data-day="' + R.attr(day) + '" data-hour="' + hour + '" ' +
            '@click="if (!$event.target.closest(\'.cal-event\')) openNamedModal(\'calNewAt\',\'' + R.attr(calSlot) + '\')" ' +
            'ondragover="window.Reel&&window.Reel._calDragOver&&window.Reel._calDragOver(event)" ' +
            'ondrop="window.Reel&&window.Reel._calDrop&&window.Reel._calDrop(event,\'' + R.attr(day) + '\',' + hour + ')">';
          slotEvents.forEach((e) => { h += this.renderEventChip(ctx, e, { conflicts, compact: true }); });
          h += '</div>';
        });
      });
      h += '</div></div>';
      // now indicator for current week
      if (days.indexOf(today) !== -1) {
        h += '<div class="muted small" style="margin-top:8px"><span class="badge badge-sun">Now</span> Current day highlighted in the week grid.</div>';
      }
      return h;
    },

    renderDay(ctx, page, rows, from, to, today, conflicts) {
      const day = (from === to ? from : (ctx.filters.focusDay || from || today));
      const list = rows.filter((e) => String(e.starts_at || '').slice(0, 10) === day).sort((a,b) => String(a.starts_at).localeCompare(String(b.starts_at)));
      const hourStart = 7, hourEnd = 18;
      const hours = []; for (let h = hourStart; h <= hourEnd; h++) hours.push(h);
      let h = '<div class="cal-dayview" id="cal-main">';
      h += '<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0">' + R.date(day + 'T00:00:00') + (day === today ? ' <span class="badge badge-sun">Today</span>' : '') + '</h3>' +
        '<div class="btn-group"><button class="btn btn-sm btn-secondary" @click="openNamedModal(\'calNewAt\',\'' + R.attr(day) + '\')">' + R.icon('plus') + ' Schedule activity</button></div></div>';
      h += '<div class="cal-day-grid">';
      hours.forEach((hour) => {
        const slotStart = day + 'T' + calPad(hour) + ':00';
        const slotEvents = list.filter((e) => { const m = calEventMinutes(e.starts_at); return m >= hour*60 && m < hour*60+60; });
        h += '<div class="cal-day-row"><div class="cal-day-hour">' + calPad(hour) + ':00</div><div class="cal-day-slot cal-drop-target" data-day="' + R.attr(day) + '" data-hour="' + hour + '" ' +
          '@click="if (!$event.target.closest(\'.cal-event\')) openNamedModal(\'calNewAt\',\'' + R.attr(slotStart) + '\')" ' +
          'ondragover="window.Reel&&window.Reel._calDragOver&&window.Reel._calDragOver(event)" ' +
          'ondrop="window.Reel&&window.Reel._calDrop&&window.Reel._calDrop(event,\'' + R.attr(day) + '\',' + hour + ')">';
        if (!slotEvents.length) h += '<div class="cal-slot-empty muted small">Click to schedule</div>';
        slotEvents.forEach((e) => {
          h += '<div class="cal-day-block ' + calStatusClass(e.status) + (this.isNow(e) ? ' is-now' : '') + (conflicts[e.id] ? ' has-conflict' : '') + '" role="button" tabindex="0" @click="openNamedModal(\'calEvent\',\'' + R.attr(e.id) + '\')" @keydown.enter.prevent="openNamedModal(\'calEvent\',\'' + R.attr(e.id) + '\')">' +
            '<div class="row" style="justify-content:space-between;gap:8px"><div class="strong">' + R.esc(R.time(e.starts_at)) + (e.ends_at ? '–' + R.esc(R.time(e.ends_at)) : '') + ' · ' + R.esc(e.title) + '</div>' + R.badge(e.status) + '</div>' +
            '<div class="muted small">' + R.esc(e.classroom_name || 'Whole centre') + (e.staff_name ? ' · ' + R.esc(e.staff_name) : '') + '</div></div>';
        });
        h += '</div></div>';
      });
      h += '</div></div>';
      return h;
    },

    renderDrawer(ctx, page, ui, conflicts) {
      const e = ui.drawerEvent || (page.rows || []).find((r) => r.id === ui.drawerEventId);
      if (!e) return '';
      const plan = (page.plans || []).find((p) => p.id === e.lesson_plan_id) || null;
      const activity = (page.activities || []).find((a) => a.id === e.activity_id) || null;
      const moduleId = e.lesson_plan_module_id || (plan && plan.module_id) || null;
      const moduleTitle = e.module_title || (plan && plan.module_title) || null;
      const canEdit = ctx.has('curriculum.create.daycare');
      const conflict = conflicts[e.id];
      const now = this.isNow(e);
      let h = '<div class="cal-drawer-backdrop" @click.self="openNamedModal(\'calCloseDrawer\')">';
      h += '<aside class="cal-drawer" role="dialog" aria-label="Event details">';
      h += '<div class="cal-drawer-head"><div><div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">' + R.badge(e.status) + (now ? '<span class="badge badge-sun">Happening now</span>' : '') + (conflict ? '<span class="badge badge-danger">Overlap</span>' : '') + '</div><h3 style="margin:6px 0 0">' + R.esc(e.title || 'Activity') + '</h3><div class="muted small">' + R.esc(R.date(e.starts_at)) + ' · ' + R.esc(R.time(e.starts_at)) + (e.ends_at ? '–' + R.esc(R.time(e.ends_at)) : '') + '</div></div>';
      h += '<button class="btn btn-ghost btn-sm" @click="openNamedModal(\'calCloseDrawer\')" aria-label="Close">' + R.icon('x') + '</button></div>';
      h += '<div class="cal-drawer-body">';
      h += '<div class="cal-detail-grid">';
      h += R.detailItem('Classroom', R.esc(e.classroom_name || 'Whole centre'));
      h += R.detailItem('Lead staff', R.esc(e.staff_name || '—'));
      h += R.detailItem('Lesson plan', e.lesson_plan_title ? R.esc(e.lesson_plan_title) : '—');
      h += R.detailItem('Activity', e.activity_title ? R.esc(e.activity_title) : '—');
      h += R.detailItem('Module', moduleTitle ? R.esc(moduleTitle) : '—');
      h += R.detailItem('Participation', R.number(e.participation_count || (e.participation ? e.participation.length : 0)) + ' recorded' + (e.participated_count ? ' · ' + R.number(e.participated_count) + ' participated' : ''));
      h += '</div>';
      if (e.notes) h += '<div class="cal-drawer-section"><h4>Notes</h4><p class="muted small">' + R.esc(e.notes) + '</p></div>';

      if (e.lesson_plan_id || moduleId) {
        h += '<div class="cal-drawer-section"><h4>Teaching & context</h4><div class="stack">';
        if (e.lesson_plan_id) h += '<button class="btn btn-secondary" @click="openGuide(\'' + R.attr(e.lesson_plan_id) + '\')">' + R.icon('book-open') + ' Teach / Guide</button>';
        if (e.lesson_plan_id) h += '<a class="btn btn-ghost" href="#/app/curriculum?tab=plans">Open lesson plan</a>';
        if (moduleId) h += '<a class="btn btn-ghost" href="#/app/modules/' + R.attr(moduleId) + '">Open module' + (moduleTitle ? ': ' + R.esc(moduleTitle) : '') + '</a>';
        if (moduleId) h += '<button class="btn btn-ghost" @click="downloadExport(\'/learning-modules/' + R.attr(moduleId) + '/teacher-guide\')">' + R.icon('file-down') + ' Teacher guide (PDF)</button>';
        if (e.activity_id) h += '<a class="btn btn-ghost" href="#/app/activities">Open activity library</a>';
        h += '</div></div>';
      }

      const theme = e.lesson_plan_theme || (plan && plan.theme);
      const materials = e.activity_materials || (activity && activity.materials);
      const safety = e.activity_safety_notes || (activity && activity.safety_notes);
      const desc = e.activity_description || (activity && activity.description);
      if (theme || materials || safety || desc || (activity && activity.duration_minutes)) {
        h += '<div class="cal-drawer-section"><h4>Prep at a glance</h4><div class="stack small">';
        if (theme) h += '<div><strong>Theme:</strong> ' + R.esc(theme) + '</div>';
        if (activity && activity.duration_minutes) h += '<div><strong>Duration:</strong> ' + R.number(activity.duration_minutes) + ' min</div>';
        if (desc) h += '<div><strong>Description:</strong> ' + R.esc(R.truncate(desc, 180)) + '</div>';
        if (materials) h += '<div><strong>Materials:</strong> ' + R.esc(materials) + '</div>';
        if (safety) h += '<div class="alert alert-warn" style="margin:6px 0 0">' + R.icon('shield-alert') + '<span>' + R.esc(safety) + '</span></div>';
        h += '</div></div>';
      }

      if (e.participation && e.participation.length) {
        h += '<div class="cal-drawer-section"><h4>Participation snapshot</h4><div class="stack">';
        e.participation.slice(0, 12).forEach((p) => {
          h += '<div class="row" style="justify-content:space-between;gap:8px"><span>' + R.esc((p.first_name || '') + ' ' + (p.last_name || '')) + '</span><span class="badge ' + R.statusTone(p.participation_status) + '">' + R.esc(R.titleCase(p.participation_status || 'participated')) + '</span></div>';
        });
        if (e.participation.length > 12) h += '<div class="muted small">+' + R.number(e.participation.length - 12) + ' more</div>';
        h += '</div></div>';
      } else if (e.status === 'completed') {
        h += '<div class="cal-drawer-section"><h4>Participation</h4><p class="muted small">No participation records captured for this event.</p></div>';
      }

      h += '</div>';
      h += '<div class="cal-drawer-foot">';
      h += '<div class="btn-group" style="flex-wrap:wrap">';
      if (e.status === 'scheduled' && canEdit) h += '<button class="btn btn-primary" @click="openNamedModal(\'calStart\',\'' + R.attr(e.id) + '\')">' + R.icon('play') + ' Start</button>';
      if ((e.status === 'scheduled' || e.status === 'in_progress') && canEdit) h += '<button class="btn btn-secondary" @click="openNamedModal(\'complete\',\'' + R.attr(e.id) + '\')">' + R.icon('check-circle') + ' Complete</button>';
      if ((e.status === 'scheduled' || e.status === 'in_progress') && canEdit) h += '<button class="btn btn-ghost" @click="openNamedModal(\'calCancel\',\'' + R.attr(e.id) + '\')">Cancel</button>';
      if (canEdit) h += '<button class="btn btn-secondary" @click="openNamedModal(\'calEdit\',\'' + R.attr(e.id) + '\')">' + R.icon('pencil') + ' Edit / Reschedule</button>';
      if (canEdit) h += '<button class="btn btn-ghost" @click="openNamedModal(\'calDuplicate\',\'' + R.attr(e.id) + '\')">' + R.icon('copy') + ' Duplicate</button>';
      if (canEdit) h += '<button class="btn btn-danger" @click="openNamedModal(\'calDelete\',\'' + R.attr(e.id) + '\')">' + R.icon('trash-2') + ' Delete</button>';
      h += '</div></div>';
      h += '</aside></div>';
      return h;
    },

    // ----- helpers used by openModal handlers -----

    setRange(ctx, from, to, preset) {
      if (to < from) to = from;
      ctx.filters.from = from; ctx.filters.to = to; ctx.filters.rangePreset = preset || 'custom';
      calSavePrefs({ from, to, rangePreset: ctx.filters.rangePreset, calendarView: ctx.filters.calendarView, density: ctx.filters.density });
      ctx.navigate(true);
    },

    openDrawer(ctx, eventId) {
      const ui = ctx.calendarUi = ctx.calendarUi || {};
      ui.drawerEventId = eventId;
      ui.drawerEvent = (ctx.page.rows || []).find((r) => r.id === eventId) || null;
      ctx.renderHtml(this.render(ctx, ctx.params, ctx.page));
      ctx.afterRender();
      // fetch full details incl participation
      R.api('GET', '/curriculum/calendar/events/' + encodeURIComponent(eventId)).then((p) => {
        const full = p.data || p;
        if (!ctx.calendarUi || ctx.calendarUi.drawerEventId !== eventId) return;
        ctx.calendarUi.drawerEvent = full;
        const idx = (ctx.page.rows || []).findIndex((r) => r.id === eventId);
        if (idx >= 0) ctx.page.rows[idx] = Object.assign({}, ctx.page.rows[idx], full);
        ctx.renderHtml(this.render(ctx, ctx.params, ctx.page));
        ctx.afterRender();
      }).catch(() => {});
    },

    closeDrawer(ctx) {
      if (!ctx.calendarUi) ctx.calendarUi = {};
      ctx.calendarUi.drawerEventId = null;
      ctx.calendarUi.drawerEvent = null;
      ctx.renderHtml(this.render(ctx, ctx.params, ctx.page));
      ctx.afterRender();
    },

    async optimisticAction(ctx, eventId, action, opts) {
      const options = opts || {};
      const rows = ctx.page.rows || [];
      const idx = rows.findIndex((r) => r.id === eventId);
      if (idx < 0) { await ctx.navigate(true); return; }
      const prev = Object.assign({}, rows[idx]);
      const nextStatus = action === 'start' ? 'in_progress' : action === 'cancel' ? 'cancelled' : action === 'complete' ? 'completed' : prev.status;
      rows[idx] = Object.assign({}, prev, { status: nextStatus, _busy: true });
      ctx.renderHtml(this.render(ctx, ctx.params, ctx.page)); ctx.afterRender();
      try {
        const res = await R.api('POST', '/curriculum/calendar/events/' + encodeURIComponent(eventId) + '/' + action, options.body || {});
        const data = res.data || res;
        rows[idx] = Object.assign({}, rows[idx], data, { _busy: false });
        if (options.successMessage) ctx.toast(options.successMessage);
        if (ctx.calendarUi && ctx.calendarUi.drawerEventId === eventId) ctx.calendarUi.drawerEvent = Object.assign({}, ctx.calendarUi.drawerEvent || {}, rows[idx]);
      } catch (err) {
        rows[idx] = prev;
        ctx.toast(err.message || 'The action failed.', 'error');
      }
      ctx.renderHtml(this.render(ctx, ctx.params, ctx.page)); ctx.afterRender();
    },

    async updateEvent(ctx, eventId, patch, opts) {
      const options = opts || {};
      try {
        const res = await R.api('PATCH', '/curriculum/calendar/events/' + encodeURIComponent(eventId), patch);
        const data = res.data || res;
        const rows = ctx.page.rows || [];
        const idx = rows.findIndex((r) => r.id === eventId);
        if (idx >= 0) rows[idx] = Object.assign({}, rows[idx], data);
        if (ctx.calendarUi && ctx.calendarUi.drawerEventId === eventId) ctx.calendarUi.drawerEvent = Object.assign({}, ctx.calendarUi.drawerEvent || {}, data);
        if (options.successMessage) ctx.toast(options.successMessage);
        if (options.closeDrawer) { ctx.calendarUi.drawerEventId = null; ctx.calendarUi.drawerEvent = null; }
        if (options.reload !== false) await ctx.navigate(true); else { ctx.renderHtml(this.render(ctx, ctx.params, ctx.page)); ctx.afterRender(); }
      } catch (err) {
        ctx.toast(err.message || 'Could not update the event.', 'error');
        if (options.reloadOnError) await ctx.navigate(true);
        throw err;
      }
    },

    eventFormFields(ctx, page, values) {
      const v = values || {};
      return [
        { name: 'title', label: 'Title', required: true, span: 2, value: v.title || '' },
        { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx), value: v.branch_id || v.branchId || '' },
        { name: 'classroomId', label: 'Classroom', type: 'select', options: R.classroomOptions(page), value: v.classroom_id || v.classroomId || '' },
        { name: 'lessonPlanId', label: 'Lesson plan', type: 'select', options: (page.plans || []).map((p) => ({ value: p.id, label: p.title + (p.module_title ? ' · ' + p.module_title : '') })), value: v.lesson_plan_id || v.lessonPlanId || '' },
        { name: 'activityId', label: 'Activity', type: 'select', options: (page.activities || []).map((a) => ({ value: a.id, label: a.title + (a.duration_minutes ? ' (' + a.duration_minutes + ' min)' : '') })), value: v.activity_id || v.activityId || '' },
        { name: 'assignedStaffId', label: 'Lead staff', type: 'select', options: (page.staff || []).map((s) => ({ value: s.id, label: s.display_name || s.name || 'Staff' })), value: v.assigned_staff_id || v.assignedStaffId || '' },
        { name: 'startsAt', label: 'Starts at', type: 'datetime-local', required: true, value: v.startsAt || calToLocalInput(v.starts_at) || '' },
        { name: 'endsAt', label: 'Ends at', type: 'datetime-local', value: v.endsAt || calToLocalInput(v.ends_at) || '' },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2, value: v.notes || '' }
      ];
    },

    openModal(ctx, name, id) {
      const self = this;
      const page = ctx.page || {};

      if (name === 'event' || name === 'calNewAt') {
        let startVal = '';
        let endVal = '';
        if (name === 'calNewAt' && id) {
          if (id.indexOf('T') !== -1) { startVal = id.slice(0, 16); }
          else { startVal = calDefaultStartForDay(id); }
          endVal = calAddMinutesToInput(startVal, 30);
        }
        ctx.openModal({ title: 'Schedule activity', endpoint: '/curriculum/calendar/events', submitLabel: 'Add to calendar', size: 'wide',
          description: 'Plan a block on the calendar. Link a lesson plan or activity to bring materials, objectives and guides into the day.',
          fields: self.eventFormFields(ctx, page, { startsAt: startVal, endsAt: endVal }).concat([
            { name: 'recurrence', label: 'Repeat', type: 'select', options: [{ value: 'none', label: 'Does not repeat' }, { value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Every week' }, { value: 'biweekly', label: 'Every 2 weeks' }, { value: 'monthly', label: 'Every month' }], value: 'none', help: 'Repeats are created in advance, up to 26 occurrences.' },
            { name: 'repeatUntil', label: 'Repeats until', type: 'date', help: 'Required when a repeat is chosen. Occurrences after this date are not created.' }
          ]),
          onSuccess: async () => { await ctx.navigate(true); }
        });
        return;
      }

      if (name === 'calEvent' && id) { this.openDrawer(ctx, id); return; }
      if (name === 'calCloseDrawer') { this.closeDrawer(ctx); return; }

      if (name === 'calPreset' && id) {
        const today = R.today();
        if (id === 'today') this.setRange(ctx, today, today, 'today');
        else if (id === 'week') this.setRange(ctx, calStartOfWeek(today), calEndOfWeek(today), 'week');
        else if (id === 'nextweek') { const s = calStartOfWeek(calAddDays(today, 7)); this.setRange(ctx, s, calEndOfWeek(s), 'nextweek'); }
        else if (id === 'month') this.setRange(ctx, calStartOfMonth(today), calEndOfMonth(today), 'month');
        return;
      }

      if (name === 'calStep' && id) {
        const from = page.from || ctx.filters.from || R.today();
        const to = page.to || ctx.filters.to || R.today();
        const preset = ctx.filters.rangePreset || 'custom';
        let nf = from, nt = to;
        const dir = id === 'next' ? 1 : -1;
        if (preset === 'today' || from === to) { nf = calAddDays(from, dir); nt = nf; }
        else if (preset === 'week' || preset === 'nextweek') { nf = calAddDays(from, dir * 7); nt = calAddDays(to, dir * 7); }
        else if (preset === 'month') {
          const d = new Date(from + 'T00:00:00'); d.setMonth(d.getMonth() + dir); nf = calStartOfMonth(calYmd(d)); nt = calEndOfMonth(calYmd(d));
        } else {
          const span = Math.max(1, calDiffDays(from, to) + 1); nf = calAddDays(from, dir * span); nt = calAddDays(to, dir * span);
        }
        this.setRange(ctx, nf, nt, preset === 'next2weeks' ? 'custom' : preset);
        return;
      }

      if (name === 'calSetRange' && id) {
        const parts = String(id).split('|');
        const from = parts[0] || page.from;
        const to = parts[1] || page.to;
        this.setRange(ctx, from, to, 'custom');
        return;
      }

      if (name === 'calFilter' && id) {
        const idx = String(id).indexOf('|');
        const key = String(id).slice(0, idx);
        const val = String(id).slice(idx + 1);
        ctx.filters[key] = val;
        ctx.renderHtml(this.render(ctx, ctx.params, ctx.page)); ctx.afterRender();
        return;
      }

      if (name === 'calClearFilters') {
        ctx.filters.classroomId = ''; ctx.filters.staffId = ''; ctx.filters.status = ''; ctx.filters.moduleId = '';
        ctx.renderHtml(this.render(ctx, ctx.params, ctx.page)); ctx.afterRender();
        return;
      }

      if (name === 'calDensity' && id) {
        ctx.filters.density = id;
        calSavePrefs({ density: id });
        ctx.renderHtml(this.render(ctx, ctx.params, ctx.page)); ctx.afterRender();
        return;
      }

      if (name === 'calMiniMonth' && id) {
        const ui = ctx.calendarUi = ctx.calendarUi || {};
        const cur = (ui.miniMonth || (page.from || R.today()).slice(0,7)) + '-01';
        const d = new Date(cur + 'T00:00:00'); d.setMonth(d.getMonth() + Number(id));
        ui.miniMonth = calYmd(d).slice(0,7);
        ctx.renderHtml(this.render(ctx, ctx.params, ctx.page)); ctx.afterRender();
        return;
      }

      if (name === 'calFocusDay' && id) {
        const view = ctx.filters.calendarView || 'agenda';
        // Mini-month and grid day cells both focus that day; the month grid
        // lands on the agenda entries, other views keep their shape.
        if (view === 'grid') ctx.filters.calendarView = 'agenda';
        ctx.filters.from = id; ctx.filters.to = id; ctx.filters.rangePreset = 'custom';
        calSavePrefs({ from: id, to: id, calendarView: ctx.filters.calendarView, rangePreset: 'custom' });
        ctx.navigate(true);
        return;
      }

      if (name === 'calToggleDay' && id) {
        const ui = ctx.calendarUi = ctx.calendarUi || {}; ui.collapsedDays = ui.collapsedDays || {};
        ui.collapsedDays[id] = !ui.collapsedDays[id];
        ctx.renderHtml(this.render(ctx, ctx.params, ctx.page)); ctx.afterRender();
        return;
      }

      if (name === 'calStart' && id) { this.optimisticAction(ctx, id, 'start', { successMessage: 'Activity started.' }); return; }
      if (name === 'calCancel' && id) {
        ctx.openConfirm('Cancel this activity?', 'The event will be marked as cancelled. You can delete it if it was added by mistake.', {
          submitLabel: 'Cancel activity', danger: false,
          endpoint: '/curriculum/calendar/events/' + id + '/cancel', method: 'POST', body: {},
          successMessage: 'Activity cancelled.'
        });
        return;
      }

      if (name === 'calEdit' && id) {
        const ev = (page.rows || []).find((e) => e.id === id) || (ctx.calendarUi && ctx.calendarUi.drawerEvent) || {};
        ctx.openModal({ title: 'Edit / reschedule activity', endpoint: '/curriculum/calendar/events/' + id, method: 'PATCH', submitLabel: 'Save changes', size: 'wide',
          fields: self.eventFormFields(ctx, page, ev),
          transform: (data) => {
            const out = Object.assign({}, data);
            ['classroomId','lessonPlanId','activityId','assignedStaffId','notes','endsAt'].forEach((k) => { if (out[k] === '') out[k] = null; });
            return out;
          },
          onSuccess: async (data) => { revealCalendarEvent(ctx, data); await ctx.navigate(true); }
        });
        return;
      }

      if (name === 'calDuplicate' && id) {
        const ev = (page.rows || []).find((e) => e.id === id) || {};
        const start = ev.starts_at ? calToLocalInput(new Date(new Date(ev.starts_at).getTime() + 86400000).toISOString()) : '';
        const duration = ev.ends_at && ev.starts_at ? (new Date(ev.ends_at) - new Date(ev.starts_at)) : 1800000;
        const end = start ? calAddMinutesToInput(start, Math.round(duration/60000)) : '';
        ctx.openModal({ title: 'Duplicate activity', endpoint: '/curriculum/calendar/events/' + id + '/duplicate', method: 'POST', submitLabel: 'Create copy', size: 'wide',
          successMessage: 'Activity duplicated — opening the copy.',
          fields: [
            { name: 'title', label: 'Title', required: true, span: 2, value: (ev.title || 'Activity') + ' (copy)' },
            { name: 'startsAt', label: 'Starts at', type: 'datetime-local', required: true, value: start },
            { name: 'endsAt', label: 'Ends at', type: 'datetime-local', value: end }
          ],
          onSuccess: async (data) => {
            revealCalendarEvent(ctx, data);
            await ctx.navigate(true);
          }
        });
        return;
      }

      if (name === 'calDelete' && id) {
        ctx.openConfirm('Delete this activity?', 'This permanently removes the scheduled activity and its participation records. This cannot be undone.', {
          submitLabel: 'Delete activity', danger: true,
          endpoint: '/curriculum/calendar/events/' + id, method: 'DELETE', body: null,
          successMessage: 'Activity deleted.'
        });
        return;
      }

      if (name === 'complete' && id) {
        const event = (page.rows || []).find((e) => e.id === id) || {};
        const learners = (page.learners || []).filter((l) => !event.classroom_id || l.classroom_id === event.classroom_id);
        const learnerRows = learners.map((l) => ({ learnerId: l.id, status: 'participated', summary: '' }));
        ctx.openModal({ title: 'Complete activity', endpoint: '/curriculum/calendar/events/' + id + '/complete', method: 'POST', submitLabel: 'Mark complete', size: 'wide',
          description: 'Tick who participated. You can add a note for each child.',
          fields: [
            { name: 'notes', label: 'Overall notes', type: 'textarea', span: 2 },
            { name: 'participation', label: 'Participation', type: 'repeater', itemLabel: 'Child', span: 2,
              columns: [
                { key: 'learnerId', label: 'Child', type: 'select', options: learners.map((l) => ({ value: l.id, label: l.first_name + ' ' + l.last_name })) },
                { key: 'status', label: 'Status', type: 'select', options: [
                  { value: 'participated', label: 'Participated' },
                  { value: 'partial', label: 'Partial' },
                  { value: 'absent', label: 'Absent' },
                  { value: 'not_observed', label: 'Not observed' }
                ] },
                { key: 'summary', label: 'Notes', type: 'textarea', span: 2 }
              ],
              value: learnerRows }
          ],
          onSuccess: async () => { if (ctx.calendarUi) { ctx.calendarUi.drawerEventId = null; } await ctx.navigate(true); }
        });
        return;
      }

      // fall-through to legacy 'event'/'complete' names handled above
      if (name === 'event') { /* handled */ }
    }
  };

  // Drag-and-drop handlers (global, used by inline attributes)
  window.Reel = window.Reel || {};
  window.Reel._calDragState = null;
  window.Reel._calDragStart = function (ev, id) {
    try { ev.dataTransfer.setData('text/plain', id); ev.dataTransfer.effectAllowed = 'move'; } catch (_) {}
    window.Reel._calDragState = { id };
    const t = ev.target && ev.target.closest ? ev.target.closest('.cal-event') : null;
    if (t) t.classList.add('is-dragging');
  };
  window.Reel._calDragEnd = function (ev) {
    window.Reel._calDragState = null;
    document.querySelectorAll('.cal-event.is-dragging,.cal-drop-target.is-over').forEach((el) => { el.classList.remove('is-dragging','is-over'); });
  };
  window.Reel._calDragOver = function (ev) { ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'move'; } catch (_) {} const c = ev.currentTarget; if (c) c.classList.add('is-over'); };
  window.Reel._calDrop = async function (ev, day, hour) {
    ev.preventDefault(); ev.stopPropagation();
    document.querySelectorAll('.cal-drop-target.is-over').forEach((el) => el.classList.remove('is-over'));
    let id = null; try { id = ev.dataTransfer.getData('text/plain'); } catch (_) {}
    if (!id && window.Reel._calDragState) id = window.Reel._calDragState.id;
    const app = window.ReelApp || (window.Alpine && document.querySelector('[x-data]') && window.Alpine.$data(document.querySelector('[x-data]')));
    if (!app || !id) return;
    const rows = (app.page && app.page.rows) || [];
    const e = rows.find((r) => r.id === id);
    if (!e) return;
    if (e.status === 'completed' || e.status === 'cancelled') { app.toast('Completed or cancelled events cannot be moved.', 'warn'); return; }
    const orig = new Date(e.starts_at);
    let start = new Date(day + 'T' + calPad(typeof hour === 'number' ? hour : orig.getHours()) + ':' + calPad(typeof hour === 'number' ? 0 : orig.getMinutes()) + ':00');
    if (Number.isNaN(start.getTime())) return;
    const dur = e.ends_at ? (new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) : 30 * 60000;
    const end = new Date(start.getTime() + Math.max(15*60000, dur));
    const prev = Object.assign({}, e);
    e.starts_at = start.toISOString();
    e.ends_at = end.toISOString();
    try { if (window.Reel.views.calendar && app.route && app.route.view === 'calendar') { app.renderHtml(window.Reel.views.calendar.render(app, app.params, app.page)); app.afterRender(); } } catch (_) {}
    try {
      await R.api('PATCH', '/curriculum/calendar/events/' + encodeURIComponent(id), { startsAt: e.starts_at, endsAt: e.ends_at });
      app.toast('Event rescheduled to ' + R.date(e.starts_at) + ' ' + R.time(e.starts_at) + '.');
    } catch (err) {
      e.starts_at = prev.starts_at; e.ends_at = prev.ends_at;
      app.toast(err.message || 'Could not reschedule the event.', 'error');
      try { if (window.Reel.views.calendar) { app.renderHtml(window.Reel.views.calendar.render(app, app.params, app.page)); app.afterRender(); } } catch (_) {}
    }
  };


})();
