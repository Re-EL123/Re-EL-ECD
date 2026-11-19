'use strict';

/**
 * Re-EL feedback layer — the shared language for "that worked", "watch out",
 * and "what can I do next". Dependency-free classic script.
 *
 *   haptic(pattern)   navigator.vibrate (Android); silent no-op elsewhere
 *   sound(kind)       short WebAudio tones — no audio files, no network
 *   symbol(kind)      floating ✓ / ! glyph beside the action
 *   sheet(...)        mobile action sheet with keyboard + backdrop support
 *   swipe(el, opts)   left/right swipe with live visual reveal
 *   busy(el, fn)      disables a button and shows a spinner while a promise runs
 *   shake(el)         inline error shake
 *   delight()         counts meaningful completions for the rating prompt
 *   maybeRate()       prompts only at natural stopping points, with cooldown
 *
 * Preferences live in localStorage (sound / haptics), never in the API.
 * Everything honours prefers-reduced-motion.
 */
(function () {
  const R = window.Reel = window.Reel || {};
  const KEY = 'reel.feedback.v1';
  const RATING_KEY = 'reel.rating.v1';

  function prefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { sound: saved.sound !== false, haptics: saved.haptics !== false, motion: saved.motion !== false };
    } catch { return { sound: true, haptics: true, motion: true }; }
  }
  function setPref(name, value) {
    const next = prefs();
    next[name] = Boolean(value);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
    return next;
  }
  const reduced = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PATTERNS = {
    tap: 12,
    success: [18, 40, 18],
    complete: [20, 35, 20, 35, 40],
    warn: [40, 60, 40],
    error: [60, 40, 60, 40, 60]
  };

  function haptic(kind) {
    if (!prefs().haptics) return;
    try {
      if (navigator.vibrate) navigator.vibrate(PATTERNS[kind] || PATTERNS.tap);
    } catch { /* unsupported device */ }
  }

  let audioCtx = null;
  function sound(kind) {
    if (!prefs().sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const notes = {
        tap: [[880, 0.035, 'sine', 0.022]],
        success: [[660, 0.06, 'sine', 0.03], [880, 0.09, 'sine', 0.026]],
        complete: [[523, 0.07, 'sine', 0.03], [659, 0.07, 'sine', 0.03], [784, 0.13, 'sine', 0.028]],
        warn: [[392, 0.08, 'triangle', 0.03], [311, 0.12, 'triangle', 0.028]],
        error: [[180, 0.12, 'sawtooth', 0.02], [140, 0.14, 'sawtooth', 0.018]]
      }[kind] || [[880, 0.035, 'sine', 0.022]];
      let at = audioCtx.currentTime;
      notes.forEach(([frequency, duration, type, gain]) => {
        const osc = audioCtx.createOscillator();
        const vol = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = frequency;
        vol.gain.setValueAtTime(0.0001, at);
        vol.gain.exponentialRampToValueAtTime(gain, at + 0.012);
        vol.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        osc.connect(vol).connect(audioCtx.destination);
        osc.start(at);
        osc.stop(at + duration + 0.02);
        at += duration * 0.75;
      });
    } catch { /* audio unavailable */ }
  }

  function cue(kind, anchor) {
    haptic(kind);
    sound(kind);
    symbol(kind, anchor);
  }

  function symbol(kind, anchor) {
    if (!prefs().motion || reduced()) return;
    const glyph = { success: '✓', complete: '✓', warn: '!', error: '×', tap: '·' }[kind] || '✓';
    const el = document.createElement('span');
    el.className = 'symbol-burst symbol-' + kind;
    el.textContent = glyph;
    el.setAttribute('aria-hidden', 'true');
    const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    const host = document.body;
    const hostRect = host.getBoundingClientRect();
    el.style.left = (rect ? rect.left + rect.width / 2 - hostRect.left : window.innerWidth / 2) + 'px';
    el.style.top = (rect ? rect.top + rect.height / 2 - hostRect.top : window.innerHeight / 2) + 'px';
    host.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function shake(el) {
    if (!el || !prefs().motion || reduced()) return;
    el.classList.remove('is-shaking');
    void el.offsetWidth;
    el.classList.add('is-shaking');
    setTimeout(() => el.classList.remove('is-shaking'), 600);
  }

  async function busy(el, fn) {
    if (!el || el.dataset.busy === '1') return fn();
    el.dataset.busy = '1';
    const original = el.innerHTML;
    el.disabled = true;
    el.classList.add('is-busy');
    try {
      return await fn();
    } finally {
      if (document.body.contains(el)) {
        el.innerHTML = original;
        el.disabled = false;
        el.classList.remove('is-busy');
        delete el.dataset.busy;
      }
    }
  }

  /** Action sheet: { title, message, actions: [{ label, icon, tone, run }] } */
  function sheet(config, anchor) {
    closeSheet();
    const cfg = config || {};
    const backdrop = document.createElement('div');
    backdrop.className = 'feedback-sheet-backdrop';
    backdrop.innerHTML =
      '<div class="feedback-sheet" role="dialog" aria-modal="true" aria-label="' + R.attr(cfg.title || 'Actions') + '">' +
        '<div class="sheet-grip" aria-hidden="true"></div>' +
        (cfg.title ? '<h3>' + R.esc(cfg.title) + '</h3>' : '') +
        (cfg.message ? '<p class="muted small">' + R.esc(cfg.message) + '</p>' : '') +
        '<div class="sheet-actions">' +
          (cfg.actions || []).map((a, i) =>
            '<button type="button" class="sheet-action ' + (a.tone === 'danger' ? 'is-danger' : '') + '" data-sheet-action="' + i + '">' +
              (a.icon ? R.icon(a.icon) : '') + '<span>' + R.esc(a.label) + '</span></button>').join('') +
          '<button type="button" class="sheet-action sheet-cancel" data-sheet-cancel>' + R.icon('x') + '<span>Cancel</span></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(backdrop);
    // Shared-element feel: the sheet grows from the row/card it was opened
    // from, then settles into its bottom-sheet resting place.
    const panel = backdrop.querySelector('.feedback-sheet');
    if (anchor && panel && window.Reel && Reel.anim && Reel.anim.hero) {
      if (Reel.anim.hero(anchor, panel)) panel.classList.add('from-hero');
    }
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop || event.target.closest('[data-sheet-cancel]')) return closeSheet();
      const button = event.target.closest('[data-sheet-action]');
      if (!button) return;
      const action = (cfg.actions || [])[Number(button.getAttribute('data-sheet-action'))];
      closeSheet();
      if (action && typeof action.run === 'function') action.run();
    });
    document.addEventListener('keydown', sheetKey);
    haptic('tap');
    return backdrop;
  }
  function sheetKey(event) { if (event.key === 'Escape') closeSheet(); }
  function closeSheet() {
    const existing = document.querySelector('.feedback-sheet-backdrop');
    if (existing) existing.remove();
    document.removeEventListener('keydown', sheetKey);
  }

  /**
   * Swipe a row to reveal an action. `onRight` (swipe right) and `onLeft`.
   * Interactive children keep their own clicks; we only act past 72px.
   */
  function swipe(el, options) {
    if (!el || el.dataset.swiped === '1') return;
    el.dataset.swiped = '1';
    const opts = options || {};
    let startX = 0, startY = 0, dx = 0, active = false;
    const threshold = opts.threshold || 72;
    el.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.target !== el && event.target.closest && event.target.closest('button, a, input, select, textarea')) return;
      active = true;
      startX = event.clientX;
      startY = event.clientY;
      dx = 0;
    });
    el.addEventListener('pointermove', (event) => {
      if (!active) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaY) > Math.abs(deltaX)) { active = false; el.style.transform = ''; return; }
      dx = deltaX;
      el.style.transform = 'translateX(' + Math.max(-110, Math.min(110, dx)) + 'px)';
    });
    const finish = () => {
      if (!active) return;
      active = false;
      el.style.transition = '';
      el.style.transform = '';
      const action = dx > threshold ? opts.onRight : (dx < -threshold ? opts.onLeft : null);
      if (action) {
        haptic('tap');
        action();
      }
      dx = 0;
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
    el.addEventListener('pointerleave', finish);
  }

  // ---- Rating prompt -------------------------------------------------------
  function rating() {
    try {
      const saved = JSON.parse(localStorage.getItem(RATING_KEY) || '{}');
      return { count: Number(saved.count) || 0, last: Number(saved.last) || 0, dismissed: Number(saved.dismissed) || 0 };
    } catch { return { count: 0, last: 0, dismissed: 0 }; }
  }
  function saveRating(next) {
    try { localStorage.setItem(RATING_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  }
  function delight() {
    const state = rating();
    state.count += 1;
    saveRating(state);
  }
  function maybeRate() {
    const state = rating();
    if (state.count < 5 || state.dismissed >= 2) return false;
    if (Date.now() - state.last < 30 * 24 * 3600 * 1000) return false;
    const openModal = document.querySelector('.modal-backdrop[style*="grid"], .feedback-sheet-backdrop');
    if (openModal) return false;
    // Only at a natural stopping point: Today's wrap-up fully complete.
    const meter = document.querySelector('.day-meter[aria-valuenow="100"]');
    if (!meter) return false;
    state.last = Date.now();
    saveRating(state);
    const reviewUrl = (window.__REEL_CONFIG__ && window.__REEL_CONFIG__.reviewUrl)
      || 'https://play.google.com/store/search?q=Re-EL%20ECD&c=apps';
    sheet({
      title: 'Nice work today',
      message: 'Everything is wrapped up. If Re-EL ECD is helping your centre, a quick rating helps other schools find it.',
      actions: [
        { label: 'Rate the app', icon: 'star', run: () => { window.open(reviewUrl, '_blank', 'noopener'); } },
        { label: 'Not now', icon: 'clock', run: () => { const s = rating(); s.dismissed += 1; saveRating(s); } }
      ]
    });
    return true;
  }

  // ---- Delegated micro-interactions ---------------------------------------
  function init() {
    document.addEventListener('pointerdown', (event) => {
      const btn = event.target.closest && event.target.closest('.btn, .deck-arrow, .teaching-tab');
      if (btn && !btn.disabled) haptic('tap');
    }, { passive: true });
  }

  R.feedback = {
    init, prefs, setPref, haptic, sound, cue, symbol, shake, busy,
    sheet, closeSheet, swipe, delight, maybeRate, rating
  };
})();
