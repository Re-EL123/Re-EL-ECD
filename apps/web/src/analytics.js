'use strict';

/**
 * Privacy-first analytics and search verification.
 *
 * Nothing loads unless a GA4 measurement ID is configured in config.js.
 * Analytics storage is denied by default and only enabled after a clear
 * consent choice, which is stored locally and can be withdrawn at any time.
 * Page views are sent manually because this app is a hash-routed SPA.
 */
(function () {
  const R = window.Reel || (window.Reel = {});
  const CONSENT_KEY = 'reel-analytics-consent';
  const config = window;
  const measurementId = String(config.REEL_GA4_MEASUREMENT_ID || '').trim();

  function readConsent() {
    try { return window.localStorage.getItem(CONSENT_KEY) || ''; }
    catch (error) { return ''; }
  }
  function writeConsent(value) {
    try { window.localStorage.setItem(CONSENT_KEY, value); }
    catch (error) { /* private browsing — remember for this page only */ }
  }

  // Search Console verification is public; let deploy config supply the token.
  const verification = String(config.REEL_SEARCH_CONSOLE_VERIFICATION || '').trim();
  if (verification) {
    const meta = document.getElementById('reel-search-verification') ||
      document.querySelector('meta[name="google-site-verification"]');
    if (meta) meta.setAttribute('content', verification);
  }

  const state = { loaded: false, consent: readConsent() };

  function gtag() { (window.dataLayer = window.dataLayer || []).push(arguments); }

  function loadGA4() {
    if (state.loaded || !measurementId) return;
    state.loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = gtag;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', measurementId, { anonymize_ip: true, send_page_view: false });
    gtag('consent', 'default', {
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      analytics_storage: state.consent === 'granted' ? 'granted' : 'denied'
    });
    if (state.consent === 'granted') applyConsent('granted');
  }

  function applyConsent(value) {
    gtag('consent', 'update', { analytics_storage: value });
  }

  function setConsent(value, persist) {
    state.consent = value;
    if (persist !== false) writeConsent(value);
    if (measurementId) {
      if (!state.loaded) loadGA4(); else applyConsent(value);
    }
    const banner = document.getElementById('reel-analytics-banner');
    if (banner) banner.remove();
    document.body.classList.remove('analytics-banner-open');
  }

  function sanitizePath(path) {
    return String(path || '/')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+/g, '/:id');
  }

  function pageView() {
    if (!measurementId || state.consent !== 'granted' || !state.loaded) return;
    gtag('event', 'page_view', {
      page_path: sanitizePath(location.pathname + location.hash),
      page_title: document.title
    });
  }

  function showBanner() {
    if (!measurementId || state.consent || document.getElementById('reel-analytics-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'reel-analytics-banner';
    banner.className = 'analytics-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Analytics preference');
    banner.innerHTML =
      '<div class="analytics-banner-copy"><strong>Help us improve Re-EL ECD</strong>' +
      '<span>We use optional, privacy-friendly analytics to see which pages are useful. No personal or child data is sent.</span></div>' +
      '<div class="analytics-banner-actions">' +
        '<button type="button" class="btn btn-sm btn-ghost" data-analytics="deny">No thanks</button>' +
        '<button type="button" class="btn btn-sm btn-primary" data-analytics="allow">Allow analytics</button>' +
      '</div>';
    document.body.appendChild(banner);
    document.body.classList.add('analytics-banner-open');
    banner.addEventListener('click', (event) => {
      const button = event.target.closest('[data-analytics]');
      if (!button) return;
      setConsent(button.getAttribute('data-analytics') === 'allow' ? 'granted' : 'denied');
    });
  }

  R.analytics = {
    pageView,
    setConsent,
    get consent() { return state.consent; },
    get enabled() { return Boolean(measurementId); }
  };

  // Give the shell a moment to render before asking for consent.
  if (measurementId) {
    if (state.consent === 'granted') loadGA4();
    window.setTimeout(showBanner, 1200);
    window.addEventListener('hashchange', () => window.setTimeout(pageView, 0));
  }
})();
