'use strict';

/**
 * Interactive whiteboards: infinite digital canvases for teaching, annotation,
 * math/science sketching and collaborative problem-solving. State is persisted
 * as a JSON document (strokes/shapes/text, viewport). Collaboration is enabled
 * via polling: clients fetch the latest version and save with optimistic
 * concurrency so concurrent edits are not silently lost.
 *
 * Canvas saves accept either a full state or a small list of object-level ops.
 * Ops let a teacher's device send only what changed, and let the server apply
 * a strictly validated object model rather than trusting arbitrary JSON.
 */

const { randomUUID } = require('node:crypto');
const { validate } = require('../../../../packages/contracts/validate');
const { AppError } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');

const DEFAULT_STATE = { objects: [], viewport: { x: 0, y: 0, zoom: 1 } };
const MAX_OBJECTS = 5000;
const MAX_SNAPSHOTS = 30;

const TYPES = new Set(['path', 'highlighter', 'line', 'arrow', 'rect', 'circle', 'text', 'math', 'sticky', 'image']);
const HEX = /^#[0-9a-f]{6}$/i;
const FILL_HEX = /^#[0-9a-f]{6}$/i;

function num(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function text(value, max) { return typeof value === 'string' ? value.slice(0, max) : ''; }
function points(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 4000).map((p) => ({
    x: num(p && p.x, 0, -100000, 100000),
    y: num(p && p.y, 0, -100000, 100000)
  }));
}

/** Whitelist every canvas object field. Unknown keys are dropped. */
function cleanObject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const type = String(raw.type || '');
  if (!TYPES.has(type)) return null;
  const base = {
    id: typeof raw.id === 'string' && raw.id.length <= 80 ? raw.id : randomUUID(),
    type,
    color: HEX.test(String(raw.color)) ? String(raw.color) : '#1f3b2a',
    width: num(raw.width, 3, 1, 40),
    hidden: raw.hidden === true,
    locked: raw.locked === true,
    groupId: typeof raw.groupId === 'string' ? raw.groupId.slice(0, 80) : null
  };
  switch (type) {
    case 'path':
    case 'highlighter':
      base.points = points(raw.points);
      if (!base.points.length) return null;
      return base;
    case 'line':
    case 'arrow':
      return Object.assign(base, {
        x1: num(raw.x1, 0, -100000, 100000), y1: num(raw.y1, 0, -100000, 100000),
        x2: num(raw.x2, 0, -100000, 100000), y2: num(raw.y2, 0, -100000, 100000)
      });
    case 'rect':
      return Object.assign(base, {
        x: num(raw.x, 0, -100000, 100000), y: num(raw.y, 0, -100000, 100000),
        w: num(raw.w, 0, -100000, 100000), h: num(raw.h, 0, -100000, 100000)
      });
    case 'circle':
      return Object.assign(base, {
        cx: num(raw.cx, 0, -100000, 100000), cy: num(raw.cy, 0, -100000, 100000),
        rx: num(raw.rx, 0, -100000, 100000), ry: num(raw.ry, 0, -100000, 100000)
      });
    case 'text':
    case 'math':
      return Object.assign(base, {
        x: num(raw.x, 0, -100000, 100000), y: num(raw.y, 0, -100000, 100000),
        size: num(raw.size, type === 'math' ? 28 : 20, 8, 120),
        text: text(raw.text, 2000)
      });
    case 'sticky':
      return Object.assign(base, {
        x: num(raw.x, 0, -100000, 100000), y: num(raw.y, 0, -100000, 100000),
        w: num(raw.w, 180, 40, 800), h: num(raw.h, 140, 40, 800),
        text: text(raw.text, 2000),
        fill: FILL_HEX.test(String(raw.fill)) ? String(raw.fill) : '#FFF4B8',
        font: ['sans', 'serif', 'mono'].includes(raw.font) ? raw.font : 'sans'
      });
    case 'image': {
      if (!/^https?:\/\//i.test(String(raw.src || ''))) return null;
      return Object.assign(base, {
        x: num(raw.x, 0, -100000, 100000), y: num(raw.y, 0, -100000, 100000),
        w: num(raw.w, 240, 20, 2000), h: num(raw.h, 160, 20, 2000),
        src: String(raw.src).slice(0, 1000)
      });
    }
    default:
      return null;
  }
}

