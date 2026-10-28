# Deployment guide

Re-EL ECD is a monorepo with three deployable pieces:

| Piece | Location | Target |
| --- | --- | --- |
| Static web app | `apps/web` | GitHub Pages (or any static host) |
| API | `apps/api` + `api/[...path].js` | Vercel Serverless Functions |
| Database | `packages/database/migrations` | Neon PostgreSQL |

The same request pipeline runs locally and on Vercel, so behaviour does not
diverge between environments.

## 1. Prerequisites

- Node.js 20 or newer (24 is used in development).
- A Neon PostgreSQL database (or any PostgreSQL 14+ instance).
- A Vercel account and project linked to the repository.
- A GitHub repository with Actions enabled.

## 2. Local development

```bash
npm install
npm run dev
```

`npm run dev` starts the API and static server on `http://localhost:4112`.
Without `DATABASE_URL`, the API uses the embedded PGlite database (real
PostgreSQL compiled to WebAssembly), runs all migrations and seeds the
demonstration dataset. This keeps local development dependency-free.

Demo accounts all use the password `Re-EL-Demo-2026!`:

| Email | Role |
| --- | --- |
| `principal@littlesprouts.local` | Principal |
| `teacher@littlesprouts.local` | Teacher |
| `parent@littlesprouts.local` | Parent / guardian |
| `finance@littlesprouts.local` | Finance officer |
| `platform@re-el-ecd.local` | Platform super admin |

Other seeded users cover every role; see
`packages/database/seeds/development.js`.

Useful commands:

```bash
npm test                  # unit + integration tests
npm run lint              # syntax and style checks
npm run check:migrations  # migration ordering and safety
npm run check:functions   # route, permission and Vercel checks
npm run migrate           # apply migrations to DATABASE_URL
npm run seed              # seed demo data (development only)
npm run seed:catalog      # seed roles, permissions, plans and flags only
npm run docs:api          # regenerate docs/api.md from the router
```

## 3. Database

1. Create a Neon project and copy the pooled connection string.
2. Set `DATABASE_URL` in the Vercel project (Production and Preview).
3. Apply migrations:

   ```bash
   DATABASE_URL="postgres://..." npm run migrate
   ```

4. Seed the catalogue (roles, permissions, subscription plans, feature flags):

   ```bash
   DATABASE_URL="postgres://..." npm run seed:catalog
   ```

The API also applies pending migrations and the catalogue on cold start when
`DATABASE_URL` is present. That makes first deploys safe, but migrations should
still be reviewed and applied deliberately in production.

### Migrations

Migrations are plain SQL files in `packages/database/migrations`, applied in
filename order and recorded in `schema_migrations`. Rules:

- Never edit an applied migration; add a new one.
- Keep each migration idempotent where practical.
- Test against a copy of production data before release.
- `npm run check:migrations` validates ordering and required statements.

### Backup and retention

- Enable Neon point-in-time restore and automated backups.
- Take a manual branch/snapshot before destructive migrations.
- Export audit and financial records according to the organisation's retention
  policy. The API exposes audit and report CSV exports for this purpose.
- Document the restore drill and review it at least annually.

## 4. API on Vercel

`vercel.json` routes `/api/*` to `api/[...path].js` and serves `apps/web` as
static output. Configure these environment variables in Vercel:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon pooled connection string. |
| `NODE_ENV` | Yes | `production`. |
| `FRONTEND_ORIGIN` | Yes when hosted separately | Comma-separated allowed origins. |
| `CROSS_SITE_COOKIES` | When hosted separately | `true` for `SameSite=None; Secure`. |
| `SESSION_HOURS` | No | Defaults to 8. |
| `DATABASE_SSL` | No | Defaults to `require` for remote databases. |
| `DEMO_PASSWORD` | No | Do not set in production. |
| `EMAIL_API_KEY` | No | Notifications are recorded without a provider. |

Deploy with the Vercel Git integration (recommended) or:

```bash
vercel --prod
```

`/healthz` returns a lightweight health response without touching the database.
`/api/v1/platform/health` returns a permission-protected database and queue
summary for platform administrators.

### Function limit

Vercel hobby projects have a function limit. The whole API is a single catch-all
function (`api/[...path].js`), so adding routes does not add functions.
`npm run check:functions` asserts this and verifies every route declares
access rules.

## 5. Frontend on GitHub Pages

The web app is a no-build classic-script SPA. To publish it:

1. Set the repository variable `REEL_API_BASE` to the API origin, for example
   `https://re-el-ecd.vercel.app`.
2. Push to `master`. `.github/workflows/pages.yml` injects the API origin into
   `apps/web/config.js` and deploys `apps/web` to Pages.
3. In the API environment set:

   ```text
   FRONTEND_ORIGIN=https://<owner>.github.io
   CROSS_SITE_COOKIES=true
   ```

4. In GitHub, enable Pages with "GitHub Actions" as the source.

Hash routing (`#/app/overview`) means no server rewrite rules are needed.

If the frontend and API share an origin (the default Vercel deployment), leave
`REEL_API_BASE` empty and `CROSS_SITE_COOKIES=false`.

### Cookies and CSRF across origins

The session cookie is HttpOnly. The CSRF token is returned in the login and
session payloads and kept in memory by the SPA, so it works even when the
frontend cannot read the API's cookie. Cross-site cookies require HTTPS and
`SameSite=None; Secure`.

## 6. CI/CD

`.github/workflows/ci.yml` runs on every push and pull request:

1. `npm ci`
2. `npm run lint`
3. `npm run check:migrations`
4. `npm run check:functions`
5. `npm test`

`.github/workflows/pages.yml` deploys the static app on pushes to `master`.
Vercel deploys the API through its Git integration. Protect `master` and require
the CI check before merging.

## 7. Release checklist

- [ ] CI is green on the release commit.
- [ ] Migrations reviewed and applied to a staging copy.
- [ ] `DATABASE_URL`, `FRONTEND_ORIGIN` and cookie settings verified.
- [ ] Demo data is not present in production.
- [ ] Platform administrator accounts use strong unique passwords and MFA at
      the identity provider.
- [ ] `/healthz` and `/api/v1/platform/health` return healthy.
- [ ] A principal, teacher, parent and platform admin can sign in.
- [ ] Public daycare website and enquiry form work.
- [ ] Backup and restore procedure confirmed.
- [ ] Rollback plan agreed (previous deployment plus forward-only migration).

## 8. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `DATABASE_URL is required in production` | Set the variable or explicitly allow the in-memory database for a demo. |
| Login succeeds but later requests are 401 | Cookie blocked cross-site; set `CROSS_SITE_COOKIES=true` and HTTPS, and list the exact origin in `FRONTEND_ORIGIN`. |
| 403 `CSRF_FAILED` | The SPA did not receive a CSRF token; check that login/session responses are not cached and that `config.js` points at the right API. |
| 403 `TENANT_MISMATCH` | The user is not an active member of the requested organisation, or a stale organisation id is stored in the browser. Sign out and back in. |
| Static assets are stale | Bump the `?v=` query string in `apps/web/index.html` when changing scripts or styles. |
| Migrations did not run on Vercel | Check the function logs for the migration error; run `npm run migrate` manually against the database. |
