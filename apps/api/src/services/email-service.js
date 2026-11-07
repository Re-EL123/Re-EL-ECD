'use strict';

/**
 * Transactional email through Resend.
 *
 * Every send is recorded in `email_deliveries` before and after the provider
 * call, so the platform console can answer "was this actually delivered?".
 * Email is best-effort by design: a provider outage must never fail an
 * invitation, an invoice or a payment webhook, so `sendEmail` never throws.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Re-EL ECD <no-reply@re-el.co.za>';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY) && process.env.EMAIL_ENABLED !== 'false';
}

function fromAddress() {
  return process.env.EMAIL_FROM || DEFAULT_FROM;
}

function appBaseUrl() {
  const configured = process.env.APP_BASE_URL
    || (process.env.FRONTEND_ORIGIN || '').split(',')[0]
    || 'https://ecd.re-el.co.za';
  return String(configured).trim().replace(/\/+$/, '');
}

function appLink(path) {
  if (!path) return appBaseUrl();
  if (/^https?:\/\//i.test(path)) return path;
  return appBaseUrl() + (path.startsWith('/') ? path : '/' + path);
}

function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(amount, currency) {
  const value = Number(amount || 0);
  const symbol = currency === 'ZAR' || !currency ? 'R' : currency + ' ';
  return symbol + value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function layout({ heading, intro, rows = [], body = '', ctaLabel, ctaUrl, footer, accent = '#3A7D44', brand = null }) {
  const brandName = (brand && brand.name) || 'Re-EL ECD';
  const brandLogo = brand && brand.logoUrl ? absoluteUrl(brand.logoUrl) : null;
  const accentColour = (brand && brand.accent) || accent;
  const rowHtml = rows.filter((row) => row && row.value !== undefined && row.value !== null && row.value !== '').map((row) =>
    '<tr><td style="padding:6px 0;color:#5d6b5f;font-size:13px">' + esc(row.label) + '</td>' +
    '<td style="padding:6px 0;color:#1f2a22;font-size:13px;text-align:right;font-weight:600">' + esc(row.value) + '</td></tr>'
  ).join('');
  const header = brandLogo
    ? '<tr><td style="background:' + accentColour + ';padding:14px 24px">' +
      '<img src="' + esc(brandLogo) + '" alt="' + esc(brandName) + '" height="36" style="height:36px;max-width:200px;object-fit:contain;display:block;background:#ffffff;border-radius:8px;padding:4px">' +
      '</td></tr>'
    : '<tr><td style="background:' + accentColour + ';padding:18px 24px;color:#ffffff;font-size:15px;font-weight:600;letter-spacing:.01em">' + esc(brandName) + '</td></tr>';
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f3;font-family:Inter,Helvetica,Arial,sans-serif">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f3;padding:28px 12px">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8df">' +
    header +
    '<tr><td style="padding:26px 24px 8px">' +
    '<h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#16211a">' + esc(heading) + '</h1>' +
    '<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#46524a">' + esc(intro) + '</p>' +
    (body ? '<div style="font-size:14px;line-height:1.6;color:#46524a">' + body + '</div>' : '') +
    (rowHtml ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;border-top:1px solid #eef1ec">' + rowHtml + '</table>' : '') +
    (ctaLabel && ctaUrl ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 6px"><tr><td style="border-radius:10px;background:' + accentColour + '">' +
      '<a href="' + esc(ctaUrl) + '" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600">' + esc(ctaLabel) + '</a>' +
      '</td></tr></table>' : '') +
    '<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#8a968c">' + esc(footer || 'You are receiving this because of your role at an ECD centre using Re-EL ECD.') + '</p>' +
    '</td></tr>' +
    '<tr><td style="padding:16px 24px 22px;border-top:1px solid #eef1ec;font-size:11px;color:#9aa69c">' + esc((brand && brand.footer) || (brandName + ' · Early childhood, elevated.')) + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function absoluteUrl(value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return appBaseUrl() + (value.startsWith('/') ? value : '/' + value);
}

function plain(lines) {
  return lines.filter(Boolean).join('\n');
}

async function recordDelivery(db, entry) {
  try {
    const row = await db.one(
      `INSERT INTO email_deliveries (organisation_id, recipient, subject, template, provider,
        provider_message_id, status, error, metadata, sent_at)
       VALUES ($1,$2,$3,$4,'resend',$5,$6,$7,$8,$9) RETURNING id`,
      [entry.organisationId || null, entry.to, String(entry.subject).slice(0, 300),
        entry.template || null, entry.providerMessageId || null, entry.status,
        entry.error ? String(entry.error).slice(0, 1000) : null,
        JSON.stringify(entry.metadata || {}), entry.sentAt || null]
    );
    return row ? row.id : null;
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', message: 'email delivery log failed', error: error.message }));
    return null;
  }
}

/**
 * Send one message. Returns a delivery record summary and never throws.
 */
