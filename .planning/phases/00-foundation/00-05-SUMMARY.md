---
phase: 00-foundation
plan: 05
subsystem: database
tags: [rls, supabase, postgres, drizzle, security, allowlist, pii, tdd, security-definer]

# Dependency graph
requires:
  - phase: 00-foundation
    provides: Drizzle schema + 13-table RLS wall (hardcoded 2-email allowlist), env-based isAllowed() app gate, live Supabase DB
provides:
  - app_allowlist table (email pk, created_at) — the single DB-side source of the permitted emails
  - public.is_email_allowed(text) SECURITY DEFINER function (RLS-recursion-safe allowlist oracle)
  - All 14 RLS policies (13 data tables + app_allowlist) gate on is_email_allowed(jwt email)
  - scripts/seed-allowlist.mjs + pnpm db:seed-allowlist (env-seeded allowlist, zero emails in SQL)
  - Source-cleanliness guard test (public-repo PII regression guard)
  - Email-free migrations re-applied cleanly to the live DB
affects: [ingestion, core-bi, ship, public-release, any-phase-touching-rls-or-migrations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DB-driven allowlist: emails live only in app_allowlist (seeded from ALLOWED_EMAILS env), never in committed SQL"
    - "SECURITY DEFINER oracle function to consult an RLS-enabled table from other tables' policies without recursion"
    - "Single source of truth: app gate (isAllowed) and DB wall (app_allowlist) both derive from ALLOWED_EMAILS"
    - "Source-cleanliness guard test that loads forbidden literals at runtime and asserts on counts only (never prints PII)"
    - "Supabase role grants re-asserted in migration SQL so fresh-DB rebuilds restore anon/authenticated/service_role privileges"

key-files:
  created:
    - scripts/seed-allowlist.mjs
    - test/source-cleanliness.test.ts
  modified:
    - src/lib/db/schema.ts
    - drizzle/0000_init.sql
    - drizzle/0001_rls_policies.sql
    - drizzle/0002_seed.sql
    - drizzle/meta/_journal.json
    - test/rls.assert.mjs
    - test/allowlist.test.ts
    - package.json

key-decisions:
  - "Allowlist is DATA not code: app_allowlist table seeded from ALLOWED_EMAILS env; no email literal in any committed file"
  - "SECURITY DEFINER public.is_email_allowed() with empty search_path avoids RLS recursion on the (also-RLS-enabled) app_allowlist table"
  - "members.email made nullable; members seeded by display name only (emails are PII, removed)"
  - "Fresh-DB rebuild: regenerated 0000_init from schema, hand-authored email-free 0001/0002, dropped+re-applied against live DB"
  - "Re-asserted Supabase anon/authenticated/service_role grants in 0001 so a clean rebuild does not 'permission denied' before RLS runs"
  - "Scrubbed the 3 planning SUMMARY docs too — the whole repo is going public, not just src/migrations"

patterns-established:
  - "Source-cleanliness guard: greps all tracked files for forbidden PII, runtime-loaded literals, count-only assertions"
  - "Env-seeded reference data via a node postgres-js script wired as a pnpm db:* command"

requirements-completed: []

# Metrics
duration: ~70min
completed: 2026-06-22
status: complete
---

# Phase 0 Plan 05: Allowlist Hardening Summary

**Replaced the hardcoded 2-email RLS allowlist with an env-seeded `app_allowlist` table guarded by a SECURITY DEFINER `is_email_allowed()` function, removing every real email literal from the soon-to-be-public repo and proving the wall is dynamic/table-driven against the live Supabase DB — all test-first.**

## Performance

- **Duration:** ~70 min (wall clock spanned a date boundary; active execution well under that)
- **Started:** 2026-06-21T22:51:29Z
- **Completed:** 2026-06-22
- **Tasks:** 4 commits (2 TDD test commits, 1 feature commit, 1 blocking-fix commit)
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments
- **`app_allowlist` table + `public.is_email_allowed()` SECURITY DEFINER oracle**; all 14 RLS policies (13 data tables + `app_allowlist`) now gate on it, RLS enabled on every table, `(select ...)` initplan wrapper kept.
- **Zero real emails in any committed file** — migrations, seed, RLS assertions, and 3 planning docs scrubbed; a runtime-driven source-cleanliness guard test enforces it permanently (asserts on counts, never prints the PII it protects).
- **Allowlist seeded from `process.env.ALLOWED_EMAILS`** via `scripts/seed-allowlist.mjs` (`pnpm db:seed-allowlist`), normalizing identically to the app-layer `isAllowed()`.
- **Migrations rewritten email-free and re-applied cleanly to the live DB**; live assertions prove the wall is table-driven: a temp email gains row access on insert into `app_allowlist` and loses it on delete; members store zero emails.
- **Full gate green:** lint, `tsc --noEmit`, `next build`, `vitest run` (19 tests), and the live RLS assertions all pass.

## Task Commits

1. **Task 1: broaden isAllowed() env-parsing coverage** - `8eef069` (test) — whitespace/case/empty/single/multiple/trailing-comma edge cases (already-passing parser, contract strengthened before making the env the seed source).
2. **Task 2: failing source-cleanliness guard** - `106b3dd` (test) — RED: 6 tracked files still contained the real emails.
3. **Task 3: env-seeded app_allowlist + table-driven RLS** - `9f752e8` (feat) — table, function, policy rewrite, seed script, scrub of all source/migrations/docs; turned the guard GREEN.
4. **Task 4: restore Supabase role grants for fresh re-apply** - `b711d1c` (fix) — blocking-issue fix found when applying to the live DB.

**Plan metadata:** see final docs commit.

_TDD note: the plan-level cycle was test(RED guard) → feat(GREEN) → fix; the two `test(...)` commits precede the `feat(...)` commit that turns them green._

## Files Created/Modified
- `scripts/seed-allowlist.mjs` - Reads ALLOWED_EMAILS, normalizes, upserts into app_allowlist; prints counts only.
- `test/source-cleanliness.test.ts` - Public-repo PII regression guard over all tracked files.
- `src/lib/db/schema.ts` - Added `app_allowlist`; made `members.email` nullable.
- `drizzle/0000_init.sql` - Regenerated: includes `app_allowlist`, nullable `members.email`.
- `drizzle/0001_rls_policies.sql` - `is_email_allowed()` SECURITY DEFINER + table-driven policies for all 14 tables + Supabase role grants.
- `drizzle/0002_seed.sql` - Members seeded by display name only (no emails); taxonomy/goals/dim_calendar unchanged.
- `drizzle/meta/_journal.json` + snapshots - Re-registered 0001/0002 after regen.
- `test/rls.assert.mjs` - Extended: app_allowlist + SECURITY DEFINER checks, dynamic add/remove proof, members-have-no-email check; no real email literal.
- `test/allowlist.test.ts` - Extended env-parsing coverage.
- `package.json` - Added `db:seed-allowlist` script.

## Decisions Made
- **Allowlist as data, not code.** The set of permitted emails lives only in `.env.local` and the `app_allowlist` table; the env seeds the table at deploy time. This is what makes the repo publishable.
- **SECURITY DEFINER with empty `search_path`.** `app_allowlist` is itself RLS-enabled; an inline subquery in the other tables' policies would recurse. The owner-privileged function bypasses that table's RLS safely and resists search-path hijacking.
- **Scrubbed planning docs too.** The objective is a clean public repo; the 3 historical SUMMARY files that quoted the emails were rewritten to reference the env/table instead (names Lorenzo/Fernanda kept — only emails are PII).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-asserted Supabase role grants in 0001**
- **Found during:** Task 4 (applying email-free migrations to the live DB)
- **Issue:** Rebuilding the `public` schema (`drop schema public cascade`) for the fresh re-apply dropped the table/sequence GRANTs Supabase normally manages for `anon`/`authenticated`/`service_role`. The first live RLS assertion failed with `permission denied for table dim_calendar` — RLS could not even run because the base table privilege was missing.
- **Fix:** Added a grants block at the top of `0001_rls_policies.sql` (`grant ... on all tables`/sequences + `alter default privileges`) so any clean `drizzle-kit migrate` restores them. RLS still enforces row-level access on top.
- **Files modified:** drizzle/0001_rls_policies.sql
- **Verification:** Fresh reset → migrate → seed-allowlist → `pnpm test:rls` all green (14 tables, dynamic allowlist before=0/granted>0/afterRemoval=0/denied=0).
- **Committed in:** b711d1c

**2. [Rule 2 - Scope-correct hardening] Scrubbed emails from 3 planning SUMMARY docs**
- **Found during:** Task 3 (running the source-cleanliness guard)
- **Issue:** The guard flagged 6 tracked files, not the 3 source/migration files alone — 3 `.planning/` SUMMARY docs also quoted the real emails. A public repo must not ship them anywhere.
- **Fix:** Rewrote the offending lines to reference the env/`app_allowlist` mechanism (kept first names).
- **Files modified:** .planning/phases/00-foundation/00-01-SUMMARY.md, 00-02-SUMMARY.md, 00-03-SUMMARY.md
- **Verification:** `git grep` for the two addresses returns nothing; guard test GREEN.
- **Committed in:** 9f752e8

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 critical hardening)
**Impact on plan:** Both essential to the objective (a clean, re-applicable, public-safe DB). No scope creep — both directly serve "no email literal anywhere" + "clean re-apply to the live DB".

