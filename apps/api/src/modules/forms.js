'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { createNotification, notifyRole } = require('../services/notification-service');
const { sendTemplate } = require('../services/email-service');
const { rateLimit } = require('../middleware/rate-limit');
const { parsePagination } = require('../utils/http');
const { has, guardianLearnerIds, getLearner } = require('./helpers');

const FIELD_TYPES = ['text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'checkbox', 'radio', 'file', 'signature'];

function normaliseFields(fields) {
  if (!Array.isArray(fields)) return [];
  const seen = new Set();
  return fields.map((field, index) => {
    if (!field || typeof field !== 'object') fail('VALIDATION', [{ field: 'schema', message: 'Each field must be an object.' }]);
    const key = String(field.key || `field_${index + 1}`).trim();
    if (!/^[a-z0-9_]+$/i.test(key)) fail('VALIDATION', [{ field: 'schema', message: `Invalid field key: ${key}` }]);
    if (seen.has(key)) fail('VALIDATION', [{ field: 'schema', message: `Duplicate field key: ${key}` }]);
    seen.add(key);
    const label = String(field.label || '').trim();
    if (!label) fail('VALIDATION', [{ field: 'schema', message: `Field ${key} requires a label.` }]);
    const type = FIELD_TYPES.includes(field.type) ? field.type : 'text';
    return {
      key, label, type,
      required: field.required === true,
      helpText: field.helpText ? String(field.helpText).slice(0, 500) : null,
      options: Array.isArray(field.options) ? field.options.map((o) => String(o).slice(0, 200)).slice(0, 50) : []
    };
  });
}

function validateSubmission(schema, data) {
  const errors = [];
  const clean = {};
  const fields = (schema && schema.fields) || [];
  for (const field of fields) {
    const value = data[field.key];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (field.required) errors.push({ field: field.key, message: `${field.label} is required.` });
      continue;
    }
    if (field.type === 'checkbox' && typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
      errors.push({ field: field.key, message: `${field.label} must be true or false.` });
      continue;
    }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
      errors.push({ field: field.key, message: `${field.label} must be a valid email address.` });
      continue;
    }
    if (field.type === 'date' && Number.isNaN(Date.parse(value))) {
      errors.push({ field: field.key, message: `${field.label} must be a valid date.` });
      continue;
    }
    if (field.type === 'number' && !Number.isFinite(Number(value))) {
      errors.push({ field: field.key, message: `${field.label} must be a number.` });
      continue;
    }
    if (field.options && field.options.length && ['select', 'radio'].includes(field.type) && !field.options.includes(String(value))) {
      errors.push({ field: field.key, message: `${field.label} contains an invalid option.` });
      continue;
    }
    if (typeof value === 'string' && value.length > 5000) {
      errors.push({ field: field.key, message: `${field.label} is too long.` });
      continue;
    }
    clean[field.key] = value;
  }
  if (errors.length) throw new AppError('VALIDATION', errors);
  return clean;
}

async function submissionFor(ctx, formId, versionId, data, extra) {
  const submission = await ctx.db.one(
    `INSERT INTO form_submissions (organisation_id, form_definition_id, form_version_id, submitted_by_user_id,
      related_learner_id, submission_data, status, submitter_email)
     VALUES ($1,$2,$3,$4,$5,$6,'received',$7) RETURNING *`,
    [extra.organisationId, formId, versionId, extra.userId || null, extra.learnerId || null,
      JSON.stringify(data), extra.email || null]
  );
  return submission;
}