async function sendEmail(db, options) {
  const { to, subject, html, text, template, organisationId, metadata, replyTo } = options;
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) {
    return { status: 'skipped', reason: 'invalid recipient' };
  }
  if (!isConfigured()) {
    await recordDelivery(db, { to, subject, template, organisationId, status: 'skipped', metadata: { ...metadata, reason: 'no provider configured' } });
    return { status: 'skipped', reason: 'no provider configured' };
  }
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [String(to)],
        subject,
        html,
        text: text || undefined,
        reply_to: replyTo || process.env.EMAIL_REPLY_TO || undefined
      }),
      signal: AbortSignal.timeout(Number(process.env.EMAIL_TIMEOUT_MS || 10000))
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = (payload && (payload.message || payload.error)) || ('HTTP ' + response.status);
      await recordDelivery(db, { to, subject, template, organisationId, status: 'failed', error: message, metadata });
      return { status: 'failed', error: message };
    }
    await recordDelivery(db, {
      to, subject, template, organisationId, status: 'sent',
      providerMessageId: payload.id || null, sentAt: new Date().toISOString(), metadata
    });
    return { status: 'sent', id: payload.id || null };
  } catch (error) {
    await recordDelivery(db, { to, subject, template, organisationId, status: 'failed', error: error.message, metadata });
    return { status: 'failed', error: error.message };
  }
}

