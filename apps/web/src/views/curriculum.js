'use strict';

/* Curriculum, activities and the learning calendar. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const PLAN_STATUSES = ['draft', 'submitted', 'approved', 'published', 'in_progress', 'completed', 'evaluated', 'cancelled'];
  const NEXT_STATUS = {
    draft: ['submitted', 'cancelled'], submitted: ['approved', 'draft', 'cancelled'],
    approved: ['published', 'cancelled'], published: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'], completed: ['evaluated'], evaluated: [], cancelled: []
  };

  V.curriculum = {
    async load(ctx) {
      const [overview, frameworks, plans, objectives, periods, classrooms] = await Promise.all([
        R.api('GET', '/curriculum/overview').then((p) => p.data).catch(() => ({})),
        R.api('GET', '/curriculum/frameworks').then((p) => p.data).catch(() => []),
        R.api('GET', '/curriculum/lesson-plans').then((p) => p.data).catch(() => []),
        R.api('GET', '/curriculum/objectives').then((p) => p.data).catch(() => []),
        R.api('GET', '/curriculum/periods').then((p) => p.data).catch(() => []),
        R.api('GET', '/classrooms').then((p) => p.data).catch(() => [])
      ]);
      return { overview, frameworks, plans, objectives, periods, classrooms };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'plans';
      const o = page.overview || {};
      return R.pageHead('Curriculum', 'Frameworks, learning objectives, lesson plans and academic periods.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'framework\')">' + R.icon('book-plus') + ' New framework</button>' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'plan\')">' + R.icon('plus') + ' New lesson plan</button>') +
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
        (tab === 'plans' ? this.renderPlans(ctx, page) : tab === 'frameworks' ? this.renderFrameworks(page) : tab === 'objectives' ? this.renderObjectives(page) : this.renderPeriods(page));
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
        { label: 'Plan', render: (p) => '<span class="cell-strong">' + R.esc(p.title) + '</span><span class="cell-sub">' + R.esc(p.theme || '') + '</span>' },
        { label: 'Classroom', render: (p) => R.esc(p.classroom_name || '—') },
        { label: 'Objectives', render: (p) => '<span class="badge badge-muted">' + ((p.objective_ids || []).length) + '</span>' },
        { label: 'Status', render: (p) => R.badge(p.status) },
        { label: 'Created', render: (p) => R.date(p.created_at) },
        { label: '', align: 'right', render: (p) => '<div class="btn-group">' +
          '<button class="btn btn-sm btn-secondary" @click="openNamedDetail(\'plan\',\'' + R.attr(p.id) + '\')">View</button>' +
          ((NEXT_STATUS[p.status] || []).length ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'transition\',\'' + R.attr(p.id) + '\')">Move on</button>' : '') +
          '</div>' }
      ], emptyTitle: 'No lesson plans', emptyMessage: 'Plan the week around your children\'s interests and the framework.' });
    },

    renderFrameworks(page) {
      return '<div class="grid grid-2">' + (page.frameworks || []).map((f) => R.card(f.name,
        '<div class="muted small" style="margin-bottom:10px">Version ' + R.esc(f.version) + ' · ' + R.esc(f.description || '') + '</div>' +
        '<div class="stack">' + (f.domains || []).map((d) => '<div class="row" style="gap:10px"><span class="dot"></span><div style="flex:1"><div class="strong" style="font-size:0.88rem">' + R.esc(d.name) + '</div><div class="muted small">' + R.esc(d.description || '') + '</div></div><span class="badge badge-muted">' + R.number((page.objectives || []).filter((o) => o.domain_id === d.id).length) + ' objectives</span></div>').join('') + '</div>',
        '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'domain\',\'' + R.attr(f.id) + '\')">' + R.icon('plus') + ' Domain</button>')).join('') +
        ((page.frameworks || []).length ? '' : R.emptyState('No frameworks', 'Create a framework to organise domains and objectives.', '<button class="btn btn-primary" @click="openNamedModal(\'framework\')">New framework</button>', 'book-open')) + '</div>';
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
        ctx.openModal({ title: 'New curriculum framework', endpoint: '/curriculum/frameworks', submitLabel: 'Create framework', fields: [
          { name: 'name', label: 'Name', required: true, span: 2 },
          { name: 'version', label: 'Version', value: '1.0', required: true },
          { name: 'description', label: 'Description', type: 'textarea', span: 2 }
        ] });
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
        ctx.openModal({
          title: 'New lesson plan', endpoint: '/curriculum/lesson-plans', submitLabel: 'Create plan', size: 'wide',
          description: 'Choose objective codes from the list below. Separate multiple codes with commas.',
          fields: [
            { name: 'title', label: 'Title', required: true, span: 2 },
            { name: 'theme', label: 'Theme' },
            { name: 'classroomId', label: 'Classroom', type: 'select', required: true, options: R.classroomOptions(page) },
            { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx) },
            { name: 'academicPeriodId', label: 'Academic period', type: 'select', options: (page.periods || []).map((p) => ({ value: p.id, label: p.name })) },
            { name: 'objectiveCodes', label: 'Objective codes', placeholder: objectives.slice(0, 3).map((o) => o.code).join(', '), span: 2 },
            { name: 'preparationNotes', label: 'Preparation notes', type: 'textarea', span: 2 },
            { name: 'publishNow', label: 'Publish immediately', type: 'checkbox', value: false, help: 'Publish the plan to teachers now' }
          ],
          transform: (data) => {
            const codes = String(data.objectiveCodes || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
            const objectiveIds = objectives.filter((o) => codes.includes(String(o.code).toUpperCase())).map((o) => o.id);
            const body = Object.assign({}, data, { objectiveIds });
            delete body.objectiveCodes;
            return body;
          }
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
          (plan.delivery_notes ? '<h3>Delivery notes</h3><p class="muted">' + R.esc(plan.delivery_notes) + '</p>' : '')
      };
    }
  };

  V.activities = {
    async load(ctx) {
      const [activities, plans, classrooms] = await Promise.all([
        R.api('GET', '/curriculum/activities'),
        R.api('GET', '/curriculum/lesson-plans').catch(() => ({ data: [] })),
        R.api('GET', '/classrooms').catch(() => ({ data: [] }))
      ]);
      return { rows: activities.data, plans: plans.data || [], classrooms: classrooms.data || [] };
    },
    render(ctx, params, page) {
      return R.pageHead('Activities', 'The experiences that fill the day — from sensory play to early literacy.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'activity\')">' + R.icon('plus') + ' New activity</button>') +
        '<div class="grid grid-3">' + (page.rows || []).map((a) => R.card(a.title,
          '<div class="row" style="margin-bottom:8px"><span class="badge badge-sun">' + R.esc(a.age_group || 'All ages') + '</span><span class="badge badge-muted">' + R.esc(R.titleCase(a.activity_type || 'activity')) + '</span><span class="badge badge-sky">' + R.number(a.duration_minutes) + ' min</span></div>' +
          '<p class="muted small">' + R.esc(a.description || '') + '</p>' +
          '<div class="muted small"><strong>Materials:</strong> ' + R.esc(a.materials || '—') + '</div>' +
          (a.safety_notes ? '<div class="alert alert-warn" style="margin-top:8px">' + R.icon('shield-alert') + '<span>' + R.esc(a.safety_notes) + '</span></div>' : ''),
          R.badge(a.status))).join('') + '</div>' +
        ((page.rows || []).length ? '' : R.emptyState('No activities yet', 'Build a library of activities your team can reuse.', '<button class="btn btn-primary" @click="openNamedModal(\'activity\')">New activity</button>', 'puzzle'));
    },
    openModal(ctx, name) {
      if (name !== 'activity') return;
      ctx.openModal({ title: 'New activity', endpoint: '/curriculum/activities', submitLabel: 'Create activity', size: 'wide', fields: [
        { name: 'title', label: 'Title', required: true, span: 2 },
        { name: 'branchId', label: 'Branch', type: 'select', options: R.branchOptions(ctx) },
        { name: 'ageGroup', label: 'Age group', placeholder: '3-5 years' },
        { name: 'activityType', label: 'Type', type: 'select', options: ['sensory', 'creative', 'physical', 'literacy', 'numeracy', 'music', 'outdoor', 'quiet'] },
        { name: 'durationMinutes', label: 'Duration (minutes)', type: 'number', value: 30 },
        { name: 'description', label: 'Description', type: 'textarea', span: 2 },
        { name: 'materials', label: 'Materials', type: 'textarea', span: 2 },
        { name: 'safetyNotes', label: 'Safety notes', type: 'textarea', span: 2 }
      ] });
    }
  };

  V.calendar = {
    async load(ctx) {
      const from = ctx.filters.from || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      const to = ctx.filters.to || new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
      const [events, activities, plans, classrooms, staff] = await Promise.all([
        R.api('GET', '/curriculum/calendar?from=' + from + '&to=' + to),
        R.api('GET', '/curriculum/activities').catch(() => ({ data: [] })),
        R.api('GET', '/curriculum/lesson-plans').catch(() => ({ data: [] })),
        R.api('GET', '/classrooms').catch(() => ({ data: [] })),
        ctx.has('staff.read.daycare') ? R.api('GET', '/staff').catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
      ]);
      return { rows: events.data, from, to, activities: activities.data || [], plans: plans.data || [], classrooms: classrooms.data || [], staff: staff.data || [] };
    },
    render(ctx, params, page) {
      const events = page.rows || [];
      const byDay = {};
      events.forEach((e) => {
        const day = String(e.starts_at || '').slice(0, 10);
        (byDay[day] = byDay[day] || []).push(e);
      });
      const days = Object.keys(byDay).sort();
      return R.pageHead('Learning calendar', 'What is happening in each classroom, day by day.',
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'event\')">' + R.icon('calendar-plus') + ' Schedule activity</button>') +
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
            (e.status === 'scheduled' ? '<button class="btn btn-sm btn-secondary" @click="act(\'POST\',\'/curriculum/calendar/events/' + R.attr(e.id) + '/complete\',{notes:\'\'},{successMessage:\'Activity completed\'})">Complete</button>' : '') +
            '</div>').join('') + '</div>', '', { className: 'section' })).join('') :
          R.emptyState('Nothing scheduled', 'Choose a date range or schedule an activity.', '<button class="btn btn-primary" @click="openNamedModal(\'event\')">Schedule activity</button>', 'calendar-days'));
    },
    openModal(ctx, name) {
      if (name !== 'event') return;
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
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
      ] });
    }
  };
})();
