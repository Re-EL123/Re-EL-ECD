# Deployment guide

Re-EL ECD is a monorepo with three deployable pieces:

| Piece | Location | Target |
| --- | --- | --- |
| Static web app | `apps/web` | GitHub Pages (or any static host) |
| API | `apps/api` + `api/[...path].js` | Vercel Serverless Functions |
| Database | `packages/database/migrations` | Neon PostgreSQL |

The same request pipeline runs locally and on Vercel, so behaviour does not
diverge between environments.

## Live deployment

| Piece | URL |
| --- | --- |
| Web app | <https://ecd.re-el.co.za> |
| API | <https://re-el-ecd-api.vercel.app> |
| Health | <https://re-el-ecd-api.vercel.app/healthz> |

The web app is a GitHub Pages site served on the custom domain
`ecd.re-el.co.za` (CNAME to `re-el123.github.io`). The API is the Vercel
project `re-el-ecd-api` in the `akanishibiri4422-4914` team, connected to
`Re-EL123/Re-EL-ECD` so every push to `master` deploys. The database is the
Neon resource `re-el-ecd-db`, provisioned through the Vercel Neon integration,
which injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`.

Because the two hosts differ, the deployment runs with:

```text
FRONTEND_ORIGIN=https://ecd.re-el.co.za
CROSS_SITE_COOKIES=true
```

and the repository variable `REEL_API_BASE=https://re-el-ecd-api.vercel.app`
so the Pages build injects the API origin into `config.js`.

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

The seeded demonstration accounts and data are documented in
[`DEMO.md`](../DEMO.md). They are for local demos and staging only. The sign-in
screen never displays them, and the seed script never logs the password.

