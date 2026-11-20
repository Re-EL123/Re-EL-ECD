'use strict';

/**
 * Magic writing — handwriting and shape recognition for the whiteboard.
 *
 * No network calls and no model downloads: everything runs in the browser.
 * Shapes are recognised from geometry (closedness, corners, circularity) and
 * characters are matched against hand-built stroke templates that are scaled
 * and translated into a common box. It is tuned for neat, print-style marks;
 * messy writing stays as ink, and every conversion can be undone.
 */
(function () {
  const R = window.Reel || (window.Reel = {});
  const N = 24;
  const BOX = 100;

  function bounds(points) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    (points || []).forEach((p) => {
      x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
    });
    if (!Number.isFinite(x1)) return { x: 0, y: 0, w: 1, h: 1 };
    return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
  }
  function pathLength(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return d;
  }
  function pointSegmentDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }
  function resample(pts, count) {
    if (!pts.length) return [];
    if (pts.length === 1 || !pathLength(pts)) {
      return Array.from({ length: count }, () => ({ x: pts[0].x, y: pts[0].y }));
    }
    const interval = pathLength(pts) / (count - 1);
    const out = [{ x: pts[0].x, y: pts[0].y }];
    let travelled = 0;
    let prev = pts[0];
    let i = 1;
    while (out.length < count && i < pts.length) {
      const segment = Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y);
      if (travelled + segment >= interval) {
        const t = (interval - travelled) / (segment || 1);
        const next = { x: prev.x + (pts[i].x - prev.x) * t, y: prev.y + (pts[i].y - prev.y) * t };
        out.push(next); prev = next; travelled = 0;
      } else { travelled += segment; prev = pts[i]; i++; }
    }
    while (out.length < count) out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    return out;
  }
  function normaliseStrokes(strokes) {
    const all = (strokes || []).reduce((acc, s) => acc.concat(s), []);
    const b = bounds(all);
    const side = Math.max(b.w, b.h) || 1;
    return (strokes || []).filter((s) => s.length > 1 || s.length === 1).map((s) => {
      const scaled = s.map((p) => ({ x: ((p.x - b.x) / side) * BOX, y: ((p.y - b.y) / side) * BOX }));
      const points = resample(scaled, N);
      return { points, length: pathLength(scaled) / BOX };
    });
  }
  function pointwise(a, b) {
    let total = 0;
    for (let i = 0; i < N; i++) total += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
    return total / N;
  }
  function strokeDistance(a, b) {
    const direct = pointwise(a.points, b.points);
    const reversed = pointwise(a.points, b.points.slice().reverse());
    return Math.min(direct, reversed) + Math.abs(a.length - b.length) * 12;
  }
  function matchScore(candidate, template) {
    const used = new Set();
    let total = 0;
    template.forEach((ts) => {
      let best = Infinity, index = -1;
      candidate.forEach((cs, i) => {
        if (used.has(i)) return;
        const d = strokeDistance(cs, ts);
        if (d < best) { best = d; index = i; }
      });
      if (index >= 0) used.add(index);
      total += best;
    });
    const extra = Math.max(0, candidate.length - used.size);
    return (total + extra * 30) / Math.max(template.length, candidate.length);
  }

  // Single continuous strokes where practical; characters that need a pen lift
  // are described as several strokes and matched stroke-by-stroke.
  const P = (x, y) => [x, y];
  const TEMPLATES = [
    ['0', [[P(50, 10), P(78, 28), P(84, 60), P(64, 88), P(36, 90), P(16, 62), P(20, 30), P(50, 10)]]],
    ['1', [[P(28, 30), P(50, 12), P(50, 90)], [P(25, 90), P(76, 90)]]],
    ['2', [[P(18, 30), P(32, 14), P(68, 14), P(82, 32), P(70, 52), P(20, 90), P(84, 90)]]],
    ['3', [[P(20, 18), P(76, 16), P(50, 50), P(76, 56), P(80, 76), P(54, 92), P(22, 84)]]],
    ['4', [[P(66, 10), P(18, 68), P(86, 68)], [P(66, 10), P(66, 92)]]],
    ['5', [[P(80, 14), P(26, 14), P(22, 50), P(60, 50), P(80, 64), P(78, 82), P(48, 92), P(20, 84)]]],
    ['6', [[P(78, 16), P(40, 28), P(20, 60), P(26, 84), P(54, 92), P(80, 74), P(80, 48), P(56, 32), P(30, 46), P(22, 68)]]],
    ['7', [[P(18, 16), P(82, 16), P(44, 92)]]],
    ['8', [[P(50, 50), P(30, 30), P(34, 14), P(60, 12), P(76, 30), P(60, 50), P(32, 68), P(30, 86), P(56, 92), P(76, 78), P(68, 60), P(50, 50)]]],
    ['9', [[P(76, 84), P(58, 92), P(30, 84), P(22, 60), P(30, 34), P(54, 20), P(78, 36), P(78, 64), P(58, 80), P(32, 72)]]],

    ['A', [[P(14, 90), P(50, 10), P(86, 90)], [P(30, 62), P(70, 62)]]],
    ['B', [[P(20, 10), P(20, 90)], [P(20, 10), P(62, 12), P(76, 28), P(62, 48), P(20, 50)], [P(62, 48), P(78, 68), P(64, 88), P(20, 90)]]],
    ['C', [[P(80, 20), P(50, 10), P(22, 34), P(20, 68), P(46, 92), P(80, 80)]]],
    ['D', [[P(20, 10), P(20, 90), P(50, 90), P(80, 68), P(80, 32), P(50, 10), P(20, 10)]]],
    ['E', [[P(80, 12), P(20, 12), P(20, 90), P(80, 90)], [P(20, 50), P(66, 50)]]],
    ['F', [[P(20, 90), P(20, 12), P(80, 12)], [P(20, 50), P(66, 50)]]],
    ['G', [[P(80, 22), P(50, 10), P(22, 34), P(20, 68), P(46, 92), P(80, 80), P(80, 52), P(56, 52)]]],
    ['H', [[P(20, 10), P(20, 90)], [P(80, 10), P(80, 90)], [P(20, 50), P(80, 50)]]],
    ['I', [[P(28, 12), P(72, 12)], [P(50, 12), P(50, 90)], [P(28, 90), P(72, 90)]]],
    ['J', [[P(72, 12), P(72, 68), P(56, 88), P(30, 86), P(20, 66)]]],
    ['K', [[P(20, 10), P(20, 90)], [P(80, 10), P(20, 56), P(80, 90)]]],
    ['L', [[P(20, 10), P(20, 90), P(80, 90)]]],
    ['M', [[P(14, 90), P(14, 10), P(50, 56), P(86, 10), P(86, 90)]]],
    ['N', [[P(20, 90), P(20, 10), P(80, 90), P(80, 10)]]],
    ['O', [[P(50, 10), P(76, 28), P(82, 60), P(62, 88), P(36, 90), P(16, 62), P(22, 28), P(50, 10)]]],
    ['P', [[P(20, 90), P(20, 10), P(64, 10), P(78, 28), P(64, 48), P(20, 50)]]],
    ['Q', [[P(50, 10), P(76, 28), P(82, 60), P(62, 88), P(36, 90), P(16, 62), P(22, 28), P(50, 10)], [P(52, 62), P(84, 92)]]],
    ['R', [[P(20, 90), P(20, 10), P(64, 10), P(78, 28), P(64, 48), P(20, 50)], [P(54, 50), P(84, 92)]]],
    ['S', [[P(78, 18), P(50, 10), P(22, 32), P(46, 48), P(74, 56), P(80, 78), P(54, 92), P(22, 84)]]],
    ['T', [[P(14, 12), P(86, 12)], [P(50, 12), P(50, 90)]]],
    ['U', [[P(20, 10), P(20, 66), P(40, 90), P(62, 90), P(80, 66), P(80, 10)]]],
    ['V', [[P(18, 10), P(50, 90), P(82, 10)]]],
    ['W', [[P(12, 10), P(30, 90), P(50, 44), P(70, 90), P(88, 10)]]],
    ['X', [[P(18, 10), P(82, 90)], [P(82, 10), P(18, 90)]]],
    ['Y', [[P(18, 10), P(50, 52), P(82, 10)], [P(50, 52), P(50, 90)]]],
    ['Z', [[P(18, 12), P(82, 12), P(18, 90), P(82, 90)]]],

    ['+', [[P(20, 50), P(80, 50)], [P(50, 20), P(50, 80)]]],
    ['-', [[P(20, 50), P(80, 50)]]],
    ['=', [[P(20, 36), P(80, 36)], [P(20, 64), P(80, 64)]]],
    ['×', [[P(22, 22), P(78, 78)], [P(78, 22), P(22, 78)]]],
    ['÷', [[P(18, 50), P(82, 50)], [P(50, 28), P(50, 32)], [P(50, 68), P(50, 72)]]],
    ['<', [[P(76, 18), P(24, 50), P(76, 82)]]],
    ['>', [[P(24, 18), P(76, 50), P(24, 82)]]],
    ['≤', [[P(76, 16), P(24, 46), P(76, 76)], [P(20, 86), P(80, 86)]]],
    ['≥', [[P(24, 16), P(76, 46), P(24, 76)], [P(20, 86), P(80, 86)]]],
    ['√', [[P(14, 46), P(32, 70), P(56, 12), P(90, 76)]]],
    ['π', [[P(26, 82), P(26, 26), P(74, 26), P(74, 82)], [P(14, 18), P(86, 18)]]],
    ['∞', [[P(50, 50), P(32, 30), P(18, 34), P(16, 52), P(32, 70), P(50, 50), P(68, 30), P(84, 34), P(86, 52), P(68, 70), P(50, 50)]]],
    ['→', [[P(14, 50), P(86, 50)], [P(64, 28), P(86, 50), P(64, 72)]]],
    ['←', [[P(86, 50), P(14, 50)], [P(36, 28), P(14, 50), P(36, 72)]]],
    ['↑', [[P(50, 88), P(50, 12)], [P(28, 34), P(50, 12), P(72, 34)]]],
    ['↓', [[P(50, 12), P(50, 88)], [P(28, 66), P(50, 88), P(72, 66)]]],
    ['?', [[P(22, 28), P(46, 12), P(70, 28), P(56, 50), P(50, 60)], [P(50, 84), P(50, 88)]]],
    ['!', [[P(50, 12), P(50, 62)], [P(50, 84), P(50, 88)]]]
  ].map(([label, strokes]) => ({
    label,
    strokes: strokes.map((s) => {
      const pts = s.map(([x, y]) => ({ x, y }));
      return { points: resample(pts, N), length: pathLength(pts) / BOX };
    })
  }));

  const SHAPE_NAMES = {
    line: 'Line', rect: 'Rectangle', square: 'Square', circle: 'Circle',
    ellipse: 'Ellipse', triangle: 'Triangle', arrow: 'Arrow'
  };

  function countCorners(pts, closed) {
    const k = 4;
    const sharp = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - k + pts.length) % pts.length];
      const next = pts[(i + k) % pts.length];
      const cur = pts[i];
      if (!closed && (i < k || i >= pts.length - k)) continue;
      const a = Math.atan2(cur.y - prev.y, cur.x - prev.x);
      const b = Math.atan2(next.y - cur.y, next.x - cur.x);
      let turn = Math.abs(b - a);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      if (turn > 1.1) sharp.push(i); // ~63° or tighter
    }
    let corners = 0, last = -99;
    sharp.forEach((i) => { if (i - last > 10) { corners++; last = i; } });
    if (closed && sharp.length && sharp[0] < 10 && sharp[sharp.length - 1] > pts.length - 10 && corners > 1) corners--;
    return corners;
  }
  function polygonArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  }

  function recogniseShape(strokes, b) {
    const pts = (strokes || []).reduce((acc, s) => acc.concat(s), []);
    if (pts.length < 2) return null;
    const len = pathLength(pts);
    if (len < 20) return null;
    const first = pts[0], last = pts[pts.length - 1];
    const gap = Math.hypot(last.x - first.x, last.y - first.y);
    const closed = gap < Math.max(14, Math.min(b.w, b.h) * 0.3);
    const rs = resample(pts, 48);
    const corners = countCorners(rs, closed);
    const aspect = b.w / b.h;
    let shape = null, score = 0;

    // A line is a single stroke that never strays far from its own chord.
    if (strokes.length === 1 && !closed && gap > 20) {
      let deviation = 0;
      pts.forEach((p) => { deviation = Math.max(deviation, pointSegmentDistance(p, first, last)); });
      if (deviation < Math.max(5, Math.min(b.w, b.h) * 0.14)) {
        shape = 'line'; score = 0.95;
      } else if (corners >= 2 && gap / Math.max(b.w, b.h) > 0.55) {
        const tail = rs.slice(-14);
        const tip = tail[tail.length - 1];
        const back = pointSegmentDistance(tip, tail[0], tail[6]);
        if (back > Math.min(b.w, b.h) * 0.18) { shape = 'arrow'; score = 0.78; }
      }
    }
    if (!shape && closed) {
      const ring = rs.concat([rs[0]]);
      const perimeter = pathLength(ring);
      const circularity = (4 * Math.PI * polygonArea(ring)) / (perimeter * perimeter || 1);
      if (corners <= 1 && circularity > 0.5) {
        shape = aspect > 1.3 || aspect < 0.77 ? 'ellipse' : 'circle';
        score = Math.min(0.98, 0.7 + circularity * 0.3);
      } else if (corners === 3) {
        shape = 'triangle'; score = 0.86;
      } else if (corners >= 4 && corners <= 6) {
        shape = aspect > 0.7 && aspect < 1.4 ? 'square' : 'rect';
        score = corners === 4 ? 0.92 : 0.8;
      }
    }
    if (!shape) return null;
    return { kind: 'shape', shape, label: SHAPE_NAMES[shape], score, bounds: b };
  }

  function recogniseCharacter(strokes, b) {
    const total = (strokes || []).reduce((n, s) => n + s.length, 0);
    if (total < 3) return null;
    const candidate = normaliseStrokes(strokes);
    if (!candidate.length) return null;
    let best = null, second = Infinity;
    TEMPLATES.forEach((t) => {
      const score = matchScore(candidate, t.strokes);
      if (!best || score < best.score) { second = best ? best.score : Infinity; best = { label: t.label, score }; }
      else if (score < second) second = score;
    });
    if (!best || best.score > 25 || second - best.score < 1.5) return null;
    return {
      kind: 'character', label: best.label, score: Math.max(0.5, 1 - best.score / 25), bounds: b,
      category: /^[0-9]$/.test(best.label) ? 'number' : /^[A-Z]$/.test(best.label) ? 'letter' : 'symbol'
    };
  }

  function recognise(strokes) {
    const flat = (strokes || []).reduce((acc, s) => acc.concat(s), []);
    if (flat.length < 2) return null;
    const b = bounds(flat);
    if (b.w < 8 && b.h < 8) return null;
    const shape = recogniseShape(strokes, b);
    if (shape && shape.score >= 0.72) return shape;
    const char = recogniseCharacter(strokes, b);
    if (char) return char;
    if (shape) return shape;
    return null;
  }

  R.wbRecognition = { recognise, bounds, resample, templates: TEMPLATES.length };
})();
