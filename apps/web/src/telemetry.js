'use strict';

/**
 * Privacy-friendly product diagnostics.
 *
 * Nothing is collected unless the visitor granted optional analytics consent.
 * We record coarse interaction signals (taps, scroll depth, route views) and
 * runtime errors with device/OS/browser facts — never form values, child data,
 * record identifiers or free text. Events are batched and sent to our own API.
 */
(function () {
  const R = window.Reel = window.Reel || {};
  const SESSION_KEY = 'reel-telemetry-session';
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const EMAIL_RE = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
  const PHONE_RE = /\+?\d[\d\s()-]{7,}\d/g;

  let queue = [];
  let timer = null;
  let started = false;
  let maxScroll = 0;
  let scrollEnded = false;

  function clean(value, max) {
    return String(value == null ? '' : value)
      .replace(UUID_RE, ':id')
      .replace(EMAIL_RE, ':email')
      .replace(PHONE_RE, ':number')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/[^A-Za-z0-9 :._\/-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function route() {
    // The SPA uses hash routes: use the hash when present, otherwise the path.
    const hash = String(location.hash || '');
    const raw = hash.charAt(0) === '#' ? hash.slice(1) : (String(location.pathname || '/') || '/');
    return clean(raw, 240).replace(UUID_RE, ':id').replace(/^\/+/, '/') || '/';
  }

  function area() {
    const hash = String(location.hash || '');
    if (hash.indexOf('#/platform/') === 0) return 'platform';
    if (hash.indexOf('#/parent/') === 0) return 'parent';
    if (hash.indexOf('#/app/') === 0) return 'app';
    return 'public';
  }

  function buildVersion() {
    try {
      const link = document.querySelector('link[rel="stylesheet"][href*="v="]');
      const match = link && /[?&]v=(\d+)/.exec(link.href);
      return match ? match[1] : 'dev';
    } catch (error) { return 'dev'; }
  }

  function sessionKey() {
    try {
      const day = new Date().toISOString().slice(0, 10);
      const stored = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null');
      if (stored && stored.day === day && stored.key) return String(stored.key).slice(0, 64);
      const key = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ day, key }));
      return key;
    } catch (error) { return ''; }
  }

  function device() {
    const ua = String(navigator.userAgent || '');
    let os = 'Unknown';
    if (/Windows NT/i.test(ua)) os = 'Windows';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPad|iPhone|iPod/i.test(ua)) os = 'iOS';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/CrOS/i.test(ua)) os = 'ChromeOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const tablet = /iPad|Tablet/i.test(ua) || (coarse && Math.min(screen.width, screen.height) >= 600);
    const mobile = !tablet && (/Mobile|iPhone|Android/i.test(ua) || (coarse && window.innerWidth < 700));
    let browser = 'Other';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\//.test(ua)) browser = 'Opera';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Safari\//.test(ua)) browser = 'Safari';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';

    const width = window.innerWidth || 1024;
    const viewport = width < 400 ? 'under-400' : width < 700 ? '400-699'
      : width < 1000 ? '700-999' : width < 1400 ? '1000-1399' : '1400-plus';
    return { os, device: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop', browser, viewport };
  }

  function consented() {
    if (R.analytics && R.analytics.consent) return R.analytics.consent === 'granted';
    try { return window.localStorage.getItem('reel-analytics-consent') === 'granted'; }
    catch (error) { return false; }
  }

  function flush() {
    timer = null;
    if (!queue.length) return;
    if (!consented()) { queue = []; return; }
    const batch = queue.splice(0, 25);
    try {
      Promise.resolve(R.api('POST', '/public/telemetry', { events: batch })).catch(() => null);
    } catch (error) { /* telemetry must never break the app */ }
    if (queue.length) schedule();
  }

  function schedule() {
    if (timer) return;
    timer = window.setTimeout(flush, 8000);
  }

  function push(kind, name, details, at) {
    if (!consented()) return;
    if (queue.length >= 100) queue.shift();
    try {
      queue.push(Object.assign({
        kind,
        name: clean(name, 120),
        path: route(),
        area: area(),
        at: (at || new Date()).toISOString(),
        sessionKey: sessionKey(),
        appVersion: buildVersion(),
        details: details || {}
      }, device()));
      schedule();
    } catch (error) { /* never let diagnostics break a screen */ }
  }

  function targetLabel(element) {
    if (!element) return 'unknown';
    const explicit = element.getAttribute && (element.getAttribute('data-telemetry') ||
      element.getAttribute('data-np') || element.getAttribute('data-action'));
    if (explicit) return clean(explicit, 60);
    const tag = (element.tagName || 'element').toLowerCase();
    const role = element.getAttribute && element.getAttribute('role');
    const classes = typeof element.className === 'string'
      ? '.' + element.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return clean(tag + (role ? '[' + role + ']' : '') + classes, 80).replace(/\.$/, '') || tag;
  }

  function resetScroll() { maxScroll = 0; scrollEnded = false; }

  function onScroll() {
    if (!consented()) return;
    const height = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const percent = height > 0 ? Math.min(100, Math.round((window.scrollY / height) * 100)) : 100;
    const bucket = Math.floor(percent / 25) * 25;
    if (bucket > maxScroll && bucket > 0 && bucket < 100) {
      maxScroll = bucket;
      push('scroll', 'scroll_depth', { depth: bucket, route: route() });
    }
    if (percent >= 95 && !scrollEnded) {
      scrollEnded = true;
      push('scroll', 'scroll_end', { depth: 100, route: route() });
    }
  }

  function install() {
    if (started) return;
    started = true;

    document.addEventListener('click', (event) => {
      if (!consented() || event.target && event.target.closest && event.target.closest('[data-no-telemetry]')) return;
      push('click', targetLabel(event.target), { route: route() });
    }, { passive: true });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', () => { resetScroll(); push('page_view', 'route', {}); }, { passive: true });
    window.addEventListener('error', (event) => {
      push('error', 'window_error', {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        route: route()
      }, event.timeStamp ? new Date() : undefined);
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason || {};
      push('error', 'promise_rejection', {
        message: reason && reason.message ? reason.message : String(reason || 'unknown'),
        route: route()
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', () => { flush(); });
  }

  R.telemetry = {
    init: install,
    track(name, details) { push('event', name, details || {}); },
    captureError(name, error) {
      push('error', name || 'app_error', {
        message: error && error.message ? error.message : String(error || 'unknown'),
        route: route()
      });
    },
    flush,
    get queued() { return queue.length; }
  };
})();
