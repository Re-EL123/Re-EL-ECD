'use strict';

/**
 * Interactive whiteboards: infinite digital canvases for teaching, annotation,
 * math/science sketching and collaborative problem-solving. State is persisted
 * as a JSON document (strokes/shapes/text, viewport). Collaboration is enabled
 * via polling: clients fetch the latest version and save with optimistic
 * concurrency so concurrent edits are not silently lost.
 */

const { validate } = require('../../../../packages/contracts/validate');
const { AppError } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');

const DEFAULT_STATE = { objects: [], viewport: { x: 0, y: 0, zoom: 1 } };

function cleanState(input) {
  const obj = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const objects = Array.isArray(obj.objects) ? obj.objects.slice(0, 5000) : [];
  const vp = obj.viewport && typeof obj.viewport === 'object' ? obj.viewport : {};
  const zoom = Number(vp.zoom);
  return {
    objects,
    viewport: {
      x: Number.isFinite(Number(vp.x)) ? Number(vp.x) : 0,
      y: Number.isFinite(Number(vp.y)) ? Number(vp.y) : 0,
      zoom: Number.isFinite(zoom) ? Math.min(5, Math.max(0.1, zoom)) : 1
    },
    background: typeof obj.background === 'string' ? obj.background.slice(0, 200) : undefined
  };
}

function present(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    lessonPlanId: row.lesson_plan_id,
    classroomId: row.classroom_id,
    classroomName: row.classroom_name || null,
    version: row.version,
    isArchived: row.is_archived,
    state: row.state || DEFAULT_STATE,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function register(router) {
  router.get('/whiteboards', async (ctx) => {
    const includeArchived = ctx.query.archived === 'true';
    const rows = await ctx.db.many(
      `SELECT w.*, u.display_name AS created_by_name, c.name AS classroom_name
       FROM whiteboards w
       LEFT JOIN users u ON u.id = w.created_by
       LEFT JOIN classrooms c ON c.id = w.classroom_id
       WHERE w.organisation_id = $1 AND ($2::boolean OR w.is_archived = false)
       ORDER BY w.updated_at DESC LIMIT 200`,
      [ctx.organisationId, includeArchived]
    );
    // list view: omit heavy state
    return rows.map((r) => {
      const p = present(r);
      const count = Array.isArray((r.state || {}).objects) ? r.state.objects.length : 0;
      return { id: p.id, title: p.title, description: p.description, createdByName: p.createdByName, classroomName: p.classroomName, lessonPlanId: p.lessonPlanId, version: p.version, isArchived: p.isArchived, objectCount: count, createdAt: p.createdAt, updatedAt: p.updatedAt };
    });
  }, { permission: ['curriculum.read.daycare', 'curriculum.create.daycare'], permissionMode: 'any' });

  router.post('/whiteboards', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 1, max: 200 },
      description: { type: 'string', max: 2000, optional: true },
      lessonPlanId: { type: 'string', uuid: true, optional: true },
      classroomId: { type: 'string', uuid: true, optional: true },
      state: { type: 'object', optional: true }
    });
    const state = cleanState(body.state || DEFAULT_STATE);
    const row = await ctx.db.one(
      `INSERT INTO whiteboards (organisation_id, title, description, created_by, lesson_plan_id, classroom_id, state, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,1) RETURNING *`,
      [ctx.organisationId, body.title, body.description || null, ctx.user.id, body.lessonPlanId || null, body.classroomId || null, JSON.stringify(state)]
    );
    await recordAudit(ctx.db, ctx, { action: 'whiteboard.created', resourceType: 'whiteboard', resourceId: row.id });
    ctx.status = 201;
    return present(row);
  }, { permission: 'curriculum.create.daycare' });

  router.get('/whiteboards/:id', async (ctx) => {
    const row = await ctx.db.one(
      `SELECT w.*, u.display_name AS created_by_name, c.name AS classroom_name
       FROM whiteboards w
       LEFT JOIN users u ON u.id = w.created_by
       LEFT JOIN classrooms c ON c.id = w.classroom_id
       WHERE w.id = $1 AND w.organisation_id = $2`,
      [ctx.params.id, ctx.organisationId]
    );
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
    return present(row);
  }, { permission: 'curriculum.create.daycare' });

  // Save canvas state. Requires the client's known version for optimistic
  // concurrency; on mismatch returns 409 with the latest state so the client
  // can merge/refetch (collaborative polling).
  router.put('/whiteboards/:id/state', async (ctx) => {
    const body = validate(ctx.body, {
      state: { type: 'object' },
      version: { type: 'integer', min: 0, optional: true }
    });
    const existing = await ctx.db.one('SELECT * FROM whiteboards WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]);
    if (!existing) throw new AppError('NOT_FOUND');
    if (body.version !== undefined && body.version !== null && Number(body.version) !== Number(existing.version)) {
      ctx.status = 409;
      return { conflict: true, latest: present(existing) };
    }
    const state = cleanState(body.state);
    const row = await ctx.db.one(
      `UPDATE whiteboards SET state = $1::jsonb, version = version + 1, updated_at = now()
       WHERE id = $2 AND organisation_id = $3 RETURNING *`,
      [JSON.stringify(state), ctx.params.id, ctx.organisationId]
    );
    return present(row);
  }, { permission: 'curriculum.create.daycare' });

  router.delete('/whiteboards/:id', async (ctx) => {
    const existing = await ctx.db.one('SELECT id FROM whiteboards WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]);
    if (!existing) throw new AppError('NOT_FOUND');
    await ctx.db.query('DELETE FROM whiteboards WHERE id = $1 AND organisation_id = $2', [ctx.params.id, ctx.organisationId]);
    await recordAudit(ctx.db, ctx, { action: 'whiteboard.deleted', resourceType: 'whiteboard', resourceId: ctx.params.id });
    return { deleted: true };
  }, { permission: 'curriculum.create.daycare' });
}

module.exports = { register };
