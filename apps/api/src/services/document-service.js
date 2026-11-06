'use strict';

/**
 * Platform documents: role user manuals (with SOPs) and legal policies.
 * Defaults are stored in the `documents` table on first access so the
 * super admin can edit any document — including the legal ones — from
 * the platform console. Every save bumps the version and is audited.
 */

function sec(heading, paragraphs, steps) {
  return { heading, paragraphs: paragraphs || [], steps: steps || [] };
}

function manual(roleKey, title, lede, intro, sections) {
  return { slug: 'manual-' + roleKey, title, category: 'manual', roleKey, lede, intro, sections };
}

function legal(slug, title, lede, intro, sections) {
  return { slug, title, category: 'legal', roleKey: null, lede, intro, sections };
}

const DEFAULT_DOCUMENTS = [
  legal('terms', 'Terms of Service', 'The agreement between you, your centre and Re-EL ECD for using the platform.', [
    'These Terms of Service (the "Terms") govern your use of Re-EL ECD, provided by Re-EL ECD Technologies (Pty) Ltd. By signing in or using the Service you accept them. This page is a template, not legal advice — have a South African attorney review it for your facts.',
    'Re-EL ECD is a multi-tenant platform for ECD centres: enrolments, attendance, learning records, parent communication, fees, media and a public website. Access is on a subscription basis in ZAR, billed via PayFast or settled by EFT. Prices exclude VAT (tax invoice at the prevailing rate); past-due subscriptions may be suspended after reasonable notice.',
    'You own the data you enter. We host it only to operate the Service, with tenant isolation, encryption and audit logs. On termination you may export your data; residual copies are deleted within 30 days subject to legal retention (for example tax records for five years).',
    'Platform admins may use short-lived, audited "View as" impersonation to resolve support cases. To the extent the Consumer Protection Act 68 of 2008 permits, liability is capped at three months\' fees. South African law governs disputes. For legal notices email legal@re-el.co.za; for privacy email privacy@re-el.co.za.'
  ], [
    sec('What you get', ['The Service for your authorised role only.'], ['Use your own credentials — never share logins.', 'Tell your centre admin immediately if you suspect misuse.', 'Use the Service only for lawful centre purposes.']),
    sec('Billing and suspension', ['Plans in ZAR; PayFast checkout or platform-collected EFT settlement.'], ['Check Finance / Settings > Billing before month-end.', 'Fix past-due balances promptly to avoid suspension.']),
    sec('Your data and support access', ['Your data stays your data. Support may work inside your workspace for a short audited window.'], ['Keep consent records for photos and health info (POPIA).', 'Export monthly and store a copy offline.'])
  ]),
  legal('privacy', 'Privacy Policy', 'POPIA-aligned processing of personal information.', [
    'Re-EL ECD Technologies (Pty) Ltd processes personal information as responsible party under the Protection of Personal Information Act 4 of 2013 (POPIA). Centres are responsible parties for records they enter. This is a template, not legal advice.',
    'We process only what is needed, on a lawful basis (consent, contract, legal obligation, legitimate interests, vital or public interest). Special personal information (health, children\'s data) requires guardian consent and heightened safeguards. We do not sell personal information.',
    'Processors: Cloudflare R2 (media), Resend (email), PayFast (payments) and hosting providers, bound by contract. Cross-border transfer only under s72 safeguards. Security: encryption, tenant isolation, audit logs, breach notification to the Regulator and data subjects without unreasonable delay.',
    'You may request access, correction or deletion; object or restrict processing; and complain to the Information Regulator (inforeg.org.za). Contact the Information Officer at privacy@re-el.co.za.'
  ], [
    sec('What we process', ['Account, centre, learner (including health/medical), guardian, staff, financial and log data.'], ['Only capture what the task needs.', 'Never record full card numbers.']),
    sec('Children and health data', ['Processed only on guardian consent or another POPIA s35 basis.'], ['Record photo/medication consent in the product.', 'Restrict who can view medical records.'])
  ]),
  legal('cookies', 'Cookie Policy', 'Which cookies we use, why, and how to control them.', [
    'Essential cookies (session, CSRF, short-lived impersonation) are strictly necessary. Functional storage remembers your workspace. Analytics is consent-based and anonymous; we do not use advertising trackers or sell browsing data.',
    'You can clear cookies in your browser at any time. Blocking essentials signs you out. Withdrawing analytics consent is immediate and does not affect sign-in. Contact privacy@re-el.co.za.'
  ], [
    sec('Categories', ['Essential, functional, consent-based analytics, and hosted media.'], ['Clear storage to withdraw consent instantly.'])
  ]),
  legal('acceptable-use', 'Acceptable Use Policy', 'What you may and may not do on Re-EL ECD.', [
    'This policy protects children, families and the shared platform. Breaches may lead to suspension and referral to the authorities. Children\'s safety comes first: never use the Service to harm, exploit or sexualise a child, or to access a child record you are not authorised for.',
    'Respect privacy and consent; do not scrape, bulk-download for side purposes, bypass permissions, or upload illegal/infringing content. Do not send spam or misrepresent your centre.'
  ], [
    sec('Enforcement', ['We may warn, suspend, terminate or report breaches.'], ['You are liable for anyone using your account.'])
  ]),
  legal('safeguarding', 'Safeguarding and Child Protection Policy', 'How the platform and centres keep children safe under the Children\'s Act and ECD duties.', [
    'Re-EL ECD is software, not a childcare provider. Each centre must appoint a designated safeguarding lead, vet all staff via the Child Protection Register, train them, and report suspected abuse immediately to the designated social worker, SAPS and the DSD where required. The Service logs incidents and corrective actions with timestamps; it never replaces mandatory reporting.',
    'Health, food, premises, transport and fire safety remain the centre\'s DSD/DBE duties. Photos are shared only with recorded guardian consent and never used for platform marketing without separate written consent. Review this policy at least annually and after any incident.'
  ], [
    sec('Safe staffing', ['Vet, check and train every adult.'], ['Store checks and expiry dates in Staff.', 'Keep ratios and emergency plans current.'])
  ]),

  manual('platform_super_admin', 'Platform Super Admin Manual', 'God\'s-eye administration for the whole platform.', [
    'You are the only role that sees every tenant, user, subscription, settlement and audit event. Your job is to keep the platform safe, billable and trustworthy. Everything you do is audited.'
  ], [
    sec('Daily checks (15 minutes)', ['Open Platform overview and read the four money cards: fees collected (30d), outstanding to settle, past-due subscriptions and subscription revenue.', 'Scan Security activity and Recent platform activity for sign-in failures, impersonations and sudden suspensions.'], ['1. System health: confirm database, email (Resend), payments (PayFast) and storage (R2) show configured.', '2. If past-due > 0, open Subscriptions and decide: chase, apply a plan or suspend.', '3. If outstanding to settle > 0, open Settlements and schedule the EFT payout.']),
    sec('God\'s-eye search and quick fixes', ['Use Global search (⌘K) to jump to any organisation, user, branch or child across tenants.'], ['1. Press ⌘K and type a name, email or slug.', '2. Open the result; use Manage/Revoke/Activate on Users.', '3. For billing, run "Run billing sweep" on the overview (flips lapsed periods and emails owners at most weekly).']),
    sec('View-as (impersonation) SOP', ['Start from Platform users → View as. It creates a 30-minute impersonation session; your own session is untouched for instant return. Every start/stop lands in the audit trail.'], ['1. Click View as on an active tenant user.', '2. Work inside their workspace (return via the top bar).', '3. Click "Return to platform" and confirm the bar is gone. Never impersonate yourself or another platform admin — the system blocks it.']),
    sec('Banners, plans and feature flags', ['Banners appear on every workspace and the sign-in screen — use them sparingly for maintenance or urgent notices. Feature flags control risky rollouts.'], ['1. Configuration → Platform banner → Enable/Edit → keep it short, pick the tone, save.', '2. Toggle a feature flag only with a rollback plan (turn it back off if errors rise).', '3. For plan changes use Organisations → subscription; communicate the change to the owner by broadcast email.']),
    sec('Weekly governance', ['Export the audit log (CSV/Excel/PDF) and review impersonations, user suspensions and settlement payouts.', 'Verify every tenant on trial converts or is suspended with a reason.'], ['1. Audit explorer: filter action "impersonation" and confirm each has a support case.', '2. Subscriptions: archive unused plans; never delete a plan with active tenants.'])
  ]),

  manual('platform_support_admin', 'Platform Support Admin Manual', 'Support diagnostics without money controls.', [
    'You diagnose tenant problems fast while staying inside support-only permissions. You cannot change billing plans or settlements.'
  ], [
    sec('Diagnose a tenant', ['Ask for the centre name and the exact error/time, then open Organisations → detail.'], ['1. Confirm tenant status, subscription state and plan.', '2. Check System health for failing services in the last 24 hours.', '3. Filter the audit explorer by tenant and action to see what changed.']),
    sec('Working inside a tenant', ['Use View as only for an active tenant user, for the shortest time, and tell the caller you are doing it.'], ['1. View as → reproduce the issue → note what you see.', '2. Return to platform immediately after.', '3. Log the case outcome so the next agent has context.']),
    sec('Escalate correctly', ['Money questions go to the finance admin; brand and billing plan changes stay with the super admin.'], ['1. Do not edit plans or payouts.', '2. Open a support case and hand over with the audit links attached.'])
  ]),

  manual('platform_finance_admin', 'Platform Finance Admin Manual', 'Subscriptions, settlements and the money trail.', [
    'You own the platform money: subscriptions, tenant fee collection and EFT payouts. You cannot edit tenant records.'
  ], [
    sec('Read the money', ['Overview shows MRR, fees collected (30d), outstanding to settle and past-due. Settlements shows per-tenant gross, fees and outstanding.'], ['1. Reconcile outstanding against payouts before promising dates.', '2. Export settlements/payouts (CSV/Excel/PDF) for the accountant monthly.']),
    sec('Subscriptions SOP', ['Past-due means the period ended unpaid. The sweep (overview or cron) flips lapsed periods and emails owners weekly.'], ['1. Review past-due weekly; send one reminder via the sweep, then call the owner.', '2. Move a tenant to a new plan only with the owner\'s written confirmation.', '3. Record manual EFT payments in Subscriptions so the period extends.']),
    sec('Payouts SOP', ['Platform-collected fees belong to the tenant (gross minus the platform fee %). Pay by EFT only from the payout record.'], ['1. Verify the tenant\'s bank details on file before paying.', '2. Record the payout (amount, reference, period).', '3. Never pay from a screenshot — always from the settlements screen.'])
  ]),

  manual('organisation_owner', 'Organisation Owner Manual', 'Own the business across your branches.', [
    'You see the whole organisation: branches, money, people and compliance. Your SOPs keep the business enrolled, paid and safe.'
  ], [
    sec('Weekly owner round (30 minutes)', ['Overview: enrolled learners, outstanding fees, open incidents and staffing gaps. Reports: attendance, finance and admissions trends.'], ['1. Check outstanding fees > target; ask Finance to act on the oldest first.', '2. Review open incidents and confirm every one has an owner and due date.', '3. Glance at attendance today vs last week for drop-offs.']),
    sec('Branches and people', ['Branches give you the site list; access gives you one place to grant roles without duplicating grants.'], ['1. Create branches/uploads only once per site; keep slugs stable.', '2. Grant each person one role per organisation; never stack the same role twice.', '3. Review access monthly — leavers lose access the day they leave.']),
    sec('Money and compliance', ['Finance holds fee, invoice and settlement truth. Settings holds branding, domains and billing.'], ['1. Fix your PayFast or EFT settlement mode and test a R1 payment.', '2. Confirm public website, domains and forms publish where you intend.', '3. Export finance/invoice reports monthly for your records.'])
  ]),

  manual('principal', 'Principal Manual', 'Lead the centre day to day — children, staff and safety.', [
    'You are accountable for enrolment, safety, learning quality and family trust. The product keeps those duties visible in one queue.'
  ], [
    sec('Morning SOP (daily)', ['Overview tells you what needs you today: attendance not started, fees outstanding, applications awaiting review, open incidents.'], ['1. If the register is not started, open Attendance and confirm teachers will mark it by 09:00.', '2. Clear applications and enquiries — reply the same day.', '3. Glance at open incidents; assign an owner before 10:00.']),
    sec('Safety and safeguarding', ['Log every incident the moment you hear about it; corrective actions get assignees and due dates.'], ['1. Create the incident with the child, branch and description.', '2. Add corrective actions and assign at least one adult per action.', '3. Close only when the action is marked done and reviewed.']),
    sec('Staffing and weekly rhythm', ['Shifts, leave and timesheets keep the roster honest.'], ['1. Publish shifts weekly; approve leave against ratios.', '2. Check staff attendance daily; correct only with a reason (audited).', '3. Review reports each Friday: attendance, incidents, fees, enrolments.'])
  ]),

  manual('daycare_administrator', 'Daycare Administrator Manual', 'Classroom to office: learners, guardians, forms and files.', [
    'You keep records complete so teachers and the principal can act without chasing paper.'
  ], [
    sec('Learners SOP', ['Add a learner once, with branch and date of birth; link guardians with the right portal access.'], ['1. Learners → Add: complete name, DOB, branch (and classroom when known).', '2. Link each guardian and tick only the permissions they have (collect, reports, finance).', '3. Upload medical/consent documents to the learner record, not chat.']),
    sec('Admissions to enrolment', ['Work the pipeline: enquiry → application → enrol.'], ['1. Convert the application; never retype a child that already exists.', '2. Confirm classroom and branch before finishing.', '3. Send the parent-portal invite from Users and access.']),
    sec('Forms, announcements and media', ['Use visual forms for applications/consents; announcements for one-to-many notices, targeted by branch.'], ['1. Publish forms only when status is live; payments settle automatically.', '2. Target announcements to the right branches and audience.', '3. Upload media to the Media library (R2) — never paste file binaries into notes.'])
  ]),

  manual('daycare_manager', 'Daycare Manager Manual', 'Daily operations: attendance, rosters, tasks and the building.', [
    'You make the day run: rooms staffed, registers marked, tasks closed and the building safe.'
  ], [
    sec('Daily operations SOP', ['Attendance for learners and staff must be marked the same day.'], ['1. Learner Attendance → Record register: pick the date, choose children in bulk (multiselect), set one status, save.', '2. Staff Attendance: confirm everyone on shift checked in; fix mistakes with a correction reason.', '3. Tasks: assign checklist work to several people at once with due dates.']),
    sec('Classrooms and inventory', ['Classrooms are rooms, not furniture. Keep them accurate for registers and assessments.'], ['1. Move a whole group at once via Learners bulk "Move classroom".', '2. Log low stock in Inventory the day it runs low; order before you run out.', '3. Report hazards as incidents with photos — do not wait for the weekly meeting.']),
    sec('End-of-day close', ['No child leaves unmarked.'], ['1. Re-run Attendance and confirm zero "unmarked".', '2. Close or reassign today\'s tasks.', '3. Hand over anything urgent to the principal in Announcements.'])
  ]),

  manual('curriculum_coordinator', 'Curriculum Coordinator Manual', 'Plan, publish and prove the learning programme.', [
    'You own curriculum plans, week-by-week activities and whether assessments actually happened.'
  ], [
    sec('Planning SOP', ['Curriculum plans are the contract: activities, materials and learning goals per week.'], ['1. Create the plan per classroom/term; attach activities for each week.', '2. Publish only when materials are attached (media library).', '3. Move drafts to the next term by copying, not by re-typing.']),
    sec('Assessment and portfolio flow', ['Teachers capture observations; you quality-check and publish.'], ['1. Review assessments per child before publishing to parents.', '2. Check portfolio evidence is dated and captioned.', '3. Flag children with no progress data for the teacher that week — do not wait for report time.']),
    sec('Weekly curriculum huddle', ['Fifteen minutes, one agenda: coverage, materials, catch-ups.'], ['1. Export curriculum/assessment reports for the meeting (PDF).', '2. Log curriculum gaps as tasks with owners.', '3. Publish next week\'s plan by Wednesday.'])
  ]),

  manual('teacher', 'Teacher Manual', 'Your classroom, your children, your records — marked on time, safely.', [
    'You work with assigned classes only. Marked-on-time records protect children and you.'
  ], [
    sec('Morning register SOP', ['Attendance is a safeguarding record, not admin.'], ['1. Open Attendance → your classroom → today\'s register.', '2. Mark present/absent for every child before 10:00; add reasons for absences.', '3. If a child is absent, message the guardian from Communications the same morning.']),
    sec('Daily learning and portfolio', ['Capture during the day, tidy later.'], ['1. Record activities and observations from Curriculum/Assessments while it is fresh.', '2. Add portfolio photos with captions (R2 media) — never on your personal phone gallery.', '3. Update learner notes that the principal and parents rely on.']),
    sec('Incidents and collections', ['Log it, don\'t carry it.'], ['1. Report any injury, near-miss or behaviour concern as an incident immediately.', '2. Record collections only for authorised collectors on the learner record.', '3. Finish your tasks (cleaning rounds, prep) before you leave.'])
  ]),

  manual('assistant_teacher', 'Assistant Teacher Manual', 'Support the room: setup, supervision and accurate records.', [
    'You keep the classroom running so learning can happen, and your records are the second pair of eyes.'
  ], [
    sec('Room setup and register help', ['Set up stations before children arrive; help mark the register.'], ['1. Confirm stations/materials from today\'s curriculum plan.', '2. Help the teacher mark attendance; never mark a child you did not see arrive without asking.', '3. Initial staff attendance on arrival via Shifts.']),
    sec('Learning support', ['Capture evidence and keep the room safe.'], ['1. Add assessment observations the teacher delegates to you.', '2. Upload portfolio/media items with captions from the classroom device.', '3. Report hazards and incidents immediately.']),
    sec('Close-down', ['Leave the room ready for tomorrow.'], ['1. Complete assigned tasks (tidy, snack prep, rest area).', '2. Check authorised collectors against the learner record before handover.', '3. Signal any missing child data to the teacher the same day.'])
  ]),

  manual('support_staff', 'Support Staff Manual', 'Cleaning, kitchen, maintenance and the duties that keep the centre safe.', [
    'Your tasks, inventory checks and safety reports are part of the legal record — do them in the app, not on paper scraps.'
  ], [
    sec('Tasks and checklists', ['Your checklist items (cleaning rounds, kitchen prep, trip prep) prove the work was done.'], ['1. Open Tasks → your assigned tasks and work the list in order.', '2. Tick each checklist item as you finish it; do not batch-tick at home.', '3. Mark the task complete only when the area is actually done.']),
    sec('Inventory and safety', ['Low stock and hazards are the two things you must never sit on.'], ['1. Check Inventory weekly; log low stock before it runs out.', '2. Report any hazard, spill or breakage as a Safety incident with a photo.', '3. Record staff attendance on arrival; request leave here, not by WhatsApp.']),
    sec('Boundaries', ['Support staff see tasks, inventory and safety — nothing else.'], ['1. Do not open learner records or parent messages.', '2. Ask the manager before photographing children or areas.'])
  ]),

  manual('finance_officer', 'Finance Officer Manual', 'Fees, invoices, payments and the books.', [
    'You make sure every rand is accounted for: billed, paid, reconciled and reported.'
  ], [
    sec('Billing SOP', ['Invoices are generated per learner; payments are reconciled against them.'], ['1. Generate invoices monthly before the 1st; check the preview for missing learners.', '2. Record EFT/cash payments by reference; PayFast payments match automatically.', '3. Reconcile daily: unreconciled payments are your oldest first.']),
    sec('Expenses and budget', ['Every expense needs a receipt and a category.'], ['1. Capture expenses with the receipt (R2 media) the day you spend.', '2. Review expenses vs budget weekly; flag overruns to the principal.', '3. Export finance reports (CSV/Excel/PDF) monthly for the owner.']),
    sec('Fees, settlements and audits', ['Settlements are the money owed to the centre, not to you personally.'], ['1. Confirm the centre\'s PayFast/EFT mode in Settings > Billing.', '2. Check the audit log for every payment edit — corrections need a reason.', '3. Never delete an invoice; void it with a reason instead.'])
  ]),

  manual('admissions_officer', 'Admissions Officer Manual', 'From first enquiry to enrolled child — fast, warm and accurate.', [
    'Families judge the centre by your first reply. Speed and accuracy convert enquiries into enrolments.'
  ], [
    sec('Enquiry SOP (same day)', ['Every enquiry must be answered the same working day.'], ['1. Log the enquiry with guardian contact and child age.', '2. Reply with next steps, fees and a tour invite; mark contacted.', '3. Convert to an application when the family commits.']),
    sec('Application to enrolment', ['Applications hold the documents and the placement decision.'], ['1. Review forms/submissions; chase missing documents by phone, not only email.', '2. Enrol: confirm branch and classroom before finishing.', '3. Hand the child to the teacher with a note on medical/consent needs.']),
    sec('Public site and forms', ['The website and forms are your shop window.'], ['1. Keep the public site (About, Programmes, Admissions, Gallery, Contact) current.', '2. Publish forms only when live; payments settle automatically.', '3. Never publish a phone number you do not answer.'])
  ]),

  manual('parent_guardian', 'Parent / Guardian Manual', 'Your children\'s records, attendance, fees and messages in one place.', [
    'You see only your own children. Everything you do — absences, forms, payments and consent — helps the centre care for them.'
  ], [
    sec('First week setup', ['Link your children and check consent.'], ['1. Open My children and confirm each child, classroom and teacher.', '2. Open Profile and consent: tick only the permissions you grant (photo/media, medical sharing, financial updates).', '3. Add your phone — the centre uses it for urgent collections.']),
    sec('Attendance and absence SOP', ['Tell the centre the day before, not after drop-off.'], ['1. Attendance → Report absence → select one or more children, the date and the reason (submit once for siblings).', '2. Future dates only; the centre is notified and your child is marked excused.', '3. If your child is ill in the morning, report before 08:00 where possible.']),
    sec('Fees, forms and messages', ['Pay on time, submit forms fully, keep messages in the app.'], ['1. Fees: view your balance and pay via PayFast; save your receipt.', '2. Forms: complete every required field; incomplete forms bounce back.', '3. Messages: reply in-app so the centre has a record; for urgent safety issues, phone the centre directly.'])
  ]),

  manual('substitute_staff', 'Substitute Staff Manual', 'Cover a shift safely: attendance, supervision and handover.', [
    'You only see the classes and shifts you are rostered for. When in doubt, ask — never guess about a child.'
  ], [
    sec('Before the shift', ['Know where you are before you arrive.'], ['1. Open Shifts and note classroom, time and the regular teacher.', '2. Arrive and record staff attendance on the device.', '3. Read the classroom register and any medical/allergy notes first.']),
    sec('During the shift', ['Mark attendance and keep supervision tight.'], ['1. Mark learner attendance for your class; phone the office if a child is missing.', '2. Log any incident the moment it happens.', '3. Only release children to authorised collectors on the learner record.']),
    sec('Handover', ['Leave the room and the record as you found them — better.'], ['1. Complete your assigned tasks.', '2. Write a short handover note for the regular teacher (absences, incidents, worries).', '3. Do not download or photograph learner records.'])
  ])
];

