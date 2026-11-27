# Security Incident & Breach Response Procedure

**Status: DRAFT — requires approval by Re-EL ECD's Information Officer (or Deputy) and review by a South African attorney before adoption.** This is an operational procedure, not legal advice.

## Scenario this answers

> Someone gains unauthorised access to an ECD centre's learner records.

This document describes exactly what happens, in order, who does what, and what must be written down. It is built around POPIA section 22 and the Information Regulator's published guidance.

## Roles and the reporting duty (read this first)

- The **centre** is the **responsible party** for the learner, guardian and staff information it enters. Its **Information Officer (IO) or Deputy Information Officer** must notify the **Information Regulator** and the affected **data subjects**.
- **Re-EL ECD Technologies (Pty) Ltd** is normally an **operator** (processor) of that information. When Re-EL becomes aware of a security compromise affecting a centre, it must **immediately notify the centre**, and give the centre the information it needs to notify the Regulator and data subjects.
- Re-EL only notifies the Regulator directly where Re-EL itself is the responsible party — for example, a compromise of its own platform account or billing data.
- Re-EL must never notify parents/guardians on a centre's behalf unless the centre asks it to in writing and the centre remains responsible for the content and timing.

**Clock starts at T0** = the moment there are reasonable grounds to believe personal information was accessed or acquired without authorisation. The compromise does not have to be confirmed before reporting starts. A full investigation is not a precondition. If there is a delay, the reason must be recorded and explained in the notification.

**There is no risk threshold.** The Information Regulator's 2025 fact sheet confirms that *all* security compromises must be reported, regardless of the level of risk.

## Contacts (complete before adoption)

| Role | Contact | Notes |
|---|---|---|
| Re-EL Information Officer / Deputy | **TO BE COMPLETED** | Appoint and publish before go-live |
| Privacy / incident intake | privacy@re-el.co.za | Monitored; use for operator→centre notice |
| Support | support@re-el.co.za | Secondary channel |
| Information Regulator eServices portal | https://eservices.inforegulator.org.za/user/login.aspx | Current lodgement channel |
| Information Regulator enquiries | enquiries@inforegulator.org.za · 010 023 5200 · toll free 0800 017 160 | Confirm current submission route in guidance |

---

## 1. Detecting and investigating the incident

