'use strict';

/**
 * Nightly logical backup of the critical tables into the private backup
 * bucket. This is a second line of defence alongside Neon's managed PITR:
 * it protects against a bad migration, accidental deletion or vendor outage.
 */

const crypto = require('node:crypto');
const storage = require('./storage-service');
const { createZip } = require('../utils/zip');
const { recordAudit } = require('./audit-service');

const TABLES = [
  'users', 'organisations', 'branches', 'memberships', 'membership_roles', 'roles', 'permissions',
  'role_permissions', 'delegations', 'invitations', 'sessions', 'organisation_settings',
  'learners', 'guardians', 'learner_guardians', 'learner_medical_records', 'learner_attendance',
  'learner_observations', 'learner_assessments', 'daily_reports', 'learner_documents',
  'staff_profiles', 'staff_shifts', 'staff_attendance_events', 'staff_documents', 'timesheets',
  'leave_requests', 'form_definitions', 'form_versions', 'form_submissions', 'consent_records',
  'incidents', 'incident_actions', 'tasks', 'notifications', 'notification_deliveries',
  'invoices', 'invoice_items', 'payments', 'payment_allocations', 'payment_intents',
  'platform_subscriptions', 'subscription_plans', 'platform_subscription_invoices',
  'platform_setup_fees', 'media_assets', 'audit_events', 'email_verifications', 'data_exports',
  'attendance_reminders', 'telemetry_events'
];

const RPO_HOURS = 24;
const RTO_HOURS = 4;

function backupBucket() {
  return process.env.R2_BACKUP_BUCKET || process.env.R2_BUCKET || '';
}

async function runPlatformBackup(db) {
  const bucket = backupBucket();
  if (!bucket || !storage.isConfigured()) {
    return { ok: false, skipped: true, reason: 'R2_BACKUP_BUCKET or R2 credentials are not configured.' };
  }
  const manifest = {
    createdAt: new Date().toISOString(),
    tables: {},
    rpoHours: RPO_HOURS,
    rtoHours: RTO_HOURS
  };
  const files = [];
  for (const table of TABLES) {
    let rows = [];
    try {
      rows = await db.many(`SELECT * FROM ${table}`);
    } catch (error) {
      manifest.tables[table] = { count: 0, error: String(error && error.message || error).slice(0, 200) };
      continue;
    }
    const json = JSON.stringify(rows, null, 2);
    manifest.tables[table] = {
      count: rows.length,
      sha256: crypto.createHash('sha256').update(json).digest('hex')
    };
    files.push({ name: `tables/${table}.json`, content: json });
  }
  files.push({ name: 'manifest.json', content: JSON.stringify(manifest, null, 2) });
  const zip = createZip(files, new Date());
  const key = `nightly/${new Date().toISOString().slice(0, 10)}/full-backup.zip`;
  const uploaded = await storage.putObject(key, zip, { bucket, contentType: 'application/zip' });
  if (!uploaded) return { ok: false, reason: 'Upload to the backup bucket failed.' };

  await recordAudit(db, { organisationId: null, user: null, req: {}, ip: '' }, {
    action: 'platform.backup_completed', resourceType: 'platform_backup', resourceId: null,
    metadata: { key, bytes: zip.length, tables: Object.keys(manifest.tables).length, rpoHours: RPO_HOURS, rtoHours: RTO_HOURS }
  });
  return {
    ok: true, key, bytes: zip.length, tables: Object.keys(manifest.tables).length,
    counts: Object.fromEntries(Object.entries(manifest.tables).map(([name, info]) => [name, info.count]))
  };
}

async function backupStatus(db) {
  const bucket = backupBucket();
  const last = await db.one(
    "SELECT occurred_at, metadata FROM audit_events WHERE action = 'platform.backup_completed' ORDER BY occurred_at DESC LIMIT 1"
  ).catch(() => null);
  return {
    rpoHours: RPO_HOURS,
    rtoHours: RTO_HOURS,
    bucketConfigured: Boolean(bucket),
    dedicatedBucket: Boolean(process.env.R2_BACKUP_BUCKET),
    storageConfigured: storage.isConfigured(),
    bucketVerification: bucket && storage.isConfigured()
      ? await storage.verifyBucketObject(bucket, last && last.metadata && last.metadata.key ? last.metadata.key : '')
      : false,
    // Report the actual history window. A short PITR window is not a failure:
    // older recovery still comes from the nightly logical backup.
    pitr: (() => {
      const configured = Number(process.env.NEON_PITR_HOURS || 0);
      const hours = configured > 0 ? configured
        : (process.env.NEON_PITR_CONFIRMED === 'true' ? 24 : 0);
      if (!hours) return { status: 'verify-manually', hours: 0,
        note: 'Confirm point-in-time restore in the Neon console and set NEON_PITR_HOURS to the displayed history window.' };
      if (hours >= RPO_HOURS) return { status: 'confirmed', hours,
        note: 'PITR covers at least the 24-hour recovery point objective.' };
      return { status: 'limited', hours,
        note: `PITR covers ${hours} hours. Older recovery relies on the nightly logical backup; RPO is met for full-day restores but not for every minute of the last ${RPO_HOURS} hours.` };
    })(),
    versioning: process.env.R2_VERSIONING_CONFIRMED === 'true'
      ? { status: 'confirmed' }
      : { status: 'verify-manually', note: 'Confirm bucket versioning is enabled on the media and backup buckets.' },
    lastBackup: last ? { at: last.occurred_at, key: last.metadata && last.metadata.key, bytes: last.metadata && last.metadata.bytes } : null
  };
}

module.exports = { runPlatformBackup, backupStatus, TABLES, RPO_HOURS, RTO_HOURS };