function cleanViewport(input) {
  const vp = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    x: num(vp.x, 0, -1000000, 1000000),
    y: num(vp.y, 0, -1000000, 1000000),
    zoom: num(vp.zoom, 1, 0.1, 5)
  };
}

function cleanState(input) {
  const obj = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const objects = Array.isArray(obj.objects)
    ? obj.objects.slice(0, MAX_OBJECTS).map(cleanObject).filter(Boolean)
    : [];
  return { objects, viewport: cleanViewport(obj.viewport) };
}

/** Apply a small set of canvas mutations to the server's current objects. */
function applyOps(objects, ops) {
  let list = Array.isArray(objects) ? objects.slice(0, MAX_OBJECTS) : [];
  if (!Array.isArray(ops)) return list;
  for (const op of ops.slice(0, 2000)) {
    if (!op || typeof op !== 'object') continue;
    if (op.type === 'clear') { list = []; continue; }
    if (op.type === 'delete') { list = list.filter((o) => o.id !== op.id); continue; }
    if (op.type === 'add' || op.type === 'set' || op.type === 'update') {
      const id = String(op.id || (op.object && op.object.id) || '');
      const current = list.find((o) => o.id === id) || {};
      const merged = op.type === 'update' ? Object.assign({}, current, op.patch || {}) : (op.object || {});
      if (!merged.id) merged.id = id || randomUUID();
      const clean = cleanObject(merged);
      if (!clean) continue;
      const at = list.findIndex((o) => o.id === clean.id);
      if (at === -1) list.push(clean);
      else list[at] = clean;
      if (list.length > MAX_OBJECTS) break;
    }
  }
  return list;
}

