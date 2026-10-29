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
    const surface = dark ? '#121A14' : (isHex(tokens.background) ? tokens.background : DEFAULT_THEME.background);
    const card = dark ? '#18221A' : (isHex(tokens.surface) ? tokens.surface : DEFAULT_THEME.surface);
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
      '--brand-on-primary': tokens.onPrimary || onColour(primary),
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
    }
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

  function mediaHtml(url, kind, options) {
    if (!url) return '<span class="muted">No file</span>';
    const opts = options || {};
    const type = kind || kindForUrl(url);
    const safe = attr(url);
    if (type === 'video') {
      return '<video class="media-video' + (opts.compact ? ' media-compact' : '') + '" controls preload="metadata" src="' + safe + '"></video>';
    }
    if (type === 'audio') {
      return '<audio class="media-audio" controls preload="metadata" src="' + safe + '"></audio>';
    }
    if (type === 'document') {
      return '<a class="btn btn-sm btn-secondary" href="' + safe + '" target="_blank" rel="noopener">' + icon('file-text') + ' Open file</a>';
    }
    return '<a href="' + safe + '" target="_blank" rel="noopener"><img class="media-img' + (opts.compact ? ' media-compact' : '') + '" loading="lazy" src="' + safe + '" alt="' + attr(opts.alt || '') + '"></a>';
  }

  function mediaThumb(url, label, kind) {
    if (!url) return '<div class="avatar">' + esc(initials(label)) + '</div>';
    return '<div class="avatar avatar-img">' + mediaHtml(url, kind, { compact: true, alt: label }) + '</div>';
  }

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
      throw new ApiError('The file could not be uploaded to storage. Check the bucket CORS settings.', 'UPLOAD_FAILED', response.status);
    }
    const completed = await api('POST', '/media/assets/' + encodeURIComponent(payload.asset.id) + '/complete', {});
    return completed.data;
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
  Reel.DEFAULT_THEME = DEFAULT_THEME;
  Reel.isHex = isHex;
  Reel.mix = mix;
  Reel.shade = shade;
  Reel.onColour = onColour;
  Reel.themeVars = themeVars;
  Reel.themeStyle = themeStyle;
  Reel.applyTheme = applyTheme;
  Reel.paletteFromImage = paletteFromImage;
  Reel.kindForUrl = kindForUrl;
  Reel.mediaHtml = mediaHtml;
  Reel.mediaThumb = mediaThumb;
  Reel.mediaList = mediaList;
  Reel.uploadMedia = uploadMedia;

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
