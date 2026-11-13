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
        R.exportButtons('/exports/lesson-plans')) +
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
        (tab === 'plans' ? this.renderPlans(ctx, page) : tab === 'frameworks' ? this.renderFrameworks(ctx, page) : tab === 'objectives' ? this.renderObjectives(page) : this.renderPeriods(page));
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
      return (actions.length ? R.bulkBar(actions, { hint: 'Plans that cannot make the move are skipped and reported.' }) : '') +
        R.table({ rows: page.plans || [], selectable: actions.length > 0, columns: [
        { label: 'Plan', render: (p) => '<span class="cell-strong">' + R.esc(p.title) + '</span><span class="cell-sub">' + R.esc(p.theme || '') + (p.source === 'ncf' ? ' · ' : '') + '</span>' },
        { label: 'Classroom', render: (p) => (p.source === 'ncf' ? NCF : '') + ' ' + R.esc(p.classroom_name || (isOfficialRow(p) ? 'Official' : '—')) },
        { label: 'Module', render: (p) => p.module_id ? '<a href="#/app/modules/' + R.attr(p.module_id) + '">' + R.esc(p.module_title || 'Module') + '</a>' : '<span class="muted">—</span>' },
        { label: 'Objectives', render: (p) => '<span class="badge badge-muted">' + ((p.objective_ids || []).length) + '</span>' },
        { label: 'Status', render: (p) => R.badge(p.status) },
        { label: 'Created', render: (p) => R.date(p.created_at) },
        { label: '', align: 'right', render: (p) => '<div class="btn-group">' +
          (isOfficialRow(p)
            ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/curriculum/adopt\',{kind:\'lesson_plan\',id:\'' + R.attr(p.id) + '\'},{successMessage:\'Adopted to your workspace as a draft plan\'})">' + R.icon('copy') + ' Adapt</button>' +
              '<button class="btn btn-sm btn-secondary" @click="openNamedDetail(\'plan\',\'' + R.attr(p.id) + '\')">View</button>'
            : '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'duplicatePlan\',\'' + R.attr(p.id) + '\')">Duplicate</button>' +
              (ctx.has('curriculum.create.daycare') ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'savePlanTemplate\',\'' + R.attr(p.id) + '\')">Save template</button>' : '') +
              '<button class="btn btn-sm btn-secondary" @click="openNamedDetail(\'plan\',\'' + R.attr(p.id) + '\')">View</button>' +
              ((NEXT_STATUS[p.status] || []).length ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'transition\',\'' + R.attr(p.id) + '\')">Move on</button>' : '')) +
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
      const body =
        '<div class="muted small" style="margin-bottom:10px">Version ' + R.esc(f.version) + ' · ' + R.esc(f.description || '') + '</div>' +
        (isOfficialRow(f) ? '<div class="row" style="gap:8px;margin-bottom:10px">' + NCF_OFFICIAL + '</div>' : '') +
        '<div class="stack">' + domains + '</div>';
      const actions = isOfficialRow(f)
        ? '<div class="btn-group"><span class="badge badge-muted">Read-only starter pack</span></div>'
        : '<div class="btn-group">' +
            (ctx.has('curriculum.create.daycare') ? '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'saveFrameworkTemplate\',\'' + R.attr(f.id) + '\')">Save template</button>' : '') +
            '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'domain\',\'' + R.attr(f.id) + '\')">' + R.icon('plus') + ' Domain</button>' +
          '</div>';
      return R.card(f.name, body, actions);
    },

    renderObjectives(page) {
      return R.table({ rows: page.objectives || [], columns: [
        { label: 'Code', render: (o) => '<span class="mono cell-strong">' + R.esc(o.code) + '</span>' },
        { label: 'Domain', render: (o) => R.esc(o.domain_name) },
        { label: 'Objective', render: (o) => R.esc(o.description) + '<span class="cell-sub">' + R.esc(o.expected_observation_context || '') + '</span>' },
        { label: 'Age group', render: (o) => '<span class="badge badge-muted">' + R.esc(o.age_group || 'All ages') + '</span>' },
        { label: 'Status', render: (o) => R.badge(o.status) }
      ], emptyTitle: 'No objectives', emptyMessage: 'Objectives describe what children are learning to do.' },
        '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'objective\')">' + R.icon('plus') + ' Add objective</button>');
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
        const domains = frameworks.flatMap((f) => f.domains || []);
        ctx.openModal({ title: 'Add learning objective', endpoint: '/curriculum/objectives', submitLabel: 'Add objective', fields: [
          { name: 'domainId', label: 'Domain', type: 'select', required: true, options: domains.map((d) => ({ value: d.id, label: d.name })) },
          { name: 'code', label: 'Code', required: true, placeholder: 'e.g. PD-02' },
          { name: 'ageGroup', label: 'Age group', placeholder: '4-5 years' },
          { name: 'description', label: 'Description', required: true, span: 2 },
          { name: 'expectedObservationContext', label: 'Where to observe it', span: 2 }
        ] });
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
        ctx.openModal({ title: 'Move lesson plan', endpoint: '/curriculum/lesson-plans/' + id + '/transition', submitLabel: 'Update status', fields: [
          { name: 'status', label: 'New status', type: 'select', required: true, options: NEXT_STATUS[plan.status] || [] },
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
      return R.pageHead('Activities', 'The experiences that fill the day — from sensory play to early literacy.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'activity\')">' + R.icon('plus') + ' New activity</button>') +
        '<div class="grid grid-3">' + (page.rows || []).map((a) => R.card(a.title,
          '<div class="row" style="margin-bottom:8px"><span class="badge badge-sun">' + R.esc(a.age_group || 'All ages') + '</span><span class="badge badge-muted">' + R.esc(R.titleCase(a.activity_type || 'activity')) + '</span><span class="badge badge-sky">' + R.number(a.duration_minutes) + ' min</span></div>' +
          '<p class="muted small">' + R.esc(a.description || '') + '</p>' +
          '<div class="muted small"><strong>Materials:</strong> ' + R.esc(a.materials || '—') + '</div>' +
          (a.safety_notes ? '<div class="alert alert-warn" style="margin-top:8px">' + R.icon('shield-alert') + '<span>' + R.esc(a.safety_notes) + '</span></div>' : ''),
          '<div class="btn-group">' + R.badge(a.status) +
            (isOfficialRow(a)
              ? ' ' + NCF +
                '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/curriculum/adopt\',{kind:\'activity\',id:\'' + R.attr(a.id) + '\'},{successMessage:\'Adopted to your workspace\'})">' + R.icon('copy') + ' Adapt</button>'
              : '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'saveActivityTemplate\',\'' + R.attr(a.id) + '\')">Save template</button>' +
                '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'activityEdit\',\'' + R.attr(a.id) + '\')">Edit</button>' +
                (a.status === 'active' ? '<button class="btn btn-sm btn-ghost" @click="act(\'POST\',\'/curriculum/activities/' + R.attr(a.id) + '/archive\',{},{successMessage:\'Activity archived\'})">Archive</button>' : '')) +
          '</div>')).join('') + '</div>' +
        ((page.rows || []).length ? '' : R.emptyState('No activities yet', 'Build a library of activities your team can reuse.', '<button class="btn btn-primary" @click="openNamedModal(\'activity\')">New activity</button>', 'puzzle'));
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

  V.calendar = {
    async load(ctx) {
      const from = ctx.filters.from || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      const to = ctx.filters.to || new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
      const [events, activities, plans, classrooms, staff, learners] = await Promise.all([
        R.api('GET', '/curriculum/calendar?from=' + from + '&to=' + to),
        R.api('GET', '/curriculum/activities').catch(() => ({ data: [] })),
        R.api('GET', '/curriculum/lesson-plans').catch(() => ({ data: [] })),
        R.api('GET', '/classrooms').catch(() => ({ data: [] })),
        ctx.has('staff.read.daycare') ? R.api('GET', '/staff').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        R.api('GET', '/learners?pageSize=100').catch(() => ({ data: [] }))
      ]);
      return { rows: events.data, from, to, activities: activities.data || [], plans: plans.data || [], classrooms: classrooms.data || [], staff: staff.data || [], learners: learners.data || [] };
    },
    render(ctx, params, page) {
      const events = page.rows || [];
      const view = ctx.filters.calendarView || 'agenda';
      const byDay = {};
      events.forEach((e) => {
        const day = String(e.starts_at || '').slice(0, 10);
        (byDay[day] = byDay[day] || []).push(e);
      });
      const days = Object.keys(byDay).sort();
      const toggle = '<div class="row" style="gap:8px;margin-bottom:12px">' +
        ['agenda', 'grid'].map((v) => '<button class="btn btn-sm ' + (view === v ? 'btn-primary' : 'btn-secondary') + '" @click="setFilter(\'calendarView\',\'' + v + '\')">' + R.titleCase(v) + '</button>').join('') + '</div>';
      if (view === 'grid') {
        const start = new Date(page.from + 'T00:00:00');
        const end = new Date(page.to + 'T00:00:00');
        const gridDays = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().slice(0, 10);
          gridDays.push({ date: new Date(d), key, events: (byDay[key] || []).slice().sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))) });
        }
        const weekday = start.getDay();
        const cells = Array.from({ length: weekday }, () => null).concat(gridDays);
        const weeks = [];
        for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
        const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return R.pageHead('Learning calendar', 'What is happening in each classroom, day by day.',
          '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'event\')">' + R.icon('calendar-plus') + ' Schedule activity</button>' +
          R.exportButtons('/exports/activity-participation')) +
          toggle +
          R.filterBar(
            '<label class="small muted">From</label><input class="input" type="date" value="' + R.attr(page.from) + '" @change="setFilter(\'from\',$event.target.value)">' +
            '<label class="small muted">To</label><input class="input" type="date" value="' + R.attr(page.to) + '" @change="setFilter(\'to\',$event.target.value)">'
          ) +
          '<div class="calendar-grid">' +
            '<div class="calendar-grid-head">' + weekdayNames.map((d) => '<div class="calendar-grid-weekday">' + d + '</div>').join('') + '</div>' +
            weeks.map((week) => '<div class="calendar-grid-row">' + week.map((cell) => {
              if (!cell) return '<div class="calendar-grid-cell is-empty"></div>';
              return '<div class="calendar-grid-cell"><div class="calendar-grid-day">' + R.number(cell.date.getDate()) + '</div>' +
                cell.events.map((e) => '<div class="calendar-grid-event"><strong>' + R.time(e.starts_at) + '</strong> ' + R.esc(e.title) + '</div>').join('') +
                '</div>';
            }).join('') + '</div>').join('') +
          '</div>';
      }
      return R.pageHead('Learning calendar', 'What is happening in each classroom, day by day.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'event\')">' + R.icon('calendar-plus') + ' Schedule activity</button>' +
          R.exportButtons('/exports/activity-participation')) +
        toggle +
        R.filterBar(
          '<label class="small muted">From</label><input class="input" type="date" value="' + R.attr(page.from) + '" @change="setFilter(\'from\',$event.target.value)">' +
          '<label class="small muted">To</label><input class="input" type="date" value="' + R.attr(page.to) + '" @change="setFilter(\'to\',$event.target.value)">'
        ) +
        (days.length ? days.map((day) => R.card(R.date(day + 'T00:00:00'),
          '<div class="stack">' + byDay[day].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))).map((e) =>
            '<div class="row" style="gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border-subtle)">' +
            '<div style="min-width:64px"><div class="strong">' + R.time(e.starts_at) + '</div><div class="muted small">' + R.time(e.ends_at) + '</div></div>' +
            '<div style="flex:1;min-width:0"><div class="strong">' + R.esc(e.title) + '</div>' +
            '<div class="muted small">' + R.esc(e.classroom_name || 'Whole centre') + (e.staff_name ? ' · ' + R.esc(e.staff_name) : '') + (e.lesson_plan_title ? ' · ' + R.esc(e.lesson_plan_title) : '') + '</div></div>' +
            R.badge(e.status) +
            (e.status === 'scheduled' ? '<button class="btn btn-sm btn-ghost" @click="act(\'POST\',\'/curriculum/calendar/events/' + R.attr(e.id) + '/start\',{},{successMessage:\'Activity started\'})">Start</button>' : '') +
            (e.status === 'scheduled' || e.status === 'in_progress' ? '<button class="btn btn-sm btn-ghost" @click="act(\'POST\',\'/curriculum/calendar/events/' + R.attr(e.id) + '/cancel\',{},{successMessage:\'Activity cancelled\'})">Cancel</button>' : '') +
            (e.status === 'scheduled' || e.status === 'in_progress' ? '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'complete\',\'' + R.attr(e.id) + '\')">Complete</button>' : '') +
            '</div>').join('') + '</div>', '', { className: 'section' })).join('') :
          R.emptyState('Nothing scheduled', 'Choose a date range or schedule an activity.', '<button class="btn btn-primary" @click="openNamedModal(\'event\')">Schedule activity</button>', 'calendar-days'));
    },
    openModal(ctx, name, id) {
      if (name === 'event') {
        const page = ctx.page || {};
        ctx.openModal({ title: 'Schedule activity', endpoint: '/curriculum/calendar/events', submitLabel: 'Add to calendar', size: 'wide', fields: [
        { name: 'title', label: 'Title', required: true, span: 2 },
        { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx) },
        { name: 'classroomId', label: 'Classroom', type: 'select', options: R.classroomOptions(page) },
        { name: 'lessonPlanId', label: 'Lesson plan', type: 'select', options: (page.plans || []).map((p) => ({ value: p.id, label: p.title })) },
        { name: 'activityId', label: 'Activity', type: 'select', options: (page.activities || []).map((a) => ({ value: a.id, label: a.title })) },
        { name: 'assignedStaffId', label: 'Lead staff', type: 'select', options: (page.staff || []).map((s) => ({ value: s.id, label: s.display_name })) },
        { name: 'startsAt', label: 'Starts at', type: 'datetime-local', required: true },
        { name: 'endsAt', label: 'Ends at', type: 'datetime-local', required: true },
        { name: 'recurrence', label: 'Repeat', type: 'select', options: [{ value: 'none', label: 'Does not repeat' }, { value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Every week' }, { value: 'biweekly', label: 'Every 2 weeks' }, { value: 'monthly', label: 'Every month' }], value: 'none', help: 'Repeats are created in advance, up to 26 occurrences.' },
        { name: 'repeatUntil', label: 'Repeats until', type: 'date', help: 'Required when a repeat is chosen. Occurrences after this date are not created.' },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
      ] });
      } else if (name === 'complete' && id) {
        const page = ctx.page || {};
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
          ] });
      }
    }
  };
})();
