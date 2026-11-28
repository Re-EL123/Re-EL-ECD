'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('full centre exports are wired into Settings', () => {
  const settings = read('apps/web/src/views/settings.js');
  const app = read('apps/web/src/app.js');
  assert.match(settings, /key: 'data', label: 'Data & backups'/);
  assert.match(settings, /renderDataExports\(ctx, page\)/);
  assert.match(settings, /Export my centre data/);
  assert.match(settings, /downloadExport\(\\'\/data-exports\//);
  assert.match(settings, /exportScheduleEnabled/);
  assert.match(settings, /Scheduled exports/);
  assert.match(app, /async createDataExport\(\)/);
  assert.match(app, /Reel\.api\('POST', '\/data-exports'/);
});

test('backups, exports and legal disclosures are documented and scheduled', () => {
  const vercel = read('vercel.json');
  const runbook = read('docs/backup-restore.md');
  const legal = read('apps/web/src/views/public.js');
  const docs = read('apps/api/src/services/document-service.js');
  const migration = read('packages/database/migrations/064_export_backup_disclosure.sql');

  assert.match(vercel, /\/api\/v1\/cron\/platform-backup/);
  assert.match(vercel, /\/api\/v1\/cron\/data-exports/);
  assert.match(runbook, /RPO/);
  assert.match(runbook, /RTO/);
  assert.match(runbook, /24 hours/);
  assert.match(runbook, /4 hours/);
  assert.match(runbook, /Quarterly restore drill/);
  assert.match(legal, /expires after 24 hours/);
  assert.match(legal, /store them securely/);
  assert.match(docs, /store them securely/);
  assert.match(migration, /signed link that expires/);
  assert.match(migration, /Backups and exports/);
});

test('backup and export endpoints are guarded and audited', () => {
  const backups = read('apps/api/src/modules/backups.js');
  const exportsModule = read('apps/api/src/modules/data-exports.js');
  const service = read('apps/api/src/services/data-export-service.js');
  const backupService = read('apps/api/src/services/platform-backup-service.js');
  const email = read('apps/api/src/services/email-service.js');

  assert.match(backups, /router\.post\('\/cron\/platform-backup'/);
  assert.match(backups, /safeEqual\(presented, secret\)/);
  assert.match(backups, /platformOnly: true, permission: 'platform\.health\.read'/);
  assert.match(exportsModule, /permission: 'reports\.export\.daycare'/);
  assert.match(exportsModule, /router\.get\('\/data-exports\/:id\/download'/);
  assert.match(service, /createZip\(files/);
  assert.match(service, /EXPIRY_HOURS = 24/);
  assert.match(service, /process\.env\.R2_BACKUP_BUCKET \|\| process\.env\.R2_BUCKET/);
  assert.match(service, /sendTemplate\(db, 'dataExportReady'/);
  assert.match(backupService, /RPO_HOURS = 24/);
  assert.match(backupService, /RTO_HOURS = 4/);
  assert.match(backupService, /platform\.backup_completed/);
  assert.match(email, /dataExportReady\(data\)/);
});
