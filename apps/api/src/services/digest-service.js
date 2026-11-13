'use strict';

/**
 * The Friday Family Digest: a short, warm email to every parent whose
 * membership allows it, summarising the week their child had at the centre.
 * Reuses the branded HTML layout used by every other Re-EL email.
 */

const { sendTemplate } = require('./email-service');
const { recordAudit } = require('./audit-service');

async function guardianMemberships(db, organisationId, { onlyUserId = null, includeOptedOut = false } = {}) {
  const params = [organisationId];
  let extra = '';
  if (!includeOptedOut) extra += ' AND COALESCE(m.email_digest, true) = true';
  if (onlyUserId) { params.push(onlyUserId); extra += ' AND m.user_id = $2'; }
  return db.many(
    `SELECT DISTINCT m.user_id, u.email, u.display_name
     FROM memberships m JOIN users u ON u.id = m.user_id
     JOIN membership_roles mr ON mr.membership_id = m.id
     JOIN roles r ON r.id = mr.role_id
     WHERE m.organisation_id = $1 AND m.status = 'active'
       AND r.role_key = 'parent_guardian'${extra}
       AND u.email IS NOT NULL`,
    params
  );
}

function firstPhotoUrl(value) {
  let list = value;
  if (typeof value === 'string') {
    try { list = JSON.parse(value); } catch { list = [value]; }
  }
  if (!Array.isArray(list)) return null;
  for (const url of list) {
    const text = String(url || '');
    if (/^https?:\/\//i.test(text)) return text;
  }
  return null;
}

/** The week's most vivid moment for a child (published/amended), or null. */
async function latestMoment(db, organisationId, learnerId) {
  return db.one(
    `SELECT o.id, o.observation_text, o.photo_urls, o.observation_date, o.context,
            d.name AS domain_name, u.display_name AS teacher_name
     FROM learner_observations o
     LEFT JOIN curriculum_domains d ON d.id = o.domain_id
     LEFT JOIN users u ON u.id = o.recorded_by
     WHERE o.organisation_id = $1 AND o.learner_id = $2
       AND o.assessment_status IN ('published','amended')
       AND o.observation_date >= CURRENT_DATE - interval '7 days'
     ORDER BY o.observation_date DESC, o.created_at DESC LIMIT 1`,
    [organisationId, learnerId]
  );
}

async function childrenOf(db, organisationId, userId) {
  return db.many(
    `SELECT l.id, l.first_name, l.last_name
     FROM learners l
     JOIN learner_guardians lg ON lg.learner_id = l.id AND lg.organisation_id = $1
     JOIN guardians g ON g.id = lg.guardian_id AND g.organisation_id = $1
     WHERE g.user_id = $2 AND lg.portal_access_status = 'active'
       AND (lg.ends_at IS NULL OR lg.ends_at >= CURRENT_DATE)
     ORDER BY l.first_name`,
    [organisationId, userId]
  );
}

async function weekStats(db, organisationId, learnerId) {
  const activities = await db.one(
    `SELECT COUNT(*)::int AS count FROM activity_participation ap
     JOIN scheduled_activities sa ON sa.id = ap.scheduled_activity_id AND sa.organisation_id = $1
     WHERE ap.learner_id = $2 AND sa.starts_at >= CURRENT_DATE - interval '7 days' AND sa.status != 'cancelled'`,
    [organisationId, learnerId]
  );
  const observations = await db.one(
    `SELECT COUNT(*)::int AS count FROM learner_observations
     WHERE organisation_id = $1 AND learner_id = $2 AND assessment_status IN ('published','amended')
       AND observation_date >= CURRENT_DATE - interval '7 days'`,
    [organisationId, learnerId]
  );
  const attendance = await db.one(
    `SELECT COUNT(CASE WHEN attendance_status IN ('present','late') THEN 1 END)::int AS present,
            COUNT(*)::int AS recorded
     FROM learner_attendance
     WHERE organisation_id = $1 AND learner_id = $2 AND attendance_date >= CURRENT_DATE - interval '7 days'`,
    [organisationId, learnerId]
  );
  return {
    activities: activities.count,
    observations: observations.count,
    attendancePresent: attendance.present,
    attendanceRecorded: attendance.recorded
  };
}

async function highlights(db, organisationId) {
  const top = await db.one(
    `SELECT sa.title, COUNT(*)::int AS count
     FROM activity_participation ap
     JOIN scheduled_activities sa ON sa.id = ap.scheduled_activity_id AND sa.organisation_id = $1
     WHERE sa.starts_at >= CURRENT_DATE - interval '7 days' AND sa.status != 'cancelled'
     GROUP BY sa.title ORDER BY count DESC LIMIT 1`,
    [organisationId]
  );
  return top && top.count ? top.title + ' — ' + top.count + ' children took part' : null;
}

function lineFor(stats) {
  const parts = [];
  if (stats.activities) parts.push(stats.activities + ' activities enjoyed');
  if (stats.observations) parts.push(stats.observations + ' observation' + (stats.observations === 1 ? '' : 's') + ' shared');
  if (stats.attendanceRecorded) parts.push(stats.attendancePresent + ' of ' + stats.attendanceRecorded + ' days at the centre');
  return parts.length ? parts.join(' · ') : 'A quiet but lovely week';
}

/** Build and send the digest for one organisation. Returns the number sent. */
async function sendWeeklyDigest(db, { organisation, triggeredBy, onlyUserId = null, includeOptedOut = false, preview = false } = {}) {
  const memberships = await guardianMemberships(db, organisation.id, { onlyUserId, includeOptedOut });
  const highlight = await highlights(db, organisation.id);
  let sent = 0;
  for (const membership of memberships) {
    const children = await childrenOf(db, organisation.id, membership.user_id);
    if (!children.length) continue;
    const childRows = [];
    for (const child of children) {
      const stats = await weekStats(db, organisation.id, child.id);
      const moment = await latestMoment(db, organisation.id, child.id);
      const firstName = child.first_name;
      childRows.push({
        id: child.id,
        firstName,
        name: child.first_name + ' ' + child.last_name,
        line: lineFor(stats),
        stats: {
          activities: stats.activities,
          observations: stats.observations,
          attendancePresent: stats.attendancePresent,
          attendanceRecorded: stats.attendanceRecorded
        },
        moment: moment && moment.observation_text
          ? {
            id: moment.id,
            text: String(moment.observation_text).split('\n')[0].slice(0, 220),
            photoUrl: firstPhotoUrl(moment.photo_urls),
            teacherFirst: String(moment.teacher_name || '').trim().split(' ')[0] || 'Your child’s teacher',
            date: moment.observation_date,
            domain: moment.domain_name || null
          }
          : null,
        link: '/#/parent/children/' + child.id + '?src=weekly-digest'
      });
    }
    const outstanding = await db.one(
      `SELECT COUNT(*)::int AS count FROM learners l
       JOIN learner_guardians lg ON lg.learner_id = l.id AND lg.organisation_id = $1
       JOIN guardians g ON g.id = lg.guardian_id
       JOIN invoices i ON i.learner_id = l.id AND i.status NOT IN ('draft','void','paid')
       WHERE g.user_id = $2 AND lg.portal_access_status = 'active'`,
      [organisation.id, membership.user_id]
    );
    const due = outstanding.count > 0;
    try {
      const result = await sendTemplate(db, 'weeklyDigest', {
        to: membership.email,
        organisationId: organisation.id,
        data: {
          organisationName: organisation.name,
          weekLabel: 'The week of ' + new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }),
          children: childRows,
          highlight,
          feesUrl: due ? '/#/parent/finance' : null,
          ctaUrl: '/#/parent/overview?src=weekly-digest',
          preview
        },
        metadata: { kind: 'weekly_digest', children: childRows.length, preview, triggeredBy: triggeredBy || 'schedule' }
      });
      if (result && result.status === 'sent') sent += 1;
    } catch (error) {
      // A failing email must not stop the rest of the cohort.
      console.warn(JSON.stringify({ level: 'warn', message: 'weekly digest email failed', organisationId: organisation.id, error: error.message }));
    }
  }
  return { recipients: memberships.length, sent };
}


