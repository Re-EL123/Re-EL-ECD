'use strict';

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const exportService = require('../services/export-service');
const docs = require('../services/document-service');
const { parsePagination } = require('../utils/http');

function sendPdf(ctx, buffer, filename) {
  ctx.rawResponse = true;
  ctx.res.statusCode = 200;
  ctx.res.setHeader('Content-Type', 'application/pdf');
  ctx.res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  ctx.res.setHeader('Cache-Control', 'no-store');
  ctx.res.end(buffer);
}

function safeSlug(value) {
  const slug = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) fail('VALIDATION', [{ field: 'slug', message: 'Unknown document.' }]);
  return slug;
}

function renderPdf(ctx, doc) {
  const org = ctx.organisation || {};
  const platformOrg = ctx.platformOrganisationId
    ? (ctx.platformOrganisationId === ctx.organisationId ? org : null)
    : null;
  void platformOrg;
  const subtitle = (doc.category === 'legal' ? 'Legal policy' : 'User manual for ' + (doc.role_key || doc.roleKey || 'all roles')) + ' · Re-EL ECD';
  const buffer = exportService.toDocumentPdf({
    title: doc.title,
    subtitle,
    organisationName: org.name || 'Re-EL ECD',
    intro: doc.intro || [],
    sections: doc.sections || [],
    updatedAt: doc.updated_at,
    version: doc.version,
    footer: 'Re-EL ECD · ' + (org.name || 'Platform') + ' · ' + doc.slug + ' v' + (doc.version || 1)
  });
  sendPdf(ctx, buffer, doc.slug + '-v' + (doc.version || 1) + '.pdf');
}

function register(router) {
  router.get('/documents', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const category = ctx.query.category || null;
    const roleKey = ctx.query.roleKey || null;
    const rows = await docs.listDocuments(ctx.db);
    let filtered = rows;
    if (category) filtered = filtered.filter((row) => row.category === category);
    if (roleKey) filtered = filtered.filter((row) => row.role_key === roleKey);
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = filtered.length;
    ctx.meta.totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    return filtered.slice(offset, offset + pageSize);
  }, { authenticated: true });

  router.get('/documents/:slug', async (ctx) => {
    const doc = await docs.getDocument(ctx.db, safeSlug(ctx.params.slug));
    if (!doc) throw new AppError('NOT_FOUND');
    return doc;
  }, { authenticated: true });

  router.get('/documents/:slug/pdf', async (ctx) => {
    const doc = await docs.getDocument(ctx.db, safeSlug(ctx.params.slug));
    if (!doc) throw new AppError('NOT_FOUND');
    renderPdf(ctx, doc);
    return;
  }, { authenticated: true });

  router.get('/public/documents/:slug', async (ctx) => {
    const doc = await docs.getDocument(ctx.db, safeSlug(ctx.params.slug));
    if (!doc || doc.category !== 'legal') throw new AppError('NOT_FOUND');
    return doc;
  }, { public: true });

  router.get('/public/documents/:slug/pdf', async (ctx) => {
    const doc = await docs.getDocument(ctx.db, safeSlug(ctx.params.slug));
    if (!doc || doc.category !== 'legal') throw new AppError('NOT_FOUND');
    renderPdf(ctx, doc);
    return;
  }, { public: true });

  router.patch('/platform/documents/:slug', async (ctx) => {
    const body = validate(ctx.body, {
      title: { type: 'string', min: 3, max: 200, optional: true },
      lede: { type: 'string', max: 500, optional: true },
      intro: { type: 'array', of: 'string', max: 40, optional: true },
      sections: { type: 'array', max: 40, optional: true }
    });
    const slug = safeSlug(ctx.params.slug);
    const existing = await docs.getDocument(ctx.db, slug);
    if (!existing) throw new AppError('NOT_FOUND');
    const merged = {
      title: body.title !== undefined ? body.title : existing.title,
      lede: body.lede !== undefined ? body.lede : existing.lede || '',
      intro: body.intro !== undefined ? body.intro : (existing.intro || []),
      sections: body.sections !== undefined ? body.sections : (existing.sections || [])
    };
    const checked = docs.validateDocument(merged);
    if (checked.error) fail('VALIDATION', [{ field: 'content', message: checked.error }]);
    const updated = await ctx.db.withTransaction(async (client) => {
      const row = (await client.query(
        `UPDATE documents SET title = $1, lede = $2, intro = $3, sections = $4,
           version = version + 1, updated_by = $5, updated_at = now() WHERE slug = $6 RETURNING *`,
        [checked.value.title, checked.value.lede, JSON.stringify(checked.value.intro),
          JSON.stringify(checked.value.sections), ctx.user.id, slug]
      )).rows[0];
      await client.query(
        `INSERT INTO audit_events (actor_user_id, organisation_id, action, resource_type, resource_id, metadata)
         VALUES ($1,$2,'platform.document_updated','document',NULL,$3)`,
        [ctx.user.id, ctx.organisationId || ctx.platformOrganisationId,
          JSON.stringify({ slug, version: row.version, category: row.category, roleKey: row.role_key })]
      );
      return row;
    });
    return updated;
  }, { platformOnly: true, permission: 'platform.settings.manage' });
}

module.exports = { register };
