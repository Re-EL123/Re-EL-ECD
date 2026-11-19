'use strict';

/**
 * Interactive whiteboards: infinite digital canvases for teaching, annotation,
 * math/science sketching and collaborative problem-solving. State is persisted
 * as a small vector document and polled for collaboration.
 */
(function () {
  const R = window.Reel;
  const V = R.views;

  function esc(s) { return R.esc(s == null ? '' : String(s)); }
  function attr(s) { return R.attr(s == null ? '' : String(s)); }
  function uid() { return 'o' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  // ---- Tool catalogue ------------------------------------------------------
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
    math: { label: 'Math / science', icon: 'sigma', key: 'M', group: 'Insert' }
  };
  const TOOL_GROUPS = ['Navigate', 'Draw', 'Shape', 'Insert'];
  const MATH_SYMBOLS = ['+', '−', '×', '÷', '=', '≠', '≈', '<', '>', '≤', '≥', 'π', '√', 'x²', 'x³', '½', '¼', '°', 'α', 'β', 'θ', 'Δ', '∑', '∞', '→', '↔', 'H₂O', 'CO₂', 'O₂', 'NaCl', 'E=mc²'];

  // ---- Shared vector renderer (canvas, thumbnails, presentation) -----------
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
    return null;
  }

  function drawObject(ctx, o, opts) {
    const options = opts || {};
    ctx.save();
    if (options.alpha != null) ctx.globalAlpha = options.alpha;
    const c = o.color || '#1f3b2a';
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
      ctx.fillStyle = c; ctx.font = (o.size || (o.type === 'math' ? 28 : 20)) + 'px "Segoe UI", Arial, sans-serif';
      ctx.textBaseline = 'top'; ctx.fillText(o.text || '', o.x, o.y);
    } else if (o.type === 'sticky') {
      const ww = o.w || 180, hh = o.h || 140;
      ctx.fillStyle = o.fill || '#FFF4B8'; ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(o.x, o.y, ww, hh, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a3b00'; ctx.font = '16px "Segoe UI", Arial, sans-serif'; ctx.textBaseline = 'top';
      String(o.text || '').split('\n').forEach((ln, i) => ctx.fillText(ln, o.x + 12, o.y + 12 + i * 22));
    }
    if (options.selected) {
      const b = objectBounds(o);
      if (b) {
        ctx.strokeStyle = '#3D8FAE'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); ctx.setLineDash([]);
        if (options.handles) {
          ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1f5f7a'; ctx.lineWidth = 1.5;
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

  function renderThumbnail(canvas, state, width, height) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fafbf8'; ctx.fillRect(0, 0, width, height);
    const objects = (state && state.objects) || [];
    if (!objects.length) {
      ctx.fillStyle = '#b7c3b9'; ctx.font = '12px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Empty canvas', width / 2, height / 2); ctx.textAlign = 'left';
      return;
    }
    const b = boardBounds(objects);
    const pad = 12;
    const scale = Math.min((width - pad * 2) / b.w, (height - pad * 2) / b.h, 1.4);
    ctx.save();
    ctx.translate(pad - b.x * scale, pad - b.y * scale);
    ctx.scale(scale, scale);
    objects.forEach((o) => drawObject(ctx, o));
    ctx.restore();
  }

  function stateToPng(state, width, height) {
    const canvas = document.createElement('canvas');
    const w = width || 1600;
    const h = height || 900;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fafbf8'; ctx.fillRect(0, 0, w, h);
    const objects = (state && state.objects) || [];
    const b = boardBounds(objects);
    const pad = 60;
    const scale = Math.min((w - pad * 2) / b.w, (h - pad * 2) / b.h, 2);
    ctx.save();
    ctx.translate(pad - b.x * scale, pad - b.y * scale);
    ctx.scale(scale, scale);
    objects.forEach((o) => drawObject(ctx, o));
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
    let snap = false;
    let readOnly = Boolean(opts.readOnly);
    let undo = [];
    let redo = [];
    let editor = null;

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
    function pushUndo() { undo.push(JSON.stringify(state.objects)); if (undo.length > 80) undo.shift(); redo = []; }
    function notify() { if (onChange) onChange(JSON.parse(JSON.stringify(state))); }
    function isEditing() { return Boolean(editor); }

    function drawGrid() {
      const v = vp(); const rect = canvas.getBoundingClientRect(); const step = 40 * v.zoom;
      if (step < 10) return;
      const offX = ((v.x % step) + step) % step; const offY = ((v.y % step) + step) % step;
      ctx.save(); ctx.strokeStyle = 'rgba(120,140,125,0.12)'; ctx.lineWidth = 1;
      for (let x = offX; x < rect.width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke(); }
      for (let y = offY; y < rect.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke(); }
      ctx.restore();
    }

    function render() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#fafbf8'; ctx.fillRect(0, 0, rect.width, rect.height);
      drawGrid();
      const v = vp();
      ctx.save(); ctx.translate(v.x, v.y); ctx.scale(v.zoom, v.zoom);
      state.objects.forEach((o) => drawObject(ctx, o, { selected: o.id === selectedId, handles: o.id === selectedId && tool === 'select' }));
      if (drawing && !drawing.drag && !drawing.resize && !drawing.erasing) drawObject(ctx, drawing, { alpha: 0.9 });
      ctx.restore();
      canvas.style.cursor = panning || spacePan || tool === 'hand' ? 'grab' : (readOnly && !['select', 'hand'].includes(tool) ? 'not-allowed' : (tool === 'select' ? 'default' : 'crosshair'));
      if (options.onSelection) options.onSelection(selectedId ? state.objects.find((o) => o.id === selectedId) || null : null);
    }

    function hitTest(wpt) {
      for (let i = state.objects.length - 1; i >= 0; i -= 1) {
        const b = objectBounds(state.objects[i]);
        if (b && wpt.x >= b.x - 6 && wpt.x <= b.x + b.w + 6 && wpt.y >= b.y - 6 && wpt.y <= b.y + b.h + 6) return state.objects[i];
      }
      return null;
    }

    function handleAt(spt) {
      const obj = state.objects.find((o) => o.id === selectedId);
      if (!obj || tool !== 'select') return null;
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
      else if (o.type === 'rect' || o.type === 'sticky') { o.x = mapX(from.x); o.y = mapY(from.y); o.w = from.w * sx; o.h = from.h * sy; }
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
      holder.style.top = Math.max(8, Math.min(container.clientHeight - 150, position.y)) + 'px';
      holder.innerHTML = '<textarea class="wb-inline-input" rows="' + (kind === 'sticky' ? 4 : 2) + '" placeholder="' +
        (kind === 'sticky' ? 'Write your note…' : kind === 'math' ? 'Expression or symbol…' : 'Type here…') + '">' + esc(seed || '') + '</textarea>' +
        '<div class="wb-inline-actions"><button type="button" class="btn btn-sm btn-ghost" data-wb-cancel>Cancel</button>' +
        '<button type="button" class="btn btn-sm btn-primary" data-wb-done>Add</button></div>';
      container.appendChild(holder);
      const input = holder.querySelector('textarea');
      editor = { holder, input, wpt, kind };
      input.focus(); input.select();
      function commit() {
        const value = input.value.trim();
        const target = editor && editor.wpt;
        closeEditor();
        if (!value || readOnly || !target) return;
        pushUndo();
        if (kind === 'sticky') state.objects.push({ id: uid(), type: 'sticky', x: target.x, y: target.y, w: 180, h: 140, text: value, fill: '#FFF4B8' });
        else if (kind === 'math') state.objects.push({ id: uid(), type: 'math', color, size: 28, x: target.x, y: target.y, text: value });
        else state.objects.push({ id: uid(), type: 'text', color, size: 22, x: target.x, y: target.y, text: value });
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
      if (panning || spacePan || tool === 'hand' || e.button === 1) {
        panning = true; panStart = { x: spt.x - vp().x, y: spt.y - vp().y }; return;
      }
      if (tool === 'select') {
        const handle = handleAt(spt);
        if (handle && canDraw()) {
          const orig = state.objects.find((o) => o.id === selectedId);
          drawing = { resize: true, handle: handle.key, orig: JSON.parse(JSON.stringify(orig)), start: wpt, from: objectBounds(orig) };
          return;
        }
        const hit = hitTest(wpt);
        selectedId = hit ? hit.id : null;
        if (hit && canDraw()) drawing = { drag: true, id: hit.id, start: wpt, orig: JSON.parse(JSON.stringify(hit)) };
        render(); return;
      }
      if (!canDraw()) return;
      if (tool === 'eraser') {
        const hit = hitTest(wpt);
        if (hit) { pushUndo(); state.objects = state.objects.filter((o) => o.id !== hit.id); selectedId = null; render(); notify(); }
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
      } else if (tool === 'text' || tool === 'sticky' || tool === 'math') {
        openEditor(spt, wpt, tool); render(); return;
      }
      render();
    }

    function onPointerMove(e) {
      if (isEditing()) return;
      const spt = point(e);
      const wpt = grid(toWorld(spt));
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
        const obj = state.objects.find((o) => o.id === drawing.id);
        if (obj) {
          const dx = wpt.x - drawing.start.x, dy = wpt.y - drawing.start.y; const o = drawing.orig;
          if (obj.type === 'path' || obj.type === 'highlighter') obj.points = (o.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
          else if (obj.type === 'line' || obj.type === 'arrow') { obj.x1 = o.x1 + dx; obj.y1 = o.y1 + dy; obj.x2 = o.x2 + dx; obj.y2 = o.y2 + dy; }
          else if (obj.type === 'circle') { obj.cx = o.cx + dx; obj.cy = o.cy + dy; }
          else { obj.x = o.x + dx; obj.y = o.y + dy; }
          render();
        }
        return;
      }
      if (drawing.type === 'path' || drawing.type === 'highlighter') drawing.points.push(wpt);
      else if (drawing.type === 'line' || drawing.type === 'arrow') { drawing.x2 = wpt.x; drawing.y2 = wpt.y; }
      else if (drawing.type === 'rect') { drawing.w = wpt.x - drawing.x; drawing.h = wpt.y - drawing.y; }
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
      } else if (drawing.type === 'rect') {
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

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(container);
    else window.addEventListener('resize', resize);
    resize();

    function moveSelected(direction) {
      if (readOnly || !selectedId) return;
      const at = state.objects.findIndex((o) => o.id === selectedId);
      if (at === -1) return;
      pushUndo();
      const obj = state.objects[at];
      state.objects.splice(at, 1);
      if (direction === 'front') state.objects.push(obj);
      else if (direction === 'back') state.objects.unshift(obj);
      else if (direction === 'forward') state.objects.splice(Math.min(state.objects.length, at + 1), 0, obj);
      else state.objects.splice(Math.max(0, at - 1), 0, obj);
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
        const cx = (rect.width / 2 - v.x) / v.zoom, cy = (rect.height / 2 - v.y) / v.zoom;
        state.objects.push({ id: uid(), type: 'math', color, size: 32, x: cx, y: cy, text: sym });
        render(); notify();
      },
      updateSelected(patch) {
        if (readOnly || !selectedId) return;
        const obj = state.objects.find((o) => o.id === selectedId);
        if (!obj) return;
        pushUndo(); Object.assign(obj, patch); render(); notify();
      },
      deleteSelected() {
        if (!selectedId || readOnly) return;
        pushUndo(); state.objects = state.objects.filter((o) => o.id !== selectedId); selectedId = null; render(); notify();
      },
      undo() { if (!undo.length || readOnly) return; redo.push(JSON.stringify(state.objects)); state.objects = JSON.parse(undo.pop()); selectedId = null; render(); notify(); },
      redo() { if (!redo.length || readOnly) return; undo.push(JSON.stringify(state.objects)); state.objects = JSON.parse(redo.pop()); selectedId = null; render(); notify(); },
      clear() { if (!state.objects.length || readOnly) return; pushUndo(); state.objects = []; selectedId = null; render(); notify(); },
      zoomIn() { const rect = canvas.getBoundingClientRect(); const spt = { x: rect.width / 2, y: rect.height / 2 }; const before = toWorld(spt); vp().zoom = Math.min(5, vp().zoom * 1.2); vp().x = spt.x - before.x * vp().zoom; vp().y = spt.y - before.y * vp().zoom; render(); notify(); },
      zoomOut() { const rect = canvas.getBoundingClientRect(); const spt = { x: rect.width / 2, y: rect.height / 2 }; const before = toWorld(spt); vp().zoom = Math.max(0.1, vp().zoom / 1.2); vp().x = spt.x - before.x * vp().zoom; vp().y = spt.y - before.y * vp().zoom; render(); notify(); },
      resetView() { vp().x = 0; vp().y = 0; vp().zoom = 1; render(); notify(); },
      moveSelected,
      getState() { return JSON.parse(JSON.stringify(state)); },
      getViewport() { return Object.assign({}, vp()); },
      getSelected() { return selectedId ? state.objects.find((o) => o.id === selectedId) || null : null; },
      diffOps,
      exportPNG(width, height) { return stateToPng(state, width, height); },
      setState(s, opts) {
        state = JSON.parse(JSON.stringify(s || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } }));
        state.objects = state.objects || []; state.viewport = state.viewport || { x: 0, y: 0, zoom: 1 };
        if (!opts || !opts.keepHistory) { undo = []; redo = []; }
        selectedId = null; closeEditor(); render();
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
        { type: 'text', x: 60, y: 46, text: 'Counting to 20', size: 34, color: '#17281c' },
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
        { type: 'text', x: 60, y: 46, text: 'Story retell', size: 34, color: '#17281c' },
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
        { type: 'text', x: 60, y: 46, text: 'Rhyme of the day', size: 34, color: '#17281c' },
        { type: 'sticky', x: 80, y: 150, w: 780, h: 210, text: 'Sing it together:\n\nLine one…\nLine two…\nLine three…\nLine four…\n\nClap on every third word.' }
      ] }
    },
    shape: {
      label: 'Shape sorter', hint: 'Sort, match and name — geometry for little hands.', icon: 'shapes', title: 'Shape sorter',
      state: { viewport: { x: 0, y: 0, zoom: 1 }, objects: [
        { type: 'text', x: 60, y: 46, text: 'Shape sorter', size: 34, color: '#17281c' },
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

  // ---- Detail / editor view ------------------------------------------------
  V.whiteboardDetail = {
    async load(ctx, params) {
      const board = await R.api('GET', '/whiteboards/' + encodeURIComponent(params.id)).then((p) => p.data);
      return { board };
    },

    render(ctx, params, page) {
      const b = page.board || {};
      const canEdit = ctx.has('curriculum.create.daycare');
      let html = '<div class="wb-shell' + (canEdit ? '' : ' wb-readonly') + '" data-board-id="' + attr(b.id) + '">';
      html += R.pageHead(esc(b.title || 'Whiteboard'), (b.description ? esc(b.description) + ' · ' : '') + 'Infinite canvas · collaborative (auto-saves)',
        '<a class="btn btn-secondary btn-sm" href="#/app/whiteboards">' + R.icon('arrow-left') + ' All boards</a>' +
        (b.lessonPlanTitle ? '<a class="btn btn-sm btn-ghost" href="#/app/curriculum?tab=plans" title="Created from a lesson guide">' + R.icon('book-open') + ' ' + R.esc(R.truncate(b.lessonPlanTitle, 40)) + '</a>' : '') +
        (canEdit ? '<button class="btn btn-sm btn-secondary" id="wb-history-btn">' + R.icon('history') + ' History</button>' : '') +
        '<button class="btn btn-sm btn-secondary" id="wb-present-btn">' + R.icon('monitor-play') + ' Present</button>' +
        '<button class="btn btn-sm btn-secondary" id="wb-export-btn">' + R.icon('image-down') + ' Export</button>' +
        (canEdit ? '<button class="btn btn-secondary btn-sm" id="wb-save-btn">' + R.icon('save') + ' Save</button>' : '') +
        (canEdit ? '<span class="badge wb-status" id="wb-status">Ready</span>' : '<span class="badge badge-warn">View only</span>'));
      html += R.teachingNav(ctx, 'whiteboards');

      html += '<div class="card glass wb-toolbar-card"><div class="wb-toolbar" id="wb-toolbar">';
      TOOL_GROUPS.forEach((group) => {
        html += '<div class="wb-tool-group"><span class="wb-group-label">' + esc(group) + '</span><div class="wb-tools">' +
          Object.entries(TOOLS).filter(([, t]) => t.group === group).map(([k, t]) =>
            '<button type="button" class="btn btn-sm wb-tool ' + (k === 'pen' ? 'active' : '') + '" data-tool="' + k +
            '" title="' + esc(t.label) + ' (' + t.key + ')" aria-label="' + esc(t.label) + ' (' + t.key + ')">' + R.icon(t.icon) + '</button>').join('') +
        '</div></div>';
      });
      html += '<div class="wb-tool-group"><span class="wb-group-label">Style</span><div class="wb-tools">' +
        '<label class="wb-color" title="Colour"><input type="color" id="wb-color" value="#1f3b2a" aria-label="Colour"></label>' +
        '<select id="wb-width" class="select wb-select" title="Stroke width" aria-label="Stroke width"><option value="2">Thin</option><option value="3" selected>Medium</option><option value="6">Thick</option><option value="10">Bold</option></select>' +
        '</div></div>';
      html += '<div class="wb-tool-group"><span class="wb-group-label">Actions</span><div class="wb-tools">' +
        '<button type="button" class="btn btn-sm btn-secondary wb-icon-btn" id="wb-undo" title="Undo (Ctrl+Z)" aria-label="Undo">' + R.icon('undo-2') + '</button>' +
        '<button type="button" class="btn btn-sm btn-secondary wb-icon-btn" id="wb-redo" title="Redo (Ctrl+Y)" aria-label="Redo">' + R.icon('redo-2') + '</button>' +
        '<button type="button" class="btn btn-sm btn-secondary wb-icon-btn" id="wb-del" title="Delete selected (Delete)" aria-label="Delete selected">' + R.icon('trash-2') + '</button>' +
        '<button type="button" class="btn btn-sm btn-secondary wb-icon-btn" id="wb-clear" title="Clear canvas" aria-label="Clear canvas">' + R.icon('file-x-2') + '</button>' +
        '<button type="button" class="btn btn-sm btn-secondary wb-icon-btn" id="wb-snap" title="Snap to grid" aria-label="Snap to grid" aria-pressed="false">' + R.icon('grid-3x3') + '</button>' +
        '<button type="button" class="btn btn-sm btn-secondary wb-icon-btn" id="wb-keys" title="Keyboard shortcuts" aria-label="Keyboard shortcuts">' + R.icon('keyboard') + '</button>' +
        '</div></div>';
      html += '<div class="wb-tool-group"><span class="wb-group-label">View</span><div class="wb-tools">' +
        '<button type="button" class="btn btn-sm btn-secondary wb-icon-btn" id="wb-zin" title="Zoom in (+)" aria-label="Zoom in">' + R.icon('zoom-in') + '</button>' +
        '<button type="button" class="btn btn-sm btn-secondary wb-icon-btn" id="wb-zout" title="Zoom out (−)" aria-label="Zoom out">' + R.icon('zoom-out') + '</button>' +
        '<button type="button" class="btn btn-sm btn-secondary wb-icon-btn" id="wb-reset" title="Reset view (0)" aria-label="Reset view">' + R.icon('maximize') + '</button>' +
        '</div></div>';
      html += '<div class="wb-tool-group wb-math-group"><button type="button" class="btn btn-sm btn-secondary" id="wb-math-toggle" aria-expanded="false" aria-controls="wb-mathbar">' + R.icon('sigma') + ' Math / science</button></div>';
      html += '<div class="wb-mathbar" id="wb-mathbar" hidden><span class="muted small" style="margin-right:6px">Tap to place:</span>' +
        MATH_SYMBOLS.map((s) => '<button type="button" class="btn btn-sm btn-ghost wb-math" data-sym="' + attr(s) + '" aria-label="Insert ' + attr(s) + '">' + esc(s) + '</button>').join('') +
      '</div></div>';

      html += '<div class="wb-object-inspector" id="wb-inspector" hidden>' +
        '<strong class="small">Selected object</strong>' +
        '<label class="small">Colour <input type="color" id="wb-obj-color" aria-label="Object colour"></label>' +
        '<label class="small">Size <input type="range" id="wb-obj-size" min="8" max="120" value="20" aria-label="Object size"></label>' +
        '<label class="small">Fill <input type="color" id="wb-obj-fill" value="#fff4b8" aria-label="Sticky note fill"></label>' +
        '<div class="wb-layer-btns">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-layer="front">Front</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-layer="forward">Forward</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-layer="backward">Backward</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-layer="back">Back</button>' +
        '</div></div>';

      html += '<div class="card glass wb-canvas-wrap" id="wb-canvas-wrap" style="padding:0;overflow:hidden;position:relative;height:70vh;min-height:420px"><div class="wb-hint muted small">Space or Pan to move · scroll to zoom · click text/sticky to type inline</div></div>';
      html += '<div class="wb-history-panel" id="wb-history-panel" hidden><div class="queue-head"><strong>Version history</strong>' +
        '<button type="button" class="btn btn-sm btn-secondary" id="wb-snapshot-btn">Save a version</button>' +
        '<button type="button" class="btn btn-ghost btn-icon btn-sm" id="wb-history-close" aria-label="Close history">' + R.icon('x') + '</button></div>' +
        '<div class="wb-history-list"><span class="muted small">Loading…</span></div></div>';
      html += '<input type="hidden" id="wb-version" value="' + attr(String(b.version || 1)) + '">';
      html += '</div>';
      return html;
    }
  };

  // Render thumbnails after the list view mounts.
  const thumbCache = new Map();
  V._initWhiteboards = function (ctx, page) {
    if (!window.Reel || !R.feedback) return;
    const cards = [...document.querySelectorAll('.wb-thumb')];
    cards.forEach((canvas) => {
      const id = canvas.getAttribute('data-board-id');
      const board = ((page || {}).boards || []).find((b) => b.id === id);
      if (!board) return;
      const width = Math.max(120, canvas.clientWidth || 320);
      const height = 132;
      if (thumbCache.has(id)) { renderThumbnail(canvas, thumbCache.get(id), width, height); return; }
      R.api('GET', '/whiteboards/' + encodeURIComponent(id)).then((res) => {
        const state = (res && res.data && res.data.state) || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } };
        thumbCache.set(id, state);
        renderThumbnail(canvas, state, Math.max(120, canvas.clientWidth || width), height);
      }).catch(() => renderThumbnail(canvas, { objects: [] }, width, height));
    });
  };

  // ---- Editor initialization ----------------------------------------------
  V._initWhiteboard = function (ctx, page) {
    const board = page && page.board;
    if (!board) return;
    const wrap = document.getElementById('wb-canvas-wrap');
    if (!wrap || wrap._wbInit) return;
    wrap._wbInit = true;
    const statusEl = document.getElementById('wb-status');
    const verEl = document.getElementById('wb-version');
    let version = Number(board.version || 1);
    let dirty = false;
    let saving = false;
    let savedAt = Date.now();
    let lastSaved = JSON.parse(JSON.stringify((board.state || {}).objects || []));
    const canEdit = ctx.has('curriculum.create.daycare');

    function badge(text, tone) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.classList.toggle('is-warn', tone === 'warn');
      statusEl.classList.toggle('is-good', tone === 'good');
    }
    function relativeSaved() {
      if (!dirty) {
        const secs = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
        badge(secs < 8 ? 'Saved just now' : 'Saved ' + R.relative(new Date(savedAt - secs * 1000).toISOString()), 'good');
      }
    }

    const inspector = document.getElementById('wb-inspector');
    const engine = newBoardCanvas(wrap, board.state || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } }, () => {
      dirty = true; badge('Editing…', 'warn');
    }, {
      readOnly: !canEdit,
      onSelection(obj) {
        if (!inspector) return;
        inspector.hidden = !obj;
        if (!obj) return;
        const colour = inspector.querySelector('#wb-obj-color');
        const fill = inspector.querySelector('#wb-obj-fill');
        const size = inspector.querySelector('#wb-obj-size');
        if (colour) colour.value = /^#[0-9a-f]{6}$/i.test(obj.color || '') ? obj.color : '#1f3b2a';
        if (fill) fill.value = /^#[0-9a-f]{6}$/i.test(obj.fill || '') ? obj.fill : '#fff4b8';
        if (size) size.value = String(obj.size || 20);
        inspector.querySelectorAll('.wb-layer-btns button').forEach((b) => { b.disabled = !canEdit; });
      }
    });
    engine.setReadOnly(!canEdit);

    function setActiveTool(t) {
      engine.setTool(t);
      document.querySelectorAll('.wb-tool').forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-tool') === t));
    }
    document.querySelectorAll('.wb-tool').forEach((btn) => btn.addEventListener('click', () => setActiveTool(btn.getAttribute('data-tool'))));
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
        actions: Object.entries(TOOLS).map(([k, t]) => ({ label: t.label, icon: t.icon, run: () => setActiveTool(k) }))
          .concat([{ label: 'Undo / Redo — Ctrl+Z / Ctrl+Y', icon: 'undo-2', run: () => {} }, { label: 'Delete selected — Delete', icon: 'trash-2', run: () => engine.deleteSelected() }])
      });
    });
    const zin = document.getElementById('wb-zin'); if (zin) zin.addEventListener('click', () => engine.zoomIn());
    const zout = document.getElementById('wb-zout'); if (zout) zout.addEventListener('click', () => engine.zoomOut());
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

    if (inspector) {
      const objColor = inspector.querySelector('#wb-obj-color');
      const objFill = inspector.querySelector('#wb-obj-fill');
      const objSize = inspector.querySelector('#wb-obj-size');
      if (objColor) objColor.addEventListener('input', (e) => engine.updateSelected({ color: e.target.value }));
      if (objFill) objFill.addEventListener('input', (e) => engine.updateSelected({ fill: e.target.value }));
      if (objSize) objSize.addEventListener('input', (e) => engine.updateSelected({ size: Number(e.target.value) || 20 }));
      inspector.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => engine.moveSelected(b.getAttribute('data-layer'))));
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

    async function save(silent, force) {
      if (!canEdit || saving) return;
      if (!dirty && !force) { relativeSaved(); return; }
      const ops = engine.diffOps(lastSaved);
      const viewport = engine.getViewport();
      if (!ops.length && !force) { relativeSaved(); return; }
      saving = true; badge('Saving…');
      try {
        const res = await R.api('PUT', '/whiteboards/' + encodeURIComponent(board.id) + '/state', {
          ops, viewport, version: force ? undefined : version
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
    const saveBtn = document.getElementById('wb-save-btn'); if (saveBtn) saveBtn.addEventListener('click', () => save(false, true));

    const autosave = setInterval(() => { if (dirty) save(true); }, 4000);
    const statusTick = setInterval(() => { if (!dirty && !saving) relativeSaved(); }, 3000);
    const poll = setInterval(async () => {
      if (saving || dirty) return;
      try {
        const res = await R.api('GET', '/whiteboards/' + encodeURIComponent(board.id));
        const d = res && res.data ? res.data : res;
        if (d && Number(d.version) > version) {
          version = Number(d.version); if (verEl) verEl.value = String(version);
          engine.setState(d.state || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } });
          lastSaved = JSON.parse(JSON.stringify((d.state || {}).objects || []));
          badge('Synced with collaborator', 'good');
        }
      } catch (e) { badge('Offline — changes queued', 'warn'); }
    }, 5000);

    // ---- Present / export --------------------------------------------------
    function closePresentation() {
      const overlay = document.querySelector('.wb-presentation');
      if (overlay) overlay.remove();
      const onKey = (e) => { if (e.key === 'Escape') closePresentation(); };
      document.removeEventListener('keydown', onKey);
    }
    const presentBtn = document.getElementById('wb-present-btn');
    if (presentBtn) presentBtn.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'wb-presentation';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', esc(board.title || 'Whiteboard') + ' presented');
      overlay.innerHTML = '<div class="wb-present-top"><strong>' + esc(board.title || 'Whiteboard') + '</strong>' +
        '<button type="button" class="btn btn-sm btn-secondary" data-wb-present-close>Exit presentation</button></div>' +
        '<img alt="Presented whiteboard" src="' + engine.exportPNG(1800, 1000) + '">';
      document.body.appendChild(overlay);
      overlay.querySelector('[data-wb-present-close]').addEventListener('click', closePresentation);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closePresentation(); });
      const onKey = (e) => { if (e.key === 'Escape') closePresentation(); };
      document.addEventListener('keydown', onKey);
      if (overlay.requestFullscreen && !R.anim.reduced()) overlay.requestFullscreen().catch(() => null);
    });

    const exportBtn = document.getElementById('wb-export-btn');
    if (exportBtn) exportBtn.addEventListener('click', () => {
      if (R.feedback) R.feedback.sheet({
        title: 'Export this board', message: 'A clean image of everything on the canvas.',
        actions: [
          { label: 'Download PNG', icon: 'image-down', run: () => {
            const link = document.createElement('a');
            link.href = engine.exportPNG(1800, 1000);
            link.download = String(board.title || 'whiteboard').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
            document.body.appendChild(link); link.click(); link.remove();
            if (ctx.toast) ctx.toast('Board image downloaded.');
          } },
          { label: 'Print / save as PDF', icon: 'printer', run: () => {
            let sheet = document.getElementById('wb-print-sheet');
            if (!sheet) { sheet = document.createElement('div'); sheet.id = 'wb-print-sheet'; document.body.appendChild(sheet); }
            sheet.innerHTML = '<h1>' + esc(board.title || 'Whiteboard') + '</h1><img src="' + engine.exportPNG(1800, 1000) + '" alt="Whiteboard">';
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
          '<div class="wb-history-row"><div><strong>' + esc(s.label || ('Version ' + s.version)) + '</strong>' +
          '<div class="muted small">' + R.relative(s.createdAt) + ' · ' + R.number(s.objectCount || 0) + ' objects' +
          (s.createdByName ? ' · ' + esc(s.createdByName) : '') + '</div></div>' +
          '<button type="button" class="btn btn-sm btn-secondary" data-restore="' + attr(s.id) + '">' + R.icon('rotate-ccw') + ' Restore</button></div>').join('')
          : '<span class="muted small">No saved versions yet. Changes are saved automatically as you work.</span>';
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
    if (historyBtn && historyPanel) historyBtn.addEventListener('click', () => {
      historyPanel.hidden = !historyPanel.hidden;
      if (!historyPanel.hidden) loadHistory();
    });
    if (historyClose && historyPanel) historyClose.addEventListener('click', () => { historyPanel.hidden = true; });
    const snapshotBtn = document.getElementById('wb-snapshot-btn');
    if (snapshotBtn) snapshotBtn.addEventListener('click', async () => {
      try {
        await R.api('POST', '/whiteboards/' + encodeURIComponent(board.id) + '/snapshots', { label: 'Manual save' });
        if (ctx.toast) ctx.toast('Version saved.');
        loadHistory();
      } catch (e) { if (ctx.toast) ctx.toast(e.message || 'Could not save a version.', 'error'); }
    });

    wrap._wbCleanup = () => {
      clearInterval(autosave); clearInterval(statusTick); clearInterval(poll);
      document.removeEventListener('keydown', documentShortcuts);
      closePresentation();
      engine.destroy();
    };
    setActiveTool('pen');
    badge('Ready', 'good');
  };

  // Expose the renderer so tests and other views can draw thumbnails.
  R.whiteboardCanvas = { renderThumbnail, stateToPng, objectBounds, boardBounds, drawObject };
})();
