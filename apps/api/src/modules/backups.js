'use strict';

const { AppError } = require('../../../../packages/contracts/errors');
const { safeEqual } = require('../../../../packages/auth/password');
const backupService = require('../services/platform-backup-service');

function register(router) {
  router.post('/cron/platform-backup', async (ctx) => {
    const secret = String(process.env.CRON_SECRET || '').trim();
    const header = String((ctx.req.headers['authorization'] || ctx.req.headers['x-cron-secret'] || '')).trim();
    const presented = header.replace(/^Bearer\s+/i, '');
    if (!secret || !safeEqual(presented, secret)) throw new AppError('FORBIDDEN');
    return backupService.runPlatformBackup(ctx.db);
  }, { public: true });

  router.get('/platform/backups', async (ctx) => backupService.backupStatus(ctx.db),
    { platformOnly: true, permission: 'platform.health.read' });

  router.post('/automation/platform-backup', async (ctx) => backupService.runPlatformBackup(ctx.db),
    { platformOnly: true, permission: 'platform.organisations.manage' });
}

module.exports = { register };
