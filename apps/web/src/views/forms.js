'use strict';

/* Forms, submissions and consent records. */
(function () {
  const R = window.Reel;
  const V = R.views;

  const FIELD_TYPES = [
    { value: 'text', label: 'Short text' },
    { value: 'textarea', label: 'Long text' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'select', label: 'Dropdown' },
    { value: 'radio', label: 'Radio buttons' },
    { value: 'checkbox', label: 'Yes / no' },
    { value: 'checkboxes', label: 'Checkboxes (multi-select)' },
    { value: 'file', label: 'File upload' },
    { value: 'signature', label: 'Signature (typed)' }
  ];

  const FIELD_COLUMNS = [
    { key: 'label', label: 'Question / label', span: 2, placeholder: 'Child’s full name' },
    { key: 'key', label: 'Key (optional)', placeholder: 'auto from label' },
    { key: 'type', label: 'Type', type: 'select', options: FIELD_TYPES },
    { key: 'required', label: 'Required', type: 'checkbox' },
    { key: 'options', label: 'Choices', span: 2, placeholder: 'Comma separated, for dropdowns, radio buttons and checkboxes' },
    { key: 'helpText', label: 'Help text', span: 2, placeholder: 'Optional guidance shown under the field' }
  ];

  /**
   * Ready-made starting points. A centre should not have to invent an
   * admission or medical form from an empty repeater, so each preset fills in
   * sensible questions that they can rename, reorder or remove.
   */
  const FORM_PRESETS = [
    {
      key: 'blank',
      label: 'Start from scratch',
      description: 'Build your own questions',
      name: '',
      formType: 'general',
      fields: []
    },
    {
      key: 'admission',
      label: 'Learner admission',
      description: 'Child, guardian and starting details',
      name: 'Learner admission',
      formType: 'enrolment',
      isPublic: true,
      displayOnWebsite: true,
      fields: [
        { key: 'child_first_name', label: 'Child’s first name', type: 'text', required: true },
        { key: 'child_surname', label: 'Child’s surname', type: 'text', required: true },
        { key: 'date_of_birth', label: 'Date of birth', type: 'date', required: true },
        { key: 'age_group', label: 'Age group', type: 'select', required: true, options: ['Baby room', 'Toddler room', 'Preschool'] },
        { key: 'preferred_start_date', label: 'Preferred start date', type: 'date' },
        { key: 'guardian_name', label: 'Parent or guardian name', type: 'text', required: true },
        { key: 'guardian_email', label: 'Parent or guardian email', type: 'email', required: true },
        { key: 'guardian_phone', label: 'Parent or guardian phone', type: 'phone', required: true },
        { key: 'allergies', label: 'Allergies or medical needs', type: 'textarea', helpText: 'List anything the team must know before the first day.' },
        { key: 'attendance_days', label: 'Days your child will attend', type: 'checkboxes', options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], helpText: 'Choose every day that applies.' },
        { key: 'supporting_documents', label: 'Supporting documents', type: 'file', helpText: 'Upload a birth certificate or immunisation record (PDF or image).' },
        { key: 'photo_consent', label: 'I consent to photos for internal use', type: 'checkbox' }
      ]
    },
    {
      key: 'medical',
      label: 'Medical and allergies',
      description: 'Health, medication and emergency contacts',
      name: 'Medical information and allergies',
      formType: 'medical',
      fields: [
        { key: 'child_name', label: 'Child’s full name', type: 'text', required: true },
        { key: 'allergies', label: 'Allergies', type: 'textarea', required: true, helpText: 'Include food, medication and environmental allergies.' },
        { key: 'medical_conditions', label: 'Medical conditions', type: 'textarea' },
        { key: 'medication', label: 'Regular medication', type: 'textarea', helpText: 'Name, dose and when it should be given.' },
        { key: 'emergency_contact', label: 'Emergency contact', type: 'text', required: true },
        { key: 'emergency_phone', label: 'Emergency phone', type: 'phone', required: true },
        { key: 'doctor_name', label: 'Doctor’s name', type: 'text' },
        { key: 'doctor_phone', label: 'Doctor’s phone', type: 'phone' },
        { key: 'treatment_consent', label: 'I consent to emergency treatment', type: 'checkbox', required: true }
      ]
    },
    {
      key: 'consent',
      label: 'Photo and media consent',
      description: 'Ask guardians what may be shared',
      name: 'Photo and media consent',
      formType: 'consent',
      fields: [
        { key: 'child_name', label: 'Child’s full name', type: 'text', required: true },
        { key: 'guardian_name', label: 'Parent or guardian name', type: 'text', required: true },
        { key: 'photos_internal', label: 'Photos for internal records', type: 'checkbox' },
        { key: 'photos_social', label: 'Photos on social media', type: 'checkbox' },
        { key: 'photos_website', label: 'Photos on the centre website', type: 'checkbox' },
        { key: 'notes', label: 'Anything we should know', type: 'textarea' }
      ]
    },
    {
      key: 'incident',
      label: 'Incident report',
      description: 'Record what happened and what was done',
      name: 'Incident report',
      formType: 'incident',
      fields: [
        { key: 'child_name', label: 'Child’s full name', type: 'text', required: true },
        { key: 'incident_date', label: 'Date of incident', type: 'date', required: true },
        { key: 'incident_time', label: 'Time of incident', type: 'text', placeholder: '14:30' },
        { key: 'location', label: 'Where it happened', type: 'text' },
        { key: 'description', label: 'What happened', type: 'textarea', required: true },
        { key: 'injury', label: 'Injury or damage', type: 'textarea' },
        { key: 'action_taken', label: 'Action taken', type: 'textarea', required: true },
        { key: 'staff_name', label: 'Staff member reporting', type: 'text', required: true },
        { key: 'guardian_notified', label: 'Guardian was notified', type: 'checkbox' }
      ]
    },
    {
      key: 'feedback',
      label: 'Family feedback',
      description: 'A short satisfaction survey',
      name: 'Family feedback',
      formType: 'feedback',
      isPublic: true,
      displayOnWebsite: true,
      fields: [
        { key: 'your_name', label: 'Your name', type: 'text' },
        { key: 'relationship', label: 'I am a…', type: 'select', options: ['Parent', 'Guardian', 'Grandparent', 'Other'] },
        { key: 'rating', label: 'Overall experience', type: 'select', required: true, options: ['Excellent', 'Good', 'Fair', 'Needs improvement'] },
        { key: 'what_went_well', label: 'What went well?', type: 'textarea' },
        { key: 'what_could_improve', label: 'What could we improve?', type: 'textarea' },
        { key: 'contact_me', label: 'Please contact me about my feedback', type: 'checkbox' }
      ]
    }
  ];

  function slugify(value) {
    return String(value || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  }

  function fieldKey(value, index) {
    const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return key || 'field_' + (index + 1);
  }

  /** Turn stored field definitions into editable repeater rows. */
  function editableFields(fields) {
    return (fields || []).map((field) => ({
      key: field.key || '',
      label: field.label || '',
      type: field.type || 'text',
      required: field.required === true,
      options: (field.options || []).join(', '),
      helpText: field.helpText || ''
    }));
  }

  /**
   * Turn repeater rows back into the API's field schema. Keys are generated
   * from the label when left blank and de-duplicated automatically, so staff
   * only have to write the question. A row without a label is a real mistake,
   * not something to silently drop.
   */
  function schemaFields(rows) {
    const seen = new Set();
    const result = [];
    (rows || []).forEach((row, index) => {
      const label = String((row && row.label) || '').trim();
      if (!label) {
        throw new Error('Field ' + (index + 1) + ' needs a question or label. Add one, or remove that field.');
      }
      let key = fieldKey(row.key || label, index);
      if (seen.has(key)) {
        let suffix = 2;
        while (seen.has(key + '_' + suffix)) suffix += 1;
        key = key + '_' + suffix;
      }
      seen.add(key);
      const type = row.type || 'text';
      result.push({
        key,
        label,
        type,
        required: row.required === true,
        helpText: String(row.helpText || '').trim(),
        options: ['select', 'radio', 'checkboxes'].includes(type)
          ? String(row.options || '').split(',').map((option) => option.trim()).filter(Boolean).slice(0, 50)
          : []
      });
    });
    return result;
  }

  function publicHref(orgSlug, formSlug) {
    return '#/site/' + encodeURIComponent(orgSlug || '') + '/forms/' + encodeURIComponent(formSlug || '');
  }

  function absolutePublicHref(orgSlug, formSlug) {
    const origin = String(window.REEL_SITE_BASE || 'https://ecd.re-el.co.za').replace(/\/+$/, '');
    return origin + '/' + publicHref(orgSlug, formSlug);
  }

  function paymentSummary(form) {
    if (!form || form.payment_enabled !== true) return { label: 'Free', html: '<span class="badge badge-muted">Free</span>' };
    return {
      label: R.money(form.payment_amount, form.payment_currency || 'ZAR'),
      html: '<span class="badge badge-green">' + R.esc(R.money(form.payment_amount, form.payment_currency || 'ZAR')) + '</span>' +
        (form.payment_required === false ? ' <span class="badge badge-muted">Optional</span>' : '')
    };
  }

  function fieldTypeLabel(type) {
    const found = FIELD_TYPES.find((entry) => entry.value === type);
    return found ? found.label : R.titleCase(type || 'text');
  }

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
          R.api('GET', '/forms/' + encodeURIComponent(detailId)).catch(() => ({ data: null })),
          R.api('GET', '/forms/' + encodeURIComponent(detailId) + '/submissions').catch(() => ({ data: [] }))
        ]);
        detail = d.data;
        submissions = s.data || [];
      }
      return { rows: forms.data || [], consent: consent.data || [], learners: learners.data || [], detail, submissions };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'forms';
      return R.pageHead('Forms and consent', 'Start from a template, ask only what you need, and keep every submission in one place.',
        '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'consent\')">' + R.icon('shield-check') + ' Record consent</button>' +
        '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'form\')">' + R.icon('plus') + ' New form</button>') +
        R.tabs([{ key: 'forms', label: 'Form library' }, { key: 'submissions', label: 'Submissions' }, { key: 'consent', label: 'Consent' }], tab) +
        (tab === 'consent' ? this.renderConsent(page) : tab === 'submissions' ? this.renderSubmissions(ctx, page) : this.renderForms(ctx, page));
    },

    renderForms(ctx, page) {
      const forms = page.rows || [];
      const canManage = ctx.has('forms.manage.daycare');
      const gettingStarted = forms.length ? '' :
        '<div class="card"><h3>Create your first form in three steps</h3>' +
        '<ol class="muted small" style="margin:10px 0 0 18px;line-height:1.7">' +
        '<li><strong>Pick a template</strong> — learner admission, medical, photo consent, incident or feedback.</li>' +
        '<li><strong>Adjust the questions</strong> — rename, reorder or remove anything. Keys are created for you.</li>' +
        '<li><strong>Choose who can see it</strong> — staff-only, public link, or listed on your website.</li>' +
        '</ol>' +
        (canManage ? '<div style="margin-top:14px"><button class="btn btn-primary btn-sm" @click="openNamedModal(\'form\')">' + R.icon('plus') + ' Create a form</button></div>' : '') +
        '</div>';
      return (canManage ? R.bulkBar([
        { label: 'Publish selected', icon: 'upload', path: '/forms/bulk', action: 'publish' },
        { label: 'Archive selected', icon: 'archive', path: '/forms/bulk', action: 'archive', tone: 'danger' }
      ], { hint: 'Forms without a version cannot be published.' }) : '') +
        gettingStarted +
        '<div class="split"><div class="stack">' +
        R.card('Form library', R.table({ rows: forms, selectable: canManage, columns: [
          { label: 'Form', render: (f) => '<div><span class="cell-strong" style="overflow-wrap:normal">' + R.esc(f.name) + '</span> ' + R.badge(f.status) + '</div><span class="cell-sub mono" style="overflow-wrap:normal">/' + R.esc(f.slug) + ' · v' + R.number(f.version_number) + '</span>' },
          { label: 'Submissions', align: 'right', render: (f) => '<span style="white-space:nowrap">' + R.number(f.submission_count) + (Number(f.pending_count) ? ' <span class="badge badge-sun">' + R.number(f.pending_count) + ' new</span>' : '') + '</span>' },
          { label: 'Visibility', render: (f) => '<span style="white-space:nowrap">' + (f.is_public ? '<span class="badge badge-green">Public</span>' : '<span class="badge badge-muted">Private</span>') + (f.is_public && f.display_on_website !== false ? ' <span class="badge badge-green">Website</span>' : '') + '</span>' },
          { label: '', align: 'right', render: (f) => '<button class="btn btn-sm btn-secondary" @click="setFilter(\'formId\',\'' + R.attr(f.id) + '\')">Open</button>' }
        ], emptyTitle: 'No forms yet', emptyMessage: 'Create an enrolment, medical or consent form to collect information.',
          emptyAction: canManage ? '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'form\')">' + R.icon('plus') + ' Create a form</button>' : '' })) +
        '</div><div class="stack">' +
        (page.detail ? this.renderDetail(ctx, page.detail, page.submissions.length, canManage) : R.card('Form details', '<p class="muted small">Select a form to see its questions, payment settings and public link.</p>')) +
        '</div></div>';
    },

    renderDetail(ctx, form, submissionCount, canManage) {
      const orgSlug = ctx.activeMembership.organisation.slug;
      const latest = form.latest || form.current || null;
      const isDraft = Boolean(latest && form.current_version_id && latest.id !== form.current_version_id);
      // Staff always see their newest saved fields — even when that version
      // is still an unpublished draft — so nothing looks lost after a save.
      const fields = ((latest || {}).schema_json || {}).fields || [];
      const payment = paymentSummary(form);
      const publicUrl = absolutePublicHref(orgSlug, form.slug);
      const actions = canManage
        ? '<div class="btn-group">' +
          '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'formSettings\',\'' + R.attr(form.id) + '\')">' + R.icon('settings') + ' Settings</button>' +
          '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'formFields\',\'' + R.attr(form.id) + '\')">' + R.icon('list-plus') + ' Edit fields</button>' +
          (form.status !== 'published'
            ? '<button class="btn btn-sm btn-primary" @click="act(\'POST\',\'/forms/' + R.attr(form.id) + '/publish\',{versionId:\'' + R.attr((latest && latest.id) || form.current_version_id) + '\',isPublic:true},{successMessage:\'Form published\'})">' + R.icon('upload') + ' Publish</button>'
            : '<button class="btn btn-sm btn-secondary" @click="act(\'POST\',\'/forms/' + R.attr(form.id) + '/archive\',{},{successMessage:\'Form archived\'})">Archive</button>') +
          '</div>'
        : '';
      return R.card(form.name,
        '<div class="form-description muted small" style="margin-bottom:10px">' + R.richParagraphs(form.description || 'No description yet.') + '</div>' +
        '<div class="form-badge-row">' + R.badge(form.status) +
        (isDraft ? '<span class="badge badge-sun">Draft v' + R.number(latest.version_number) + ' — not live yet</span>' : '') +
        (form.is_public ? '<span class="badge badge-green">Public</span>' : '<span class="badge badge-muted">Private</span>') +
        (form.display_on_website !== false ? '<span class="badge badge-green">On website</span>' : '<span class="badge badge-muted">Not on website</span>') +
        payment.html + '</div>' +
        '<div class="form-meta-grid">' +
        '<div class="form-meta"><span>Version</span><strong>v' + R.number((latest && latest.version_number) || 1) + '</strong></div>' +
        '<div class="form-meta"><span>Submissions</span><strong>' + R.number(submissionCount) + '</strong></div>' +
        '<div class="form-meta"><span>Type</span><strong>' + R.esc(R.titleCase(form.form_type)) + '</strong></div>' +
        '<div class="form-meta"><span>Payment</span><strong>' + R.esc(payment.label) + '</strong></div>' +
        '</div>' +
        (isDraft ? '<div class="alert alert-warning" style="margin-top:12px"><i data-lucide="alert-triangle"></i><span>You have an unpublished draft (v' + R.number(latest.version_number) + '). The fields below are the draft — the public form still uses the last published version. Publish to take them live.</span></div>' : '') +
        (form.payment_enabled ? '<div class="site-pay-summary">' + R.icon('credit-card') +
          '<span>PayFast checkout · ' + R.esc(R.money(form.payment_amount, form.payment_currency || 'ZAR')) +
          (form.payment_required === false ? ' (optional)' : ' (required)') + '</span></div>' : '') +
        '<div class="section"></div><h3>' + (isDraft ? 'Draft fields (not live yet)' : 'Fields') + '</h3>' +
        (fields.length
          ? '<div class="form-field-list">' + fields.map((field) =>
            '<div class="form-field-row"><span class="mono badge badge-muted">' + R.esc(field.key) + '</span>' +
            '<span style="flex:1"><strong>' + R.esc(field.label) + '</strong>' +
            '<span class="cell-sub">' + R.esc(fieldTypeLabel(field.type)) + (field.options && field.options.length ? ' · ' + field.options.length + ' choices' : '') + '</span></span>' +
            (field.required ? '<span class="badge badge-sun">Required</span>' : '') + '</div>').join('') + '</div>'
          : '<p class="muted small">No fields yet. Use Edit fields to build the form.</p>') +
        (form.is_public ? '<div class="form-public-link"><input class="input" readonly value="' + R.attr(publicUrl) + '">' +
          '<a class="btn btn-sm btn-secondary" href="' + R.attr(publicHref(orgSlug, form.slug)) + '" target="_blank" rel="noopener">' + R.icon('external-link') + ' View public</a></div>' : ''),
        actions);
    },

    renderSubmissions(ctx, page) {
      const form = page.detail;
      if (!form) return R.emptyState('No form selected', 'Choose a form to review its submissions.', '<a class="btn btn-secondary" href="#/app/forms">Form library</a>', 'file-text');
      return R.card(form.name + ' submissions', R.table({ rows: page.submissions || [], columns: [
        { label: 'Received', render: (s) => '<span class="cell-strong">' + R.dateTime(s.submitted_at) + '</span><span class="cell-sub">' + R.relative(s.submitted_at) + '</span>' },
        { label: 'Submitter', render: (s) => R.esc(s.submitter_email || (s.first_name ? s.first_name + ' ' + s.last_name : 'Anonymous')) },
        { label: 'Data', render: (s) => '<span class="muted small">' + R.esc(R.truncate(Object.values(s.submission_data || {}).map((v) => Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)).filter(Boolean).join(' · '), 100)) + '</span>' },
        { label: 'Payment', render: (s) => s.payment_status === 'paid'
          ? '<span class="badge badge-green">Paid</span>'
          : s.payment_status === 'pending' ? '<span class="badge badge-sun">Pending</span>'
            : s.payment_status === 'unavailable' ? '<span class="badge badge-danger">Unavailable</span>'
              : '<span class="badge badge-muted">Free</span>' },
        { label: 'Status', render: (s) => R.badge(s.status) },
        { label: '', align: 'right', render: (s) => '<div class="btn-group" style="flex-wrap:nowrap;white-space:nowrap">' +
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
      const form = page.detail && (!id || page.detail.id === id) ? page.detail : null;

      if (name === 'form') {
        ctx.openModal({
          title: 'New form',
          endpoint: '/forms',
          submitLabel: 'Create form',
          size: 'wide',
          description: 'Pick a ready-made template or start from scratch. Write questions in plain language — internal keys are generated for you.',
          fields: [
            { name: 'preset', label: 'Start from a template', type: 'preset', span: 2, value: 'blank', presets: FORM_PRESETS, help: 'Choosing a template replaces the questions below with a sensible starting set. You can edit every one.' },
            { name: 'name', label: 'Form name', required: true, placeholder: 'Learner enrolment', help: 'Shown to families and staff.' },
            { name: 'slug', label: 'Public link slug', placeholder: 'learner-enrolment', help: 'Leave blank and we will create it from the name.' },
            { name: 'formType', label: 'Type', type: 'select', options: ['general', 'enrolment', 'medical', 'consent', 'incident', 'feedback'], value: 'general' },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, placeholder: 'What this form is for, and who should complete it.', help: 'Shown above the form. Leave a blank line between paragraphs, and wrap words in *asterisks* to make them bold.' },
            { name: 'isPublic', label: 'Public form', type: 'checkbox', value: false, help: 'Anyone with the link can submit. Leave off for staff-only forms.' },
            { name: 'displayOnWebsite', label: 'Show on the public website', type: 'checkbox', value: true, help: 'Lists the form on your website’s forms page', showIf: (data) => data.isPublic === true },
            { name: 'paymentEnabled', label: 'Take a payment', type: 'checkbox', value: false, help: 'Send the payer to PayFast after submitting' },
            { name: 'paymentRequired', label: 'Payment required', type: 'checkbox', value: true, help: 'The submission is still received if payment is skipped', showIf: (data) => data.paymentEnabled === true },
            { name: 'paymentAmount', label: 'Amount', type: 'number', min: 0, step: '0.01', placeholder: '250.00', help: 'Amount in rand, for example 250.00', showIf: (data) => data.paymentEnabled === true },
            { name: 'paymentCurrency', label: 'Currency', type: 'select', options: ['ZAR'], value: 'ZAR', showIf: (data) => data.paymentEnabled === true },
            { name: 'paymentDescription', label: 'Payment description', span: 2, placeholder: 'Enrolment deposit', showIf: (data) => data.paymentEnabled === true },
            { name: 'fields', label: 'Questions', type: 'repeater', span: 2, itemLabel: 'Question', addLabel: 'Add question', columns: FIELD_COLUMNS, template: () => ({ key: '', label: '', type: 'text', required: false, options: '', helpText: '' }) }
          ],
          transform: (data) => {
            const body = Object.assign({}, data);
            delete body.preset;
            body.slug = slugify(body.slug || body.name);
            body.fields = schemaFields(data.fields);
            if (!body.paymentEnabled) {
              body.paymentAmount = undefined;
              body.paymentDescription = undefined;
            }
            return body;
          }
        });
      } else if (name === 'formSettings' && form) {
        ctx.openModal({
          title: 'Form settings',
          endpoint: '/forms/' + form.id,
          method: 'PATCH',
          submitLabel: 'Save settings',
          size: 'wide',
          description: 'Change how the form is published and paid for. Use Edit fields to change the questions.',
          fields: [
            { name: 'name', label: 'Form name', required: true, value: form.name },
            { name: 'formType', label: 'Type', type: 'select', options: ['general', 'enrolment', 'medical', 'consent', 'incident', 'feedback'], value: form.form_type || 'general' },
            { name: 'description', label: 'Description', type: 'textarea', span: 2, value: form.description || '', help: 'Shown above the form. Leave a blank line between paragraphs, and wrap words in *asterisks* to make them bold.' },
            { name: 'isPublic', label: 'Public form', type: 'checkbox', value: form.is_public === true, help: 'Anyone with the link can submit. Leave off for staff-only forms.' },
            { name: 'displayOnWebsite', label: 'Show on the public website', type: 'checkbox', value: form.display_on_website !== false, help: 'Lists the form on your website’s forms page', showIf: (data) => data.isPublic === true },
            { name: 'paymentEnabled', label: 'Take a payment', type: 'checkbox', value: form.payment_enabled === true, help: 'Send the payer to PayFast after submitting' },
            { name: 'paymentRequired', label: 'Payment required', type: 'checkbox', value: form.payment_required !== false, help: 'The submission is still received if payment is skipped', showIf: (data) => data.paymentEnabled === true },
            { name: 'paymentAmount', label: 'Amount', type: 'number', min: 0, step: '0.01', value: form.payment_amount === null || form.payment_amount === undefined ? '' : form.payment_amount, placeholder: '250.00', help: 'Amount in rand, for example 250.00', showIf: (data) => data.paymentEnabled === true },
            { name: 'paymentCurrency', label: 'Currency', type: 'select', options: ['ZAR'], value: form.payment_currency || 'ZAR', showIf: (data) => data.paymentEnabled === true },
            { name: 'paymentDescription', label: 'Payment description', span: 2, value: form.payment_description || '', placeholder: 'Enrolment deposit', showIf: (data) => data.paymentEnabled === true }
          ],
          transform: (data) => {
            const body = Object.assign({}, data);
            if (!body.paymentEnabled) {
              body.paymentAmount = 0;
              body.paymentDescription = '';
            }
            return body;
          }
        });
      } else if (name === 'formFields' && form) {
        // Edit the newest saved fields, including an unpublished draft, so
        // reopening the builder never silently reverts to the live version.
        const currentFields = (((form.latest || form.current) || {}).schema_json || {}).fields || [];
        ctx.openModal({
          title: 'Edit questions',
          endpoint: '/forms/' + form.id + '/versions',
          submitLabel: 'Save new version',
          size: 'wide',
          description: 'Saving creates a new version. Publishing it replaces the version used by the public form.',
          fields: [
            { name: 'fields', label: 'Questions', type: 'repeater', span: 2, required: true, itemLabel: 'Question', addLabel: 'Add question', columns: FIELD_COLUMNS, value: editableFields(currentFields), template: () => ({ key: '', label: '', type: 'text', required: false, options: '', helpText: '' }) },
            { name: 'publish', label: 'Publish this version now', type: 'checkbox', value: form.status === 'published', help: 'The public form starts using these questions immediately' }
          ],
          transform: (data) => ({ fields: schemaFields(data.fields), publish: data.publish === true })
        });
      } else if (name === 'review' && id) {
        ctx.openModal({ title: 'Review submission', endpoint: '/forms/submissions/' + encodeURIComponent(id) + '/review', submitLabel: 'Save review', fields: [
          { name: 'decision', label: 'Decision', type: 'select', required: true, options: [
            { value: 'under_review', label: 'Mark under review' },
            { value: 'approved', label: 'Approve' },
            { value: 'rejected', label: 'Reject' },
            { value: 'archived', label: 'Archive' }
          ], value: 'approved' },
          { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }
        ] });
      } else if (name === 'consent') {
        ctx.openModal({ title: 'Record consent', endpoint: '/consent', submitLabel: 'Save consent', fields: [
          { name: 'learnerId', label: 'Child', type: 'select', required: true, options: (page.learners || []).map((l) => ({ value: l.id, label: l.first_name + ' ' + l.last_name })) },
          { name: 'consentType', label: 'Consent type', type: 'select', required: true, options: ['photographs', 'medical_treatment', 'data_processing', 'excursions', 'research'] },
          { name: 'purpose', label: 'Purpose', required: true, span: 2 },
          { name: 'status', label: 'Status', type: 'select', options: ['granted', 'pending', 'withdrawn'], value: 'granted' }
        ] });
      }
    },

    detail(ctx, name, id) {
      if (name !== 'submission') return null;
      const submission = ((ctx.page || {}).submissions || []).find((s) => s.id === id);
      if (!submission) return { title: 'Submission', html: '<p class="muted">Submission not found.</p>' };
      const data = submission.submission_data || {};
      const fieldSchema = ((((ctx.page || {}).detail || {}).latest || {}).schema_json || {}).fields || [];
      const labelFor = (key) => {
        const found = fieldSchema.find((field) => field.key === key);
        return found ? found.label : R.titleCase(key);
      };
      const valueFor = (value) => {
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (Array.isArray(value)) return R.esc(value.join(', '));
        const text = String(value);
        if (/^https?:\/\//i.test(text)) {
          return '<a href="' + R.attr(text) + '" target="_blank" rel="noopener">' + R.esc(text) + '</a>';
        }
        return R.esc(text);
      };
      const payment = submission.payment_status === 'paid'
        ? '<span class="badge badge-green">Paid</span> ' + R.esc(R.money(submission.amount_paid, 'ZAR'))
        : submission.payment_status === 'pending' ? '<span class="badge badge-sun">Pending</span>'
          : submission.payment_status === 'unavailable' ? '<span class="badge badge-danger">Payment unavailable</span>'
            : '<span class="badge badge-muted">Free</span>';
      return {
        title: 'Submission from ' + R.dateTime(submission.submitted_at),
        html: '<div class="detail-list">' +
          R.detailItem('Submitter', R.esc(submission.submitter_email || 'Anonymous')) +
          R.detailItem('Status', R.badge(submission.status)) +
          R.detailItem('Payment', payment) +
          R.detailItem('Received', R.dateTime(submission.submitted_at)) +
          R.detailItem('Reviewed', R.dateTime(submission.reviewed_at)) +
          '</div><div class="section"></div><h3>Submitted data</h3><div class="detail-list">' +
          Object.keys(data).map((key) => R.detailItem(labelFor(key), valueFor(data[key]))).join('') +
          '</div>' + (submission.review_notes ? '<h3 style="margin-top:16px">Review notes</h3><p class="muted">' + R.esc(submission.review_notes) + '</p>' : '')
      };
    }
  };
})();