const templates = {
  welcome(data) {
    const url = appLink('/#/reset-password?token=' + encodeURIComponent(data.token));
    return {
      subject: 'Welcome to Re-EL ECD — ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'Welcome, ' + data.ownerName,
        intro: data.organisationName + ' has been created on Re-EL ECD. Choose a password to finish setting up your centre.',
        rows: [{ label: 'Organisation', value: data.organisationName }, { label: 'Your role', value: 'Owner' }],
        ctaLabel: 'Choose your password',
        ctaUrl: url,
        footer: 'This link expires in one hour. If it expires, use “Forgot password” on the sign-in page.'
      }),
      text: plain(['Welcome to Re-EL ECD, ' + data.organisationName, 'Choose your password: ' + url])
    };
  },

  signupWelcome(data) {
    const url = appLink('/#/login');
    return {
      subject: 'Your Re-EL ECD centre is ready — ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'Welcome, ' + data.ownerName,
        intro: data.organisationName + ' now has a Re-EL ECD workspace with a 30-day trial. Sign in with the email and password you chose to start setting up your centre.',
        rows: [{ label: 'Organisation', value: data.organisationName }, { label: 'Your role', value: 'Owner' }],
        ctaLabel: 'Sign in to Re-EL ECD',
        ctaUrl: url,
        footer: 'If you did not sign up for this, ignore this email — no account will be used without an owner signing in.'
      }),
      text: plain(['Your Re-EL ECD centre is ready: ' + data.organisationName, 'Sign in: ' + url])
    };
  },

  invitation(data) {
    const url = appLink('/#/accept-invite?token=' + encodeURIComponent(data.token));
    return {
      subject: 'You are invited to ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'Join ' + data.organisationName,
        intro: (data.inviterName ? data.inviterName + ' invited you' : 'You have been invited') +
          ' to ' + data.organisationName + ' on Re-EL ECD as ' + data.roleLabel + '.',
        rows: [{ label: 'Role', value: data.roleLabel }, { label: 'Invitation expires', value: data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('en-ZA') : '7 days' }],
        ctaLabel: 'Accept invitation',
        ctaUrl: url,
        footer: 'If you were not expecting this invitation you can ignore this email.'
      }),
      text: plain(['Join ' + data.organisationName, 'Role: ' + data.roleLabel, 'Accept: ' + url])
    };
  },

  passwordReset(data) {
    const url = appLink('/#/reset-password?token=' + encodeURIComponent(data.token));
    return {
      subject: 'Reset your Re-EL ECD password',
      html: layout({
        brand: data.brand,
        heading: 'Reset your password',
        intro: 'Use the button below to choose a new password. The link expires in one hour and can only be used once.',
        ctaLabel: 'Choose a new password',
        ctaUrl: url,
        footer: 'If you did not ask for a reset, no action is needed — your password has not changed.'
      }),
      text: plain(['Reset your password: ' + url, 'This link expires in one hour.'])
    };
  },

  enquiryReceived(data) {
    return {
      subject: 'New website enquiry: ' + data.guardianName,
      html: layout({
        brand: data.brand,
        heading: 'New enquiry from the website',
        intro: (data.childName ? data.childName + ' — ' : '') + 'submitted by ' + data.guardianName + '.',
        rows: [
          { label: 'Email', value: data.email },
          { label: 'Phone', value: data.phone },
          { label: 'Preferred start', value: data.preferredStartDate },
          { label: 'Message', value: data.message }
        ],
        ctaLabel: 'Open admissions',
        ctaUrl: appLink('/#/app/admissions')
      }),
      text: plain(['New enquiry from ' + data.guardianName, data.email, data.phone, data.message])
    };
  },

  enquiryAcknowledgement(data) {
    return {
      subject: 'We received your enquiry — ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'Thank you, ' + data.guardianName,
        intro: 'Your enquiry has reached ' + data.organisationName + '. The admissions team will be in touch shortly.',
        rows: [{ label: 'Child', value: data.childName }, { label: 'Preferred start', value: data.preferredStartDate }],
        ctaLabel: 'Visit our website',
        ctaUrl: appLink('/#/site/' + encodeURIComponent(data.slug)),
        footer: 'You are receiving this because you submitted an enquiry on our website.'
      }),
      text: plain(['Thank you ' + data.guardianName + ', your enquiry has reached ' + data.organisationName + '.'])
    };
  },

  formSubmission(data) {
    return {
      subject: 'Form submitted: ' + data.formName,
      html: layout({
        brand: data.brand,
        heading: 'A form was submitted',
        intro: data.submittedBy + ' submitted ' + data.formName + '.',
        rows: [{ label: 'Form', value: data.formName }, { label: 'Submitted by', value: data.submittedBy }],
        ctaLabel: 'Review submission',
        ctaUrl: appLink('/#/app/forms')
      }),
      text: plain(['Form submitted: ' + data.formName, 'By: ' + data.submittedBy])
    };
  },

  announcement(data) {
    return {
      subject: data.title,
      html: layout({
        brand: data.brand,
        heading: data.title,
        intro: data.organisationName + ' posted an announcement.',
        body: '<p style="white-space:pre-wrap">' + esc(data.body) + '</p>',
        ctaLabel: 'Open Re-EL ECD',
        ctaUrl: appLink(data.url || '/#/app/communications')
      }),
      text: plain([data.title, data.body])
    };
  },

  subscriptionReminder(data) {
    return {
      subject: 'Your Re-EL ECD subscription is overdue — ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'Subscription payment due',
        intro: data.organisationName + ' is on the ' + data.planName + ' plan. The current period ended on ' + data.dueDate + ' and the subscription is still unpaid.',
        rows: [
          { label: 'Plan', value: data.planName },
          { label: 'Amount', value: (data.currency || 'ZAR') + ' ' + data.amount },
          { label: 'Current period ended', value: data.dueDate }
        ],
        ctaLabel: 'Pay your subscription',
        ctaUrl: appLink(data.ctaUrl || '/#/app/settings?tab=billing')
      }),
      text: plain([
        'Subscription payment due',
        data.organisationName + ' is on the ' + data.planName + ' plan.',
        'Amount: ' + (data.currency || 'ZAR') + ' ' + data.amount,
        'Current period ended: ' + data.dueDate,
        'Pay now: ' + appLink(data.ctaUrl || '/#/app/settings?tab=billing')
      ])
    };
  },

  invoiceIssued(data) {
    return {
      subject: 'Invoice ' + data.invoiceNumber + ' from ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'Invoice ' + data.invoiceNumber,
        intro: 'An invoice has been issued for ' + (data.learnerName || 'your child') + '.',
        rows: [
          { label: 'Amount due', value: money(data.amount, data.currency) },
          { label: 'Already paid', value: money(data.paid, data.currency) },
          { label: 'Due date', value: data.dueDate }
        ],
        ctaLabel: data.payUrl ? 'Pay online' : 'View invoice',
        ctaUrl: data.payUrl || data.viewUrl,
        footer: 'Online payments are processed securely by PayFast. The invoice is settled once the payment clears.'
      }),
      text: plain(['Invoice ' + data.invoiceNumber, 'Amount due: ' + money(data.amount, data.currency), data.payUrl || data.viewUrl])
    };
  },

  paymentReceipt(data) {
    return {
      subject: 'Payment received — ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'Thank you, payment received',
        intro: 'We have recorded your payment' + (data.invoiceNumber ? ' against invoice ' + data.invoiceNumber : '') + '.',
        rows: [
          { label: 'Amount', value: money(data.amount, data.currency) },
          { label: 'Method', value: data.method },
          { label: 'Reference', value: data.reference },
          { label: 'Date', value: data.paidAt }
        ],
        ctaLabel: 'View your account',
        ctaUrl: appLink('/#/parent/finance'),
        footer: 'Keep this email as your receipt.'
      }),
      text: plain(['Payment received: ' + money(data.amount, data.currency), 'Reference: ' + data.reference])
    };
  },

  applicationFee(data) {
    return {
      subject: 'Application fee for ' + (data.childName || 'your child') + ' — ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'Application fee',
        intro: 'Hello ' + (data.guardianName || 'there') + ', an application fee of ' +
          money(data.amount, data.currency) + ' is due for ' + (data.childName || 'your application') + '.',
        rows: [
          { label: 'Reference', value: data.reference },
          { label: 'Amount', value: money(data.amount, data.currency) }
        ],
        ctaLabel: 'Pay application fee',
        ctaUrl: data.payUrl || appLink('/'),
        footer: 'Online payments are processed securely by PayFast. Your place is confirmed once the fee clears.'
      }),
      text: plain([
        'Application fee: ' + money(data.amount, data.currency),
        'Reference: ' + data.reference,
        data.payUrl || ''
      ])
    };
  },

  incidentAlert(data) {
    return {
      subject: '[' + String(data.severity).toUpperCase() + '] Incident reported — ' + data.learnerName,
      html: layout({
        brand: data.brand,
        heading: 'Incident reported',
        intro: data.summary,
        rows: [
          { label: 'Learner', value: data.learnerName },
          { label: 'Severity', value: data.severity },
          { label: 'Reported by', value: data.reportedBy },
          { label: 'Occurred', value: data.occurredAt }
        ],
        ctaLabel: 'Open safety register',
        ctaUrl: appLink('/#/app/safety'),
        accent: '#B45309'
      }),
      text: plain(['Incident: ' + data.learnerName, data.severity, data.summary])
    };
  },

  leaveDecision(data) {
    return {
      subject: 'Leave request ' + data.status,
      html: layout({
        brand: data.brand,
        heading: 'Your leave request was ' + data.status,
        intro: 'Hello ' + data.staffName + ', your ' + data.leaveType + ' leave request has been ' + data.status + '.',
        rows: [
          { label: 'Dates', value: data.dates },
          { label: 'Decision by', value: data.reviewer },
          { label: 'Note', value: data.note }
        ],
        ctaLabel: 'View leave',
        ctaUrl: appLink('/#/app/leave')
      }),
      text: plain(['Leave request ' + data.status, data.dates])
    };
  },

  admissionDecision(data) {
    const decisionLabel = data.decision === 'approved' ? 'approved'
      : data.decision === 'rejected' || data.decision === 'declined' ? 'declined'
        : data.decision === 'waitlisted' ? 'waitlisted'
          : data.decision === 'under_review' ? 'under review'
            : String(data.decision || 'updated');
    const subject = data.decision === 'under_review'
      ? 'Update on your application for ' + (data.childName || 'your child')
      : 'Your application for ' + (data.childName || 'your child') + ' was ' + decisionLabel;
    return {
      subject,
      html: layout({
        brand: data.brand,
        heading: 'Application ' + decisionLabel,
        intro: 'Hello ' + (data.guardianName || 'there') + ', the application for ' +
          (data.childName || 'your child') + ' at ' + data.organisationName + ' has been ' + decisionLabel + '.',
        rows: [
          { label: 'Child', value: data.childName },
          { label: 'Decision', value: decisionLabel },
          { label: 'Note', value: data.note }
        ],
        ctaLabel: 'View admissions',
        ctaUrl: appLink('/#/app/admissions'),
        footer: data.decision === 'approved'
          ? 'Reply to this email if you would like to confirm the place or arrange a visit.'
          : 'Reply to this email if you have any questions about this decision.'
      }),
      text: plain(['Application ' + decisionLabel + ' for ' + (data.childName || 'your child'), data.note])
    };
  },

  enrolmentConfirmed(data) {
    return {
      subject: 'Welcome to ' + data.organisationName + ' — ' + data.childName + ' is enrolled',
      html: layout({
        brand: data.brand,
        heading: 'Enrolment confirmed',
        intro: 'Hello ' + (data.guardianName || 'there') + ', ' + data.childName +
          ' has been enrolled at ' + data.organisationName + '.',
        rows: [
          { label: 'Child', value: data.childName },
          { label: 'Classroom', value: data.classroomName },
          { label: 'Start date', value: data.startDate }
        ],
        ctaLabel: 'Open the family portal',
        ctaUrl: appLink('/#/parent'),
        footer: 'We look forward to welcoming your family.'
      }),
      text: plain(['Enrolment confirmed for ' + data.childName, data.startDate ? 'Start date: ' + data.startDate : ''])
    };
  },

  progressPublished(data) {
    return {
      subject: 'New observation for ' + data.childName,
      html: layout({
        brand: data.brand,
        heading: 'A new observation was shared',
        intro: 'Hello ' + (data.guardianName || 'there') + ', ' + data.organisationName +
          ' shared a learning update for ' + data.childName + '.',
        rows: [
          { label: 'Learning area', value: data.area },
          { label: 'Recorded', value: data.observedAt },
          { label: 'Note', value: data.summary }
        ],
        ctaLabel: 'View progress',
        ctaUrl: appLink('/#/parent/progress'),
        footer: 'Observations are private to your family and your centre.'
      }),
      text: plain(['New observation for ' + data.childName, data.summary])
    };
  },

  incidentGuardianNotice(data) {
    return {
      subject: 'Update about ' + data.childName + ' — ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'A note about your child',
        intro: 'Hello ' + (data.guardianName || 'there') + ', ' + data.organisationName +
          ' recorded the following for ' + data.childName + '.',
        rows: [
          { label: 'Learner', value: data.childName },
          { label: 'Severity', value: data.severity },
          { label: 'Occurred', value: data.occurredAt },
          { label: 'Action taken', value: data.actions }
        ],
        body: data.summary ? '<p style="white-space:pre-wrap">' + esc(data.summary) + '</p>' : '',
        ctaLabel: 'Open the family portal',
        ctaUrl: appLink('/#/parent'),
        accent: '#B45309',
        footer: 'Please reply to this email if you would like to speak with a member of our team.'
      }),
      text: plain(['Note about ' + data.childName, data.severity, data.summary])
    };
  },

  leaveRequested(data) {
    return {
      subject: data.staffName + ' requested ' + data.leaveType + ' leave',
      html: layout({
        brand: data.brand,
        heading: 'Leave request awaiting your review',
        intro: 'Hello ' + (data.approverName || 'there') + ', ' + data.staffName +
          ' submitted a ' + data.leaveType + ' leave request.',
        rows: [
          { label: 'Staff member', value: data.staffName },
          { label: 'Dates', value: data.dates },
          { label: 'Reason', value: data.reason }
        ],
        ctaLabel: 'Review request',
        ctaUrl: appLink('/#/app/leave')
      }),
      text: plain([data.staffName + ' requested ' + data.leaveType + ' leave', data.dates])
    };
  },

  shiftAssigned(data) {
    return {
      subject: 'You are rostered on ' + data.date,
      html: layout({
        brand: data.brand,
        heading: 'New shift assigned',
        intro: 'Hello ' + (data.staffName || 'there') + ', you have been added to the roster.',
        rows: [
          { label: 'Date', value: data.date },
          { label: 'Role', value: data.role },
          { label: 'Time', value: data.time },
          { label: 'Branch', value: data.branchName }
        ],
        ctaLabel: 'View my shifts',
        ctaUrl: appLink('/#/app/shifts')
      }),
      text: plain(['Shift on ' + data.date, data.time, data.role])
    };
  },

  formReviewed(data) {
    const statusLabel = data.status === 'approved' ? 'approved'
      : data.status === 'rejected' ? 'rejected'
        : data.status === 'needs_changes' ? 'sent back for changes'
          : data.status === 'under_review' ? 'under review'
            : String(data.status || 'reviewed');
    return {
      subject: data.status === 'under_review'
        ? data.formName + ' is under review'
        : data.formName + ' was ' + statusLabel,
      html: layout({
        brand: data.brand,
        heading: 'Form ' + statusLabel,
        intro: 'Hello ' + (data.recipientName || 'there') + ', ' + (data.reviewerName || 'Your centre') +
          ' reviewed ' + data.formName + '.',
        rows: [
          { label: 'Form', value: data.formName },
          { label: 'Status', value: statusLabel },
          { label: 'Reviewed by', value: data.reviewerName },
          { label: 'Note', value: data.note }
        ],
        ctaLabel: 'Open forms',
        ctaUrl: appLink('/#/app/forms')
      }),
      text: plain([data.formName + ' was ' + statusLabel, data.note])
    };
  },

  manualPaymentReceipt(data) {
    return {
      subject: 'Payment recorded — ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'Payment recorded',
        intro: 'Hello ' + (data.payerName || 'there') + ', we recorded a payment' +
          (data.learnerName ? ' for ' + data.learnerName : '') + '.',
        rows: [
          { label: 'Amount', value: money(data.amount, data.currency) },
          { label: 'Method', value: data.method },
          { label: 'Reference', value: data.reference },
          { label: 'Recorded by', value: data.recordedBy },
          { label: 'Date', value: data.paidAt }
        ],
        ctaLabel: 'View your account',
        ctaUrl: appLink('/#/parent/finance'),
        footer: 'Keep this email as your receipt.'
      }),
      text: plain(['Payment recorded: ' + money(data.amount, data.currency), 'Reference: ' + data.reference])
    };
  },

  invoiceReminder(data) {
    const overdue = Number(data.daysOverdue || 0) > 0;
    return {
      subject: (overdue ? 'Overdue: invoice ' : 'Reminder: invoice ') + data.invoiceNumber +
        ' — ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: overdue ? 'Invoice overdue' : 'Friendly payment reminder',
        intro: 'Hello ' + (data.guardianName || 'there') + ', invoice ' + data.invoiceNumber +
          (data.learnerName ? ' for ' + data.learnerName : '') +
          (overdue ? ' is now ' + data.daysOverdue + ' day(s) overdue.' : ' is due on ' + (data.dueDate || 'the due date') + '.'),
        rows: [
          { label: 'Invoice', value: data.invoiceNumber },
          { label: 'Amount due', value: money(data.amount, data.currency) },
          { label: 'Due date', value: data.dueDate }
        ],
        ctaLabel: data.payUrl ? 'Pay online' : 'View invoice',
        ctaUrl: data.payUrl || appLink('/#/parent/finance'),
        footer: 'Online payments are processed securely by PayFast.'
      }),
      text: plain(['Invoice ' + data.invoiceNumber, 'Amount due: ' + money(data.amount, data.currency), data.payUrl || ''])
    };
  },

  statementReady(data) {
    const count = Number(data.invoiceCount || 0);
    return {
      subject: 'Your account statement — ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'Your account statement',
        intro: 'Hello ' + (data.guardianName || 'there') + ', you have ' + count +
          ' open invoice' + (count === 1 ? '' : 's') + ' totalling ' +
          money(data.amount, data.currency) + '.',
        rows: [
          { label: 'Invoices', value: String(count) },
          { label: 'Amount due', value: money(data.amount, data.currency) }
        ],
        ctaLabel: data.payUrl ? 'Pay statement online' : 'View your account',
        ctaUrl: data.payUrl || appLink('/#/parent/finance'),
        footer: 'Online payments are processed securely by PayFast. One payment settles every invoice listed.'
      }),
      text: plain([
        'Statement total: ' + money(data.amount, data.currency),
        count + ' open invoice(s)',
        data.payUrl || 'Sign in to view your account.'
      ])
    };
  },

  passwordChanged(data) {
    return {
      subject: 'Your Re-EL ECD password was changed',
      html: layout({
        brand: data.brand,
        heading: 'Your password was changed',
        intro: 'Hello ' + (data.name || 'there') + ', the password for your Re-EL ECD account was changed' +
          (data.at ? ' on ' + data.at : '') + '.',
        rows: [
          { label: 'When', value: data.at },
          { label: 'Device', value: data.device }
        ],
        ctaLabel: 'Sign in',
        ctaUrl: appLink('/#/login'),
        accent: '#B45309',
        footer: 'If you did not make this change, reset your password immediately and contact your centre administrator.'
      }),
      text: plain(['Your Re-EL ECD password was changed.', data.at || ''])
    };
  },

  invitationAccepted(data) {
    return {
      subject: (data.accepterName || data.accepterEmail) + ' joined ' + data.organisationName,
      html: layout({
        brand: data.brand,
        heading: 'Invitation accepted',
        intro: 'Hello ' + (data.inviterName || 'there') + ', ' +
          (data.accepterName || data.accepterEmail) + ' accepted your invitation to ' + data.organisationName + '.',
        rows: [
          { label: 'Member', value: data.accepterName || data.accepterEmail },
          { label: 'Email', value: data.accepterEmail },
          { label: 'Role', value: data.roleLabel }
        ],
        ctaLabel: 'Open users and access',
        ctaUrl: appLink('/#/app/access')
      }),
      text: plain([(data.accepterName || data.accepterEmail) + ' accepted the invitation to ' + data.organisationName])
    };
  },

  accessRevoked(data) {
    const statusLabel = data.status === 'suspended' ? 'suspended' : 'removed';
    return {
      subject: 'Your access to ' + data.organisationName + ' was ' + statusLabel,
      html: layout({
        brand: data.brand,
        heading: 'Access ' + statusLabel,
        intro: 'Hello ' + (data.name || 'there') + ', your access to ' + data.organisationName +
          ' has been ' + statusLabel + '.',
        rows: [
          { label: 'Changed by', value: data.changedBy },
          { label: 'When', value: data.at }
        ],
        footer: 'If you believe this is a mistake, contact your centre administrator.'
      }),
      text: plain(['Your access to ' + data.organisationName + ' was ' + statusLabel + '.'])
    };
  }
};

