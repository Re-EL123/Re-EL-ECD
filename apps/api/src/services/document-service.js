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
    'Re-EL ECD provides digital tools to support ECD administration and safeguarding procedures. The centre remains responsible for supervising children, maintaining safeguarding policies and collection procedures, registering authorised collectors correctly and ensuring staff follow its verification procedures. Re-EL ECD does not replace physical supervision, responsible staff or applicable regulatory requirements.',
    'Using Re-EL ECD does not register an ECD centre or certify that it is legally compliant. South African Government ECD registration with the provincial DSD or DBE is separate; Re-EL ECD is not a government department and does not register, inspect or certify centres. See the Safeguarding & Operational Disclaimer and the Operator / Data Processing Agreement.',
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
    'Using Re-EL ECD does not register an ECD centre or certify legal compliance. South African government ECD registration with the provincial DSD or DBE is separate. See the Safeguarding & Operational Disclaimer and the Operator / Data Processing Agreement.',
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

  legal('safeguarding-disclaimer', 'Safeguarding & Operational Disclaimer', 'Where the centre’s duties end and the Re-EL ECD platform begins.', [
    'Re-EL ECD provides digital tools to support ECD administration and safeguarding procedures. It is software, not a childcare provider, regulator or certifying authority. This disclaimer forms part of the Terms of Service and must be read with the Safeguarding and Child Protection Policy.',
    'This is general copy in plain language, not legal advice. Have a South African attorney review it for your facts before relying on it.'
  ], [
    sec('The centre supervises the children', ['The centre, its owner and its staff remain responsible for the physical supervision, care, safety and wellbeing of every child. Attendance registers, gate scans, collector records, incident logs and alerts do not constitute supervision and never replace an attentive adult.'], ['Keep ratios and emergency plans current.', 'Never treat a platform notification as a handover or supervision record on its own.']),
    sec('The centre owns safeguarding policies and collection procedures', ['Each centre must adopt, publish, implement and review its own safeguarding policies, child-protection procedures, health and safety rules and collection procedures under the Children’s Act 38 of 2005 and applicable DSD/DBE requirements. Re-EL ECD may store or display them; it does not create, approve or enforce them.']),
    sec('Authorised collectors must be registered correctly', ['The centre must keep its authorised-collector list accurate: names, relationships, contact details, verification policy and expiries. A successful gate scan is evidence of what the platform recorded, not proof that the right person collected the child, and never authorises a release on its own.'], ['Review collector access whenever a guardianship or collection arrangement changes.', 'Escalate unknown or unverified collectors through the centre’s own procedure.']),
    sec('Staff follow the centre’s verification procedures', ['Staff must check identification, confirm collection permissions and follow escalation steps every time. The platform can prompt and log those steps but cannot perform them. Never bypass verification because the app shows a green check or QR code.']),
    sec('The platform does not replace people or the law', ['Re-EL ECD does not replace physical supervision, vetted staff, professional judgement, mandatory reporting to the designated social worker, SAPS or the DSD, or any other regulatory requirement. It does not investigate allegations or decide whether a child is safe.']),
    sec('No registration or compliance certification', ['Using Re-EL ECD does not automatically register an ECD centre or certify legal compliance. South African Government ECD registration with the relevant provincial Department of Social Development (DSD) or Department of Basic Education (DBE), and any municipal, health, fire or zoning approvals, are separate and remain the centre’s responsibility. Re-EL ECD is not a South African Government department, does not act for any department, and does not register, inspect or certify centres. Badges, registration-number fields and published website pages are user-supplied content, not verification or proof of registration.'], ['Confirm your registration directly with the relevant authority.', 'Do not present platform content as a certificate or endorsement.']),
    sec('What the platform provides', ['Record-keeping, reminders, audit trails, role-based access, notifications and reporting tools that can help a centre demonstrate its own procedures and spot gaps. These are administration aids, not a finding of compliance.']),
    sec('Reporting a concern', ['Report suspected abuse or immediate risk through the centre’s safeguarding lead and to the statutory authorities immediately, not only in the platform. Support can help restore access or investigate a fault, but cannot investigate a safeguarding allegation.'])
  ]),
  legal('data-processing-agreement', 'Operator / Data Processing Agreement', 'POPIA operator terms for personal information processed on behalf of a centre (DRAFT — attorney review required).', [
    'DRAFT FOR LEGAL REVIEW — NOT YET REVIEWED BY A SOUTH AFRICAN ATTORNEY. Do not sign or rely on this template until counsel has reviewed it, the details below have been completed, and the parties have signed.',
    'This Operator / Data Processing Agreement sets out how Re-EL ECD Technologies (Pty) Ltd (“Re-EL ECD”, operator) processes personal information on behalf of the subscribing ECD centre (responsible party) under the Protection of Personal Information Act 4 of 2013 (POPIA), especially sections 19 and 20. It forms part of the Terms of Service.',
    'This is a template, not legal advice.'
  ], [
    sec('1. Parties, roles and scope', ['The centre determines why and how learner, guardian and staff information is used and is the responsible party. Re-EL ECD acts as operator and processes it only on the centre’s documented instructions in this Agreement, the Terms and the centre’s settings. Where Re-EL ECD determines its own purpose (platform security, billing, legal records) it acts as an independent responsible party under the Privacy Policy.']),
    sec('2. Lawful authority to collect children’s information', ['The centre warrants that it has the permissions, lawful authority and POPIA basis to collect and disclose the information it enters, including parental/guardian consent or another s35 basis for children, and compliance with the Children’s Act 38 of 2005. The centre must collect only what it needs, tell data subjects and guardians why, keep consent and withdrawal records current, and act on objections and withdrawals. Re-EL ECD does not obtain or verify consent on the centre’s behalf.', 'The centre indemnifies Re-EL ECD against claims arising from its failure to obtain the required authority, to the extent permitted by law.'], ['Record consent and withdrawal in the product.', 'Do not upload a child’s information without a lawful basis.']),
    sec('3. Re-EL ECD’s protection duties', ['Re-EL ECD will process information lawfully and only for clause 4, keep it confidential, maintain clause 7 safeguards, bind personnel and sub-processors to equivalent duties, assist with POPIA rights requests, notify the centre of a compromise without unreasonable delay, and cooperate with regulator notifications.', 'Re-EL ECD will not sell personal information, market to children or families using it, or use it to train third-party AI models.']),
    sec('4. Permitted purposes', ['Only to provide and support the Service; store and display records the centre captures; deliver centre-initiated messages and delivery status; maintain security and investigate faults including short-lived audited support access; process payments; meet legal, tax and regulatory duties; and follow the centre’s further instructions. A materially different purpose requires notice and, where required, agreement or a fresh lawful basis.']),
    sec('5. Hosting providers and third parties', ['Sub-processors: Vercel and GitHub Pages (hosting), Neon PostgreSQL (database and backups), Cloudflare R2 (media via short-lived signed URLs), Resend (email), textbee / Africa’s Talking / Twilio (opt-in SMS), Web Push/VAPID, PayFast (payments; no full card numbers stored), Google Analytics 4 and Search Console (consent-gated aggregate analytics), Google Fonts, and Open-Meteo (weather by configured location, no child data).', 'Cross-border transfers require POPIA s72 safeguards or another lawful basis. The centre may object to a new sub-processor on reasonable grounds and may terminate the affected Service if no alternative is agreed.'], ['Check the current sub-processor list before go-live.', 'Confirm cross-border transfer terms with counsel.']),
    sec('6. Access, sharing and disclosure restrictions', ['Access is limited to authorised personnel who need it, under role-based permissions and tenant isolation, with written confidentiality duties. Platform administrators have no routine access to children’s records; support access is short-lived and audited. Disclosure is only on the centre’s instruction, to a listed sub-processor under equivalent terms, where legally compelled (with notice where permitted), or to bound professional advisers.']),
    sec('7. Security requirements', ['Safeguards include TLS in transit, encryption at rest for secrets and provider-managed encryption, hashed passwords, optional MFA, short-lived sessions, CSRF protection, login rate limits, audit logs, signed short-lived media URLs and monitored administrative access. Controls are reviewed at least annually and sub-processors must maintain equivalent safeguards. The centre is responsible for its devices, training, credentials and the accuracy of its data.', 'Confirm backup and restore arrangements with the hosting provider and record a restore test — see the attorney checklist.']),
    sec('8. Termination of subscription', ['On expiry or termination, active access ends. Re-EL ECD keeps the data securely for a short transition window for export, then deletes or anonymises residual copies per clause 9, subject to law. Amounts due and the confidentiality, security, liability and data-protection clauses survive. Suspension may be immediate where lawful to protect children or the Service.']),
    sec('9. Export, retention and deletion', ['The centre can export per-resource CSV, XLSX and PDF files (learners, staff, attendance, finance, observations, incidents and others; large sets may need splitting). Retention follows centre settings and law: tax records generally five years under the Tax Administration Act 28 of 2011, and applicable DSD/DBE record duties. Anonymous aggregates and immutable audit/financial records may be retained. A child’s live-check answers can be erased from the learner profile. Residual copies are deleted or anonymised within 30 days after the transition window, except legal holds and ordinary backup cycles; confirmation is available on request.'], ['Export a copy before cancelling.', 'Record the legal basis for anything you retain.']),
    sec('10. Security incidents', ['The centre must notify privacy@re-el.co.za without unreasonable delay of a suspected incident involving the Service. Re-EL ECD will investigate promptly, contain and remediate, keep the centre informed, provide a written summary, and where serious harm is likely notify the Information Regulator and affected data subjects without unreasonable delay under POPIA s22. Public statements naming a centre require prior consultation unless legally required.']),
    sec('11. General and signatures', ['South African law governs. This Agreement forms part of the Terms; for personal-information processing it prevails. Disputes are escalated in good faith first. Data-subject rights and statutory duties are unaffected.', 'Centre: name ______ role ______ signature ______ date ______', 'Re-EL ECD: name ______ role ______ signature ______ date ______. Entity: Re-EL ECD Technologies (Pty) Ltd, registration 2026/000001/07 (confirm). Notices: legal@re-el.co.za · Privacy: privacy@re-el.co.za.'])
  ]),

  legal('breach-response', 'Security Incident & Breach Response Procedure', 'Exactly what happens when learner records are accessed without authorisation (POPIA s22).', [
    'DRAFT OPERATIONAL TEMPLATE — not yet approved by an Information Officer or reviewed by a South African attorney. It is informed by the Information Regulator’s Fact Sheet on Handling of Security Compromises (August 2025) and the section 22 notification guidelines.',
    'The centre is the responsible party for the information it enters; its Information Officer must notify the Information Regulator and affected data subjects. Re-EL ECD is normally the operator and must immediately notify the centre and supply the facts it needs.',
    'The clock starts when there are reasonable grounds to believe a compromise occurred, not when the investigation ends. There is no risk threshold: all compromises are reported.'
  ], [
    sec('1. Detect and investigate', ['Record the time of discovery, source and observations. Appoint an incident lead and open an incident log. Establish what happened, which systems and centre were involved, which data categories were reachable, how many individuals could be affected and whether access is active. Use read-only investigation to preserve evidence.']),
    sec('2. Restrict unauthorised access', ['Revoke sessions and support impersonation, suspend the user or centre, rotate exposed credentials, block the source and patch the access path. A second person verifies containment. Do not delete records or logs before evidence is preserved.']),
    sec('3. Preserve logs and evidence', ['Freeze and copy audit events, sessions, delivery logs, webhook events, telemetry and application, database, storage and edge logs. Export to dated immutable storage, record hashes and chain of custody, and take a database snapshot before destructive changes.']),
    sec('4. Inform the affected centre', ['Notify the owner/principal in writing immediately, before the investigation is complete: what happened and when, systems involved, data categories, containment already done, and what the centre must do. Confirm the Information Officer and whether SAPS or DSD/DBE is engaged.']),
    sec('5. Determine affected individuals', ['Scope by centre then reachable records: learners, guardians, staff, medical notes, attendance, observations, documents, finance and media. Decide per category whether there are reasonable grounds to believe it was accessed; count and identify individuals; record likely consequences and confidence in a restricted schedule.']),
    sec('6. POPIA notification', ['The centre’s Information Officer lodges the prescribed Security Compromise Notification Form via the Regulator’s eServices portal as soon as reasonably possible, and keeps the acknowledgement/reference. Affected individuals are told in writing what happened and when, possible consequences, measures taken or planned, recommended protective steps and the identity of the unauthorised person if known. Report with available facts and update; explain any delay. Keep a website notice 30–90 days where used.'], ['Official guidance: Information Regulator Fact Sheet on Handling of Security Compromises (2025), section 22 guidelines, and eservices.inforegulator.org.za.']),
    sec('7. Document corrective actions', ['Keep one incident record with timeline, evidence register, containment steps and notification copies. Review root cause within ten business days, assign corrective actions with owners and due dates, verify completion, update controls and policies, and retain the record under the centre’s retention policy and any legal hold.'], ['Full playbook and templates: docs/breach-response.md.']),
    sec('Contacts', ['Re-EL: privacy@re-el.co.za · support@re-el.co.za. Information Regulator: enquiries@inforegulator.org.za · 010 023 5200 · toll free 0800 017 160. Confirm current details in the Regulator’s latest guidance.'])
  ]),

  manual('platform_super_admin', 'Platform Super Admin Manual', 'God\'s-eye administration for the whole platform.', [
    'You are the only role that sees every tenant, user, subscription, settlement and audit event. Your job is to keep the platform safe, billable and trustworthy. Everything you do is audited.'
  ], [
    sec('Daily checks (15 minutes)', ['Open Platform overview and read the four money cards: fees collected (30d), outstanding to settle, past-due subscriptions and subscription revenue.', 'Scan Security activity and Recent platform activity for sign-in failures, impersonations and sudden suspensions.'], ['System health: confirm database, email (Resend), payments (PayFast) and storage (R2) show configured.', 'If past-due > 0, open Subscriptions and decide: chase, apply a plan or suspend.', 'If outstanding to settle > 0, open Settlements and schedule the EFT payout.']),
    sec('God\'s-eye search and quick fixes', ['Use Global search (⌘K) to jump to any organisation, user, branch or child across tenants.'], ['Press ⌘K and type a name, email or slug.', 'Open the result; use Manage/Revoke/Activate on Users.', 'For billing, run "Run billing sweep" on the overview (flips lapsed periods and emails owners at most weekly).']),
    sec('View-as (impersonation) SOP', ['Start from Platform users → View as. It creates a 30-minute impersonation session; your own session is untouched for instant return. Every start/stop lands in the audit trail.'], ['Click View as on an active tenant user.', 'Work inside their workspace (return via the top bar).', 'Click "Return to platform" and confirm the bar is gone. Never impersonate yourself or another platform admin — the system blocks it.']),
    sec('Banners, plans and feature flags', ['Banners appear on every workspace and the sign-in screen — use them sparingly for maintenance or urgent notices. Feature flags control risky rollouts.'], ['Configuration → Platform banner → Enable/Edit → keep it short, pick the tone, save.', 'Toggle a feature flag only with a rollback plan (turn it back off if errors rise).', 'For plan changes use Organisations → subscription; communicate the change to the owner by broadcast email.']),
    sec('Weekly governance', ['Export the audit log (CSV/Excel/PDF) and review impersonations, user suspensions and settlement payouts.', 'Verify every tenant on trial converts or is suspended with a reason.'], ['Audit explorer: filter action "impersonation" and confirm each has a support case.', 'Subscriptions: archive unused plans; never delete a plan with active tenants.'])
  ]),

  manual('platform_support_admin', 'Platform Support Admin Manual', 'Support diagnostics without money controls.', [
    'You diagnose tenant problems fast while staying inside support-only permissions. You cannot change billing plans or settlements.'
  ], [
    sec('Diagnose a tenant', ['Ask for the centre name and the exact error/time, then open Organisations → detail.'], ['Confirm tenant status, subscription state and plan.', 'Check System health for failing services in the last 24 hours.', 'Filter the audit explorer by tenant and action to see what changed.']),
    sec('Working inside a tenant', ['Use View as only for an active tenant user, for the shortest time, and tell the caller you are doing it.'], ['View as → reproduce the issue → note what you see.', 'Return to platform immediately after.', 'Log the case outcome so the next agent has context.']),
    sec('Escalate correctly', ['Money questions go to the finance admin; brand and billing plan changes stay with the super admin.'], ['Do not edit plans or payouts.', 'Open a support case and hand over with the audit links attached.'])
  ]),

  manual('platform_finance_admin', 'Platform Finance Admin Manual', 'Subscriptions, settlements and the money trail.', [
    'You own the platform money: subscriptions, tenant fee collection and EFT payouts. You cannot edit tenant records.'
  ], [
    sec('Read the money', ['Overview shows MRR, fees collected (30d), outstanding to settle and past-due. Settlements shows per-tenant gross, fees and outstanding.'], ['Reconcile outstanding against payouts before promising dates.', 'Export settlements/payouts (CSV/Excel/PDF) for the accountant monthly.']),
    sec('Subscriptions SOP', ['Past-due means the period ended unpaid. The sweep (overview or cron) flips lapsed periods and emails owners weekly.'], ['Review past-due weekly; send one reminder via the sweep, then call the owner.', 'Move a tenant to a new plan only with the owner\'s written confirmation.', 'Record manual EFT payments in Subscriptions so the period extends.']),
    sec('Payouts SOP', ['Platform-collected fees belong to the tenant (gross minus the platform fee %). Pay by EFT only from the payout record.'], ['Verify the tenant\'s bank details on file before paying.', 'Record the payout (amount, reference, period).', 'Never pay from a screenshot — always from the settlements screen.'])
  ]),

  manual('organisation_owner', 'Organisation Owner Manual', 'Own the business across your branches.', [
    'You see the whole organisation: branches, money, people and compliance. Your SOPs keep the business enrolled, paid and safe.'
  ], [
    sec('Weekly owner round (30 minutes)', ['Overview: enrolled learners, outstanding fees, open incidents and staffing gaps. Reports: attendance, finance and admissions trends.'], ['Check outstanding fees > target; ask Finance to act on the oldest first.', 'Review open incidents and confirm every one has an owner and due date.', 'Glance at attendance today vs last week for drop-offs.']),
    sec('Branches and people', ['Branches give you the site list; access gives you one place to grant roles without duplicating grants.'], ['Create branches/uploads only once per site; keep slugs stable.', 'Grant each person one role per organisation; never stack the same role twice.', 'Review access monthly — leavers lose access the day they leave.']),
    sec('Money and compliance', ['Finance holds fee, invoice and settlement truth. Settings holds branding, domains and billing.'], ['Fix your PayFast or EFT settlement mode and test a R1 payment.', 'Confirm public website, domains and forms publish where you intend.', 'Export finance/invoice reports monthly for your records.'])
  ]),

  manual('principal', 'Principal Manual', 'Lead the centre day to day — children, staff and safety.', [
    'You are accountable for enrolment, safety, learning quality and family trust. The product keeps those duties visible in one queue.'
  ], [
    sec('Morning SOP (daily)', ['Overview tells you what needs you today: attendance not started, fees outstanding, applications awaiting review, open incidents.'], ['If the register is not started, open Attendance and confirm teachers will mark it by 09:00.', 'Clear applications and enquiries — reply the same day.', 'Glance at open incidents; assign an owner before 10:00.']),
    sec('Safety and safeguarding', ['Log every incident the moment you hear about it; corrective actions get assignees and due dates.'], ['Create the incident with the child, branch and description.', 'Add corrective actions and assign at least one adult per action.', 'Close only when the action is marked done and reviewed.']),
    sec('Staffing and weekly rhythm', ['Shifts, leave and timesheets keep the roster honest.'], ['Publish shifts weekly; approve leave against ratios.', 'Check staff attendance daily; correct only with a reason (audited).', 'Review reports each Friday: attendance, incidents, fees, enrolments.'])
  ]),

  manual('daycare_administrator', 'Daycare Administrator Manual', 'Classroom to office: learners, guardians, forms and files.', [
    'You keep records complete so teachers and the principal can act without chasing paper.'
  ], [
    sec('Learners SOP', ['Add a learner once, with branch and date of birth; link guardians with the right portal access.'], ['Learners → Add: complete name, DOB, branch (and classroom when known).', 'Link each guardian and tick only the permissions they have (collect, reports, finance).', 'Upload medical/consent documents to the learner record, not chat.']),
    sec('Admissions to enrolment', ['Work the pipeline: enquiry → application → enrol.'], ['Convert the application; never retype a child that already exists.', 'Confirm classroom and branch before finishing.', 'Send the parent-portal invite from Users and access.']),
    sec('Forms, announcements and media', ['Use visual forms for applications/consents; announcements for one-to-many notices, targeted by branch.'], ['Publish forms only when status is live; payments settle automatically.', 'Target announcements to the right branches and audience.', 'Upload media to the Media library (R2) — never paste file binaries into notes.'])
  ]),

  manual('daycare_manager', 'Daycare Manager Manual', 'Daily operations: attendance, rosters, tasks and the building.', [
    'You make the day run: rooms staffed, registers marked, tasks closed and the building safe.'
  ], [
    sec('Daily operations SOP', ['Attendance for learners and staff must be marked the same day.'], ['Learner Attendance → Record register: pick the date, choose children in bulk (multiselect), set one status, save.', 'Staff Attendance: confirm everyone on shift checked in; fix mistakes with a correction reason.', 'Tasks: assign checklist work to several people at once with due dates.']),
    sec('Classrooms and inventory', ['Classrooms are rooms, not furniture. Keep them accurate for registers and assessments.'], ['Move a whole group at once via Learners bulk "Move classroom".', 'Log low stock in Inventory the day it runs low; order before you run out.', 'Report hazards as incidents with photos — do not wait for the weekly meeting.']),
    sec('End-of-day close', ['No child leaves unmarked.'], ['Re-run Attendance and confirm zero "unmarked".', 'Close or reassign today\'s tasks.', 'Hand over anything urgent to the principal in Announcements.'])
  ]),

  manual('curriculum_coordinator', 'Curriculum Coordinator Manual', 'Plan, publish and prove the learning programme.', [
    'You own curriculum plans, week-by-week activities and whether assessments actually happened.'
  ], [
    sec('Planning SOP', ['Curriculum plans are the contract: activities, materials and learning goals per week.'], ['Create the plan per classroom/term; attach activities for each week.', 'Publish only when materials are attached (media library).', 'Move drafts to the next term by copying, not by re-typing.']),
    sec('Assessment and portfolio flow', ['Teachers capture observations; you quality-check and publish.'], ['Review assessments per child before publishing to parents.', 'Check portfolio evidence is dated and captioned.', 'Flag children with no progress data for the teacher that week — do not wait for report time.']),
    sec('Weekly curriculum huddle', ['Fifteen minutes, one agenda: coverage, materials, catch-ups.'], ['Export curriculum/assessment reports for the meeting (PDF).', 'Log curriculum gaps as tasks with owners.', 'Publish next week\'s plan by Wednesday.'])
  ]),

  manual('teacher', 'Teacher Manual', 'Your classroom, your children, your records — marked on time, safely.', [
    'You work with assigned classes only. Marked-on-time records protect children and you.'
  ], [
    sec('Morning register SOP', ['Attendance is a safeguarding record, not admin.'], ['Open Attendance → your classroom → today\'s register.', 'Mark present/absent for every child before 10:00; add reasons for absences.', 'If a child is absent, message the guardian from Communications the same morning.']),
    sec('Daily learning and portfolio', ['Capture during the day, tidy later.'], ['Record activities and observations from Curriculum/Assessments while it is fresh.', 'Add portfolio photos with captions (R2 media) — never on your personal phone gallery.', 'Update learner notes that the principal and parents rely on.']),
    sec('Incidents and collections', ['Log it, don\'t carry it.'], ['Report any injury, near-miss or behaviour concern as an incident immediately.', 'Record collections only for authorised collectors on the learner record.', 'Finish your tasks (cleaning rounds, prep) before you leave.'])
  ]),

  manual('assistant_teacher', 'Assistant Teacher Manual', 'Support the room: setup, supervision and accurate records.', [
    'You keep the classroom running so learning can happen, and your records are the second pair of eyes.'
  ], [
    sec('Room setup and register help', ['Set up stations before children arrive; help mark the register.'], ['Confirm stations/materials from today\'s curriculum plan.', 'Help the teacher mark attendance; never mark a child you did not see arrive without asking.', 'Initial staff attendance on arrival via Shifts.']),
    sec('Learning support', ['Capture evidence and keep the room safe.'], ['Add assessment observations the teacher delegates to you.', 'Upload portfolio/media items with captions from the classroom device.', 'Report hazards and incidents immediately.']),
    sec('Close-down', ['Leave the room ready for tomorrow.'], ['Complete assigned tasks (tidy, snack prep, rest area).', 'Check authorised collectors against the learner record before handover.', 'Signal any missing child data to the teacher the same day.'])
  ]),

  manual('support_staff', 'Support Staff Manual', 'Cleaning, kitchen, maintenance and the duties that keep the centre safe.', [
    'Your tasks, inventory checks and safety reports are part of the legal record — do them in the app, not on paper scraps.'
  ], [
    sec('Tasks and checklists', ['Your checklist items (cleaning rounds, kitchen prep, trip prep) prove the work was done.'], ['Open Tasks → your assigned tasks and work the list in order.', 'Tick each checklist item as you finish it; do not batch-tick at home.', 'Mark the task complete only when the area is actually done.']),
    sec('Inventory and safety', ['Low stock and hazards are the two things you must never sit on.'], ['Check Inventory weekly; log low stock before it runs out.', 'Report any hazard, spill or breakage as a Safety incident with a photo.', 'Record staff attendance on arrival; request leave here, not by WhatsApp.']),
    sec('Boundaries', ['Support staff see tasks, inventory and safety — nothing else.'], ['Do not open learner records or parent messages.', 'Ask the manager before photographing children or areas.'])
  ]),

  manual('finance_officer', 'Finance Officer Manual', 'Fees, invoices, payments and the books.', [
    'You make sure every rand is accounted for: billed, paid, reconciled and reported.'
  ], [
    sec('Billing SOP', ['Invoices are generated per learner; payments are reconciled against them.'], ['Generate invoices monthly before the 1st; check the preview for missing learners.', 'Record EFT/cash payments by reference; PayFast payments match automatically.', 'Reconcile daily: unreconciled payments are your oldest first.']),
    sec('Expenses and budget', ['Every expense needs a receipt and a category.'], ['Capture expenses with the receipt (R2 media) the day you spend.', 'Review expenses vs budget weekly; flag overruns to the principal.', 'Export finance reports (CSV/Excel/PDF) monthly for the owner.']),
    sec('Fees, settlements and audits', ['Settlements are the money owed to the centre, not to you personally.'], ['Confirm the centre\'s PayFast/EFT mode in Settings > Billing.', 'Check the audit log for every payment edit — corrections need a reason.', 'Never delete an invoice; void it with a reason instead.'])
  ]),

  manual('admissions_officer', 'Admissions Officer Manual', 'From first enquiry to enrolled child — fast, warm and accurate.', [
    'Families judge the centre by your first reply. Speed and accuracy convert enquiries into enrolments.'
  ], [
    sec('Enquiry SOP (same day)', ['Every enquiry must be answered the same working day.'], ['Log the enquiry with guardian contact and child age.', 'Reply with next steps, fees and a tour invite; mark contacted.', 'Convert to an application when the family commits.']),
    sec('Application to enrolment', ['Applications hold the documents and the placement decision.'], ['Review forms/submissions; chase missing documents by phone, not only email.', 'Enrol: confirm branch and classroom before finishing.', 'Hand the child to the teacher with a note on medical/consent needs.']),
    sec('Public site and forms', ['The website and forms are your shop window.'], ['Keep the public site (About, Programmes, Admissions, Gallery, Contact) current.', 'Publish forms only when live; payments settle automatically.', 'Never publish a phone number you do not answer.'])
  ]),

  manual('parent_guardian', 'Parent / Guardian Manual', 'Your children\'s records, attendance, fees and messages in one place.', [
    'You see only your own children. Everything you do — absences, forms, payments and consent — helps the centre care for them.'
  ], [
    sec('First week setup', ['Link your children and check consent.'], ['Open My children and confirm each child, classroom and teacher.', 'Open Profile and consent: tick only the permissions you grant (photo/media, medical sharing, financial updates).', 'Add your phone — the centre uses it for urgent collections.']),
    sec('Attendance and absence SOP', ['Tell the centre the day before, not after drop-off.'], ['Attendance → Report absence → select one or more children, the date and the reason (submit once for siblings).', 'Future dates only; the centre is notified and your child is marked excused.', 'If your child is ill in the morning, report before 08:00 where possible.']),
    sec('Fees, forms and messages', ['Pay on time, submit forms fully, keep messages in the app.'], ['Fees: view your balance and pay via PayFast; save your receipt.', 'Forms: complete every required field; incomplete forms bounce back.', 'Messages: reply in-app so the centre has a record; for urgent safety issues, phone the centre directly.'])
  ]),

  manual('substitute_staff', 'Substitute Staff Manual', 'Cover a shift safely: attendance, supervision and handover.', [
    'You only see the classes and shifts you are rostered for. When in doubt, ask — never guess about a child.'
  ], [
    sec('Before the shift', ['Know where you are before you arrive.'], ['Open Shifts and note classroom, time and the regular teacher.', 'Arrive and record staff attendance on the device.', 'Read the classroom register and any medical/allergy notes first.']),
    sec('During the shift', ['Mark attendance and keep supervision tight.'], ['Mark learner attendance for your class; phone the office if a child is missing.', 'Log any incident the moment it happens.', 'Only release children to authorised collectors on the learner record.']),
    sec('Handover', ['Leave the room and the record as you found them — better.'], ['Complete your assigned tasks.', 'Write a short handover note for the regular teacher (absences, incidents, worries).', 'Do not download or photograph learner records.'])
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
