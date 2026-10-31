'use strict';

/* Forms, submissions and consent records. */
(function () {
  const R = window.Reel;
  const V = R.views;

  V.forms = {
    async load(ctx) {
      const [forms, consent, learners] = await Promise.all([
        R.api('GET', '/forms'),
        R.api('GET', '/consent').catch(() => ({ data: [] })),
        R.api('GET', '/learners?pageSize=200').catch(() => ({ data: [] }))
      ]);
      const detailId = ctx.filters.formId || (forms.data[0] && forms.data[0].id);
      let detail = null;
      let submissions = [];
      if (detailId) {
        const [d, s] = await Promise.all([
          R.api('GET', '/forms/' + detailId).catch(() => ({ data: null })),
          R.api('GET', '/forms/' + detailId + '/submissions').catch(() => ({ data: [] }))
        ]);
        detail = d.data;
        submissions = s.data || [];
      }
      return { rows: forms.data, consent: consent.data || [], learners: learners.data || [], detail, submissions };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'forms';
      return R.pageHead('Forms and consent', 'Collect information once, keep consent clear and review submissions in one place.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'consent\')">' + R.icon('shield-check') + ' Record consent</button>' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'form\')">' + R.icon('plus') + ' New form</button>') +
        R.tabs([{ key: 'forms', label: 'Forms' }, { key: 'submissions', label: 'Submissions' }, { key: 'consent', label: 'Consent' }], tab) +
        (tab === 'consent' ? this.renderConsent(page) : tab === 'submissions' ? this.renderSubmissions(ctx, page) : this.renderForms(ctx, page));
    },

    renderForms(ctx, page) {
      const forms = page.rows || [];
      const canManage = ctx.has('forms.manage.daycare');
      return (canManage ? R.bulkBar([
        { label: 'Publish selected', icon: 'upload', path: '/forms/bulk', action: 'publish' },
        { label: 'Archive selected', icon: 'archive', path: '/forms/bulk', action: 'archive', tone: 'danger' }
      ], { hint: 'Forms without a version cannot be published.' }) : '') +
        '<div class="split"><div class="stack">' +
        R.card('Form library', R.table({ rows: forms, selectable: canManage, columns: [
          { label: 'Form', render: (f) => '<span class="cell-strong">' + R.esc(f.name) + '</span><span class="cell-sub mono">/' + R.esc(f.slug) + '</span>' },
          { label: 'Type', render: (f) => '<span class="badge badge-muted">' + R.esc(R.titleCase(f.form_type)) + '</span>' },
          { label: 'Version', render: (f) => 'v' + R.number(f.version_number) },
          { label: 'Submissions', align: 'right', render: (f) => R.number(f.submission_count) + (Number(f.pending_count) ? ' <span class="badge badge-sun">' + R.number(f.pending_count) + ' new</span>' : '') },
          { label: 'Public', render: (f) => f.is_public ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-muted">No</span>' },
          { label: 'Status', render: (f) => R.badge(f.status) },
          { label: '', align: 'right', render: (f) => '<button class="btn btn-sm btn-secondary" @click="setFilter(\'formId\',\'' + R.attr(f.id) + '\')">Open</button>' }
        ], emptyTitle: 'No forms yet', emptyMessage: 'Create an enrolment, medical or consent form to collect information.' })) +
        '</div><div class="stack">' +
        (page.detail ? R.card(page.detail.name,
          '<div class="muted small" style="margin-bottom:10px">' + R.esc(page.detail.description || '') + '</div>' +
          '<div class="row" style="margin-bottom:12px">' + R.badge(page.detail.status) +
          (page.detail.is_public ? '<span class="badge badge-green">Public</span>' : '') +
          '<span class="badge badge-muted">' + R.number(page.submissions.length) + ' submissions</span></div>' +
          '<div class="stack">' + (((page.detail.current || {}).schema_json || {}).fields || []).map((f) =>
            '<div class="row" style="gap:8px;padding:6px 0;border-bottom:1px solid var(--border-subtle)"><span class="mono badge badge-muted">' + R.esc(f.key) + '</span><span style="flex:1">' + R.esc(f.label) + '</span>' + (f.required ? '<span class="badge badge-sun">Required</span>' : '') + '</div>').join('') + '</div>',
          '<div class="btn-group">' +
            (page.detail.status !== 'published' ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/forms/' + R.attr(page.detail.id) + '/publish\',{isPublic:' + Boolean(page.detail.is_public) + '},{successMessage:\'Form published\'})">Publish</button>' : '<button class="btn btn-sm btn-secondary" @click="act(\'POST\',\'/forms/' + R.attr(page.detail.id) + '/archive\',{},{successMessage:\'Form archived\'})">Archive</button>') +
            '<a class="btn btn-sm btn-secondary" href="#/site/' + R.attr(ctx.activeMembership.organisation.slug) + '/forms/' + R.attr(page.detail.slug) + '" target="_blank" rel="noopener">View public</a>' +
          '</div>') : R.card('Form details', '<p class="muted small">Select a form to see its fields and public link.</p>')) +
        '</div></div>';
    },

    renderSubmissions(ctx, page) {
      const form = page.detail;
      if (!form) return R.emptyState('No form selected', 'Choose a form to review its submissions.', '<a class="btn btn-secondary" href="#/app/forms">Form library</a>', 'file-text');
      return R.card(form.name + ' submissions', R.table({ rows: page.submissions || [], columns: [
        { label: 'Received', render: (s) => '<span class="cell-strong">' + R.dateTime(s.submitted_at) + '</span><span class="cell-sub">' + R.relative(s.submitted_at) + '</span>' },
        { label: 'Submitter', render: (s) => R.esc(s.submitter_email || (s.first_name ? s.first_name + ' ' + s.last_name : 'Anonymous')) },
        { label: 'Data', render: (s) => '<span class="muted small">' + R.esc(R.truncate(Object.values(s.submission_data || {}).filter((v) => typeof v === 'string').join(' · '), 100)) + '</span>' },
        { label: 'Status', render: (s) => R.badge(s.status) },
        { label: '', align: 'right', render: (s) => '<div class="btn-group">' +
          '<button class="btn btn-sm btn-secondary" @click="openNamedDetail(\'submission\',\'' + R.attr(s.id) + '\')">View</button>' +
          (s.status === 'received' ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'review\',\'' + R.attr(s.id) + '\')">Review</button>' : '') +
          '</div>' }
      ], emptyTitle: 'No submissions', emptyMessage: 'Share the public link to start collecting responses.' }), '<a class="btn btn-sm btn-ghost" href="#/app/forms">Change form</a>');
    },

    renderConsent(page) {
      return R.card('Consent records', R.table({ rows: page.consent || [], columns: [
        { label: 'Child', render: (c) => '<span class="cell-strong">' + R.esc((c.first_name || '') + ' ' + (c.last_name || '')) + '</span><span class="cell-sub">' + R.esc(c.guardian_name || '') + '</span>' },
        { label: 'Consent', render: (c) => '<span class="badge badge-muted">' + R.esc(R.titleCase(c.consent_type)) + '</span><span class="cell-sub">' + R.esc(c.purpose || '') + '</span>' },
        { label: 'Status', render: (c) => R.badge(c.status) },
        { label: 'Granted', render: (c) => R.date(c.granted_at) },
        { label: 'Withdrawn', render: (c) => R.date(c.withdrawn_at) },
        { label: '', align: 'right', render: (c) => c.status === 'granted' ? '<button class="btn btn-sm btn-secondary" @click="confirmAction(\'Withdraw consent\',\'This records the guardian\\\'s withdrawal and keeps the history intact.\',\'/consent/' + R.attr(c.id) + '/withdraw\',{submitLabel:\'Withdraw\',successMessage:\'Consent withdrawn\'})">Withdraw</button>' : '' }
      ], emptyTitle: 'No consent records', emptyMessage: 'Record photo, medical and data-processing consent per child.' }));
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      if (name === 'form') {
        ctx.openModal({ title: 'New form', endpoint: '/forms', submitLabel: 'Create form', size: 'wide',
          description: 'Add fields as a JSON array, e.g. [{"key":"child_name","type":"text","label":"Child name","required":true}]',
          fields: [
            { name: 'name', label: 'Form name', required: true },
            { name: 'slug', label: 'Slug', required: true, placeholder: 'medical-update' },
            { name: 'formType', label: 'Type', type: 'select', options: ['general', 'enrolment', 'medical', 'consent', 'incident', 'feedback'], value: 'general' },
            { name: 'isPublic', label: 'Public form', type: 'checkbox', value: false, help: 'Anyone with the link can submit' },
            { name: 'description', label: 'Description', type: 'textarea', span: 2 },
            { name: 'fields', label: 'Fields (JSON)', type: 'textarea', span: 2, placeholder: '[{"key":"child_name","type":"text","label":"Child name","required":true}]' }
          ],
          transform: (data) => {
            const body = Object.assign({}, data);
            if (typeof body.fields === 'string' && body.fields.trim()) {
              try { body.fields = JSON.parse(body.fields); } catch { delete body.fields; }
            } else { delete body.fields; }
            return body;
          } });
      } else if (name === 'review' && id) {
        ctx.openModal({ title: 'Review submission', endpoint: '/forms/submissions/' + id + '/review', submitLabel: 'Save review', fields: [
          { name: 'decision', label: 'Decision', type: 'select', required: true, options: ['accepted', 'needs_information', 'rejected'] },
          { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
        ] });
      } else if (name === 'consent') {
        ctx.openModal({ title: 'Record consent', endpoint: '/consent', submitLabel: 'Save consent', fields: [
          { name: 'learnerId', label: 'Child', type: 'select', required: true, options: (page.learners || []).map((l) => ({ value: l.id, label: l.first_name + ' ' + l.last_name })) },
          { name: 'consentType', label: 'Consent type', type: 'select', required: true, options: ['photographs', 'medical_treatment', 'data_processing', 'excursions', 'research'] },
          { name: 'purpose', label: 'Purpose', required: true, span: 2 },
          { name: 'status', label: 'Status', type: 'select', options: ['granted', 'declined', 'pending'], value: 'granted' }
        ] });
      }
    },

    detail(ctx, name, id) {
      if (name !== 'submission') return null;
      const submission = ((ctx.page || {}).submissions || []).find((s) => s.id === id);
      if (!submission) return { title: 'Submission', html: '<p class="muted">Submission not found.</p>' };
      const data = submission.submission_data || {};
      return {
        title: 'Submission from ' + R.dateTime(submission.submitted_at),
        html: '<div class="detail-list">' +
          R.detailItem('Submitter', R.esc(submission.submitter_email || 'Anonymous')) +
          R.detailItem('Status', R.badge(submission.status)) +
          R.detailItem('Received', R.dateTime(submission.submitted_at)) +
          R.detailItem('Reviewed', R.dateTime(submission.reviewed_at)) +
          '</div><div class="section"></div><h3>Submitted data</h3><div class="detail-list">' +
          Object.keys(data).map((key) => R.detailItem(R.titleCase(key), R.esc(typeof data[key] === 'object' ? R.json(data[key]) : data[key]))).join('') +
          '</div>' + (submission.review_notes ? '<h3 style="margin-top:16px">Review notes</h3><p class="muted">' + R.esc(submission.review_notes) + '</p>' : '')
      };
    }
  };
})();
