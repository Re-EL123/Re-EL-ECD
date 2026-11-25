'use strict';

/**
 * Nursery rhyme transport — one audio element for the whole app.
 *
 * A teacher never wants two songs at once, so every Play goes through here:
 * starting a new rhyme stops the previous one, the now-playing bar stays
 * pinned while music is on, and the lyrics reader highlights the line being
 * sung. Everything is plain DOM so it survives Alpine re-renders of the view.
 */
(function () {
  const R = window.Reel = window.Reel || {};
  const reduced = () => typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const audio = new Audio();
  audio.preload = 'metadata';
  try { audio.setAttribute('playsinline', ''); } catch (error) { /* older browsers */ }
  const coarse = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const savedVolume = R.rhymeMeta && R.rhymeMeta.volume();
  audio.volume = Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1 ? savedVolume : 0.8;

  let state = {
    id: null, title: '', url: '', playing: false, duration: 0, time: 0,
    failed: false, needsGesture: false, continueAction: null,
    loop: false, queue: [], queueIndex: -1
  };
  const listeners = new Set();
  let bar = null;
  let queuePanel = null;
  let reader = null;
  let readerBackdrop = null;
  let readerRhyme = null;
  let fontScale = 1;

  function emit() {
    listeners.forEach((fn) => { try { fn(state); } catch (error) { /* one bad listener must not break audio */ } });
    syncCards();
    syncBar();
    syncReader();
  }

  /** Replace a dedicated icon container; lucide turns <i> into <svg> once. */
  function setIcon(host, name) {
    if (!host || host.dataset.icon === name) return;
    host.dataset.icon = name;
    host.innerHTML = R.icon(name);
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch (error) { /* icons optional */ }
    }
  }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function getState() { return Object.assign({}, state, { queue: state.queue.slice() }); }

  function resolve(id) {
    return (R.nurseryRhymes && R.nurseryRhymes.find(id)) || null;
  }
  function titleFor(id) {
    const rhyme = resolve(id);
    return rhyme ? rhyme.title : id;
  }

  function load(id, url, title) {
    state.id = id;
    state.url = url;
    state.title = title || titleFor(id);
    state.failed = false;
    state.needsGesture = false;
    state.continueAction = null;
    state.time = 0;
    state.duration = 0;
    audio.src = url;
    audio.load();
  }

  function play(id, url, title) {
    if (!id || !url) return Promise.resolve();
    if (state.id !== id || state.failed) load(id, url, title);
    state.needsGesture = false;
    state.continueAction = null;
    const result = audio.play();
    if (!result || typeof result.catch !== 'function') return Promise.resolve();
    return result.catch(() => {
      // A real load failure is reported by the `error` event; don't replace it
      // with a Continue prompt that could only fail again.
      if (state.failed) return;
      // Mobile browsers reject play() when it isn't launched by a user
      // gesture. Surface a tappable control instead of failing silently.
      state.needsGesture = coarse();
      state.failed = !coarse();
      state.continueAction = 'resume';
      emit();
    });
  }

  function toggle(id, url, title) {
    if (state.id === id && state.playing && !audio.paused) {
      audio.pause();
      return Promise.resolve();
    }
    return play(id, url, title);
  }

  function pause() { audio.pause(); }
  function stop() {
    audio.pause();
    try { audio.currentTime = 0; } catch (error) { /* not seekable yet */ }
    state.id = null;
    state.url = '';
    state.title = '';
    state.playing = false;
    state.time = 0;
    state.duration = 0;
    state.failed = false;
    state.needsGesture = false;
    state.continueAction = null;
    emit();
  }

  // Mobile browsers block playback started after an `ended` event or a
  // rejected play() because neither carries a user gesture. Resume the queued
  // action from an explicit tap on Continue (or the bar's play button).
  function continuePlayback() {
    if (!state.id || !state.url) return Promise.resolve();
    const action = state.continueAction || 'resume';
    state.continueAction = null;
    state.needsGesture = false;
    if (action === 'next') return next();
    return play(state.id, state.url, state.title);
  }

  function seek(ratio) {
    if (!Number.isFinite(state.duration) || state.duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * state.duration;
    state.time = audio.currentTime;
    emit();
  }
  function setVolume(value) {
    const volume = Math.max(0, Math.min(1, Number(value) || 0));
    audio.volume = volume;
    if (R.rhymeMeta) R.rhymeMeta.setVolume(volume);
    emit();
  }
  function toggleLoop() {
    state.loop = !state.loop;
    audio.loop = state.loop;
    emit();
  }
  function retry() {
    if (!state.url) return;
    const url = state.url + (state.url.indexOf('?') === -1 ? '?' : '&') + 'retry=' + Date.now();
    load(state.id, url, state.title);
    play(state.id, url, state.title);
  }

  // ---- Queue ---------------------------------------------------------------
  function enqueue(id, url, title) {
    if (!id || !url) return;
    if (state.queue.some((item) => item.id === id)) return;
    state.queue.push({ id, url, title: title || titleFor(id) });
    emit();
  }
  function removeFromQueue(id) {
    state.queue = state.queue.filter((item) => item.id !== id);
    if (state.queueIndex >= state.queue.length) state.queueIndex = state.queue.length - 1;
    emit();
  }
  function clearQueue() { state.queue = []; state.queueIndex = -1; emit(); }
  function jumpQueue(index) {
    const item = state.queue[index];
    if (!item) return;
    state.queueIndex = index;
    play(item.id, item.url, item.title);
  }
  function next() {
    if (!state.queue.length) return;
    jumpQueue((state.queueIndex + 1) % state.queue.length);
  }
  function previous() {
    if (!state.queue.length) return;
    jumpQueue((state.queueIndex - 1 + state.queue.length) % state.queue.length);
  }

  // ---- Native audio events -------------------------------------------------
  audio.addEventListener('loadedmetadata', () => {
    state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    emit();
  });
  audio.addEventListener('durationchange', () => {
    state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    emit();
  });
  audio.addEventListener('timeupdate', () => {
    state.time = audio.currentTime || 0;
    emit();
  });
  audio.addEventListener('play', () => { state.playing = true; emit(); });
  audio.addEventListener('pause', () => { state.playing = false; emit(); });
  audio.addEventListener('ended', () => {
    state.playing = false;
    if (!state.queue.length || state.loop) { emit(); return; }
    // Advancing from `ended` has no user gesture, which mobile browsers block.
    // Ask for an explicit tap instead so the next song reliably starts.
    if (coarse()) {
      state.needsGesture = true;
      state.continueAction = 'next';
      emit();
    } else next();
  });
  audio.addEventListener('error', () => {
    if (!audio.src) return;
    state.failed = true;
    state.playing = false;
    state.needsGesture = false;
    state.continueAction = null;
    emit();
  });

  // ---- Card state ----------------------------------------------------------
  function syncCards() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-rhyme-play]').forEach((button) => {
      const id = button.getAttribute('data-rhyme-play');
      const isCurrent = state.id === id;
      const active = isCurrent && state.playing;
      button.dataset.state = active ? 'playing' : (isCurrent ? 'paused' : 'idle');
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', (active ? 'Pause ' : 'Play ') + titleFor(id));
      const icon = active ? 'pause' : 'play';
      const label = active ? 'Pause' : (isCurrent ? 'Resume' : 'Play');
      setIcon(button.querySelector('.rhyme-play-icon'), icon);
      const text = button.querySelector('.rhyme-play-label');
      if (text && text.textContent !== label) text.textContent = label;
    });
    document.querySelectorAll('[data-rhyme-status]').forEach((slot) => {
      const id = slot.getAttribute('data-rhyme-status');
      const show = state.id === id && state.failed;
      if (show && !slot.querySelector('.rhyme-audio-error')) {
        const error = document.createElement('div');
        error.className = 'rhyme-audio-error';
        error.innerHTML = '<span>Couldn’t load this recording.</span>';
        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.className = 'btn btn-sm btn-ghost';
        retryButton.textContent = 'Retry';
        retryButton.addEventListener('click', () => retry());
        error.appendChild(retryButton);
        slot.appendChild(error);
      } else if (!show && slot.querySelector('.rhyme-audio-error')) {
        slot.innerHTML = '';
      }
    });
  }

  // ---- Now playing bar -----------------------------------------------------
  function clock(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
  }
  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.className = 'rhyme-now-playing';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Now playing');
    bar.hidden = true;
    bar.innerHTML =
      '<button type="button" class="np-icon" data-np="prev" aria-label="Previous song">' + R.icon('skip-back') + '</button>' +
      '<button type="button" class="np-play" data-np="toggle" aria-label="Play or pause"><span class="np-play-icon">' + R.icon('play') + '</span></button>' +
      '<button type="button" class="np-icon" data-np="next" aria-label="Next song">' + R.icon('skip-forward') + '</button>' +
      '<div class="np-meta"><strong class="np-title"></strong><span class="np-sub">Nursery rhyme</span></div>' +
      '<input type="range" class="np-seek" min="0" max="1000" value="0" aria-label="Seek through song">' +
      '<span class="np-time muted small">0:00 / 0:00</span>' +
      '<button type="button" class="np-icon" data-np="loop" aria-label="Loop this song" aria-pressed="false">' + R.icon('repeat') + '</button>' +
      '<label class="np-volume" title="Volume">' + R.icon('volume-2') + '<input type="range" min="0" max="1" step="0.05" aria-label="Volume"></label>' +
      '<button type="button" class="np-icon" data-np="queue" aria-label="Session queue">' + R.icon('list-music') + '<span class="np-count"></span></button>' +
      '<button type="button" class="np-continue" data-np="continue" hidden>' + R.icon('play') + ' Continue</button>' +
      '<button type="button" class="np-icon" data-np="read" aria-label="Open lyrics reader">' + R.icon('book-open') + '</button>' +
      '<button type="button" class="np-icon np-close" data-np="stop" aria-label="Stop all and close">' + R.icon('x') + '</button>';
    document.body.appendChild(bar);
    bar.addEventListener('click', (event) => {
      const control = event.target.closest && event.target.closest('[data-np]');
      if (!control) return;
      switch (control.getAttribute('data-np')) {
        case 'toggle':
          if (state.id) {
            if (state.needsGesture && state.continueAction) continuePlayback();
            else toggle(state.id, state.url, state.title);
          }
          break;
        case 'continue': continuePlayback(); break;
        case 'prev': previous(); break;
        case 'next': next(); break;
        case 'loop': toggleLoop(); break;
        case 'queue': toggleQueuePanel(); break;
        case 'read': {
          const rhyme = resolve(state.id);
          if (rhyme) openReader(rhyme, state.url);
          break;
        }
        case 'stop': stop(); break;
        default: break;
      }
    });
    const seekInput = bar.querySelector('.np-seek');
    seekInput.addEventListener('input', () => seek(Number(seekInput.value) / 1000));
    const volumeInput = bar.querySelector('.np-volume input');
    volumeInput.value = String(audio.volume);
    volumeInput.addEventListener('input', () => setVolume(volumeInput.value));
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch (error) { /* icons optional */ }
    }
    return bar;
  }

  function syncBar() {
    if (!bar) return;
    bar.hidden = !state.id;
    if (!state.id) {
      if (queuePanel) queuePanel.hidden = true;
      return;
    }
    bar.querySelector('.np-title').textContent = state.title;
    const cont = bar.querySelector('.np-continue');
    cont.hidden = !state.needsGesture;
    setIcon(bar.querySelector('.np-play-icon'), state.playing ? 'pause' : 'play');
    const seek = bar.querySelector('.np-seek');
    if (document.activeElement !== seek) {
      seek.value = String(state.duration > 0 ? Math.round((state.time / state.duration) * 1000) : 0);
    }
    bar.querySelector('.np-time').textContent = clock(state.time) + ' / ' + (state.duration ? clock(state.duration) : '–:–');
    const loop = bar.querySelector('[data-np="loop"]');
    loop.setAttribute('aria-pressed', state.loop ? 'true' : 'false');
    loop.classList.toggle('active', state.loop);
    const count = state.queue.length;
    bar.querySelector('.np-count').textContent = count ? String(count) : '';
    bar.querySelector('[data-np="prev"]').disabled = !state.queue.length;
    bar.querySelector('[data-np="next"]').disabled = !state.queue.length;
    if (queuePanel && !queuePanel.hidden) renderQueue();
  }

  // ---- Session queue panel -------------------------------------------------
  function ensureQueuePanel() {
    if (queuePanel) return queuePanel;
    queuePanel = document.createElement('div');
    queuePanel.className = 'rhyme-queue-panel';
    queuePanel.setAttribute('role', 'dialog');
    queuePanel.setAttribute('aria-label', 'Session queue');
    queuePanel.hidden = true;
    queuePanel.innerHTML = '<div class="queue-head"><strong>Session queue</strong>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-queue="clear">Clear all</button>' +
      '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-queue="close" aria-label="Close queue">' + R.icon('x') + '</button></div>' +
      '<div class="queue-list"></div>' +
      '<div class="queue-foot muted small">Add songs from the ⋯ menu on any card.</div>';
    document.body.appendChild(queuePanel);
    queuePanel.addEventListener('click', (event) => {
      const control = event.target.closest && event.target.closest('[data-queue]');
      if (!control) return;
      const action = control.getAttribute('data-queue');
      if (action === 'clear') clearQueue();
      else if (action === 'close') { queuePanel.hidden = true; }
      else if (action === 'play') jumpQueue(Number(control.getAttribute('data-index')));
      else if (action === 'remove') removeFromQueue(control.getAttribute('data-id'));
    });
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch (error) { /* icons optional */ }
    }
    return queuePanel;
  }
  function renderQueue() {
    const panel = ensureQueuePanel();
    const list = panel.querySelector('.queue-list');
    list.innerHTML = state.queue.length
      ? state.queue.map((item, index) =>
          '<div class="queue-row' + (index === state.queueIndex ? ' is-current' : '') + '">' +
            '<button type="button" class="queue-play" data-queue="play" data-index="' + index + '">' + R.icon('play') + '</button>' +
            '<span class="queue-title">' + R.esc(item.title) + '</span>' +
            '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-queue="remove" data-id="' + R.attr(item.id) + '" aria-label="Remove ' + R.attr(item.title) + '">' + R.icon('x') + '</button>' +
          '</div>').join('')
      : '<div class="muted small">Nothing queued yet. Add songs to build a session.</div>';
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch (error) { /* icons optional */ }
    }
  }
  function toggleQueuePanel() {
    const panel = ensureQueuePanel();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderQueue();
  }

  // ---- Lyrics reader -------------------------------------------------------
  function openReader(rhyme, url) {
    if (!rhyme) return;
    readerRhyme = rhyme;
    closeReader();
    const backdrop = document.createElement('div');
    backdrop.className = 'rhyme-reader-backdrop';
    backdrop.innerHTML =
      '<div class="rhyme-reader" role="dialog" aria-modal="true" aria-label="' + R.attr(rhyme.title) + ' lyrics">' +
        '<div class="reader-head">' +
          '<div><h2>' + R.esc(rhyme.title) + '</h2><div class="muted small">' + R.esc(rhyme.category || '') +
            (rhyme.actions ? ' · ' + R.esc(rhyme.actions) : '') + '</div></div>' +
          '<button type="button" class="btn btn-ghost btn-icon" data-reader="close" aria-label="Close lyrics">' + R.icon('x') + '</button>' +
        '</div>' +
        '<div class="reader-tools">' +
          '<button type="button" class="btn btn-sm btn-primary" data-reader="play"><span class="reader-play-icon">' + R.icon('play') + '</span><span class="reader-play-label">Play along</span></button>' +
          '<button type="button" class="btn btn-sm btn-secondary" data-reader="project">' + R.icon('monitor') + ' Project for class</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-reader="smaller" aria-label="Smaller text">A−</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-reader="larger" aria-label="Bigger text">A+</button>' +
          '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener noreferrer" href="' + R.attr(rhyme.source || '#') + '">' + R.icon('external-link') + ' Get audio</a>' +
        '</div>' +
        '<div class="reader-body scroll-edge"><div class="reader-lines">' +
          (rhyme.lyrics || []).map((line) => line
            ? '<p class="reader-line">' + R.esc(line) + '</p>'
            : '<div class="reader-gap" aria-hidden="true"></div>').join('') +
        '</div></div>' +
      '</div>';
    document.body.appendChild(backdrop);
    readerBackdrop = backdrop;
    reader = backdrop.querySelector('.rhyme-reader');
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) return closeReader();
      const control = event.target.closest && event.target.closest('[data-reader]');
      if (!control) return;
      switch (control.getAttribute('data-reader')) {
        case 'close': closeReader(); break;
        case 'play': {
          const source = url || null;
          if (source) toggle(rhyme.id, source, rhyme.title);
          else if (window.ReelApp) ReelApp.toast('No recording attached to this rhyme yet.', 'info');
          break;
        }
        case 'project': projectReader(); break;
        case 'smaller': fontScale = Math.max(0.75, fontScale - 0.15); applyFont(); break;
        case 'larger': fontScale = Math.min(1.8, fontScale + 0.15); applyFont(); break;
        default: break;
      }
    });
    document.addEventListener('keydown', readerKey);
    applyFont();
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch (error) { /* icons optional */ }
    }
    syncReader();
  }
  function readerKey(event) { if (event.key === 'Escape') closeReader(); }
  function closeReader() {
    if (!readerBackdrop) return;
    readerBackdrop.remove();
    readerBackdrop = null;
    reader = null;
    document.removeEventListener('keydown', readerKey);
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch(() => null);
    }
  }
  function applyFont() {
    if (!reader) return;
    reader.querySelector('.reader-lines').style.setProperty('--reader-scale', String(fontScale));
  }
  function projectReader() {
    if (!reader) return;
    reader.classList.toggle('is-projecting');
    const button = reader.querySelector('[data-reader="project"]');
    if (button) button.setAttribute('aria-pressed', reader.classList.contains('is-projecting') ? 'true' : 'false');
    if (reader.classList.contains('is-projecting') && reader.requestFullscreen && !reduced()) {
      reader.requestFullscreen().catch(() => null);
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => null);
    }
  }
  function syncReader() {
    if (!reader || !readerRhyme) return;
    const lines = [...reader.querySelectorAll('.reader-line')];
    if (!lines.length) return;
    const playButton = reader.querySelector('[data-reader="play"]');
    const playing = state.id === readerRhyme.id && state.playing;
    setIcon(reader.querySelector('.reader-play-icon'), playing ? 'pause' : 'play');
    const label = playButton.querySelector('.reader-play-label');
    if (label) label.textContent = playing ? 'Pause' : 'Play along';
    let active = -1;
    if (state.id === readerRhyme.id && state.duration > 0) {
      active = Math.min(lines.length - 1, Math.floor((state.time / state.duration) * lines.length));
    }
    lines.forEach((line, index) => line.classList.toggle('is-sung', index === active));
  }

  function init() {
    ensureBar();
    ensureQueuePanel();
  }

  R.rhymePlayer = {
    init, subscribe, getState, play, toggle, pause, stop, seek, setVolume, toggleLoop, retry,
    enqueue, removeFromQueue, clearQueue, jumpQueue, next, previous, continuePlayback,
    openReader, closeReader, toggleQueuePanel,
    get volume() { return audio.volume; }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})();
