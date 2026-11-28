'use strict';

/**
 * Full-centre data exports.
 *
 * Generates a portable ZIP of every entity belonging to a centre, stores it in
 * the private backup bucket and hands out a signed link that expires in 24
 * hours. Exports are jobs: create, then process on demand or from the cron.
 */

const storage = require('./storage-service');
const { createZip } = require('../utils/zip');
const { sendTemplate } = require('./email-service');
const { recordAudit } = require('./audit-service');

const EXPIRY_HOURS = 24;

const ENTITIES = [
  { key: 'learners', table: 'learners', label: 'Learners and enrolment details' },
  { key: 'guardians', table: 'guardians', label: 'Parents and guardians' },
  { key: 'learner_guardians', table: 'learner_guardians', label: 'Child-to-guardian links and consents' },
  { key: 'medical_records', table: 'learner_medical_records', label: 'Allergies and medical notes' },
  { key: 'attendance', table: 'learner_attendance', label: 'Learner attendance' },
  { key: 'observations', table: 'learner_observations', label: 'Observations and assessments' },
  { key: 'daily_reports', table: 'daily_reports', label: 'Daily reports' },
  { key: 'staff', table: 'staff_profiles', label: 'Staff profiles' },
  { key: 'staff_attendance', table: 'staff_attendance_events', label: 'Staff clock events' },
  { key: 'shifts', table: 'staff_shifts', label: 'Rostered shifts' },
  { key: 'form_definitions', table: 'form_definitions', label: 'Forms' },
  { key: 'form_submissions', table: 'form_submissions', label: 'Form submissions and answers' },
  { key: 'incidents', table: 'incidents', label: 'Safety incidents' },
  { key: 'invoices', table: 'invoices', label: 'Invoices' },
  { key: 'payments', table: 'payments', label: 'Payments' },
  { key: 'media_assets', table: 'media_assets', label: 'Media file records' },
  { key: 'audit_events', table: 'audit_events', label: 'Audit trail' }
];

function backupBucket() {
  // A dedicated private bucket is preferred. Until one is provisioned, use the
  // configured media bucket with private `exports/` prefixes (UUID keys, no
  // public listing) so centres can still retrieve their information.
  return process.env.R2_BACKUP_BUCKET || process.env.R2_BUCKET || '';
}

async function createExport(db, organisationId, requestedBy, reason = 'manual') {
  const row = await db.one(
    `INSERT INTO data_exports (organisation_id, requested_by, reason)
     VALUES ($1,$2,$3) RETURNING *`, [organisationId, requestedBy || null, reason]
  );
  await recordAudit(db, { organisationId, user: null, req: {}, ip: '' }, {
    action: 'data_export.requested', resourceType: 'data_export', resourceId: row.id,
    metadata: { reason }
  });
  return row;
}

async function collect(db, organisationId) {
  const org = await db.one('SELECT id, name, slug, timezone, currency FROM organisations WHERE id = $1', [organisationId]);
  if (!org) throw new Error('Organisation not found.');
  const files = [];
  let entities = 0;

  files.push({
    name: 'README.txt',
    content: [
      'RE-EL ECD — CENTRE DATA EXPORT',
      'Generated: ' + new Date().toISOString(),
      'Centre: ' + org.name + ' (' + org.slug + ')',
      '',
      'data/*.json contains one file per record type, as returned by the platform.',
      'media/manifest.json lists uploaded files with signed download links that expire in 24 hours.',
      'settings.json holds the centre configuration.',
      '',
      'SENSITIVE INFORMATION: this archive contains children\'s personal information, medical notes,',
      'guardian details and financial records. Store it securely and delete it when no longer needed.',
      'Re-EL ECD cannot recover a lost download after the link expires — request a new export instead.',
      ''
    ].join('\n')
  });

  for (const def of ENTITIES) {
    const rows = await db.many(`SELECT * FROM ${def.table} WHERE organisation_id = $1`, [organisationId]);
    files.push({
      name: 'data/' + def.key + '.json',
      content: JSON.stringify({ label: def.label, count: rows.length, records: rows }, null, 2)
    });
    entities += rows.length;
  }

  const settings = await db.one('SELECT settings, updated_at FROM organisation_settings WHERE organisation_id = $1', [organisationId]);
  files.push({ name: 'settings.json', content: JSON.stringify(settings || {}, null, 2) });

  const bucket = backupBucket();
  const mediaRows = await db.many(
    `SELECT id, storage_key, original_filename, mime_type, size_bytes, scope, status, created_at
     FROM media_assets WHERE organisation_id = $1 AND status = 'ready' ORDER BY created_at DESC`, [organisationId]
  );
  const media = mediaRows.map((row) => {
    let url = null;
    try { url = bucket ? storage.presignGetFrom(bucket, row.storage_key, EXPIRY_HOURS * 3600).url : null; }
    catch (error) { url = null; }
    return Object.assign({}, row, { downloadUrl: url });
  });
  files.push({ name: 'media/manifest.json', content: JSON.stringify({ count: media.length, files: media }, null, 2) });

  return { zip: createZip(files, new Date()), entities, mediaCount: media.length };
}

