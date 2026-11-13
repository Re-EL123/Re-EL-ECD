# The Official NCF pack

An **optional, officially-curated starter curriculum** aligned to the **South African National Curriculum Framework for Children from Birth to Four** (© Department of Basic Education, 2015, comprehensive 2018). It is included in every plan at no additional cost. Tenants switch it on per centre; switching it off makes the platform behave exactly as if the pack did not exist.

## What is in the pack

| Piece | Contents |
|---|---|
| Framework | Six Early Learning and Development Areas (ELDAs): Well-being (the key area), Identity and Belonging, Communication, Exploring Mathematics, Creativity, Knowledge and Understanding of the World |
| Objectives | 72 outcomes with age bands 0–18 months, 18–36 months and 3–4 years, each with an expected observation context |
| Learning modules | 4 published modules, 5 lesson plans each (20 plans): *Myself and My World*, *Sounds, Songs and Stories*, *Counting, Shapes and Play*, *Our Wonderful World* |
| Activities | 16 starter activities (sensory play, action songs, nature walks, counting trays, block challenges…) |

Plans and modules carry `source = 'ncf'`. Tenants opt in per centre under **Settings → Operations → Official NCF curriculum** ("Enable official pack").

## How it works technically

- Official content is rows with **`organisation_id IS NULL`** (the same convention as platform-wide frameworks), scoped by the `source`/`source_key` columns added in migration `029_official_ncf_content.sql`.
- Reads (`/curriculum/frameworks`, `/curriculum/objectives`, `/curriculum/lesson-plans`, `/curriculum/activities`, `/learning-modules`) include official rows **only when the centre's `organisation_settings.settings.ncf.enabled` is true** (`officialEnabled()` in `apps/api/src/modules/helpers.js`).
- Official rows are **read-only** for tenants everywhere (`PATCH`/`DELETE`/`archive`/`transition`/`reorder`/`link` all return `403 Official content is read-only`). This is enforced server-side, not just hidden in the UI.
- **Adopting** content copies it into the tenant's workspace with source attribution preserved (`source = 'ncf'`) and a fresh draft status: `POST /curriculum/adopt` with `{ "kind": "lesson_plan" | "activity" | "module", "id": "…" }`. Adopting a module copies the module and its five plans with positions intact.
- A **teacher guide PDF** is generated on demand from the module's plans and objectives: `GET /learning-modules/:id/teacher-guide`.
- The pack is seeded idempotently on **every catalogue seed** (`packages/database/seeds/official-ncf.js`), which runs on every Vercel cold start (`api/[...path].js` → `seedCatalog`) — so production receives the pack automatically on deploy, and re-running the seed republishes content safely. A failure logs an error and never takes the API down. Run it manually with `node scripts/seed-ncf.js` against `DATABASE_URL`.

## Updating the content

Edit `packages/database/seeds/official-ncf.js` (framework, domains, objectives, modules, plans, activities — each keyed by stable `source_key`s, upserts in place). Bump `VERSION` to publish a new version. Adopting tenants keep their copies; new-adoptions receive the updated content. Users of already-adopted copies are not force-updated — by design.

## Licensing note

The NCF itself is © Department of Basic Education and remains free to use with attribution. The lesson plans, teacher guides and activity wording in the pack were **drafted in-house by Re-EL ECD**, not copied from DBE publications, so the pack is ours to distribute. Before marketing co-branding or a paid add-on, confirm the position with DBE if you intend to reproduce DBE materials verbatim. Do not claim "DBE-approved" as an endorsement — the NCF is a framework, not an approval mark.

## Why it is opt-in and free

- Optional: organisations using their own frameworks/methods are untouched.
- Included in all plans: it drives adoption, not paywalls; the "Hide official pack" switch removes it entirely when enabled.
