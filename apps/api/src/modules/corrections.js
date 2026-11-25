'use strict';

/**
 * Record corrections.
 *
 * Organisations are trusted to keep their own records accurate, but a mistake
 * must never silently rewrite history. A correction stores the previous and
 * proposed values together with a reason, and is applied only after someone
 * with `records.approve.daycare` signs it off. Every stage writes an audit
 * event, including the exact before/after values.
 *
 * The set of correctable fields is an explicit allowlist. Client input never
 * becomes a SQL identifier, so this cannot be used to update arbitrary data.
 */

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { parsePagination } = require('../utils/http');
const { validateSubmission } = require('./forms');

const RESOURCES = {
  learner: {
    table: 'learners', label: 'Learner', updatedAt: true,
    fields: {
      firstName: { column: 'first_name', type: 'string', min: 1, max: 100 },
      lastName: { column: 'last_name', type: 'string', min: 1, max: 100 },
      preferredName: { column: 'preferred_name', type: 'string', max: 100 },
      dateOfBirth: { column: 'date_of_birth', type: 'string', date: true },
      gender: { column: 'gender', type: 'string', max: 20 },
      homeLanguage: { column: 'home_language', type: 'string', max: 60 },
      classroomId: { column: 'classroom_id', type: 'string', uuid: true }
    }
  },
  learner_medical: {
    table: 'learner_medical_records', label: 'Medical record', updatedAt: true,
    fields: {
      recordType: { column: 'record_type', type: 'string', min: 2, max: 60 },
      details: { column: 'details', type: 'string', min: 3, max: 4000 },
      visibilityLevel: { column: 'visibility_level', type: 'string', enum: ['staff', 'medical', 'restricted'] },
      effectiveFrom: { column: 'effective_from', type: 'string', date: true },
      effectiveUntil: { column: 'effective_until', type: 'string', date: true }
    }
  },
  learner_attendance: {
    table: 'learner_attendance', label: 'Attendance record', updatedAt: true,
    fields: {
      attendanceStatus: { column: 'attendance_status', type: 'string', enum: ['present', 'absent', 'late', 'excused', 'collected'] },
      checkInAt: { column: 'check_in_at', type: 'string', datetime: true },
      checkOutAt: { column: 'check_out_at', type: 'string', datetime: true },
      absenceReason: { column: 'absence_reason', type: 'string', max: 1000 }
    }
  },
  form_submission: {
    table: 'form_submissions', label: 'Form submission', updatedAt: false,
    fields: { data: { column: 'submission_data', type: 'object', json: true } }
  },
  daily_report: {
    table: 'daily_reports', label: 'Daily report', updatedAt: false,
    fields: {
      mood: { column: 'mood', type: 'string', max: 40 },
      meals: { column: 'meals', type: 'string', max: 4000 },
      naps: { column: 'naps', type: 'string', max: 4000 },
      toileting: { column: 'toileting', type: 'string', max: 4000 },
      activitiesSummary: { column: 'activities_summary', type: 'string', max: 4000 },
      notes: { column: 'notes', type: 'string', max: 4000 }
    }
  }
};

function definition(type) {
  return RESOURCES[type] || null;
}

async function loadRow(ctx, type, id) {
  const def = definition(type);
  return ctx.db.one(`SELECT * FROM ${def.table} WHERE id = $1 AND organisation_id = $2`, [id, ctx.organisationId]);
}

function project(def, row) {
  const out = {};
  for (const [key, meta] of Object.entries(def.fields)) {
    if (row[meta.column] === undefined) continue;
    out[key] = row[meta.column];
  }
  return out;
}

function decorate(rows) {
  return rows.map((row) => ({
    ...row,
    resourceLabel: definition(row.resource_type) ? definition(row.resource_type).label : row.resource_type,
    changes: typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
  }));
}

