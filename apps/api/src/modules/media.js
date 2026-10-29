'use strict';

/**
 * Media uploads.
 *
 * The browser asks for a presigned R2 URL, uploads the file directly, then
 * confirms the upload here. Only the resulting URL and descriptive metadata are
 * stored in PostgreSQL; the bytes never pass through the API.
 */

const { validate } = require('../../../../packages/contracts/validate');
const { AppError, fail } = require('../../../../packages/contracts/errors');
const { recordAudit } = require('../services/audit-service');
const { parsePagination } = require('../utils/http');
const storage = require('../services/storage-service');

function register(router) {
  router.get('/media/config', async (ctx) => {
    return {
      configured: storage.isConfigured(),
      scopes: storage.SCOPES,
      maxBytes: Object.fromEntries(Object.entries(storage.MIME_KINDS).map(([mime, meta]) => [mime, meta.maxBytes]))
    };
  }, { permission: 'media.read.daycare' });

  router.get('/media/assets', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const scope = ctx.query.scope || null;
    const ownerType = ctx.query.ownerType || null;
    const ownerId = ctx.query.ownerId || null;
    const rows = await ctx.db.many(
      `SELECT * FROM media_assets
       WHERE organisation_id = $1 AND status <> 'deleted'
         AND ($2::text IS NULL OR scope = $2)
         AND ($3::text IS NULL OR owner_type = $3)
         AND ($4::uuid IS NULL OR owner_id = $4::uuid)
       ORDER BY created_at DESC LIMIT $5 OFFSET $6`,
      [ctx.organisationId, scope, ownerType, ownerId, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    return rows;
  }, { permission: 'media.read.daycare' });

  router.post('/media/uploads', async (ctx) => {
    if (!storage.isConfigured()) {
      fail('CONFLICT', null, 'File storage is not configured. Set the R2_* environment variables.');
    }
    const body = validate(ctx.body, {
      filename: { type: 'string', min: 1, max: 255 },
      contentType: { type: 'string', min: 3, max: 150 },
      size: { type: 'number', min: 1, optional: true },
      scope: { type: 'string', enum: storage.SCOPES, optional: true },
      ownerType: { type: 'string', max: 40, optional: true },
      ownerId: { type: 'string', uuid: true, optional: true }
    });
    const described = storage.describeUpload(body);
    if (!described.valid) {
      fail('VALIDATION', [{ field: 'contentType', message: described.reason }]);
    }
    if (Number.isFinite(Number(body.size)) && Number(body.size) > described.maxBytes) {
      fail('VALIDATION', [{
        field: 'size',
        message: `This file is too large. The limit is ${Math.round(described.maxBytes / (1024 * 1024))} MB.`
      }]);
    }
    const scope = body.scope || 'general';
    const key = storage.buildKey({
      organisationId: ctx.organisationId,
      scope,
      filename: body.filename,
      contentType: described.mime
    });
    const url = storage.publicUrl(key);
    if (!url) fail('CONFLICT', null, 'R2_PUBLIC_BASE_URL is not configured.');
    const upload = storage.presignPut(key, { contentType: described.mime });
    const asset = await ctx.db.one(
      `INSERT INTO media_assets (organisation_id, uploaded_by, scope, owner_type, owner_id, original_filename,
        storage_key, url, mime_type, size_bytes, kind, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending') RETURNING *`,
      [ctx.organisationId, ctx.user.id, scope, body.ownerType || null, body.ownerId || null,
        body.filename, key, url, described.mime, Number.isFinite(Number(body.size)) ? Number(body.size) : null,
        described.kind]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'media.upload_requested', resourceType: 'media_asset', resourceId: asset.id,
      metadata: { scope, kind: described.kind, mimeType: described.mime }
    });
    ctx.status = 201;
    return {
      asset,
      upload: {
        url: upload.url,
        method: upload.method,
        headers: upload.headers,
        expiresAt: upload.expiresAt
      }
    };
  }, { permission: 'media.upload.daycare' });

  router.post('/media/assets/:id/complete', async (ctx) => {
    const asset = await ctx.db.one(
      'SELECT * FROM media_assets WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]
    );
    if (!asset || asset.status === 'deleted') throw new AppError('NOT_FOUND');
    const updated = await ctx.db.one(
      `UPDATE media_assets SET status = 'ready', completed_at = now() WHERE id = $1 RETURNING *`,
      [asset.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'media.upload_completed', resourceType: 'media_asset', resourceId: asset.id,
      metadata: { scope: asset.scope }
    });
    return updated;
  }, { permission: 'media.upload.daycare' });

  router.delete('/media/assets/:id', async (ctx) => {
    const asset = await ctx.db.one(
      'SELECT * FROM media_assets WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]
    );
    if (!asset) throw new AppError('NOT_FOUND');
    await storage.deleteObject(asset.storage_key);
    await ctx.db.query(
      "UPDATE media_assets SET status = 'deleted' WHERE id = $1", [asset.id]
    );
    await recordAudit(ctx.db, ctx, {
      action: 'media.asset_deleted', resourceType: 'media_asset', resourceId: asset.id
    });
    return { success: true };
  }, { permission: 'media.manage.daycare' });
}

module.exports = { register };
