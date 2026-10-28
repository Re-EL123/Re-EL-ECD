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
    const response = await fetch(API_BASE + '/api/v1' + path, {
      method,
      headers,
      credentials: API_BASE ? 'include' : 'same-origin',
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

  function today() { return new Date().toISOString().slice(0, 10); }

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
    const head = columns.map((c) => '<th' + (c.align ? ' style="text-align:' + c.align + '"' : '') + '>' + esc(c.label) + '</th>').join('');
    const body = rows.map((row) => '<tr>' + columns.map((c) => {
      const value = c.render ? c.render(row) : esc(row[c.key]);
      return '<td' + (c.align ? ' class="' + (c.align === 'right' ? 'num' : '') + '"' : '') + '>' + (value === undefined || value === null || value === '' ? '<span class="muted">—</span>' : value) + '</td>';
    }).join('') + '</tr>').join('');
    return '<div class="table-wrap"><table class="table ' + (opts.compact ? 'compact' : '') + '"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
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

  Reel.ApiError = ApiError;
  Reel.api = api;
  Reel.setCsrf = setCsrf;
  Reel.apiBase = apiBase;
  Reel.download = download;
  Reel.esc = esc;
  Reel.attr = attr;
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
  Reel.card = card;
  Reel.table = table;
  Reel.detailItem = detailItem;
  Reel.tabs = tabs;
  Reel.filterBar = filterBar;
  Reel.moneyCell = moneyCell;
  Reel.truncate = truncate;
  Reel.json = json;
  Reel.debounce = debounce;
  Reel.readCookie = readCookie;

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
  Reel.searchFilter = searchFilter;
  Reel.selectFilter = selectFilter;
  Reel.trend = trend;
  Reel.views = Reel.views || {};
})();