function register(router) {
  router.get('/corrections', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const status = ctx.query.status || null;
    const where = 'organisation_id = $1 AND ($2::text IS NULL OR status = $2)';
    const total = await ctx.db.one(`SELECT COUNT(*)::int AS total FROM record_corrections WHERE ${where}`, [ctx.organisationId, status]);
    const rows = await ctx.db.many(
      `SELECT c.*, u1.display_name AS requested_by_name, u2.display_name AS approved_by_name
       FROM record_corrections c
       LEFT JOIN users u1 ON u1.id = c.requested_by
       LEFT JOIN users u2 ON u2.id = c.approved_by
       WHERE c.organisation_id = $1 AND ($2::text IS NULL OR c.status = $2)
       ORDER BY c.created_at DESC LIMIT $3 OFFSET $4`, [ctx.organisationId, status, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    return decorate(rows);
  }, { permission: 'records.correct.daycare' });

  router.get('/corrections/:id', async (ctx) => {
    const row = await ctx.db.one(
      `SELECT c.*, u1.display_name AS requested_by_name, u2.display_name AS approved_by_name
       FROM record_corrections c
       LEFT JOIN users u1 ON u1.id = c.requested_by
       LEFT JOIN users u2 ON u2.id = c.approved_by
       WHERE c.id = $1 AND c.organisation_id = $2`, [ctx.params.id, ctx.organisationId]
    );
    if (!row) throw new AppError('NOT_FOUND');
    return decorate([row])[0];
  }, { permission: 'records.correct.daycare' });

  router.get('/corrections/resources', async (ctx) => {
    return Object.entries(RESOURCES).map(([type, def]) => ({ type, label: def.label }));
  }, { permission: 'records.correct.daycare' });

  function uiField(key, meta) {
    const field = { key, label: key.replace(/([A-Z])/g, ' $1'), type: 'text' };
    if (meta.enum) { field.type = 'select'; field.options = meta.enum; }
    else if (meta.json) field.type = 'json';
    else if (meta.date) field.type = 'date';
    else if (meta.datetime) field.type = 'datetime-local';
    return field;
  }

  router.get('/corrections/resources/:type', async (ctx) => {
    const def = definition(ctx.params.type);
    if (!def) throw new AppError('NOT_FOUND');
    return {
      type: ctx.params.type, label: def.label,
      fields: Object.entries(def.fields).map(([key, meta]) => uiField(key, meta))
    };
  }, { permission: 'records.correct.daycare' });

  router.get('/corrections/resources/:type/:id', async (ctx) => {
    const def = definition(ctx.params.type);
    if (!def) throw new AppError('NOT_FOUND');
    const row = await loadRow(ctx, ctx.params.type, ctx.params.id);
    if (!row) throw new AppError('NOT_FOUND');
    const current = project(def, row);
    return {
      type: ctx.params.type, label: def.label, resourceId: ctx.params.id,
      fields: Object.entries(def.fields).map(([key, meta]) =>
        Object.assign(uiField(key, meta), { value: current[key] === undefined || current[key] === null ? '' : current[key] }))
    };
  }, { permission: 'records.correct.daycare' });

  router.post('/corrections', async (ctx) => {
    const body = validate(ctx.body || {}, {
      resourceType: { type: 'string', enum: Object.keys(RESOURCES) },
      resourceId: { type: 'string', uuid: true },
      reason: { type: 'string', min: 5, max: 1000 },
      changes: { type: 'object' }
    });
    const def = definition(body.resourceType);
    const row = await loadRow(ctx, body.resourceType, body.resourceId);
    if (!row) throw new AppError('NOT_FOUND');

    const keys = Object.keys(body.changes || {});
    if (!keys.length) fail('VALIDATION', [{ field: 'changes', message: 'Include at least one field to correct.' }]);
    const unknown = keys.filter((key) => !def.fields[key]);
    if (unknown.length) fail('VALIDATION', [{ field: 'changes', message: `Field not correctable: ${unknown.join(', ')}` }]);

    const schema = Object.fromEntries(keys.map((key) => [key, def.fields[key]]));
    const proposed = validate(body.changes, schema);
    if (body.resourceType === 'form_submission') {
      const version = await ctx.db.one('SELECT schema_json FROM form_versions WHERE id = $1', [row.form_version_id]);
      proposed.data = validateSubmission((version && version.schema_json) || {}, proposed.data);
    }

    const before = project(def, row);
    const storedChanges = { before, after: proposed };
    const correction = await ctx.db.one(
      `INSERT INTO record_corrections (organisation_id, resource_type, resource_id, reason, changes, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [ctx.organisationId, body.resourceType, body.resourceId, body.reason,
        JSON.stringify(storedChanges), ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'record_correction.requested', resourceType: body.resourceType, resourceId: body.resourceId,
      metadata: { correctionId: correction.id, reason: body.reason, fields: keys }
    });
    ctx.status = 201;
    return decorate([correction])[0];
  }, { permission: 'records.correct.daycare' });

  async function resolve(ctx, decision) {
    const body = validate(ctx.body || {}, {
      notes: { type: 'string', max: 1000, optional: true }
    });
    const correction = await ctx.db.one(
      'SELECT * FROM record_corrections WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]
    );
    if (!correction) throw new AppError('NOT_FOUND');
    if (correction.status !== 'pending') fail('CONFLICT', null, 'This correction has already been resolved.');
    const def = definition(correction.resource_type);
    const changes = typeof correction.changes === 'string' ? JSON.parse(correction.changes) : correction.changes;
    const after = changes.after || {};
    const row = await loadRow(ctx, correction.resource_type, correction.resource_id);
    if (!row) fail('CONFLICT', null, 'The record no longer exists.');

    await ctx.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE record_corrections SET status = $1, approved_by = $2, resolution_notes = $3, resolved_at = now()
         WHERE id = $4`, [decision, ctx.user.id, body.notes || null, correction.id]
      );
      if (decision === 'approved') {
        const sets = [];
        const params = [];
        for (const [key, meta] of Object.entries(def.fields)) {
          if (after[key] === undefined) continue;
          sets.push(`${meta.column} = $${params.length + 1}`);
          params.push(meta.json ? JSON.stringify(after[key]) : (after[key] === '' ? null : after[key]));
        }
        if (def.updatedAt) sets.push('updated_at = now()');
        params.push(row.id, ctx.organisationId);
        await client.query(
          `UPDATE ${def.table} SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND organisation_id = $${params.length}`,
          params
        );
      }
    });
    await recordAudit(ctx.db, ctx, {
      action: `record_correction.${decision}`, resourceType: correction.resource_type,
      resourceId: correction.resource_id,
      metadata: { correctionId: correction.id, reason: correction.reason, fields: Object.keys(after), before: changes.before, after }
    });
    return decorate([await ctx.db.one('SELECT * FROM record_corrections WHERE id = $1', [correction.id])])[0];
  }

  router.post('/corrections/:id/approve', (ctx) => resolve(ctx, 'approved'), { permission: 'records.approve.daycare' });
  router.post('/corrections/:id/reject', (ctx) => resolve(ctx, 'rejected'), { permission: 'records.approve.daycare' });
}

module.exports = { register, RESOURCES };