// ---------------------------------------------------------------------------
// Monthly family digest: a branded one-page-per-child PDF of the month's
// published observations, emailed to guardians who opted in and can receive
// reports. This is the centre's proof of value delivered, not just sent.
// ---------------------------------------------------------------------------

const exportService = require('./export-service');

async function observationsThisMonth(db, organisationId, learnerId) {
  return db.many(
    `SELECT o.observation_date, o.context, o.observation_text,
            ob.code AS objective_code, d.name AS domain_name
     FROM learner_observations o
     LEFT JOIN learning_objectives ob ON ob.id = o.objective_id
     LEFT JOIN curriculum_domains d ON d.id = ob.domain_id
     WHERE o.organisation_id = $1 AND o.learner_id = $2
       AND o.assessment_status IN ('published','amended')
       AND o.observation_date >= date_trunc('month', CURRENT_DATE)
     ORDER BY o.observation_date DESC`,
    [organisationId, learnerId]
  );
}

function portfolioPdf(organisation, learner, observations, periodLabel, monthArc, monthLabel) {
  const sections = [];
  if (monthArc && monthArc.paragraph) {
    const author = monthArc.author ? String(monthArc.author).trim().split(' ')[0] : null;
    sections.push({
      heading: (monthLabel || periodLabel) + ' at a glance',
      paragraphs: [monthArc.paragraph, author ? '— ' + author + ', your child’s teacher' : '']
    });
  } else {
    sections.push({
      heading: 'Month at a glance',
      paragraphs: [
        'Here is a calm snapshot of ' + learner.first_name + ' this ' + periodLabel + ' — moments we recorded, outcomes we saw and tiny triumphs worth celebrating.',
        'Observations this month: ' + observations.length + '.'
      ]
    });
  }
  if (observations.length) {
    for (const observation of observations.slice(0, 30)) {
      const heading = observation.objective_code
        ? 'Observed · ' + observation.objective_code + ' — ' + (observation.domain_name || 'Learning')
        : 'Observed · ' + (observation.domain_name || 'Outdoor play');
      const line = 'On ' + String(observation.observation_date).slice(0, 10) +
        (observation.context ? ', during ' + observation.context + '. ' : '. ') +
        observation.observation_text;
      sections.push({ heading, paragraphs: [line] });
    }
  } else {
    sections.push({
      heading: 'Quietly busy',
      paragraphs: ['We did not manage to capture an observation this month — children were loved on regardless. Expect more next month; we will share what we see.']
    });
  }
  sections.push({
    heading: 'Get in touch',
    paragraphs: [
      'Questions about any of this? Reply to the email — or book a chat with us at the centre. We keep your questions back into the loop so the next report reflects them.'
    ]
  });
  return exportService.toDocumentPdf({
    title: learner.first_name + ' ' + String(learner.last_name || '').slice(0, 1) + '.',
    subtitle: 'Progress digest — ' + periodLabel,
    organisationName: organisation.name,
    intro: ['A gentle snapshot of what your child did and learned this month.'],
    sections,
    updatedAt: new Date().toISOString(),
    version: '1.0',
    footer: 'Re-EL ECD — ' + organisation.name + ' · Progress digest'
  });
}

