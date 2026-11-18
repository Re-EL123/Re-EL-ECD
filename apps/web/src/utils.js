'use strict';

/* Global helpers shared by every view. Classic script: attaches to window.Reel. */
(function () {
  const Reel = window.Reel = window.Reel || {};

  class ApiError extends Error {
    constructor(message, code, status, details) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }

  // When the frontend is hosted separately (for example GitHub Pages) set
  // window.REEL_API_BASE to the API origin in config.js. Same-origin deployments
  // leave it empty and everything keeps working unchanged.
  const API_BASE = String(window.REEL_API_BASE || '').replace(/\/+$/, '');
  let csrfToken = null;

  function setCsrf(token) {
    csrfToken = token || null;
  }

  function apiBase() {
    return API_BASE;
  }

  const DEFAULT_PLATFORM_HOSTS = ['ecd.re-el.co.za', 'www.re-el.co.za', 're-el.co.za'];

  /**
   * A custom website domain is any host that is not the product's own address.
   * The list can be extended at deploy time with window.REEL_PLATFORM_HOSTS.
   */
  function isPlatformHost(host) {
    const value = String(host || (typeof location !== 'undefined' ? location.hostname : '')).trim().toLowerCase();
    if (!value) return true;
    const configured = Array.isArray(window.REEL_PLATFORM_HOSTS)
      ? window.REEL_PLATFORM_HOSTS.map((entry) => String(entry).toLowerCase())
      : DEFAULT_PLATFORM_HOSTS;
    if (configured.includes(value)) return true;
    if (value === 'localhost' || value === '127.0.0.1' || value === '::1') return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
    if (value.endsWith('.vercel.app') || value.endsWith('.github.io') || value.endsWith('.onrender.com')) return true;
    return false;
  }

  function readCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function activeOrg() {
    try { return localStorage.getItem('reel.activeOrganisation') || null; } catch { return null; }
  }

  async function api(method, path, body, options) {
    const opts = options || {};
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrf = csrfToken || readCookie('reel_csrf');
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    const org = opts.organisationId !== undefined ? opts.organisationId : activeOrg();
    if (org) headers['X-Organisation-Id'] = org;
    // Public website endpoints are answered with `Access-Control-Allow-Origin: *`
    // so any tenant domain can read them. A browser refuses to combine that
    // wildcard with credentials, so those calls must not send the session
    // cookie. They are unauthenticated and never need it.
    const isPublicPath = /^\/public(\/|$)/.test(path);
    const response = await fetch(API_BASE + '/api/v1' + path, {
      method,
      headers,
      credentials: API_BASE && !isPublicPath ? 'include' : 'same-origin',
      body: body === undefined || body === null ? undefined : JSON.stringify(body)
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (!response.ok) throw new ApiError('The server returned an unexpected response.', 'BAD_RESPONSE', response.status);
      return null;
    }
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const error = (payload && payload.error) || {};
      throw new ApiError(error.message || 'The request failed.', error.code || 'ERROR', response.status, error.details);
    }
    return payload;
  }

  function exportButtons(path, params) {
    const base = path + (params ? (path.includes('?') ? '&' : '?') + params : '');
    const withFormat = (format) => base + (base.includes('?') ? '&' : '?') + 'format=' + format;
    const item = (format, label, iconName) =>
      '<button type="button" class="btn btn-sm btn-secondary" @click="downloadExport(' + attr(JSON.stringify(withFormat(format))) + ')" title="Download ' + esc(label) + '">' +
      icon(iconName) + ' ' + esc(label) + '</button>';
    return '<span class="export-buttons" role="group" aria-label="Export">' +
      item('csv', 'CSV', 'file-text') + item('xlsx', 'Excel', 'file-spreadsheet') + item('pdf', 'PDF', 'file-badge') +
      '</span>';
  }

  function download(path) {
    const org = activeOrg();
    const url = API_BASE + '/api/v1' + path + (path.includes('?') ? '&' : '?') + (org ? 'organisationId=' + encodeURIComponent(org) : '');
    window.open(url, '_blank', 'noopener');
  }

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function attr(value) { return esc(value); }

  /**
   * A JS string literal safe to embed inside a double-quoted HTML attribute
   * that Alpine then evaluates. Produces a double-quoted JS string with HTML
   * entities for the surrounding attribute — the HTML parser decodes the
   * entities, Alpine sees a well-formed string literal, and nothing from the
   * value can break out of either context.
   */
  function jsString(value) {
    const json = JSON.stringify(String(value == null ? '' : value));
    return json.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  /**
   * Minimal, safe inline formatting for tenant-authored copy. Everything is
   * escaped first, then *asterisks* become bold. Two asterisks work too, so
   * people who reach for Markdown are not surprised.
   */
  function richText(value) {
    const escaped = esc(value);
    return escaped
      .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
  }

  /**
   * Paragraph-aware rich text. A blank line starts a new paragraph and a
   * single newline becomes a line break, so long descriptions stay readable
   * instead of collapsing into one wall of text.
   */
  function richParagraphs(value, className) {
    const raw = String(value === null || value === undefined ? '' : value).replace(/\r\n/g, '\n').trim();
    if (!raw) return '';
    const cls = className ? ' class="' + attr(className) + '"' : '';
    return raw.split(/\n{2,}/).map((block) =>
      '<p' + cls + '>' + richText(block).replace(/\n/g, '<br>') + '</p>'
    ).join('');
  }

  function titleCase(value) {
    if (value === null || value === undefined || value === '') return '';
    return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  }

  function money(value, currency) {
    const amount = Number(value || 0);
    try {
      return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: currency || 'ZAR', maximumFractionDigits: 2 }).format(amount);
    } catch {
      return 'R ' + amount.toFixed(2);
    }
  }

  function number(value) {
    return new Intl.NumberFormat('en-ZA').format(Number(value || 0));
  }

  function percent(value, digits) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return Number(value).toFixed(digits === undefined ? 0 : digits) + '%';
  }

  function date(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function dateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function time(value) {
    if (!value) return '—';
    if (/^\d{2}:\d{2}/.test(String(value))) return String(value).slice(0, 5);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  }

  function relative(value) {
    if (!value) return '—';
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return String(value);
    const diff = Date.now() - then;
    const abs = Math.abs(diff);
    const units = [[60000, 'minute'], [3600000, 'hour'], [86400000, 'day'], [604800000, 'week'], [2592000000, 'month'], [31536000000, 'year']];
    if (abs < 60000) return 'just now';
    for (let i = units.length - 1; i >= 0; i -= 1) {
      if (abs >= units[i][0]) {
        const amount = Math.round(diff / units[i][0]);
        return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-amount, units[i][1]);
      }
    }
    return 'just now';
  }

  function ageYears(dateOfBirth) {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years -= 1;
    return years;
  }

  // Local wall-clock date (org timezone for ZA centres) — never UTC, which
  // flips to yesterday between 00:00 and 02:00 SAST.
  function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function statusTone(status) {
    const value = String(status || '').toLowerCase();
    if (['active', 'paid', 'approved', 'published', 'present', 'verified', 'completed', 'done', 'enrolled', 'reconciled', 'granted', 'confirmed', 'closed', 'won', 'converted'].includes(value)) return 'badge-green';
    if (['pending', 'submitted', 'draft', 'on_leave', 'waitlisted', 'in_progress', 'received', 'under_review', 'scheduled', 'partially_paid', 'onboarding', 'trial', 'reviewed'].includes(value)) return 'badge-sun';
    if (['overdue', 'rejected', 'absent', 'failed', 'suspended', 'cancelled', 'void', 'written_off', 'expired', 'blocked', 'critical', 'high', 'urgent', 'spam', 'reversed'].includes(value)) return 'badge-danger';
    if (['excused', 'late', 'collected', 'archived', 'ended', 'withdrawn', 'unpaid', 'low'].includes(value)) return 'badge-muted';
    return 'badge-sky';
  }

  function badge(status) {
    if (!status) return '';
    return '<span class="badge ' + statusTone(status) + '">' + esc(titleCase(status)) + '</span>';
  }

  function priorityTone(priority) {
    if (priority === 'urgent' || priority === 'critical' || priority === 'high') return 'badge-danger';
    if (priority === 'medium') return 'badge-sun';
    return 'badge-muted';
  }

  function icon(name, cls) {
    return '<i data-lucide="' + esc(name) + '"' + (cls ? ' class="' + esc(cls) + '"' : '') + '></i>';
  }

  function statCard(opts) {
    return '<div class="card stat-card ' + (opts.tone ? 'tone-' + esc(opts.tone) : '') + '">' +
      '<div class="stat-top"><div class="stat-icon">' + icon(opts.icon || 'activity') + '</div>' +
      '<div class="stat-label">' + esc(opts.label) + '</div></div>' +
      '<div class="stat-value">' + esc(opts.value) + '</div>' +
      (opts.foot ? '<div class="stat-foot">' + opts.foot + '</div>' : '') +
      '</div>';
  }

  function emptyState(title, message, actionHtml, iconName) {
    return '<div class="empty-state"><div class="empty-icon">' + icon(iconName || 'inbox') + '</div>' +
      '<h3>' + esc(title) + '</h3><p>' + esc(message || '') + '</p>' + (actionHtml || '') + '</div>';
  }

  function pageHead(title, subtitle, actions) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' +
      (subtitle ? '<div class="page-sub">' + subtitle + '</div>' : '') + '</div>' +
      (actions ? '<div class="page-actions">' + actions + '</div>' : '') + '</div>';
  }

  /**
   * The seven teaching screens, one shared sub-navigation. Rendered under the
   * page header on every Teaching view so switching between Today, Calendar,
   * Whiteboards, Modules, Curriculum, Activities and Assessments never goes
   * through the sidebar — the teaching day flows in one tap.
   */
  const TEACHING_NAV = [
    { key: 'today', path: '/app/today', label: 'Today', icon: 'sun', permission: ['reports.read.daycare', 'tasks.read.own', 'attendance.read.assigned', 'curriculum.create.daycare', 'assessments.create.assigned', 'attendance.record.assigned', 'attendance.record.own', 'staff_attendance.record.assigned', 'staff_attendance.record.own'] },
    { key: 'calendar', path: '/app/calendar', label: 'Calendar', icon: 'calendar-days', permission: 'curriculum.read.daycare' },
    { key: 'whiteboards', path: '/app/whiteboards', label: 'Whiteboards', icon: 'presentation', permission: 'curriculum.read.daycare' },
    { key: 'modules', path: '/app/modules', label: 'Modules', icon: 'blocks', permission: 'curriculum.read.daycare' },
    { key: 'curriculum', path: '/app/curriculum', label: 'Curriculum', icon: 'book-open', permission: 'curriculum.read.daycare' },
    { key: 'activities', path: '/app/activities', label: 'Activities', icon: 'puzzle', permission: 'curriculum.read.daycare' },
    { key: 'assessments', path: '/app/assessments', label: 'Assessments', icon: 'clipboard-list', permission: ['assessments.read.daycare', 'assessments.read.assigned'] }
  ];

  function teachingNav(ctx, active) {
    const items = TEACHING_NAV.filter((item) => !ctx || ctx.has(item.permission));
    if (items.length < 2) return '';
    return '<nav class="teaching-nav" aria-label="Teaching">' + items.map((item) => {
      const isActive = item.key === active;
      return '<a class="teaching-tab' + (isActive ? ' is-active' : '') + '" href="#' + item.path + '"' +
        (isActive ? ' aria-current="page"' : '') + '>' + icon(item.icon) + '<span>' + esc(item.label) + '</span></a>';
    }).join('') + '</nav>';
  }

  /**
   * The standard secondary "Refresh" action for page headers — reloads the
   * current view with a spinner-free full navigation.
   */
  function refreshButton() {
    return '<button class="btn btn-secondary btn-sm" @click="navigate(true)" title="Reload this screen">' + icon('refresh-cw') + ' Refresh</button>';
  }

  function card(title, body, actions, opts) {
    const o = opts || {};
    return '<div class="card ' + (o.className || '') + '">' +
      (title ? '<div class="card-head"><h3>' + esc(title) + '</h3>' + (actions ? '<div class="card-actions">' + actions + '</div>' : '') + '</div>' : '') +
      body + '</div>';
  }

  function table(opts) {
    const columns = opts.columns || [];
    const rows = opts.rows || [];
    if (!rows.length) return emptyState(opts.emptyTitle || 'Nothing here yet', opts.emptyMessage || 'Records will appear here once they are created.', opts.emptyAction || '', opts.emptyIcon);
    const selectable = opts.selectable === true;
    const idKey = opts.idKey || 'id';
    const ids = selectable ? rows.map((row) => row[idKey]).filter(Boolean) : [];
    const selectHead = selectable
      ? '<th class="select-col"><input type="checkbox" aria-label="Select every row on this page" @change="toggleSelectAll($event.target.checked, ' + attr(JSON.stringify(ids)) + ')"></th>'
      : '';
    const head = selectHead + columns.map((c) => '<th' + (c.align ? ' style="text-align:' + c.align + '"' : '') + '>' + esc(c.label) + '</th>').join('');
    const body = rows.map((row) => '<tr>' + (selectable
      ? '<td class="select-col" data-label="Select"><input type="checkbox" :checked="isSelected(' + attr(JSON.stringify(String(row[idKey]))) + ')" @change="toggleSelect(' + attr(JSON.stringify(String(row[idKey]))) + ', $event.target.checked)" aria-label="Select row"></td>'
      : '') + columns.map((c) => {
      const value = c.render ? c.render(row) : esc(row[c.key]);
      const label = c.label ? ' data-label="' + attr(c.label) + '"' : ' data-label=""';
      return '<td' + label + (c.align ? ' class="' + (c.align === 'right' ? 'num' : '') + '"' : '') + '>' + (value === undefined || value === null || value === '' ? '<span class="muted">—</span>' : value) + '</td>';
    }).join('') + '</tr>').join('');
    return '<div class="table-wrap' + (opts.pinFirst ? ' pin-first' : '') + (opts.className ? ' ' + esc(opts.className) : '') + '"><table class="table ' + (opts.compact ? 'compact' : '') + '"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  /**
   * Bulk action bar shown above a selectable table. `actions` entries are
   * `{ label, icon, path, action, extra, tone, successMessage }` and call the
   * shared `runBulk` helper, or `{ label, icon, modal }` to open a form first.
   */
  function bulkBar(actions, options) {
    const opts = options || {};
    return '<div class="bulk-bar" x-show="selectedCount > 0" x-cloak>' +
      '<span class="bulk-count"><strong x-text="selectedCount"></strong> selected</span>' +
      (actions || []).map((entry) => {
        if (entry.modal) {
          return '<button type="button" class="btn btn-sm ' + (entry.tone === 'danger' ? 'btn-danger' : 'btn-secondary') + '" @click="openNamedModal(\'' + attr(entry.modal) + '\')">' +
            icon(entry.icon || 'check') + ' ' + esc(entry.label) + '</button>';
        }
        return '<button type="button" class="btn btn-sm ' + (entry.tone === 'danger' ? 'btn-danger' : 'btn-secondary') + '" @click="runBulk(' +
          attr(JSON.stringify(entry.path)) + ', ' + attr(JSON.stringify(entry.action)) + ', ' + attr(JSON.stringify(entry.extra || {})) + ', ' +
          attr(JSON.stringify({ successMessage: entry.successMessage || '' })) + ')">' +
          icon(entry.icon || 'check') + ' ' + esc(entry.label) + '</button>';
      }).join('') +
      (opts.hint ? '<span class="muted small">' + esc(opts.hint) + '</span>' : '') +
      '<button type="button" class="btn btn-sm btn-ghost row-end" @click="clearSelection()">Clear</button></div>';
  }

  function detailItem(label, value) {
    return '<div class="detail-item"><div class="d-label">' + esc(label) + '</div><div class="d-value">' + (value || '<span class="muted">—</span>') + '</div></div>';
  }

  function tabs(items, active) {
    return '<div class="tabs">' + items.map((item) =>
      '<button class="tab ' + (item.key === active ? 'active' : '') + '" @click="setTab(\'' + attr(item.key) + '\')">' + esc(item.label) + '</button>'
    ).join('') + '</div>';
  }

  function filterBar(inner) { return '<div class="filter-bar">' + inner + '</div>'; }

  function moneyCell(value, currency) { return '<span class="mono">' + esc(money(value, currency)) + '</span>'; }

  function truncate(value, length) {
    const text = String(value || '');
    return text.length > (length || 80) ? text.slice(0, length || 80) + '…' : text;
  }

  function json(value) {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }

  function debounce(fn, ms) {
    let timer = null;
    return function debounced() {
      const args = arguments;
      const self = this;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(self, args), ms || 250);
    };
  }

  // ---------------------------------------------------------------------------
  // Branding
  // ---------------------------------------------------------------------------

  const DEFAULT_THEME = {
    primary: '#3A7D44',
    secondary: '#C97A12',
    accent: '#3D8FAE',
    background: '#F7F5EF',
    surface: '#FFFFFF',
    text: '#1C2A1E',
    onPrimary: '#FFFFFF'
  };

  /**
   * The platform's own brand, sampled from the Re-EL ECD logo. It is used for
   * the platform console, the sign-in screen and as the fallback whenever an
   * organisation has not uploaded a logo of its own.
   */
  const PLATFORM_BRAND = {
    name: 'Re-EL ECD',
    tagline: 'Early childhood, elevated',
    logo: 'assets/branding/logo-re-el-ecd.png',
    mark: 'assets/branding/logo-re-el-ecd-mark.png',
    theme: {
      primary: '#0B534A',
      secondary: '#2B9A58',
      accent: '#6FC79B',
      background: '#F6F9F7',
      surface: '#FFFFFF',
      text: '#0E2B26',
      onPrimary: '#FFFFFF'
    }
  };

  function isHex(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  }

  function rgb(hex) {
    const value = isHex(hex) ? hex.slice(1) : '3A7D44';
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }

  function toHex(channels) {
    return '#' + channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel)))
      .toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  /** Blend two colours. weight 0 returns a, 1 returns b. */
  function mix(a, b, weight) {
    const first = rgb(a);
    const second = rgb(b);
    const amount = Math.max(0, Math.min(1, Number(weight)));
    return toHex(first.map((channel, index) => channel + (second[index] - channel) * amount));
  }

  /** amount > 0 lightens toward white, amount < 0 darkens toward black. */
  function shade(hex, amount) {
    const value = Number(amount) || 0;
    return value >= 0 ? mix(hex, '#FFFFFF', value) : mix(hex, '#000000', Math.abs(value));
  }

  /** WCAG contrast: pick dark or light text for a background colour. */
  function onColour(hex) {
    const channels = rgb(hex).map((channel) => channel / 255)
      .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    return luminance > 0.55 ? '#142016' : '#FFFFFF';
  }

  /**
   * Lightness/saturation summary used when choosing a brand colour from a
   * logo. `vividness` favours saturated mid-tone colours, so a pale background
   * does not win just because it covers the most pixels.
   */
  function colourStats(hex) {
    const [red, green, blue] = rgb(hex).map((channel) => channel / 255);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;
    const delta = max - min;
    const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
    const vividness = saturation * Math.max(0, 1 - Math.abs(lightness - 0.45) * 1.4);
    return { red, green, blue, lightness, saturation, vividness };
  }

  /**
   * Turn a frequency-ranked logo palette into a usable brand palette.
   *
   * The most common chromatic colour wins as primary (logos usually sit on a
   * large pale background, which is ignored), then the most vivid remaining
   * colours become secondary and accent.
   */
  function brandPalette(colours) {
    const list = (Array.isArray(colours) ? colours : []).filter(isHex);
    if (!list.length) {
      return {
        primary: DEFAULT_THEME.primary,
        secondary: shade(DEFAULT_THEME.primary, -0.2),
        accent: shade(DEFAULT_THEME.primary, 0.2)
      };
    }
    const stats = list.map((hex) => Object.assign({ hex }, colourStats(hex)));
    const chromatic = stats.filter((entry) => entry.saturation > 0.12 && entry.lightness > 0.12 && entry.lightness < 0.88);
    const pool = chromatic.length ? chromatic : stats;
    const primary = pool[0].hex;
    const rest = pool.filter((entry) => entry.hex !== primary)
      .sort((left, right) => right.vividness - left.vividness);
    return {
      primary,
      secondary: rest[0] ? rest[0].hex : shade(primary, -0.2),
      accent: rest[1] ? rest[1].hex : shade(primary, 0.2)
    };
  }

  function rgba(hex, alpha) {
    const channels = rgb(hex);
    return 'rgba(' + channels.join(', ') + ', ' + alpha + ')';
  }

  /**
   * Map an organisation palette onto the design tokens. The whole stylesheet
   * reads --reel-green-*, --reel-sun-* and --reel-sky-*, so a tenant colour
   * cascades through buttons, navigation, badges, charts and the public site.
   */
  function themeVars(theme, mode) {
    const tokens = Object.assign({}, DEFAULT_THEME, theme || {});
    const primary = isHex(tokens.primary) ? tokens.primary : DEFAULT_THEME.primary;
    const secondary = isHex(tokens.secondary) ? tokens.secondary : DEFAULT_THEME.secondary;
    const accent = isHex(tokens.accent) ? tokens.accent : DEFAULT_THEME.accent;
    const dark = mode === 'dark';
    const surface = dark ? '#1B251E' : (isHex(tokens.background) ? tokens.background : DEFAULT_THEME.background);
    const card = dark ? '#323E37' : (isHex(tokens.surface) ? tokens.surface : DEFAULT_THEME.surface);
    const vars = {
      '--reel-green-900': shade(primary, dark ? -0.30 : -0.42),
      '--reel-green-800': shade(primary, dark ? -0.16 : -0.26),
      '--reel-green-700': shade(primary, -0.14),
      '--reel-green-600': primary,
      '--reel-green-500': shade(primary, 0.14),
      '--reel-green-300': mix(primary, surface, dark ? 0.52 : 0.58),
      '--reel-green-100': mix(primary, surface, dark ? 0.80 : 0.88),
      '--reel-sun-700': shade(secondary, -0.34),
      '--reel-sun-600': secondary,
      '--reel-sun-500': shade(secondary, 0.12),
      '--reel-sun-200': mix(secondary, surface, dark ? 0.76 : 0.80),
      '--reel-sky-700': shade(accent, -0.32),
      '--reel-sky-500': accent,
      '--reel-sky-100': mix(accent, surface, dark ? 0.78 : 0.88),
      '--brand-primary': primary,
      '--brand-primary-hover': shade(primary, -0.14),
      '--brand-on-primary': isHex(tokens.onPrimary) ? tokens.onPrimary : onColour(primary),
      '--brand-secondary': secondary,
      '--brand-accent': accent,
      '--focus-ring': '0 0 0 3px ' + rgba(primary, 0.35)
    };
    if (!dark) {
      vars['--surface-0'] = surface;
      vars['--surface-1'] = card;
      vars['--surface-2'] = mix(card, primary, 0.04);
      vars['--surface-3'] = mix(card, primary, 0.08);
      if (isHex(tokens.text)) {
        vars['--text-strong'] = shade(tokens.text, -0.08);
        vars['--text'] = tokens.text;
      }
      // These two are also written inline in dark mode, so light mode must
      // restore them or the first toggle back leaves muted text too pale.
      vars['--text-muted'] = '#6A776C';
      vars['--text-inverse'] = '#F7FBF7';
      // Glass and border tokens are also written inline in dark mode; light
      // mode must restore them or cards, modals and toasts stay dark glass
      // after toggling back.
      vars['--surface-glass'] = 'rgba(255, 255, 255, 0.72)';
      vars['--surface-glass-strong'] = 'rgba(255, 255, 255, 0.9)';
      vars['--border-subtle'] = 'rgba(31, 61, 36, 0.12)';
      vars['--border-strong'] = 'rgba(31, 61, 36, 0.24)';
    } else {
      // Dark mode needs its own surface and text tokens. Without them the
      // inline light values set on :root win over the [data-theme="dark"]
      // stylesheet rules, so toggling the theme appears to do nothing.
      vars['--surface-0'] = '#1B251E';
      vars['--surface-1'] = '#323E37';
      vars['--surface-2'] = '#3E4A42';
      vars['--surface-3'] = '#4B5750';
      vars['--surface-glass'] = 'rgba(50, 62, 55, 0.82)';
      vars['--surface-glass-strong'] = 'rgba(50, 62, 55, 0.96)';
      vars['--border-subtle'] = 'rgba(230, 244, 232, 0.16)';
      vars['--border-strong'] = 'rgba(230, 244, 232, 0.3)';
      vars['--text-strong'] = '#EEF7EF';
      vars['--text'] = '#D3E2D5';
      vars['--text-muted'] = '#9AAE9D';
      vars['--text-inverse'] = '#121A14';
    }
    // Neon glass + ambient light follow the centre's branding: the neon hair
    // lines, glows, glass borders and the page's ambient colour wash all
    // derive from the organisation's primary/secondary/accent palette.
    const neonBase = mix(primary, accent, 0.35);
    vars['--neon-edge'] = rgba(mix(neonBase, dark ? '#1f3d24' : '#ffffff', 0.3), dark ? 0.9 : 0.95);
    vars['--neon-glow'] = rgba(primary, dark ? 0.3 : 0.38);
    vars['--neon-glow-strong'] = rgba(primary, dark ? 0.45 : 0.55);
    vars['--neon-border'] = rgba(mix(primary, dark ? '#2c5a33' : '#ffffff', 0.4), dark ? 0.5 : 0.42);
    vars['--neon-border-strong'] = rgba(mix(neonBase, dark ? '#2c5a33' : '#ffffff', 0.25), dark ? 0.7 : 0.68);
    vars['--ambient-1'] = rgba(mix(primary, surface, 0.4), dark ? 0.26 : 0.42);
    vars['--ambient-2'] = rgba(mix(secondary, surface, 0.42), dark ? 0.22 : 0.38);
    vars['--ambient-3'] = rgba(mix(accent, surface, 0.42), dark ? 0.22 : 0.36);
    vars['--ambient-4'] = rgba(mix(primary, secondary, 0.5), dark ? 0.14 : 0.2);
    return vars;
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    const mode = root.dataset.theme || 'light';
    const vars = themeVars(theme, mode);
    Object.keys(vars).forEach((key) => root.style.setProperty(key, vars[key]));
  }

  function themeStyle(theme, mode) {
    const vars = themeVars(theme, mode || 'light');
    return 'style="' + Object.keys(vars).map((key) => key + ':' + vars[key]).join(';') + '"';
  }

  /**
   * Read a logo in the browser and return its strongest colours. Canvas access
   * needs the storage bucket to allow the site origin via CORS; when the image
   * cannot be read we surface a clear error rather than guessing.
   */
  function paletteFromImage(url, limit) {
    return new Promise((resolve, reject) => {
      if (!url) { reject(new Error('There is no image to read.')); return; }
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          const max = 120;
          const scale = Math.min(1, max / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
          const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
          const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(image, 0, 0, width, height);
          const data = context.getImageData(0, 0, width, height).data;
          const buckets = new Map();
          for (let index = 0; index < data.length; index += 4) {
            if (data[index + 3] < 140) continue;
            const red = data[index];
            const green = data[index + 1];
            const blue = data[index + 2];
            const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
            if (luminance > 0.96 || luminance < 0.04) continue;
            const key = (red >> 4) + ',' + (green >> 4) + ',' + (blue >> 4);
            const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
            bucket.count += 1;
            bucket.red += red;
            bucket.green += green;
            bucket.blue += blue;
            buckets.set(key, bucket);
          }
          const ranked = Array.from(buckets.values())
            .sort((a, b) => b.count - a.count)
            .map((bucket) => toHex([bucket.red / bucket.count, bucket.green / bucket.count, bucket.blue / bucket.count]));
          const unique = [];
          for (const colour of ranked) {
            const channels = rgb(colour);
            const tooClose = unique.some((other) => {
              const otherChannels = rgb(other);
              return Math.sqrt(channels.reduce((sum, channel, index) => sum + (channel - otherChannels[index]) ** 2, 0)) < 46;
            });
            if (!tooClose) unique.push(colour);
            if (unique.length >= (limit || 6)) break;
          }
          if (!unique.length) reject(new Error('No usable colours were found in that image.'));
          else resolve(unique);
        } catch (error) {
          reject(new Error('The logo could not be read. Check that the storage bucket allows this site to read images (CORS).'));
        }
      };
      image.onerror = () => reject(new Error('The logo could not be loaded. Check the URL and the storage bucket CORS settings.'));
      image.src = url;
    });
  }

  // ---------------------------------------------------------------------------
  // Media
  // ---------------------------------------------------------------------------

  function kindForUrl(url, fallback) {
    const value = String(url || '').split('?')[0].toLowerCase();
    if (/\.(mp4|webm|mov|m4v)$/.test(value)) return 'video';
    if (/\.(mp3|m4a|weba|wav|ogg)$/.test(value)) return 'audio';
    if (/\.(pdf|docx?|xlsx?|csv|txt)$/.test(value)) return 'document';
    if (/\.(jpe?g|png|webp|gif|avif|svg)$/.test(value)) return 'image';
    return fallback || 'image';
  }

  /**
   * Media URLs must be http(s) or site-relative — never javascript:, data:,
   * blob: or other scriptable schemes. Everything media goes through this.
   */
  function safeUrl(value) {
    const s = String(value == null ? '' : value).trim();
    if (!s) return '';
    if (/^\/(?!\/)/.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    return '';
  }

  function mediaHtml(url, kind, options) {
    if (!url) return '<span class="muted">No file</span>';
    const opts = options || {};
    const type = kind || kindForUrl(url);
    const checked = safeUrl(url);
    if (!checked) return '<span class="muted">Unsupported file link</span>';
    const safe = attr(checked);
    if (type === 'video') {
      return '<video class="media-video' + (opts.compact ? ' media-compact' : '') + '" controls preload="metadata" src="' + safe + '"></video>';
    }
    if (type === 'audio') {
      return '<audio class="media-audio" controls preload="metadata" src="' + safe + '"></audio>';
    }
    if (type === 'document') {
      return '<a class="btn btn-sm btn-secondary" href="' + safe + '" target="_blank" rel="noopener">' + icon('file-text') + ' Open file</a>';
    }
    return '<a href="' + safe + '" target="_blank" rel="noopener"><img class="media-img' + (opts.compact ? ' media-compact' : '') + '" loading="lazy" src="' + safe + '" alt="' + attr(opts.alt || '') + '" onerror="this.parentElement.classList.add(\'media-missing\'); this.remove();"></a>';
  }

  function mediaThumb(url, label, kind) {
    if (!url) return '<div class="avatar">' + esc(initials(label)) + '</div>';
    return '<div class="avatar avatar-img">' + mediaHtml(url, kind, { compact: true, alt: label }) + '</div>';
  }

  /**
   * Tooltip attributes for any hoverable element. Renders the native title
   * (accessibility/fallback) plus `data-tip`, which the stylesheet turns into
   * a styled tooltip. Pass `below: true` for elements pinned to the top of the
   * viewport (topbar) so the bubble drops down instead of clipping.
   */
  function tip(text, options) {
    if (!text) return '';
    return ' title="' + attr(text) + '" data-tip="' + attr(text) + '"';
  }

  /**
   * Avatar everywhere applicable: prefers the person's photo
   * (avatarUrl / avatar_url / profile_image_url / photo_url / logoUrl on the
   * passed object, or a URL string), falls back to initials. Optional size
   * ('xs' | 'lg' | pixel number), square shape, tone class and tooltip.
   */
  function avatarHtml(source, label, opts) {
    const o = opts || {};
    const cls = ['avatar'];
    if (o.size === 'xs') cls.push('avatar-xs');
    else if (o.size === 'lg') cls.push('avatar-lg');
    if (o.square) cls.push('avatar-sq');
    if (o.tone) cls.push(o.tone);
    let style = '';
    if (typeof o.size === 'number') {
      style = ' style="width:' + o.size + 'px;height:' + o.size + 'px;flex-basis:' + o.size +
        'px;font-size:' + Math.max(0.55, Math.round(o.size * 0.023) / 1.1) + 'rem"';
    }
    const tipAttrs = o.tip ? tip(o.tip, o) : '';
    const name = label || (source && (source.displayName || source.display_name || source.name)) || '?';
    const url = typeof source === 'string'
      ? source
      : (source && (source.avatarUrl || source.avatar_url || source.profile_image_url || source.photoUrl || source.photo_url || source.logoUrl)) || null;
    if (url) {
      return '<div class="' + cls.join(' ') + ' avatar-img"' + tipAttrs + style + '>' +
        mediaHtml(url, 'image', { compact: true, alt: name }) + '</div>';
    }
    return '<div class="' + cls.join(' ') + '"' + tipAttrs + style + '>' + esc(initials(name)) + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Weather (Today day scene)
  //
  // Live conditions and a short outlook for the centre's location, via the
  // keyless Open-Meteo APIs. Location comes from organisation settings
  // (`weather.city` or `weather.lat/lon`); when nothing is configured it falls
  // back to a sensible default for the centre's timezone. Responses are cached
  // in localStorage for 30 minutes and every failure degrades silently to null,
  // so the day scene simply renders without weather when offline.
  // ---------------------------------------------------------------------------

  const WEATHER_CACHE_KEY = 'reel.weather.v1';
  const WEATHER_GEO_KEY = 'reel.geo.v1';

  const WEATHER_CODES = {
    0: { label: 'Clear sky', icon: 'sun', night: 'moon' },
    1: { label: 'Mostly clear', icon: 'sun', night: 'moon' },
    2: { label: 'Partly cloudy', icon: 'cloud-sun', night: 'cloud-moon' },
    3: { label: 'Overcast', icon: 'cloud' },
    45: { label: 'Fog', icon: 'cloud-fog' },
    48: { label: 'Icy fog', icon: 'cloud-fog' },
    51: { label: 'Light drizzle', icon: 'cloud-drizzle' },
    53: { label: 'Drizzle', icon: 'cloud-drizzle' },
    55: { label: 'Heavy drizzle', icon: 'cloud-drizzle' },
    56: { label: 'Freezing drizzle', icon: 'cloud-drizzle' },
    57: { label: 'Freezing drizzle', icon: 'cloud-drizzle' },
    61: { label: 'Light rain', icon: 'cloud-rain' },
    63: { label: 'Rain', icon: 'cloud-rain' },
    65: { label: 'Heavy rain', icon: 'cloud-rain' },
    66: { label: 'Freezing rain', icon: 'cloud-rain' },
    67: { label: 'Freezing rain', icon: 'cloud-rain' },
    71: { label: 'Light snow', icon: 'cloud-snow' },
    73: { label: 'Snow', icon: 'cloud-snow' },
    75: { label: 'Heavy snow', icon: 'cloud-snow' },
    77: { label: 'Snow grains', icon: 'cloud-snow' },
    80: { label: 'Light showers', icon: 'cloud-rain' },
    81: { label: 'Showers', icon: 'cloud-rain' },
    82: { label: 'Heavy showers', icon: 'cloud-rain' },
    85: { label: 'Snow showers', icon: 'cloud-snow' },
    86: { label: 'Snow showers', icon: 'cloud-snow' },
    95: { label: 'Thunderstorm', icon: 'cloud-lightning' },
    96: { label: 'Thunderstorm', icon: 'cloud-lightning' },
    99: { label: 'Thunderstorm', icon: 'cloud-lightning' }
  };

  function readLocalJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function writeLocalJson(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  }

  function weatherFetchJson(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (typeof AbortController === 'function') {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs || 5000);
        fetch(url, { signal: controller.signal })
          .then((response) => { clearTimeout(timer); return response.ok ? response.json() : Promise.reject(new Error('weather ' + response.status)); })
          .then(resolve, (error) => { clearTimeout(timer); reject(error); });
      } else {
        fetch(url).then((response) => response.ok ? response.json() : Promise.reject(new Error('weather ' + response.status))).then(resolve, reject);
      }
    });
  }

  function weatherDefaultCoords() {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* no Intl */ }
    const table = {
      'africa/johannesburg': { lat: -26.2041, lon: 28.0473, city: 'Johannesburg' },
      'africa/cape_town': { lat: -33.9249, lon: 18.4241, city: 'Cape Town' },
      'africa/harare': { lat: -17.8252, lon: 31.0335, city: 'Harare' },
      'africa/windhoek': { lat: -22.5597, lon: 17.0832, city: 'Windhoek' },
      'europe/london': { lat: 51.5074, lon: -0.1278, city: 'London' },
      'america/new_york': { lat: 40.7128, lon: -74.006, city: 'New York' }
    };
    return table[String(tz).toLowerCase()] || table['africa/johannesburg'];
  }

  async function weatherLoad(options) {
    try {
      if (typeof fetch !== 'function') return null;
      const opts = options || {};
      const loc = (opts.location && typeof opts.location === 'object') ? opts.location : {};
      let city = String(loc.city || '').trim() || null;
      const lat = Number(loc.lat !== undefined ? loc.lat : loc.latitude);
      const lon = Number(loc.lon !== undefined ? loc.lon : loc.longitude);
      let coords = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
      if (!coords && city) {
        const geoCache = readLocalJson(WEATHER_GEO_KEY, {});
        const hit = geoCache[city.toLowerCase()];
        if (hit && Number.isFinite(hit.lat)) coords = hit;
      }
      if (!coords && city) {
        const geo = await weatherFetchJson('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=en&format=json', 4500);
        const first = geo && geo.results && geo.results[0];
        if (first && Number.isFinite(first.latitude)) {
          coords = { lat: first.latitude, lon: first.longitude };
          const geoCache = readLocalJson(WEATHER_GEO_KEY, {});
          geoCache[city.toLowerCase()] = coords;
          writeLocalJson(WEATHER_GEO_KEY, geoCache);
        }
      }
      if (!coords) {
        coords = weatherDefaultCoords();
        city = city || coords.city;
      }
      const cache = readLocalJson(WEATHER_CACHE_KEY, null);
      if (cache && cache.coords && cache.data && cache.coords.lat === coords.lat && cache.coords.lon === coords.lon
        && Date.now() - cache.t < 30 * 60000) {
        return Object.assign({}, cache.data, { city: cache.data.city || city });
      }
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + coords.lat + '&longitude=' + coords.lon +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
        '&daily=temperature_2m_max,temperature_2m_min,weather_code,uv_index_max,precipitation_probability_max,sunrise,sunset' +
        '&forecast_days=1&timezone=auto';
      const raw = await weatherFetchJson(url, 5000);
      if (!raw || !raw.current || !raw.daily) return null;
      const code = WEATHER_CODES[raw.current.weather_code] || { label: 'Weather', icon: 'cloud' };
      const isDay = raw.current.is_day !== 0;
      const data = {
        city: city || coords.city || null,
        temp: Math.round(raw.current.temperature_2m),
        feels: Math.round(raw.current.apparent_temperature),
        humidity: raw.current.relative_humidity_2m,
        wind: Math.round(raw.current.wind_speed_10m),
        isDay,
        label: code.label,
        icon: isDay ? (code.icon || 'cloud') : (code.night || code.icon || 'cloud-moon'),
        uv: Number.isFinite(raw.daily.uv_index_max && raw.daily.uv_index_max[0]) ? Math.round(raw.daily.uv_index_max[0]) : null,
        pop: raw.daily.precipitation_probability_max && raw.daily.precipitation_probability_max[0],
        maxTemp: raw.daily.temperature_2m_max ? Math.round(raw.daily.temperature_2m_max[0]) : null,
        minTemp: raw.daily.temperature_2m_min ? Math.round(raw.daily.temperature_2m_min[0]) : null,
        sunrise: raw.daily.sunrise ? raw.daily.sunrise[0] : null,
        sunset: raw.daily.sunset ? raw.daily.sunset[0] : null
      };
      writeLocalJson(WEATHER_CACHE_KEY, { t: Date.now(), coords, data });
      return data;
    } catch (error) {
      return null;
    }
  }

  Reel.weather = { load: weatherLoad, defaultCoords: weatherDefaultCoords };

  function mediaList(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch { /* plain string */ }
      return [value];
    }
    return [];
  }

  async function uploadMedia(file, options) {
    const opts = options || {};
    if (!file) throw new ApiError('Choose a file first.', 'VALIDATION', 422);
    const created = await api('POST', '/media/uploads', {
      filename: file.name || 'upload',
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      scope: opts.scope || 'general',
      ownerType: opts.ownerType || undefined,
      ownerId: opts.ownerId || undefined
    });
    const payload = (created && created.data) || {};
    const upload = payload.upload || {};
    if (!upload.url) throw new ApiError('The storage service did not return an upload URL.', 'UPLOAD_FAILED', 502);
    const response = await fetch(upload.url, {
      method: upload.method || 'PUT',
      headers: upload.headers || {},
      body: file
    });
    if (!response.ok) {
      // A rejected upload has no object behind it, so drop the pending row
      // rather than leaving an orphan in the library.
      try { await api('DELETE', '/media/assets/' + encodeURIComponent(payload.asset.id)); } catch { /* best effort */ }
      const detail = response.status === 401 || response.status === 403
        ? 'The storage service rejected the upload credentials. An administrator must check the R2 access key and secret.'
        : response.status === 404
          ? 'The storage bucket was not found. Check the R2 bucket name and public base URL.'
          : 'The file could not be uploaded to storage. Check the bucket CORS settings and try again.';
      throw new ApiError(detail, 'UPLOAD_FAILED', response.status);
    }
    const completed = await api('POST', '/media/assets/' + encodeURIComponent(payload.asset.id) + '/complete', {});
    return completed.data;
  }

  /**
   * Upload a supporting document while completing a form. `target` is either
   * { formId } for signed-in staff and parents or { orgSlug, formSlug } for a
   * public visitor. Returns the completed media asset, whose `url` is what the
   * form field stores.
   */
  async function uploadFormFile(file, target) {
    const opts = target || {};
    if (!file) throw new ApiError('Choose a file first.', 'VALIDATION', 422);
    const base = opts.formId
      ? '/forms/' + encodeURIComponent(opts.formId) + '/uploads'
      : '/public/forms/' + encodeURIComponent(opts.orgSlug || '') + '/' + encodeURIComponent(opts.formSlug || '') + '/uploads';
    const created = await api('POST', base, {
      filename: file.name || 'upload',
      contentType: file.type || 'application/octet-stream',
      size: file.size
    });
    const payload = (created && created.data) || {};
    const upload = payload.upload || {};
    if (!upload.url) throw new ApiError('The storage service did not return an upload URL.', 'UPLOAD_FAILED', 502);
    const response = await fetch(upload.url, {
      method: upload.method || 'PUT',
      headers: upload.headers || {},
      body: file
    });
    if (!response.ok) {
      const detail = response.status === 401 || response.status === 403
        ? 'The storage service rejected the upload credentials. An administrator must check the R2 access key and secret.'
        : response.status === 404
          ? 'The storage bucket was not found. Check the R2 bucket name and public base URL.'
          : 'The file could not be uploaded to storage. Check the bucket CORS settings and try again.';
      throw new ApiError(detail, 'UPLOAD_FAILED', response.status);
    }
    const completed = await api('POST', base + '/' + encodeURIComponent(payload.asset.id) + '/complete', {});
    return completed.data;
  }

  Reel.ApiError = ApiError;
  Reel.api = api;
  Reel.setCsrf = setCsrf;
  Reel.apiBase = apiBase;
  Reel.download = download;
  Reel.exportButtons = exportButtons;
  Reel.esc = esc;
  Reel.attr = attr;
  Reel.jsString = jsString;
  Reel.safeUrl = safeUrl;
  Reel.richText = richText;
  Reel.richParagraphs = richParagraphs;
  Reel.titleCase = titleCase;
  Reel.initials = initials;
  Reel.money = money;
  Reel.number = number;
  Reel.percent = percent;
  Reel.date = date;
  Reel.dateTime = dateTime;
  Reel.time = time;
  Reel.relative = relative;
  Reel.ageYears = ageYears;
  Reel.today = today;
  Reel.badge = badge;
  Reel.statusTone = statusTone;
  Reel.priorityTone = priorityTone;
  Reel.icon = icon;
  Reel.statCard = statCard;
  Reel.emptyState = emptyState;
  Reel.pageHead = pageHead;
  Reel.teachingNav = teachingNav;
  Reel.refreshButton = refreshButton;
  Reel.card = card;
  Reel.table = table;
  Reel.bulkBar = bulkBar;
  Reel.detailItem = detailItem;
  Reel.tabs = tabs;
  Reel.filterBar = filterBar;
  Reel.moneyCell = moneyCell;
  Reel.truncate = truncate;
  Reel.json = json;
  Reel.debounce = debounce;
  Reel.readCookie = readCookie;
  Reel.DEFAULT_THEME = DEFAULT_THEME;
  Reel.PLATFORM_BRAND = PLATFORM_BRAND;
  Reel.PLATFORM_LOGO = PLATFORM_BRAND.logo;
  Reel.isHex = isHex;
  Reel.mix = mix;
  Reel.shade = shade;
  Reel.onColour = onColour;
  Reel.themeVars = themeVars;
  Reel.themeStyle = themeStyle;
  Reel.applyTheme = applyTheme;
  Reel.paletteFromImage = paletteFromImage;
  Reel.colourStats = colourStats;
  Reel.brandPalette = brandPalette;
  Reel.kindForUrl = kindForUrl;
  Reel.mediaHtml = mediaHtml;
  Reel.mediaThumb = mediaThumb;
  Reel.avatar = avatarHtml;
  Reel.tip = tip;
  Reel.mediaList = mediaList;
  Reel.uploadMedia = uploadMedia;
  Reel.uploadFormFile = uploadFormFile;

  // -------------------------------------------------------------------------
  // Per-tenant SEO
  // -------------------------------------------------------------------------

  const DEFAULT_DOCUMENT_TITLE = 'Re-EL ECD';
  let originalDocumentTitle = null;

  function seoMeta(name, content, property) {
    const selector = property ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
    let element = document.head.querySelector(selector) || document.head.querySelector('meta[data-reel-seo="' + name + '"]');
    if (!element) {
      if (!content) return null;
      element = document.createElement('meta');
      if (property) element.setAttribute('property', name);
      else element.setAttribute('name', name);
      element.setAttribute('data-reel-seo', name);
      document.head.appendChild(element);
    }
    // Remember the product's own value so leaving the tenant site restores it.
    if (!element.hasAttribute('data-reel-seo')) {
      element.setAttribute('data-reel-seo', name);
      element.setAttribute('data-reel-original', element.getAttribute('content') || '');
    }
    element.setAttribute('content', content === null || content === undefined ? '' : String(content));
    return element;
  }

  function seoLink(rel, href, id) {
    let element = document.getElementById(id);
    if (!href) { if (element) element.remove(); return; }
    if (!element) {
      element = document.createElement('link');
      element.id = id;
      element.rel = rel;
      document.head.appendChild(element);
    }
    element.setAttribute('href', href);
  }

  /**
   * Apply the organisation's own title, description, keywords, Open Graph and
   * Twitter cards, canonical address and ChildCare structured data. Everything
   * is tagged so resetSeo can put the shell back exactly as it was.
   */
  function applySeo(seo, options) {
    if (typeof document === 'undefined') return;
    const opts = options || {};
    const meta = seo || {};
    const title = meta.title || DEFAULT_DOCUMENT_TITLE;
    const description = meta.description || '';
    const keywords = Array.isArray(meta.keywords) ? meta.keywords.join(', ') : (meta.keywords || '');
    const image = meta.image || '';
    const canonical = meta.canonical || '';
    const siteName = meta.organisationName || opts.organisationName || DEFAULT_DOCUMENT_TITLE;

    if (originalDocumentTitle === null) originalDocumentTitle = document.title || DEFAULT_DOCUMENT_TITLE;
    document.title = title;
    seoMeta('description', description);
    seoMeta('keywords', keywords);
    seoMeta('author', siteName);
    seoMeta('robots', opts.robots || 'index, follow');
    seoMeta('og:type', 'website', true);
    seoMeta('og:site_name', siteName, true);
    seoMeta('og:locale', 'en_ZA', true);
    seoMeta('og:title', title, true);
    seoMeta('og:description', description, true);
    seoMeta('og:image', image, true);
    seoMeta('og:url', canonical, true);
    seoMeta('twitter:card', image ? 'summary_large_image' : 'summary');
    seoMeta('twitter:title', title);
    seoMeta('twitter:description', description);
    seoMeta('twitter:image', image);
    if (meta.twitterHandle) seoMeta('twitter:site', meta.twitterHandle);

    seoLink('canonical', canonical, 'reel-seo-canonical');

    const logo = opts.logo || '';
    if (logo) {
      let icon = document.head.querySelector('link[data-reel-favicon="true"]');
      if (!icon) {
        icon = document.createElement('link');
        icon.rel = 'icon';
        icon.setAttribute('data-reel-favicon', 'true');
        document.head.appendChild(icon);
      }
      icon.setAttribute('href', logo);
    }

    const structured = {
      '@context': 'https://schema.org',
      '@type': 'ChildCare',
      name: siteName,
      description,
      url: canonical || undefined,
      image: image || undefined,
      telephone: meta.telephone || undefined,
      email: meta.email || undefined,
      address: meta.address ? { '@type': 'PostalAddress', streetAddress: meta.address } : undefined,
      sameAs: Array.isArray(meta.sameAs) && meta.sameAs.length ? meta.sameAs : undefined
    };
    let script = document.getElementById('reel-seo-jsonld');
    if (!script) {
      script = document.createElement('script');
      script.id = 'reel-seo-jsonld';
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(structured);
  }

  /** Put the product shell's metadata back after leaving a tenant site. */
  function resetSeo() {
    if (typeof document === 'undefined') return;
    document.title = originalDocumentTitle || DEFAULT_DOCUMENT_TITLE;
    document.head.querySelectorAll('meta[data-reel-seo]').forEach((element) => {
      if (element.hasAttribute('data-reel-original')) {
        element.setAttribute('content', element.getAttribute('data-reel-original'));
        element.removeAttribute('data-reel-original');
        element.removeAttribute('data-reel-seo');
      } else {
        element.remove();
      }
    });
    const canonical = document.getElementById('reel-seo-canonical');
    if (canonical) canonical.remove();
    const structured = document.getElementById('reel-seo-jsonld');
    if (structured) structured.remove();
    const icon = document.head.querySelector('link[data-reel-favicon="true"]');
    if (icon) icon.remove();
  }

  /** Canonical address for a specific public page. */
  function siteUrl(slug, pagePath, base) {
    const origin = (base || window.REEL_SITE_BASE || 'https://ecd.re-el.co.za').replace(/\/+$/, '');
    return origin + '/#/site/' + encodeURIComponent(slug || '') + (pagePath ? '/' + String(pagePath).replace(/^\/+/, '') : '');
  }

  /**
   * A QR code that opens this centre's public website. The code is generated
   * locally with the centre's logo baked into the middle, so a printed code is
   * recognisable and nothing is ever requested from a third-party service.
   */
  function qrLogoDataUrl(options) {
    const opts = options || {};
    const primary = isHex(opts.primary) ? opts.primary : PLATFORM_BRAND.theme.primary;
    const onPrimary = isHex(opts.onPrimary) ? opts.onPrimary : onColour(primary);
    const size = 180;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const drawBadge = (logoImage) => {
      context.clearRect(0, 0, size, size);
      // White outer ring keeps the mark readable on any background.
      context.fillStyle = '#FFFFFF';
      context.beginPath();
      context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = primary;
      context.beginPath();
      context.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
      context.fill();
      if (logoImage) {
        context.save();
        context.beginPath();
        context.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
        context.clip();
        const scale = Math.max((size - 24) / (logoImage.width || 1), (size - 24) / (logoImage.height || 1));
        const width = (logoImage.width || 1) * scale;
        const height = (logoImage.height || 1) * scale;
        context.drawImage(logoImage, (size - width) / 2, (size - height) / 2, width, height);
        context.restore();
        return;
      }
      context.fillStyle = onPrimary;
      context.font = '700 ' + Math.round(size * 0.32) + 'px Fraunces, Georgia, serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(initials(opts.name || 'R'), size / 2, size / 2 + 2);
    };
    if (!opts.logoUrl) {
      drawBadge(null);
      return Promise.resolve(canvas.toDataURL('image/png'));
    }
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          drawBadge(image);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          // A CORS-tainted logo cannot be used inside the QR, so fall back to
          // the centre's initials instead of failing the whole code.
          drawBadge(null);
          resolve(canvas.toDataURL('image/png'));
        }
      };
      image.onerror = () => {
        drawBadge(null);
        resolve(canvas.toDataURL('image/png'));
      };
      image.src = opts.logoUrl;
    });
  }

  function qrOptions(options, type, width) {
    const opts = options || {};
    const primary = isHex(opts.primary) ? opts.primary : PLATFORM_BRAND.theme.primary;
    const dark = shade(primary, -0.35);
    const size = Number(width || opts.size) || 220;
    return {
      type,
      shape: 'square',
      width: size,
      height: size,
      margin: Math.max(6, Math.round(size / 26)),
      data: String(opts.data || ''),
      qrOptions: { errorCorrectionLevel: 'H' },
      dotsOptions: { type: 'extra-rounded', color: primary, roundSize: true },
      cornersSquareOptions: { type: 'extra-rounded', color: dark },
      cornersDotOptions: { type: 'extra-rounded', color: dark },
      backgroundOptions: { color: '#FFFFFF' },
      imageOptions: { hideBackgroundDots: true, imageSize: 0.38, margin: 2, crossOrigin: 'anonymous' }
    };
  }

  async function mountQr(container, options) {
    if (!container) return null;
    if (!window.QRCodeStyling) {
      container.innerHTML = '<div class="muted small">QR code unavailable.</div>';
      return null;
    }
    container.innerHTML = '';
    const opts = options || {};
    const primary = isHex(opts.primary) ? opts.primary : PLATFORM_BRAND.theme.primary;
    const image = await qrLogoDataUrl(Object.assign({}, opts, {
      primary,
      onPrimary: isHex(opts.onPrimary) ? opts.onPrimary : onColour(primary)
    }));
    const config = qrOptions(Object.assign({}, opts, { primary }), 'canvas', opts.size || 220);
    config.image = image;
    const qr = new window.QRCodeStyling(config);
    qr.append(container);
    return qr;
  }

  function qrOptionsFromElement(element) {
    const dataset = (element && element.dataset) || {};
    return {
      data: dataset.qrData,
      primary: dataset.brandPrimary,
      secondary: dataset.brandSecondary,
      accent: dataset.brandAccent,
      onPrimary: dataset.onPrimary,
      logoUrl: dataset.logoUrl,
      name: dataset.name,
      size: dataset.size ? Number(dataset.size) : undefined
    };
  }

  function mountQrFromElement(element) {
    return mountQr(element, qrOptionsFromElement(element));
  }

  async function downloadQr(element, extension) {
    if (!window.QRCodeStyling) return;
    const dataset = (element && element.dataset) || {};
    const opts = qrOptionsFromElement(element);
    const ext = String(extension || 'png').toLowerCase();
    const primary = isHex(opts.primary) ? opts.primary : PLATFORM_BRAND.theme.primary;
    const image = await qrLogoDataUrl(Object.assign({}, opts, {
      primary,
      onPrimary: isHex(opts.onPrimary) ? opts.onPrimary : onColour(primary)
    }));
    const config = qrOptions(Object.assign({}, opts, { primary, size: 640 }), ext === 'svg' ? 'svg' : 'canvas', 640);
    config.image = image;
    const qr = new window.QRCodeStyling(config);
    const name = dataset.filename || 'website-qr';
    await qr.download({ name, extension: ext === 'svg' ? 'svg' : 'png' });
  }

  Reel.applySeo = applySeo;
  Reel.resetSeo = resetSeo;
  Reel.siteUrl = siteUrl;
  Reel.isPlatformHost = isPlatformHost;
  Reel.mountQr = mountQrFromElement;
  Reel.downloadQr = downloadQr;

  /** Fetches a list endpoint and normalises { rows, meta }. */
  async function list(path) {
    const payload = await api('GET', path);
    return { rows: (payload && payload.data) || [], meta: (payload && payload.meta) || {} };
  }

  function pager(meta, onPrev, onNext) {
    const page = meta.page || 1;
    const totalPages = meta.totalPages || 1;
    const total = meta.total || 0;
    if (totalPages <= 1) return '';
    return '<div class="pagination"><span>' + number(total) + ' records · page ' + page + ' of ' + totalPages + '</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-sm btn-secondary" ' + (page <= 1 ? 'disabled' : '') + ' @click="' + attr(onPrev) + '">Previous</button>' +
      '<button class="btn btn-sm btn-secondary" ' + (page >= totalPages ? 'disabled' : '') + ' @click="' + attr(onNext) + '">Next</button></div>';
  }

  function branchOptions(ctx) {
    return (ctx.branches || []).map((b) => ({ value: b.id, label: b.name }));
  }

  function classroomOptions(page) {
    const rows = (page && (page.classrooms || page.rows)) || [];
    return rows.filter((c) => c && c.name).map((c) => ({ value: c.id, label: c.name }));
  }

  function staffOptions(rows) {
    return (rows || []).filter((s) => s && s.id).map((s) => ({
      value: s.id,
      label: s.display_name || s.name || s.employee_reference || 'Staff member',
      subtitle: s.job_title || s.employee_reference || '',
      avatarUrl: s.avatar_url || s.avatarUrl || null
    }));
  }

  function learnerOptions(rows) {
    return (rows || []).filter((l) => l && l.id).map((l) => ({
      value: l.id,
      label: [l.first_name || l.firstName, l.last_name || l.lastName].filter(Boolean).join(' ') || 'Child',
      subtitle: l.classroom_name || l.classroomName || l.room_name || l.classroom || l.learner_reference || l.learnerReference || '',
      avatarUrl: l.photo_url || l.avatar_url || l.photoUrl || null
    }));
  }

  function memberOptions(rows, options) {
    const valueKey = (options && options.valueKey) || 'user_id';
    return (rows || []).filter((m) => m && (m[valueKey] || m.id)).map((m) => ({
      value: m[valueKey] || m.id,
      label: m.display_name || m.email || 'Member',
      subtitle: m.email || (m.roles || []).map((r) => r.role || r.role_key).join(', '),
      avatarUrl: m.avatar_url || m.avatarUrl || null
    }));
  }

  function searchFilter(ctx, key, placeholder) {
    return '<div class="search-box">' + icon('search') + '<input class="input" type="search" placeholder="' + attr(placeholder || 'Search…') +
      '" value="' + attr((ctx.filters || {})[key] || '') + '" @input.debounce.350ms="setFilter(\'' + attr(key) + '\', $event.target.value)"></div>';
  }

  function selectFilter(ctx, key, options, placeholder) {
    const current = (ctx.filters || {})[key] || '';
    return '<select class="select" @change="setFilter(\'' + attr(key) + '\', $event.target.value)"><option value="">' + esc(placeholder || 'All') + '</option>' +
      options.map((o) => '<option value="' + attr(o.value) + '"' + (String(o.value) === String(current) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') +
      '</select>';
  }

  function trend(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    if (n > 0) return '<span class="badge badge-green">▲ ' + esc(n) + '</span>';
    if (n < 0) return '<span class="badge badge-danger">▼ ' + esc(Math.abs(n)) + '</span>';
    return '<span class="badge badge-muted">flat</span>';
  }

  Reel.list = list;
  Reel.pager = pager;
  Reel.branchOptions = branchOptions;
  Reel.classroomOptions = classroomOptions;
  Reel.staffOptions = staffOptions;
  Reel.learnerOptions = learnerOptions;
  Reel.memberOptions = memberOptions;
  Reel.searchFilter = searchFilter;
  Reel.selectFilter = selectFilter;
  Reel.trend = trend;
  Reel.views = Reel.views || {};
})();

