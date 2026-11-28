# Backup, restore and data export runbook

## Targets

- **RPO (recovery point objective): 24 hours.**
- **RTO (recovery time objective): 4 hours.**
- Tenants can retrieve their own information at any time from **Settings → Data & backups**; signed export links expire after 24 hours.

## What exists

1. **Neon managed backups + point-in-time restore (PITR)** — the primary recovery path. Confirm it is enabled in the Neon console and record the date in the change log.
2. **Nightly logical backup** — `POST /api/v1/cron/platform-backup` (Vercel Cron, 02:00 daily) writes a ZIP of every critical table plus a checksum manifest to `nightly/YYYY-MM-DD/full-backup.zip` in `R2_BACKUP_BUCKET`. It is guarded by `CRON_SECRET` and audited as `platform.backup_completed`.
3. **Media bucket versioning** — enable versioning on both the media and backup buckets. This protects against accidental deletion of child photos.
4. **Tenant exports** — a full centre export (ZIP of CSV/JSON per entity + media manifest) stored in the backup bucket under `exports/<org>/<job>.zip` and delivered by a 24-hour signed link. Weekly/monthly scheduled exports and automatic termination exports are created by `POST /api/v1/cron/data-exports` (03:00 daily).

## Required configuration

```
R2_BACKUP_BUCKET=<separate private bucket, not the media bucket>
R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_REGION
CRON_SECRET=<shared secret for cron endpoints>
NEON_PITR_CONFIRMED=true        # set only after console verification
R2_VERSIONING_CONFIRMED=true    # set only after console verification
```

The backup bucket must **not** be publicly accessible. Use a dedicated API token scoped to that bucket where possible. Backup access is limited to platform operators and every run is written to `audit_events`.

## Verification checklist (operator)

- [ ] Neon PITR enabled; screenshot or console note dated
- [ ] Nightly backup cron succeeds; `platform/backups` shows a recent `lastBackup`
- [ ] Backup object exists in `R2_BACKUP_BUCKET` and is not publicly readable
- [ ] Media and backup bucket versioning enabled
- [ ] `CRON_SECRET` set and rotated with the team's secret policy
- [ ] Backup object can be downloaded and the ZIP passes an integrity check
- [ ] Quarterly restore drill completed and signed off (below)

## Quarterly restore drill

Run on the first week of each quarter. Total time should fit inside the 4-hour RTO.

1. Pick the most recent nightly backup and download it from the backup bucket.
2. Verify the ZIP: `unzip -t full-backup.zip` and compare file checksums against `manifest.json`.
3. Restore into a **throwaway** database — never into production.
4. Spot-check: one organisation, its learners, guardians, attendance, observations, invoices and audit events; confirm row counts match the manifest.
5. Confirm a media object can be restored from a versioned bucket.
6. Record: date, operator, backup used, restore duration, issues found, sign-off. File the record with the compliance file.
7. If the drill exceeds RTO or fails, raise a corrective action with an owner and due date.

## Tenant export runbook

- Centre: Settings → Data & backups → **Export my centre data**.
- Operator: `POST /api/v1/data-exports` as an owner/principal, or `POST /api/v1/automation/data-exports` for platform staff.
- The job creates a ZIP, stores it in the private backup bucket, emails the owner a signed link, and records a `data_export.*` audit event.
- If a job fails, the `error` field on the export row explains why — usually missing R2 backup configuration.
- Expired links cannot be revived; create a new export.

## Legal alignment

The Privacy Policy, Terms and Operator/DPA now state that encrypted backups age out in their ordinary cycle and that exports contain sensitive personal information the centre must store securely. Keep `docs/legal-review.md` in sync when changing retention or provider details.
