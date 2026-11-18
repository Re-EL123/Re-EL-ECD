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
        { opacity: 0, transform: 'translateY(14px) scale(0.955)', filter: 'blur(7px)' },
        { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0px)' }
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

  const anim = {
    reduced, springSamples, springEase, springLinear, keyframes, phase,
    windowIn, windowOut, routeZoom, bloomStagger, countUp
  };

  if (typeof window !== 'undefined') {
    window.Reel = window.Reel || {};
    window.Reel.anim = anim;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = anim;
})();