/* ─────────────────────────────  Web Push  ───────────────────────────── */
/* Same-origin helper: subscribe this device, unsubscribe, and tell the UI
   whether we can deliver push at all. All calls fail soft — a centre must
   never lose features because a browser has no push support. */
(function () {
  const Reel = window.Reel;

  function isSupported() {
    return Boolean('serviceWorker' in navigator) && Boolean('PushManager' in window) && Boolean(window.Notification);
  }

  function base64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
  }

  async function publicKey() {
    try {
      const res = await fetch('/api/v1/push/public-key', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const payload = await res.json();
      return payload && payload.data ? payload.data.key : null;
    } catch (error) {
      return null;
    }
  }

  async function currentSubscription() {
    if (!isSupported()) return null;
    try {
      const registration = await navigator.serviceWorker.ready;
      return await registration.pushManager.getSubscription();
    } catch (error) {
      return null;
    }
  }

  async function subscribe() {
    if (!isSupported()) throw new Error('This browser cannot receive push notifications.');
    const permission = await window.Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notifications were not allowed. Allow them in your browser settings to get updates on this device.');
    const key = await publicKey();
    if (!key) throw new Error('Push is not available on this server right now.');
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8Array(key) });
    const json = subscription.toJSON();
    const res = await fetch('/api/v1/push/subscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': (readCookie('reel_csrf') || '') },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent })
    });
    if (!res.ok) {
      // Roll the subscription back so the two ends never disagree.
      try { await subscription.unsubscribe(); } catch (error) { /* ignore */ }
      const payload = await res.json().catch(() => null);
      throw new Error((payload && payload.error && payload.error.message) || 'Could not save this device.');
    }
    return subscription;
  }

  async function unsubscribe() {
    const subscription = await currentSubscription();
    if (subscription) {
      try {
        await fetch('/api/v1/push/unsubscribe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': (readCookie('reel_csrf') || '') },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
      } catch (error) { /* server cleanup is best-effort */ }
      await subscription.unsubscribe();
    }
    return true;
  }

  Reel.push = { isSupported, publicKey, subscribe, unsubscribe, currentSubscription };
})();
