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
const { hasPermission } = require('../../../../packages/auth/permissions');
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
       WHERE organisation_id = $1 AND status = 'ready'
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
    // Fail before handing the browser a URL that R2 will reject with a 401
    // and no CORS headers. That combination looks like a CORS bug and sends
    // everyone hunting the bucket policy instead of the access key.
    const credentialProblem = storage.credentialProblem();
    if (credentialProblem) {
      fail('CONFLICT', null, credentialProblem.message + ' ' + credentialProblem.fix);
    }
    const body = validate(ctx.body, {
      filename: { type: 'string', min: 1, max: 255 },
      contentType: { type: 'string', min: 3, max: 150 },
      size: { type: 'number', min: 1, optional: true },
      scope: { type: 'string', enum: storage.SCOPES, optional: true },
      ownerType: { type: 'string', max: 40, optional: true },
      ownerId: { type: 'string', uuid: true, optional: true },
      shared: { type: 'boolean', optional: true }
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
    // Only nursery-rhyme recordings may be published across tenants, and only
    // by someone who can manage organisation settings.
    const mayShare = body.shared === true && ['nursery-rhyme', 'book'].includes(scope) &&
      hasPermission(ctx.access && ctx.access.permissions, 'organisation.settings.manage');
    if (body.shared === true && !mayShare) {
      fail('VALIDATION', [{ field: 'shared', message: 'Only administrators can share nursery-rhyme audio with every centre.' }]);
    }
    const key = storage.buildKey({
      organisationId: ctx.organisationId,
      scope,
      filename: body.filename,
      contentType: described.mime,
      shared: mayShare
    });
    // Clients load media through the authenticated proxy — the bucket never
    // needs a public base URL and children's photos are not publicly reachable.
    const url = storage.proxyPath(key);
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
      metadata: { scope, kind: described.kind, mimeType: described.mime, shared: mayShare }
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

  // Authenticated media proxy: membership of the owning organisation is the
  // authorisation. Redirects to a short-lived signed URL; the bucket itself
  // can stay private. Keys are tenant-scoped `org/<id>/...`, except shared
  // content such as nursery-rhyme audio which uses `shared/<scope>/...`.
  router.get('/media/object', async (ctx) => {
    const key = String(ctx.query.key || '');
    const shared = /^shared\//.test(key);
    const match = shared ? null : /^org\/([0-9a-fA-F-]{36})\//.exec(key);
    if (!shared && !match) throw new AppError('NOT_FOUND');
    const own = match && match[1].toLowerCase() === String(ctx.organisationId).toLowerCase();
    const asset = await ctx.db.one(
      `SELECT status, scope FROM media_assets WHERE storage_key = $1`, [key]
    ).catch(() => null);
    // Shared keys and any nursery-rhyme recording (including older uploads
    // stored under a tenant prefix) are readable by every authenticated
    // centre. Everything else stays tenant-isolated.
    const publicRhyme = Boolean(asset && asset.scope === 'nursery-rhyme');
    if (!own && !shared && !publicRhyme) throw new AppError('FORBIDDEN');
    if (asset && asset.status === 'deleted') throw new AppError('NOT_FOUND');
    const signed = storage.presignGet(key, { expires: 300 });
    ctx.rawResponse = true;
    ctx.res.statusCode = 302;
    ctx.res.setHeader('Location', signed.url);
    ctx.res.setHeader('Cache-Control', 'private, max-age=120');
    ctx.res.end();
  }, { authenticated: true });

  router.post('/media/assets/:id/complete', async (ctx) => {
    const asset = await ctx.db.one(
      'SELECT * FROM media_assets WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]
    );
    if (!asset || asset.status === 'deleted') throw new AppError('NOT_FOUND');
    // The browser reports "done" — the object may never have landed. Verify
    // it exists before marking the asset usable.
    const exists = await storage.verifyObject(asset.storage_key);
    if (!exists) {
      fail('VALIDATION', [{ field: 'upload', message: 'The upload did not reach storage — please try again.' }]);
    }
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

  router.post('/media/assets/bulk', async (ctx) => {
    const body = validate(ctx.body, {
      ids: { type: 'array', of: 'uuid', max: 200 },
      action: { type: 'string', enum: ['delete'] }
    });
    if (!body.ids.length) fail('VALIDATION', [{ field: 'ids', message: 'Select at least one file.' }]);
    const updated = [];
    const skipped = [];
    for (const id of body.ids) {
      const asset = await ctx.db.one(
        'SELECT * FROM media_assets WHERE id = $1 AND organisation_id = $2 AND status <> $3',
        [id, ctx.organisationId, 'deleted']
      );
      if (!asset) { skipped.push({ id, reason: 'not found' }); continue; }
      await storage.deleteObject(asset.storage_key);
      await ctx.db.query("UPDATE media_assets SET status = 'deleted' WHERE id = $1", [asset.id]);
      await recordAudit(ctx.db, ctx, {
        action: 'media.asset_deleted', resourceType: 'media_asset', resourceId: asset.id,
        metadata: { bulk: true, scope: asset.scope }
      });
      updated.push(asset.id);
    }
    return { action: body.action, updated: updated.length, skipped };
  }, { permission: 'media.manage.daycare' });

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
