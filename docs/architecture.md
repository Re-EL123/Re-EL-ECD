# Architecture

Re-EL ECD is a multi-tenant SaaS platform for Early Childhood Development (ECD)
centres. It covers admissions, learners and guardians, classrooms, curriculum,
developmental assessment, learner and staff attendance, shifts and leave, forms
and consent, communications, finance, safety, operations, reporting, a parent
portal, public daycare websites and a platform command centre.

The guiding constraints are:

- **Deny by default.** Every request is authorised on the server.
- **One tenant per request.** Data access is always narrowed to the caller's
  organisation and, where relevant, branch or assignment.
- **No hidden client trust.** The browser decides what to *show*; the API decides
  what is *allowed*.
- **Deployable on the specified baseline.** GitHub Pages for the web app, Vercel
  for the API, Neon for PostgreSQL.

## 1. Repository layout

```text
api/[...path].js            Vercel catch-all function
apps/api/
  server.js                 Local server: API + static web app
  src/
    app.js                  Request pipeline (session → tenancy → RBAC → handler)
    router.js               Method/path matching with route metadata
    modules/                16 domain modules, 254 routes
    services/               Session, access, audit, notification, automation
    middleware/             Rate limiting
    utils/                  HTTP helpers, paging, CSV
  tests/                    Integration tests against the real pipeline
apps/web/
  index.html                Shell, auth screens, modals, command palette
  config.js                 Optional API origin for split hosting
  assets/                   Design system CSS
  src/
    app.js                  Alpine root component, router, shared actions
    utils.js                API client, formatting and DOM helpers
    views/                  One module per domain
packages/
  auth/                     Permission catalogue, roles, password hashing
  contracts/                Validation, enums, errors
  database/                 pg/PGlite adapter, migrations, seeds
  testing/                  Unit tests
scripts/                    Dev server, migrations, seeds, checks, docs
docs/                       Architecture, API, RBAC, deployment
```

The web app is a **no-build** classic-script SPA. Scripts are loaded with
`defer` in dependency order, so the deployed artefact is exactly what is
committed. There is no bundler, no transpiler and no generated client.

## 2. Runtime topology

```text
Browser ── HTTPS ──> GitHub Pages (apps/web, static)
       └─ XHR ─────> Vercel Function (api/[...path].js)
                          │
                          └── pg pool ──> Neon PostgreSQL
```

`vercel.json` routes `/api/*` to a single catch-all function, so adding routes
does not consume additional Vercel function slots. The same `handle()` pipeline
used by the function is used by `apps/api/server.js` locally, which also serves
`apps/web` so development and production share one origin by default.

When the web app is hosted separately, `apps/web/config.js` sets
`window.REEL_API_BASE`. The API client then uses `credentials: 'include'`, the
API sets `FRONTEND_ORIGIN` for CORS, and `CROSS_SITE_COOKIES=true` switches the
session cookie to `SameSite=None; Secure`.

## 3. Data model

Ten migrations create the schema:

| Migration | Domain |
| --- | --- |
| `001_identity_tenancy` | Organisations, branches, users, memberships, roles, permissions, sessions |
| `002_learners_families` | Learners, guardians, links, medical notes, collections |
| `003_admissions_classrooms` | Enquiries, applications, waiting list, classrooms, enrolments |
| `004_curriculum_assessment` | Frameworks, domains, objectives, plans, activities, observations, assessments |
| `005_attendance_workforce` | Learner attendance, staff profiles, shifts, staff attendance, leave, timesheets |
| `006_forms_communications` | Form definitions/versions/submissions, consent, announcements, conversations |
| `007_finance_operations` | Invoices, payments, allocations, expenses, suppliers, inventory, tasks |
| `008_safety_platform` | Incidents and actions, plans, subscriptions, feature flags, support cases |
| `009_reports_audit` | Report jobs, audit events, automation rules, notifications |
| `010_tenant_indexes` | Composite indexes on the hot tenant paths |

Every tenant table carries `organisation_id` (and `branch_id` where branch-level
work happens). Foreign keys cascade on organisation deletion. Composite indexes
lead with `organisation_id` so the common access path is index-supported.

Dates that represent calendar days are stored as `DATE`. Timestamps are stored
with time zone. The API normalises day values to `YYYY-MM-DD` before comparing
them, so a value returned as an ISO timestamp by the driver cannot silently
break a period filter.

### Database adapter

`packages/database/index.js` exposes a small pool interface — `query`, `one`,
`many`, `withTransaction`, `getPool`, `runMigrations` — implemented twice:

