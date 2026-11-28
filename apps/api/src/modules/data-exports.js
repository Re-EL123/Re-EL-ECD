'use strict';

const { AppError } = require('../../../../packages/contracts/errors');
const { safeEqual } = require('../../../../packages/auth/password');
const { parsePagination } = require('../utils/http');
const exportsService = require('../services/data-export-service');

function decorate(db, job) {
  return Promise.resolve(exportsService.signedUrl(db, job)).then((url) => Object.assign({}, job, { downloadUrl: url }));
}

function register(router) {
  router.post('/data-exports', async (ctx) => {
    const job = await exportsService.createExport(ctx.db, ctx.organisationId, ctx.user.id, 'manual');
    const ready = await exportsService.processExport(ctx.db, job.id);
    ctx.status = 202;
    return decorate(ctx.db, ready);
  }, { permission: 'reports.export.daycare' });

  router.get('/data-exports', async (ctx) => {
    const { page, pageSize, offset } = parsePagination(ctx.query);
    const total = await ctx.db.one('SELECT COUNT(*)::int AS total FROM data_exports WHERE organisation_id = $1', [ctx.organisationId]);
    const rows = await ctx.db.many(
      `SELECT id, status, reason, entity_count, file_bytes, expires_at, error, created_at, completed_at
       FROM data_exports WHERE organisation_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [ctx.organisationId, pageSize, offset]
    );
    ctx.meta.page = page;
    ctx.meta.pageSize = pageSize;
    ctx.meta.total = total.total;
    return rows;
  }, { permission: 'reports.export.daycare' });

  router.get('/data-exports/:id', async (ctx) => {
    const job = await ctx.db.one('SELECT * FROM data_exports WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!job) throw new AppError('NOT_FOUND');
    return decorate(ctx.db, job);
  }, { permission: 'reports.export.daycare' });

  router.get('/data-exports/:id/download', async (ctx) => {
    const job = await ctx.db.one('SELECT * FROM data_exports WHERE id = $1 AND organisation_id = $2',
      [ctx.params.id, ctx.organisationId]);
    if (!job) throw new AppError('NOT_FOUND');
    const url = await exportsService.signedUrl(ctx.db, job);
    if (!url) throw new AppError('CONFLICT', null, 'This export is not ready or its link has expired.');
    ctx.rawResponse = true;
    ctx.res.statusCode = 302;
    ctx.res.setHeader('Location', url);
    ctx.res.setHeader('Cache-Control', 'private, no-store');
    ctx.res.end();
  }, { permission: 'reports.export.daycare' });

  async function runJobs(db) {
    const pending = await db.many("SELECT id FROM data_exports WHERE status IN ('pending','failed') ORDER BY created_at LIMIT 20");
    for (const row of pending) await exportsService.processExport(db, row.id);
    const scheduled = await exportsService.dueScheduled(db);
    const termination = await exportsService.terminationExports(db);
    for (const job of scheduled.concat(termination)) await exportsService.processExport(db, job.id);
    return { processed: pending.length, scheduled: scheduled.length, termination: termination.length };
  }

  router.post('/cron/data-exports', async (ctx) => {
    const secret = String(process.env.CRON_SECRET || '').trim();
    const header = String((ctx.req.headers['authorization'] || ctx.req.headers['x-cron-secret'] || '')).trim();
    const presented = header.replace(/^Bearer\s+/i, '');
    if (!secret || !safeEqual(presented, secret)) throw new AppError('FORBIDDEN');
    return runJobs(ctx.db);
  }, { public: true });

  router.post('/automation/data-exports', async (ctx) => runJobs(ctx.db),
    { permission: 'platform.organisations.manage', platformOnly: true });
}

module.exports = { register };