## Issues Encountered
- **Migration ordering:** the auto-generated delta migration created `app_allowlist` AFTER the RLS migration that needs it. Resolved by regenerating `0000_init` from the updated schema (so `app_allowlist` + nullable `members.email` exist from the start) and hand-authoring the email-free `0001`/`0002`, then re-registering them in the journal. Verified by a clean reset + migrate.

## User Setup Required
None for code. Operationally: `ALLOWED_EMAILS` must be present in the deploy environment, and `pnpm db:seed-allowlist` must run after migrations so the live `app_allowlist` is populated (an empty allowlist locks everyone out — the seed script refuses to run on an empty env to make that failure loud).

## Next Phase Readiness
- The repo is PII-free and safe to make public; the guard test will fail CI if a real email is ever reintroduced.
- The live DB is rebuilt and verified table-driven. Ingestion (Phase 1) and Core BI (Phase 2) inherit a clean, env-seeded allowlist with no migration changes needed.
- Recommend wiring `pnpm db:seed-allowlist` into the deploy/migrate step so the allowlist is always seeded post-migrate.

## Self-Check: PASSED

- Files verified present: scripts/seed-allowlist.mjs, test/source-cleanliness.test.ts, drizzle/0001_rls_policies.sql, drizzle/0002_seed.sql, 00-05-SUMMARY.md
- Commits verified in history: 8eef069, 106b3dd, 9f752e8, b711d1c
- Gate verified green: lint=0, tsc=0, vitest=0 (19 tests), build=0, live RLS assertions=0
- `git grep` for the two real emails over all tracked files: no matches

---
*Phase: 00-foundation*
*Completed: 2026-06-22*