- **`pg`** when `DATABASE_URL` is set (Neon in production).
- **PGlite** (`@electric-sql/pglite`, a real PostgreSQL build compiled to
  WebAssembly) otherwise, for local development and tests.

PGlite serialises queries through a mutex, so a `pool.query` call inside a
`withTransaction` callback would deadlock. Transaction bodies therefore use the
supplied `client` only. The adapter also installs a `uuid_generate_v4()` shim
that PGlite does not ship.

Migrations are plain SQL files applied in filename order and recorded in
`schema_migrations`. `scripts/check-migrations.js` verifies ordering and
required statements in CI.

## 4. Request pipeline

`apps/api/src/app.js` runs every request through the same ordered stages:

1. **Request identity** — assign `requestId`, apply security headers, handle
   CORS pre-flight.
2. **Route match** — resolve method and path, attach route metadata
   (permission, `public`, `platformOnly`, `authenticated`, `skipCsrf`).
3. **Body and query parsing** — JSON with a size cap; malformed JSON becomes a
   `422`, oversized bodies a `413`.
4. **Session** — `loadSession` reads the `reel_session` HttpOnly cookie (or a
   bearer token), verifies the SHA-256 hash against `sessions`, and rejects
   expired or revoked sessions.
5. **CSRF** — state-changing requests must present `X-CSRF-Token` matching the
   session's CSRF token.
6. **Tenancy** — the requested organisation (header or query) is validated
   against the caller's active memberships. A header cannot widen scope.
7. **Authorisation** — `resolveAccess` expands roles, branch scope and active
   delegations into a permission set; the router enforces the route permission.
8. **Handler** — domain logic, always filtered by `ctx.organisationId`.
9. **Audit** — sensitive writes append an audit event.
10. **Response** — `{ data, meta }` on success, `{ error: { code, message,
    requestId, details } }` on failure.

Route handlers never receive a raw tenant identifier from the client; they read
`ctx.organisationId`, which the pipeline has already verified.

## 5. Authentication and sessions

- Passwords are hashed with `scrypt` and a per-user random salt.
- Login issues a random 32-byte session token, stored only as a SHA-256 hash.
- The token travels in an HttpOnly cookie; a separate readable CSRF cookie and
  the login/session payload carry the CSRF token for the SPA.
- Failed logins increment a counter and lock the account after five attempts;
  login attempts are rate limited per IP and email.
- Logout revokes the session row and clears both cookies.
- Password reset uses a single-use, time-limited token stored as a hash.
- Bearer tokens are accepted for automated clients and tests.

## 6. Authorisation

Permissions are named `resource.action.scope` (with a few four-part
parent permissions). Roles are patterns over that catalogue, expanded when the
catalogue is seeded. Access is resolved per request from:

- active memberships and their roles;
- branch memberships;
- time-limited delegations that cannot exceed the granting user's authority;
- the platform flag on the membership.

Results are cached for 15 seconds per user/organisation and invalidated when
roles, memberships or delegations change.

Two invariants are enforced in code and tests:

- **Parents** receive own-scope permissions only. They cannot read the learner
  directory, staff data or daycare-wide consent records.
- **Platform administrators** receive platform permissions only. Global
  administration does not imply access to children's records; platform routes
  use `platformOnly` and daycare requests return `403`.

See [rbac.md](rbac.md) for the role table and the full pipeline description.

## 7. API design

- Base path `/api/v1`, versioned in the URL.
- REST resources with explicit action endpoints for state transitions
  (`/invoices/:id/issue`, `/observations/:id/publish`, `/leave/:id/review`).
- Pagination via `page`/`pageSize`, returned in `meta`.
- Validation through `packages/contracts/validate.js`: declared fields only,
  type coercion, field-level error details. Unknown fields are stripped, so a
  client cannot smuggle `organisationId` into a write.
- CSV exports for reports and audit views.
- The complete route list with the permission for each route is generated into
  [api.md](api.md) by `npm run docs:api`.

Domain modules and their responsibilities:

