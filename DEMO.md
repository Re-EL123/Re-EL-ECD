# Demonstration data

This file is the single source of truth for the seeded demonstration dataset.
It is **documentation only**: no password or demo account is shown on the
sign-in screen, injected into the production bundle, or written to runtime
logs.

> **Production safety:** the seed command refuses to run in production without
> an explicit `DATABASE_URL`, and it never changes a password that already
> exists. Run it against a local or staging database only. For a real
> production install use `npm run bootstrap:platform` (see
> [Production bootstrap](#production-bootstrap)).

## Seed the demo dataset

```bash
npm run seed            # adds the demo data if the database is empty
npm run seed -- --force # deletes seeded tables first, then reseeds
```

`npm run dev` also seeds automatically when `DATABASE_URL` is unset, using the
embedded development database.

## Demo accounts

All seeded accounts use the password:

```
Re-EL-Demo-2026!
```

| Email | Role | Organisation |
| --- | --- | --- |
| `platform@re-el-ecd.local` | Platform super admin | Re-EL Platform |
| `support@re-el-ecd.local` | Platform support admin | Re-EL Platform |
| `platformfinance@re-el-ecd.local` | Platform finance admin | Re-EL Platform |
| `owner@littlesprouts.local` | Organisation owner | Little Sprouts ECD |
| `principal@littlesprouts.local` | Principal | Little Sprouts ECD |
| `admin@littlesprouts.local` | Daycare administrator | Little Sprouts ECD |
| `manager@littlesprouts.local` | Daycare manager | Little Sprouts ECD |
| `curriculum@littlesprouts.local` | Curriculum coordinator | Little Sprouts ECD |
| `teacher@littlesprouts.local` | Teacher | Little Sprouts ECD |
| `assistant@littlesprouts.local` | Assistant teacher | Little Sprouts ECD |
| `support@littlesprouts.local` | Support staff | Little Sprouts ECD |
| `finance@littlesprouts.local` | Finance officer | Little Sprouts ECD |
| `admissions@littlesprouts.local` | Admissions officer | Little Sprouts ECD |
| `parent@littlesprouts.local` | Parent / guardian | Little Sprouts ECD |
| `parent2@littlesprouts.local` | Parent / guardian | Little Sprouts ECD |
| `substitute@littlesprouts.local` | Substitute staff | Little Sprouts ECD |
| `owner@sunrise.local` | Organisation owner | Sunrise Kids Academy |
| `principal@sunrise.local` | Principal | Sunrise Kids Academy |

## Seeded organisations

| Organisation | Slug | Status | Plan |
| --- | --- | --- | --- |
| Re-EL Platform | `re-el-platform` | Active | Internal platform tenant |
| Little Sprouts ECD | `little-sprouts` | Active | Sapling |
| Sunrise Kids Academy | `sunrise-kids` | Trial | Seedling |

Every organisation receives a free platform address of the form
`https://<slug>.re-el.co.za`. The seeded Little Sprouts site is therefore also
reachable at `https://little-sprouts.re-el.co.za`.

## Seeded plans and feature flags

| Plan | Key | Monthly price | Learner limit | Staff limit |
| --- | --- | --- | --- | --- |
| Seedling | `seedling` | R499 | 50 | 5 |
| Sapling | `sapling` | R999 | 120 | 15 |
| Evergreen | `evergreen` | R1 899 | 300 | 40 |

Feature flags seeded: `parent_portal`, `finance`, `website_builder` (enabled),
`ai_assistance`, `sms_notifications` (disabled).

## Seeded operational data

The demonstration seed covers the full product surface:

- Two branches for Little Sprouts (Rosebank and Soweto) and one for Sunrise.
- Learners, guardians, classrooms, enrolments and admission applications.
- Attendance, daily reports, observations and assessments.
- Staff profiles, shifts, leave requests, timesheets and training records.
- Invoices, payments, expenses, suppliers and inventory.
- Forms, announcements, conversations, tasks, incidents and audit events.
- A published Little Sprouts website with six pages
  (`little-sprouts`), plus a Sunrise website record.

Demo images are intentionally not uploaded. The public site shows designed
placeholders until a real hero, gallery or logo image is added through
**Media library** or **Public website → Hero/Gallery**.

## Production bootstrap

Do **not** use the demo seed for a live install. Create the first platform
administrator with a password you choose:

```bash
export DATABASE_URL='postgresql://…'
export BOOTSTRAP_EMAIL='you@yourcentre.co.za'
export BOOTSTRAP_NAME='Your Name'
export BOOTSTRAP_PASSWORD='a-long-unique-password'
npm run bootstrap:platform
```

The script is idempotent. It applies migrations, seeds the role/permission
catalogue and the default plans and feature flags, then creates the platform
organisation and the first platform super admin if they do not already exist.
It never prints the password and never overwrites an existing user.

Remove the environment variables from your shell after the script finishes.
