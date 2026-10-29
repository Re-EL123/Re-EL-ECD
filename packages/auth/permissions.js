'use strict';

/**
 * Complete permission catalogue. Naming convention: resource.action.scope
 * Scope is one of: platform, organisation, daycare (branch), assigned, own.
 * The backend derives scope from verified membership — never from the client.
 */
const PERMISSION_KEYS = [
  // Platform command centre
  'platform.organisations.read', 'platform.organisations.manage',
  'platform.subscriptions.read', 'platform.subscriptions.manage',
  'platform.audit.read', 'platform.health.read', 'platform.support.manage',
  'platform.settings.manage', 'platform.features.manage', 'platform.impersonate.manage',
  // Organisation
  'organisation.read.daycare', 'organisation.update.daycare', 'organisation.settings.manage',
  'branches.read.daycare', 'branches.manage.daycare',
  // Media library (files live in object storage; the database stores URLs)
  'media.read.daycare', 'media.upload.daycare', 'media.manage.daycare',
  // Access control
  'access.read.daycare', 'access.manage.daycare', 'delegations.manage.daycare',
  // Learners
  'learners.read.assigned', 'learners.read.daycare', 'learners.create.daycare',
  'learners.update.assigned', 'learners.update.daycare', 'learners.archive.daycare',
  'guardians.read.assigned', 'guardians.read.daycare', 'guardians.manage.daycare',
  'medical.read.daycare', 'medical.manage.daycare',
  'collections.read.daycare', 'collections.record.daycare',
  // Admissions
  'admissions.read.daycare', 'admissions.manage.daycare', 'admissions.enrol.daycare',
  // Classrooms
  'classrooms.read.daycare', 'classrooms.manage.daycare',
  // Curriculum & assessment
  'curriculum.read.daycare', 'curriculum.create.daycare', 'curriculum.publish.daycare',
  'assessments.read.assigned', 'assessments.read.daycare', 'assessments.create.assigned',
  'assessments.publish.daycare', 'portfolio.read.assigned', 'portfolio.manage.assigned',
  // Attendance
  'attendance.read.assigned', 'attendance.read.daycare', 'attendance.record.assigned',
  'attendance.record.daycare', 'attendance.correct.daycare', 'attendance.reports.daycare',
  // Workforce
  'staff.read.daycare', 'staff.manage.daycare',
  'shifts.read.assigned', 'shifts.read.daycare', 'shifts.create.daycare',
  'shifts.approve.daycare', 'staff_attendance.read.assigned', 'staff_attendance.read.daycare',
  'staff_attendance.record.own', 'staff_attendance.record.daycare', 'staff_attendance.correct.daycare',
  'timesheets.read.daycare', 'timesheets.approve.daycare',
  'leave.request.own', 'leave.read.daycare', 'leave.manage.daycare',
  // Forms & consent
  'forms.read.daycare', 'forms.manage.daycare', 'forms.submissions.review.daycare',
  'consent.read.daycare', 'consent.manage.daycare',
  // Communications
  'announcements.read.daycare', 'announcements.manage.daycare',
  'messages.read.own', 'messages.send.own', 'notifications.read.own',
  // Finance
  'finance.read.daycare', 'finance.manage.daycare', 'finance.invoice.create.daycare',
  'finance.invoice.issue.daycare', 'finance.payment.record.daycare',
  'finance.payment.reconcile.daycare', 'finance.reports.daycare',
  'expenses.read.daycare', 'expenses.manage.daycare', 'inventory.read.daycare', 'inventory.manage.daycare',
  // Safety & operations
  'safety.read.daycare', 'safety.report.daycare', 'safety.manage.daycare',
  'tasks.read.own', 'tasks.read.daycare', 'tasks.manage.daycare',
  // Reports & website
  'reports.read.assigned', 'reports.read.daycare', 'reports.export.daycare',
  'website.read.daycare', 'website.manage.daycare',
  // Parent portal
  'parent.read.own', 'parent.forms.submit.own', 'parent.finance.read.own', 'parent.absence.report.own',
  // Audit
  'audit.read.daycare'
];

const PERMISSIONS = Object.fromEntries(
  PERMISSION_KEYS.map((key) => {
    const [resource, action, scope] = key.split('.');
    return [key, { key, resource, action, scope }];
  })
);

function hasPermission(granted, required) {
  if (!granted || !required) return false;
  if (granted.has('*')) return true;
  if (granted.has(required)) return true;
  const [resource, action] = required.split('.');
  if (granted.has(`${resource}.*`)) return true;
  if (granted.has(`${resource}.${action}.*`)) return true;
  return false;
}

function expand(patterns) {
  const out = new Set();
  for (const pattern of patterns) {
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -1);
      for (const key of PERMISSION_KEYS) if (key.startsWith(prefix)) out.add(key);
    } else if (pattern.includes('*')) {
      const re = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      for (const key of PERMISSION_KEYS) if (re.test(key)) out.add(key);
    } else {
      out.add(pattern);
    }
  }
  return out;
}

module.exports = { PERMISSION_KEYS, PERMISSIONS, hasPermission, expand };