function present(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    lessonPlanId: row.lesson_plan_id,
    lessonStepId: row.lesson_step_id || null,
    lessonPlanTitle: row.lesson_plan_title || null,
    classroomId: row.classroom_id,
    classroomName: row.classroom_name || null,
    version: row.version,
    isArchived: row.is_archived,
    state: row.state || DEFAULT_STATE,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function findBoard(ctx) {
  return ctx.db.one(
    `SELECT w.*, u.display_name AS created_by_name, c.name AS classroom_name, lp.title AS lesson_plan_title
     FROM whiteboards w
     LEFT JOIN users u ON u.id = w.created_by
     LEFT JOIN classrooms c ON c.id = w.classroom_id
     LEFT JOIN lesson_steps ls ON ls.id = w.lesson_step_id
     LEFT JOIN lesson_plans lp ON lp.id = w.lesson_plan_id
     WHERE w.id = $1 AND w.organisation_id = $2`,
    [ctx.params.id, ctx.organisationId]
  );
}

/** Keep a bounded history so Clear and collaborator syncs are recoverable. */
async function snapshot(ctx, board, label) {
  const objects = Array.isArray((board.state || {}).objects) ? board.state.objects : [];
  await ctx.db.query(
    `INSERT INTO whiteboard_snapshots (whiteboard_id, organisation_id, state, version, label, created_by)
     VALUES ($1,$2,$3::jsonb,$4,$5,$6)`,
    [board.id, ctx.organisationId, JSON.stringify({ objects, viewport: board.state && board.state.viewport ? board.state.viewport : DEFAULT_STATE.viewport }),
      board.version || 1, label ? String(label).slice(0, 120) : null, ctx.user && ctx.user.id]
  );
  await ctx.db.query(
    `DELETE FROM whiteboard_snapshots WHERE whiteboard_id = $1 AND id NOT IN
       (SELECT id FROM whiteboard_snapshots WHERE whiteboard_id = $1 ORDER BY created_at DESC LIMIT $2)`,
    [board.id, MAX_SNAPSHOTS]
  );
}

function register(router) {
  router.get('/whiteboards', async (ctx) => {
    const includeArchived = ctx.query.archived === 'true';
    const rows = await ctx.db.many(
      `SELECT w.*, u.display_name AS created_by_name, c.name AS classroom_name, lp.title AS lesson_plan_title
       FROM whiteboards w
       LEFT JOIN users u ON u.id = w.created_by
       LEFT JOIN classrooms c ON c.id = w.classroom_id
       LEFT JOIN lesson_steps ls ON ls.id = w.lesson_step_id
       LEFT JOIN lesson_plans lp ON lp.id = w.lesson_plan_id
       WHERE w.organisation_id = $1 AND ($2::boolean OR w.is_archived = false)
       ORDER BY w.updated_at DESC LIMIT 200`,
      [ctx.organisationId, includeArchived]
    );
    // list view: omit heavy state
    return rows.map((r) => {
      const p = present(r);
      const count = Array.isArray((r.state || {}).objects) ? r.state.objects.length : 0;
      return { id: p.id, title: p.title, description: p.description, createdByName: p.createdByName, classroomName: p.classroomName, lessonPlanId: p.lessonPlanId, lessonStepId: p.lessonStepId, lessonPlanTitle: p.lessonPlanTitle, version: p.version, isArchived: p.isArchived, objectCount: count, createdAt: p.createdAt, updatedAt: p.updatedAt };
    });
  }, { permission: ['curriculum.read.daycare', 'curriculum.create.daycare'], permissionMode: 'any' });

  router.post('/whiteboards', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 1, max: 200 },
      description: { type: 'string', max: 2000, optional: true },
      lessonPlanId: { type: 'string', uuid: true, optional: true },
      lessonStepId: { type: 'string', uuid: true, optional: true },
      classroomId: { type: 'string', uuid: true, optional: true },
      state: { type: 'object', optional: true }
    });
    if (body.lessonPlanId) {
      const plan = await ctx.db.one('SELECT id FROM lesson_plans WHERE id = $1 AND (organisation_id = $2 OR organisation_id IS NULL)', [body.lessonPlanId, ctx.organisationId]).catch(() => null);
      if (!plan) throw new AppError('NOT_FOUND');
    }
    if (body.lessonStepId) {
      const step = await ctx.db.one('SELECT id, lesson_plan_id FROM lesson_steps WHERE id = $1 AND (organisation_id = $2 OR organisation_id IS NULL)', [body.lessonStepId, ctx.organisationId]).catch(() => null);
      if (!step) throw new AppError('NOT_FOUND');
      if (body.lessonPlanId && step.lesson_plan_id !== body.lessonPlanId) throw new AppError('VALIDATION', [{ field: 'lessonStepId', message: 'This step does not belong to the selected plan.' }]);
      if (!body.lessonPlanId) body.lessonPlanId = step.lesson_plan_id;
    }
    const state = cleanState(body.state || DEFAULT_STATE);
    const row = await ctx.db.one(
      `INSERT INTO whiteboards (organisation_id, title, description, created_by, lesson_plan_id, lesson_step_id, classroom_id, state, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,1) RETURNING *`,
      [ctx.organisationId, body.title, body.description || null, ctx.user.id, body.lessonPlanId || null, body.lessonStepId || null, body.classroomId || null, JSON.stringify(state)]
    );
    await recordAudit(ctx.db, ctx, { action: 'whiteboard.created', resourceType: 'whiteboard', resourceId: row.id });
    ctx.status = 201;
    return present(row);
  }, { permission: 'curriculum.create.daycare' });

  router.get('/whiteboards/:id', async (ctx) => {
    const row = await findBoard(ctx);
    if (!row) throw new AppError('NOT_FOUND');
    return present(row);
  }, { permission: ['curriculum.read.daycare', 'curriculum.create.daycare'], permissionMode: 'any' });

  router.patch('/whiteboards/:id', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 1, max: 200, optional: true },
      description: { type: 'string', max: 2000, optional: true },
      isArchived: { type: 'boolean', optional: true }
    });
    const existing = await ctx.db.one('SELECT * FROM whiteboards WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]);
    if (!existing) throw new AppError('NOT_FOUND');
    const row = await ctx.db.one(
      `UPDATE whiteboards SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         is_archived = COALESCE($3, is_archived),
         updated_at = now()
       WHERE id = $4 AND organisation_id = $5 RETURNING *`,
      [body.title || null, body.description !== undefined ? body.description : null, body.isArchived === undefined ? null : body.isArchived, ctx.params.id, ctx.organisationId]
    );
    await recordAudit(ctx.db, ctx, {
      action: body.isArchived !== undefined ? (body.isArchived ? 'whiteboard.archived' : 'whiteboard.restored') : 'whiteboard.updated',
      resourceType: 'whiteboard', resourceId: ctx.params.id
    });
    return present(row);
  }, { permission: 'curriculum.create.daycare' });

  // Save canvas state. Accepts either a whole state or a small op list, and
  // returns 409 with the latest board on a version conflict.
  router.put('/whiteboards/:id/state', async (ctx) => {
    const body = validate(ctx.body, {
      state: { type: 'object', optional: true },
      ops: { type: 'array', max: 2000, optional: true },
      viewport: { type: 'object', optional: true },
      version: { type: 'integer', min: 0, optional: true },
      label: { type: 'string', max: 120, optional: true }
    });
    const existing = await findBoard(ctx);
    if (!existing) throw new AppError('NOT_FOUND');
    if (body.version !== undefined && body.version !== null && Number(body.version) !== Number(existing.version)) {
      ctx.status = 409;
      return { conflict: true, latest: present(existing) };
    }
    const objects = Array.isArray(body.ops)
      ? applyOps((existing.state || {}).objects, body.ops)
      : cleanState(body.state || DEFAULT_STATE).objects;
    const viewport = body.viewport
      ? cleanViewport(body.viewport)
      : (body.state && body.state.viewport ? cleanViewport(body.state.viewport) : cleanViewport((existing.state || {}).viewport));
    const state = { objects, viewport };
    const incoming = JSON.stringify(state);
    const previous = JSON.stringify({ objects: (existing.state || {}).objects || [], viewport: (existing.state || {}).viewport || DEFAULT_STATE.viewport });
    if (incoming !== previous) await snapshot(ctx, existing, body.label || null);
    const row = await ctx.db.one(
      `UPDATE whiteboards SET state = $1::jsonb, version = version + 1, updated_at = now()
       WHERE id = $2 AND organisation_id = $3 RETURNING *`,
      [incoming, ctx.params.id, ctx.organisationId]
    );
    await recordAudit(ctx.db, ctx, {
      action: Array.isArray(body.ops) ? 'whiteboard.ops_saved' : 'whiteboard.state_saved',
      resourceType: 'whiteboard', resourceId: ctx.params.id
    });
    return { id: row.id, version: row.version, state: row.state, objectCount: objects.length, updatedAt: row.updated_at };
  }, { permission: 'curriculum.create.daycare' });

  router.get('/whiteboards/:id/snapshots', async (ctx) => {
    const board = await ctx.db.one('SELECT id FROM whiteboards WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]);
    if (!board) throw new AppError('NOT_FOUND');
    const rows = await ctx.db.many(
      `SELECT s.id, s.version, s.label, s.created_at, u.display_name AS created_by_name,
              jsonb_array_length(s.state->'objects') AS object_count
       FROM whiteboard_snapshots s LEFT JOIN users u ON u.id = s.created_by
       WHERE s.whiteboard_id = $1 AND s.organisation_id = $2 ORDER BY s.created_at DESC LIMIT $3`,
      [ctx.params.id, ctx.organisationId, MAX_SNAPSHOTS]
    );
    return rows.map((r) => ({ id: r.id, version: r.version, label: r.label, createdAt: r.created_at, createdByName: r.created_by_name, objectCount: Number(r.object_count) || 0 }));
  }, { permission: ['curriculum.read.daycare', 'curriculum.create.daycare'], permissionMode: 'any' });

  router.post('/whiteboards/:id/snapshots', async (ctx) => {
    const body = validate(ctx.body, { label: { type: 'string', max: 120, optional: true } });
    const board = await findBoard(ctx);
    if (!board) throw new AppError('NOT_FOUND');
    await snapshot(ctx, board, body.label || 'Manual save');
    await recordAudit(ctx.db, ctx, { action: 'whiteboard.snapshot_created', resourceType: 'whiteboard', resourceId: ctx.params.id });
    ctx.status = 201;
    return { saved: true };
  }, { permission: 'curriculum.create.daycare' });

  router.post('/whiteboards/:id/snapshots/:sid/restore', async (ctx) => {
    const board = await ctx.db.one('SELECT * FROM whiteboards WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]);
    if (!board) throw new AppError('NOT_FOUND');
    const snap = await ctx.db.one('SELECT * FROM whiteboard_snapshots WHERE id = $1 AND whiteboard_id = $2 AND organisation_id = $3', [ctx.params.sid, ctx.params.id, ctx.organisationId]);
    if (!snap) throw new AppError('NOT_FOUND');
    await snapshot(ctx, board, 'Before restore');
    const state = cleanState(snap.state);
    const row = await ctx.db.one(
      `UPDATE whiteboards SET state = $1::jsonb, version = version + 1, updated_at = now()
       WHERE id = $2 AND organisation_id = $3 RETURNING *`,
      [JSON.stringify(state), ctx.params.id, ctx.organisationId]
    );
    await recordAudit(ctx.db, ctx, { action: 'whiteboard.restored', resourceType: 'whiteboard', resourceId: ctx.params.id, metadata: { snapshotId: ctx.params.sid } });
    return present(row);
  }, { permission: 'curriculum.create.daycare' });

  router.post('/whiteboards/:id/presence', async (ctx) => {
    const body = validate(ctx.body, {
      cursorX: { type: 'number', optional: true },
      cursorY: { type: 'number', optional: true },
      colour: { type: 'string', max: 20, optional: true }
    });
    const board = await ctx.db.one('SELECT id FROM whiteboards WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]);
    if (!board) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      `INSERT INTO whiteboard_presence (organisation_id, whiteboard_id, user_id, cursor_x, cursor_y, colour, seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT (whiteboard_id, user_id) DO UPDATE SET
         cursor_x = EXCLUDED.cursor_x, cursor_y = EXCLUDED.cursor_y,
         colour = EXCLUDED.colour, seen_at = now()`,
      [ctx.organisationId, board.id, ctx.user.id, body.cursorX || 0, body.cursorY || 0, HEX.test(String(body.colour || '')) ? body.colour : '#3D8FAE']
    );
    return { ok: true };
  }, { permission: ['curriculum.read.daycare', 'curriculum.create.daycare'], permissionMode: 'any' });

  router.get('/whiteboards/:id/presence', async (ctx) => {
    const board = await ctx.db.one('SELECT id FROM whiteboards WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]);
    if (!board) throw new AppError('NOT_FOUND');
    const rows = await ctx.db.many(
      `SELECT u.id AS user_id, u.display_name, p.cursor_x, p.cursor_y, p.colour, p.seen_at
       FROM whiteboard_presence p JOIN users u ON u.id = p.user_id
       WHERE p.whiteboard_id = $1 AND p.organisation_id = $2
         AND p.seen_at > now() - interval '45 seconds' AND p.user_id <> $3
       ORDER BY p.seen_at DESC LIMIT 20`,
      [board.id, ctx.organisationId, ctx.user.id]
    );
    return rows.map((r) => ({
      userId: r.user_id, name: r.display_name || 'Teacher',
      x: Number(r.cursor_x) || 0, y: Number(r.cursor_y) || 0,
      colour: r.colour, seenAt: r.seen_at
    }));
  }, { permission: ['curriculum.read.daycare', 'curriculum.create.daycare'], permissionMode: 'any' });

  router.delete('/whiteboards/:id', async (ctx) => {
    const existing = await ctx.db.one('SELECT id FROM whiteboards WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]);
    if (!existing) throw new AppError('NOT_FOUND');
    await ctx.db.query('DELETE FROM whiteboards WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]);
    await recordAudit(ctx.db, ctx, { action: 'whiteboard.deleted', resourceType: 'whiteboard', resourceId: ctx.params.id });
    return { deleted: true };
  }, { permission: 'curriculum.create.daycare' });
}

module.exports = { register, cleanObject, cleanState, applyOps };
