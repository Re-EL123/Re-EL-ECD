# Legal review checklist — Operator / DPA and safeguarding disclaimer

**Status: DRAFT — NOT REVIEWED BY A SOUTH AFRICAN ATTORNEY.**

I prepared these documents as working templates. I cannot engage or instruct an
attorney, and nothing here is legal advice. They must be reviewed by a qualified
South African practitioner before being published as final policies, sent to
customers, or signed. The DPA page carries a visible draft warning until this
status changes.

## Documents prepared

| Document | Public page | Editable document slug |
|---|---|---|
| Operator / Data Processing Agreement | `#/legal/data-processing-agreement` | `data-processing-agreement` |
| Safeguarding & Operational Disclaimer | `#/legal/safeguarding-disclaimer` | `safeguarding-disclaimer` |
| Terms of Service (updated) | `#/legal/terms` | `terms` |
| Privacy Policy (updated) | `#/legal/privacy` | `privacy` |

The public pages are in `apps/web/src/views/public.js` (`LEGAL_PAGES`). The
editable copies are seeded from `apps/api/src/services/document-service.js`
(`DEFAULT_DOCUMENTS`) and migration `056_legal_data_agreements.sql`. The live
page prefers the database copy, so **update both** when counsel returns edits —
platform admins can edit the database copy at Platform → Configuration →
Documents.

## What the DPA currently covers

- Centre as responsible party and Re-EL ECD as operator/processor (POPIA s19–20).
- Centre's warranty of lawful authority to collect children's information,
  including guardian consent or another s35 basis, and the Children's Act.
- Re-EL ECD's protection duties, including confidentiality and sub-processor flow-down.
- A closed list of permitted processing purposes.
- Named hosting and third-party providers (schedule in clause 5).
- Restrictions on access, sharing and disclosure, including audited support access.
- Security requirements (encryption, RBAC, MFA, sessions, audit, signed media URLs).
- What happens on termination or suspension of a subscription.
- Export, retention and deletion, including the 30-day residual-copy commitment.
- Security incident reporting, centre notification and POPIA s22 regulator/subject notice.

## What the attorney must verify or complete

1. **Entity details.** Confirm `Re-EL ECD Technologies (Pty) Ltd`, registration
   `2026/000001/07` (this looks like a placeholder), registered address, and the
   Information Officer's name and contact details.
2. **Correct legal characterisation.** Confirm that the centre is the responsible
   party and Re-EL ECD is the operator for each processing activity, and identify
   any activity where Re-EL ECD is itself a responsible party (the draft says
   platform security, billing and statutory records).
3. **Children's information.** Confirm the s35 basis relied on, the form of
   guardian consent, and whether the centre's process meets the Children's Act
   and DSD/DBE requirements. Verify the indemnity in clause 2 is enforceable and
   appropriately limited.
4. **Sub-processor schedule.** Confirm the current providers and their actual
   locations, and execute written POPIA-compliant terms with each. The draft
   names Vercel, GitHub Pages, Neon, Cloudflare R2, Resend, textbee / Africa's
   Talking / Twilio, PayFast, Web Push/VAPID, GA4, Search Console, Google Fonts
   and Open-Meteo. Confirm whether any are out of scope for centre data.
5. **Cross-border transfers.** Confirm s72 safeguards for each provider outside
   South Africa and whether the transfer-impact assessment is required.
6. **Security representations.** Verify the controls in clause 7 are actually
   operating as described, including encryption at rest, backup/PITR and a
   documented restore test. The repo documents encryption for secrets and
   provider-managed encryption; do not overstate this in the final agreement.
7. **Retention and deletion.** Confirm the 30-day deletion commitment is
   operationally achievable, how backups are handled, and which records must be
   kept under tax, company and ECD law. There is currently no self-service
   "delete my organisation" flow — the agreement should not imply one.
8. **Incident response.** Confirm POPIA s22 timelines, who notifies the
   Information Regulator, and the centre's own notification duties. Add a
   monitored `security@re-el.co.za` (or equivalent) address before publication.
9. **Terms and disclaimers.** Confirm the registration/compliance disclaimer,
   the liability cap, and the safeguarding disclaimer are consistent with the
   CPA and sector law, and that tenant marketing ("Registered ECD centre"
   defaults) cannot be read as a platform verification.
10. **Signature block and execution.** Complete the parties, dates and signing
    authority, and decide whether this is a click-through, a signed schedule to
    the Terms, or a separate agreement.

## How to finalise

1. Send this document and the two pages above to counsel with the checklist.
2. Apply counsel's edits to **both** `LEGAL_PAGES` in `public.js` and
   `DEFAULT_DOCUMENTS` in `document-service.js`; add a migration if the live
   documents have been edited by a platform admin.
3. Remove the draft banner from `LEGAL_NOTICES['data-processing-agreement']` and
   change the `eyebrow` from `POPIA · DRAFT` once counsel signs off.
4. Bump `LEGAL_UPDATED`, asset versions and the service-worker cache, and record
   the review date and attorney name here.

## Security Incident & Breach Response Procedure (added later)

`docs/breach-response.md` is the internal playbook; the tenant-facing summary is
the `breach-response` legal document. Both are marked as unreviewed operational
templates and must be approved by the Information Officer and counsel.

Additional review points:

1. Confirm the appointed Information Officer and Deputy, and publish their contact details.
2. Confirm the current Information Regulator submission channel (eServices portal vs guidance-specified email) and the current prescribed Security Compromise Notification Form at the time of an incident.
3. Verify the operator/responsible-party split for each data category, especially where Re-EL hosts its own account/billing data.
4. Confirm the evidence-retention period and legal-hold process with counsel.
5. Check the "ten business days" post-incident review target against the centre's policies.
6. Re-check the official links before each use: Information Regulator fact sheet (Aug 2025), section 22 guidelines, POPIA forms page, eServices portal.

## Backups and exports (added later)

`docs/backup-restore.md` defines RPO 24h / RTO 4h, nightly logical backups,
quarterly restore drills and the tenant export path. Legal review should confirm:

1. The Privacy Policy, Terms and DPA disclosures about backup cycles and export sensitivity are adequate.
2. The 24-hour signed-link expiry and 30-day backup retention are operationally accurate.
3. The termination export is issued inside the stated transition window.
4. `R2_BACKUP_BUCKET`, `NEON_PITR_CONFIRMED` and `R2_VERSIONING_CONFIRMED` are set in production and reflected in `/platform/backups`.
