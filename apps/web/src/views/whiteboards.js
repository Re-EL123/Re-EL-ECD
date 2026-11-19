'use strict';

/**
 * Interactive whiteboards: a canvas-first teaching workspace with a compact
 * tool strip, a layers panel, live co-presence, presentation mode and
 * background autosave. State is a small validated vector document.
 */
(function () {
  const R = window.Reel;
  const V = R.views;

  function esc(s) { return R.esc(s == null ? '' : String(s)); }
  function attr(s) { return R.attr(s == null ? '' : String(s)); }
  function uid() { return 'o' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  const TOOLS = {
    select: { label: 'Select', icon: 'mouse-pointer-2', key: 'V', group: 'Navigate' },
    hand: { label: 'Pan', icon: 'hand', key: 'H', group: 'Navigate' },
    pen: { label: 'Pen', icon: 'pencil', key: 'P', group: 'Draw' },
    highlighter: { label: 'Highlighter', icon: 'highlighter', key: 'K', group: 'Draw' },
    eraser: { label: 'Eraser', icon: 'eraser', key: 'E', group: 'Draw' },
    line: { label: 'Line', icon: 'minus', key: 'L', group: 'Shape' },
    arrow: { label: 'Arrow', icon: 'arrow-right', key: 'A', group: 'Shape' },
    rect: { label: 'Rectangle', icon: 'square', key: 'R', group: 'Shape' },
    circle: { label: 'Circle', icon: 'circle', key: 'C', group: 'Shape' },
    text: { label: 'Text', icon: 'type', key: 'T', group: 'Insert' },
    sticky: { label: 'Sticky note', icon: 'sticky-note', key: 'N', group: 'Insert' },
    math: { label: 'Math / science', icon: 'sigma', key: 'M', group: 'Insert' },
    image: { label: 'Image', icon: 'image', key: 'I', group: 'Insert' }
  };
  const TOOL_GROUPS = ['Navigate', 'Draw', 'Shape', 'Insert'];
  const MATH_SYMBOLS = ['+', '−', '×', '÷', '=', '≠', '≈', '<', '>', '≤', '≥', 'π', '√', 'x²', 'x³', '½', '¼', '°', 'α', 'β', 'θ', 'Δ', '∑', '∞', '→', '↔', 'H₂O', 'CO₂', 'O₂', 'NaCl', 'E=mc²'];
  const SWATCHES = ['#1f3b2a', '#B73A3A', '#1f5f7a', '#8a4b32', '#5b3f6e', '#a8620a', '#ffffff'];

  function palette() {
    const dark = typeof document !== 'undefined' && document.documentElement &&
      document.documentElement.getAttribute('data-theme') === 'dark';
    return dark
      ? { bg: '#26322a', grid: 'rgba(210,235,215,0.08)', ink: '#dcebdc', stickyText: '#2b2200', stickyFill: '#f0d77a', selected: '#7fc7e0', laser: '#ff5d5d' }
      : { bg: '#fafbf8', grid: 'rgba(120,140,125,0.12)', ink: '#1f3b2a', stickyText: '#4a3b00', stickyFill: '#FFF4B8', selected: '#3D8FAE', laser: '#e02b2b' };
  }
  function resolvedColor(o, pal) { return o.color === '#1f3b2a' ? pal.ink : (o.color || pal.ink); }

  const imageCache = new Map();
  function cachedImage(src, onLoad) {
    let img = imageCache.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => { if (onLoad) onLoad(); };
      img.src = src;
      imageCache.set(src, img);
    }
    return img;
  }

  // ---- Shared vector renderer ----------------------------------------------
  function objectBounds(o) {
    if (!o) return null;
    if (o.type === 'path' || o.type === 'highlighter') {
      const pts = o.points || [];
      if (!pts.length) return null;
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      pts.forEach((p) => { if (p.x < minx) minx = p.x; if (p.y < miny) miny = p.y; if (p.x > maxx) maxx = p.x; if (p.y > maxy) maxy = p.y; });
      return { x: minx, y: miny, w: Math.max(1, maxx - minx), h: Math.max(1, maxy - miny) };
    }
    if (o.type === 'line' || o.type === 'arrow') return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.max(1, Math.abs(o.x2 - o.x1)), h: Math.max(1, Math.abs(o.y2 - o.y1)) };
    if (o.type === 'rect') return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) };
    if (o.type === 'circle') return { x: o.cx - Math.abs(o.rx), y: o.cy - Math.abs(o.ry), w: Math.abs(o.rx) * 2, h: Math.abs(o.ry) * 2 };
    if (o.type === 'text' || o.type === 'math') return { x: o.x, y: o.y, w: Math.max(40, String(o.text || '').length * ((o.size || 20) * 0.6)), h: (o.size || 20) + 6 };
    if (o.type === 'sticky') return { x: o.x, y: o.y, w: o.w || 180, h: o.h || 140 };
    if (o.type === 'image') return { x: o.x, y: o.y, w: o.w || 240, h: o.h || 160 };
    return null;
  }

  function drawObject(ctx, o, opts) {
    const options = opts || {};
    const pal = options.palette || palette();
    if (o.hidden) return;
    ctx.save();
    if (options.alpha != null) ctx.globalAlpha = options.alpha;
    const c = resolvedColor(o, pal);
    const w = o.width || 2;
    if (o.type === 'path' || o.type === 'highlighter') {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (o.type === 'highlighter') { ctx.globalAlpha = (options.alpha != null ? options.alpha : 1) * 0.35; ctx.lineWidth = Math.max(w, 14); }
      const pts = o.points || [];
      if (pts.length < 2) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc((pts[0] || { x: 0 }).x, (pts[0] || { y: 0 }).y, w / 2, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); }
    } else if (o.type === 'line' || o.type === 'arrow') {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
      if (o.type === 'arrow') {
        const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1); const len = 12 + w;
        ctx.beginPath(); ctx.moveTo(o.x2, o.y2);
        ctx.lineTo(o.x2 - len * Math.cos(ang - 0.4), o.y2 - len * Math.sin(ang - 0.4));
        ctx.moveTo(o.x2, o.y2);
        ctx.lineTo(o.x2 - len * Math.cos(ang + 0.4), o.y2 - len * Math.sin(ang + 0.4));
        ctx.stroke();
      }
    } else if (o.type === 'rect') {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.strokeRect(o.x, o.y, o.w, o.h);
    } else if (o.type === 'circle') {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(o.cx, o.cy, Math.abs(o.rx), Math.abs(o.ry), 0, 0, Math.PI * 2); ctx.stroke();
    } else if (o.type === 'text' || o.type === 'math') {
      ctx.fillStyle = c;
      const family = o.font === 'serif' ? 'Georgia, serif' : o.font === 'mono' ? 'monospace' : '"Segoe UI", Arial, sans-serif';
      ctx.font = (o.size || (o.type === 'math' ? 28 : 20)) + 'px ' + family;
      ctx.textBaseline = 'top'; ctx.fillText(o.text || '', o.x, o.y);
    } else if (o.type === 'sticky') {
      const ww = o.w || 180, hh = o.h || 140;
      ctx.fillStyle = o.fill || pal.stickyFill; ctx.strokeStyle = pal.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(o.x, o.y, ww, hh, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = pal.stickyText;
      const family = o.font === 'serif' ? 'Georgia, serif' : o.font === 'mono' ? 'monospace' : '"Segoe UI", Arial, sans-serif';
      ctx.font = '16px ' + family; ctx.textBaseline = 'top';
      String(o.text || '').split('\n').forEach((ln, i) => ctx.fillText(ln, o.x + 12, o.y + 12 + i * 22));
    } else if (o.type === 'image' && o.src) {
      const img = cachedImage(o.src, options.onLoad);
      if (img.complete && img.naturalWidth) ctx.drawImage(img, o.x, o.y, o.w || 240, o.h || 160);
      else { ctx.fillStyle = pal.grid; ctx.fillRect(o.x, o.y, o.w || 240, o.h || 160); }
    }
    if (options.selected) {
      const b = objectBounds(o);
      if (b) {
        ctx.strokeStyle = pal.selected; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); ctx.setLineDash([]);
        if (options.handles) {
          ctx.setLineDash([]); ctx.fillStyle = pal.bg; ctx.strokeStyle = pal.selected; ctx.lineWidth = 1.5;
          [[b.x - 4, b.y - 4], [b.x + b.w + 4, b.y - 4], [b.x - 4, b.y + b.h + 4], [b.x + b.w + 4, b.y + b.h + 4]].forEach(([hx, hy]) => {
            ctx.beginPath(); ctx.rect(hx - 5, hy - 5, 10, 10); ctx.fill(); ctx.stroke();
          });
        }
      }
    }
    ctx.restore();
  }

  function boardBounds(objects) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    (objects || []).forEach((o) => {
      const b = objectBounds(o);
      if (!b) return;
      minx = Math.min(minx, b.x); miny = Math.min(miny, b.y);
      maxx = Math.max(maxx, b.x + b.w); maxy = Math.max(maxy, b.y + b.h);
    });
    if (!Number.isFinite(minx)) return { x: 0, y: 0, w: 900, h: 500 };
    return { x: minx, y: miny, w: Math.max(1, maxx - minx), h: Math.max(1, maxy - miny) };
  }

  function renderToCanvas(canvas, state, width, height, opts) {
    if (!canvas) return;
    const options = opts || {};
    const dpr = options.dpr || window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pal = palette();
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, width, height);
    const objects = (state && state.objects) || [];
    if (!objects.length) {
      ctx.fillStyle = pal.ink; ctx.globalAlpha = 0.5; ctx.font = '12px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Empty canvas', width / 2, height / 2); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      return;
    }
    const b = boardBounds(objects);
    const pad = options.pad == null ? 12 : options.pad;
    const scale = Math.min((width - pad * 2) / b.w, (height - pad * 2) / b.h, 1.4);
    ctx.save();
    ctx.translate(pad - b.x * scale, pad - b.y * scale); ctx.scale(scale, scale);
    objects.forEach((o) => drawObject(ctx, o, { palette: pal, onLoad: options.onLoad }));
    ctx.restore();
  }

  function stateToPng(state, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width || 1600; canvas.height = height || 900;
    const ctx = canvas.getContext('2d');
    const pal = palette();
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const objects = (state && state.objects) || [];
    const b = boardBounds(objects);
    const pad = 60;
    const scale = Math.min((canvas.width - pad * 2) / b.w, (canvas.height - pad * 2) / b.h, 2);
    ctx.save(); ctx.translate(pad - b.x * scale, pad - b.y * scale); ctx.scale(scale, scale);
    objects.forEach((o) => drawObject(ctx, o, { palette: pal }));
    ctx.restore();
    return canvas.toDataURL('image/png');
  }

  // ---- Canvas engine -------------------------------------------------------
  function newBoardCanvas(container, initialState, onChange, options) {
    const opts = options || {};
    const canvas = document.createElement('canvas');
    canvas.className = 'wb-canvas';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let state = JSON.parse(JSON.stringify(initialState || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } }));
    state.objects = state.objects || [];
    state.viewport = state.viewport || { x: 0, y: 0, zoom: 1 };

    let tool = 'pen';
    let color = '#1f3b2a';
    let strokeW = 3;
    let drawing = null;
    let panning = false;
    let panStart = null;
    let spacePan = false;
    let selectedId = null;
    let selectedIds = new Set();
    let snap = false;
    let readOnly = Boolean(opts.readOnly);
    let undo = [];
    let redo = [];
    let editor = null;
    let laser = [];
    let lastCursor = null;
    let laserTimer = null;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = Math.max(300, Math.floor(rect.width * dpr));
      canvas.height = Math.max(300, Math.floor(rect.height * dpr));
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    }
    function vp() { return state.viewport; }
    function toWorld(pt) { const v = vp(); return { x: (pt.x - v.x) / v.zoom, y: (pt.y - v.y) / v.zoom }; }
    function toScreen(pt) { const v = vp(); return { x: pt.x * v.zoom + v.x, y: pt.y * v.zoom + v.y }; }
    function point(e) { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
    function grid(pt) { return snap ? { x: Math.round(pt.x / 20) * 20, y: Math.round(pt.y / 20) * 20 } : pt; }
    function pushUndo() { undo.push(JSON.stringify(state.objects)); if (undo.length > 120) undo.shift(); redo = []; }
    function notify() { if (onChange) onChange(JSON.parse(JSON.stringify(state))); if (opts.onObjects) opts.onObjects(objectsSummary()); }
    function isEditing() { return Boolean(editor); }
    function objectsSummary() { return state.objects.map((o) => ({ id: o.id, type: o.type, hidden: Boolean(o.hidden), locked: Boolean(o.locked), groupId: o.groupId || null })).reverse(); }

    function drawGrid() {
      const v = vp(); const rect = canvas.getBoundingClientRect(); const step = 40 * v.zoom;
      if (step < 10) return;
      const pal = palette();
      const offX = ((v.x % step) + step) % step; const offY = ((v.y % step) + step) % step;
      ctx.save(); ctx.strokeStyle = pal.grid; ctx.lineWidth = 1;
      for (let x = offX; x < rect.width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke(); }
      for (let y = offY; y < rect.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke(); }
      ctx.restore();
    }

    function render() {
      const rect = canvas.getBoundingClientRect();
      const pal = palette();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, rect.width, rect.height);
      drawGrid();
      const v = vp();
      ctx.save(); ctx.translate(v.x, v.y); ctx.scale(v.zoom, v.zoom);
      state.objects.forEach((o) => drawObject(ctx, o, {
        palette: pal, onLoad: render,
        selected: selectedIds.has(o.id) || o.id === selectedId,
        handles: o.id === selectedId && tool === 'select' && !readOnly
      }));
      if (drawing && !drawing.drag && !drawing.resize && !drawing.erasing) drawObject(ctx, drawing, { alpha: 0.9, palette: pal });
      if (laser.length) {
        const now = Date.now();
        laser = laser.filter((p) => now - p.t < 900);
        if (laser.length > 1) {
          ctx.save(); ctx.strokeStyle = pal.laser; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (let i = 1; i < laser.length; i++) {
            const age = (now - laser[i].t) / 900;
            ctx.globalAlpha = Math.max(0, 1 - age);
            ctx.beginPath(); ctx.moveTo(laser[i - 1].x, laser[i - 1].y); ctx.lineTo(laser[i].x, laser[i].y); ctx.stroke();
          }
          ctx.restore();
        }
      }
      ctx.restore();
      canvas.style.cursor = panning || spacePan || tool === 'hand' ? 'grab' : (readOnly && !['select', 'hand', 'laser'].includes(tool) ? 'not-allowed' : (tool === 'select' ? 'default' : 'crosshair'));
      if (opts.onSelection) opts.onSelection(selectedId ? state.objects.find((o) => o.id === selectedId) || null : Array.from(selectedIds));
      if (opts.onViewport) opts.onViewport(vp());
    }

    function hitTest(wpt) {
      for (let i = state.objects.length - 1; i >= 0; i -= 1) {
        const o = state.objects[i];
        if (o.hidden || o.locked) continue;
        const b = objectBounds(o);
        if (b && wpt.x >= b.x - 6 && wpt.x <= b.x + b.w + 6 && wpt.y >= b.y - 6 && wpt.y <= b.y + b.h + 6) return o;
      }
      return null;
    }

    function handleAt(spt) {
      const obj = state.objects.find((o) => o.id === selectedId);
      if (!obj || obj.locked || tool !== 'select') return null;
      const b = objectBounds(obj); if (!b) return null;
      const corners = [
        { key: 'nw', x: toScreen({ x: b.x, y: b.y }).x - 4, y: toScreen({ x: b.x, y: b.y }).y - 4 },
        { key: 'ne', x: toScreen({ x: b.x + b.w, y: b.y }).x - 4, y: toScreen({ x: b.x + b.w, y: b.y }).y - 4 },
        { key: 'sw', x: toScreen({ x: b.x, y: b.y + b.h }).x - 4, y: toScreen({ x: b.x, y: b.y + b.h }).y - 4 },
        { key: 'se', x: toScreen({ x: b.x + b.w, y: b.y + b.h }).x - 4, y: toScreen({ x: b.x + b.w, y: b.y + b.h }).y - 4 }
      ];
      return corners.find((c) => Math.abs(c.x - spt.x) <= 9 && Math.abs(c.y - spt.y) <= 9) || null;
    }

    function scaleObjectToBounds(base, from, to) {
      const o = JSON.parse(JSON.stringify(base));
      const sx = to.w / Math.max(1, from.w), sy = to.h / Math.max(1, from.h);
      const mapX = (x) => to.x + (x - from.x) * sx;
      const mapY = (y) => to.y + (y - from.y) * sy;
      if (o.type === 'path' || o.type === 'highlighter') o.points = (o.points || []).map((p) => ({ x: mapX(p.x), y: mapY(p.y) }));
      else if (o.type === 'line' || o.type === 'arrow') { o.x1 = mapX(o.x1); o.x2 = mapX(o.x2); o.y1 = mapY(o.y1); o.y2 = mapY(o.y2); }
      else if (o.type === 'rect' || o.type === 'sticky' || o.type === 'image') { o.x = mapX(from.x); o.y = mapY(from.y); o.w = from.w * sx; o.h = from.h * sy; }
      else if (o.type === 'circle') { o.cx = mapX(base.cx); o.cy = mapY(base.cy); o.rx = Math.abs(base.rx) * sx; o.ry = Math.abs(base.ry) * sy; }
      else if (o.type === 'text' || o.type === 'math') { o.x = mapX(from.x); o.y = mapY(from.y); o.size = Math.max(8, Math.min(120, (base.size || 20) * Math.max(sx, sy))); }
      return o;
    }

    function openEditor(spt, wpt, kind, seed) {
      closeEditor();
      const position = toScreen(wpt);
      const holder = document.createElement('div');
      holder.className = 'wb-inline-editor';
      holder.style.left = Math.max(8, Math.min(container.clientWidth - 250, position.x)) + 'px';
      holder.style.top = Math.max(8, Math.min(container.clientHeight - 180, position.y)) + 'px';
      const multi = kind === 'sticky';
      holder.innerHTML = (kind === 'image'
        ? '<input class="wb-inline-input" type="url" placeholder="Paste an image URL…" value="' + esc(seed || '') + '">'
        : '<textarea class="wb-inline-input" rows="' + (multi ? 4 : 2) + '" placeholder="' +
          (multi ? 'Write your note…' : kind === 'math' ? 'Expression or symbol…' : 'Type here…') + '">' + esc(seed || '') + '</textarea>') +
        (kind === 'text' || kind === 'sticky' || kind === 'math'
          ? '<div class="wb-inline-row"><label>Font <select class="wb-inline-font"><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>' +
            '<label>Size <input class="wb-inline-size" type="number" min="8" max="120" value="' + (kind === 'math' ? 28 : 20) + '"></label></div>' : '') +
        '<div class="wb-inline-actions"><button type="button" class="btn btn-sm btn-ghost" data-wb-cancel>Cancel</button>' +
        '<button type="button" class="btn btn-sm btn-primary" data-wb-done>Add</button></div>';
      container.appendChild(holder);
      const input = holder.querySelector('.wb-inline-input');
      editor = { holder, input, wpt, kind };
      input.focus(); input.select();
      function commit() {
        const value = input.value.trim();
        const target = editor && editor.wpt;
        const font = holder.querySelector('.wb-inline-font') && holder.querySelector('.wb-inline-font').value;
        const size = holder.querySelector('.wb-inline-size') && Number(holder.querySelector('.wb-inline-size').value);
        closeEditor();
        if (!value || readOnly || !target) return;
        pushUndo();
        if (kind === 'sticky') state.objects.push({ id: uid(), type: 'sticky', x: target.x, y: target.y, w: 180, h: 140, text: value, fill: palette().stickyFill, font: font || 'sans' });
        else if (kind === 'math') state.objects.push({ id: uid(), type: 'math', color, size: size || 28, x: target.x, y: target.y, text: value, font: font || 'sans' });
        else if (kind === 'text') state.objects.push({ id: uid(), type: 'text', color, size: size || 22, x: target.x, y: target.y, text: value, font: font || 'sans' });
        else if (kind === 'image') state.objects.push({ id: uid(), type: 'image', x: target.x, y: target.y, w: 280, h: 180, src: value });
        render(); notify();
      }
      function cancel() { closeEditor(); }
      holder.querySelector('[data-wb-done]').addEventListener('click', commit);
      holder.querySelector('[data-wb-cancel]').addEventListener('click', cancel);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
      });
    }
    function closeEditor() { if (editor) { editor.holder.remove(); editor = null; } }

    function canDraw() { return !readOnly && !isEditing(); }

    function onPointerDown(e) {
      if (isEditing()) return;
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      const spt = point(e);
      const wpt = grid(toWorld(spt));
      lastCursor = wpt;
      if (panning || spacePan || tool === 'hand' || e.button === 1) {
        panning = true; panStart = { x: spt.x - vp().x, y: spt.y - vp().y }; return;
      }
      if (tool === 'laser') { laser.push({ x: wpt.x, y: wpt.y, t: Date.now() }); render(); return; }
      if (tool === 'select') {
        const handle = handleAt(spt);
        if (handle && canDraw()) {
          const orig = state.objects.find((o) => o.id === selectedId);
          drawing = { resize: true, handle: handle.key, orig: JSON.parse(JSON.stringify(orig)), start: wpt, from: objectBounds(orig) };
          return;
        }
        const hit = hitTest(wpt);
        if (e.shiftKey && hit) {
          if (selectedIds.has(hit.id)) selectedIds.delete(hit.id); else selectedIds.add(hit.id);
          selectedId = hit.id; render(); return;
        }
        if (hit) {
          if (!selectedIds.has(hit.id)) selectedIds = new Set([hit.id]);
          selectedId = hit.id;
          const origs = state.objects.filter((o) => selectedIds.has(o.id)).map((o) => ({ id: o.id, obj: JSON.parse(JSON.stringify(o)) }));
          if (canDraw()) drawing = { drag: true, start: wpt, origs };
        } else { selectedIds = new Set(); selectedId = null; }
        render(); return;
      }
      if (!canDraw()) return;
      if (tool === 'eraser') {
        const hit = hitTest(wpt);
        if (hit) { pushUndo(); state.objects = state.objects.filter((o) => o.id !== hit.id); selectedIds.delete(hit.id); render(); notify(); }
        drawing = { erasing: true }; return;
      }
      if (tool === 'pen' || tool === 'highlighter') {
        drawing = { id: uid(), type: tool === 'highlighter' ? 'highlighter' : 'path', color, width: tool === 'highlighter' ? 16 : strokeW, points: [wpt] };
      } else if (tool === 'line' || tool === 'arrow') {
        drawing = { id: uid(), type: tool, color, width: strokeW, x1: wpt.x, y1: wpt.y, x2: wpt.x, y2: wpt.y };
      } else if (tool === 'rect') {
        drawing = { id: uid(), type: 'rect', color, width: strokeW, x: wpt.x, y: wpt.y, w: 0, h: 0 };
      } else if (tool === 'circle') {
        drawing = { id: uid(), type: 'circle', color, width: strokeW, cx: wpt.x, cy: wpt.y, rx: 0, ry: 0 };
      } else if (tool === 'text' || tool === 'sticky' || tool === 'math' || tool === 'image') {
        openEditor(spt, wpt, tool); render(); return;
      }
      render();
    }

    function onPointerMove(e) {
      if (isEditing()) return;
      const spt = point(e);
      const wpt = grid(toWorld(spt));
      lastCursor = wpt;
      if (tool === 'laser') { laser.push({ x: wpt.x, y: wpt.y, t: Date.now() }); render(); return; }
      if (panning && panStart) { vp().x = spt.x - panStart.x; vp().y = spt.y - panStart.y; render(); return; }
      if (!drawing) return;
      if (drawing.erasing) {
        const hit = hitTest(wpt);
        if (hit) { if (!drawing._did) { pushUndo(); drawing._did = true; } state.objects = state.objects.filter((o) => o.id !== hit.id); render(); notify(); }
        return;
      }
      if (drawing.resize) {
        const from = drawing.from; const key = drawing.handle;
        let x1 = from.x, y1 = from.y, x2 = from.x + from.w, y2 = from.y + from.h;
        if (key.indexOf('w') !== -1) x1 = wpt.x;
        if (key.indexOf('e') !== -1) x2 = wpt.x;
        if (key.indexOf('n') !== -1) y1 = wpt.y;
        if (key.indexOf('s') !== -1) y2 = wpt.y;
        const to = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(4, Math.abs(x2 - x1)), h: Math.max(4, Math.abs(y2 - y1)) };
        const at = state.objects.findIndex((o) => o.id === drawing.orig.id);
        if (at !== -1) state.objects[at] = scaleObjectToBounds(drawing.orig, from, to);
        render(); return;
      }
      if (drawing.drag) {
        const dx = wpt.x - drawing.start.x, dy = wpt.y - drawing.start.y;
        drawing.origs.forEach(({ id, obj }) => {
          const at = state.objects.findIndex((o) => o.id === id);
          if (at === -1) return;
          const o = state.objects[at];
          if (o.type === 'path' || o.type === 'highlighter') o.points = (obj.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
          else if (o.type === 'line' || o.type === 'arrow') { o.x1 = obj.x1 + dx; o.y1 = obj.y1 + dy; o.x2 = obj.x2 + dx; o.y2 = obj.y2 + dy; }
          else if (o.type === 'circle') { o.cx = obj.cx + dx; o.cy = obj.cy + dy; }
          else { o.x = obj.x + dx; o.y = obj.y + dy; }
        });
        render(); return;
      }
      if (drawing.type === 'path' || drawing.type === 'highlighter') drawing.points.push(wpt);
      else if (drawing.type === 'line' || drawing.type === 'arrow') { drawing.x2 = wpt.x; drawing.y2 = wpt.y; }
      else if (drawing.type === 'rect' || drawing.type === 'image') { drawing.w = wpt.x - drawing.x; drawing.h = wpt.y - drawing.y; }
      else if (drawing.type === 'circle') { drawing.rx = wpt.x - drawing.cx; drawing.ry = wpt.y - drawing.cy; }
      render();
    }

    function onPointerUp() {
      if (panning) { panning = false; panStart = null; notify(); return; }
      if (!drawing) return;
      if (drawing.drag || drawing.resize) { pushUndo(); notify(); drawing = null; render(); return; }
      if (drawing.erasing) { drawing = null; return; }
      if (drawing.type === 'path' || drawing.type === 'highlighter') {
        if ((drawing.points || []).length > 1) { pushUndo(); state.objects.push(drawing); notify(); }
      } else if (drawing.type === 'line' || drawing.type === 'arrow') {
        if (Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1) > 2) { pushUndo(); state.objects.push(drawing); notify(); }
      } else if (drawing.type === 'rect' || drawing.type === 'image') {
        if (Math.abs(drawing.w) > 2 || Math.abs(drawing.h) > 2) { pushUndo(); state.objects.push(drawing); notify(); }
      } else if (drawing.type === 'circle') {
        if (Math.abs(drawing.rx) > 2 || Math.abs(drawing.ry) > 2) { pushUndo(); state.objects.push(drawing); notify(); }
      }
      drawing = null; render();
    }

    function onWheel(e) {
      e.preventDefault();
      const spt = point(e); const before = toWorld(spt);
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const nz = Math.min(5, Math.max(0.1, vp().zoom * factor));
      vp().zoom = nz; vp().x = spt.x - before.x * nz; vp().y = spt.y - before.y * nz;
      render(); notify();
    }

    function onKeyDown(e) {
      const tag = (e.target && e.target.tagName) || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (e.code === 'Space') { e.preventDefault(); spacePan = true; render(); }
    }
    function onKeyUp(e) { if (e.code === 'Space') { spacePan = false; render(); } }
    function onBlur() { spacePan = false; render(); }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    laserTimer = setInterval(() => { if (laser.length) render(); }, 120);

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(container); else window.addEventListener('resize', resize);
    resize();

    function moveSelected(direction) {
      if (readOnly || !selectedIds.size) return;
      pushUndo();
      const ids = new Set(selectedIds);
      const picked = state.objects.filter((o) => ids.has(o.id));
      state.objects = state.objects.filter((o) => !ids.has(o.id));
      if (direction === 'front') state.objects.push(...picked);
      else if (direction === 'back') state.objects.unshift(...picked);
      else {
        const anchor = picked[picked.length - 1];
        const at = state.objects.indexOf(anchor);
        const insert = direction === 'forward' ? Math.min(state.objects.length, at + 1) : Math.max(0, at - 1);
        state.objects.splice(insert, 0, ...picked);
      }
      render(); notify();
    }

    function diffOps(previous) {
      const before = Array.isArray(previous) ? previous : [];
      const after = state.objects;
      const beforeMap = new Map(before.map((o) => [o.id, o]));
      const afterMap = new Map(after.map((o) => [o.id, o]));
      const ops = [];
      after.forEach((o) => {
        const prior = beforeMap.get(o.id);
        if (!prior) ops.push({ type: 'add', object: o });
        else if (JSON.stringify(prior) !== JSON.stringify(o)) ops.push({ type: 'set', object: o });
      });
      before.forEach((o) => { if (!afterMap.has(o.id)) ops.push({ type: 'delete', id: o.id }); });
      return ops;
    }

    return {
      setTool(t) { tool = t; closeEditor(); render(); },
      getTool() { return tool; },
      setColor(c) { color = c; },
      setWidth(w) { strokeW = w; },
      setSnap(on) { snap = Boolean(on); },
      getSnap() { return snap; },
      setReadOnly(on) { readOnly = Boolean(on); if (readOnly) closeEditor(); render(); },
      isReadOnly() { return readOnly; },
      addMathSymbol(sym) {
        if (readOnly) return;
        pushUndo(); const v = vp(); const rect = canvas.getBoundingClientRect();
        state.objects.push({ id: uid(), type: 'math', color, size: 32, x: (rect.width / 2 - v.x) / v.zoom, y: (rect.height / 2 - v.y) / v.zoom, text: sym, font: 'sans' });
        render(); notify();
      },
      addImage(src) {
        if (readOnly || !/^https?:\/\//i.test(src)) return;
        pushUndo(); const v = vp(); const rect = canvas.getBoundingClientRect();
        state.objects.push({ id: uid(), type: 'image', x: (rect.width / 2 - v.x) / v.zoom, y: (rect.height / 2 - v.y) / v.zoom, w: 280, h: 180, src });
        render(); notify();
      },
      insertTemplate(kind) {
        const tpl = TEMPLATES[kind];
        if (!tpl || readOnly) return;
        pushUndo();
        const v = vp(); const rect = canvas.getBoundingClientRect();
        const cx = (rect.width / 2 - v.x) / v.zoom, cy = (rect.height / 2 - v.y) / v.zoom;
        tpl.state.objects.forEach((o) => {
          const copy = JSON.parse(JSON.stringify(o));
          copy.id = uid();
          copy.x = (copy.x || 0) - 60 + cx / 2;
          copy.y = (copy.y || 0) - 40 + cy / 2;
          state.objects.push(copy);
        });
        render(); notify();
      },
      updateSelected(patch) {
        if (readOnly || !selectedIds.size) return;
        pushUndo();
        state.objects.forEach((o) => { if (selectedIds.has(o.id)) Object.assign(o, patch); });
        render(); notify();
      },
      deleteSelected() {
        if (readOnly || !selectedIds.size) return;
        pushUndo(); state.objects = state.objects.filter((o) => !selectedIds.has(o.id));
        selectedIds = new Set(); selectedId = null; render(); notify();
      },
      undo() { if (!undo.length || readOnly) return; redo.push(JSON.stringify(state.objects)); state.objects = JSON.parse(undo.pop()); selectedIds = new Set(); selectedId = null; render(); notify(); },
      redo() { if (!redo.length || readOnly) return; undo.push(JSON.stringify(state.objects)); state.objects = JSON.parse(redo.pop()); selectedIds = new Set(); selectedId = null; render(); notify(); },
      clear() { if (!state.objects.length || readOnly) return; pushUndo(); state.objects = []; selectedIds = new Set(); selectedId = null; render(); notify(); },
      zoomIn() { this.setZoom(vp().zoom * 1.2); },
      zoomOut() { this.setZoom(vp().zoom / 1.2); },
      setZoom(z) {
        const rect = canvas.getBoundingClientRect(); const spt = { x: rect.width / 2, y: rect.height / 2 };
        const before = toWorld(spt); const nz = Math.min(5, Math.max(0.1, z));
        vp().zoom = nz; vp().x = spt.x - before.x * nz; vp().y = spt.y - before.y * nz;
        render(); notify();
      },
      resetView() { vp().x = 0; vp().y = 0; vp().zoom = 1; render(); notify(); },
      fitToContent() {
        const rect = canvas.getBoundingClientRect(); const b = boardBounds(state.objects);
        const zoom = Math.min(5, Math.max(0.1, Math.min((rect.width - 60) / b.w, (rect.height - 60) / b.h)));
        vp().zoom = zoom;
        vp().x = (rect.width - b.w * zoom) / 2 - b.x * zoom;
        vp().y = (rect.height - b.h * zoom) / 2 - b.y * zoom;
        render(); notify();
      },
      setViewport(next) { state.viewport = Object.assign({}, next); render(); },
      getViewport() { return Object.assign({}, vp()); },
      getSelectedIds() { return Array.from(selectedIds); },
      setSelectedIds(ids) { selectedIds = new Set(ids || []); selectedId = ids && ids[0] ? ids[0] : null; render(); },
      selectAll() { selectedIds = new Set(state.objects.map((o) => o.id)); render(); },
      toggleHidden(id) { const o = state.objects.find((x) => x.id === id); if (o && !readOnly) { pushUndo(); o.hidden = !o.hidden; render(); notify(); } },
      toggleLocked(id) { const o = state.objects.find((x) => x.id === id); if (o && !readOnly) { pushUndo(); o.locked = !o.locked; render(); notify(); } },
      groupSelected() {
        if (readOnly || selectedIds.size < 2) return;
        const already = state.objects.filter((o) => selectedIds.has(o.id)).every((o) => o.groupId && o.groupId === state.objects.find((x) => selectedIds.has(x.id)).groupId);
        const gid = already ? null : 'g' + Date.now().toString(36);
        pushUndo(); state.objects.forEach((o) => { if (selectedIds.has(o.id)) o.groupId = gid; });
        render(); notify();
      },
      reorderObject(id, targetId) {
        if (readOnly || id === targetId) return;
        const from = state.objects.findIndex((o) => o.id === id);
        const to = state.objects.findIndex((o) => o.id === targetId);
        if (from === -1 || to === -1) return;
        pushUndo(); const [obj] = state.objects.splice(from, 1);
        state.objects.splice(to, 0, obj); render(); notify();
      },
      getObjects() { return objectsSummary(); },
      getSelected() { return selectedId ? state.objects.find((o) => o.id === selectedId) || null : null; },
      getCursor() { return lastCursor; },
      moveSelected,
      diffOps,
      exportPNG(width, height) { return stateToPng(state, width, height); },
      setState(s, opts) {
        state = JSON.parse(JSON.stringify(s || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } }));
        state.objects = state.objects || []; state.viewport = state.viewport || { x: 0, y: 0, zoom: 1 };
        if (!opts || !opts.keepHistory) { undo = []; redo = []; }
        selectedIds = new Set(); selectedId = null; closeEditor(); render();
      },
      destroy() {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('wheel', onWheel);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
        clearInterval(laserTimer);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        closeEditor(); canvas.remove();
      }
    };
  }

  /* Ready-made board templates — each seeds a valid canvas state. */
  const TEMPLATES = {
    math: {
      label: 'Maths canvas', hint: 'Counting, number lines and problem-solving frames.', icon: 'sigma', title: 'Maths canvas',
      state: { viewport: { x: 0, y: 0, zoom: 1 }, objects: [
        { type: 'text', x: 60, y: 46, text: 'Counting to 20', size: 34, color: '#17281c', font: 'sans' },
        { type: 'arrow', x1: 60, y1: 152, x2: 840, y2: 152, color: '#2f5c3c', width: 3 },
        { type: 'sticky', x: 60, y: 196, w: 175, h: 132, text: '1–5\nCount out loud\ntogether.' },
        { type: 'sticky', x: 262, y: 196, w: 175, h: 132, text: '6–10\nPoint at each\nnumber.' },
        { type: 'sticky', x: 464, y: 196, w: 175, h: 132, text: '11–15\nCount backwards\nfrom 15.' },
        { type: 'sticky', x: 666, y: 196, w: 175, h: 132, text: '16–20\nWhat comes\nnext?' }
      ] }
    },
    story: {
      label: 'Story retell', hint: 'Beginning, middle and end — the shape of every tale.', icon: 'book-open', title: 'Story retell',
      state: { viewport: { x: 0, y: 0, zoom: 1 }, objects: [
        { type: 'text', x: 60, y: 46, text: 'Story retell', size: 34, color: '#17281c', font: 'sans' },
        { type: 'sticky', x: 60, y: 150, w: 230, h: 176, text: 'Beginning\nWho is in the\nstory? Where?' },
        { type: 'arrow', x1: 312, y1: 238, x2: 380, y2: 238, color: '#2f5c3c', width: 3 },
        { type: 'sticky', x: 400, y: 150, w: 230, h: 176, text: 'Middle\nWhat happens?\nWhat changes?' },
        { type: 'arrow', x1: 652, y1: 238, x2: 720, y2: 238, color: '#2f5c3c', width: 3 },
        { type: 'sticky', x: 740, y: 150, w: 230, h: 176, text: 'End\nHow does it\nfinish?' }
      ] }
    },
    rhyme: {
      label: 'Rhyme / song board', hint: 'Verse-by-verse with space to add movement cues.', icon: 'music', title: 'Rhyme of the day',
      state: { viewport: { x: 0, y: 0, zoom: 1 }, objects: [
        { type: 'text', x: 60, y: 46, text: 'Rhyme of the day', size: 34, color: '#17281c', font: 'sans' },
        { type: 'sticky', x: 80, y: 150, w: 780, h: 210, text: 'Sing it together:\n\nLine one…\nLine two…\nLine three…\nLine four…\n\nClap on every third word.' }
      ] }
    },
    shape: {
      label: 'Shape sorter', hint: 'Sort, match and name — geometry for little hands.', icon: 'shapes', title: 'Shape sorter',
      state: { viewport: { x: 0, y: 0, zoom: 1 }, objects: [
        { type: 'text', x: 60, y: 46, text: 'Shape sorter', size: 34, color: '#17281c', font: 'sans' },
        { type: 'sticky', x: 80, y: 150, w: 170, h: 120, text: 'Circles\nRound like\na ball?' },
        { type: 'sticky', x: 280, y: 150, w: 170, h: 120, text: 'Squares\nFour equal\nsides?' },
        { type: 'sticky', x: 480, y: 150, w: 170, h: 120, text: 'Triangles\nThree\nsides?' },
        { type: 'sticky', x: 680, y: 150, w: 170, h: 120, text: 'Rectangles\nTwo long,\ntwo short?' }
      ] }
    }
  };

  function templateButton(kind) {
    const t = TEMPLATES[kind];
    return '<button type="button" class="wb-template" @click="openNamedModal(\'whiteboardTemplate\',\'' + kind + '\')">' +
      '<span class="empty-icon">' + R.icon(t.icon) + '</span>' +
      '<span class="wb-template-title">' + esc(t.label) + '</span>' +
      '<span class="muted small">' + esc(t.hint) + '</span>' +
      '<span class="wb-template-cta">Use template ' + R.icon('arrow-right') + '</span>' +
    '</button>';
  }

  // ---- List view -----------------------------------------------------------
  V.whiteboards = {
    async load(ctx) {
      const archived = String((ctx.filters || {}).archived || '') === 'true';
      const [boards, plans] = await Promise.all([
        R.api('GET', '/whiteboards' + (archived ? '?archived=true' : '')).then((p) => p.data || []).catch(() => []),
        R.api('GET', '/curriculum/lesson-plans?pageSize=100').then((p) => (Array.isArray(p.data) ? p.data : (p.data && p.data.data) || [])).catch(() => [])
      ]);
      return { boards, plans };
    },

    render(ctx, params, page) {
      const boards = page.boards || [];
      const canEdit = ctx.has('curriculum.create.daycare');
      const filters = ctx.filters || {};
      const query = String(filters.q || '').trim().toLowerCase();
      const linked = String(filters.linked || 'all');
      const sort = String(filters.sort || 'recent');
      const showArchived = String(filters.archived || '') === 'true';

      let list = boards.slice();
      if (linked === 'linked') list = list.filter((b) => !!b.lessonPlanId);
      else if (linked === 'unlinked') list = list.filter((b) => !b.lessonPlanId);
      if (query) list = list.filter((b) => String(b.title + ' ' + (b.description || '') + ' ' + (b.createdByName || '') + ' ' + (b.classroomName || '')).toLowerCase().includes(query));
      if (sort === 'az') list.sort((a, b) => String(a.title).localeCompare(String(b.title)));
      else if (sort === 'items') list.sort((a, b) => (b.objectCount || 0) - (a.objectCount || 0));
      else list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      const headActions =
        (canEdit ? '<button class="btn btn-primary btn-sm" @click="wbNewMenu($event.currentTarget)">' + R.icon('plus') + ' New whiteboard</button>' : '') +
        '<button class="btn btn-sm btn-secondary" @click="wbNewMenu($event.currentTarget)">' + R.icon('layout-template') + ' Templates</button>' +
        R.exportButtons('/exports/whiteboards') + R.refreshButton();
      let html = R.pageHead('Whiteboards', 'Infinite digital canvases for teaching, annotation, math/science sketching and collaborative problem-solving.', headActions);
      html += R.teachingNav(ctx, 'whiteboards');

      const week = boards.filter((b) => (Date.now() - new Date(b.updatedAt).getTime()) < 7 * 86400000).length;
      const items = boards.reduce((n, b) => n + (b.objectCount || 0), 0);
      html += '<div class="grid grid-3 section">' +
        R.statCard({ label: 'Boards', value: R.number(boards.length), icon: 'presentation', foot: 'In your workspace' }) +
        R.statCard({ label: 'Recently active', value: R.number(week), icon: 'clock', tone: 'sky', foot: 'Updated this week' }) +
        R.statCard({ label: 'Objects drawn', value: R.number(items), icon: 'shapes', tone: 'green', foot: 'Across all boards' }) +
        '</div>';

      html += '<div class="card glass wb-filters section">' +
        R.searchFilter(ctx, 'q', 'Search boards…') +
        '<select class="select" @change="setFilter(\'linked\',$event.target.value)" aria-label="Filter boards by plan link">' +
          '<option value="all"' + (linked === 'all' ? ' selected' : '') + '>All boards</option>' +
          '<option value="linked"' + (linked === 'linked' ? ' selected' : '') + '>Linked to lesson plans</option>' +
          '<option value="unlinked"' + (linked === 'unlinked' ? ' selected' : '') + '>Not linked</option>' +
        '</select>' +
        '<select class="select" @change="setFilter(\'sort\',$event.target.value)" aria-label="Sort boards">' +
          '<option value="recent"' + (sort === 'recent' ? ' selected' : '') + '>Recently updated</option>' +
          '<option value="az"' + (sort === 'az' ? ' selected' : '') + '>Name A–Z</option>' +
          '<option value="items"' + (sort === 'items' ? ' selected' : '') + '>Most objects</option>' +
        '</select>' +
        (canEdit ? '<button class="btn btn-sm ' + (showArchived ? 'btn-primary' : 'btn-secondary') + '" @click="setFilter(\'archived\',' + (showArchived ? '\'\'' : '\'true\'') + ')">' + R.icon('archive') + ' ' + (showArchived ? 'Active boards' : 'Archived') + '</button>' : '') +
      '</div>';

      if (!list.length) {
        if (!boards.length) {
          const plans = (page.plans || []).slice(0, 100);
          html += '<h2 class="section" style="margin-bottom:10px">Start from a template</h2><div class="wb-gallery">' +
            templateButton('math') + templateButton('story') + templateButton('rhyme') + templateButton('shape') +
            '<button type="button" class="wb-template wb-template-blank" @click="openNamedModal(\'whiteboard\')">' +
              '<span class="empty-icon">' + R.icon('pen-tool') + '</span><span class="wb-template-title">Blank canvas</span>' +
              '<span class="muted small">An empty infinite canvas — draw, write and annotate.</span>' +
              '<span class="wb-template-cta">Start blank ' + R.icon('arrow-right') + '</span></button>' +
            (plans.length ? '<button type="button" class="wb-template" @click="openNamedModal(\'whiteboardFromPlan\')">' +
              '<span class="empty-icon">' + R.icon('graduation-cap') + '</span><span class="wb-template-title">From a lesson plan</span>' +
              '<span class="muted small">Create the board for a plan — the guide links to it.</span>' +
              '<span class="wb-template-cta">Choose a plan ' + R.icon('arrow-right') + '</span></button>' : '') +
          '</div>';
          return html;
        }
        html += R.emptyState('No boards match', 'Try another search or change the filters.',
          '<button class="btn btn-primary" @click="setFilter(\'q\',\'\');setFilter(\'linked\',\'all\');setFilter(\'archived\',\'\')">Clear filters</button>', 'search');
        return html;
      }

      html += '<div class="grid grid-3 section wb-board-grid">';
      list.forEach((b) => {
        html += '<div class="card glass wb-board-card">' +
          '<a class="wb-thumb-link" href="#/app/whiteboards/' + attr(b.id) + '" aria-label="Open ' + attr(b.title) + '"><canvas class="wb-thumb" data-board-id="' + attr(b.id) + '"></canvas></a>' +
          (canEdit ? '<button type="button" class="btn btn-ghost btn-icon btn-sm wb-card-menu" @click="wbBoardMenu(\'' + R.attr(b.id) + '\',$event.currentTarget)" aria-label="Actions for ' + attr(b.title) + '">' + R.icon('more-vertical') + '</button>' : '') +
          '<a class="wb-card-body" href="#/app/whiteboards/' + attr(b.id) + '">' +
            '<div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start"><div><div class="strong">' + esc(b.title) + '</div>' +
            '<div class="muted small">' + (b.classroomName ? esc(b.classroomName) + ' · ' : '') + 'Updated ' + R.relative(b.updatedAt) + '</div></div>' +
            '<span class="badge badge-muted">' + R.number(b.objectCount || 0) + ' items</span></div>' +
            (b.description ? '<p class="muted small" style="margin-top:6px">' + esc(R.truncate(b.description, 90)) + '</p>' : '') +
            '<div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">' +
              (b.lessonPlanTitle ? '<span class="badge badge-green">' + R.icon('book-open') + ' ' + esc(R.truncate(b.lessonPlanTitle, 32)) + '</span>' : '') +
              (b.isArchived ? '<span class="badge badge-muted">Archived</span>' : '') +
            '</div>' +
            '<div class="row" style="margin-top:8px;gap:8px;align-items:center">' + (b.createdByName ? R.avatar({ display_name: b.createdByName }, b.createdByName, { size: 26 }) + '<span class="muted small">' + esc(b.createdByName) + '</span>' : '') +
              '<span class="row-end row" style="gap:5px">' + R.icon('external-link') + '<span class="muted small">Open board</span></span></div>' +
          '</a>' +
        '</div>';
      });
      html += '</div>';
      return html;
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      if (name === 'whiteboard') {
        ctx.openModal({
          title: 'New whiteboard', endpoint: '/whiteboards', submitLabel: 'Create whiteboard',
          successMessage: 'Whiteboard created — opening canvas.',
          fields: [
            { name: 'title', label: 'Title', required: true, placeholder: 'e.g. Maths problem-solving' },
            { name: 'description', label: 'Description (optional)', type: 'textarea', placeholder: 'What will you explore on this canvas?' }
          ],
          onSuccess: (data) => { if (data && data.id) location.hash = '#/app/whiteboards/' + data.id; }
        });
        return;
      }
      if (name === 'whiteboardTemplate' && TEMPLATES[id]) {
        const template = TEMPLATES[id];
        ctx.openModal({
          title: 'Use template: ' + template.label, endpoint: '/whiteboards', submitLabel: 'Create board',
          successMessage: 'Board created — opening canvas.',
          fields: [
            { name: 'title', label: 'Title', required: true, value: template.title },
            { name: 'description', label: 'Description (optional)' }
          ],
          transform: (data) => Object.assign({}, data, { state: JSON.parse(JSON.stringify(template.state)) }),
          onSuccess: (data) => { if (data && data.id) location.hash = '#/app/whiteboards/' + data.id; }
        });
        return;
      }
      if (name === 'whiteboardFromPlan') {
        const plans = page.plans || [];
        ctx.openModal({
          title: 'Board from a lesson plan', endpoint: '/whiteboards', submitLabel: 'Create board',
          description: 'The board is created with the lesson plan linked — the guide opens it directly from the plan’s whiteboard step.',
          fields: [
            { name: 'lessonPlanId', label: 'Lesson plan', type: 'select', required: true, options: plans.map((p) => ({ value: p.id, label: p.title })) },
            { name: 'title', label: 'Board title', required: true, placeholder: 'e.g. Nature Detectives — canvas' },
            { name: 'description', label: 'Description (optional)' }
          ],
          transform: (data) => Object.assign({}, data, { title: String(data.title || '').trim() || 'Lesson board' }),
          onSuccess: (data) => { if (data && data.id) location.hash = '#/app/whiteboards/' + data.id; }
        });
      }
    }
  };

  // Render thumbnails after the list view mounts.
  const thumbCache = new Map();
  V._initWhiteboards = function (ctx, page) {
    const cards = [...document.querySelectorAll('.wb-thumb')];
    cards.forEach((canvas) => {
      const id = canvas.getAttribute('data-board-id');
      const board = ((page || {}).boards || []).find((b) => b.id === id);
      if (!board) return;
      const paint = (state) => renderToCanvas(canvas, state, Math.max(120, canvas.clientWidth || 320), 132);
      if (thumbCache.has(id)) { paint(thumbCache.get(id)); return; }
      R.api('GET', '/whiteboards/' + encodeURIComponent(id)).then((res) => {
        const state = (res && res.data && res.data.state) || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } };
        thumbCache.set(id, state); paint(state);
      }).catch(() => paint({ objects: [] }));
    });
  };

  // ---- Detail / editor view (canvas-first) ---------------------------------
  V.whiteboardDetail = {
    async load(ctx, params) {
      const board = await R.api('GET', '/whiteboards/' + encodeURIComponent(params.id)).then((p) => p.data);
      return { board };
    },

    render(ctx, params, page) {
      const b = page.board || {};
      const canEdit = ctx.has('curriculum.create.daycare');
      const toolButton = ([k, t]) => '<button type="button" class="btn btn-sm wb-tool ' + (k === 'pen' ? 'active' : '') + '" data-tool="' + k +
        '" title="' + esc(t.label) + ' (' + t.key + ')" aria-label="' + esc(t.label) + ' (' + t.key + ')">' + R.icon(t.icon) + '</button>';
      let html = '<div class="wb-teach-shell' + (canEdit ? '' : ' wb-readonly') + '" data-board-id="' + attr(b.id) + '">';

      // Slim sticky bar replaces the big page head and teaching nav.
      html += '<header class="wb-topbar">' +
        '<a class="btn btn-ghost btn-icon btn-sm" href="#/app/whiteboards" aria-label="All boards" title="All boards">' + R.icon('arrow-left') + '</a>' +
        '<div class="wb-topbar-title"><strong>' + esc(b.title || 'Whiteboard') + '</strong><span class="muted small">' +
          (b.lessonPlanTitle ? ' · ' + esc(R.truncate(b.lessonPlanTitle, 36)) : ' · Shared team canvas') + '</span></div>' +
        '<div class="wb-topbar-actions">' +
          (canEdit ? '<button class="btn btn-sm btn-ghost" id="wb-history-btn" title="Version history">' + R.icon('history') + '</button>' : '') +
          '<button class="btn btn-sm btn-ghost" id="wb-present-btn" title="Present live">' + R.icon('monitor-play') + '</button>' +
          '<button class="btn btn-sm btn-ghost" id="wb-export-btn" title="Export and print">' + R.icon('image-down') + '</button>' +
          '<button class="btn btn-sm btn-ghost" id="wb-layers-btn" title="Layers and objects">' + R.icon('layers') + '</button>' +
          (canEdit ? '<button class="btn btn-sm btn-secondary" id="wb-save-btn" title="Save a named version">' + R.icon('save') + ' Save version</button>' : '') +
          (canEdit ? '<span class="badge wb-status" id="wb-status">Ready</span>' : '<span class="badge badge-warn">View only</span>') +
        '</div></header>';

      // One scrollable tool strip.
      html += '<div class="wb-tool-strip" id="wb-toolbar">' +
        TOOL_GROUPS.map((g) => '<div class="wb-tool-group" data-group="' + g + '">' +
          Object.entries(TOOLS).filter(([, t]) => t.group === g).map(toolButton).join('') + '</div>').join('') +
        '<div class="wb-tool-group wb-view-group">' +
          '<button class="btn btn-sm wb-tool" id="wb-zout" title="Zoom out" aria-label="Zoom out">' + R.icon('zoom-out') + '</button>' +
          '<span class="wb-zoom" id="wb-zoom">100%</span>' +
          '<button class="btn btn-sm wb-tool" id="wb-zin" title="Zoom in" aria-label="Zoom in">' + R.icon('zoom-in') + '</button>' +
          '<button class="btn btn-sm wb-tool" id="wb-fit" title="Fit to content" aria-label="Fit to content">' + R.icon('scan') + '</button>' +
          '<button class="btn btn-sm wb-tool" id="wb-reset" title="Reset view" aria-label="Reset view">' + R.icon('maximize') + '</button>' +
        '</div>' +
        '<div class="wb-tool-group"><button class="btn btn-sm wb-tool" id="wb-math-toggle" aria-expanded="false" aria-controls="wb-mathbar" title="Math and science palette">' + R.icon('sigma') + '</button></div>' +
      '</div>';
      html += '<div class="wb-mathbar" id="wb-mathbar" hidden>' + MATH_SYMBOLS.map((s) =>
        '<button type="button" class="btn btn-sm btn-ghost wb-math" data-sym="' + attr(s) + '" aria-label="Insert ' + attr(s) + '">' + esc(s) + '</button>').join('') + '</div>';

      // Floating inspector: board style when nothing is selected, object controls when it is.
      html += '<aside class="wb-inspector" id="wb-inspector">' +
        '<div class="wb-inspector-board" id="wb-inspector-board"><div class="wb-inspector-label">Board style</div>' +
          '<div class="wb-swatches">' + SWATCHES.map((c) => '<button type="button" class="wb-swatch' + (c === '#1f3b2a' ? ' active' : '') + '" data-swatch="' + c + '" style="background:' + c + '" aria-label="Colour ' + c + '"></button>').join('') +
            '<input type="color" id="wb-color" value="#1f3b2a" aria-label="Custom colour"></div>' +
          '<label class="wb-inline-row">Width <select id="wb-width" class="wb-select"><option value="2">Thin</option><option value="3" selected>Medium</option><option value="6">Thick</option><option value="10">Bold</option></select></label>' +
          '<div class="wb-actions">' +
            '<button type="button" class="btn btn-sm btn-ghost wb-icon-btn" id="wb-undo" title="Undo (Ctrl+Z)" aria-label="Undo">' + R.icon('undo-2') + '</button>' +
            '<button type="button" class="btn btn-sm btn-ghost wb-icon-btn" id="wb-redo" title="Redo (Ctrl+Y)" aria-label="Redo">' + R.icon('redo-2') + '</button>' +
            '<button type="button" class="btn btn-sm btn-ghost wb-icon-btn" id="wb-del" title="Delete selected" aria-label="Delete selected">' + R.icon('trash-2') + '</button>' +
            '<button type="button" class="btn btn-sm btn-ghost wb-icon-btn" id="wb-clear" title="Clear canvas" aria-label="Clear canvas">' + R.icon('file-x-2') + '</button>' +
            '<button type="button" class="btn btn-sm btn-ghost wb-icon-btn" id="wb-snap" title="Snap to grid" aria-label="Snap to grid" aria-pressed="false">' + R.icon('grid-3x3') + '</button>' +
            '<button type="button" class="btn btn-sm btn-ghost wb-icon-btn" id="wb-keys" title="Keyboard shortcuts" aria-label="Keyboard shortcuts">' + R.icon('keyboard') + '</button>' +
          '</div></div>' +
        '<div class="wb-inspector-object" id="wb-inspector-object" hidden><div class="wb-inspector-label">Selected object <span id="wb-sel-count"></span></div>' +
          '<label class="wb-inline-row">Colour <input type="color" id="wb-obj-color" aria-label="Object colour"></label>' +
          '<label class="wb-inline-row">Size <input type="range" id="wb-obj-size" min="8" max="120" value="20" aria-label="Object size"></label>' +
          '<label class="wb-inline-row">Fill <input type="color" id="wb-obj-fill" value="#fff4b8" aria-label="Sticky fill"></label>' +
          '<label class="wb-inline-row">Font <select id="wb-obj-font" class="wb-select"><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>' +
          '<div class="wb-layer-btns">' +
            '<button type="button" class="btn btn-sm btn-ghost" data-layer="front">Front</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" data-layer="forward">Forward</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" data-layer="backward">Backward</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" data-layer="back">Back</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" id="wb-group">Group</button>' +
          '</div></div>' +
      '</aside>';

      // Layers panel.
      html += '<aside class="wb-layers" id="wb-layers" hidden><div class="queue-head"><strong>Layers</strong>' +
        '<button type="button" class="btn btn-sm btn-ghost" id="wb-select-all">Select all</button>' +
        '<button type="button" class="btn btn-ghost btn-icon btn-sm" id="wb-layers-close" aria-label="Close layers">' + R.icon('x') + '</button></div>' +
        '<div class="wb-layer-list"></div><div class="muted small">Drag to reorder · eye to hide · lock to protect</div></aside>';

      // Canvas fills the remaining viewport.
      html += '<div class="wb-canvas-wrap" id="wb-canvas-wrap"><div class="wb-hint muted small">Space or Pan to move · scroll to zoom · Shift-click to select multiple</div>' +
        '<div class="wb-readonly-banner" id="wb-readonly-banner" hidden>View only — you can look around but cannot edit this board.</div>' +
        '<div class="wb-presence" id="wb-presence"></div>' +
        '<canvas class="wb-minimap" id="wb-minimap" width="180" height="110" aria-label="Board minimap"></canvas></div>';

      html += '<div class="wb-history-panel" id="wb-history-panel" hidden><div class="queue-head"><strong>Version history</strong>' +
        '<button type="button" class="btn btn-ghost btn-icon btn-sm" id="wb-history-close" aria-label="Close history">' + R.icon('x') + '</button></div>' +
        '<div class="wb-save-version"><input class="input" id="wb-version-name" placeholder="Name this version" maxlength="120">' +
          '<button type="button" class="btn btn-sm btn-primary" id="wb-snapshot-btn">Save</button></div>' +
        '<div class="wb-history-list"><span class="muted small">Loading…</span></div></div>';
      html += '<input type="hidden" id="wb-version" value="' + attr(String(b.version || 1)) + '">';
      html += '</div>';
      return html;
    }
  };

  // ---- Editor initialization ----------------------------------------------
  V._initWhiteboard = function (ctx, page) {
    const board = page && page.board;
    if (!board) return;
    const wrap = document.getElementById('wb-canvas-wrap');
    if (!wrap || wrap._wbInit) return;
    wrap._wbInit = true;
    document.body.classList.add('wb-teaching');
    const shellEl = document.querySelector('.wb-teach-shell');
    function sizeShell() {
      if (!shellEl) return;
      const top = shellEl.getBoundingClientRect().top;
      shellEl.style.height = Math.max(320, window.innerHeight - top) + 'px';
    }
    sizeShell();
    window.addEventListener('resize', sizeShell);
    const statusEl = document.getElementById('wb-status');
    const verEl = document.getElementById('wb-version');
    let version = Number(board.version || 1);
    let dirty = false;
    let saving = false;
    let savedAt = Date.now();
    let lastSaved = JSON.parse(JSON.stringify((board.state || {}).objects || []));
    let layerObjects = [];
    const canEdit = ctx.has('curriculum.create.daycare');
    const presenceColor = '#3D8FAE';

    function badge(text, tone) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.classList.toggle('is-warn', tone === 'warn');
      statusEl.classList.toggle('is-good', tone === 'good');
    }
    function relativeSaved() {
      if (dirty) return;
      const secs = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
      badge(secs < 8 ? 'Saved just now' : 'Saved ' + R.relative(new Date(Date.now() - secs * 1000).toISOString()), 'good');
    }

    const inspectorBoard = document.getElementById('wb-inspector-board');
    const inspectorObject = document.getElementById('wb-inspector-object');
    let engine = null;
    engine = newBoardCanvas(wrap, board.state || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } }, () => {
      dirty = true; badge('Editing…', 'warn');
    }, {
      readOnly: !canEdit,
      onObjects(list) {
        layerObjects = list;
        renderLayers();
        drawMinimap();
      },
      onSelection(obj, ids) {
        const selected = Array.isArray(ids) ? ids : (obj ? [obj.id] : []);
        if (inspectorBoard) inspectorBoard.hidden = selected.length > 0;
        if (inspectorObject) inspectorObject.hidden = selected.length === 0;
        if (!selected.length) return;
        const first = engine.getSelected() || {};
        const colour = inspectorObject.querySelector('#wb-obj-color');
        const fill = inspectorObject.querySelector('#wb-obj-fill');
        const size = inspectorObject.querySelector('#wb-obj-size');
        const font = inspectorObject.querySelector('#wb-obj-font');
        if (colour) colour.value = /^#[0-9a-f]{6}$/i.test(first.color || '') ? first.color : '#1f3b2a';
        if (fill) fill.value = /^#[0-9a-f]{6}$/i.test(first.fill || '') ? first.fill : '#fff4b8';
        if (size) size.value = String(first.size || 20);
        if (font) font.value = first.font || 'sans';
        const count = inspectorObject.querySelector('#wb-sel-count');
        if (count) count.textContent = selected.length > 1 ? '(' + selected.length + ')' : '';
        inspectorObject.querySelectorAll('button').forEach((b) => { b.disabled = !canEdit; });
      },
      onViewport(vp) {
        const label = document.getElementById('wb-zoom');
        if (label) label.textContent = Math.round(vp.zoom * 100) + '%';
        drawMinimap();
      }
    });
    engine.setReadOnly(!canEdit);
    if (!canEdit) {
      const banner = document.getElementById('wb-readonly-banner');
      if (banner) banner.hidden = false;
    }

    function setActiveTool(t) {
      engine.setTool(t);
      document.querySelectorAll('.wb-tool[data-tool]').forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-tool') === t));
    }
    document.querySelectorAll('.wb-tool[data-tool]').forEach((btn) => btn.addEventListener('click', () => setActiveTool(btn.getAttribute('data-tool'))));
    document.querySelectorAll('[data-swatch]').forEach((btn) => btn.addEventListener('click', () => {
      engine.setColor(btn.getAttribute('data-swatch'));
      document.querySelectorAll('[data-swatch]').forEach((b) => b.classList.toggle('active', b === btn));
      const picker = document.getElementById('wb-color');
      if (picker) picker.value = btn.getAttribute('data-swatch');
    }));
    const colorEl = document.getElementById('wb-color'); if (colorEl) colorEl.addEventListener('input', (e) => engine.setColor(e.target.value));
    const widthEl = document.getElementById('wb-width'); if (widthEl) widthEl.addEventListener('change', (e) => engine.setWidth(Number(e.target.value) || 3));
    const undoBtn = document.getElementById('wb-undo'); if (undoBtn) undoBtn.addEventListener('click', () => engine.undo());
    const redoBtn = document.getElementById('wb-redo'); if (redoBtn) redoBtn.addEventListener('click', () => engine.redo());
    const delBtn = document.getElementById('wb-del'); if (delBtn) delBtn.addEventListener('click', () => engine.deleteSelected());
    const clearBtn = document.getElementById('wb-clear'); if (clearBtn) clearBtn.addEventListener('click', () => {
      if (R.feedback) R.feedback.sheet({
        title: 'Clear the canvas?', message: 'A version is saved first, so you can restore it from History.',
        actions: [{ label: 'Clear canvas', icon: 'trash-2', tone: 'danger', run: () => engine.clear() }]
      });
      else if (confirm('Clear the entire canvas?')) engine.clear();
    });
    const snapBtn = document.getElementById('wb-snap'); if (snapBtn) snapBtn.addEventListener('click', () => {
      const on = !engine.getSnap(); engine.setSnap(on); snapBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); snapBtn.classList.toggle('active', on);
    });
    const keysBtn = document.getElementById('wb-keys'); if (keysBtn) keysBtn.addEventListener('click', () => {
      if (R.feedback) R.feedback.sheet({
        title: 'Whiteboard shortcuts', message: 'Work faster with the keyboard.',
        actions: Object.entries(TOOLS).filter(([k]) => k !== 'image').map(([k, t]) => ({ label: t.label, icon: t.icon, run: () => setActiveTool(k) }))
          .concat([{ label: 'Undo / Redo — Ctrl+Z / Ctrl+Y', icon: 'undo-2', run: () => {} }, { label: 'Delete — Delete key', icon: 'trash-2', run: () => engine.deleteSelected() }])
      });
    });
    const zin = document.getElementById('wb-zin'); if (zin) zin.addEventListener('click', () => engine.zoomIn());
    const zout = document.getElementById('wb-zout'); if (zout) zout.addEventListener('click', () => engine.zoomOut());
    const fit = document.getElementById('wb-fit'); if (fit) fit.addEventListener('click', () => engine.fitToContent());
    const reset = document.getElementById('wb-reset'); if (reset) reset.addEventListener('click', () => engine.resetView());
    const mathToggle = document.getElementById('wb-math-toggle');
    const mathBar = document.getElementById('wb-mathbar');
    if (mathToggle && mathBar) mathToggle.addEventListener('click', () => {
      mathBar.hidden = !mathBar.hidden;
      mathToggle.setAttribute('aria-expanded', mathBar.hidden ? 'false' : 'true');
    });
    document.querySelectorAll('.wb-math').forEach((btn) => btn.addEventListener('click', () => {
      setActiveTool('select'); engine.addMathSymbol(btn.getAttribute('data-sym'));
    }));
    const objColor = inspectorObject && inspectorObject.querySelector('#wb-obj-color');
    const objFill = inspectorObject && inspectorObject.querySelector('#wb-obj-fill');
    const objSize = inspectorObject && inspectorObject.querySelector('#wb-obj-size');
    const objFont = inspectorObject && inspectorObject.querySelector('#wb-obj-font');
    if (objColor) objColor.addEventListener('input', (e) => engine.updateSelected({ color: e.target.value }));
    if (objFill) objFill.addEventListener('input', (e) => engine.updateSelected({ fill: e.target.value }));
    if (objSize) objSize.addEventListener('input', (e) => engine.updateSelected({ size: Number(e.target.value) || 20 }));
    if (objFont) objFont.addEventListener('change', (e) => engine.updateSelected({ font: e.target.value }));
    inspectorObject && inspectorObject.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => engine.moveSelected(b.getAttribute('data-layer'))));
    const groupBtn = document.getElementById('wb-group'); if (groupBtn) groupBtn.addEventListener('click', () => engine.groupSelected());

    // ---- Layers panel ------------------------------------------------------
    const layersPanel = document.getElementById('wb-layers');
    const layersList = layersPanel && layersPanel.querySelector('.wb-layer-list');
    function renderLayers() {
      if (!layersList) return;
      layersList.innerHTML = layerObjects.length ? layerObjects.map((o) =>
        '<div class="wb-layer-row" draggable="true" data-id="' + attr(o.id) + '">' +
          '<span class="wb-layer-type">' + R.icon(o.type === 'sticky' ? 'sticky-note' : o.type === 'image' ? 'image' : o.type === 'text' || o.type === 'math' ? 'type' : o.type === 'path' || o.type === 'highlighter' ? 'pencil' : 'square') + '</span>' +
          '<span class="wb-layer-name">' + esc(o.type) + (o.groupId ? ' · group' : '') + '</span>' +
          '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-layer-hide="' + attr(o.id) + '" aria-label="Toggle visibility">' + R.icon(o.hidden ? 'eye-off' : 'eye') + '</button>' +
          '<button type="button" class="btn btn-ghost btn-icon btn-sm" data-layer-lock="' + attr(o.id) + '" aria-label="Toggle lock">' + R.icon(o.locked ? 'lock' : 'unlock') + '</button>' +
        '</div>').join('') : '<span class="muted small">Nothing on this board yet.</span>';
      layersList.querySelectorAll('.wb-layer-row').forEach((row) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          engine.setSelectedIds([row.getAttribute('data-id')]);
        });
        row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', row.getAttribute('data-id')); });
        row.addEventListener('dragover', (e) => e.preventDefault());
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          engine.reorderObject(e.dataTransfer.getData('text/plain'), row.getAttribute('data-id'));
        });
      });
      layersList.querySelectorAll('[data-layer-hide]').forEach((b) => b.addEventListener('click', () => engine.toggleHidden(b.getAttribute('data-layer-hide'))));
      layersList.querySelectorAll('[data-layer-lock]').forEach((b) => b.addEventListener('click', () => engine.toggleLocked(b.getAttribute('data-layer-lock'))));
    }
    const layersBtn = document.getElementById('wb-layers-btn');
    const layersClose = document.getElementById('wb-layers-close');
    if (layersBtn && layersPanel) layersBtn.addEventListener('click', () => { layersPanel.hidden = !layersPanel.hidden; if (!layersPanel.hidden) renderLayers(); });
    if (layersClose && layersPanel) layersClose.addEventListener('click', () => { layersPanel.hidden = true; });
    const selectAll = document.getElementById('wb-select-all'); if (selectAll) selectAll.addEventListener('click', () => engine.selectAll());

    // ---- Minimap -----------------------------------------------------------
    const mini = document.getElementById('wb-minimap');
    function drawMinimap() {
      if (!mini || !engine) return;
      const ctx = mini.getContext('2d');
      const w = mini.width, h = mini.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = palette().bg; ctx.fillRect(0, 0, w, h);
      const state = engine.getState();
      const b = boardBounds(state.objects);
      const scale = Math.min((w - 16) / b.w, (h - 16) / b.h);
      ctx.save(); ctx.translate(8 - b.x * scale, 8 - b.y * scale); ctx.scale(scale, scale);
      state.objects.forEach((o) => drawObject(ctx, o, { palette: palette() }));
      ctx.restore();
      const vp = engine.getViewport();
      const rect = wrap.getBoundingClientRect();
      const vw = rect.width / vp.zoom, vh = rect.height / vp.zoom;
      ctx.strokeStyle = palette().selected; ctx.lineWidth = 1.5;
      ctx.strokeRect(8 + (vp.x / vp.zoom - b.x) * scale, 8 + (vp.y / vp.zoom - b.y) * scale, vw * scale, vh * scale);
    }
    if (mini) mini.addEventListener('click', (e) => {
      const r = mini.getBoundingClientRect();
      const b = boardBounds(engine.getState().objects);
      const scale = Math.min((r.width - 16) / b.w, (r.height - 16) / b.h);
      const vp = engine.getViewport();
      vp.x = -((e.clientX - r.left - 8) / scale + b.x) * vp.zoom + r.width / 2;
      vp.y = -((e.clientY - r.top - 8) / scale + b.y) * vp.zoom + r.height / 2;
      engine.setViewport(vp);
    });

    // ---- Presence ----------------------------------------------------------
    const presenceEl = document.getElementById('wb-presence');
    function drawPresence(people) {
      if (!presenceEl) return;
      presenceEl.innerHTML = people.map((p, i) =>
        '<div class="wb-presence-peer" style="left:' + (12 + i * 42) + 'px;background:' + attr(p.colour || '#3D8FAE') + '" title="' + attr(p.name) + '">' + esc(String(p.name || 'T').charAt(0)) + '</div>').join('') +
        (people.length ? '<span class="wb-presence-label">' + people.length + ' other' + (people.length === 1 ? '' : 's') + ' here</span>' : '');
    }

    function documentShortcuts(e) {
      const tag = (e.target && e.target.tagName) || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); engine.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); engine.redo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); engine.deleteSelected(); return; }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); engine.zoomIn(); return; }
      if (e.key === '-') { e.preventDefault(); engine.zoomOut(); return; }
      if (e.key === '0') { e.preventDefault(); engine.resetView(); return; }
      const tool = Object.entries(TOOLS).find(([, t]) => t.key.toLowerCase() === e.key.toLowerCase());
      if (tool) { e.preventDefault(); setActiveTool(tool[0]); }
    }
    document.addEventListener('keydown', documentShortcuts);

    async function save(silent, force, label) {
      if (!canEdit || saving) return;
      if (label) {
        try {
          await R.api('POST', '/whiteboards/' + encodeURIComponent(board.id) + '/snapshots', { label });
          badge('Version saved', 'good');
          if (ctx.toast) ctx.toast('Version saved.');
          loadHistory();
        } catch (e) { if (ctx.toast) ctx.toast(e.message || 'Could not save a version.', 'error'); }
        return;
      }
      if (!dirty && !force) { relativeSaved(); return; }
      const ops = engine.diffOps(lastSaved);
      if (!ops.length && !force) { relativeSaved(); return; }
      saving = true; badge('Saving…');
      try {
        const res = await R.api('PUT', '/whiteboards/' + encodeURIComponent(board.id) + '/state', {
          ops, viewport: engine.getViewport(), version: force ? undefined : version
        });
        if (res && res.conflict && res.latest) {
          const latest = res.latest;
          R.feedback.sheet({
            title: 'Someone else changed this board',
            message: 'Their version (' + latest.version + ') is newer than yours (' + version + '). Keep your work or use theirs?',
            actions: [
              { label: 'Keep my work', icon: 'save', run: async () => { version = latest.version || version; await save(false, true); } },
              { label: 'Use their version', icon: 'refresh-cw', run: () => {
                version = Number(latest.version) || version;
                if (verEl) verEl.value = String(version);
                engine.setState(latest.state || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } });
                lastSaved = JSON.parse(JSON.stringify((latest.state || {}).objects || []));
                dirty = false; savedAt = Date.now(); badge('Updated from collaborator', 'good');
              } }
            ]
          });
          return;
        }
        const result = res && res.data ? res.data : res;
        version = (result && result.version) || version + 1;
        if (verEl) verEl.value = String(version);
        lastSaved = JSON.parse(JSON.stringify(engine.getState().objects));
        dirty = false; savedAt = Date.now(); badge('Saved', 'good');
      } catch (e) {
        badge('Offline — changes queued', 'warn');
        if (!silent && R.feedback) R.feedback.cue('error');
      } finally { saving = false; }
    }
    const saveBtn = document.getElementById('wb-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      if (R.feedback) R.feedback.sheet({
        title: 'Save a version', message: 'Name this version so you can find it in History later.',
        actions: [{ label: 'Save version', icon: 'save', run: () => {
          const input = document.getElementById('wb-version-name');
          save(false, false, (input && input.value.trim()) || ('Version ' + new Date().toLocaleString()));
        } }]
      });
      else save(false, false, 'Manual save');
    });

    const autosave = setInterval(() => { if (dirty) save(true); }, 4000);
    const statusTick = setInterval(relativeSaved, 3000);
    const poll = setInterval(async () => {
      if (saving || dirty) return;
      try {
        const res = await R.api('GET', '/whiteboards/' + encodeURIComponent(board.id));
        const data = res && res.data ? res.data : res;
        if (data && Number(data.version) > version) {
          version = Number(data.version); if (verEl) verEl.value = String(version);
          engine.setState(data.state || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } });
          lastSaved = JSON.parse(JSON.stringify((data.state || {}).objects || []));
          badge('Synced with collaborator', 'good');
        }
      } catch (e) { badge('Offline — changes queued', 'warn'); }
    }, 5000);
    const heartbeat = async () => {
      const c = engine.getCursor() || { x: 0, y: 0 };
      try { await R.api('POST', '/whiteboards/' + encodeURIComponent(board.id) + '/presence', { cursorX: c.x, cursorY: c.y, colour: presenceColor }); } catch (error) { /* offline */ }
    };
    const presencePoll = setInterval(async () => {
      try {
        const res = await R.api('GET', '/whiteboards/' + encodeURIComponent(board.id) + '/presence');
        drawPresence((res && res.data) || []);
      } catch (error) { /* offline */ }
    }, 5000);
    heartbeat();
    const presenceBeat = setInterval(heartbeat, 15000);

    // ---- Live presentation -------------------------------------------------
    let presentCleanup = null;
    function closePresentation() {
      if (presentCleanup) { presentCleanup(); presentCleanup = null; }
      const overlay = document.querySelector('.wb-presentation');
      if (overlay) overlay.remove();
    }
    const presentBtn = document.getElementById('wb-present-btn');
    if (presentBtn) presentBtn.addEventListener('click', () => {
      closePresentation();
      const overlay = document.createElement('div');
      overlay.className = 'wb-presentation';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', esc(board.title || 'Whiteboard') + ' — live presentation');
      overlay.innerHTML = '<div class="wb-present-bar"><strong>' + esc(board.title || 'Whiteboard') + '</strong>' +
        '<div class="wb-present-tools">' +
          '<button type="button" class="btn btn-sm btn-secondary" data-present="pen">' + R.icon('pencil') + ' Annotate</button>' +
          '<button type="button" class="btn btn-sm btn-secondary" data-present="laser">' + R.icon('pointer') + ' Laser</button>' +
          '<button type="button" class="btn btn-sm btn-secondary" data-present="pan">' + R.icon('hand') + ' Pan</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-present="fit">' + R.icon('scan') + ' Fit</button>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-primary" data-present="exit">Exit <span class="muted">(Esc)</span></button></div>' +
        '<div class="wb-present-stage"></div>';
      document.body.appendChild(overlay);
      const stage = overlay.querySelector('.wb-present-stage');
      const presentEngine = newBoardCanvas(stage, engine.getState(), () => {}, { readOnly: false });
      presentEngine.setTool('pen');
      const tools = overlay.querySelectorAll('[data-present]');
      tools.forEach((b) => b.addEventListener('click', () => {
        const action = b.getAttribute('data-present');
        if (action === 'exit') return closePresentation();
        if (action === 'fit') return presentEngine.fitToContent();
        presentEngine.setTool(action);
        tools.forEach((x) => x.classList.toggle('active', x === b));
      }));
      const onKey = (e) => { if (e.key === 'Escape') closePresentation(); };
      document.addEventListener('keydown', onKey);
      presentCleanup = () => { document.removeEventListener('keydown', onKey); presentEngine.destroy(); };
      if (overlay.requestFullscreen && !R.anim.reduced()) overlay.requestFullscreen().catch(() => null);
    });

    // ---- Export / print handout --------------------------------------------
    const exportBtn = document.getElementById('wb-export-btn');
    if (exportBtn) exportBtn.addEventListener('click', () => {
      if (R.feedback) R.feedback.sheet({
        title: 'Export this board', message: 'A clean image, or a printable handout with the object list.',
        actions: [
          { label: 'Download PNG', icon: 'image-down', run: () => {
            const link = document.createElement('a');
            link.href = engine.exportPNG(1800, 1000);
            link.download = String(board.title || 'whiteboard').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
            document.body.appendChild(link); link.click(); link.remove();
            if (ctx.toast) ctx.toast('Board image downloaded.');
          } },
          { label: 'Print handout / PDF', icon: 'printer', run: () => {
            let sheet = document.getElementById('wb-print-sheet');
            if (!sheet) { sheet = document.createElement('div'); sheet.id = 'wb-print-sheet'; document.body.appendChild(sheet); }
            const objects = engine.getState().objects;
            sheet.innerHTML = '<div class="handout-cover"><p class="eyebrow">Whiteboard handout</p><h1>' + esc(board.title || 'Whiteboard') + '</h1>' +
              '<p>' + esc(new Date().toLocaleDateString()) + ' · ' + objects.length + ' objects</p></div>' +
              '<section class="handout-page"><h2>The board</h2><img src="' + engine.exportPNG(1800, 1000) + '" alt="Whiteboard"></section>' +
              '<section class="handout-page"><h2>Object list</h2><table><thead><tr><th>#</th><th>Type</th><th>Details</th></tr></thead><tbody>' +
              objects.map((o, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(o.type) + '</td><td>' + esc(R.truncate(o.text || o.src || '', 90)) + '</td></tr>').join('') +
              '</tbody></table></section>';
            window.print();
          } }
        ]
      });
    });

    // ---- Version history ---------------------------------------------------
    const historyPanel = document.getElementById('wb-history-panel');
    async function loadHistory() {
      const list = historyPanel && historyPanel.querySelector('.wb-history-list');
      if (!list) return;
      list.innerHTML = '<span class="muted small">Loading…</span>';
      try {
        const res = await R.api('GET', '/whiteboards/' + encodeURIComponent(board.id) + '/snapshots');
        const rows = (res && res.data) || [];
        list.innerHTML = rows.length ? rows.map((s) =>
          '<div class="wb-history-row" data-id="' + attr(s.id) + '">' +
            '<canvas class="wb-history-thumb" width="90" height="56"></canvas>' +
            '<div><strong>' + esc(s.label || ('Version ' + s.version)) + '</strong>' +
            '<div class="muted small">' + R.relative(s.createdAt) + ' · ' + R.number(s.objectCount || 0) + ' objects' +
            (s.createdByName ? ' · ' + esc(s.createdByName) : '') + '</div></div>' +
            '<button type="button" class="btn btn-sm btn-secondary" data-restore="' + attr(s.id) + '">' + R.icon('rotate-ccw') + ' Restore</button></div>').join('')
          : '<span class="muted small">No saved versions yet. Changes are saved automatically as you work.</span>';
        const boardRes = await R.api('GET', '/whiteboards/' + encodeURIComponent(board.id));
        const snapState = (boardRes && boardRes.data && boardRes.data.state) || { objects: [] };
        list.querySelectorAll('.wb-history-thumb').forEach((c) => renderToCanvas(c, snapState, 90, 56));
        list.querySelectorAll('[data-restore]').forEach((button) => button.addEventListener('click', () => {
          const id = button.getAttribute('data-restore');
          if (R.feedback) R.feedback.sheet({
            title: 'Restore this version?', message: 'Your current canvas will be saved to history first.',
            actions: [{ label: 'Restore version', icon: 'rotate-ccw', run: async () => {
              try {
                await R.api('POST', '/whiteboards/' + encodeURIComponent(board.id) + '/snapshots/' + encodeURIComponent(id) + '/restore', {});
                if (ctx.toast) ctx.toast('Version restored.');
                await ctx.navigate(true);
              } catch (e) { if (ctx.toast) ctx.toast(e.message || 'Could not restore.', 'error'); }
            } }]
          });
        }));
      } catch (e) { list.innerHTML = '<span class="muted small">History is unavailable right now.</span>'; }
    }
    const historyBtn = document.getElementById('wb-history-btn');
    const historyClose = document.getElementById('wb-history-close');
    if (historyBtn && historyPanel) historyBtn.addEventListener('click', () => { historyPanel.hidden = !historyPanel.hidden; if (!historyPanel.hidden) loadHistory(); });
    if (historyClose && historyPanel) historyClose.addEventListener('click', () => { historyPanel.hidden = true; });
    const snapshotBtn = document.getElementById('wb-snapshot-btn');
    if (snapshotBtn) snapshotBtn.addEventListener('click', () => {
      const input = document.getElementById('wb-version-name');
      const label = (input && input.value.trim()) || 'Version ' + new Date().toLocaleString();
      save(false, false, label);
      if (input) input.value = '';
    });

    wrap._wbCleanup = () => {
      document.body.classList.remove('wb-teaching');
      window.removeEventListener('resize', sizeShell);
      clearInterval(autosave); clearInterval(statusTick); clearInterval(poll);
      clearInterval(presencePoll); clearInterval(presenceBeat);
      document.removeEventListener('keydown', documentShortcuts);
      closePresentation();
      engine.destroy();
    };
    setActiveTool('pen');
    badge('Ready', 'good');
    renderLayers();
    drawMinimap();
  };

  R.whiteboardCanvas = { renderToCanvas, renderThumbnail: renderToCanvas, stateToPng, objectBounds, boardBounds, drawObject, palette };
})();
