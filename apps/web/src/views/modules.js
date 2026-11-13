'use strict';

/* Learning modules: theme-based, sequenced containers of lesson plans. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const NCF_OFFICIAL = '<span class="badge badge-sky">NCF Official</span>';
  const isOfficialRow = (row) => row && (row.organisation_id === null || row.organisation_id === undefined);

  const AGE_GROUPS = ['0-1 years', '1-2 years', '2-3 years', '3-4 years', '4-5 years', '5-6 years', 'Mixed ages'];

  const MODULE_FIELDS = [
    { name: 'title', label: 'Title', required: true, span: 2, placeholder: 'Outdoor Explorers' },
    { name: 'description', label: 'Description', type: 'textarea', span: 2, placeholder: 'What children will learn, and why this sequence matters…' },
    { name: 'theme', label: 'Theme', placeholder: 'The outdoors, colours, families…' },
    { name: 'ageGroup', label: 'Age group', type: 'select', options: AGE_GROUPS.map((group) => ({ value: group, label: group })) },
    { name: 'durationWeeks', label: 'Duration (weeks)', type: 'number', value: 4 }
  ];

  function planIds(plans) {
    return plans.map((plan) => plan.id);
  }

  function moveIds(ids, index, delta) {
    const target = index + delta;
    if (target < 0 || target >= ids.length) return null;
    const next = ids.slice();
    const current = next[index];
    next[index] = next[target];
    next[target] = current;
    return next;
  }

  V.modules = {
    async load() {
      const modules = await R.api('GET', '/learning-modules')
        .then((payload) => (Array.isArray(payload.data) ? payload.data : (payload.data && payload.data.data) || []))
        .catch(() => []);
      return { modules };
    },

    render(ctx, params, page) {
      const canCreate = ctx.has('curriculum.create.daycare');
      const modules = page.modules || [];
      const published = modules.filter((module) => module.status === 'published').length;
      const plans = modules.reduce((sum, module) => sum + Number(module.plan_count || 0), 0);
      const newButton = canCreate
        ? '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'module\')">' + R.icon('plus') + ' New module</button>'
        : '';
      return R.pageHead('Learning modules', 'Group lesson plans into a themed journey — everything the children will live, in the order they will live it.', newButton) +
        '<div class="grid grid-3 section">' +
        R.statCard({ label: 'Modules', value: R.number(modules.length), icon: 'blocks', foot: R.number(published) + ' published' }) +
        R.statCard({ label: 'Plans inside', value: R.number(plans), icon: 'notebook-pen', tone: 'sky', foot: 'Across all modules' }) +
        R.statCard({ label: 'Drafts', value: R.number(modules.length - published), icon: 'pencil', tone: 'sun', foot: 'Not yet published' }) +
        '</div>' +
        (modules.length
          ? '<div class="grid grid-2">' + modules.map((module) => {
            const href = '#/app/modules/' + R.attr(module.id);
            const official = isOfficialRow(module);
            const actions = official
              ? '<a class="btn btn-sm btn-secondary" href="' + href + '">Preview ' + R.icon('arrow-right') + '</a>' +
                '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/curriculum/adopt\',{kind:\'module\',id:\'' + R.attr(module.id) + '\'},{successMessage:\'Adopted to your workspace — the module and its plans are yours to edit\'})">' + R.icon('copy') + ' Adapt</button>' +
                '<button class="btn btn-sm btn-ghost" @click="downloadExport(\'/learning-modules/' + R.attr(module.id) + '/teacher-guide\')">' + R.icon('file-down') + ' Teacher guide</button>'
              : (canCreate ? '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'moduleEdit\',\'' + R.attr(module.id) + '\')">' + R.icon('pencil') + ' Edit</button>' : '') +
                '<a class="btn btn-sm btn-primary" href="' + href + '">Open module ' + R.icon('arrow-right') + '</a>';
            return R.card(module.title,
              '<div class="row" style="gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
                R.badge(module.status) +
                (isOfficialRow(module) ? NCF_OFFICIAL : '') +
                (module.age_group ? '<span class="badge badge-sun">' + R.esc(module.age_group) + '</span>' : '') +
                (module.theme ? '<span class="badge badge-muted">' + R.esc(module.theme) + '</span>' : '') +
              '</div>' +
              (module.description ? '<p class="muted small" style="margin-bottom:10px">' + R.esc(module.description) + '</p>' : '') +
              '<div class="kpi-list">' +
                '<div class="kpi-row"><span class="kpi-label">Duration</span><span class="kpi-value">' + (module.duration_weeks ? R.number(module.duration_weeks) + ' weeks' : 'Open-ended') + '</span></div>' +
                '<div class="kpi-row"><span class="kpi-label">Lesson plans</span><span class="kpi-value">' + R.number(module.plan_count) + '</span></div>' +
                '<div class="kpi-row"><span class="kpi-label">Created</span><span class="kpi-value">' + R.date(module.created_at) + '</span></div>' +
              '</div>',
              actions);
          }).join('') + '</div>'
          : R.emptyState('No modules yet', 'Create a module to sequence your lesson plans into a themed learning journey.', newButton, 'blocks'));
    },

    openModal(ctx, name, id) {
      if (name === 'module') {
        ctx.openModal({ title: 'New learning module', endpoint: '/learning-modules', submitLabel: 'Create module', fields: MODULE_FIELDS });
        return;
      }
      if (name === 'moduleEdit' && id) {
        const module = ((ctx.page || {}).modules || []).find((entry) => entry.id === id) || {};
        const source = { title: module.title, description: module.description, theme: module.theme, ageGroup: module.age_group, durationWeeks: module.duration_weeks };
        ctx.openModal({
          title: 'Edit module', endpoint: '/learning-modules/' + id, method: 'PATCH', submitLabel: 'Save module',
          fields: MODULE_FIELDS.map((field) => {
            const value = source[field.name];
            return Object.assign({}, field, { value: value === undefined || value === null ? '' : value });
          })
        });
      }
    }
  };

  V.moduleDetail = {
    async load(ctx, params) {
      const id = params.id;
      const [detail, allPlans, objectives, periods, classrooms, planTemplates] = await Promise.all([
        R.api('GET', '/learning-modules/' + encodeURIComponent(id)).then((payload) => payload.data),
        R.api('GET', '/curriculum/lesson-plans?pageSize=100').then((payload) => (Array.isArray(payload.data) ? payload.data : [])).catch(() => []),
        R.api('GET', '/curriculum/objectives').then((payload) => payload.data).catch(() => []),
        R.api('GET', '/curriculum/periods').then((payload) => payload.data).catch(() => []),
        R.api('GET', '/classrooms').then((payload) => payload.data).catch(() => []),
        R.api('GET', '/templates?kind=lesson_plan').then((payload) => (payload.data && payload.data.data) || []).catch(() => [])
      ]);
      if (!detail || !detail.module) {
        const error = new Error('That module could not be found.');
        error.code = 'NOT_FOUND';
        throw error;
      }
      return {
        module: detail.module,
        plans: detail.plans || [],
        allPlans,
        objectives: objectives || [],
        periods: periods || [],
        classrooms: classrooms || [],
        planTemplates
      };
    },

    render(ctx, params, page) {
      const module = page.module || {};
      const plans = page.plans || [];
      const canCreate = ctx.has('curriculum.create.daycare');
      const canPublish = ctx.has('curriculum.publish.daycare');
      const id = module.id;
      const publishAction = canPublish
        ? (module.status === 'published'
          ? '<button class="btn btn-secondary btn-sm" @click="act(\'PATCH\',\'/learning-modules/' + R.attr(id) + '\',{status:\'draft\'},{successMessage:\'Module moved back to draft\'})">' + R.icon('undo') + ' Unpublish</button>'
          : '<button class="btn btn-primary btn-sm" @click="act(\'PATCH\',\'/learning-modules/' + R.attr(id) + '\',{status:\'published\'},{successMessage:\'Module published\'})">' + R.icon('upload') + ' Publish</button>')
        : '';
      const official = isOfficialRow(module);
      const headActions = official
        ? '<a class="btn btn-ghost btn-sm" href="#/app/modules">' + R.icon('arrow-left') + ' All modules</a>' +
          '<button class="btn btn-secondary btn-sm" @click="downloadExport(\'/learning-modules/' + R.attr(id) + '/teacher-guide\')">' + R.icon('file-down') + ' Teacher guide (PDF)</button>' +
          '<button class="btn btn-primary btn-sm" @click="act(\'POST\',\'/curriculum/adopt\',{kind:\'module\',id:\'' + R.attr(id) + '\'},{successMessage:\'Adopted to your workspace — the module and its plans are yours to edit\'})">' + R.icon('copy') + ' Adapt to my centre</button>'
        : '<a class="btn btn-ghost btn-sm" href="#/app/modules">' + R.icon('arrow-left') + ' All modules</a>' +
          (canCreate ? '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'moduleEdit\')">' + R.icon('pencil') + ' Edit</button>' : '') +
          publishAction +
          (canCreate ? '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'plan\')">' + R.icon('plus') + ' New plan in module</button>' : '');
      return R.pageHead(module.title, module.description || 'A themed sequence of lesson plans.', headActions) +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Status', value: isOfficialRow(module) ? 'Official' : R.titleCase(module.status || 'draft'), icon: 'info', tone: module.status === 'published' ? 'green' : 'sun' }) +
        R.statCard({ label: 'Duration', value: module.duration_weeks ? R.number(module.duration_weeks) + ' weeks' : 'Open-ended', icon: 'hourglass', tone: 'sky' }) +
        R.statCard({ label: 'Plans', value: R.number(plans.length), icon: 'notebook-pen', tone: 'plum' }) +
        R.statCard({ label: 'Theme', value: module.theme || '—', icon: 'palette', foot: module.age_group || 'All ages' }) +
        '</div>' +
        R.card('Lesson plans, in order',
          plans.length
            ? this.renderPlanTable(ctx, module, plans)
            : R.emptyState('No plans yet', 'Add an existing plan, or create a new one — it joins the end of the sequence.',
              canCreate ? '<button class="btn btn-primary" @click="openNamedModal(\'plan\')">New plan in module</button>' : '', 'notebook-pen'),
          (canCreate && !official ? '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'addPlan\')">' + R.icon('list-plus') + ' Add existing plan</button>' : '')) +
        (canCreate && !official
          ? '<div class="section"></div><button class="btn btn-danger btn-sm" @click="confirmAction(\'Delete module\',\'Plans inside will be unlinked, not deleted.\',\'/learning-modules/' + R.attr(id) + '\',{method:\'DELETE\',submitLabel:\'Delete module\',successMessage:\'Module deleted\'})">' + R.icon('trash-2') + ' Delete module</button>'
          : '');
    },

    renderPlanTable(ctx, module, plans) {
      const id = module.id;
      const ids = planIds(plans);
      const official = isOfficialRow(module);
      const canCreate = ctx.has('curriculum.create.daycare');
      const rows = plans.map((plan, index) => {
        const up = moveIds(ids, index, -1);
        const down = moveIds(ids, index, 1);
        return Object.assign({}, plan, {
          position: index + 1,
          canMoveUp: Boolean(up),
          canMoveDown: Boolean(down),
          moveUpPayload: up ? R.attr(JSON.stringify(up)) : '',
          moveDownPayload: down ? R.attr(JSON.stringify(down)) : ''
        });
      });
      return R.table({ rows, columns: [
        { label: '#', align: 'right', render: (plan) => '<span class="mono cell-strong">' + plan.position + '</span>' },
        { label: 'Plan', render: (plan) => '<span class="cell-strong">' + R.esc(plan.title) + '</span><span class="cell-sub">' + R.esc(plan.theme || '') + '</span>' },
        { label: 'Classroom', render: (plan) => R.esc(plan.classroom_name || '—') },
        { label: 'Objectives', render: (plan) => '<span class="badge badge-muted">' + R.number((plan.objective_ids || []).length) + '</span>' },
        { label: 'Status', render: (plan) => (isOfficialRow(plan) ? ' ' + NCF_OFFICIAL + ' ' : '') + R.badge(plan.status) },
        { label: '', align: 'right', render: (plan) => '<div class="btn-group">' +
          (plan.canMoveUp && !official ? '<button class="btn btn-sm btn-ghost" title="Move earlier" @click="act(\'POST\',\'/learning-modules/' + R.attr(id) + '/plans/reorder\',{planIds:' + plan.moveUpPayload + '},{successMessage:\'Order saved\'})">' + R.icon('arrow-up') + '</button>' : '') +
          (plan.canMoveDown && !official ? '<button class="btn btn-sm btn-ghost" title="Move later" @click="act(\'POST\',\'/learning-modules/' + R.attr(id) + '/plans/reorder\',{planIds:' + plan.moveDownPayload + '},{successMessage:\'Order saved\'})">' + R.icon('arrow-down') + '</button>' : '') +
          (canCreate && !official ? '<button class="btn btn-sm btn-ghost" @click="act(\'DELETE\',\'/learning-modules/' + R.attr(id) + '/plans/' + R.attr(plan.id) + '\',{},{successMessage:\'Removed from module\'})">Remove</button>' : '') +
          '</div>' }
      ], emptyTitle: 'No plans yet', emptyMessage: 'Add the first plan to this module.' });
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      const module = page.module || {};
      if (name === 'moduleEdit') {
        ctx.openModal({
          title: 'Edit module', endpoint: '/learning-modules/' + module.id, method: 'PATCH', submitLabel: 'Save module',
          fields: MODULE_FIELDS.map((field) => {
            const source = { title: module.title, description: module.description, theme: module.theme, ageGroup: module.age_group, durationWeeks: module.duration_weeks };
            const value = source[field.name];
            return Object.assign({}, field, { value: value === undefined || value === null ? '' : value });
          })
        });
        return;
      }
      if (name === 'plan') {
        // Open the shared curriculum plan modal, bound to this module.
        V.curriculum.openModal(ctx, 'plan', module.id);
        return;
      }
      if (name === 'addPlan') {
        const inModule = new Set((page.plans || []).map((plan) => plan.id));
        const candidates = (page.allPlans || []).filter((plan) => !inModule.has(plan.id));
        if (!candidates.length) {
          ctx.toast('Every visible lesson plan is already in a module, or there are no plans yet.', 'warn');
          return;
        }
        ctx.openModal({
          title: 'Add an existing plan', endpoint: '/learning-modules/' + module.id + '/plans', submitLabel: 'Add plan', size: 'wide',
          description: 'The plan keeps everything about it — classroom, objectives and status — and simply joins the end of this module’s sequence.',
          fields: [
            { name: 'planId', label: 'Lesson plan', type: 'searchselect', required: true, span: 2, placeholder: 'Search by title…', options: candidates.map((plan) => ({ value: plan.id, label: plan.title + (plan.classroom_name ? ' · ' + plan.classroom_name : ''), subtitle: plan.theme || 'No theme' })) }
          ]
        });
      }
    }
  };
})();
