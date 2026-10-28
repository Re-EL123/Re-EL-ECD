'use strict';

/** Canonical enumerations shared by the API and the frontend. */
const ENUMS = {
  USER_STATUS: ['invited', 'active', 'suspended', 'disabled'],
  ORG_STATUS: ['onboarding', 'active', 'suspended', 'archived'],
  SUBSCRIPTION_STATUS: ['trial', 'active', 'past_due', 'cancelled'],
  MEMBERSHIP_STATUS: ['invited', 'active', 'suspended', 'revoked'],
  LEARNER_STATUS: ['applicant', 'enrolled', 'waitlisted', 'withdrawn', 'completed', 'archived'],
  ATTENDANCE_STATUS: ['expected', 'present', 'late', 'absent', 'excused', 'collected'],
  ENQUIRY_STATUS: ['new', 'contacted', 'converted', 'closed', 'spam'],
  APPLICATION_STATUS: ['submitted', 'under_review', 'approved', 'waitlisted', 'rejected', 'enrolled'],
  LESSON_STATUS: ['draft', 'submitted', 'approved', 'published', 'in_progress', 'completed', 'evaluated', 'cancelled'],
  OBSERVATION_STATUS: ['draft', 'submitted', 'reviewed', 'published', 'amended'],
  INVOICE_STATUS: ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void', 'cancelled', 'written_off'],
  PAYMENT_STATUS: ['pending', 'confirmed', 'reconciled', 'failed', 'reversed'],
  PAYMENT_METHOD: ['eft', 'cash', 'card', 'debit_order', 'snapscan', 'other'],
  SHIFT_STATUS: ['draft', 'scheduled', 'approved', 'completed', 'cancelled'],
  STAFF_EVENT_TYPE: ['clock_in', 'clock_out', 'break_start', 'break_end'],
  TIMESHEET_STATUS: ['draft', 'submitted', 'approved', 'rejected'],
  LEAVE_STATUS: ['pending', 'approved', 'rejected', 'cancelled'],
  LEAVE_TYPE: ['annual', 'sick', 'family', 'study', 'unpaid', 'maternity'],
  INCIDENT_STATUS: ['reported', 'reviewed', 'action_assigned', 'follow_up', 'closed'],
  SEVERITY: ['low', 'medium', 'high', 'critical'],
  TASK_STATUS: ['open', 'in_progress', 'blocked', 'done', 'cancelled'],
  PRIORITY: ['low', 'medium', 'high', 'urgent'],
  FORM_STATUS: ['draft', 'published', 'archived'],
  SUBMISSION_STATUS: ['received', 'under_review', 'approved', 'rejected', 'archived'],
  CONSENT_STATUS: ['granted', 'withdrawn', 'pending'],
  ANNOUNCEMENT_STATUS: ['draft', 'published', 'archived'],
  NOTIFICATION_CHANNEL: ['in_app', 'email', 'sms'],
  EXPENSE_STATUS: ['draft', 'submitted', 'approved', 'rejected', 'paid'],
  INVENTORY_TX: ['received', 'issued', 'adjustment', 'write_off'],
  WEBSITE_STATUS: ['draft', 'published', 'unpublished'],
  AUDIT: []
};

const PLATFORM_DOMAIN = 're-el-ecd.local';

module.exports = { ENUMS, PLATFORM_DOMAIN };
