'use strict';

/**
 * One export path for every list screen: `GET /exports/:resource?format=csv|xlsx|pdf`.
 *
 * Each resource declares its permission, its columns and its query, so every
 * format exports exactly the same data the screen shows, scoped to the
 * caller's organisation. Platform resources live on `/exports/platform/:resource`.
 * PDF and XLSX are generated server-side without third-party binaries.
 */

const { AppError } = require('../../../../packages/contracts/errors');
const { hasPermission } = require('../../../../packages/auth/permissions');
const { recordAudit } = require('../services/audit-service');
const exportService = require('../services/export-service');

const MAX_ROWS = 5000;

function dateParam(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

const tenantResources = {
  learners: {
    permission: 'learners.read.daycare',
    title: 'Learners',
    filename: 'learners',
    sheet: 'Learners',
    subtitle: 'Children on the register',
    columns: [
      { key: 'reference', label: 'Reference', width: 14 },
      { key: 'last_name', label: 'Last name', width: 20 },
      { key: 'first_name', label: 'First name', width: 20 },
      { key: 'date_of_birth', label: 'Date of birth', format: 'date', width: 14 },
      { key: 'classroom', label: 'Classroom', width: 20 },
      { key: 'status', label: 'Status', width: 12 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT l.learner_reference AS reference, l.last_name, l.first_name, l.date_of_birth,
                c.name AS classroom, l.status
         FROM learners l LEFT JOIN classrooms c ON c.id = l.classroom_id
         WHERE l.organisation_id = $1
         ORDER BY l.last_name, l.first_name LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  staff: {
    permission: 'staff.read.daycare',
    title: 'Staff',
    filename: 'staff',
    sheet: 'Staff',
    subtitle: 'The team on the books',
    columns: [
      { key: 'name', label: 'Name', width: 24 },
      { key: 'email', label: 'Email', width: 28 },
      { key: 'phone', label: 'Phone', width: 16 },
      { key: 'job_title', label: 'Job title', width: 24 },
      { key: 'employment_status', label: 'Status', width: 14 },
      { key: 'employee_reference', label: 'Reference', width: 16 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT u.display_name AS name, u.email, u.phone, s.job_title, s.employment_status,
                s.employee_reference
         FROM staff_profiles s LEFT JOIN users u ON u.id = s.user_id
         WHERE s.organisation_id = $1
         ORDER BY u.display_name NULLS LAST, s.employee_reference LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  attendance: {
    permission: 'attendance.read.daycare',
    title: 'Attendance register',
    filename: 'attendance',
    sheet: 'Attendance',
    subtitle: 'Daily attendance records',
    columns: [
      { key: 'attendance_date', label: 'Date', format: 'date', width: 12 },
      { key: 'learner', label: 'Child', width: 24 },
      { key: 'attendance_status', label: 'Status', width: 12 },
      { key: 'absence_reason', label: 'Absence reason', width: 30 },
      { key: 'branch', label: 'Branch', width: 20 }
    ],
    query(ctx) {
      const params = [ctx.organisationId];
      let where = 'a.organisation_id = $1';
      const from = dateParam(ctx.query.from);
      const to = dateParam(ctx.query.to);
      if (from) { params.push(from); where += ' AND a.attendance_date >= $' + params.length; }
      if (to) { params.push(to); where += ' AND a.attendance_date <= $' + params.length; }
      params.push(MAX_ROWS);
      return ctx.db.many(
        `SELECT a.attendance_date, (l.first_name || ' ' || l.last_name) AS learner,
                a.attendance_status, a.absence_reason, b.name AS branch
         FROM learner_attendance a
         JOIN learners l ON l.id = a.learner_id
         LEFT JOIN branches b ON b.id = a.branch_id
         WHERE ${where}
         ORDER BY a.attendance_date DESC, l.last_name LIMIT $` + params.length,
        params
      );
    }
  },

  invoices: {
    permission: 'finance.reports.daycare',
    title: 'Invoices',
    filename: 'invoices',
    sheet: 'Invoices',
    subtitle: 'Issued invoices and their payment state',
    columns: [
      { key: 'invoice_number', label: 'Invoice', width: 16 },
      { key: 'status', label: 'Status', width: 12 },
      { key: 'learner', label: 'Child', width: 22 },
      { key: 'guardian_email', label: 'Guardian email', width: 28 },
      { key: 'total_amount', label: 'Total', format: 'money', align: 'right', width: 12 },
      { key: 'amount_paid', label: 'Paid', format: 'money', align: 'right', width: 12 },
      { key: 'outstanding', label: 'Outstanding', format: 'money', align: 'right', width: 13 },
      { key: 'due_at', label: 'Due date', format: 'date', width: 12 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT i.invoice_number, i.status, (l.first_name || ' ' || l.last_name) AS learner,
                g.email AS guardian_email, i.total_amount, i.amount_paid,
                (i.total_amount - i.amount_paid) AS outstanding, i.due_at
         FROM invoices i
         LEFT JOIN learners l ON l.id = i.learner_id
         LEFT JOIN guardians g ON g.id = i.guardian_id
         WHERE i.organisation_id = $1
         ORDER BY i.created_at DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  payments: {
    permission: 'finance.reports.daycare',
    title: 'Payments',
    filename: 'payments',
    sheet: 'Payments',
    subtitle: 'Money received, newest first',
    columns: [
      { key: 'received_at', label: 'Date', format: 'datetime', width: 20 },
      { key: 'guardian', label: 'Guardian', width: 24 },
      { key: 'amount', label: 'Amount', format: 'money', align: 'right', width: 12 },
      { key: 'currency', label: 'Currency', width: 8 },
      { key: 'payment_method', label: 'Method', width: 12 },
      { key: 'status', label: 'Status', width: 10 },
      { key: 'provider_reference', label: 'Reference', width: 18 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT p.received_at, (g.first_name || ' ' || g.last_name) AS guardian, p.amount,
                p.currency, p.payment_method, p.status, p.provider_reference
         FROM payments p LEFT JOIN guardians g ON g.id = p.guardian_id
         WHERE p.organisation_id = $1
         ORDER BY p.received_at DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  expenses: {
    permission: 'expenses.read.daycare',
    title: 'Expenses',
    filename: 'expenses',
    sheet: 'Expenses',
    subtitle: 'Spending by branch',
    columns: [
      { key: 'expense_date', label: 'Date', format: 'date', width: 12 },
      { key: 'description', label: 'Description', width: 36 },
      { key: 'category', label: 'Category', width: 18 },
      { key: 'supplier', label: 'Supplier', width: 22 },
      { key: 'branch', label: 'Branch', width: 18 },
      { key: 'amount', label: 'Amount', format: 'money', align: 'right', width: 12 },
      { key: 'currency', label: 'Currency', width: 8 },
      { key: 'approval_status', label: 'Approval', width: 12 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT e.expense_date, e.description, c.name AS category, s.name AS supplier,
                b.name AS branch, e.amount, e.currency, e.approval_status
         FROM expenses e
         LEFT JOIN expense_categories c ON c.id = e.category_id
         LEFT JOIN suppliers s ON s.id = e.supplier_id
         LEFT JOIN branches b ON b.id = e.branch_id
         WHERE e.organisation_id = $1
         ORDER BY e.expense_date DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  inventory: {
    permission: 'inventory.read.daycare',
    title: 'Inventory',
    filename: 'inventory',
    sheet: 'Inventory',
    subtitle: 'Stock on hand',
    columns: [
      { key: 'name', label: 'Item', width: 32 },
      { key: 'category', label: 'Category', width: 16 },
      { key: 'quantity_on_hand', label: 'On hand', format: 'number', align: 'right', width: 12 },
      { key: 'minimum_quantity', label: 'Minimum', format: 'number', align: 'right', width: 12 },
      { key: 'unit', label: 'Unit', width: 10 },
      { key: 'branch', label: 'Branch', width: 18 },
      { key: 'storage_location', label: 'Location', width: 18 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT i.name, i.category, i.quantity_on_hand, i.minimum_quantity, i.unit,
                b.name AS branch, i.storage_location
         FROM inventory_items i LEFT JOIN branches b ON b.id = i.branch_id
         WHERE i.organisation_id = $1 AND i.status <> 'archived'
         ORDER BY i.name LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  incidents: {
    permission: 'safety.read.daycare',
    title: 'Incidents',
    filename: 'incidents',
    sheet: 'Incidents',
    subtitle: 'Safety log',
    columns: [
      { key: 'occurred_at', label: 'Occurred', format: 'datetime', width: 20 },
      { key: 'incident_type', label: 'Type', width: 18 },
      { key: 'severity', label: 'Severity', width: 10 },
      { key: 'status', label: 'Status', width: 16 },
      { key: 'location_description', label: 'Location', width: 24 },
      { key: 'branch', label: 'Branch', width: 18 },
      { key: 'description', label: 'Description', width: 48 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT i.occurred_at, i.incident_type, i.severity, i.status, i.location_description,
                b.name AS branch, i.description
         FROM incidents i LEFT JOIN branches b ON b.id = i.branch_id
         WHERE i.organisation_id = $1
         ORDER BY i.occurred_at DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  tasks: {
    permission: 'tasks.read.daycare',
    title: 'Tasks',
    filename: 'tasks',
    sheet: 'Tasks',
    subtitle: 'Work to do',
    columns: [
      { key: 'title', label: 'Title', width: 36 },
      { key: 'priority', label: 'Priority', width: 10 },
      { key: 'status', label: 'Status', width: 12 },
      { key: 'assigned_to', label: 'Assigned to', width: 22 },
      { key: 'due_at', label: 'Due', format: 'date', width: 12 },
      { key: 'branch', label: 'Branch', width: 18 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT t.title, t.priority, t.status, u.display_name AS assigned_to, t.due_at,
                b.name AS branch
         FROM tasks t
         LEFT JOIN users u ON u.id = t.assigned_to
         LEFT JOIN branches b ON b.id = t.branch_id
         WHERE t.organisation_id = $1
         ORDER BY (t.due_at IS NULL), t.due_at ASC, t.created_at DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  leave: {
    permission: 'leave.read.daycare',
    title: 'Leave requests',
    filename: 'leave-requests',
    sheet: 'Leave',
    subtitle: 'Staff leave',
    columns: [
      { key: 'staff_name', label: 'Staff member', width: 24 },
      { key: 'leave_type', label: 'Type', width: 12 },
      { key: 'starts_on', label: 'From', format: 'date', width: 12 },
      { key: 'ends_on', label: 'To', format: 'date', width: 12 },
      { key: 'status', label: 'Status', width: 12 },
      { key: 'reason', label: 'Reason', width: 36 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT (u.display_name) AS staff_name, l.leave_type, l.starts_on, l.ends_on, l.status, l.reason
         FROM leave_requests l
         JOIN staff_profiles s ON s.id = l.staff_id
         LEFT JOIN users u ON u.id = s.user_id
         WHERE l.organisation_id = $1
         ORDER BY l.starts_on DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  timesheets: {
    permission: 'timesheets.read.daycare',
    title: 'Timesheets',
    filename: 'timesheets',
    sheet: 'Timesheets',
    subtitle: 'Hours worked',
    columns: [
      { key: 'staff_name', label: 'Staff member', width: 24 },
      { key: 'period_start', label: 'From', format: 'date', width: 12 },
      { key: 'period_end', label: 'To', format: 'date', width: 12 },
      { key: 'total_hours', label: 'Total hours', format: 'number', align: 'right', width: 14 },
      { key: 'overtime_hours', label: 'Overtime hours', format: 'number', align: 'right', width: 16 },
      { key: 'status', label: 'Status', width: 12 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT u.display_name AS staff_name, t.period_start, t.period_end,
                ROUND(t.total_minutes / 60.0, 2) AS total_hours,
                ROUND(t.overtime_minutes / 60.0, 2) AS overtime_hours, t.status
         FROM timesheets t
         JOIN staff_profiles s ON s.id = t.staff_id
         LEFT JOIN users u ON u.id = s.user_id
         WHERE t.organisation_id = $1
         ORDER BY t.period_start DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  audit: {
    permission: 'audit.read.daycare',
    title: 'Audit log',
    filename: 'audit',
    sheet: 'Audit',
    subtitle: 'Who did what, when and from where',
    columns: [
      { key: 'occurred_at', label: 'When', format: 'datetime', width: 20 },
      { key: 'actor', label: 'Actor', width: 28 },
      { key: 'action', label: 'Action', width: 34 },
      { key: 'resource_type', label: 'Resource', width: 18 },
      { key: 'ip_address', label: 'IP', width: 16 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT a.occurred_at, u.email AS actor, a.action, a.resource_type, a.ip_address
         FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id
         WHERE a.organisation_id = $1
         ORDER BY a.occurred_at DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  observations: {
    permission: 'assessments.read.daycare',
    title: 'Observations',
    filename: 'observations',
    sheet: 'Observations',
    subtitle: 'Observation records grouped by child',
    columns: [
      { key: 'child', label: 'Child', width: 24 },
      { key: 'objective_code', label: 'Objective', width: 16 },
      { key: 'domain', label: 'Domain', width: 22 },
      { key: 'observation_date', label: 'Date', format: 'date', width: 12 },
      { key: 'status', label: 'Status', width: 12 },
      { key: 'visibility_status', label: 'Visibility', width: 12 },
      { key: 'context', label: 'Context', width: 24 },
      { key: 'observation_text', label: 'Observation', width: 60 },
      { key: 'recorded_by', label: 'Recorded by', width: 22 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT (l.first_name || ' ' || l.last_name) AS child, ob.code AS objective_code,
                d.name AS domain, o.observation_date, o.assessment_status AS status, o.visibility_status,
                o.context, o.observation_text, u.display_name AS recorded_by
         FROM learner_observations o
         JOIN learners l ON l.id = o.learner_id
         LEFT JOIN learning_objectives ob ON ob.id = o.objective_id
         LEFT JOIN curriculum_domains d ON d.id = ob.domain_id
         LEFT JOIN users u ON u.id = o.recorded_by
         WHERE o.organisation_id = $1
         ORDER BY o.observation_date DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  'lesson-plans': {
    permission: 'curriculum.read.daycare',
    title: 'Lesson plans',
    filename: 'lesson-plans',
    sheet: 'Plans',
    subtitle: 'Lesson plans and their delivery status',
    columns: [
      { key: 'title', label: 'Plan', width: 30 },
      { key: 'theme', label: 'Theme', width: 18 },
      { key: 'classroom', label: 'Classroom', width: 20 },
      { key: 'branch', label: 'Branch', width: 20 },
      { key: 'status', label: 'Status', width: 12 },
      { key: 'published_at', label: 'Published', format: 'datetime', width: 18 },
      { key: 'delivered_at', label: 'Delivered', format: 'datetime', width: 18 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT lp.title, lp.theme, c.name AS classroom, b.name AS branch,
                lp.status, lp.published_at, lp.delivered_at
         FROM lesson_plans lp
         LEFT JOIN classrooms c ON c.id = lp.classroom_id
         LEFT JOIN branches b ON b.id = lp.branch_id
         WHERE lp.organisation_id = $1
         ORDER BY lp.created_at DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  'activity-participation': {
    permission: 'curriculum.read.daycare',
    title: 'Activity participation',
    filename: 'activity-participation',
    sheet: 'Participation',
    subtitle: 'Who attended each scheduled activity and how',
    columns: [
      { key: 'starts_at', label: 'When', format: 'datetime', width: 18 },
      { key: 'activity', label: 'Activity', width: 28 },
      { key: 'classroom', label: 'Classroom', width: 20 },
      { key: 'child', label: 'Child', width: 24 },
      { key: 'participation_status', label: 'Status', width: 16 },
      { key: 'observation_summary', label: 'Notes', width: 40 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT sa.starts_at, COALESCE(a.title, sa.title) AS activity, c.name AS classroom,
                (l.first_name || ' ' || l.last_name) AS child,
                ap.participation_status, ap.observation_summary
         FROM activity_participation ap
         JOIN scheduled_activities sa ON sa.id = ap.scheduled_activity_id
         LEFT JOIN activities a ON a.id = sa.activity_id
         LEFT JOIN classrooms c ON c.id = sa.classroom_id
         JOIN learners l ON l.id = ap.learner_id
         WHERE ap.organisation_id = $1
         ORDER BY sa.starts_at DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  'term-assessments': {
    permission: 'assessments.read.daycare',
    title: 'Term assessments',
    filename: 'term-assessments',
    sheet: 'Assessments',
    subtitle: 'Domain assessments per term',
    columns: [
      { key: 'learner', label: 'Child', width: 24 },
      { key: 'period', label: 'Period', width: 18 },
      { key: 'domain', label: 'Domain', width: 22 },
      { key: 'assessment_status', label: 'Status', width: 12 },
      { key: 'summary', label: 'Summary', width: 60 },
      { key: 'published_at', label: 'Published', format: 'datetime', width: 18 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT (l.first_name || ' ' || l.last_name) AS learner, ap.name AS period,
                d.name AS domain, la.assessment_status, la.summary, la.published_at
         FROM learner_assessments la
         JOIN learners l ON l.id = la.learner_id
         LEFT JOIN assessment_periods ap ON ap.id = la.assessment_period_id
         LEFT JOIN curriculum_domains d ON d.id = la.domain_id
         WHERE la.organisation_id = $1
         ORDER BY la.published_at DESC NULLS LAST, l.last_name LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  },

  'subscription-invoices': {
    permission: 'organisation.settings.manage',
    title: 'Subscription invoices',
    filename: 'subscription-invoices',
    sheet: 'Subscription',
    subtitle: 'Re-EL ECD plan invoices for your organisation',
    columns: [
      { key: 'invoice_number', label: 'Invoice', width: 18 },
      { key: 'period_start', label: 'Period from', format: 'date', width: 14 },
      { key: 'period_end', label: 'Period to', format: 'date', width: 14 },
      { key: 'amount', label: 'Amount', format: 'money', align: 'right', width: 12 },
      { key: 'currency', label: 'Currency', width: 8 },
      { key: 'status', label: 'Status', width: 10 },
      { key: 'due_at', label: 'Due', format: 'date', width: 12 },
      { key: 'payment_reference', label: 'Reference', width: 18 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT invoice_number, period_start, period_end, amount, currency, status, due_at, payment_reference
         FROM platform_subscription_invoices WHERE organisation_id = $1
         ORDER BY period_start DESC LIMIT $2`,
        [ctx.organisationId, MAX_ROWS]
      );
    }
  }
};

const platformResources = {
  settlements: {
    permission: 'platform.subscriptions.manage',
    title: 'Platform settlements',
    filename: 'settlements',
    sheet: 'Settlements',
    subtitle: 'Fees collected through the platform account, settled to tenants by EFT',
    columns: [
      { key: 'organisation', label: 'Organisation', width: 26 },
      { key: 'mode', label: 'Mode', width: 18 },
      { key: 'fee_percent', label: 'Fee %', format: 'number', align: 'right', width: 8 },
      { key: 'gross', label: 'Collected (ZAR)', format: 'money', align: 'right', width: 18 },
      { key: 'fees', label: 'Fees paid (ZAR)', format: 'money', align: 'right', width: 16 },
      { key: 'net', label: 'Settled (ZAR)', format: 'money', align: 'right', width: 16 },
      { key: 'outstanding', label: 'Outstanding (ZAR)', format: 'money', align: 'right', width: 17 }
    ],
    query(ctx) {
      return ctx.db.many(
        `WITH collected AS (
           SELECT organisation_id, COALESCE(SUM(amount), 0) AS gross
           FROM payment_intents
           WHERE status = 'paid'
             AND purpose IN ('invoice','statement','application_fee','form_payment')
             AND (metadata->>'settlement') IS DISTINCT FROM 'own_payfast'
           GROUP BY organisation_id
         ),
         settled AS (
           SELECT organisation_id, COALESCE(SUM(net_amount), 0) AS net, COALESCE(SUM(fee_amount), 0) AS fee
           FROM platform_payouts WHERE status = 'paid' GROUP BY organisation_id
         )
         SELECT o.name AS organisation,
                COALESCE(pha.mode, 'platform_collected') AS mode,
                COALESCE(pha.fee_percent, 0) AS fee_percent,
                COALESCE(c.gross, 0) AS gross,
                COALESCE(s.fee, 0) AS fees,
                COALESCE(s.net, 0) AS net,
                GREATEST(COALESCE(c.gross, 0) - COALESCE(s.net, 0) - COALESCE(s.fee, 0), 0) AS outstanding
         FROM organisations o
         LEFT JOIN collected c ON c.organisation_id = o.id
         LEFT JOIN settled s ON s.organisation_id = o.id
         LEFT JOIN organisation_payment_accounts pha ON pha.organisation_id = o.id
         WHERE o.slug <> 're-el-platform'
           AND (COALESCE(c.gross, 0) > 0 OR COALESCE(s.net, 0) > 0)
         ORDER BY o.name`
      );
    }
  },

  payouts: {
    permission: 'platform.subscriptions.manage',
    title: 'Settlement payouts',
    filename: 'payouts',
    sheet: 'Payouts',
    subtitle: 'Payments made to tenants by EFT',
    columns: [
      { key: 'paid_at', label: 'Paid', format: 'date', width: 12 },
      { key: 'organisation', label: 'Organisation', width: 26 },
      { key: 'period_start', label: 'From', format: 'date', width: 12 },
      { key: 'period_end', label: 'To', format: 'date', width: 12 },
      { key: 'gross_amount', label: 'Gross', format: 'money', align: 'right', width: 14 },
      { key: 'fee_amount', label: 'Fee', format: 'money', align: 'right', width: 12 },
      { key: 'net_amount', label: 'Net', format: 'money', align: 'right', width: 14 },
      { key: 'reference', label: 'Reference', width: 18 },
      { key: 'status', label: 'Status', width: 8 }
    ],
    query(ctx) {
      const params = [];
      let where = '1 = 1';
      if (ctx.query.organisationId && /^[0-9a-f-]{36}$/i.test(String(ctx.query.organisationId))) {
        params.push(String(ctx.query.organisationId));
        where += ' AND p.organisation_id = $1';
      }
      return ctx.db.many(
        `SELECT p.paid_at::date AS paid_at, o.name AS organisation, p.period_start, p.period_end,
                p.gross_amount, p.fee_amount, p.net_amount, p.reference, p.status
         FROM platform_payouts p JOIN organisations o ON o.id = p.organisation_id
         WHERE ${where}
         ORDER BY p.paid_at DESC LIMIT $` + (params.length + 1),
        params.concat([MAX_ROWS])
      );
    }
  },

  'platform-audit': {
    permission: 'platform.audit.read',
    title: 'Platform audit log',
    filename: 'platform-audit',
    sheet: 'Audit',
    subtitle: 'Every privileged action across all tenants',
    columns: [
      { key: 'occurred_at', label: 'When', format: 'datetime', width: 20 },
      { key: 'actor', label: 'Actor', width: 28 },
      { key: 'action', label: 'Action', width: 34 },
      { key: 'resource_type', label: 'Resource', width: 18 },
      { key: 'organisation', label: 'Tenant', width: 24 },
      { key: 'ip_address', label: 'IP', width: 16 }
    ],
    query(ctx) {
      return ctx.db.many(
        `SELECT a.occurred_at, u.email AS actor, a.action, a.resource_type, o.name AS organisation, a.ip_address
         FROM audit_events a
         LEFT JOIN users u ON u.id = a.actor_user_id
         LEFT JOIN organisations o ON o.id = a.organisation_id
         ORDER BY a.occurred_at DESC LIMIT $1`,
        [MAX_ROWS]
      );
    }
  }
};

function render(resource, ctx, organisationName) {
  const requested = String(ctx.query.format || 'csv').toLowerCase();
  const format = ['csv', 'xlsx', 'pdf'].includes(requested) ? requested : 'csv';
  const rows = resource.rows;
  const title = resource.title;
  const filename = resource.filename || 'export';
  if (format === 'csv') {
    return {
      buffer: exportService.toCsv(resource.columns, rows),
      type: 'text/csv; charset=utf-8',
      ext: 'csv'
    };
  }
  if (format === 'xlsx') {
    return {
      buffer: exportService.toXlsx(resource.columns, rows, resource.sheet || resource.title),
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx'
    };
  }
  return {
    buffer: exportService.toPdf({
      title,
      subtitle: (resource.subtitle || '') + (organisationName ? ' — ' + organisationName : ''),
      columns: resource.columns,
      rows,
      footer: 'Re-EL ECD — ' + (organisationName || 'Platform'),
      generatedAt: new Date()
    }),
    type: 'application/pdf',
    ext: 'pdf'
  };
}

function register(router) {
  async function respond(ctx, resource, isPlatform) {
    const access = isPlatform ? ctx.platformAccess : ctx.access;
    if (!access || !hasPermission(access.permissions, resource.permission)) {
      throw new AppError('FORBIDDEN');
    }
    const rows = await resource.query(ctx);
    const organisation = isPlatform ? null : await ctx.db.one('SELECT name FROM organisations WHERE id = $1', [ctx.organisationId]);
    const organisationName = organisation ? organisation.name : null;
    const rendered = render(Object.assign({}, resource, { rows }), ctx, organisationName);
    await recordAudit(ctx.db, ctx, {
      action: isPlatform ? 'platform.exported' : 'export.created',
      resourceType: 'export',
      resourceId: null,
      organisationId: isPlatform ? null : ctx.organisationId,
      metadata: { resource: ctx.params.resource, format: String(ctx.query.format || 'csv').toLowerCase(), rowCount: rows.length }
    });
    ctx.rawResponse = true;
    const safe = String(resource.filename || 'export').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    ctx.res.statusCode = 200;
    ctx.res.setHeader('Content-Type', rendered.type);
    ctx.res.setHeader('Content-Disposition', 'attachment; filename="re-el-' + safe + '.' + rendered.ext + '"');
    ctx.res.setHeader('Cache-Control', 'no-store');
    ctx.res.end(rendered.buffer);
  }

  router.get('/exports/:resource', async (ctx) => {
    const resource = tenantResources[ctx.params.resource];
    if (!resource) throw new AppError('NOT_FOUND');
    await respond(ctx, resource, false);
  }, { authenticated: true });

  router.get('/exports/platform/:resource', async (ctx) => {
    const resource = platformResources[ctx.params.resource];
    if (!resource) throw new AppError('NOT_FOUND');
    await respond(ctx, resource, true);
  }, { platformOnly: true, authenticated: true });
}

module.exports = { register };
