'use strict';

/* Settings: organisation profile, branches, classrooms, access and the audit log. */
(function () {
  const R = window.Reel;
  const V = R.views;

  function yesNo(value) { return value ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-muted">No</span>'; }

  V.settings = {
    async load(ctx) {
      const settled = await Promise.allSettled([
        R.api('GET', '/organisations/current'),
        R.api('GET', '/organisations/current/settings'),
        R.api('GET', '/onboarding/checklist'),
        R.api('GET', '/branches'),
        R.api('GET', '/organisation/themes')
      ]);
      const [organisation, settings, onboarding, branches, themes] = settled;
      return {
        organisation: organisation.status === 'fulfilled' ? organisation.value.data : null,
        settings: settings.status === 'fulfilled' ? settings.value.data : {},
        onboarding: onboarding.status === 'fulfilled' ? onboarding.value.data : null,
        branches: branches.status === 'fulfilled' ? branches.value.data : [],
        themes: themes.status === 'fulfilled' ? themes.value.data : { themes: [], current: null, appliedThemeId: null }
      };
    },

    render(ctx, params, page) {
      const org = page.organisation || {};
      const settings = page.settings || {};
      const branches = page.branches || [];
      const onboarding = page.onboarding || { items: [], completed: 0, total: 0 };
      const tab = ctx.tab || 'organisation';
      const canUpdate = ctx.has('organisation.update.daycare');
      const canManageSettings = ctx.has('organisation.settings.manage');
      const canManageBranches = ctx.has('branches.manage.daycare');
      const hours = settings.operatingHours || {};
      const attendance = settings.attendancePolicy || {};
      const notifications = settings.notificationPreferences || {};
      const retention = settings.dataRetention || {};
      return R.pageHead('Settings', 'How the centre is configured — the details every other screen depends on.',
        (canUpdate ? '<button class="btn btn-secondary btn-sm" @click="openNamedModal(\'organisation\')">' + R.icon('building-2') + ' Edit organisation</button>' : '') +
        (canManageBranches ? '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'branch\')">' + R.icon('plus') + ' Add branch</button>' : '')) +
        R.tabs([{ key: 'organisation', label: 'Organisation' }, { key: 'branding', label: 'Branding' }, { key: 'branches', label: 'Branches (' + branches.length + ')' }, { key: 'operations', label: 'Operations' }, { key: 'onboarding', label: 'Setup checklist' }], tab) +
        (tab === 'branches' ? this.renderBranches(ctx, page) : tab === 'branding' ? this.renderBranding(ctx, page) : tab === 'operations' ? this.renderOperations(ctx, settings, hours, attendance, notifications, retention, canManageSettings) : tab === 'onboarding' ? this.renderOnboarding(onboarding) : this.renderOrganisation(org, branches, settings));
    },

    renderOrganisation(org, branches, settings) {
      return '<div class="split"><div class="stack">' +
        R.card('Organisation profile', '<div class="detail-list">' +
          R.detailItem('Trading name', R.esc(org.name || '—')) +
          R.detailItem('Legal name', R.esc(org.legal_name || '—')) +
          R.detailItem('Registration number', R.esc(org.registration_number || '—')) +
          R.detailItem('Currency', R.esc(org.currency || 'ZAR')) +
          R.detailItem('Timezone', R.esc(org.timezone || 'Africa/Johannesburg')) +
          R.detailItem('Locale', R.esc(org.locale || 'en-ZA')) +
          R.detailItem('Public slug', '<span class="mono">' + R.esc(org.slug || '—') + '</span>') +
          R.detailItem('Status', R.badge(org.status || 'active')) +
          '</div>') +
        R.card('Branches', R.table({ rows: branches, compact: true, columns: [
          { label: 'Branch', render: (b) => '<span class="cell-strong">' + R.esc(b.name) + '</span><span class="cell-sub">' + R.esc(b.address || '') + '</span>' },
          { label: 'Learners', align: 'right', render: (b) => R.number(b.learner_count) },
          { label: 'Classrooms', align: 'right', render: (b) => R.number(b.classroom_count) },
          { label: 'Hours', render: (b) => R.esc((b.opening_time || '') + ' – ' + (b.closing_time || '')) },
          { label: 'Status', render: (b) => R.badge(b.status || 'active') }
        ], emptyTitle: 'No branches yet', emptyMessage: 'Add a branch before configuring classrooms.' }), '<button class="btn btn-sm btn-ghost" @click="setTab(\'branches\')">Manage ' + R.icon('arrow-right') + '</button>') +
        '</div><div class="stack">' +
        R.card('Configuration at a glance', '<div class="kpi-list">' +
          '<div class="kpi-row"><span class="kpi-label">Academic year</span><span class="kpi-value">' + R.number(settings.academicYear) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Opens</span><span class="kpi-value">' + R.esc((settings.operatingHours || {}).open || 'Not set') + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Closes</span><span class="kpi-value">' + R.esc((settings.operatingHours || {}).close || 'Not set') + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Public website</span><span class="kpi-value">' + yesNo((settings.publicWebsite || {}).enabled) + '</span></div>' +
          '<div class="kpi-row"><span class="kpi-label">Show fees publicly</span><span class="kpi-value">' + yesNo((settings.publicWebsite || {}).showFees) + '</span></div>' +
          '</div>') +
        R.card('Data and safety', '<p class="muted small">Learner records are retained for ' + R.number((settings.dataRetention || {}).learnerRecordsYears || 0) + ' years and financial records for ' + R.number((settings.dataRetention || {}).financeYears || 0) + ' years. Changes to these settings are audited.</p>') +
        '</div></div>';
    },

    renderBranding(ctx, page) {
      const org = page.organisation || {};
      const bundle = page.themes || {};
      const current = Object.assign({}, R.DEFAULT_THEME, bundle.current || org.theme_tokens || {});
      const themes = bundle.themes || [];
      const canUpdate = ctx.has('organisation.update.daycare');
      const swatch = (colour) => '<span class="swatch" style="background:' + R.attr(colour) + '"></span>';
      const logo = org.logo_url
        ? '<img class="logo-preview" src="' + R.attr(org.logo_url) + '" alt="Organisation logo">'
        : '<div class="logo-placeholder">' + R.icon('image') + '</div>';
      const themeCard = (theme) => {
        const tokens = Object.assign({}, R.DEFAULT_THEME, theme.tokens || {});
        const applied = bundle.appliedThemeId === theme.id;
        return '<div class="theme-card' + (applied ? ' applied' : '') + '">' +
          '<div class="row" style="justify-content:space-between"><strong>' + R.esc(theme.name) + '</strong>' +
          (applied ? '<span class="badge badge-green">Applied</span>' : (theme.is_default ? '<span class="badge badge-sky">Default</span>' : '')) + '</div>' +
          '<div class="theme-preview">' + ['primary', 'secondary', 'accent', 'background', 'surface'].map((key) =>
            '<span style="background:' + R.attr(tokens[key] || R.DEFAULT_THEME[key]) + '"></span>').join('') + '</div>' +
          '<div class="swatch-row">' + ['primary', 'secondary', 'accent'].map((key) => swatch(tokens[key])).join('') + '</div>' +
          (canUpdate ? '<div class="row" style="gap:8px;flex-wrap:wrap">' +
            (!applied ? '<button class="btn btn-sm btn-primary" @click="applyOrganisationTheme(\'' + R.attr(theme.id) + '\')">Apply</button>' : '') +
            '<button class="btn btn-sm btn-ghost" @click="confirmAction(\'Delete theme\',\'This removes the saved palette. The applied colours stay until another theme is applied.\',\'/organisation/themes/' + R.attr(theme.id) + '\',{method:\'DELETE\',submitLabel:\'Delete\',successMessage:\'Theme deleted\'})">Delete</button>' +
            '</div>' : '') +
          '</div>';
      };
      return '<div class="split"><div class="stack">' +
        R.card('Logo', '<div class="row" style="gap:16px;align-items:flex-start">' + logo +
          '<div style="flex:1"><p class="muted small">Your logo appears on the workspace, the public website and email accents. Images and videos are stored in Cloudflare R2; only the file URL is saved in the database.</p>' +
          (canUpdate ? '<div class="btn-group" style="margin-top:10px"><button class="btn btn-sm btn-primary" @click="openNamedModal(\'logo\')">' + R.icon('upload') + ' Upload logo</button>' +
            '<button class="btn btn-sm btn-secondary" @click="extractLogoPalette()">' + R.icon('palette') + ' Extract colours</button></div>' : '') +
          '</div></div>') +
        R.card('Current palette', '<div class="swatch-row" style="margin-bottom:12px">' +
          ['primary', 'secondary', 'accent', 'background', 'surface', 'text'].map((key) =>
            swatch(current[key]) + '<span class="mono small">' + R.esc(current[key]) + '</span>').join('') + '</div>' +
          '<div class="detail-list">' +
          R.detailItem('Primary', '<span class="mono">' + R.esc(current.primary) + '</span>') +
          R.detailItem('Secondary', '<span class="mono">' + R.esc(current.secondary) + '</span>') +
          R.detailItem('Accent', '<span class="mono">' + R.esc(current.accent) + '</span>') +
          R.detailItem('Text on primary', '<span class="mono">' + R.esc(current.onPrimary) + '</span>') +
          '</div>', canUpdate ? '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'branding\')">' + R.icon('pencil') + ' Edit colours</button>' : '') +
        '</div><div class="stack">' +
        R.card('Saved themes (' + themes.length + ')', themes.length ? '<div class="stack">' + themes.map(themeCard).join('') + '</div>' :
          R.emptyState('No saved themes', 'Create a palette or extract one from your logo.', canUpdate ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'theme\')">Create theme</button>' : '', 'palette'),
          canUpdate ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'theme\')">' + R.icon('plus') + ' New theme</button>' : '') +
        R.card('How branding works', '<p class="muted small">Colours are validated hex tokens, not free CSS. Applying a theme updates the workspace, the public website and email accents for this organisation only. Themes are tenant-scoped and audited.</p>') +
        '</div></div>';
    },

    renderBranches(ctx, page) {
      const canManage = ctx.has('branches.manage.daycare');
      const branches = page.branches || [];
      return '<div class="grid grid-2">' + branches.map((b) => R.card(b.name,
        (b.image_url ? '<img class="cover-image" src="' + R.attr(b.image_url) + '" alt="' + R.attr(b.name) + '" style="margin-bottom:12px">' : '') +
        '<div class="row" style="margin-bottom:8px">' + R.badge(b.status || 'active') +
        '<span class="badge badge-muted">' + R.esc(b.slug) + '</span></div>' +
        '<div class="detail-list">' +
        R.detailItem('Address', R.esc(b.address || '—')) +
        R.detailItem('Email', R.esc(b.contact_email || '—')) +
        R.detailItem('Phone', R.esc(b.contact_phone || '—')) +
        R.detailItem('Hours', R.esc((b.opening_time || '06:30') + ' – ' + (b.closing_time || '18:00'))) +
        R.detailItem('Learners', R.number(b.learner_count)) +
        R.detailItem('Classrooms', R.number(b.classroom_count)) +
        '</div>',
        canManage ? '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'editBranch\',\'' + R.attr(b.id) + '\')">Edit</button>' : '')).join('') + '</div>' +
        (branches.length ? '' : R.emptyState('No branches', 'Every learner, classroom and invoice belongs to a branch.', canManage ? '<button class="btn btn-primary" @click="openNamedModal(\'branch\')">Add branch</button>' : '', 'building-2'));
    },

    renderOperations(ctx, settings, hours, attendance, notifications, retention, canManage) {
      return '<div class="split"><div class="stack">' +
        R.card('Operating hours', '<div class="detail-list">' +
          R.detailItem('Opens', R.esc(hours.open || 'Not set')) +
          R.detailItem('Closes', R.esc(hours.close || 'Not set')) +
          R.detailItem('Late after', R.esc(attendance.lateAfter || 'Not set')) +
          R.detailItem('Auto-absent after', R.esc(attendance.autoAbsentAfter || 'Not set')) +
          R.detailItem('Allow excused absence', yesNo(attendance.allowExcusedAbsence)) +
          R.detailItem('Academic year', R.number(settings.academicYear)) +
          '</div>', canManage ? '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'operations\')">Edit</button>' : '') +
        R.card('Notification preferences', '<div class="detail-list">' +
          R.detailItem('Email announcements', yesNo(notifications.emailAnnouncements)) +
          R.detailItem('Email invoices', yesNo(notifications.emailInvoices)) +
          R.detailItem('SMS incidents', yesNo(notifications.smsIncidents)) +
          '</div>') +
        '</div><div class="stack">' +
        R.card('Retention', '<div class="detail-list">' +
          R.detailItem('Learner records', R.number(retention.learnerRecordsYears) + ' years') +
          R.detailItem('Financial records', R.number(retention.financeYears) + ' years') +
          '</div><p class="muted small" style="margin-top:10px">Retention is a legal obligation, not a preference. Shortening it can destroy records you are required to keep.</p>') +
        R.card('Public website settings', '<div class="detail-list">' +
          R.detailItem('Website enabled', yesNo((settings.publicWebsite || {}).enabled)) +
          R.detailItem('Show fees', yesNo((settings.publicWebsite || {}).showFees)) +
          '</div>') +
        '</div></div>';
    },

    renderOnboarding(onboarding) {
      const items = onboarding.items || [];
      const pct = onboarding.total ? Math.round((onboarding.completed / onboarding.total) * 100) : 0;
      return R.card('Setup checklist', '<div class="metric-bar"><span>Completed</span><div class="bar"><span style="width:' + pct + '%"></span></div><span class="val">' + onboarding.completed + '/' + onboarding.total + '</span></div>' +
        '<div class="section"></div><div class="stack">' + items.map((item) => '<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle)">' +
          '<div class="row" style="gap:10px">' + R.icon(item.complete ? 'check-circle' : 'circle', item.complete ? 'text-green' : 'muted') + '<span>' + R.esc(item.label) + '</span></div>' +
          (item.complete ? '<span class="badge badge-green">Done</span>' : '<span class="badge badge-sun">To do</span>') + '</div>').join('') + '</div>');
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      const org = page.organisation || {};
      const settings = page.settings || {};
      const hours = settings.operatingHours || {};
      const attendance = settings.attendancePolicy || {};
      const notifications = settings.notificationPreferences || {};
      const retention = settings.dataRetention || {};
      if (name === 'organisation') {
        ctx.openModal({
          title: 'Edit organisation', endpoint: '/organisations/current', method: 'PATCH', submitLabel: 'Save organisation', size: 'wide',
          fields: [
            { name: 'name', label: 'Trading name', required: true, value: org.name || '' },
            { name: 'legalName', label: 'Legal name', value: org.legal_name || '' },
            { name: 'registrationNumber', label: 'Registration number', value: org.registration_number || '' },
            { name: 'logoUrl', label: 'Logo', type: 'media', scope: 'branding', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif', value: org.logo_url || '', span: 2 },
            { name: 'primaryColour', label: 'Primary colour', type: 'colour', value: org.primary_colour || '#3A7D44' },
            { name: 'timezone', label: 'Timezone', value: org.timezone || 'Africa/Johannesburg' },
            { name: 'currency', label: 'Currency', value: org.currency || 'ZAR' },
            { name: 'locale', label: 'Locale', value: org.locale || 'en-ZA' }
          ]
        });
      } else if (name === 'logo') {
        ctx.openModal({
          title: 'Upload logo', endpoint: '/organisations/current', method: 'PATCH', submitLabel: 'Save logo', size: 'wide',
          description: 'Use a square or wide logo with a transparent or solid background. It is stored in R2 and only its URL is saved.',
          fields: [
            { name: 'logoUrl', label: 'Logo', type: 'media', scope: 'branding', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif', value: org.logo_url || '', span: 2, help: 'PNG, JPG, WEBP, GIF or AVIF up to 15 MB.' }
          ],
          transform: (data) => ({ logoUrl: data.logoUrl })
        });
      } else if (name === 'branding') {
        const current = Object.assign({}, R.DEFAULT_THEME, (page.themes || {}).current || {});
        ctx.openModal({
          title: 'Edit brand colours', endpoint: '/organisations/current', method: 'PATCH', submitLabel: 'Save colours', size: 'wide',
          description: 'These colours drive buttons, navigation, badges and the public website. Text on primary is calculated for contrast.',
          fields: [
            { name: 'primaryColour', label: 'Primary', type: 'colour', value: current.primary, required: true },
            { name: 'secondaryColour', label: 'Secondary', type: 'colour', value: current.secondary, required: true },
            { name: 'accentColour', label: 'Accent', type: 'colour', value: current.accent, required: true },
            { name: 'background', label: 'Page background', type: 'colour', value: current.background },
            { name: 'surface', label: 'Card surface', type: 'colour', value: current.surface },
            { name: 'text', label: 'Text', type: 'colour', value: current.text }
          ],
          transform: (data) => ({
            primaryColour: data.primaryColour,
            secondaryColour: data.secondaryColour,
            accentColour: data.accentColour,
            themeTokens: {
              primary: data.primaryColour, secondary: data.secondaryColour, accent: data.accentColour,
              background: data.background, surface: data.surface, text: data.text
            }
          })
        });
      } else if (name === 'theme') {
        const current = Object.assign({}, R.DEFAULT_THEME, (page.themes || {}).current || {});
        ctx.openModal({
          title: 'New theme', endpoint: '/organisation/themes', submitLabel: 'Save theme', size: 'wide',
          description: 'Saved themes can be applied to the whole organisation at any time.',
          fields: [
            { name: 'name', label: 'Theme name', required: true, placeholder: 'Summer palette' },
            { name: 'isDefault', label: 'Make this the default theme', type: 'checkbox', value: false, help: 'Highlight this theme in the list' },
            { name: 'primary', label: 'Primary', type: 'colour', value: current.primary, required: true },
            { name: 'secondary', label: 'Secondary', type: 'colour', value: current.secondary, required: true },
            { name: 'accent', label: 'Accent', type: 'colour', value: current.accent, required: true },
            { name: 'background', label: 'Background', type: 'colour', value: current.background },
            { name: 'surface', label: 'Surface', type: 'colour', value: current.surface },
            { name: 'text', label: 'Text', type: 'colour', value: current.text }
          ],
          transform: (data) => ({
            name: data.name,
            isDefault: data.isDefault === true,
            tokens: {
              primary: data.primary, secondary: data.secondary, accent: data.accent,
              background: data.background, surface: data.surface, text: data.text
            }
          })
        });
      } else if (name === 'operations') {
        ctx.openModal({
          title: 'Operating settings', endpoint: '/organisations/current/settings', method: 'PATCH', submitLabel: 'Save settings', size: 'wide',
          fields: [
            { name: 'academicYear', label: 'Academic year', type: 'number', value: settings.academicYear || new Date().getFullYear() },
            { name: 'open', label: 'Opens', value: hours.open || '06:30' },
            { name: 'close', label: 'Closes', value: hours.close || '18:00' },
            { name: 'lateAfter', label: 'Late after', value: attendance.lateAfter || '08:30' },
            { name: 'autoAbsentAfter', label: 'Auto-absent after', value: attendance.autoAbsentAfter || '10:00' },
            { name: 'allowExcusedAbsence', label: 'Allow excused absence', type: 'checkbox', value: attendance.allowExcusedAbsence !== false },
            { name: 'emailAnnouncements', label: 'Email announcements', type: 'checkbox', value: notifications.emailAnnouncements !== false },
            { name: 'emailInvoices', label: 'Email invoices', type: 'checkbox', value: notifications.emailInvoices !== false },
            { name: 'smsIncidents', label: 'SMS incidents', type: 'checkbox', value: notifications.smsIncidents === true },
            { name: 'showFees', label: 'Show fees publicly', type: 'checkbox', value: (settings.publicWebsite || {}).showFees === true },
            { name: 'learnerRecordsYears', label: 'Learner record retention (years)', type: 'number', value: retention.learnerRecordsYears || 7 },
            { name: 'financeYears', label: 'Financial record retention (years)', type: 'number', value: retention.financeYears || 7 }
          ],
          transform: (data) => ({
            settings: {
              academicYear: Number(data.academicYear),
              operatingHours: { open: data.open, close: data.close },
              attendancePolicy: { lateAfter: data.lateAfter, autoAbsentAfter: data.autoAbsentAfter, allowExcusedAbsence: data.allowExcusedAbsence === true },
              notificationPreferences: { emailAnnouncements: data.emailAnnouncements === true, emailInvoices: data.emailInvoices === true, smsIncidents: data.smsIncidents === true },
              publicWebsite: { enabled: true, showFees: data.showFees === true },
              dataRetention: { learnerRecordsYears: Number(data.learnerRecordsYears), financeYears: Number(data.financeYears) }
            }
          })
        });
      } else if (name === 'branch') {
        ctx.openModal({
          title: 'Add branch', endpoint: '/branches', submitLabel: 'Create branch', size: 'wide',
          fields: [
            { name: 'name', label: 'Branch name', required: true },
            { name: 'slug', label: 'Slug', required: true, placeholder: 'rosebank' },
            { name: 'address', label: 'Address', span: 2 },
            { name: 'contactEmail', label: 'Contact email', type: 'email' },
            { name: 'contactPhone', label: 'Contact phone' },
            { name: 'imageUrl', label: 'Branch photo', type: 'media', scope: 'branch-image', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif', span: 2 },
            { name: 'openingTime', label: 'Opening time', value: '06:30' },
            { name: 'closingTime', label: 'Closing time', value: '18:00' }
          ]
        });
      } else if (name === 'editBranch' && id) {
        const branch = (page.branches || []).find((b) => b.id === id) || {};
        ctx.openModal({
          title: 'Edit branch', endpoint: '/branches/' + id, method: 'PATCH', submitLabel: 'Save branch', size: 'wide',
          fields: [
            { name: 'name', label: 'Branch name', required: true, value: branch.name || '' },
            { name: 'status', label: 'Status', type: 'select', value: branch.status || 'active', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
            { name: 'address', label: 'Address', span: 2, value: branch.address || '' },
            { name: 'contactEmail', label: 'Contact email', type: 'email', value: branch.contact_email || '' },
            { name: 'contactPhone', label: 'Contact phone', value: branch.contact_phone || '' },
            { name: 'imageUrl', label: 'Branch photo', type: 'media', scope: 'branch-image', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif', value: branch.image_url || '', span: 2 },
            { name: 'openingTime', label: 'Opening time', value: branch.opening_time || '06:30' },
            { name: 'closingTime', label: 'Closing time', value: branch.closing_time || '18:00' }
          ]
        });
      }
    }
  };

  V.classrooms = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.branchId) query.set('branchId', ctx.filters.branchId);
      const [classrooms, branches] = await Promise.all([
        R.api('GET', '/classrooms' + (query.toString() ? '?' + query : '')).then((p) => p.data).catch(() => []),
        ctx.has('organisation.read.daycare')
          ? R.api('GET', '/branches').then((p) => p.data).catch(() => [])
          : Promise.resolve((ctx.branches || []).map((b) => Object.assign({}, b, { name: b.name })))
      ]);
      return { rows: classrooms || [], branches: branches || [] };
    },

    render(ctx, params, page) {
      const rows = page.rows || [];
      const canManage = ctx.has('classrooms.manage.daycare');
      const capacity = rows.reduce((sum, r) => sum + Number(r.configured_capacity || 0), 0);
      const enrolled = rows.reduce((sum, r) => sum + Number(r.enrolled || 0), 0);
      return R.pageHead('Classrooms', 'Rooms, age groups and how full each one is.',
        canManage ? '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'classroom\')">' + R.icon('plus') + ' Add classroom</button>' : '') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Classrooms', value: R.number(rows.length), icon: 'door-open', foot: 'Active rooms' }) +
        R.statCard({ label: 'Enrolled', value: R.number(enrolled), icon: 'users', tone: 'sky', foot: 'Across these rooms' }) +
        R.statCard({ label: 'Capacity', value: R.number(capacity), icon: 'maximize', tone: 'plum', foot: 'Configured places' }) +
        R.statCard({ label: 'Utilisation', value: R.percent(capacity ? Math.round((enrolled / capacity) * 100) : 0), icon: 'gauge', tone: capacity && enrolled > capacity ? 'danger' : 'green', foot: 'Enrolled ÷ capacity' }) +
        '</div>' +
        R.filterBar(R.selectFilter(ctx, 'branchId', R.branchOptions(ctx), 'All branches')) +
        '<div class="grid grid-3 section">' + rows.map((c) => R.card(c.name,
          '<div class="row" style="margin-bottom:8px">' + R.badge(c.status || 'active') +
          '<span class="badge badge-muted">' + R.esc(c.branch_name || '') + '</span>' +
          '<span class="badge badge-sky">' + R.esc(c.age_group || '') + '</span></div>' +
          '<div class="metric-bar"><span>Filled</span><div class="bar"><span style="width:' + Math.min(100, Number(c.utilisation || 0)) + '%"></span></div><span class="val">' + R.number(c.enrolled) + '/' + R.number(c.configured_capacity) + '</span></div>' +
          '<div class="detail-list" style="margin-top:12px">' +
          R.detailItem('Age range', R.number(c.min_age_months) + '–' + R.number(c.max_age_months) + ' months') +
          R.detailItem('Staff assigned', R.number(c.staff_count)) +
          '</div>',
          canManage ? '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'editClassroom\',\'' + R.attr(c.id) + '\')">Edit</button>' : '')).join('') + '</div>' +
        (rows.length ? '' : R.emptyState('No classrooms', 'A classroom groups children, staff and observations.', canManage ? '<button class="btn btn-primary" @click="openNamedModal(\'classroom\')">Add classroom</button>' : '', 'door-open'));
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      if (name === 'classroom') {
        ctx.openModal({
          title: 'Add classroom', endpoint: '/classrooms', submitLabel: 'Create classroom', size: 'wide',
          fields: [
            { name: 'branchId', label: 'Branch', type: 'select', required: true, options: R.branchOptions(ctx) },
            { name: 'name', label: 'Classroom name', required: true },
            { name: 'ageGroup', label: 'Age group', required: true, placeholder: 'Toddlers' },
            { name: 'minAgeMonths', label: 'Minimum age (months)', type: 'number', value: 18 },
            { name: 'maxAgeMonths', label: 'Maximum age (months)', type: 'number', value: 36 },
            { name: 'configuredCapacity', label: 'Capacity', type: 'number', required: true, value: 20 }
          ]
        });
      } else if (name === 'editClassroom' && id) {
        const classroom = (page.rows || []).find((c) => c.id === id) || {};
        ctx.openModal({
          title: 'Edit classroom', endpoint: '/classrooms/' + id, method: 'PATCH', submitLabel: 'Save classroom',
          fields: [
            { name: 'name', label: 'Classroom name', required: true, value: classroom.name || '' },
            { name: 'ageGroup', label: 'Age group', value: classroom.age_group || '' },
            { name: 'configuredCapacity', label: 'Capacity', type: 'number', value: classroom.configured_capacity || 0 },
            { name: 'status', label: 'Status', type: 'select', value: classroom.status || 'active', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] }
          ]
        });
      }
    }
  };

  V.access = {
    async load(ctx) {
      const query = new URLSearchParams();
      if (ctx.filters.q) query.set('q', ctx.filters.q);
      const settled = await Promise.allSettled([
        R.api('GET', '/access/memberships' + (query.toString() ? '?' + query : '')),
        R.api('GET', '/access/roles'),
        R.api('GET', '/access/delegations')
      ]);
      const [memberships, roles, delegations] = settled;
      return {
        rows: memberships.status === 'fulfilled' ? memberships.value.data : [],
        roles: roles.status === 'fulfilled' ? roles.value.data : [],
        delegations: delegations.status === 'fulfilled' ? delegations.value.data : []
      };
    },

    render(ctx, params, page) {
      const tab = ctx.tab || 'members';
      const rows = page.rows || [];
      const roles = (page.roles || []).filter((r) => r.scope_type !== 'platform');
      const delegations = page.delegations || [];
      const canManage = ctx.has('access.manage.daycare');
      return R.pageHead('Users and access', 'Who can see and do what — and the proof of how that changed.',
        canManage ? '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'invite\')">' + R.icon('user-plus') + ' Invite someone</button>' : '') +
        '<div class="grid grid-4 section">' +
        R.statCard({ label: 'Members', value: R.number(rows.length), icon: 'users', foot: R.number(rows.filter((m) => m.status === 'active').length) + ' active' }) +
        R.statCard({ label: 'Roles', value: R.number(roles.length), icon: 'shield-check', tone: 'sky', foot: 'Assignable in this organisation' }) +
        R.statCard({ label: 'Delegations', value: R.number(delegations.filter((d) => !d.revoked_at).length), icon: 'handshake', tone: 'plum', foot: 'Time-limited grants' }) +
        R.statCard({ label: 'Suspended', value: R.number(rows.filter((m) => m.status !== 'active').length), icon: 'user-x', tone: rows.some((m) => m.status !== 'active') ? 'sun' : 'green', foot: 'Access withdrawn' }) +
        '</div>' +
        R.tabs([{ key: 'members', label: 'Members (' + rows.length + ')' }, { key: 'roles', label: 'Roles (' + roles.length + ')' }, { key: 'delegations', label: 'Delegations (' + delegations.length + ')' }], tab) +
        (tab === 'roles' ? this.renderRoles(roles) : tab === 'delegations' ? this.renderDelegations(ctx, delegations, rows, canManage) : this.renderMembers(ctx, rows, canManage));
    },

    renderMembers(ctx, rows, canManage) {
      return R.filterBar(R.searchFilter(ctx, 'q', 'Search by name or email…')) +
        R.table({ rows, columns: [
          { label: 'Person', render: (m) => '<div class="row" style="gap:10px"><div class="avatar">' + R.esc(R.initials(m.display_name)) + '</div><div><span class="cell-strong">' + R.esc(m.display_name) + '</span><span class="cell-sub">' + R.esc(m.email) + '</span></div></div>' },
          { label: 'Roles', render: (m) => (m.roles || []).length ? (m.roles || []).map((r) => '<span class="badge badge-sky">' + R.esc(R.titleCase(r.role)) + '</span>' + (r.branchId ? '<span class="badge badge-muted">branch</span>' : '')).join(' ') : '<span class="muted">No role</span>' },
          { label: 'Status', render: (m) => R.badge(m.status) },
          { label: 'Joined', render: (m) => R.date(m.joined_at) },
          { label: 'Last login', render: (m) => m.last_login_at ? R.relative(m.last_login_at) : 'Never' },
          { label: '', align: 'right', render: (m) => canManage ? '<div class="btn-group">' +
            '<button class="btn btn-sm btn-secondary" @click="openNamedModal(\'assignRole\',\'' + R.attr(m.id) + '\')">Add role</button>' +
            (m.status === 'active' ? '<button class="btn btn-sm btn-ghost" @click="confirmAction(\'Suspend access\',\'This person will be signed out and cannot sign in again until reactivated.\',\'/access/memberships/' + R.attr(m.id) + '\',{method:\'PATCH\',body:{status:\'suspended\'},submitLabel:\'Suspend\',successMessage:\'Access suspended\'})">Suspend</button>' :
              '<button class="btn btn-sm btn-ghost" @click="act(\'PATCH\',\'/access/memberships/' + R.attr(m.id) + '\',{status:\'active\'},{successMessage:\'Access restored\'})">Restore</button>') +
            '</div>' : '' }
        ], emptyTitle: 'No members found', emptyMessage: 'Invite a colleague to give them access.' });
    },

    renderRoles(roles) {
      return '<div class="grid grid-2">' + roles.map((r) => R.card(r.name,
        '<div class="row" style="margin-bottom:8px">' + R.badge(r.scope_type) +
        '<span class="badge badge-muted mono">' + R.esc(r.role_key) + '</span></div>' +
        '<p class="muted small">' + R.esc(r.description || 'No description recorded.') + '</p>' +
        '<div class="muted small">' + R.number(r.permission_count) + ' permissions</div>')).join('') + '</div>' +
        (roles.length ? '' : R.emptyState('No roles', 'Roles are seeded with the platform.', '', 'shield-check'));
    },

    renderDelegations(ctx, delegations, members, canManage) {
      return R.table({ rows: delegations, columns: [
        { label: 'Grantee', render: (d) => '<span class="cell-strong">' + R.esc(d.grantee_name || '—') + '</span><span class="cell-sub">from ' + R.esc(d.grantor_name || '—') + '</span>' },
        { label: 'Reason', render: (d) => R.esc(d.reason || '—') },
        { label: 'Expires', render: (d) => R.dateTime(d.expires_at) },
        { label: 'Status', render: (d) => d.revoked_at ? R.badge('revoked') : (new Date(d.expires_at) < new Date() ? R.badge('expired') : R.badge('active')) },
        { label: '', align: 'right', render: (d) => canManage && !d.revoked_at && new Date(d.expires_at) > new Date() ? '<button class="btn btn-sm btn-ghost" @click="confirmAction(\'Revoke delegation\',\'The extra permissions stop immediately.\',\'/access/delegations/' + R.attr(d.id) + '/revoke\',{submitLabel:\'Revoke\',successMessage:\'Delegation revoked\'})">Revoke</button>' : '' }
      ], emptyTitle: 'No delegations', emptyMessage: 'Delegations grant specific permissions for a limited time, with a reason attached.' },
        canManage ? '<button class="btn btn-sm btn-primary" @click="openNamedModal(\'delegation\')">' + R.icon('plus') + ' Create delegation</button>' : '');
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      const roles = (page.roles || []).filter((r) => r.scope_type !== 'platform');
      const members = page.rows || [];
      if (name === 'invite') {
        ctx.openModal({
          title: 'Invite someone', endpoint: '/access/invitations', submitLabel: 'Send invitation', size: 'wide',
          description: 'They receive a single-use link valid for seven days. Nothing is granted until they accept.',
          fields: [
            { name: 'displayName', label: 'Full name', required: true },
            { name: 'email', label: 'Email address', type: 'email', required: true },
            { name: 'roleKey', label: 'Role', type: 'select', required: true, options: roles.map((r) => ({ value: r.role_key, label: r.name })) },
            { name: 'branchId', label: 'Branch (optional)', type: 'select', options: R.branchOptions(ctx) }
          ]
        });
      } else if (name === 'assignRole' && id) {
        ctx.openModal({
          title: 'Add a role', endpoint: '/access/memberships/' + id + '/roles', submitLabel: 'Assign role',
          fields: [
            { name: 'roleKey', label: 'Role', type: 'select', required: true, options: roles.map((r) => ({ value: r.role_key, label: r.name })) },
            { name: 'branchId', label: 'Limit to branch', type: 'select', options: R.branchOptions(ctx) },
            { name: 'expiresAt', label: 'Expires at', type: 'datetime-local' }
          ]
        });
      } else if (name === 'delegation') {
        ctx.openModal({
          title: 'Create delegation', endpoint: '/access/delegations', submitLabel: 'Create delegation', size: 'wide',
          description: 'You can only delegate permissions you already hold. Delegations expire automatically.',
          fields: [
            { name: 'granteeUserId', label: 'Grant to', type: 'select', required: true, options: members.filter((m) => m.user_id).map((m) => ({ value: m.user_id, label: m.display_name + ' · ' + m.email })) },
            { name: 'expiresAt', label: 'Expires at', type: 'datetime-local', required: true },
            { name: 'permissionKeys', label: 'Permissions', required: true, span: 2, placeholder: 'finance.read.daycare, finance.reports.daycare', help: 'Comma-separated permission keys you already hold.' },
            { name: 'reason', label: 'Reason', type: 'textarea', required: true, span: 2 },
            { name: 'branchId', label: 'Limit to branch', type: 'select', options: R.branchOptions(ctx) }
          ],
          transform: (data) => ({
            granteeUserId: data.granteeUserId,
            expiresAt: data.expiresAt,
            branchId: data.branchId || null,
            reason: data.reason,
            permissions: String(data.permissionKeys || '').split(',').map((p) => p.trim()).filter(Boolean)
          })
        });
      }
    }
  };

  V.audit = {
    async load(ctx) {
      const query = new URLSearchParams({ page: ctx.filters.page || '1', pageSize: '30' });
      if (ctx.filters.action) query.set('action', ctx.filters.action);
      const payload = await R.api('GET', '/audit?' + query).then((p) => p).catch(() => ({ data: [], meta: {} }));
      return { rows: payload.data || [], meta: payload.meta || {} };
    },

    render(ctx, params, page) {
      return R.pageHead('Audit log', 'An append-only record of who did what, when and from where.',
        '<button class="btn btn-secondary btn-sm" @click="exportCurrentCsv(\'audit-log.csv\',[\'occurred_at\',\'actor_name\',\'action\',\'resource_type\'],[\'When\',\'Actor\',\'Action\',\'Resource\'])\">' + R.icon('download') + ' Export view</button>') +
        R.filterBar(R.searchFilter(ctx, 'action', 'Filter by action, e.g. invoice.')) +
        R.table({ rows: page.rows || [], columns: [
          { label: 'When', render: (a) => '<span class="cell-strong">' + R.dateTime(a.occurred_at) + '</span><span class="cell-sub">' + R.relative(a.occurred_at) + '</span>' },
          { label: 'Actor', render: (a) => R.esc(a.actor_name || 'System') },
          { label: 'Action', render: (a) => '<span class="mono small">' + R.esc(a.action) + '</span>' },
          { label: 'Resource', render: (a) => R.esc(R.titleCase(a.resource_type || '—')) + (a.resource_id ? '<span class="cell-sub mono">' + R.esc(String(a.resource_id).slice(0, 8)) + '</span>' : '') },
          { label: 'Context', render: (a) => '<span class="muted small">' + R.esc(R.truncate(JSON.stringify(a.metadata || {}), 70)) + '</span>' },
          { label: '', align: 'right', render: (a) => '<button class="btn btn-sm btn-ghost" @click="openNamedModal(\'auditView\',\'' + R.attr(a.id) + '\')">Details</button>' }
        ], emptyTitle: 'No audit events', emptyMessage: 'Every change is recorded here as it happens.' }) +
        R.pager(page.meta, "setFilter('page', " + Math.max(1, (page.meta.page || 1) - 1) + ")", "setFilter('page', " + Math.min(page.meta.totalPages || 1, (page.meta.page || 1) + 1) + ")");
    },

    openModal(ctx, name, id) {
      if (name === 'auditView' && id) {
        const row = ((ctx.page || {}).rows || []).find((a) => a.id === id);
        if (!row) { ctx.toast('That audit event is no longer in view.', 'warn'); return; }
        const html = '<div class="detail-list">' +
          R.detailItem('When', R.dateTime(row.occurred_at)) +
          R.detailItem('Actor', R.esc(row.actor_name || 'System')) +
          R.detailItem('Action', '<span class="mono">' + R.esc(row.action) + '</span>') +
          R.detailItem('Resource type', R.esc(row.resource_type || '—')) +
          R.detailItem('Resource id', '<span class="mono small">' + R.esc(row.resource_id || '—') + '</span>') +
          R.detailItem('Branch id', '<span class="mono small">' + R.esc(row.branch_id || '—') + '</span>') +
          '</div><div class="section"></div><h3>Metadata</h3><pre class="mono small" style="white-space:pre-wrap;background:var(--surface-2);padding:12px;border-radius:8px">' + R.esc(R.json(row.metadata || {})) + '</pre>';
        ctx.openDetail('Audit event', html);
      }
    }
  };
})();