For a production install, create the first platform administrator with
`npm run bootstrap:platform` instead of running the demo seed. See
[`DEMO.md`](../DEMO.md#production-bootstrap).

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
| `DATABASE_CONNECT_TIMEOUT_MS` | No | Defaults to 30000, so a suspended Neon compute can wake. |
| `DATABASE_STATEMENT_TIMEOUT_MS` | No | Defaults to 30000. |
| `DEMO_PASSWORD` | No | Do not set in production. |
| `RESEND_API_KEY` | No | Enables transactional email. Without it, sends are logged as `skipped`. |
| `EMAIL_FROM` | No | Defaults to `Re-EL ECD <no-reply@re-el.co.za>`. Must be a verified Resend sender. |
| `EMAIL_REPLY_TO` | No | Reply-to address for outbound mail. |
| `APP_BASE_URL` | No | Web origin used in email links. Defaults to the first `FRONTEND_ORIGIN`. |
| `WEBSITE_CNAME_TARGET` | No | Hostname tenants point a `CNAME` at. Must resolve, or verified domains are dead. Defaults to `cname.vercel-dns.com`. |
| `WEBSITE_SUBDOMAIN_BASE` | No | Base domain for free `<slug>.<base>` addresses. Defaults to `re-el.co.za`. |
| `WEBSITE_PLATFORM_HOSTS` | No | Comma-separated hosts that can never be claimed as tenant domains. Defaults to `ecd.re-el.co.za,www.re-el.co.za,re-el.co.za`. |
| `WEBSITE_PROBE_TIMEOUT_MS` | No | Timeout for the DNS/TLS reachability probe. Defaults to 2500. |
| `WEBSITE_PROBE_TTL_MS` | No | How long a probe result is cached. Defaults to 600000 (10 minutes). |
| `API_BASE_URL` | No | API origin used for the PayFast ITN callback. Derived from the request when blank. |
| `PAYFAST_MERCHANT_ID` | For card payments | PayFast merchant id. |
| `PAYFAST_MERCHANT_KEY` | For card payments | PayFast merchant key. |
| `PAYFAST_PASSPHRASE` | If set in PayFast | Must match the PayFast account passphrase. |
| `PAYFAST_SANDBOX` | No | `true` uses `sandbox.payfast.co.za`. |
| `PAYFAST_IP_ALLOWLIST` | No | Comma-separated IPs allowed to post ITNs. |
| `PAYFAST_VALIDATE` | No | Defaults to `true` (server-to-server ITN confirmation). |
| `PAYMENT_CREDENTIALS_KEY` | For tenant-owned PayFast accounts | Long random string (32+ characters). Encrypts tenant merchant keys, passphrases and payout account numbers at rest. Generate one with `openssl rand -base64 32`; never reuse it across deployments because existing ciphertext cannot be opened with a different key. |
| `CRON_SECRET` | For scheduled jobs | Shared secret for the Vercel Cron endpoints (`/api/v1/cron/*`). Anything that knows it can run the jobs; anything that does not gets a 403. Required for the weekly digest, portfolio digest, pickup brief and onboarding sweep. |
| `R2_ACCOUNT_ID` | For media | Cloudflare account id. Used to derive the R2 S3 endpoint. |
| `R2_ACCESS_KEY_ID` | For media | R2 S3 access key id. |
| `R2_SECRET_ACCESS_KEY` | For media | R2 S3 secret access key. |
| `R2_BUCKET` | For media | Bucket name that receives uploads. |
| `R2_PUBLIC_BASE_URL` | For media | Public bucket origin, for example `https://media.re-el.co.za`. |
| `R2_ENDPOINT` | No | Overrides the endpoint derived from `R2_ACCOUNT_ID`. |
| `R2_REGION` | No | Defaults to `auto`, which is what R2 expects. |
| `VAPID_PUBLIC_KEY` | For web push | Base64url uncompressed P-256 point (starts with `B`). Set with `VAPID_PRIVATE_KEY` (raw 32-byte scalar, base64url) and optionally `VAPID_SUBJECT` (a `mailto:` or `https:` URL identifying the sender, for example `mailto:hello@re-el.co.za`). Sending them explicitly is the recommended setup. |
| `PUSH_CREDENTIALS_KEY` | For auto-generated web push keys | Long random string (32+ characters). When no `VAPID_*` keys are provided the API mints a VAPID pair once and seals the private key at rest with this value (falls back to `PAYMENT_CREDENTIALS_KEY`). Generate one with `openssl rand -base64 32`; never reuse it across environments and never change it while keys are sealed with it, or the stored private key can no longer be opened and push breaks. To rotate: delete the `push_config` row (or set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`) and redeploy — subscribed browsers must re-subscribe. |

### Custom website domains

Each organisation can publish its website on:

1. A free platform address, `<slug>.re-el.co.za`, which needs no tenant DNS.
2. Any hostname the tenant proves it controls.

The tenant adds the domain under **Public website → Domains**. The API returns
two records and the tenant publishes either one:

| Record | Host | Value | Use |
| --- | --- | --- | --- |
| `CNAME` | the domain, for example `www.centre.co.za` | `WEBSITE_CNAME_TARGET` (`cname.vercel-dns.com`) | Preferred for `www` and other subdomains. Marks TLS active immediately. |
| `TXT` | `_reel-verify.<domain>` | `reel-verify=<token>` | Required for an apex domain, where a CNAME is not allowed. Proves ownership; TLS stays pending until the edge is attached. |

Verification is server-side and only accepts a matching record. Pending or
failed domains are never served. The public endpoints return
`Access-Control-Allow-Origin: *` so a tenant-owned domain can load its content;
authenticated endpoints still use `FRONTEND_ORIGIN`.

The edge (reverse proxy or hosting provider) must map verified custom hostnames
to the same static frontend and API. The frontend resolves the site from
`location.hostname` through `GET /api/v1/public/daycares/by-domain/:host`.

#### Free subdomains and the wildcard certificate

`<slug>.re-el.co.za` is served by the same edge as the app, so it needs one
wildcard certificate. Add these records to the `re-el.co.za` zone:

| Type | Host | Value | Purpose |
| --- | --- | --- | --- |
| `A` | `*` | `76.76.21.21` | Wildcard apex for Vercel. |
| `CNAME` | `*` | `cname.vercel-dns.com` | Wildcard alternative when a `CNAME` is preferred. |

Then attach the wildcard in the hosting project: **Settings → Domains → Add**
`*.re-el.co.za`, and `re-el.co.za` as well if the apex should resolve. The
provider issues the certificate once the wildcard DNS record resolves.

Without the wildcard, every tenant subdomain shows
`SSL_ERROR_BAD_CERT_DOMAIN`: the host resolves, but the certificate presented
only covers the platform host. A `CNAME` pointed at the GitHub Pages host
(`<owner>.github.io`) causes exactly this, because the Pages certificate is
`CN=*.github.io` and does not cover `*.re-el.co.za`. GitHub Pages cannot issue a
`*.re-el.co.za` certificate, so tenant subdomains must be pointed at the edge
provider that can. `ecd.re-el.co.za` is unaffected because it is a single host
with its own certificate.

**Migration follow-up.** Until the wildcard is attached, a free subdomain may
not answer, so the editor must not promise "always on". The API exposes the
truth through `GET /api/v1/website/addresses`, which probes the free subdomain
and the CNAME target over DNS and TLS, and the domains card only offers an
`Open`/copy link for an address that actually serves. Canonical URLs and SEO
metadata point at `https://ecd.re-el.co.za/#/site/<slug>` — the platform host,
which always resolves with a valid certificate — whenever a tenant address is
not yet live. The `<slug>.re-el.co.za` subdomain becomes the canonical address
automatically once its TLS probe passes. Wiring that up (wildcard certificate,
`*.re-el.co.za` attached at the edge, and every tenant subdomain mapped to the
same static frontend and API) is the remaining infrastructure step.

### Email (Resend)

Transactional email is sent through the Resend HTTP API. Every attempt is
recorded in `email_deliveries` with a status of `sent`, `failed` or `skipped`,
so "did the guardian receive the invoice?" is answerable from the database.
Email is best-effort: a provider outage never fails an invitation, invoice or
payment webhook.

Wired templates: welcome (new tenant owner); staff invitation and invitation
accepted; password reset and password changed; website enquiry notification and
acknowledgement; public form submission and form reviewed; announcement
publication; invoice issued, invoice reminder and statement ready; payment
receipt (PayFast) and manual payment receipt; application fee; admission
decision and enrolment confirmed; progress published; high-severity incident
alert and incident guardian notice; leave requested and leave decision; shift
assigned; and access revoked.

To enable it:

1. Verify the sending domain in Resend (for example `re-el.co.za`).
2. Set `RESEND_API_KEY` and `EMAIL_FROM` in Vercel for Production.
3. Send a test by inviting a staff member or requesting a password reset.

`GET /api/v1/platform/health` reports whether email is configured and which
sender is in use.

### Media storage (Cloudflare R2)

Photos, videos, audio and documents are uploaded straight from the browser to
Cloudflare R2 using a short-lived presigned `PUT` URL. The API only signs the
URL and records metadata; file bytes never pass through a serverless function.
The database stores the public URL, the object key, MIME type, size and scope.

1. Create an R2 bucket and an R2 API token with object read/write access.
2. Enable public access for the bucket (a custom domain such as
   `media.re-el.co.za`, or the `r2.dev` development URL) and set
   `R2_PUBLIC_BASE_URL` to that origin.
3. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and
   `R2_BUCKET` in Vercel for Production. From a linked checkout,
   `./scripts/setup-production-secrets.sh` prompts for these and the Resend key
   without echoing them, then redeploys. It replaces existing values, so it is
   also the rotation path.
4. Allow the web origin to upload and read objects. A suitable bucket CORS
   policy is:

```json
[
  {
    "AllowedOrigins": ["https://ecd.re-el.co.za", "http://localhost:8080"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

The browser needs `GET` for images, video, audio and the logo colour picker
(canvas reads), and `PUT` for uploads. Without CORS the upload request fails
before it reaches R2, and logo colour extraction reports that the image could
not be read.

Uploads are restricted to a MIME whitelist (JPEG, PNG, WEBP, GIF, AVIF, MP4,
WEBM, MOV, MP3, M4A, WEBA, PDF, TXT, CSV, DOCX, XLSX) with per-type size
limits. SVG is deliberately refused because it can carry script. Object keys
are tenant-scoped (`org/<organisationId>/<scope>/<random>.<ext>`) so one
daycare can never overwrite another's media. The extension comes from the
validated MIME type, not the uploaded filename, and `Content-Type` is part of
the presigned `PUT` signature, so an object cannot be stored under a different
type than the one the API approved.

`GET /api/v1/platform/health` reports whether storage is configured and which
bucket is in use. `GET /api/v1/media/config` returns the scopes and limits the
frontend uses.

### Payments (PayFast)

PayFast is the hosted checkout provider. The platform never stores card
details: a guardian is redirected to PayFast, and the invoice is settled when
PayFast posts an ITN to `POST /api/v1/public/payfast/itn`.

The flow:

1. A guardian taps **Pay online** in the parent portal, or the office creates a
   **Payment link** from Finance → Invoices.
2. `POST /parent/invoices/:id/pay` or `POST /invoices/:id/payfast-link`
   creates a `payment_intents` row with an unguessable reference and returns a
   signed checkout payload.
3. PayFast collects the payment and posts an ITN. The handler verifies the
   signature in the posted field order, checks the merchant id, confirms the
   amount, optionally validates the ITN server-to-server with PayFast, records
   a `payment_webhook_events` row for replay protection, creates a `payments`
   row with method `payfast`, allocates it to the invoice and emails a receipt.
4. The browser returns to `#/parent/finance?payment=return`, which explains
   that confirmation is in progress.

Set `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY` and (if configured in the
PayFast account) `PAYFAST_PASSPHRASE`. Use `PAYFAST_SANDBOX=true` until the
account is live. PayFast must be able to reach the public API URL; set
`API_BASE_URL` if the request host is not the public origin.

The webhook is idempotent: the same `pf_payment_id` and status is only
processed once, and a duplicate ITN returns `200 DUPLICATE`.

Two deployment choices affect who holds tenant money:

- **Tenant pays Re-EL.** Organisations pay their subscription from
  Settings → Billing. The checkout is charged to the platform account and the
  ITN extends the subscription and settles the invoice. An owner who is used
  to paying by EFT can have the platform record the payment manually from
  Platform → Subscriptions (or Organisation → Record payment).
- **Tenant collects parent fees.** By default the platform collects and then
  pays each tenant by EFT (Platform → Settlements), minus the collection fee
  configured in the tenant's payment account. Alternatively the tenant can
  connect their **own** PayFast merchant account in Settings → Billing —
  checkouts then sign with the tenant's credentials and PayFast settles
  directly to the tenant's bank account. Tenant credentials require
  `PAYMENT_CREDENTIALS_KEY` on production (see the environment table). Any
  scheduler can point at `GET /api/v1/internal/subscription-reminders` with
  `Authorization: Bearer <CRON_SECRET>` to flip past-due subscriptions and
  email owners a weekly reminder; without `CRON_SECRET` the endpoint returns
  404 and nothing happens.

### Scheduled jobs

`vercel.json` registers these Vercel Cron paths; all of them also have a
manual `POST` equivalent on the Reports page (`organisation.settings.manage`).
The scheduler must present `Authorization: Bearer <CRON_SECRET>` (a wrong or
missing secret gets 403).

| Schedule (UTC) | Cron path | Manual trigger | What it does |
| --- | --- | --- | --- |
| Fridays 15:00 | `/api/v1/cron/weekly-digest` | Reports → Send weekly digest now | Friday “week at the centre” email to every opted-in guardian — a story per child: the week’s strongest moment, the teacher’s name, a photo and a deep link, with the counts in the small print. Opens are stamped on the parent portal (`src=weekly-digest`). |
| 15th of month 16:00 | `/api/v1/cron/portfolio-digest` | Reports → Send monthly portfolio digest now | Branded per-child PDF of the month’s observations, with the teacher’s one-paragraph arc (“This month’s story”) leading the document; emailed to every opted-in guardian. |
| Weekdays 13:00 (15:00 SAST) | `/api/v1/cron/pickup-brief` | Reports → Send pickup briefs now | “Tonight at pickup”: mood, meals, naps and one question about the week’s most recent moment — one push plus an in-app notification per linked guardian who can receive reports. |
| Daily 05:00 (07:00 SAST) | `/api/v1/cron/parent-onboarding` | Reports → Run onboarding sweep now | Week-one journey for guardian memberships: day 1 welcome email + push, day 3 the first moment (or a gentle fallback email), day 5 a one-time preview of the digest regardless of opt-in, day 7 the first-week recap. Markers stored in `memberships.activation`. |

Parent-engagement signals (quiet families this week, first-60-day cohort with
push/report-opened/return-visit markers, one-click nudge emails) live on the
Reports page under “Every family, from day one” and “Quiet families this
week”. Reactions from families (❤️ 👍 💬) arrive on the teacher’s morning
cockpit and as `guardian_reaction` notifications.

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
   `https://re-el-ecd-api.vercel.app`:

   ```bash
   gh variable set REEL_API_BASE --body "https://re-el-ecd-api.vercel.app"
   ```

2. In GitHub, set **Settings → Pages → Build and deployment → Source** to
   **GitHub Actions**. This is not optional: with "Deploy from a branch" GitHub
   publishes the repository root, so visitors see the rendered `README.md`
   instead of the app.
3. Push to `master`. `.github/workflows/pages.yml` injects the API origin into
   `apps/web/config.js` and deploys `apps/web` to Pages.
4. In the API environment set:

   ```text
   FRONTEND_ORIGIN=https://<owner>.github.io   (or the custom domain)
   CROSS_SITE_COOKIES=true
   ```

5. Point the custom domain at Pages with a `CNAME` DNS record, then enable
   **Enforce HTTPS** once the certificate is approved.

The Pages source can also be set from the command line:

```bash
gh api -X PUT repos/<owner>/<repo>/pages -f build_type=workflow
gh api -X PUT repos/<owner>/<repo>/pages -F https_enforced=true
```

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
- [ ] Demo data is removed before real children are onboarded. The
      public showcase deployment is intentionally seeded with demo data.
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
| The site shows the README text instead of the app | Pages is publishing the branch root. Set the Pages source to "GitHub Actions" and re-run `pages.yml`. |
| Every API call returns 404 on the Pages domain | `REEL_API_BASE` is empty, so the SPA calls the static host. Set the repository variable and re-run `pages.yml`. |
| Vercel preview URLs return 302 "Protected by Vercel Authentication" | Deployment protection applies to preview URLs; use the production alias. |
| `SSL_ERROR_BAD_CERT_DOMAIN` on a `<slug>.re-el.co.za` tenant site | The wildcard certificate is missing. A `CNAME` to the GitHub Pages host presents `CN=*.github.io`, which does not cover `*.re-el.co.za`. Point `*.re-el.co.za` at the hosting provider and attach the wildcard domain there. |
| Migrations did not run on Vercel | Check the function logs for the migration error; run `npm run migrate` manually against the database. |
| Emails are not arriving | Check `email_deliveries` for the row: `skipped` means `RESEND_API_KEY` is unset or `EMAIL_ENABLED=false`; `failed` carries the Resend error. A verified sender domain is required for `EMAIL_FROM`. |
| Password reset or invitation links point at the wrong host | Set `APP_BASE_URL` (or `FRONTEND_ORIGIN`) to the public web origin; links are built from it. |
| "Online payments are not configured" | `PAYFAST_MERCHANT_ID` and `PAYFAST_MERCHANT_KEY` are unset in the API environment. |
| PayFast ITNs never arrive | PayFast must reach the public API; set `API_BASE_URL` to the deployed API origin. `GET /api/v1/platform/health` reports the PayFast mode. |
| PayFast ITN returns `INVALID` | The passphrase or merchant id does not match the PayFast account, or a proxy reordered the form fields. ITNs are signed in posted order. |
| PayFast ITN returns `REJECTED` | The signed amount did not match the intent amount; the invoice is intentionally left open and the mismatch is logged. |
| "File storage is not configured" | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` and `R2_PUBLIC_BASE_URL` must all be set (plus `R2_ACCOUNT_ID` or `R2_ENDPOINT`). `GET /api/v1/platform/health` reports the storage state. |
| Upload fails immediately with a CORS error | The bucket CORS policy does not allow the web origin or the `content-type` header. Allow `GET`, `HEAD` and `PUT` from the exact site origin. |
| Images upload but do not render | `R2_PUBLIC_BASE_URL` points at a private bucket or the wrong custom domain. Public reads must be enabled for the bucket. |
| "The logo could not be read" when extracting colours | The bucket must allow the site origin to read images (`GET` plus CORS) because the palette is sampled in the browser canvas. |
