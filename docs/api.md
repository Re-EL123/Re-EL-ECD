# API reference

Base path: `/api/v1`. All responses are JSON envelopes:

- Success: `{ "data": ..., "meta": { "requestId": "..." } }`
- Error: `{ "error": { "code": "...", "message": "...", "requestId": "...", "details": [...] } }`

Authentication uses the `reel_session` HttpOnly cookie issued by
`POST /auth/login`. State-changing requests also require the `X-CSRF-Token`
header. `Authorization: Bearer <token>` is supported for automated clients.

Every protected request is scoped by the `X-Organisation-Id` header (or the
`organisationId` query parameter). Membership and permissions are resolved
server-side; a client cannot widen its scope by changing headers.

Generated from the router: **271 routes** across 17 modules.

## Access

| Method | Path | Access |
| --- | --- | --- |
| GET | `/access/delegations` | delegations.manage.daycare |
| POST | `/access/delegations` | delegations.manage.daycare |
| POST | `/access/delegations/:id/revoke` | delegations.manage.daycare |
| GET | `/access/effective/:userId` | access.read.daycare |
| POST | `/access/invitations` | access.manage.daycare |
| GET | `/access/memberships` | access.read.daycare |
| PATCH | `/access/memberships/:id` | access.manage.daycare |
| POST | `/access/memberships/:id/roles` | access.manage.daycare |
| DELETE | `/access/memberships/:id/roles/:roleId` | access.manage.daycare |
| GET | `/access/permissions` | access.read.daycare |
| GET | `/access/roles` | access.read.daycare |

## Admissions

| Method | Path | Access |
| --- | --- | --- |
| GET | `/admissions/applications` | admissions.read.daycare |
| POST | `/admissions/applications` | admissions.manage.daycare |
| GET | `/admissions/applications/:id` | admissions.read.daycare |
| POST | `/admissions/applications/:id/enrol` | admissions.enrol.daycare |
| POST | `/admissions/applications/:id/review` | admissions.manage.daycare |
| GET | `/admissions/enquiries` | admissions.read.daycare |
| POST | `/admissions/enquiries` | admissions.manage.daycare |
| GET | `/admissions/enquiries/:id` | admissions.read.daycare |
| PATCH | `/admissions/enquiries/:id` | admissions.manage.daycare |
| POST | `/admissions/enquiries/:id/convert` | admissions.manage.daycare |
| GET | `/admissions/overview` | admissions.read.daycare |

## Announcements

| Method | Path | Access |
| --- | --- | --- |
| GET | `/announcements` | announcements.read.daycare OR announcements.manage.daycare |
| POST | `/announcements` | announcements.manage.daycare |
| PATCH | `/announcements/:id` | announcements.manage.daycare |
| POST | `/announcements/:id/archive` | announcements.manage.daycare |
| POST | `/announcements/:id/publish` | announcements.manage.daycare |

## Assessments

| Method | Path | Access |
| --- | --- | --- |
| POST | `/assessments/learner` | assessments.create.assigned OR assessments.publish.daycare |
| GET | `/assessments/learner/:learnerId` | assessments.read.daycare OR assessments.read.assigned |
| GET | `/assessments/observations` | assessments.read.daycare OR assessments.read.assigned |
| POST | `/assessments/observations` | assessments.create.assigned OR assessments.read.daycare |
| PATCH | `/assessments/observations/:id` | assessments.create.assigned OR assessments.read.daycare |
| POST | `/assessments/observations/:id/amend` | assessments.publish.daycare |
| POST | `/assessments/observations/:id/publish` | assessments.publish.daycare |
| GET | `/assessments/overview` | assessments.read.daycare |
| GET | `/assessments/periods` | assessments.read.daycare |
| POST | `/assessments/periods` | assessments.publish.daycare |
| POST | `/assessments/reports/generate` | assessments.read.daycare |

## Audit

| Method | Path | Access |
| --- | --- | --- |
| GET | `/audit` | audit.read.daycare |

## Auth

| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/change-password` | Authenticated |
| POST | `/auth/forgot-password` | Public |
| POST | `/auth/invitations/accept` | Public |
| POST | `/auth/login` | Public |
| POST | `/auth/logout` | Authenticated |
| POST | `/auth/reset-password` | Public |
| GET | `/auth/session` | Authenticated |
| POST | `/auth/verify-email` | Authenticated |

## Automation Rules

| Method | Path | Access |
| --- | --- | --- |
| GET | `/automation-rules` | organisation.settings.manage |
| POST | `/automation-rules` | organisation.settings.manage |

## Branches

| Method | Path | Access |
| --- | --- | --- |
| GET | `/branches` | branches.read.daycare |
| POST | `/branches` | branches.manage.daycare |
| PATCH | `/branches/:id` | branches.manage.daycare |

## Classrooms

| Method | Path | Access |
| --- | --- | --- |
| GET | `/classrooms` | classrooms.read.daycare |
| POST | `/classrooms` | classrooms.manage.daycare |
| PATCH | `/classrooms/:id` | classrooms.manage.daycare |

## Communications

| Method | Path | Access |
| --- | --- | --- |
| GET | `/communications/overview` | messages.read.own OR announcements.read.daycare |

## Consent

| Method | Path | Access |
| --- | --- | --- |
| GET | `/consent` | consent.read.daycare |
| POST | `/consent` | consent.manage.daycare |
| POST | `/consent/:id/withdraw` | consent.manage.daycare OR parent.forms.submit.own |

## Conversations

| Method | Path | Access |
| --- | --- | --- |
| GET | `/conversations` | messages.read.own OR announcements.manage.daycare |
| POST | `/conversations` | messages.send.own |
| GET | `/conversations/:id` | messages.read.own OR announcements.manage.daycare |
| POST | `/conversations/:id/close` | messages.send.own |
| POST | `/conversations/:id/messages` | messages.send.own |
| POST | `/conversations/:id/read` | messages.read.own |

## Curriculum

| Method | Path | Access |
| --- | --- | --- |
| GET | `/curriculum/activities` | curriculum.read.daycare |
| POST | `/curriculum/activities` | curriculum.create.daycare |
| GET | `/curriculum/calendar` | curriculum.read.daycare |
| POST | `/curriculum/calendar/events` | curriculum.create.daycare |
| POST | `/curriculum/calendar/events/:id/complete` | curriculum.create.daycare |
| GET | `/curriculum/calendar/events/:id/participation` | curriculum.read.daycare |
| POST | `/curriculum/domains` | curriculum.create.daycare |
| GET | `/curriculum/frameworks` | curriculum.read.daycare |
| POST | `/curriculum/frameworks` | curriculum.create.daycare |
| GET | `/curriculum/lesson-plans` | curriculum.read.daycare |
| POST | `/curriculum/lesson-plans` | curriculum.create.daycare |
| GET | `/curriculum/lesson-plans/:id` | curriculum.read.daycare |
| PATCH | `/curriculum/lesson-plans/:id` | curriculum.create.daycare |
| POST | `/curriculum/lesson-plans/:id/transition` | curriculum.create.daycare |
| GET | `/curriculum/objectives` | curriculum.read.daycare |
| POST | `/curriculum/objectives` | curriculum.create.daycare |
| GET | `/curriculum/overview` | curriculum.read.daycare |
| GET | `/curriculum/periods` | curriculum.read.daycare |
| POST | `/curriculum/periods` | curriculum.create.daycare |

## Dashboard

| Method | Path | Access |
| --- | --- | --- |
| GET | `/dashboard` | reports.read.daycare |

## Expense Categories

| Method | Path | Access |
| --- | --- | --- |
| GET | `/expense-categories` | expenses.read.daycare OR expenses.manage.daycare |
| POST | `/expense-categories` | expenses.manage.daycare |

## Expenses

| Method | Path | Access |
| --- | --- | --- |
| GET | `/expenses` | expenses.read.daycare |
| POST | `/expenses` | expenses.manage.daycare |
| POST | `/expenses/:id/review` | finance.manage.daycare |

## Fee Plans

| Method | Path | Access |
| --- | --- | --- |
| GET | `/fee-plans` | finance.read.daycare |
| POST | `/fee-plans` | finance.manage.daycare |

## Finance

| Method | Path | Access |
| --- | --- | --- |
| GET | `/finance/aging` | finance.read.daycare |
| GET | `/finance/export/invoices` | finance.reports.daycare |
| GET | `/finance/overview` | finance.read.daycare |
| GET | `/finance/reports` | finance.reports.daycare |
| GET | `/finance/statements/:guardianId` | finance.read.daycare |

## Forms

| Method | Path | Access |
| --- | --- | --- |
| GET | `/forms` | forms.read.daycare OR forms.submissions.review.daycare |
| POST | `/forms` | forms.manage.daycare |
| GET | `/forms/:id` | forms.read.daycare OR forms.manage.daycare |
| POST | `/forms/:id/archive` | forms.manage.daycare |
| POST | `/forms/:id/publish` | forms.manage.daycare |
| GET | `/forms/:id/submissions` | forms.submissions.review.daycare |
| POST | `/forms/:id/submit` | parent.forms.submit.own OR forms.read.daycare OR guardians.manage.daycare |
| POST | `/forms/:id/versions` | forms.manage.daycare |
| POST | `/forms/submissions/:id/review` | forms.submissions.review.daycare |

## Incident Actions

| Method | Path | Access |
| --- | --- | --- |
| PATCH | `/incident-actions/:id` | safety.manage.daycare |

## Incidents

| Method | Path | Access |
| --- | --- | --- |
| GET | `/incidents` | safety.read.daycare |
| POST | `/incidents` | safety.report.daycare OR safety.manage.daycare |
| GET | `/incidents/:id` | safety.read.daycare |
| PATCH | `/incidents/:id` | safety.manage.daycare |
| POST | `/incidents/:id/actions` | safety.manage.daycare |
| POST | `/incidents/:id/notify-guardians` | safety.manage.daycare |

## Inventory

| Method | Path | Access |
| --- | --- | --- |
| GET | `/inventory` | inventory.read.daycare |
| POST | `/inventory` | inventory.manage.daycare |
| PATCH | `/inventory/:id` | inventory.manage.daycare |
| GET | `/inventory/:id/transactions` | inventory.read.daycare |
| POST | `/inventory/:id/transactions` | inventory.manage.daycare |

## Invoices

| Method | Path | Access |
| --- | --- | --- |
| GET | `/invoices` | finance.read.daycare |
| POST | `/invoices` | finance.invoice.create.daycare |
| GET | `/invoices/:id` | finance.read.daycare |
| PATCH | `/invoices/:id` | finance.invoice.issue.daycare |
| POST | `/invoices/:id/issue` | finance.invoice.issue.daycare |
| POST | `/invoices/:id/payfast-link` | finance.payment.record.daycare |
| POST | `/invoices/:id/write-off` | finance.manage.daycare |
| POST | `/invoices/generate` | finance.invoice.create.daycare |

## Learner Attendance

| Method | Path | Access |
| --- | --- | --- |
| GET | `/learner-attendance` | attendance.read.daycare OR attendance.read.assigned |
| POST | `/learner-attendance/absence` | attendance.record.assigned OR attendance.record.daycare |
| GET | `/learner-attendance/adjustments` | attendance.correct.daycare |
| POST | `/learner-attendance/adjustments` | attendance.record.assigned OR attendance.record.daycare |
| POST | `/learner-attendance/adjustments/:id/approve` | attendance.correct.daycare |
| POST | `/learner-attendance/check-in` | attendance.record.assigned OR attendance.record.daycare |
| POST | `/learner-attendance/check-out` | attendance.record.assigned OR attendance.record.daycare |
| GET | `/learner-attendance/current-presence` | attendance.read.daycare |
| POST | `/learner-attendance/register` | attendance.record.assigned OR attendance.record.daycare |
| GET | `/learner-attendance/reports` | attendance.reports.daycare |

## Learners

| Method | Path | Access |
| --- | --- | --- |
| GET | `/learners` | learners.read.daycare OR learners.read.assigned |
| POST | `/learners` | learners.create.daycare |
| GET | `/learners/:id` | learners.read.daycare OR learners.read.assigned |
| PATCH | `/learners/:id` | learners.update.daycare OR learners.update.assigned |
| POST | `/learners/:id/archive` | learners.archive.daycare |
| GET | `/learners/:id/collections` | collections.read.daycare |
| POST | `/learners/:id/collections` | collections.record.daycare |
| GET | `/learners/:id/consents` | consent.read.daycare OR learners.read.daycare |
| GET | `/learners/:id/daily-reports` | learners.read.daycare OR learners.read.assigned |
| POST | `/learners/:id/daily-reports` | attendance.record.assigned OR learners.update.daycare |
| GET | `/learners/:id/documents` | learners.read.daycare OR learners.read.assigned |
| POST | `/learners/:id/documents` | learners.update.daycare |
| GET | `/learners/:id/finance` | finance.read.daycare |
| GET | `/learners/:id/guardians` | guardians.read.daycare OR guardians.read.assigned |
| POST | `/learners/:id/guardians` | guardians.manage.daycare |
| PATCH | `/learners/:id/guardians/:linkId` | guardians.manage.daycare |
| GET | `/learners/:id/medical` | medical.read.daycare |
| POST | `/learners/:id/medical` | medical.manage.daycare |
| GET | `/learners/:id/portfolio` | portfolio.read.assigned OR learners.read.daycare |
| POST | `/learners/:id/portfolio` | portfolio.manage.assigned OR learners.update.daycare |
| GET | `/learners/:id/progress` | assessments.read.daycare OR assessments.read.assigned OR parent.read.own |
| GET | `/learners/:id/timeline` | learners.read.daycare OR learners.read.assigned |

## Leave

| Method | Path | Access |
| --- | --- | --- |
| GET | `/leave` | leave.read.daycare OR leave.request.own |
| POST | `/leave` | leave.request.own OR leave.manage.daycare |
| POST | `/leave/:id/review` | leave.manage.daycare |

## Media

| Method | Path | Access |
| --- | --- | --- |
| GET | `/media/assets` | media.read.daycare |
| DELETE | `/media/assets/:id` | media.manage.daycare |
| POST | `/media/assets/:id/complete` | media.upload.daycare |
| GET | `/media/config` | media.read.daycare |
| POST | `/media/uploads` | media.upload.daycare |

## Notifications

| Method | Path | Access |
| --- | --- | --- |
| GET | `/notifications` | Authenticated |
| POST | `/notifications/:id/read` | Authenticated |
| POST | `/notifications/read-all` | Authenticated |
| GET | `/notifications/unread-count` | Authenticated |

## Onboarding

| Method | Path | Access |
| --- | --- | --- |
| GET | `/onboarding/checklist` | organisation.read.daycare |

## Organisation

| Method | Path | Access |
| --- | --- | --- |
| GET | `/organisation/themes` | organisation.read.daycare |
| POST | `/organisation/themes` | organisation.update.daycare |
| DELETE | `/organisation/themes/:id` | organisation.update.daycare |
| PATCH | `/organisation/themes/:id` | organisation.update.daycare |
| POST | `/organisation/themes/:id/apply` | organisation.update.daycare |

## Organisations

| Method | Path | Access |
| --- | --- | --- |
| GET | `/organisations/current` | organisation.read.daycare |
| PATCH | `/organisations/current` | organisation.update.daycare |
| GET | `/organisations/current/settings` | organisation.read.daycare |
| PATCH | `/organisations/current/settings` | organisation.settings.manage |

## Parent

| Method | Path | Access |
| --- | --- | --- |
| GET | `/parent/announcements` | parent.read.own |
| GET | `/parent/children` | parent.read.own |
| GET | `/parent/children/:id` | parent.read.own |
| POST | `/parent/children/:id/absence` | parent.absence.report.own |
| GET | `/parent/children/:id/assessments` | parent.read.own |
| GET | `/parent/children/:id/attendance` | parent.read.own |
| GET | `/parent/children/:id/daily-reports` | parent.read.own |
| GET | `/parent/children/:id/invoices` | parent.finance.read.own |
| GET | `/parent/children/:id/portfolio` | parent.read.own |
| GET | `/parent/children/:id/progress` | parent.read.own |
| GET | `/parent/consents` | parent.read.own |
| GET | `/parent/finance/summary` | parent.finance.read.own |
| GET | `/parent/forms` | parent.forms.submit.own |
| GET | `/parent/invoices/:id` | parent.finance.read.own |
| POST | `/parent/invoices/:id/pay` | parent.finance.read.own |
| GET | `/parent/overview` | parent.read.own |

## Payments

| Method | Path | Access |
| --- | --- | --- |
| GET | `/payments` | finance.read.daycare |
| POST | `/payments` | finance.payment.record.daycare |
| POST | `/payments/:id/reconcile` | finance.payment.reconcile.daycare |
| POST | `/payments/:id/reverse` | finance.manage.daycare |

## Platform

| Method | Path | Access |
| --- | --- | --- |
| GET | `/platform/audit-events` | Platform only · platform.audit.read |
| GET | `/platform/features` | Platform only · platform.organisations.read |
| PATCH | `/platform/features/:key` | Platform only · platform.features.manage |
| GET | `/platform/health` | Platform only · platform.health.read |
| GET | `/platform/organisations` | Platform only · platform.organisations.read |
| POST | `/platform/organisations` | Platform only · platform.organisations.manage |
| GET | `/platform/organisations/:id` | Platform only · platform.organisations.read |
| PATCH | `/platform/organisations/:id` | Platform only · platform.organisations.manage |
| POST | `/platform/organisations/:id/restore` | Platform only · platform.organisations.manage |
| POST | `/platform/organisations/:id/suspend` | Platform only · platform.organisations.manage |
| GET | `/platform/overview` | Platform only · platform.organisations.read |
| GET | `/platform/settings` | Platform only · platform.organisations.read |
| PATCH | `/platform/settings` | Platform only · platform.settings.manage |
| GET | `/platform/subscriptions` | Platform only · platform.subscriptions.read |
| GET | `/platform/support-cases` | Platform only · platform.support.manage |
| POST | `/platform/support-cases` | Platform only · platform.support.manage |

## Public

| Method | Path | Access |
| --- | --- | --- |
| GET | `/public/daycares/:slug` | Public |
| GET | `/public/daycares/:slug/enquiry-form` | Public |
| POST | `/public/enquiries` | Public |
| GET | `/public/forms/:orgSlug/:formSlug` | Public |
| POST | `/public/forms/:orgSlug/:formSlug/submit` | Public |
| POST | `/public/payfast/itn` | Public |
| GET | `/public/payfast/return` | Public |

## Reports

| Method | Path | Access |
| --- | --- | --- |
| GET | `/reports` | reports.read.daycare OR reports.read.assigned |
| GET | `/reports/:key` | reports.read.daycare OR reports.read.assigned |
| POST | `/reports/jobs` | reports.export.daycare |

## Safety

| Method | Path | Access |
| --- | --- | --- |
| GET | `/safety/compliance` | safety.read.daycare |
| GET | `/safety/overview` | safety.read.daycare |

## Search

| Method | Path | Access |
| --- | --- | --- |
| GET | `/search` | Authenticated |

## Shifts

| Method | Path | Access |
| --- | --- | --- |
| GET | `/shifts` | shifts.read.daycare OR shifts.read.assigned |
| POST | `/shifts` | shifts.create.daycare |
| PATCH | `/shifts/:id` | shifts.create.daycare |
| POST | `/shifts/:id/approve` | shifts.approve.daycare |
| POST | `/shifts/:id/cancel` | shifts.create.daycare |

## Staff

| Method | Path | Access |
| --- | --- | --- |
| GET | `/staff` | staff.read.daycare |
| POST | `/staff` | staff.manage.daycare |
| GET | `/staff/:id` | staff.read.daycare |
| PATCH | `/staff/:id` | staff.manage.daycare |
| POST | `/staff/:id/classrooms` | staff.manage.daycare |
| GET | `/staff/:id/documents` | staff.read.daycare |
| POST | `/staff/:id/documents` | staff.manage.daycare |
| POST | `/staff/:id/documents/:documentId/verify` | staff.manage.daycare |
| POST | `/staff/:id/training` | staff.manage.daycare |
| GET | `/staff/overview` | staff.read.daycare OR tasks.read.own |

## Staff Attendance

| Method | Path | Access |
| --- | --- | --- |
| GET | `/staff-attendance` | staff_attendance.read.daycare |
| POST | `/staff-attendance/break-end` | staff_attendance.record.own OR staff_attendance.record.daycare |
| POST | `/staff-attendance/break-start` | staff_attendance.record.own OR staff_attendance.record.daycare |
| POST | `/staff-attendance/clock-in` | staff_attendance.record.own OR staff_attendance.record.daycare |
| POST | `/staff-attendance/clock-out` | staff_attendance.record.own OR staff_attendance.record.daycare |
| POST | `/staff-attendance/events` | staff_attendance.correct.daycare |
| GET | `/staff-attendance/me` | staff_attendance.record.own OR staff_attendance.read.assigned OR staff_attendance.read.daycare |
| GET | `/staff-attendance/summary` | staff_attendance.read.daycare |

## Suppliers

| Method | Path | Access |
| --- | --- | --- |
| GET | `/suppliers` | expenses.read.daycare OR expenses.manage.daycare |
| POST | `/suppliers` | expenses.manage.daycare |

## Tasks

| Method | Path | Access |
| --- | --- | --- |
| GET | `/tasks` | tasks.read.own OR tasks.read.daycare |
| POST | `/tasks` | tasks.read.own OR tasks.manage.daycare |
| GET | `/tasks/:id` | tasks.read.own OR tasks.read.daycare |
| PATCH | `/tasks/:id` | tasks.read.own OR tasks.manage.daycare |
| POST | `/tasks/:id/checklist` | tasks.read.own OR tasks.manage.daycare |
| DELETE | `/tasks/:id/checklist/:itemId` | tasks.read.own OR tasks.manage.daycare |
| PATCH | `/tasks/:id/checklist/:itemId` | tasks.read.own OR tasks.manage.daycare |
| POST | `/tasks/:id/comments` | tasks.read.own OR tasks.read.daycare |
| GET | `/tasks/overview/counts` | tasks.read.own OR tasks.read.daycare |

## Timesheets

| Method | Path | Access |
| --- | --- | --- |
| GET | `/timesheets` | timesheets.read.daycare |
| POST | `/timesheets/:id/transition` | timesheets.approve.daycare |
| POST | `/timesheets/generate` | timesheets.approve.daycare |

## Website

| Method | Path | Access |
| --- | --- | --- |
| GET | `/website` | website.read.daycare |
| PATCH | `/website` | website.manage.daycare |
| POST | `/website/domains` | website.manage.daycare |
| POST | `/website/publish` | website.manage.daycare |
| POST | `/website/unpublish` | website.manage.daycare |

## Common status codes

| Status | Meaning |
| --- | --- |
| 200 | Success |
| 201 | Created |
| 401 | Not authenticated, invalid credentials or expired session |
| 403 | Forbidden, CSRF failure, suspended account or tenant mismatch |
| 404 | Record not found or not visible in the active organisation |
| 409 | Conflict with the current state (duplicate, invalid transition) |
| 422 | Validation error; `error.details` lists the fields |
| 429 | Rate limited |
| 500 | Unexpected error; quote the `requestId` when reporting it |
