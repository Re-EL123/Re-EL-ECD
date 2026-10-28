# Role-based access control

Re-EL ECD uses deny-by-default authorisation. Every protected API route
declares the permission it needs; the server resolves the caller's membership,
roles, delegations and branch scope before the handler runs. The frontend uses
the same permission list only to decide what to show — it is never the
enforcement point.

## Permission naming

Permissions follow `resource.action.scope`, for example
`learners.read.daycare`. A few parent permissions use a four-part form to keep
the family context explicit, for example `parent.forms.submit.own`.

| Scope | Meaning |
| --- | --- |
| `platform` | Platform-wide administration. No tenant data by default. |
| `organisation` | Organisation-wide records. |
| `daycare` | A daycare organisation or its branches. |
| `assigned` | Only learners, classrooms or shifts assigned to the caller. |
| `own` | Only the caller's own records or linked children. |

The catalogue lives in `packages/auth/permissions.js`. Role definitions and
their permission patterns live in `packages/auth/roles.js`.

## Roles

| Role key | Scope | Intended use |
| --- | --- | --- |
| `platform_super_admin` | Platform | Tenant provisioning, plans, feature flags, diagnostics, support. No routine access to learner records. |
| `platform_support_admin` | Platform, restricted | Diagnostics and authorised support cases. |
| `platform_finance_admin` | Platform, financial | Subscription billing and platform financial reporting. |
| `organisation_owner` | Organisation | Full organisation oversight, including finance, staff and settings. |
| `principal` | Daycare / branch | Day-to-day running of a daycare, including safeguarding and finance. |
| `daycare_administrator` | Daycare / branch | Delegated administration without owner-level platform rights. |
| `daycare_manager` | Daycare / branch | Daily operations, attendance, shifts and communications. |
| `curriculum_coordinator` | Daycare / branch | Curriculum, activities, observations and assessment review. |
| `teacher` | Assigned | Assigned learners, attendance, observations, tasks and messages. |
| `assistant_teacher` | Assigned | Delegated classroom operations. |
| `support_staff` | Assigned | Duties and tasks only; no developmental or financial records. |
| `finance_officer` | Organisation / branch | Invoices, payments, expenses, inventory and financial reports. |
| `admissions_officer` | Organisation / branch | Enquiries, applications, waiting list and enrolment. |
| `parent_guardian` | Own | Linked children, progress, attendance, forms, invoices and messages. |
| `substitute_staff` | Assigned | Temporary shift, classroom and attendance access. |

A user may hold multiple roles in the same organisation. The effective
permission set is the union of all active roles, plus any active delegation.
Role patterns may use `resource.*` or `*`; they are expanded against the
catalogue when the catalogue is seeded.

## Request pipeline

1. `loadSession` resolves the session from the HttpOnly cookie or a bearer
   token and rejects expired or revoked sessions.
2. `resolveOrganisation` validates the requested organisation against the
   caller's active membership. A header cannot grant access to another tenant.
3. `resolveAccess` loads roles, branch memberships and active delegations and
   produces a permission set plus branch scope. Results are cached for 15
   seconds per user/organisation and invalidated on access changes.
4. The router checks the route permission (`any` or `all` semantics).
5. Handlers re-check scope where a record is involved — for example a teacher
   may read only assigned learners, and a guardian only linked children.
6. Every sensitive write records an audit event.

## Delegation

A principal or owner can delegate a subset of their own permissions to another
member for a fixed period. Delegations cannot exceed the granting user's
authority, are branch-scoped when requested, expire automatically, and can be
revoked immediately. Revocation invalidates the permission cache.

## Platform administration

Platform roles are intentionally not global data-access roles. Global
technical administration does not justify routine access to children's
personal information. Platform screens use `platformOnly` routes and the
platform organisation; requests for daycare data are rejected with
`TENANT_MISMATCH` or `FORBIDDEN`.

## Adding a permission

1. Add the key to `PERMISSION_KEYS` in `packages/auth/permissions.js`.
2. Grant it to the relevant roles in `packages/auth/roles.js`.
3. Declare it on the route in the owning module.
4. Add a UI guard only where the screen should be hidden.
5. Run `npm test` and `node scripts/check-functions.js`.
6. Re-run the catalogue seed (`node scripts/seed-development.js` in
   development, or the catalog bootstrap on API start) so the database roles
   are updated.

## Verification

The test suite covers:

- unauthenticated access;
- CSRF enforcement;
- role denial (teacher → finance, parent → learner directory);
- tenant-header isolation;
- platform administrators not reading daycare data;
- parent own-scope access;
- session revocation on logout.

See `apps/api/tests/auth.test.js` and `packages/testing/permissions.test.js`.
