---
phase: 00-foundation
plan: 02
subsystem: database
tags: [drizzle, drizzle-kit, postgres, supabase, rls, migrations, schema, dim_calendar, seed]

# Dependency graph
requires:
  - phase: 00-01
    provides: "Next 15 scaffold, postgres/drizzle deps, validated DATABASE_URL (session pooler 5432), test/rls.assert.sql, allowlist emails"
provides:
  - "Full v1 Drizzle schema: 3 enums + 13 tables (12 v1 + dim_calendar) with numeric(14,2) money and transactions.dedupe_hash NOT NULL UNIQUE"
  - "Server-only Drizzle client (src/lib/db/index.ts) for migrations / Phase-1 writes — bypasses RLS, never request-time"
  - "Three ordered migrations applied live: 0000_init (DDL), 0001_rls_policies (RLS on every table), 0002_seed (members + taxonomy + calendar)"
  - "Live Supabase Postgres: 13 tables, RLS enabled on all (0 off), 13 allowlist policies, members=2, dim_calendar 4383 rows / 144 period_keys (202401-203512)"
  - "db:generate / db:migrate / db:push scripts; Node RLS verifier test/rls.assert.mjs (psql-free)"
affects: [01-ingestion, 02-core-bi, 03-100k-goal, "Plan 00-03 (protected page DB read)", "Plan 00-04 (deploy)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drizzle owns DDL (build-time, privileged conn); @supabase/ssr owns request-time reads (RLS-bound)"
    - "RLS + seed as hand-written custom SQL migrations alongside Drizzle-generated DDL (D-08)"
    - "Allowlist hardcoded in RLS policy with (select auth.jwt()->>'email') initplan wrapper (D-15/A5)"

key-files:
  created:
    - src/lib/db/schema.ts
    - src/lib/db/index.ts
    - drizzle.config.ts
    - drizzle/0000_init.sql
    - drizzle/0001_rls_policies.sql
    - drizzle/0002_seed.sql
    - scripts/gen-calendar.ts
    - test/rls.assert.mjs
  modified:
    - package.json
    - drizzle/meta/_journal.json

key-decisions:
  - "RLS allowlist emails hardcoded in 0001: redacted@example.com, redacted@example.com (lowercase) — keep ALLOWED_EMAILS env in sync (Plan 03)"
  - "Applied via drizzle-kit migrate (journal ordering 0000->0001->0002), not push+psql"
  - "test:rls retargeted from psql to a Node postgres-js verifier (no psql binary in this environment)"
  - "Renamed generated 0000 to 0000_init.sql and synced the journal tag to match"

patterns-established:
  - "Pattern: server-only Drizzle client reserved for migrations / Phase-1 ingestion writes; all user reads via @supabase/ssr under RLS"
  - "Pattern: every public table ships ENABLE RLS + a for-all-to-authenticated allowlist policy in the same 0001 migration"
  - "Pattern: deterministic seed UUIDs so taxonomy children reference parents within one batch; on-conflict makes the seed idempotent"

requirements-completed: [FND-02, FND-04]

# Metrics
duration: 7min
completed: 2026-06-21
status: complete
---

# Phase 0 Plan 02: v1 Schema, RLS & Seed Summary

**Full v1 Drizzle schema (13 tables + 3 enums) authored, RLS-on-every-table + members/taxonomy/dim_calendar(2024-2035) shipped as ordered SQL migrations, and applied live to Supabase — verified: 13 tables, RLS on all, allowlist returns rows for allowed emails and zero for everyone else.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-21T21:58:17Z
- **Completed:** 2026-06-21T22:05:01Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Full v1 dimensional schema in Drizzle: 3 enums (`flow_type`, `cost_center`, `category_group`) + all 12 v1 tables + `dim_calendar`; every money column `numeric(14,2)`; `transactions.dedupe_hash` NOT NULL + UNIQUE (idempotency contract from day one).
- RLS enabled on **every** one of the 13 public tables with a hardcoded 2-email allowlist policy using the `(select auth.jwt()->>'email')` initplan-caching wrapper.
- Seed: 2 members (Lorenzo, Fernanda), the fixed 3-group category taxonomy (parents + children via self-FK), the €100k goal + 5 milestones, and `dim_calendar` for 2024-2035.
- **[BLOCKING] migrations applied to the LIVE Supabase Postgres** (0000 → 0001 → 0002) and verified: 13 tables, 0 with RLS off, 13 policies, members=2, dim_calendar 4383 rows / 144 period_keys / 202401-203512, and the RLS wall proven (allowlisted email = 4383 rows, non-allowlisted = 0).

## Task Commits

1. **Task 1: Define full v1 schema + server-only db client; generate 0000_init** - `b10e2c4` (feat)
2. **Task 2: Author RLS (0001) + seed (0002) migrations; calendar generator** - `09c8724` (feat)
3. **Task 3: [BLOCKING] Apply migrations live + assert** - no new source files (applied migrations to live infra; verified via `pnpm test:rls`)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified
- `src/lib/db/schema.ts` - 3 pgEnums + 13 pgTables; numeric(14,2) money; dedupe_hash unique index; categories self-FK; FKs across the fact tables.
- `src/lib/db/index.ts` - `import 'server-only'` postgres-js + drizzle client (migrations / Phase-1 writes only; bypasses RLS — never request-time).
- `drizzle.config.ts` - postgresql dialect, schema path, `DATABASE_URL` credentials.
- `drizzle/0000_init.sql` - generated DDL (enums → tables → FKs → indexes).
- `drizzle/0001_rls_policies.sql` - ENABLE RLS + `allowlist_all` policy on all 13 tables.
- `drizzle/0002_seed.sql` - members, taxonomy, goal/milestones, dim_calendar 2024-2035.
- `scripts/gen-calendar.ts` - date-fns calendar generator (emits the dim_calendar INSERTs).
- `test/rls.assert.mjs` - Node (postgres-js) RLS+seed verifier; mirrors `test/rls.assert.sql` and adds the allowlist zero-rows/rows assertion.
- `package.json` - `db:generate`/`db:migrate`/`db:push` scripts; `test:rls` retargeted to the Node verifier.
- `drizzle/meta/_journal.json` - journal entries for 0000_init / 0001_rls_policies / 0002_seed.

## Decisions Made
- **RLS allowlist emails hardcoded** in 0001 (`redacted@example.com`, `redacted@example.com`) per A5/D-15 — emails are not secret. A migration comment flags they must stay in sync with the app-layer `ALLOWED_EMAILS` (Plan 03 middleware).
- **Migrate path used:** `pnpm drizzle-kit migrate` (journal-ordered 0000 → 0001 → 0002). The `migrate` path worked first try; no fallback to `push` + `psql` was needed.
- **Renamed the generated 0000 file to `0000_init.sql`** (drizzle-kit emitted `0000_tired_loners.sql`) and updated the journal `tag` so `migrate` still resolves it — keeps filenames matching the plan and PROJECT structure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `test:rls` used `psql`, which is not installed in this environment**
- **Found during:** Task 3 ([BLOCKING] live verification)
- **Issue:** The Plan-01 `test:rls` script ran `psql "$DATABASE_URL" -f test/rls.assert.sql`, but there is no `psql` binary on PATH here, so the BLOCKING verification could not run as written.
- **Fix:** Added `test/rls.assert.mjs`, a Node verifier using the already-present `postgres` driver (no new dependency), mirroring every assertion in `test/rls.assert.sql` and additionally proving the FND-02b allowlist wall via `set local role authenticated` + `request.jwt.claims`. Repointed `test:rls` at it.
- **Files modified:** `test/rls.assert.mjs` (new), `package.json`
- **Verification:** `pnpm test:rls` exits 0 against the live DB; an independent ad-hoc probe confirmed 13 tables / 0 RLS-off / 13 policies / 3 migrations applied.
- **Committed in:** `09c8724` (Task 2 commit)

**2. [Rule 1 - Bug] Renamed generated 0000 migration + synced journal tag**
- **Found during:** Task 1
- **Issue:** `drizzle-kit generate` emitted `0000_tired_loners.sql`; the plan/structure expect `0000_init.sql`. A bare file rename would desync the journal `tag` and break `drizzle-kit migrate`.
- **Fix:** Renamed the file to `0000_init.sql` and updated `drizzle/meta/_journal.json` entry tag to `0000_init` so the journal and file stay consistent.
- **Files modified:** `drizzle/0000_init.sql`, `drizzle/meta/_journal.json`
- **Verification:** `drizzle-kit migrate` applied all three migrations successfully.
- **Committed in:** `b10e2c4` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both necessary to make the BLOCKING live verification runnable and the migration chain consistent. No scope creep; no new dependencies.

## Issues Encountered
- Node 20.20 in this environment has no TS runtime (`tsx`/`esbuild` absent, no `--experimental-strip-types`). `scripts/gen-calendar.ts` is committed as the canonical TS artifact; the actual `0002_seed.sql` was produced by running the identical date-fns logic through `node --input-type=module`. No functional impact — the SQL row counts match exactly (4383 / 144 / 202401-203512).

## User Setup Required
None - Supabase was already provisioned and validated in Plan 00-01; the live `DATABASE_URL` (session pooler 5432) from `.env.local` was used directly. No secrets were printed or committed.

## Next Phase Readiness
- Plan 00-03 can read the seeded data through `@supabase/ssr` (RLS-bound) to prove the protected-page gate; the schema + RLS wall it depends on are live.
- Plan 00-04 (Vercel deploy) needs `DATABASE_URL` + Supabase env vars in Vercel — unchanged from Plan 01's provisioning notes.
- **Sync note for Plan 03:** the app-layer `ALLOWED_EMAILS` must equal the 2 hardcoded RLS emails: `redacted@example.com`, `redacted@example.com`.

## Self-Check: PASSED

All 9 created files present on disk; both task commits (`b10e2c4`, `09c8724`) exist in git history; live DB independently confirmed (13 tables / 0 RLS-off / 13 policies / 3 migrations applied).

---
*Phase: 00-foundation*
*Completed: 2026-06-21*