| Module | Responsibility |
| --- | --- |
| `auth` | Login, logout, session, password reset, invitations acceptance |
| `organisation` | Organisation profile, settings, branches, classrooms, access, audit |
| `learners` | Learner records, guardians, medical notes, progress |
| `admissions` | Enquiries, applications, waiting list, public daycare websites |
| `curriculum` | Frameworks, objectives, plans, activities, calendar |
| `assessments` | Observations, learner assessments, periods, progress reports |
| `attendance` | Learner registers, corrections, attendance reporting |
| `staff` | Staff profiles, documents, training, shifts, attendance, leave, timesheets |
| `forms` | Form builder, published versions, submissions, consent records |
| `communications` | Announcements, conversations, messages, notifications |
| `finance` | Invoices, payments, allocations, expenses, suppliers, inventory |
| `safety` | Incidents, participants, corrective actions, compliance registers |
| `operations` | Tasks, website publishing, report jobs, automation rules |
| `parent` | Guardian-scoped children, progress, attendance, forms, fees, messages |
| `platform` | Tenant directory, subscriptions, feature flags, health, support |
| `notifications` | Notification list and read state |

## 8. Frontend architecture

`apps/web/src/app.js` defines `window.reelApp()`, the Alpine root component. It
owns:

- the session and active organisation;
- permission helpers (`has`), navigation filtering and quick actions;
- the hash router and view lifecycle;
- shared actions: `act`, `postJson`, `openNamedModal`, `openViewModal`,
  `openNamedDetail`, `confirmAction`, `exportCurrentCsv`, and domain helpers.

Views are plain objects registered on `window.Reel.views`:

```js
V.learners = {
  async load(ctx, params) { /* fetch and shape data */ },
  render(ctx, params, page) { /* return an HTML string */ },
  openModal(ctx, name) { /* describe a form modal */ }
};
```

After `load`, the router writes `render` output into `#view-root` and calls
`Alpine.initTree()` so nested directives bind. Views never call the API directly
for writes; they call shared component actions so CSRF handling, toasts,
permission errors and refresh behaviour stay consistent.

Design system: `apps/web/assets/styles.css` provides tokens, layout primitives
(`pageHead`, `card`, `table`, `statCard`, `tabs`, `emptyState`, `badge`),
responsive breakpoints, dark mode, focus styles and reduced-motion handling.
GSAP animates entrances only when `prefers-reduced-motion` is not set, and every
screen remains usable if GSAP, Lucide or Chart.js fail to load.

Asset URLs carry a `?v=` query string. Bump it whenever a script or stylesheet
changes so browsers and CDNs pick up the new file.

## 9. Background and scheduled work

The baseline deployment is request-driven. Long-running concerns are modelled
explicitly rather than hidden in the request path:

- **Report jobs** are recorded in `report_jobs` with status, parameters and row
  counts; generated reports are returned inline and can be re-run.
- **Automation rules** are stored and evaluated by the operations module.
- **Notifications** are persisted per recipient with delivery records; an email
  provider can be attached later without changing callers.
- **Payment webhooks** are recorded in `payment_webhook_events` for idempotency.

A future scheduler can consume these tables without changing the API surface.

## 10. Security posture

- Tenant isolation is enforced in the pipeline and repeated in queries.
- CSRF tokens on all state-changing requests; SameSite cookies.
- Security headers on every API response (`nosniff`, `no-referrer`,
  frame denial, restrictive permissions policy).
- Rate limiting on login, password reset, enquiries and public form submission.
- Audit events for authentication, access changes, finance, safety and
  configuration.
- No secrets in the web app. `config.js` carries only the API origin.
- POPIA-oriented defaults: private file storage, least-privilege roles,
  retention settings, consent records and audit trails. Legal validation of the
  organisation's specific obligations remains a deployment responsibility.

## 11. Testing

| Layer | Location | Coverage |
| --- | --- | --- |
| Unit | `packages/testing/permissions.test.js` | Permission catalogue, wildcard expansion, role scopes, password hashing, validator, error codes |
| Integration | `apps/api/tests/auth.test.js` | Sessions, CSRF, RBAC denial, tenant isolation, platform boundary, parent own-scope, logout, public site |
| Integration | `apps/api/tests/modules.test.js` | Learner CRUD, attendance, observation → report, invoicing and payments, incidents, tasks, forms, invitations, staff self-attendance, platform settings, reports and audit |

Integration tests boot the real pipeline on an ephemeral port against the
embedded PostgreSQL database and seed the demonstration dataset — there are no
mocks of the router, permission layer or SQL.

`npm run check` adds lint, migration validation and API-surface validation
(route count, permission declarations, single Vercel function). CI runs all of
it on Node 20, 22 and 24, and fails if `docs/api.md` is out of date.

## 12. Deployment

See [deployment.md](deployment.md). In short: Neon holds the schema and data,
Vercel runs the single API function, GitHub Pages serves `apps/web`, and the API
applies pending migrations plus the permission catalogue on cold start when
`DATABASE_URL` is present.
