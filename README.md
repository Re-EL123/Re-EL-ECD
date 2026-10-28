# Re-EL ECD

A complete, multi-tenant early-childhood-development operating platform for
South African daycare centres: admissions, learners, classrooms, curriculum,
developmental assessment, attendance, staff and shifts, leave, forms and
consent, communications, finance, safety, tasks, reporting, a parent portal,
public daycare websites, and a platform command centre.

## Stack

- **Frontend** — HTML5, CSS3, vanilla JavaScript, Alpine.js, GSAP, Lucide and
  Chart.js. No build step; classic scripts and a hash router.
- **API** — Node.js, versioned REST (`/api/v1`), a dependency-light router and
  `pg`, deployed as one Vercel Serverless Function.
- **Database** — PostgreSQL (Neon in production). Local development and tests
  use embedded PGlite, a real PostgreSQL build compiled to WebAssembly.
- **Hosting** — GitHub Pages for the web app, Vercel for the API, Neon for the
  database.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:4112>. Without `DATABASE_URL` the server creates an
in-memory PostgreSQL database, applies all migrations and seeds demonstration
data.

All demo accounts use the password `Re-EL-Demo-2026!`.

| Email | Role |
| --- | --- |
| `principal@littlesprouts.local` | Principal |
| `teacher@littlesprouts.local` | Teacher |
| `parent@littlesprouts.local` | Parent / guardian |
| `finance@littlesprouts.local` | Finance officer |
| `platform@re-el-ecd.local` | Platform super admin |

Two daycare organisations are seeded (`little-sprouts` and `sunrise-kids`)
plus the platform organisation, with 18 users covering every role.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | API + static web app on port 4112 |
| `npm test` | Unit and integration tests |
| `npm run test:api` | API integration tests only |
| `npm run test:unit` | Shared-package unit tests only |
| `npm run lint` | Syntax and style checks |
| `npm run check` | Lint, migration and API-surface checks |
| `npm run migrate` | Apply migrations to `DATABASE_URL` |
| `npm run seed` | Seed demonstration data (development) |
| `npm run seed:catalog` | Seed roles, permissions, plans and flags only |
| `npm run docs:api` | Regenerate `docs/api.md` from the router |

## Architecture

```text
api/[...path].js          Vercel catch-all → apps/api/src/app.js
apps/api/src/
  router.js               Method + path matching, route metadata
  app.js                  Session, organisation, RBAC, CSRF, CORS, errors
  modules/                16 domain modules, 252 routes
  services/               Sessions, access, audit, notifications, automation
  middleware/             Rate limiting
apps/web/
  index.html              Shell, modals, command palette
  config.js               Optional API origin for split hosting
  src/app.js              Router, state, navigation, shared actions
  src/views/              One view module per domain
packages/
  auth/                   Permission catalogue, roles, password hashing
  contracts/              Validation, enums, errors
  database/               pg/PGlite adapter, migrations, seeds
  testing/                Unit tests
docs/                     Architecture, API, RBAC and deployment guides
```

### Multi-tenancy and security

- Every tenant row carries `organisation_id`; queries always filter by it.
- The client sends `X-Organisation-Id`; the server verifies an active
  membership before using it. Headers cannot widen scope.
- Permissions are resolved server-side from roles, branch scope and
  time-limited delegations, with a 15-second cache invalidated on changes.
- Sessions are random tokens in an HttpOnly cookie, stored as SHA-256 hashes.
  Passwords use scrypt. State-changing requests require a CSRF token.
- Every sensitive write records an audit event.
- Platform administrators have platform permissions only; routine access to
  children's records is not implied by global administration.

See [docs/rbac.md](docs/rbac.md), [docs/architecture.md](docs/architecture.md)
and [docs/deployment.md](docs/deployment.md).

## API

The API is versioned at `/api/v1`. Responses use `{ data, meta }` and errors use
`{ error: { code, message, requestId, details } }`. The full route list with
permissions is generated in [docs/api.md](docs/api.md).

## Deployment

- **Web app** — `.github/workflows/pages.yml` publishes `apps/web` to GitHub
  Pages and injects the API origin from the `REEL_API_BASE` repository variable.
- **API** — Vercel Git integration builds `api/[...path].js`; set
  `DATABASE_URL`, `FRONTEND_ORIGIN` and, for split hosting,
  `CROSS_SITE_COOKIES=true`.
- **Database** — Neon PostgreSQL with versioned SQL migrations. The API applies
  pending migrations and the permission catalogue on cold start, and
  `npm run migrate` / `npm run seed:catalog` are available for controlled
  releases.

See [docs/deployment.md](docs/deployment.md) for the full guide, environment
variables, backup guidance and release checklist.

## Testing

`npm test` runs:

- permission catalogue, wildcard expansion, role scope and password unit tests;
- API integration tests against the real router and database covering
  authentication, CSRF, RBAC denial, tenant isolation, parent own-scope access,
  learner CRUD, attendance, observation/assessment reporting, invoicing and
  payments, incidents and corrective actions, tasks, forms and invitations;
- report catalogue, CSV export and audit-trail checks.

CI runs lint, migration checks, API-surface checks and the full test suite on
Node 20, 22 and 24.

## License

Proprietary. All rights reserved.
