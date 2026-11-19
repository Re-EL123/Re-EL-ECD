'use strict';

/**
 * Re-EL animation toolkit.
 *
 * A small, dependency-light animation layer for the shell:
 *
 *   springEase / springLinear   Spring & physics-based timing — integrates a
 *                               damped harmonic oscillator (stiffness, damping,
 *                               mass, initial velocity) into either a function
 *                               or a CSS linear() easing string.
 *   keyframes(el, frames, opts) Keyframe animator on top of the Web Animations
 *                               API with spring easing and automatic cleanup.
 *   phase(el, phases, opts)     Phase animator — runs sequential phases
 *                               (enter → hold → exit), each with its own
 *                               keyframes, spring settings and delay.
 *   windowIn / windowOut        Zoom-in / window transitions for overlays
 *                               (modals, palettes, drawers, toasts).
 *   routeZoom(root)             The window transition when a route renders.
 *   bloomStagger(elements)      The staggered widget bloom used after render.
 *
 * Everything no-ops for reduced-motion users and falls back to a
 * cubic-bezier spring approximation where CSS linear() easing is unsupported.
 * Classic script: attaches to window.Reel.anim.
 */
(function () {
  const reduced = () => typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LINEAR_OK = (function () {
    try {
      return typeof CSS !== 'undefined' && CSS.supports
        && CSS.supports('animation-timing-function', 'linear(0, 0.5, 1)');
    } catch (error) { return false; }
  })();

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  /**
   * Spring & physics-based timing.
   *
   * Integrates the damped harmonic oscillator
   *   a = (-stiffness * (x - target) - damping * v) / mass
   * with a fixed small time step and samples the position across `duration`
   * seconds. The samples, normalised to 0..1, describe the overshoot/
   * settle curve; the final sample is forced to 1 so animations always land.
   */
  function springSamples(options) {
    const o = options || {};
    const stiffness = o.stiffness === undefined ? 170 : o.stiffness;
    const damping = o.damping === undefined ? 15 : o.damping;
    const mass = o.mass === undefined ? 1 : o.mass;
    const velocity = o.velocity === undefined ? 0 : o.velocity;
    const duration = o.duration === undefined ? 0.55 : o.duration;
    const samples = o.samples === undefined ? 72 : o.samples;
    const step = duration / samples;
    const dt = 1 / 720;
    let position = 0;
    let vel = velocity;
    let time = 0;
    const points = [];
    for (let i = 1; i <= samples; i += 1) {
      const target = i * step;
      while (time < target) {
        const force = (-stiffness * position - damping * vel) / mass;
        vel += force * dt;
        position += vel * dt;
        time += dt;
      }
      points.push(clamp(position, 0, 1.25));
    }
    points[points.length - 1] = 1;
    return points;
  }

  /** Normalised easing function (0..1 progress in, eased progress out). */
  function springEase(options) {
    if (reduced()) return (p) => p;
    const samples = springSamples(Object.assign({ duration: 0.55, samples: 72 }, options || {}));
    return (progress) => {
      const scaled = clamp(progress, 0, 1) * (samples.length - 1);
      const index = Math.floor(scaled);
      const frac = scaled - index;
      const a = samples[index];
      const b = samples[Math.min(index + 1, samples.length - 1)];
      return a + (b - a) * frac;
    };
  }

  /** CSS linear() easing string built from the same spring simulation. */
  function springLinear(options) {
    if (!LINEAR_OK || reduced()) return 'cubic-bezier(0.24, 1.18, 0.34, 1)';
    const samples = springSamples(Object.assign({ duration: 0.55, samples: 64 }, options || {}));
    return 'linear(' + samples.map((value) => value.toFixed(4)).join(', ') + ')';
  }

  const DEFAULT_SPRING = { stiffness: 170, damping: 15, duration: 0.55 };

  function easingFor(opts) {
    if (!opts) return springLinear(DEFAULT_SPRING);
    if (opts.easing) return opts.easing;
    return springLinear(Object.assign({}, DEFAULT_SPRING, opts.spring || {}));
  }

  /**
   * Keyframe animator. `frames` is a WAAPI keyframe array; `opts` may carry
   * { duration, easing, spring, delay, fill }. Returns the Animation so the
   * caller can cancel it. The animation is cancelled on finish, which snaps
   * the element back to its natural (final) style with no residual styles.
   */
  function keyframes(el, frames, opts) {
    if (!el || typeof el.animate !== 'function' || reduced()) return null;
    const o = opts || {};
    const animation = el.animate(frames, {
      duration: (o.duration === undefined ? 420 : o.duration),
      easing: easingFor(o),
      delay: o.delay || 0,
      fill: o.fill === undefined ? 'backwards' : o.fill
    });
    if (!o.keep) {
      const done = () => { try { animation.cancel(); } catch (error) { /* already gone */ } };
      if (animation.finished) animation.finished.then(done, done);
      else animation.onfinish = done;
    }
    return animation;
  }

  /**
   * Phase animator: runs phases one after another. Each phase is
   * { frames, duration, easing, spring, delay }. Phases without frames act as
   * holds (pure delays). Returns { cancel(), finished }.
   */
  function phase(el, phases, opts) {
    const o = opts || {};
    const control = { cancelled: false, cancel: null, finished: Promise.resolve() };
    if (!el || reduced()) return control;
    const finished = (async () => {
      for (const spec of phases) {
        if (control.cancelled) return;
        if (spec.delay) await wait(spec.delay);
        if (control.cancelled) return;
        if (!spec.frames || !spec.frames.length) {
          await wait(spec.duration || 0);
          continue;
        }
        const animation = keyframes(el, spec.frames, {
          duration: spec.duration,
          easing: spec.easing,
          spring: spec.spring,
          fill: 'both'
        });
        if (animation) {
          control.cancel = () => { control.cancelled = true; try { animation.cancel(); } catch (error) { /* noop */ } };
          await animation.finished.catch(() => null);
        } else {
          await wait(spec.duration || 0);
        }
      }
    })();
    control.finished = finished;
    control.cancel = control.cancel || (() => { control.cancelled = true; });
    return control;
  }

  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  /** Zoom-in / window transition for overlays opening. */
  function windowIn(el, options) {
    return keyframes(el, [
      { opacity: 0, transform: 'translateY(12px) scale(0.94)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' }
    ], Object.assign({ duration: 460, spring: { stiffness: 210, damping: 17, duration: 0.46 } }, options || {}));
  }

  /** Window transition for overlays closing; resolves when it can be removed. */
  function windowOut(el, options) {
    if (!el) return Promise.resolve();
    if (reduced() || typeof el.animate !== 'function') return Promise.resolve();
    const o = options || {};
    const animation = el.animate([
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(8px) scale(0.96)' }
    ], { duration: o.duration === undefined ? 150 : o.duration, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' });
    return animation.finished.catch(() => null);
  }

  /** Route window transition: the freshly rendered view zooms into place. */
  function routeZoom(root, options) {
    return keyframes(root, [
      { opacity: 0, transform: 'translateY(10px) scale(0.968)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' }
    ], Object.assign({ duration: 520, spring: { stiffness: 190, damping: 19, duration: 0.52 } }, options || {}));
  }

  /** Staggered widget bloom after a route renders (spring per widget). */
  function bloomStagger(elements, options) {
    if (!elements || reduced()) return;
    const o = options || {};
    const step = o.step === undefined ? 45 : o.step;
    elements.forEach((el, index) => {
      keyframes(el, [
        { opacity: 0, transform: 'translateY(14px) scale(0.955)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], {
        duration: 520,
        spring: { stiffness: 200, damping: 18, duration: 0.52 },
        delay: Math.min(index * step, 480)
      });
    });
  }

  /**
   * Count-up: animates the number inside each element with the spring easing
   * while preserving any prefix/suffix text (R1 250, 82%, "3 / 12"). Runs on
   * the elements given (usually .stat-value nodes) right after a render.
   */
  function countUp(elements, options) {
    if (!elements || !elements.length || reduced()) return;
    const o = options || {};
    const duration = o.duration === undefined ? 850 : o.duration;
    const ease = springEase({ stiffness: 150, damping: 16, duration: 0.85 });
    elements.forEach((el) => {
      if (!el || el._counted) return;
      const text = el.textContent || '';
      const match = text.match(/-?\d[\d\s,.']*/);
      const target = match ? Number(match[0].replace(/[\s,']/g, '')) : NaN;
      if (!Number.isFinite(target)) return;
      el._counted = true;
      const start = performance.now();
      const pad = match[0].startsWith('-') ? '-' : '';
      const digits = match[0].replace(/^-/, '').replace(/[\s,']/g, '');
      const width = digits.length;
      const format = (value) => {
        let out = String(Math.round(Math.abs(value)));
        if (out.length > width) out = out.slice(0, width); // never overflow the layout
        while (out.length < width) out = '0' + out;
        return pad + out;
      };
      const tick = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const value = target * ease(progress);
        el.textContent = text.replace(match[0], format(value));
        if (progress < 1) requestAnimationFrame(tick);
        else el.textContent = text;
      };
      requestAnimationFrame(tick);
    });
  }

  // ---- Design-system motion primitives ------------------------------------
  // Named springs give each interaction a physical weight instead of rigid
  // durations. easeOut/easeInOut keep opacity and colour changes natural.
  const SPRINGS = {
    snappy: { stiffness: 320, damping: 24, duration: 0.32 },
    smooth: { stiffness: 170, damping: 20, duration: 0.5 },
    bouncy: { stiffness: 240, damping: 12, duration: 0.65 },
    gentle: { stiffness: 110, damping: 22, duration: 0.7 }
  };
  const EASE = {
    out: 'cubic-bezier(.22, 1, .36, 1)',
    inOut: 'cubic-bezier(.65, 0, .35, 1)',
    snap: 'cubic-bezier(.22, 1.35, .36, 1)'
  };
  const RUNNING = (typeof Symbol === 'function' && Symbol('reelAnim')) || '__reelAnim';

  /** Interruptible state-change animation: a new call cancels the old one. */
  function state(el, frames, options) {
    if (!el || typeof el.animate !== 'function') return null;
    try { if (el[RUNNING]) el[RUNNING].cancel(); } catch (error) { /* already gone */ }
    const opts = Object.assign({}, options || {});
    if (!opts.easing && !opts.spring) opts.easing = EASE.out;
    const animation = keyframes(el, frames, opts);
    el[RUNNING] = animation;
    return animation;
  }

  /** Animate a text update in place (old text out, new text in). */
  function contentTransition(el, nextText, options) {
    if (!el) return Promise.resolve();
    const value = nextText === undefined || nextText === null ? '' : String(nextText);
    if (reduced() || typeof el.animate !== 'function') { el.textContent = value; return Promise.resolve(); }
    const o = options || {};
    const out = el.animate([
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(' + (o.slide === undefined ? -6 : o.slide) + 'px)' }
    ], { duration: o.outDuration || 130, easing: EASE.inOut, fill: 'both' });
    return out.finished.catch(() => null).then(() => {
      el.textContent = value;
      return state(el, [
        { opacity: 0, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: o.inDuration || 260, easing: EASE.out }).finished.catch(() => null);
    });
  }

  /** Symbol effect: a quick, weighty pulse/rotate for status glyphs. */
  function symbolEffect(el, options) {
    const o = options || {};
    return state(el, [
      { transform: 'scale(1) rotate(0deg)' },
      { transform: 'scale(1.28) rotate(' + (o.rotate === undefined ? 12 : o.rotate) + 'deg)', offset: 0.42 },
      { transform: 'scale(1) rotate(0deg)' }
    ], Object.assign({ spring: SPRINGS.bouncy, duration: 420 }, o));
  }

  /** Entry/exit transitions used for deliberate insertions and removals. */
  function slideIn(el, options) {
    return state(el, [
      { opacity: 0, transform: 'translateX(' + ((options && options.from) || -18) + 'px)' },
      { opacity: 1, transform: 'translateX(0)' }
    ], Object.assign({ spring: SPRINGS.snappy, duration: 340 }, options || {}));
  }
  function scaleIn(el, options) {
    return state(el, [
      { opacity: 0, transform: 'scale(.92)' },
      { opacity: 1, transform: 'scale(1)' }
    ], Object.assign({ spring: SPRINGS.bouncy, duration: 380 }, options || {}));
  }
  function fadeOut(el, options) {
    if (!el || typeof el.animate !== 'function' || reduced()) return Promise.resolve();
    const animation = el.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(.97)' }
    ], { duration: (options && options.duration) || 160, easing: EASE.inOut, fill: 'both' });
    return animation.finished.catch(() => null);
  }

  /**
   * Shared-element (hero) transition — FLIP from a source rect to a target
   * element, so a tapped row appears to grow into the sheet/detail view.
   */
  function hero(fromEl, toEl, options) {
    if (!fromEl || !toEl || typeof fromEl.getBoundingClientRect !== 'function' ||
        reduced() || typeof toEl.animate !== 'function') return null;
    const from = fromEl.getBoundingClientRect();
    const to = toEl.getBoundingClientRect();
    if (!from.width || !to.width) return null;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const sx = Math.max(0.5, Math.min(1.6, from.width / to.width));
    const sy = Math.max(0.5, Math.min(1.6, from.height / to.height));
    return state(toEl, [
      { opacity: 0.35, transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')' },
      { opacity: 1, transform: 'translate(0,0) scale(1,1)' }
    ], Object.assign({ spring: SPRINGS.smooth, duration: 440 }, options || {}));
  }

  /** Phase/keyframe sequence for one-shot celebrations or continuous loops. */
  function pulse(el, options) {
    const o = options || {};
    return phase(el, [
      { frames: [{ transform: 'scale(1)' }, { transform: 'scale(' + (o.scale || 1.06) + ')' }], duration: o.up || 180, spring: SPRINGS.snappy },
      { frames: [{ transform: 'scale(' + (o.scale || 1.06) + ')' }, { transform: 'scale(1)' }], duration: o.down || 320, spring: SPRINGS.bouncy }
    ]);
  }

  /** Scroll-edge affordance: fades the edges of a scrollable control surface. */
  function setupScrollEdges(root) {
    if (typeof document === 'undefined') return;
    const scope = root || document;
    // Vertical scrollers get the fade; the state classes below suppress it
    // when the content fits, so short surfaces never look clipped.
    const surfaces = '.scroll-edge, .table-wrap, .modal-body, .cal-agenda, .guide-steps, .rhyme-player';
    scope.querySelectorAll(surfaces).forEach((el) => {
      el.classList.add('scroll-edge');
      if (el.dataset.edgeBound === '1') return;
      el.dataset.edgeBound = '1';
      const update = () => {
        el.classList.toggle('at-top', el.scrollTop <= 2);
        el.classList.toggle('at-bottom', el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
      };
      el.addEventListener('scroll', update, { passive: true });
      update();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(update);
        observer.observe(el);
        el.__edgeObserver = observer;
      }
    });
  }

  const anim = {
    reduced, springSamples, springEase, springLinear, keyframes, phase,
    SPRINGS, EASE, state, contentTransition, symbolEffect, slideIn, scaleIn,
    fadeOut, hero, pulse, setupScrollEdges,
    windowIn, windowOut, routeZoom, bloomStagger, countUp
  };

  if (typeof window !== 'undefined') {
    window.Reel = window.Reel || {};
    window.Reel.anim = anim;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = anim;
})();
