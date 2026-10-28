'use strict';

/**
 * Static checks for the SQL migration set. Catches ordering mistakes, empty
 * files and duplicate object creation before they reach a database.
 */

const fs = require('node:fs');
const path = require('node:path');
const db = require('../packages/database');

const REQUIRED_TABLES = [
  'organisations', 'branches', 'users', 'memberships', 'membership_roles', 'roles', 'role_permissions',
  'sessions', 'audit_events', 'learners', 'guardians', 'learner_guardians', 'enrolments', 'classrooms',
  'admission_enquiries', 'admission_applications', 'curriculum_frameworks', 'curriculum_domains',
  'assessment_periods', 'learner_observations', 'learner_assessments', 'learner_attendance', 'daily_reports',
  'staff_profiles', 'staff_shifts', 'staff_attendance_events', 'timesheets', 'leave_requests',
  'form_definitions', 'form_versions', 'form_submissions', 'consent_records', 'announcements',
  'conversations', 'messages', 'notifications', 'invoices', 'invoice_items', 'payments',
  'payment_allocations', 'expenses', 'inventory_items', 'incidents', 'incident_actions',
  'tasks', 'website_configs', 'report_jobs', 'feature_flags', 'automation_rules'
];

const errors = [];
const warnings = [];

const dir = path.join(__dirname, '..', 'packages', 'database', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

if (!files.length) errors.push('No migration files found.');

const seen = new Set();
files.forEach((file, index) => {
  const match = /^(\d{3})_([a-z0-9_]+)\.sql$/.exec(file);
  if (!match) {
    errors.push(`${file}: filename must match NNN_snake_case.sql`);
    return;
  }
  if (seen.has(match[1])) errors.push(`${file}: duplicate migration number ${match[1]}`);
  seen.add(match[1]);
  const expected = String(index + 1).padStart(3, '0');
  if (match[1] !== expected) warnings.push(`${file}: expected prefix ${expected} for a gap-free sequence`);

  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  if (!sql.trim()) errors.push(`${file}: file is empty`);
  const statements = db.splitStatements(sql);
  if (!statements.length) errors.push(`${file}: no executable statements after comment stripping`);
  if (/DROP\s+TABLE/i.test(sql) && !/--\s*intentional/i.test(sql)) {
    warnings.push(`${file}: contains DROP TABLE (verify this is intentional and reversible)`);
  }
  if (/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?/i.test(sql) === false) {
    warnings.push(`${file}: does not create tables (fine for data/alter migrations)`);
  }
});

const allSql = files.map((file) => fs.readFileSync(path.join(dir, file), 'utf8')).join('\n');
for (const table of REQUIRED_TABLES) {
  const pattern = new RegExp(`CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, 'i');
  if (!pattern.test(allSql)) errors.push(`Required table "${table}" is never created.`);
}

// Every table with an organisation_id must be indexed on it for tenant isolation performance.
const createdTables = [...allSql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/gi)].map((m) => m[1]);
for (const table of new Set(createdTables)) {
  const block = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\s*\\(([\\s\\S]*?)\\);`, 'i').exec(allSql);
  if (!block) continue;
  if (/\borganisation_id\b/.test(block[1])) {
    const indexPattern = new RegExp(`ON\\s+${table}\\s*\\(\\s*organisation_id`, 'i');
    if (!indexPattern.test(allSql)) warnings.push(`${table}: has organisation_id but no index leading with organisation_id`);
  }
}

const report = { level: errors.length ? 'error' : 'info', files: files.length, errors, warnings };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