async function portfolioGuardians(db, organisationId) {
  return db.many(
    `SELECT DISTINCT m.user_id, u.email, u.display_name
     FROM memberships m JOIN users u ON u.id = m.user_id
     JOIN membership_roles mr ON mr.membership_id = m.id
     JOIN roles r ON r.id = mr.role_id
     WHERE m.organisation_id = $1 AND m.status = 'active'
       AND r.role_key = 'parent_guardian' AND COALESCE(m.email_digest, true) = true
       AND u.email IS NOT NULL`,
    [organisationId]
  );
}

/** Build and send monthly progress digests. Returns counts. */
async function sendPortfolioDigest(db, { organisation, triggeredBy }) {
  const guardians = await portfolioGuardians(db, organisation.id);
  const monthLabel = new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  let sent = 0;
  for (const guardian of guardians) {
    const children = await childrenOf(db, organisation.id, guardian.user_id);
    if (!children.length) continue;
    const pdfAttachments = [];
    let childIntro = '';
    let totalObservations = 0;
    let arcPreview = null;
    for (const child of children) {
      const link = await db.one(
        `SELECT can_receive_reports FROM learner_guardians lg JOIN guardians g ON g.id = lg.guardian_id
         WHERE lg.learner_id = $1 AND lg.organisation_id = $2 AND g.user_id = $3 LIMIT 1`,
        [child.id, organisation.id, guardian.user_id]
      );
      if (link && link.can_receive_reports === false) continue;
      const observations = await observationsThisMonth(db, organisation.id, child.id);
      const arc = await db.one(
        `SELECT a.paragraph, u.display_name AS author
         FROM monthly_arcs a LEFT JOIN users u ON u.id = a.created_by
         WHERE a.organisation_id = $1 AND a.learner_id = $2
           AND a.period_month = date_trunc('month', CURRENT_DATE)::date`,
        [organisation.id, child.id]
      ).catch(() => null);
      totalObservations += observations.length;
      if (arc && arc.paragraph && !arcPreview) arcPreview = arc.paragraph;
      pdfAttachments.push({
        filename: String(child.first_name || 'Child').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-progress-' + new Date().toISOString().slice(0, 10) + '.pdf',
        content: portfolioPdf(organisation, child, observations, monthLabel, arc, monthLabel)
      });
      childIntro += child.first_name + ' · ' + observations.length + ' observation' + (observations.length === 1 ? '' : 's') + '\n';
    }
    if (!pdfAttachments.length) continue;
    try {
      const result = await sendTemplate(db, 'portfolioDigest', {
        to: guardian.email,
        organisationId: organisation.id,
        data: {
          organisationName: organisation.name,
          childName: children[0].first_name + (children.length > 1 ? ' + ' + (children.length - 1) + ' more' : ''),
          periodLabel: monthLabel,
          observationCount: totalObservations,
          teacherNote: arcPreview
        },
        attachments: pdfAttachments,
        metadata: { kind: 'portfolio_digest', children: pdfAttachments.length, triggeredBy: triggeredBy || 'schedule' }
      });
      if (result && result.status === 'sent') sent += 1;
    } catch (error) {
      console.warn(JSON.stringify({ level: 'warn', message: 'portfolio digest failed', organisationId: organisation.id, error: error.message }));
    }
  }
  return { recipients: guardians.length, sent };
}

module.exports = { sendWeeklyDigest, sendPortfolioDigest, weekStats, childrenOf };
