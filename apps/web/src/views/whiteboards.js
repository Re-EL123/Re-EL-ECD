'use strict';

/**
 * Interactive whiteboards: infinite digital canvases for teaching, annotation,
 * math/science sketching and collaborative problem-solving. State is persisted
 * and polled for collaboration.
 */
(function () {
  const R = window.Reel;
  const V = R.views;

  function esc(s) { return R.esc(s == null ? '' : String(s)); }

  function uid() { return 'o' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  // Simple vector object model stored in board state
  const TOOLS = {
    select: { label: 'Select', icon: 'mouse-pointer-2' },
    pen: { label: 'Pen', icon: 'pencil' },
    highlighter: { label: 'Highlighter', icon: 'highlighter' },
    eraser: { label: 'Eraser', icon: 'eraser' },
    line: { label: 'Line', icon: 'minus' },
    arrow: { label: 'Arrow', icon: 'arrow-right' },
    rect: { label: 'Rectangle', icon: 'square' },
    circle: { label: 'Circle', icon: 'circle' },
    text: { label: 'Text', icon: 'type' },
    sticky: { label: 'Sticky note', icon: 'sticky-note' },
    math: { label: 'Math/Science', icon: 'sigma' }
  };

  const MATH_SYMBOLS = ['+', '−', '×', '÷', '=', '≠', '≈', '<', '>', '≤', '≥', 'π', '√', 'x²', 'x³', '½', '¼', '°', 'α', 'β', 'θ', 'Δ', '∑', '∞', '→', '↔', 'H₂O', 'CO₂', 'O₂', 'NaCl', 'E=mc²'];

  function newBoardCanvas(container, initialState, onChange) {
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
    let drawing = null; // current in-progress object
    let panning = false;
    let panStart = null;
    let spacePan = false;
    let selectedId = null;
    let undo = [];
    let redo = [];

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

    function toWorld(pt) {
      const v = vp();
      return { x: (pt.x - v.x) / v.zoom, y: (pt.y - v.y) / v.zoom };
    }
    function toScreen(pt) {
      const v = vp();
      return { x: pt.x * v.zoom + v.x, y: pt.y * v.zoom + v.y };
    }

    function point(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function pushUndo() {
      undo.push(JSON.stringify(state.objects));
      if (undo.length > 60) undo.shift();
      redo = [];
    }

    function notify() { if (onChange) onChange(JSON.parse(JSON.stringify(state))); }

    function drawGrid() {
      const v = vp();
      const rect = canvas.getBoundingClientRect();
      const step = 40 * v.zoom;
      if (step < 10) return;
      const offX = ((v.x % step) + step) % step;
      const offY = ((v.y % step) + step) % step;
      ctx.save();
      ctx.strokeStyle = 'rgba(120,140,125,0.12)';
      ctx.lineWidth = 1;
      for (let x = offX; x < rect.width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke(); }
      for (let y = offY; y < rect.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke(); }
      ctx.restore();
    }

    function renderObject(o, alpha) {
      ctx.save();
      if (alpha != null) ctx.globalAlpha = alpha;
      const c = o.color || '#1f3b2a';
      const w = o.width || 2;
      if (o.type === 'path' || o.type === 'highlighter') {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (o.type === 'highlighter') { ctx.globalAlpha = (alpha != null ? alpha : 1) * 0.35; ctx.lineWidth = Math.max(w, 14); }
        const pts = o.points || [];
        if (pts.length < 2) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc((pts[0]||{x:0}).x, (pts[0]||{y:0}).y, w/2, 0, Math.PI*2); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); }
      } else if (o.type === 'line' || o.type === 'arrow') {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
        if (o.type === 'arrow') {
          const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1); const len = 12 + w;
          ctx.beginPath(); ctx.moveTo(o.x2, o.y2);
          ctx.lineTo(o.x2 - len*Math.cos(ang-0.4), o.y2 - len*Math.sin(ang-0.4));
          ctx.moveTo(o.x2, o.y2);
          ctx.lineTo(o.x2 - len*Math.cos(ang+0.4), o.y2 - len*Math.sin(ang+0.4));
          ctx.stroke();
        }
      } else if (o.type === 'rect') {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.strokeRect(o.x, o.y, o.w, o.h);
      } else if (o.type === 'circle') {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(o.cx, o.cy, Math.abs(o.rx), Math.abs(o.ry), 0, 0, Math.PI*2); ctx.stroke();
      } else if (o.type === 'text' || o.type === 'math') {
        ctx.fillStyle = c; ctx.font = (o.size || (o.type === 'math' ? 28 : 20)) + 'px "Segoe UI", Arial, sans-serif';
        ctx.textBaseline = 'top'; ctx.fillText(o.text || '', o.x, o.y);
      } else if (o.type === 'sticky') {
        const ww = o.w || 180, hh = o.h || 140;
        ctx.fillStyle = o.fill || '#FFF4B8'; ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(o.x, o.y, ww, hh, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#4a3b00'; ctx.font = '16px "Segoe UI", Arial, sans-serif'; ctx.textBaseline = 'top';
        const lines = String(o.text || '').split('\n');
        lines.forEach((ln, i) => ctx.fillText(ln, o.x + 12, o.y + 12 + i * 22));
      }
      if (selectedId && o.id === selectedId) {
        const b = bounds(o);
        if (b) { ctx.strokeStyle = '#3D8FAE'; ctx.lineWidth = 1.5; ctx.setLineDash([5,4]); ctx.strokeRect(b.x-4,b.y-4,b.w+8,b.h+8); ctx.setLineDash([]); }
      }
      ctx.restore();
    }

    function bounds(o) {
      if (!o) return null;
      if (o.type === 'path' || o.type === 'highlighter') {
        const pts = o.points || []; if (!pts.length) return null;
        let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
        pts.forEach(p=>{ if(p.x<minx)minx=p.x; if(p.y<miny)miny=p.y; if(p.x>maxx)maxx=p.x; if(p.y>maxy)maxy=p.y; });
        return {x:minx,y:miny,w:Math.max(1,maxx-minx),h:Math.max(1,maxy-miny)};
      }
      if (o.type === 'line' || o.type === 'arrow') return {x:Math.min(o.x1,o.x2),y:Math.min(o.y1,o.y2),w:Math.max(1,Math.abs(o.x2-o.x1)),h:Math.max(1,Math.abs(o.y2-o.y1))};
      if (o.type === 'rect') return {x:Math.min(o.x,o.x+o.w),y:Math.min(o.y,o.y+o.h),w:Math.abs(o.w),h:Math.abs(o.h)};
      if (o.type === 'circle') return {x:o.cx-Math.abs(o.rx),y:o.cy-Math.abs(o.ry),w:Math.abs(o.rx)*2,h:Math.abs(o.ry)*2};
      if (o.type === 'text' || o.type === 'math') return {x:o.x,y:o.y,w:Math.max(40,(o.text||'').length*((o.size||20)*0.6)),h:(o.size||20)+6};
      if (o.type === 'sticky') return {x:o.x,y:o.y,w:o.w||180,h:o.h||140};
      return null;
    }

    function hitTest(wpt) {
      for (let i = state.objects.length - 1; i >= 0; i--) {
        const b = bounds(state.objects[i]);
        if (b && wpt.x >= b.x-6 && wpt.x <= b.x+b.w+6 && wpt.y >= b.y-6 && wpt.y <= b.y+b.h+6) return state.objects[i];
      }
      return null;
    }

    function render() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.save();
      ctx.fillStyle = '#fafbf8';
      ctx.fillRect(0, 0, rect.width, rect.height);
      drawGrid();
      const v = vp();
      ctx.translate(v.x, v.y);
      ctx.scale(v.zoom, v.zoom);
      for (const o of state.objects) renderObject(o);
      if (drawing) renderObject(drawing, 0.9);
      ctx.restore();
    }

    function onPointerDown(e) {
      canvas.setPointerCapture(e.pointerId);
      const spt = point(e);
      const wpt = toWorld(spt);
      if (panning || spacePan || tool === 'hand' || e.button === 1) {
        panning = true; panStart = { x: spt.x - vp().x, y: spt.y - vp().y }; return;
      }
      if (tool === 'select') {
        const hit = hitTest(wpt);
        selectedId = hit ? hit.id : null;
        if (hit) { drawing = { drag: true, id: hit.id, start: wpt, orig: JSON.parse(JSON.stringify(hit)) }; }
        render(); return;
      }
      if (tool === 'eraser') {
        const hit = hitTest(wpt);
        if (hit) { pushUndo(); state.objects = state.objects.filter(o => o.id !== hit.id); selectedId = null; render(); notify(); }
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
      } else if (tool === 'text') {
        const text = window.prompt('Enter text:');
        if (text) { pushUndo(); state.objects.push({ id: uid(), type: 'text', color, size: 22, x: wpt.x, y: wpt.y, text }); notify(); }
        render(); return;
      } else if (tool === 'sticky') {
        const text = window.prompt('Sticky note:') || '';
        pushUndo(); state.objects.push({ id: uid(), type: 'sticky', x: wpt.x, y: wpt.y, w: 180, h: 140, text, fill: '#FFF4B8' }); notify(); render(); return;
      } else if (tool === 'math') {
        // math symbols placed via toolbar; fallback prompt
        const text = window.prompt('Math/science expression or symbol:');
        if (text) { pushUndo(); state.objects.push({ id: uid(), type: 'math', color, size: 28, x: wpt.x, y: wpt.y, text }); notify(); }
        render(); return;
      }
      render();
    }

    function onPointerMove(e) {
      const spt = point(e);
      const wpt = toWorld(spt);
      if (panning && panStart) { vp().x = spt.x - panStart.x; vp().y = spt.y - panStart.y; render(); return; }
      if (!drawing) return;
      if (drawing.erasing) {
        const hit = hitTest(wpt);
        if (hit) { if (!drawing._did) { pushUndo(); drawing._did = true; } state.objects = state.objects.filter(o => o.id !== hit.id); render(); notify(); }
        return;
      }
      if (drawing.drag) {
        const obj = state.objects.find(o => o.id === drawing.id);
        if (obj) {
          const dx = wpt.x - drawing.start.x, dy = wpt.y - drawing.start.y;
          const o = drawing.orig;
          if (obj.type === 'path' || obj.type === 'highlighter') obj.points = (o.points||[]).map(p => ({x:p.x+dx,y:p.y+dy}));
          else if (obj.type === 'line' || obj.type === 'arrow') { obj.x1=o.x1+dx; obj.y1=o.y1+dy; obj.x2=o.x2+dx; obj.y2=o.y2+dy; }
          else if (obj.type === 'rect' || obj.type === 'text' || obj.type === 'math' || obj.type === 'sticky') { obj.x=o.x+dx; obj.y=o.y+dy; }
          else if (obj.type === 'circle') { obj.cx=o.cx+dx; obj.cy=o.cy+dy; }
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

    function onPointerUp(e) {
      if (panning) { panning = false; panStart = null; notify(); return; }
      if (!drawing) return;
      if (drawing.drag) { if (drawing.start) { pushUndo(); /* already moved in place */ } notify(); drawing = null; render(); return; }
      if (drawing.erasing) { drawing = null; return; }
      if (drawing.type === 'path' || drawing.type === 'highlighter') {
        if ((drawing.points||[]).length > 0) { pushUndo(); state.objects.push(drawing); notify(); }
      } else if (drawing.type === 'line' || drawing.type === 'arrow') {
        if (Math.hypot(drawing.x2-drawing.x1, drawing.y2-drawing.y1) > 2) { pushUndo(); state.objects.push(drawing); notify(); }
      } else if (drawing.type === 'rect') {
        if (Math.abs(drawing.w) > 2 || Math.abs(drawing.h) > 2) { pushUndo(); state.objects.push(drawing); notify(); }
      } else if (drawing.type === 'circle') {
        if (Math.abs(drawing.rx) > 2 || Math.abs(drawing.ry) > 2) { pushUndo(); state.objects.push(drawing); notify(); }
      }
      drawing = null; render();
    }

    function onWheel(e) {
      e.preventDefault();
      const spt = point(e);
      const before = toWorld(spt);
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const nz = Math.min(5, Math.max(0.1, vp().zoom * factor));
      vp().zoom = nz;
      vp().x = spt.x - before.x * nz;
      vp().y = spt.y - before.y * nz;
      render();
      notify();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    return {
      setTool(t) { tool = t; },
      getTool() { return tool; },
      setColor(c) { color = c; },
      setWidth(w) { strokeW = w; },
      addMathSymbol(sym) { pushUndo(); const v = vp(); const rect = canvas.getBoundingClientRect(); const cx = (rect.width/2 - v.x)/v.zoom; const cy = (rect.height/2 - v.y)/v.zoom; state.objects.push({ id: uid(), type: 'math', color, size: 32, x: cx, y: cy, text: sym }); render(); notify(); },
      deleteSelected() { if (!selectedId) return; pushUndo(); state.objects = state.objects.filter(o => o.id !== selectedId); selectedId = null; render(); notify(); },
      undo() { if (!undo.length) return; redo.push(JSON.stringify(state.objects)); state.objects = JSON.parse(undo.pop()); selectedId = null; render(); notify(); },
      redo() { if (!redo.length) return; undo.push(JSON.stringify(state.objects)); state.objects = JSON.parse(redo.pop()); selectedId = null; render(); notify(); },
      clear() { if (!state.objects.length) return; pushUndo(); state.objects = []; selectedId = null; render(); notify(); },
      zoomIn() { const rect = canvas.getBoundingClientRect(); const spt={x:rect.width/2,y:rect.height/2}; const before=toWorld(spt); vp().zoom=Math.min(5,vp().zoom*1.2); vp().x=spt.x-before.x*vp().zoom; vp().y=spt.y-before.y*vp().zoom; render(); notify(); },
      zoomOut() { const rect = canvas.getBoundingClientRect(); const spt={x:rect.width/2,y:rect.height/2}; const before=toWorld(spt); vp().zoom=Math.max(0.1,vp().zoom/1.2); vp().x=spt.x-before.x*vp().zoom; vp().y=spt.y-before.y*vp().zoom; render(); notify(); },
      resetView() { vp().x = 0; vp().y = 0; vp().zoom = 1; render(); notify(); },
      getState() { return JSON.parse(JSON.stringify(state)); },
      setState(s, opts) { state = JSON.parse(JSON.stringify(s || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } })); state.objects = state.objects || []; state.viewport = state.viewport || { x: 0, y: 0, zoom: 1 }; if (!opts || !opts.keepHistory) { undo = []; redo = []; } selectedId = null; render(); },
      destroy() { try { ro.disconnect(); } catch(_){} canvas.remove(); }
    };
  }

  /* Ready-made board templates — each seeds a valid canvas state. */
  const TEMPLATES = {
    math: {
      label: 'Maths canvas',
      hint: 'Counting, number lines and problem-solving frames.',
      icon: 'sigma',
      title: 'Maths canvas',
      state: { viewport: { x: 0, y: 0, zoom: 1 }, version: 1, objects: [
        { type: 'text', x: 60, y: 46, text: 'Counting to 20', size: 34, color: '#17281c' },
        { type: 'arrow', x1: 60, y1: 152, x2: 840, y2: 152, color: '#2f5c3c', width: 3 },
        { type: 'sticky', x: 60, y: 196, w: 175, h: 132, text: '1–5\nCount out loud\ntogether.' },
        { type: 'sticky', x: 262, y: 196, w: 175, h: 132, text: '6–10\nPoint at each\nnumber.' },
        { type: 'sticky', x: 464, y: 196, w: 175, h: 132, text: '11–15\nCount backwards\nfrom 15.' },
        { type: 'sticky', x: 666, y: 196, w: 175, h: 132, text: '16–20\nWhat comes\nnext?' }
      ] }
    },
    story: {
      label: 'Story retell',
      hint: 'Beginning, middle and end — the shape of every tale.',
      icon: 'book-open',
      title: 'Story retell',
      state: { viewport: { x: 0, y: 0, zoom: 1 }, version: 1, objects: [
        { type: 'text', x: 60, y: 46, text: 'Story retell', size: 34, color: '#17281c' },
        { type: 'sticky', x: 60, y: 150, w: 230, h: 176, text: 'Beginning\nWho is in the\nstory? Where?' },
        { type: 'arrow', x1: 312, y1: 238, x2: 380, y2: 238, color: '#2f5c3c', width: 3 },
        { type: 'sticky', x: 400, y: 150, w: 230, h: 176, text: 'Middle\nWhat happens?\nWhat changes?' },
        { type: 'arrow', x1: 652, y1: 238, x2: 720, y2: 238, color: '#2f5c3c', width: 3 },
        { type: 'sticky', x: 740, y: 150, w: 230, h: 176, text: 'End\nHow does it\nfinish?' }
      ] }
    },
    rhyme: {
      label: 'Rhyme / song board',
      hint: 'Verse-by-verse with space to add movement cues.',
      icon: 'music',
      title: 'Rhyme of the day',
      state: { viewport: { x: 0, y: 0, zoom: 1 }, version: 1, objects: [
        { type: 'text', x: 60, y: 46, text: 'Rhyme of the day', size: 34, color: '#17281c' },
        { type: 'sticky', x: 80, y: 150, w: 780, h: 210, text: 'Sing it together:\n\nLine one…\nLine two…\nLine three…\nLine four…\n\nClap on every third word.' }
      ] }
    },
    shape: {
      label: 'Shape sorter',
      hint: 'Sort, match and name — geometry for little hands.',
      icon: 'shapes',
      title: 'Shape sorter',
      state: { viewport: { x: 0, y: 0, zoom: 1 }, version: 1, objects: [
        { type: 'text', x: 60, y: 46, text: 'Shape sorter', size: 34, color: '#17281c' },
        { type: 'sticky', x: 80, y: 150, w: 170, h: 120, text: 'Circles\nRound like\na ball?' },
        { type: 'sticky', x: 280, y: 150, w: 170, h: 120, text: 'Squares\nFour equal\nsides?' },
        { type: 'sticky', x: 480, y: 150, w: 170, h: 120, text: 'Triangles\nThree\nsides?' },
        { type: 'sticky', x: 680, y: 150, w: 170, h: 120, text: 'Rectangles\nTwo long,\ntwo short?' }
      ] }
    }
  };

  V.whiteboards = {
    async load() {
      const [boards, plans] = await Promise.all([
        R.api('GET', '/whiteboards').then((p) => p.data || []).catch(() => []),
        R.api('GET', '/curriculum/lesson-plans?pageSize=100').then((p) => (Array.isArray(p.data) ? p.data : (p.data && p.data.data) || [])).catch(() => [])
      ]);
      return { boards, plans };
    },

    render(ctx, params, page) {
      const boards = page.boards || [];
      const canEdit = ctx.has('curriculum.create.daycare');
      let html = R.pageHead('Whiteboards', 'Infinite digital canvases for teaching, annotation, math/science sketching and collaborative problem-solving.',
        (canEdit ? '<button class="btn btn-primary btn-sm" @click="openNamedModal(\'whiteboard\')">' + R.icon('plus') + ' New whiteboard</button>' : '') +
        R.exportButtons('/exports/whiteboards') +
        R.refreshButton());
      html += R.teachingNav(ctx, 'whiteboards');

      html += '<div class="grid grid-3 section">' +
        R.statCard({ label: 'Boards', value: R.number(boards.length), icon: 'presentation', foot: 'In your workspace' }) +
        R.statCard({ label: 'Recently active', value: R.number(boards.filter(b => (Date.now()-new Date(b.updatedAt).getTime()) < 7*86400000).length), icon: 'clock', tone: 'sky', foot: 'Updated this week' }) +
        R.statCard({ label: 'Collaborative', value: 'Live', icon: 'users', tone: 'green', foot: 'Shared, auto-saving canvases' }) +
        '</div>';

      if (!boards.length) {
        const plans = (page.plans || []).slice(0, 100);
        const templateButton = (kind) => {
          const t = TEMPLATES[kind];
          return '<button type="button" class="wb-template" @click="openNamedModal(\'whiteboardTemplate\',\'' + kind + '\')">' +
            '<span class="empty-icon">' + R.icon(t.icon) + '</span>' +
            '<span class="wb-template-title">' + esc(t.label) + '</span>' +
            '<span class="muted small">' + esc(t.hint) + '</span>' +
            '<span class="wb-template-cta">Use template ' + R.icon('arrow-right') + '</span>' +
          '</button>';
        };
        html += '<div class="section"></div><h3 style="margin-bottom:10px">Start from a template</h3>' +
          '<div class="wb-gallery">' +
            templateButton('math') + templateButton('story') + templateButton('rhyme') + templateButton('shape') +
            '<button type="button" class="wb-template wb-template-blank" @click="openNamedModal(\'whiteboard\')">' +
              '<span class="empty-icon">' + R.icon('pen-tool') + '</span>' +
              '<span class="wb-template-title">Blank canvas</span>' +
              '<span class="muted small">An empty infinite canvas — draw, write and annotate.</span>' +
              '<span class="wb-template-cta">Start blank ' + R.icon('arrow-right') + '</span>' +
            '</button>' +
            (plans.length ? '<button type="button" class="wb-template" @click="openNamedModal(\'whiteboardFromPlan\')">' +
              '<span class="empty-icon">' + R.icon('graduation-cap') + '</span>' +
              '<span class="wb-template-title">From a lesson plan</span>' +
              '<span class="muted small">Create the board for a plan — the guide links to it.</span>' +
              '<span class="wb-template-cta">Choose a plan ' + R.icon('arrow-right') + '</span>' +
            '</button>' : '') +
          '</div>' +
          '<p class="muted small" style="margin-top:14px;text-align:center">Boards auto-save and stay editable by the whole team — open one and start drawing.</p>';
      } else {
        const wbFilter = String((ctx.filters || {}).linked || 'all');
        const shown = wbFilter === 'linked'
          ? boards.filter((b) => !!b.lessonPlanId)
          : wbFilter === 'unlinked'
            ? boards.filter((b) => !b.lessonPlanId)
            : boards;
        html += R.filterBar('<select class="select" @change="setFilter(\'linked\',$event.target.value)" aria-label="Filter boards by plan link">' +
          '<option value="all"' + (wbFilter === 'all' ? ' selected' : '') + '>All boards</option>' +
          '<option value="linked"' + (wbFilter === 'linked' ? ' selected' : '') + '>Linked to lesson plans</option>' +
          '<option value="unlinked"' + (wbFilter === 'unlinked' ? ' selected' : '') + '>Not linked</option>' +
        '</select>');
        html += '<div class="grid grid-3 section">';
        shown.forEach((b) => {
          html += '<a class="card glass" href="#/app/whiteboards/' + R.attr(b.id) + '" style="text-decoration:none;color:inherit;display:block">' +
            '<div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start"><div><div class="strong">' + esc(b.title) + '</div>' +
            '<div class="muted small">' + (b.classroomName ? esc(b.classroomName) + ' · ' : '') + 'Updated ' + R.relative(b.updatedAt) + '</div></div>' +
            '<span class="badge badge-muted">' + R.number(b.objectCount || 0) + ' items</span></div>' +
            (b.description ? '<p class="muted small" style="margin-top:8px">' + esc(R.truncate(b.description, 100)) + '</p>' : '') +
            (b.lessonPlanTitle ? '<div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><span class="badge badge-green" title="Belongs to this lesson plan">' + R.icon('book-open') + ' ' + esc(R.truncate(b.lessonPlanTitle, 40)) + '</span></div>' : '') +
            '<div class="row" style="margin-top:10px;gap:8px;align-items:center">' + (b.createdByName ? R.avatar({ display_name: b.createdByName }, b.createdByName, { size: 30 }) + '<span class="muted small">' + esc(b.createdByName) + '</span>' : '') +
              '<span class="row-end row" style="gap:6px">' + R.icon('pen-tool') + '<span class="muted small">' + (b.lessonPlanTitle ? 'Open for this plan' : 'Open board') + '</span></span></div></a>';
        });
        html += '</div>';
      }
      return html;
    },

    openModal(ctx, name, id) {
      const page = ctx.page || {};
      if (name === 'whiteboard') {
        ctx.openModal({
          title: 'New whiteboard',
          endpoint: '/whiteboards',
          submitLabel: 'Create whiteboard',
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
          title: 'Use template: ' + template.label,
          endpoint: '/whiteboards',
          submitLabel: 'Create board',
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
          title: 'Board from a lesson plan',
          endpoint: '/whiteboards',
          submitLabel: 'Create board',
          description: 'The board is created with the lesson plan linked — the guide opens it directly from the plan’s whiteboard step.',
          fields: [
            { name: 'lessonPlanId', label: 'Lesson plan', type: 'select', required: true, options: plans.map((p) => ({ value: p.id, label: p.title })) },
            { name: 'title', label: 'Board title', required: true, placeholder: 'e.g. Nature Detectives — canvas' },
            { name: 'description', label: 'Description (optional)' }
          ],
          transform: (data) => Object.assign({}, data, { title: String(data.title || '').trim() || 'Lesson board' }),
          onSuccess: (data) => { if (data && data.id) location.hash = '#/app/whiteboards/' + data.id; }
        });
        return;
      }
    }
  };

  V.whiteboardDetail = {
    async load(ctx, params) {
      const board = await R.api('GET', '/whiteboards/' + encodeURIComponent(params.id)).then((p) => p.data);
      return { board };
    },

    render(ctx, params, page) {
      const b = page.board || {};
      const canEdit = ctx.has('curriculum.create.daycare');
      // shell: toolbar + canvas container; canvas is initialized after mount
      let html = '<div class="wb-shell" data-board-id="' + R.attr(b.id) + '">';
      html += R.pageHead(esc(b.title || 'Whiteboard'), (b.description ? esc(b.description) + ' · ' : '') + 'Infinite canvas · collaborative (auto-saves)',
        '<a class="btn btn-secondary btn-sm" href="#/app/whiteboards">' + R.icon('arrow-left') + ' All boards</a>' +
        (b.lessonPlanTitle ? '<a class="btn btn-sm btn-ghost" href="#/app/curriculum?tab=plans" title="This board was created from the lesson guide — the lesson guide will reopen it automatically.">' + R.icon('book-open') + ' ' + R.esc(R.truncate(b.lessonPlanTitle, 44)) + '</a>' : '') +
        (canEdit ? '<button class="btn btn-secondary btn-sm" id="wb-save-btn">' + R.icon('save') + ' Save</button>' : '') +
        '<span class="badge badge-muted" id="wb-status">Ready</span>');
      html += R.teachingNav(ctx, 'whiteboards');

      html += '<div class="card glass wb-toolbar-card"><div class="wb-toolbar" id="wb-toolbar">' +
        '<div class="wb-tools">' +
          Object.entries(TOOLS).map(([k, t]) => '<button type="button" class="btn btn-sm wb-tool ' + (k==='pen'?'active':'') + '" data-tool="' + k + '" title="' + esc(t.label) + '">' + R.icon(t.icon) + '</button>').join('') +
        '</div>' +
        '<div class="wb-tools">' +
          '<label class="wb-color" title="Color"><input type="color" id="wb-color" value="#1f3b2a"></label>' +
          '<select id="wb-width" class="select wb-select" title="Stroke width"><option value="2">Thin</option><option value="3" selected>Medium</option><option value="6">Thick</option><option value="10">Bold</option></select>' +
        '</div>' +
        '<div class="wb-tools">' +
          '<button type="button" class="btn btn-sm btn-secondary" id="wb-undo" title="Undo">' + R.icon('undo-2') + '</button>' +
          '<button type="button" class="btn btn-sm btn-secondary" id="wb-redo" title="Redo">' + R.icon('redo-2') + '</button>' +
          '<button type="button" class="btn btn-sm btn-secondary" id="wb-del" title="Delete selected">' + R.icon('trash-2') + '</button>' +
          '<button type="button" class="btn btn-sm btn-secondary" id="wb-clear" title="Clear canvas">' + R.icon('file-x-2') + '</button>' +
        '</div>' +
        '<div class="wb-tools">' +
          '<button type="button" class="btn btn-sm btn-secondary" id="wb-zin" title="Zoom in">' + R.icon('zoom-in') + '</button>' +
          '<button type="button" class="btn btn-sm btn-secondary" id="wb-zout" title="Zoom out">' + R.icon('zoom-out') + '</button>' +
          '<button type="button" class="btn btn-sm btn-secondary" id="wb-reset" title="Reset view">' + R.icon('maximize') + '</button>' +
        '</div>' +
        '</div>' +
        '<div class="wb-mathbar" id="wb-mathbar"><span class="muted small" style="margin-right:6px">Math/Science:</span>' +
          MATH_SYMBOLS.map((s) => '<button type="button" class="btn btn-sm btn-ghost wb-math" data-sym="' + R.attr(s) + '">' + esc(s) + '</button>').join('') +
        '</div></div>';

      html += '<div class="card glass wb-canvas-wrap" id="wb-canvas-wrap" style="padding:0;overflow:hidden;position:relative;height:70vh;min-height:420px"><div class="wb-hint muted small">Scroll to zoom · drag in Select/Pan · draw, sketch & annotate together</div></div>';
      html += '<input type="hidden" id="wb-version" value="' + R.attr(String(b.version || 1)) + '">';
      html += '</div>';
      return html;
    }
  };

  // Initialize canvas after view renders (called from app hook) - expose helper
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
    const canEdit = ctx.has('curriculum.create.daycare');

    const engine = newBoardCanvas(wrap, board.state || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } }, () => {
      dirty = true; if (statusEl) statusEl.textContent = 'Editing…';
    });

    function setActiveTool(t) {
      engine.setTool(t);
      document.querySelectorAll('.wb-tool').forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-tool') === t));
    }
    document.querySelectorAll('.wb-tool').forEach((btn) => btn.addEventListener('click', () => setActiveTool(btn.getAttribute('data-tool'))));
    const colorEl = document.getElementById('wb-color'); if (colorEl) colorEl.addEventListener('input', (e) => engine.setColor(e.target.value));
    const widthEl = document.getElementById('wb-width'); if (widthEl) widthEl.addEventListener('change', (e) => engine.setWidth(Number(e.target.value)||3));
    const undoBtn = document.getElementById('wb-undo'); if (undoBtn) undoBtn.addEventListener('click', () => engine.undo());
    const redoBtn = document.getElementById('wb-redo'); if (redoBtn) redoBtn.addEventListener('click', () => engine.redo());
    const delBtn = document.getElementById('wb-del'); if (delBtn) delBtn.addEventListener('click', () => engine.deleteSelected());
    const clearBtn = document.getElementById('wb-clear'); if (clearBtn) clearBtn.addEventListener('click', () => { if (confirm('Clear the entire canvas?')) engine.clear(); });
    const zin = document.getElementById('wb-zin'); if (zin) zin.addEventListener('click', () => engine.zoomIn());
    const zout = document.getElementById('wb-zout'); if (zout) zout.addEventListener('click', () => engine.zoomOut());
    const reset = document.getElementById('wb-reset'); if (reset) reset.addEventListener('click', () => engine.resetView());
    document.querySelectorAll('.wb-math').forEach((btn) => btn.addEventListener('click', () => { setActiveTool('select'); engine.addMathSymbol(btn.getAttribute('data-sym')); }));

    async function save(silent) {
      if (!canEdit || saving) return;
      saving = true; if (statusEl) statusEl.textContent = 'Saving…';
      try {
        const res = await R.api('PUT', '/whiteboards/' + encodeURIComponent(board.id) + '/state', { state: engine.getState(), version });
        if (res && res.conflict && res.latest) {
          // collaborative conflict: adopt latest
          version = res.latest.version || version; if (verEl) verEl.value = String(version);
          engine.setState(res.latest.state || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } });
          if (statusEl) statusEl.textContent = 'Updated from collaborator';
        } else {
          const d = res.data || res;
          version = d.version || (version + 1); if (verEl) verEl.value = String(version);
          if (statusEl) statusEl.textContent = 'Saved';
          dirty = false;
        }
      } catch (e) {
        if (!silent && statusEl) statusEl.textContent = 'Save failed';
      } finally { saving = false; }
    }

    const saveBtn = document.getElementById('wb-save-btn'); if (saveBtn) saveBtn.addEventListener('click', () => save(false));

    // autosave
    const autosave = setInterval(() => { if (dirty) save(true); }, 4000);
    // collaborative polling (fetch latest if others changed)
    const poll = setInterval(async () => {
      if (saving || dirty) return;
      try {
        const res = await R.api('GET', '/whiteboards/' + encodeURIComponent(board.id));
        const d = res.data || res;
        if (d && Number(d.version) > version) {
          version = Number(d.version); if (verEl) verEl.value = String(version);
          engine.setState(d.state || { objects: [], viewport: { x: 0, y: 0, zoom: 1 } });
          if (statusEl) statusEl.textContent = 'Synced with collaborator';
        }
      } catch (_) { /* offline/ignore */ }
    }, 5000);

    // store cleanup on wrap for route change
    wrap._wbCleanup = () => { clearInterval(autosave); clearInterval(poll); engine.destroy(); };
    setActiveTool('pen');
  };

})();