async function processExport(db, jobId) {
  const job = await db.one('SELECT * FROM data_exports WHERE id = $1', [jobId]);
  if (!job || !['pending', 'failed'].includes(job.status)) return job;
  const claimed = await db.one(
    `UPDATE data_exports SET status = 'processing', error = NULL WHERE id = $1 AND status IN ('pending','failed')
     RETURNING *`, [jobId]
  );
  if (!claimed) return job;

  const bucket = backupBucket();
  if (!bucket || !storage.isConfigured()) {
    return db.one(
      `UPDATE data_exports SET status = 'failed',
         error = 'File storage is not configured. Set R2_BACKUP_BUCKET and the R2 credentials.'
       WHERE id = $1 RETURNING *`, [jobId]
    );
  }

  try {
    const { zip, entities, mediaCount } = await collect(db, job.organisation_id);
    const fileKey = `exports/${job.organisation_id}/${job.id}.zip`;
    const uploaded = await storage.putObject(fileKey, zip, { bucket, contentType: 'application/zip' });
    if (!uploaded) throw new Error('The export could not be uploaded to storage.');
    const done = await db.one(
      `UPDATE data_exports SET status = 'ready', file_key = $1, file_bytes = $2, entity_count = $3,
         expires_at = now() + ($4 || ' hours')::interval, completed_at = now(), error = NULL
       WHERE id = $5 RETURNING *`,
      [fileKey, zip.length, entities, String(EXPIRY_HOURS), jobId]
    );
    await recordAudit(db, { organisationId: job.organisation_id, user: null, req: {}, ip: '' }, {
      action: 'data_export.completed', resourceType: 'data_export', resourceId: jobId,
      metadata: { entities, mediaCount, bytes: zip.length, reason: job.reason }
    });

    const owner = await db.one(
      `SELECT u.email, u.display_name FROM memberships m
       JOIN users u ON u.id = m.user_id
       JOIN membership_roles mr ON mr.membership_id = m.id
       JOIN roles r ON r.id = mr.role_id
       WHERE m.organisation_id = $1 AND r.role_key = 'organisation_owner' AND m.status = 'active'
       ORDER BY m.created_at LIMIT 1`, [job.organisation_id]
    );
    if (owner) {
      const url = await signedUrl(db, done);
      await sendTemplate(db, 'dataExportReady', {
        to: owner.email, organisationId: job.organisation_id,
        metadata: { exportId: jobId },
        data: { name: owner.display_name, url, expiresAt: done.expires_at, bytes: zip.length }
      });
    }
    return done;
  } catch (error) {
    return db.one(
      `UPDATE data_exports SET status = 'failed', error = $1, completed_at = now() WHERE id = $2 RETURNING *`,
      [String(error && error.message || error).slice(0, 500), jobId]
    );
  }
}

async function signedUrl(db, job) {
  if (!job || job.status !== 'ready' || !job.file_key) return null;
  const expired = job.expires_at && new Date(job.expires_at) < new Date();
  if (expired) {
    await db.query("UPDATE data_exports SET status = 'expired' WHERE id = $1 AND status = 'ready'", [job.id]);
    return null;
  }
  const bucket = backupBucket();
  if (!bucket) return null;
  return storage.presignGetFrom(bucket, job.file_key, EXPIRY_HOURS * 3600).url;
}

async function dueScheduled(db) {
  const orgs = await db.many(
    `SELECT o.id, COALESCE(os.settings,'{}'::jsonb) AS settings
     FROM organisations o LEFT JOIN organisation_settings os ON os.organisation_id = o.id
     WHERE o.status <> 'suspended'`
  );
  const created = [];
  for (const org of orgs) {
    const schedule = (org.settings && org.settings.exportSchedule) || {};
    if (!schedule.enabled || !['weekly', 'monthly'].includes(schedule.frequency)) continue;
    const since = schedule.frequency === 'weekly' ? "now() - interval '7 days'" : "now() - interval '30 days'";
    const recent = await db.one(
      `SELECT id FROM data_exports WHERE organisation_id = $1 AND reason = 'scheduled' AND created_at >= ${since} LIMIT 1`,
      [org.id]
    );
    if (recent) continue;
    created.push(await createExport(db, org.id, null, 'scheduled'));
  }
  return created;
}

async function terminationExports(db) {
  const rows = await db.many(
    `SELECT ps.organisation_id, ps.current_period_end
     FROM platform_subscriptions ps
     WHERE ps.status IN ('cancelled','past_due')
       AND ps.organisation_id IS NOT NULL
       AND ps.current_period_end IS NOT NULL
       AND ps.current_period_end < now()
       AND ps.current_period_end > now() - interval '60 days'
     ORDER BY ps.current_period_end DESC`
  );
  const seen = new Set();
  const created = [];
  for (const row of rows) {
    if (seen.has(row.organisation_id)) continue;
    seen.add(row.organisation_id);
    const prior = await db.one(
      `SELECT id FROM data_exports WHERE organisation_id = $1 AND reason = 'termination' LIMIT 1`, [row.organisation_id]
    );
    if (prior) continue;
    created.push(await createExport(db, row.organisation_id, null, 'termination'));
  }
  return created;
}

module.exports = {
  ENTITIES, EXPIRY_HOURS, createExport, processExport, signedUrl, collect, dueScheduled, terminationExports
};