function build(template, data) {
  const factory = templates[template];
  if (!factory) throw new Error('Unknown email template: ' + template);
  return factory(data);
}

async function sendTemplate(db, template, { to, organisationId, data, replyTo, metadata }) {
  const payload = Object.assign({}, data);
  if (organisationId && !payload.brand) {
    try {
      const organisation = await db.one(
        `SELECT name, slug, logo_url, primary_colour, secondary_colour, accent_colour, theme_tokens
         FROM organisations WHERE id = $1`, [organisationId]
      );
      if (organisation) {
        const branding = require('./branding-service');
        const theme = branding.themeFromOrganisation(organisation);
        const platform = organisation.slug === 're-el-platform';
        payload.brand = {
          name: platform ? 'Re-EL ECD' : organisation.name,
          logoUrl: organisation.logo_url || (platform ? 'assets/branding/logo-re-el-ecd-wide.png' : null),
          accent: theme.primary,
          footer: platform ? 'Re-EL ECD · Early childhood, elevated.' : organisation.name + ' · Sent via Re-EL ECD.'
        };
      }
    } catch (error) {
      // Branding is decorative: an email must still send if the lookup fails.
    }
  }
  const message = build(template, payload);
  return sendEmail(db, {
    to, subject: message.subject, html: message.html, text: message.text,
    template, organisationId, replyTo, metadata
  });
}

module.exports = {
  isConfigured,
  fromAddress,
  appBaseUrl,
  appLink,
  sendEmail,
  sendTemplate,
  build,
  templates,
  layout,
  money
};