function register(router) {
  router.get('/forms', async (ctx) => {
    const forms = await ctx.db.many(
      `SELECT f.*, v.version_number, v.schema_json,
        (SELECT COUNT(*)::int FROM form_submissions s WHERE s.form_definition_id = f.id) AS submission_count,
        (SELECT COUNT(*)::int FROM form_submissions s WHERE s.form_definition_id = f.id AND s.status = 'received') AS pending_count
       FROM form_definitions f
       LEFT JOIN form_versions v ON v.id = f.current_version_id
       WHERE f.organisation_id = $1 AND f.status <> 'archived'
       ORDER BY f.name`, [ctx.organisationId]
    );
    return forms;
  }, { permission: ['forms.read.daycare', 'forms.submissions.review.daycare'], permissionMode: 'any' });

  router.post('/forms', async (ctx) => {
    const body = validate(ctx.body, {
      name: { type: 'string', min: 2, max: 200 },
      slug: { type: 'string', min: 2, max: 120, regex: /^[a-z0-9-]+$/ },
      formType: { type: 'string', max: 40, optional: true },
      description: { type: 'string', max: 2000, optional: true },
      isPublic: { type: 'boolean', optional: true },
      fields: { type: 'array', max: 60, optional: true }
    });
    const existing = await ctx.db.one('SELECT id FROM form_definitions WHERE organisation_id = $1 AND slug = $2',
      [ctx.organisationId, body.slug]);
    if (existing) fail('CONFLICT', null, 'A form with that slug already exists.');
    const fields = normaliseFields(body.fields || []);
    const result = await ctx.db.withTransaction(async (client) => {
      const form = (await client.query(
        `INSERT INTO form_definitions (organisation_id, name, slug, form_type, description, is_public, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [ctx.organisationId, body.name, body.slug, body.formType || 'general', body.description || null,
          body.isPublic === true, ctx.user.id]
      )).rows[0];
      const version = (await client.query(
        `INSERT INTO form_versions (form_definition_id, version_number, schema_json)
         VALUES ($1,1,$2) RETURNING *`,
        [form.id, JSON.stringify({ fields })]
      )).rows[0];
      await client.query('UPDATE form_definitions SET current_version_id = $1 WHERE id = $2', [version.id, form.id]);
      return { form, version };
    });
    await recordAudit(ctx.db, ctx, {
      action: 'form.created', resourceType: 'form_definition', resourceId: result.form.id
    });
    ctx.status = 201;
    return { ...result.form, current_version_id: result.version.id, version_number: 1, schema_json: result.version.schema_json };
  }, { permission: 'forms.manage.daycare' });

  router.get('/forms/:id', async (ctx) => {
    const form = await ctx.db.one('SELECT * FROM form_definitions WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!form) throw new AppError('NOT_FOUND');
    const versions = await ctx.db.many(
      'SELECT * FROM form_versions WHERE form_definition_id = $1 ORDER BY version_number DESC', [form.id]
    );
    const current = versions.find((v) => v.id === form.current_version_id) || versions[0] || null;
    return { ...form, versions, current };
  }, { permission: ['forms.read.daycare', 'forms.manage.daycare'], permissionMode: 'any' });

  router.post('/forms/:id/versions', async (ctx) => {
    const body = validate(ctx.body, { fields: { type: 'array', max: 60 } });
    const form = await ctx.db.one('SELECT * FROM form_definitions WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!form) throw new AppError('NOT_FOUND');
    const fields = normaliseFields(body.fields);
    const latest = await ctx.db.one(
      'SELECT MAX(version_number)::int AS version FROM form_versions WHERE form_definition_id = $1', [form.id]
    );
    const version = await ctx.db.one(
      `INSERT INTO form_versions (form_definition_id, version_number, schema_json)
       VALUES ($1,$2,$3) RETURNING *`,
      [form.id, (latest.version || 0) + 1, JSON.stringify({ fields })]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'form.version_created', resourceType: 'form_definition', resourceId: form.id,
      metadata: { version: version.version_number }
    });
    ctx.status = 201;
    return version;
  }, { permission: 'forms.manage.daycare' });

  router.post('/forms/:id/publish', async (ctx) => {
    const body = validate(ctx.body, {
      versionId: { type: 'string', uuid: true, optional: true },
      isPublic: { type: 'boolean', optional: true }
    });
    const form = await ctx.db.one('SELECT * FROM form_definitions WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!form) throw new AppError('NOT_FOUND');
    let versionId = body.versionId || form.current_version_id;
    if (!versionId) {
      const latest = await ctx.db.one(
        'SELECT id FROM form_versions WHERE form_definition_id = $1 ORDER BY version_number DESC LIMIT 1', [form.id]
      );
      if (!latest) fail('CONFLICT', null, 'Create a form version before publishing.');
      versionId = latest.id;
    }
    await ctx.db.withTransaction(async (client) => {
      await client.query(
        'UPDATE form_versions SET published_at = now(), published_by = $1 WHERE id = $2', [ctx.user.id, versionId]
      );
      await client.query(
        "UPDATE form_definitions SET status = 'published', current_version_id = $1, is_public = COALESCE($2,is_public) WHERE id = $3",
        [versionId, body.isPublic === undefined ? null : body.isPublic, form.id]
      );
    });
    await recordAudit(ctx.db, ctx, {
      action: 'form.published', resourceType: 'form_definition', resourceId: form.id, metadata: { versionId }
    });
    return ctx.db.one('SELECT * FROM form_definitions WHERE id = $1', [form.id]);
  }, { permission: 'forms.manage.daycare' });

  router.post('/forms/:id/archive', async (ctx) => {
    const form = await ctx.db.one('SELECT * FROM form_definitions WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!form) throw new AppError('NOT_FOUND');
    await ctx.db.query("UPDATE form_definitions SET status = 'archived' WHERE id = $1", [form.id]);
    await recordAudit(ctx.db, ctx, { action: 'form.archived', resourceType: 'form_definition', resourceId: form.id });
    return { success: true };
  }, { permission: 'forms.manage.daycare' });

  router.get('/forms/:id/submissions', async (ctx) => {
    const form = await ctx.db.one('SELECT * FROM form_definitions WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!form) throw new AppError('NOT_FOUND');
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const status = ctx.query.status || null;
    const total = await ctx.db.one(
      `SELECT COUNT(*)::int AS total FROM form_submissions
       WHERE form_definition_id = $1 AND ($2::text IS NULL OR status = $2)`, [form.id, status]
    );
    const rows = await ctx.db.many(
      `SELECT s.*, l.first_name, l.last_name FROM form_submissions s
       LEFT JOIN learners l ON l.id = s.related_learner_id
       WHERE s.form_definition_id = $1 AND ($2::text IS NULL OR s.status = $2)
       ORDER BY s.submitted_at DESC LIMIT $3 OFFSET $4`, [form.id, status, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    return rows;
  }, { permission: 'forms.submissions.review.daycare' });

  router.post('/forms/:id/submit', async (ctx) => {
    const body = validate(ctx.body, {
      data: { type: 'object' },
      learnerId: { type: 'string', uuid: true, optional: true }
    });
    const form = await ctx.db.one(
      "SELECT * FROM form_definitions WHERE id = $1 AND organisation_id = $2 AND status = 'published'",
      [ctx.params.id, ctx.organisationId]
    );
    if (!form) throw new AppError('NOT_FOUND');
    const version = await ctx.db.one('SELECT * FROM form_versions WHERE id = $1', [form.current_version_id]);
    if (!version) fail('CONFLICT', null, 'This form has no published version.');
    let learnerId = body.learnerId || null;
    if (learnerId) {
      const allowed = await guardianLearnerIds(ctx, learnerId);
      if (allowed.length) await getLearner(ctx, learnerId, { parent: true });
      else await getLearner(ctx, learnerId);
    }
    const clean = validateSubmission(version.schema_json, body.data);
    const submission = await submissionFor(ctx, form.id, version.id, clean, {
      organisationId: ctx.organisationId, userId: ctx.user.id, learnerId, email: ctx.user.email
    });
    await recordAudit(ctx.db, ctx, {
      action: 'form.submitted', resourceType: 'form_submission', resourceId: submission.id,
      metadata: { formId: form.id, learnerId }
    });
    ctx.status = 201;
    return submission;
  }, { permission: ['parent.forms.submit.own', 'forms.read.daycare', 'guardians.manage.daycare'], permissionMode: 'any' });

  router.post('/forms/submissions/:id/review', async (ctx) => {
    const body = validate(ctx.body, {
      decision: { type: 'string', enum: ['under_review', 'approved', 'rejected', 'archived'] },
      notes: { type: 'string', max: 2000, optional: true }
    });
    const submission = await ctx.db.one('SELECT * FROM form_submissions WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!submission) throw new AppError('NOT_FOUND');
    await ctx.db.query(
      `UPDATE form_submissions SET status = $1, reviewed_by = $2, reviewed_at = now(), review_notes = $3 WHERE id = $4`,
      [body.decision, ctx.user.id, body.notes || null, submission.id]
    );
    if (submission.submitted_by_user_id) {
      await createNotification(ctx.db, ctx, {
        recipientUserIds: [submission.submitted_by_user_id], type: 'form_reviewed',
        title: `Form submission ${body.decision.replace('_', ' ')}`,
        body: body.notes || 'A form submission you sent has been reviewed.',
        resourceType: 'form_submission', resourceId: submission.id
      });
    }
    await recordAudit(ctx.db, ctx, {
      action: `form.submission_${body.decision}`, resourceType: 'form_submission', resourceId: submission.id
    });
    return ctx.db.one('SELECT * FROM form_submissions WHERE id = $1', [submission.id]);
  }, { permission: 'forms.submissions.review.daycare' });

  // --- Public forms -------------------------------------------------------

  router.get('/public/forms/:orgSlug/:formSlug', async (ctx) => {
    const org = await ctx.db.one("SELECT id, name, slug FROM organisations WHERE slug = $1 AND status = 'active'", [ctx.params.orgSlug]);
    if (!org) throw new AppError('NOT_FOUND');
    const form = await ctx.db.one(
      `SELECT f.id, f.name, f.description, f.form_type, v.schema_json FROM form_definitions f
       JOIN form_versions v ON v.id = f.current_version_id
       WHERE f.organisation_id = $1 AND f.slug = $2 AND f.status = 'published' AND f.is_public = true`,
      [org.id, ctx.params.formSlug]
    );
    if (!form) throw new AppError('NOT_FOUND');
    return { organisation: org, form };
  }, { public: true });

  router.post('/public/forms/:orgSlug/:formSlug/submit', async (ctx) => {
    const limit = rateLimit(`public-form:${ctx.ip}`, 10, 10 * 60 * 1000);
    if (!limit.allowed) throw new AppError('RATE_LIMITED');
    const org = await ctx.db.one("SELECT id, name FROM organisations WHERE slug = $1 AND status = 'active'", [ctx.params.orgSlug]);
    if (!org) throw new AppError('NOT_FOUND');
    const form = await ctx.db.one(
      `SELECT f.*, v.schema_json, v.id AS version_id FROM form_definitions f
       JOIN form_versions v ON v.id = f.current_version_id
       WHERE f.organisation_id = $1 AND f.slug = $2 AND f.status = 'published' AND f.is_public = true`,
      [org.id, ctx.params.formSlug]
    );
    if (!form) throw new AppError('NOT_FOUND');
    const body = validate(ctx.body, {
      data: { type: 'object' },
      email: { type: 'string', email: true, optional: true },
      website: { type: 'string', max: 200, optional: true }
    });
    const spam = Boolean(body.website && body.website.trim());
    const clean = validateSubmission(form.schema_json, body.data);
    const submission = await submissionFor(ctx, form.id, form.version_id, clean, {
      organisationId: org.id, email: body.email || null
    });
    if (spam) {
      await ctx.db.query("UPDATE form_submissions SET status = 'archived' WHERE id = $1", [submission.id]);
      return { received: true, submissionId: null };
    }
    await recordAudit(ctx.db, ctx, {
      action: 'form.public_submission', resourceType: 'form_submission', resourceId: submission.id,
      organisationId: org.id
    });
    await notifyRole(ctx.db, ctx, ['principal', 'daycare_administrator', 'admissions_officer'], {
      organisationId: org.id, type: 'form_submission', title: 'New form submission',
      body: `${form.name} was submitted through the public website.`,
      resourceType: 'form_submission', resourceId: submission.id
    });
    const reviewers = await ctx.db.many(
      `SELECT DISTINCT u.email FROM memberships m
       JOIN users u ON u.id = m.user_id
       JOIN membership_roles mr ON mr.membership_id = m.id
       JOIN roles r ON r.id = mr.role_id
       WHERE m.organisation_id = $1 AND m.status = 'active'
         AND r.role_key IN ('principal','daycare_administrator','admissions_officer')`,
      [org.id]
    );
    for (const reviewer of reviewers) {
      await sendTemplate(ctx.db, 'formSubmission', {
        to: reviewer.email,
        organisationId: org.id,
        metadata: { submissionId: submission.id, formId: form.id },
        data: { formName: form.name, submittedBy: body.email || 'A website visitor' }
      });
    }
    return { received: true, submissionId: submission.id };
  }, { public: true });

  // --- Consent ------------------------------------------------------------

  router.get('/consent', async (ctx) => {
    const learnerId = ctx.query.learnerId || null;
    const status = ctx.query.status || null;
    return ctx.db.many(
      `SELECT c.*, l.first_name, l.last_name, g.first_name || ' ' || g.last_name AS guardian_name
       FROM consent_records c
       LEFT JOIN learners l ON l.id = c.learner_id
       LEFT JOIN guardians g ON g.id = c.guardian_id
       WHERE c.organisation_id = $1 AND ($2::uuid IS NULL OR c.learner_id = $2::uuid)
         AND ($3::text IS NULL OR c.status = $3)
       ORDER BY c.created_at DESC`, [ctx.organisationId, learnerId, status]
    );
  }, { permission: 'consent.read.daycare' });

  router.post('/consent', async (ctx) => {
    const body = validate(ctx.body, {
      learnerId: { type: 'string', uuid: true, optional: true },
      guardianId: { type: 'string', uuid: true, optional: true },
      consentType: { type: 'string', min: 2, max: 80 },
      purpose: { type: 'string', min: 5, max: 2000 },
      formVersionId: { type: 'string', uuid: true, optional: true },
      status: { type: 'string', enum: ['granted', 'withdrawn', 'pending'], optional: true }
    });
    if (body.learnerId) await getLearner(ctx, body.learnerId);
    if (body.guardianId) {
      const guardian = await ctx.db.one('SELECT id FROM guardians WHERE id = $1 AND organisation_id = $2',
        [body.guardianId, ctx.organisationId]);
      if (!guardian) fail('VALIDATION', [{ field: 'guardianId', message: 'Unknown guardian.' }]);
    }
    const status = body.status || 'pending';
    const record = await ctx.db.one(
      `INSERT INTO consent_records (organisation_id, learner_id, guardian_id, consent_type, purpose, form_version_id,
        status, granted_at, withdrawn_at, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [ctx.organisationId, body.learnerId || null, body.guardianId || null, body.consentType, body.purpose,
        body.formVersionId || null, status, status === 'granted' ? new Date().toISOString() : null,
        status === 'withdrawn' ? new Date().toISOString() : null, ctx.user.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: `consent.${status}`, resourceType: 'consent_record', resourceId: record.id,
      metadata: { consentType: body.consentType }
    });
    ctx.status = 201;
    return record;
  }, { permission: 'consent.manage.daycare' });

  router.post('/consent/:id/withdraw', async (ctx) => {
    const body = validate(ctx.body, { reason: { type: 'string', max: 1000, optional: true } });
    const record = await ctx.db.one('SELECT * FROM consent_records WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!record) throw new AppError('NOT_FOUND');
    if (record.status === 'withdrawn') fail('CONFLICT', null, 'This consent has already been withdrawn.');
    await ctx.db.query(
      "UPDATE consent_records SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1", [record.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'consent.withdrawn', resourceType: 'consent_record', resourceId: record.id,
      metadata: { reason: body.reason || null }
    });
    return ctx.db.one('SELECT * FROM consent_records WHERE id = $1', [record.id]);
  }, { permission: ['consent.manage.daycare', 'parent.forms.submit.own'], permissionMode: 'any' });
}

module.exports = { register };