1. **Detect.** Possible sources: audit events (`audit_events`), failed-login spikes, unusual impersonation or export activity, Support cases, platform diagnostics (errors by device/OS), infrastructure and R2 access logs, or a report from a centre or parent.
2. **Record T0.** Write down when the incident was first noticed, who noticed it, and what was observed. Do not wait for certainty.
3. **Appoint an incident lead.** Re-EL: engineering lead + Information Officer. Centre: owner/principal + safeguarding lead. One person owns the incident log; one person owns communications.
4. **Open the incident record** (see template A). Give it an incident number.
5. **Triage questions** — answer in writing as facts arrive:
   - What happened and how was it discovered?
   - Which system/tenant was affected; was access still active at discovery?
   - Which categories of personal information were involved (children's information, medical/special personal information, guardian contact details, finance)?
   - How many learners/guardians/staff are potentially affected?
   - Was there any onward disclosure, copying or export?
   - Is law enforcement or the DSD/DBE involved?
6. **Classify provisionally** as suspected/confirmed, and update as evidence is gathered. Every classification change is logged with a timestamp.
7. **Investigate without contaminating evidence.** Read-only queries and log copies first; no destructive changes until step 3 is complete.
8. **Review telemetry and audit data** for the affected window: sessions, impersonations, exports, media downloads, and error spikes that may reveal the access path.

## 2. Restricting unauthorised access

Do these in order, recording each action and its time:

1. **Preserve first, then contain** — if containment would destroy volatile evidence, capture it first (step 3).
2. **Revoke the account's sessions** and all active impersonation sessions (`revokeAllSessions`, impersonation cookie revocation).
3. **Disable or suspend the affected user** (or all users in the affected centre if scope is unclear). Suspension immediately revokes sessions across branches.
4. **Rotate credentials** for any exposed API keys, R2 tokens, TOTP secrets or PayFast credentials; invalidate reset and verification tokens for affected accounts.
5. **Block the source** — rate-limit or block offending IPs at the edge/WAF, and disable public signup or the affected public endpoint if it is the entry point.
6. **Close the path** — patch the vulnerability, remove the malicious artefact, and verify no persistence remains (new users, new roles, new API tokens, changed settings).
7. **Verify containment** with a second person before declaring access closed. Write the verification result into the incident record.
8. **Do not** delete records, wipe logs or rebuild systems until the evidence register is complete.

## 3. Preserving relevant logs and evidence

1. **Freeze the window.** Copy, do not edit:
   - `audit_events`, `sessions`, `email_deliveries`, `notification_deliveries`, `payment_webhook_events`, `platform_subscription_invoices`
   - `telemetry_events` (route/error/device facts for the affected window)
   - application/request logs (Vercel), database logs and snapshots (Neon), R2 access logs, WAF/CDN logs
   - the centre's own exports, emails and incident reports
2. **Export to immutable storage** with a dated folder per incident number. Take a database snapshot before any destructive migration or cleanup.
3. **Keep a chain of custody:** who collected each artefact, when, from where, its hash, and who accessed it afterwards. Limit access to the incident team.
4. **Do not search personal data more widely than necessary.** Evidence handling is itself processing of personal information.
5. **Preserve privileged material** carefully — legal advice and law-enforcement correspondence may be privileged; label it accordingly.

Evidence register fields: artefact · source · time range · collected by · hash · storage location · accessed by · retained until.

## 4. Informing the affected centre

1. **Timing:** Re-EL notifies the centre **immediately** once it is aware of a suspected or confirmed compromise affecting that centre — before the investigation is complete. Further information follows as it is established.
2. **Channel:** written notice by email to the owner/principal (plus in-app notification where available), with a phone call for high-risk incidents. Record the time and method.
3. **Minimum content:**
   - that a security compromise is suspected/confirmed and when it occurred or was discovered;
   - what Re-EL knows about the access path and which systems were involved;
   - which categories of information may have been accessed (including children's information and any medical/special personal information);
   - what Re-EL has already done to contain it;
   - what the centre must do now (see below);
   - who at Re-EL to contact, and a commitment to provide updates.
4. **Tell the centre clearly that it must notify** the Information Regulator and affected data subjects — Re-EL cannot do this for them. Point them to section 6 and to the official guidance.
5. **Ask the centre to confirm** its Information Officer/Deputy details, and whether law enforcement or DSD/DBE has been engaged.

Template B (centre notice) is below.

## 5. Determining which individuals are affected

1. Scope by tenant (`organisation_id`), then by records the attacker could actually reach: learners, guardians, staff, linked medical records, attendance, observations, documents, invoices and media.
2. Establish, per record, whether there are **reasonable grounds to believe** the information was accessed or acquired by an unauthorised person. Reasonable grounds is enough — proof of actual viewing is not required.
3. List data categories separately: identity, contact details, dates of birth, medical/allergy notes (special personal information), photos, finance, and any other special personal information.
4. Count affected individuals and, where possible, identify them. If identities cannot be established, record why and keep the reasoning.
5. Note the consequences that could follow for each category (identity theft, targeted contact, exposure of health information, custody or safeguarding risk).
6. Produce a restricted **affected-data schedule** (incident number, centre, counts, categories, time window, confidence). Share only what the centre needs to notify.
7. Update the schedule as facts change; every version is timestamped.

## 6. Following the applicable POPIA notification requirements

**The centre's Information Officer / Deputy must:**

1. **Notify the Information Regulator** as soon as reasonably possible after discovery, using the current prescribed **Security Compromise Notification Form** and guidance, lodged through the Regulator's **eServices portal**. If the portal is unavailable, confirm the alternative channel in the current guidance and keep proof of submission.
   - The form asks for: date of compromise and date of reporting; type of compromise; incident description; type of personal information (children's, special personal information, identifiers, other); number of affected data subjects and method of notification; possible consequences; measures taken or planned; recommended mitigation steps for data subjects; identity of the unauthorised person if known; and whether the compromise is confirmed or alleged.
   - Save the acknowledgement and reference number.
2. **Notify affected data subjects in writing** — letter, email, prominent website notice, or media notice, as directed by the Regulator. The notice must give enough information to take protective measures:
   - what happened and when;
   - the possible consequences;
   - measures the centre has taken or will take;
   - recommended steps for the individual;
   - the identity of the unauthorised person, if known.
3. **Do not wait for a complete investigation.** Report with the information available and update the Regulator and data subjects as more is known. Record the reason for any delay.
4. **Keep a website notice for 30–90 days** where a website notice is used, based on how likely data subjects are to see it.
5. **Cooperate** with the Regulator's follow-up questions and any law-enforcement process.

**Re-EL's obligations in parallel:**

- Immediately notify the centre (section 4) and provide the affected-data schedule and evidence summary.
- Provide reasonable assistance with the form and with data-subject notices.
- Where Re-EL is itself the responsible party (its own account/billing data), complete its own notification through its Information Officer.

Official guidance (check for the current version before each incident):

- Information Regulator, **Fact Sheet: Handling of Security Compromises** (19 Aug 2025): https://inforegulator.org.za/2025/08/19/fact-sheet-handling-of-security-compromises
- Information Regulator, **Guidelines on completing a Security Compromise Notification in terms of section 22**: https://inforegulator.org.za/wp-content/uploads/2020/07/Guidelines-on-completing-a-Security-Compromise-Notification-ito-Section-22-POPIA.pdf
- Information Regulator, **POPIA forms**: https://inforegulator.org.za/popia-forms/
- **eServices portal**: https://eservices.inforegulator.org.za/user/login.aspx
- POPIA section 22 text: https://popia.co.za/section-22-notification-of-security-compromises

## 7. Documenting corrective actions

1. Keep one **incident record** per incident, including: incident number, T0, discovery source, people involved, decisions, times, evidence register, containment steps, notifications sent (with copies and delivery proof), affected-data schedules, and the Regulator's reference number.
2. Within **10 business days** of containment, hold a post-incident review with the centre. Record:
   - root cause and contributing factors;
   - what worked and what failed in detection, containment and communication;
   - corrective and preventive actions, each with an owner and due date;
   - verification that each action was completed.
3. Update the risk register, security controls, role permissions, sub-processor list and the DPA/Privacy Policy if the facts changed. Train staff on the lesson.
4. Retain the incident record in line with the centre's retention policy and any legal hold. Do not delete evidence while a regulator or law-enforcement matter is open.
5. Track recurring incidents: two or more with the same root cause require an escalation review by Re-EL's Information Officer.

---

## Template A — internal incident record

```
Incident number:        T0 (discovery):        Discovered by:
Suspected / confirmed:  Systems affected:      Organisations affected:
Data categories:        Individuals affected:  Access still active? Y/N
Incident lead:          Comms lead:            Information Officer:
Containment actions (time / action / by / verified by):
Evidence register (artefact / source / hash / collected by / location):
Centre notified (time / method / recipient):
Regulator notified (time / reference / by):    Data subjects notified (time / method):
Root cause:             Corrective actions (owner / due / verified):
Lessons / follow-up:    Record closed by / date:
```

## Template B — notice to the centre (from Re-EL as operator)

```
Subject: Security incident affecting [Centre name] — immediate action required

Hello [name],

We are writing to let you know that on [date] we discovered [suspected/confirmed]
unauthorised access to [system] used by [Centre name]. The access occurred
between [dates] and we closed it on [date/time] by [brief containment summary].

What we know: [plain description]
Information that may have been accessed: [categories, including children's
information or medical notes if relevant]
What we have done: [containment, preservation of logs, investigation]
What we need you to do now:
  1. Treat this as a security compromise under POPIA section 22. As the
     responsible party, your Information Officer must notify the Information
     Regulator via the eServices portal as soon as reasonably possible.
  2. Identify affected learners, guardians and staff and notify affected
     individuals in writing with the information POPIA requires.
  3. Tell us your Information Officer's details and whether you have engaged
     SAPS or the DSD/DBE.

We will keep you updated as facts are confirmed. Contact: privacy@re-el.co.za.

[Name], [role], Re-EL ECD
```

## Template C — data-subject notice (centre to send)

```
Subject: Important information about your child's records

[Centre name] is writing to tell you about a security compromise on [date]
that may have involved [describe information, e.g. your child's name, date
of birth and attendance records / medical notes].

What happened: [plain language]
What we have done: [containment and investigation]
What this could mean for you: [possible consequences]
What we recommend you do: [specific protective steps]
Who accessed the information: [identity if known, otherwise "we do not yet
know; we will tell you if we find out"]
How to contact us: [email / phone]
The Information Regulator reference number is: [if available]
```
