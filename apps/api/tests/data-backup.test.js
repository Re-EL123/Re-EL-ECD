'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start, stop, createClient, db } = require('./helpers');
const { createZip } = require('../src/utils/zip');
const storage = require('../src/services/storage-service');
const exportService = require('../src/services/data-export-service');
const backupService = require('../src/services/platform-backup-service');

test.before(start);
test.after(stop);

test('the ZIP writer produces a valid archive', () => {
  const zip = createZip([
    { name: 'README.txt', content: 'hello' },
    { name: 'data/learners.json', content: JSON.stringify([{ first_name: 'Amelia' }]) }
  ]);
  assert.equal(zip.readUInt32LE(0), 0x04034B50);
  const temp = path.join(os.tmpdir(), 'reel-export-' + Date.now() + '.zip');
  fs.writeFileSync(temp, zip);
  try {
    const out = execFileSync('unzip', ['-t', temp], { encoding: 'utf8' });
    assert.match(out, /No errors detected|tested/);
  } finally {
    fs.unlinkSync(temp);
  }
});

test('a centre export is created, zipped and delivered with an expiring link', async () => {
  const original = { put: storage.putObject, sign: storage.presignGetFrom, configured: storage.isConfigured, bucket: process.env.R2_BACKUP_BUCKET };
  let captured = null;
  storage.putObject = async (key, body) => { captured = { key, body }; return true; };
  storage.presignGetFrom = () => ({ url: 'https://backup.example.test/signed-export' });
  storage.isConfigured = () => true;
  process.env.R2_BACKUP_BUCKET = 'reel-backups-test';

  try {
    const principal = createClient();
    await principal.login('principal@littlesprouts.local');
    const created = await principal.post('/data-exports', {});
    assert.equal(created.status, 202, created.text);
    assert.equal(created.data.status, 'ready', created.data.error || '');
    assert.ok(created.data.downloadUrl);
    assert.ok(created.data.entity_count > 0);
    assert.match(captured.key, /^exports\/[0-9a-f-]+\//);

    const temp = path.join(os.tmpdir(), 'reel-centre-' + Date.now() + '.zip');
    fs.writeFileSync(temp, captured.body);
    try {
      const listing = execFileSync('unzip', ['-Z1', temp], { encoding: 'utf8' });
      for (const name of ['README.txt', 'data/learners.json', 'data/medical_records.json',
        'data/attendance.json', 'data/form_submissions.json', 'data/audit_events.json',
        'settings.json', 'media/manifest.json']) {
        assert.ok(listing.includes(name), 'export is missing ' + name);
      }
    } finally { fs.unlinkSync(temp); }

    const list = await principal.get('/data-exports');
    assert.equal(list.status, 200);
    assert.ok(list.data.length >= 1);

    const audit = await db.one(
      "SELECT id FROM audit_events WHERE action = 'data_export.completed' ORDER BY occurred_at DESC LIMIT 1"
    );
    assert.ok(audit);
  } finally {
    storage.putObject = original.put;
    storage.presignGetFrom = original.sign;
    storage.isConfigured = original.configured;
    if (original.bucket === undefined) delete process.env.R2_BACKUP_BUCKET;
    else process.env.R2_BACKUP_BUCKET = original.bucket;
  }
});

test('the nightly platform backup writes a manifest and is audited', async () => {
  const original = { put: storage.putObject, configured: storage.isConfigured, bucket: process.env.R2_BACKUP_BUCKET };
  let captured = null;
  storage.putObject = async (key, body) => { captured = { key, body }; return true; };
  storage.isConfigured = () => true;
  process.env.R2_BACKUP_BUCKET = 'reel-backups-test';
  try {
    const result = await backupService.runPlatformBackup(db);
    assert.equal(result.ok, true, result.reason || '');
    assert.match(captured.key, /^nightly\/\d{4}-\d{2}-\d{2}\/full-backup\.zip$/);
    assert.ok(result.tables > 20);
    const status = await backupService.backupStatus(db);
    assert.equal(status.rpoHours, 24);
    assert.equal(status.rtoHours, 4);
    assert.ok(status.lastBackup);
  } finally {
    storage.putObject = original.put;
    storage.isConfigured = original.configured;
    if (original.bucket === undefined) delete process.env.R2_BACKUP_BUCKET;
    else process.env.R2_BACKUP_BUCKET = original.bucket;
  }
});

test('export jobs and scheduled exports are visible to owners only', async () => {
  const parent = createClient();
  await parent.login('parent@littlesprouts.local');
  assert.equal((await parent.get('/data-exports')).status, 403);
  const admin = createClient();
  await admin.login('platform@re-el-ecd.local');
  const jobs = await exportService.dueScheduled(db);
  assert.ok(Array.isArray(jobs));
});

test('backups and exports fall back to the configured bucket when no dedicated bucket is set', async () => {
  const original = { bucket: process.env.R2_BACKUP_BUCKET, media: process.env.R2_BUCKET };
  delete process.env.R2_BACKUP_BUCKET;
  process.env.R2_BUCKET = 'reel-media-fallback-test';
  try {
    const owner = createClient();
    await owner.login('principal@littlesprouts.local');
    const originalPut = storage.putObject;
    const originalConfigured = storage.isConfigured;
    const originalSign = storage.presignGetFrom;
    let key = null;
    storage.putObject = async (k) => { key = k; return true; };
    storage.isConfigured = () => true;
    storage.presignGetFrom = () => ({ url: 'https://example.test/media' });
    const job = await exportService.createExport(db, (await db.one("SELECT id FROM organisations WHERE slug='little-sprouts'")).id, null, 'manual');
    const done = await exportService.processExport(db, job.id);
    assert.equal(done.status, 'ready', done.error || '');
    assert.match(key, /^exports\//);
    storage.putObject = originalPut;
    storage.isConfigured = originalConfigured;
    storage.presignGetFrom = originalSign;
  } finally {
    if (original.bucket === undefined) delete process.env.R2_BACKUP_BUCKET;
    else process.env.R2_BACKUP_BUCKET = original.bucket;
    if (original.media === undefined) delete process.env.R2_BUCKET;
    else process.env.R2_BUCKET = original.media;
  }
});