const DEFAULTS_BY_SLUG = Object.fromEntries(DEFAULT_DOCUMENTS.map((doc) => [doc.slug, doc]));

async function ensureSeed(db) {
  for (const doc of DEFAULT_DOCUMENTS) {
    await db.query(
      `INSERT INTO documents (slug, title, category, role_key, lede, intro, sections, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1)
       ON CONFLICT (slug) DO NOTHING`,
      [doc.slug, doc.title, doc.category, doc.roleKey || null, doc.lede || '',
        JSON.stringify(doc.intro || []), JSON.stringify(doc.sections || [])]
    );
  }
}

async function listDocuments(db) {
  await ensureSeed(db);
  return db.many(
    `SELECT slug, title, category, role_key, lede, version, updated_at, updated_by
     FROM documents
     ORDER BY category, role_key NULLS LAST, title`
  );
}

async function getDocument(db, slug) {
  await ensureSeed(db);
  const doc = await db.one('SELECT * FROM documents WHERE slug = $1', [slug]);
  return doc || null;
}

function validateDocument(input) {
  const normalized = {
    title: String((input && input.title) || '').trim(),
    lede: String((input && input.lede) || '').trim().slice(0, 500),
    intro: Array.isArray(input && input.intro) ? input.intro.map((line) => String(line).trim()).filter(Boolean).slice(0, 40) : [],
    sections: Array.isArray(input && input.sections) ? input.sections : []
  };
  if (normalized.title.length < 3 || normalized.title.length > 200) {
    return { error: 'Title must be between 3 and 200 characters.' };
  }
  if (normalized.sections.length < 1 || normalized.sections.length > 40) {
    return { error: 'Provide between 1 and 40 sections.' };
  }
  const sections = [];
  for (const section of normalized.sections) {
    const heading = String((section && section.heading) || '').trim() || 'Section';
    const paragraphs = Array.isArray(section && section.paragraphs)
      ? section.paragraphs.map((p) => String(p).trim()).filter(Boolean).slice(0, 12)
      : (section && section.body ? String(section.body).split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean).slice(0, 12) : []);
    const steps = Array.isArray(section && section.steps)
      ? section.steps.map((s) => String(s).trim()).filter(Boolean).slice(0, 20)
      : (section && section.stepsText ? String(section.stepsText).split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 20) : []);
    sections.push({ heading: heading.slice(0, 140), paragraphs, steps });
  }
  normalized.sections = sections;
  return { value: normalized };
}

module.exports = { DEFAULT_DOCUMENTS, DEFAULTS_BY_SLUG, ensureSeed, listDocuments, getDocument, validateDocument };
