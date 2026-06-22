---
phase: 01-ingestion-enable-banking
plan: 05
subsystem: ui
tags: [github-actions, cron, supabase-ssr, rls, shadcn, alert, lucide, date-fns, vitest, freshness-banner, reconnect-banner]

# Dependency graph
requires:
  - phase: 01-02
    provides: connections schema (last_pull_at, consent_status, expires_at) + RLS
  - phase: 01-03
    provides: scripts/ingest.ts (the pnpm ingest entrypoint the cron runs)
  - phase: 01-04
    provides: the postgres-driver write plane + import_batches heartbeat
provides:
  - "Daily GitHub Actions ingestion cron (.github/workflows/ingest.yml) — schedule 17 5 * * * + workflow_dispatch, the Supabase keep-alive"
  - "Server-side connection-status derivation (getConnectionStatus + pure deriveFreshness/deriveNeedsReconnect, 36h threshold) read via @supabase/ssr under RLS"
  - "The two global status banners (freshness + reconnect) mounted in the app shell per the UI-SPEC"
affects: [02-core-bi, 04-pwa, 07-reminders]

# Tech tracking
tech-stack:
  added: [shadcn alert primitive]
  patterns:
    - "Read plane = @supabase/ssr server client under the user JWT (RLS); write plane = postgres driver in the cron only — strictly separated (FND-03)"
    - "Pure derivation helpers (deriveFreshness/deriveNeedsReconnect) factored out so banner logic is unit-tested with no DB/network"
    - "CI runner materialises a multi-line .pem secret to a chmod-600 runner temp file at runtime (no committed key)"

key-files:
  created:
    - .github/workflows/ingest.yml
    - src/lib/status/connection-status.ts
    - src/components/ui/alert.tsx
    - src/components/status/freshness-banner.tsx
    - src/components/status/reconnect-banner.tsx
    - src/components/status/status-banners.tsx
    - test/status-banners.test.tsx
  modified:
    - src/app/layout.tsx
    - vitest.config.ts

key-decisions:
  - "ingest.yml wires DATABASE_URL + ENABLE_BANKING_APP_ID + ENABLE_BANKING_PRIVATE_KEY_PATH (NOT SUPABASE_SERVICE_ROLE_KEY) — corrects the plan's stale cron-secrets guidance to match what scripts/ingest.ts actually reads (postgres driver, not the Supabase service_role client)"
  - "STALE_THRESHOLD_HOURS = 36 named constant, kept out of user-facing copy"
  - "Banner placement: a global StatusBanners layout slot at the top of the app shell, full-bleed, static (not sticky) for Phase 1, reconnect above freshness"
  - "Reconnect soft-dismiss via sessionStorage (reappears next load); ReconnectBanner is a client component, the rest are server-rendered"

patterns-established:
  - "Status-banner read plane never imports the service_role chokepoint or the postgres driver — keeps the Phase-0 ESLint guard + CI bundle-grep green"
  - "vitest include extended to *.test.tsx for pure (no-DOM) derivation suites in the node environment"

requirements-completed: [ING-02, ING-05, ING-06]

# Metrics
duration: 6min
completed: 2026-06-22
status: complete
---

# Phase 01 Plan 05: Ingestion cron + status banners Summary

**Daily GitHub Actions ingestion cron plus the two global status banners (freshness + reconnect), driven by a server-side connection-status derivation that reads `connections` via @supabase/ssr under RLS — never the service_role client.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-22T18:46:36Z
- **Completed:** 2026-06-22T18:52:11Z
- **Tasks:** 3 of 3 auto tasks (Task 4 is a human checkpoint — see "Next Phase Readiness")
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments
- **ING-02** — `.github/workflows/ingest.yml`: a daily cron (`17 5 * * *` UTC ≈ 06:17 Europe/Berlin, off-peak, once/day) + `workflow_dispatch`, Node 20 + pnpm 9.15.9, running `pnpm ingest` headlessly. It is also the Supabase keep-alive (every run writes the `import_batches` heartbeat).
- **ING-05 / ING-06** — server-side `getConnectionStatus()` derives `fresh`/`stale`/`unknown` (36h threshold) + `needsReconnect` from the latest `connections` row via the `@supabase/ssr` server client under the user JWT (RLS). Pure helpers (`deriveFreshness`, `deriveNeedsReconnect`) are unit-tested GREEN with no DB/network.
- **ING-06 (visible half)** — `FreshnessBanner` (always-shown "Data as of {date}" strip) + `ReconnectBanner` (passive, soft-dismissible, shown only when consent expired) + the `StatusBanners` slot, all per the UI-SPEC, mounted at the top of the app shell.

## Task Commits

Each task was committed atomically:

1. **Task 1: Daily GitHub Actions ingestion cron** - `6637d2c` (feat)
2. **Task 2: Server-side connection-status derivation + unit test (TDD)** - `1378818` (feat — RED→GREEN in one atomic commit per the inline-commit instruction)
3. **Task 3: Two banners + StatusBanners slot + layout mount** - `3f5fb61` (feat)

## Files Created/Modified
- `.github/workflows/ingest.yml` - Daily cron + workflow_dispatch; wires DATABASE_URL + ENABLE_BANKING_APP_ID + ENABLE_BANKING_PRIVATE_KEY_PATH; materialises the .pem secret to a chmod-600 runner temp file; never echoes a secret
- `src/lib/status/connection-status.ts` - `STALE_THRESHOLD_HOURS=36`, `deriveFreshness`, `deriveNeedsReconnect`, `getConnectionStatus()` (RLS read plane — no service_role / postgres driver)
- `src/components/ui/alert.tsx` - shadcn alert primitive (official registry)
- `src/components/status/freshness-banner.tsx` - fresh/stale/unknown states, amber reserved for stale/unknown, font-mono "d MMM yyyy" date, role=status aria-live=polite
- `src/components/status/reconnect-banner.tsx` - destructive palette, inline `pnpm eb:connect`, "How to reconnect" link, sessionStorage soft-dismiss, role=alert aria-live=assertive
- `src/components/status/status-banners.tsx` - server slot: reconnect first, freshness second, full-bleed, static
- `src/app/layout.tsx` - mounts `<StatusBanners />` at the top of the app shell, above page content
- `test/status-banners.test.tsx` - pure-helper unit tests (1h→fresh, 36h boundary→fresh, 40h→stale, null→unknown, expired→needsReconnect)
- `vitest.config.ts` - include now collects `*.test.tsx`

## Decisions Made
- **Corrected the plan's cron-secrets guidance** (it predates Wave 3/4): `scripts/ingest.ts` writes via the **postgres driver + `DATABASE_URL`**, not the Supabase service_role client, so the workflow wires `DATABASE_URL`, `ENABLE_BANKING_APP_ID`, and `ENABLE_BANKING_PRIVATE_KEY_PATH` — and intentionally does **not** reference `SUPABASE_SERVICE_ROLE_KEY`. The RS256 private key arrives as the multi-line `.pem` CONTENT in `ENABLE_BANKING_PRIVATE_KEY` and is written to `$RUNNER_TEMP/eb-private-key.pem` (chmod 600) at runtime.
- **36h threshold** as a named constant (`STALE_THRESHOLD_HOURS`), boundary inclusive (=36h is still fresh), never inlined in copy.
- **Banner placement:** a global `StatusBanners` layout slot at the top of the app shell, full-bleed, **static** (not sticky) for Phase 1; reconnect rendered **above** freshness.
- **ReconnectBanner is a client component** (sessionStorage soft-dismiss, reappears next load); FreshnessBanner + StatusBanners are server-rendered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the cron's env/secret wiring to match scripts/ingest.ts**
- **Found during:** Task 1
- **Issue:** The plan's Task 1 action/verify said to wire `SUPABASE_SERVICE_ROLE_KEY` (+ NEXT_PUBLIC_SUPABASE_URL) and claimed "ingest writes via the Supabase service_role client". That is stale — `scripts/ingest.ts` writes via the `postgres` driver using `DATABASE_URL` and reads `ENABLE_BANKING_APP_ID` + `ENABLE_BANKING_PRIVATE_KEY_PATH`. Wiring service_role would have left the cron unable to authenticate/connect and would have provisioned the wrong secret.
- **Fix:** Wired the env vars ingest.ts actually reads (`DATABASE_URL`, `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY_PATH`); added a runtime step that writes the `.pem` secret to a chmod-600 runner temp file; documented why `SUPABASE_SERVICE_ROLE_KEY` is intentionally absent.
- **Files modified:** .github/workflows/ingest.yml
- **Verification:** Confirmed against `scripts/ingest.ts` (`requireEnv("DATABASE_URL")`, `requireEnv("ENABLE_BANKING_APP_ID")`, `requireEnv("ENABLE_BANKING_PRIVATE_KEY_PATH")`); no `secrets.SUPABASE_SERVICE_ROLE_KEY` wiring present.
- **Committed in:** `6637d2c` (Task 1 commit)

**2. [Rule 3 - Blocking] Extended vitest include to collect *.test.tsx**
- **Found during:** Task 2
- **Issue:** The plan mandates the test file be `test/status-banners.test.tsx`, but vitest's `include` was `["test/**/*.test.ts"]` — a `.test.tsx` file would never be collected.
- **Fix:** Added `"test/**/*.test.tsx"` to the include glob. The test exercises only pure helpers (no DOM render), so the existing `node` environment suffices — no jsdom/testing-library dependency added.
- **Files modified:** vitest.config.ts
- **Verification:** `pnpm test` collects and runs the suite (8 tests pass); full suite 68 pass.
- **Committed in:** `1378818` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both necessary for correctness — the first prevents a non-functional cron and the wrong secret being provisioned; the second is required for the mandated test filename to run. No scope creep.

## Issues Encountered
- The Task 2 verify grep `! grep -qE 'createServiceClient' connection-status.ts` initially tripped on an explanatory comment that contained the literal token. Reworded the comment (kept the meaning) so the file contains no `createServiceClient` literal; the import is `createClient` from `@/lib/supabase/server` (the @supabase/ssr server client). Verify chain now prints `STATUS-GREEN`.

## Security (threat model verification)
- **T-01-01 (secrets in CI logs):** secrets injected as env from GitHub Secrets; no echo; the `.pem` is written via `printf '%s'` (masked) to a temp file.
- **T-01-17 (service_role → browser):** `connection-status.ts` reads only via `@supabase/ssr`; build verified — `.next/static` has no `SUPABASE_SERVICE_ROLE_KEY` name/value, no `createServiceClient`, no ingest writer. FND-03 stays green.
- **T-01-12 (silent staleness):** freshness banner always shown; reconnect banner loud on expired consent.

## Verification Results
- `pnpm test`: **68 passed (12 files), 0 failed** (status-banners suite: 8 passed)
- `pnpm build`: clean (Next 15.5.19, Turbopack); FND-03 bundle-grep clean (no service_role name/value, no createServiceClient, no ingest writer in `.next/static`)
- `pnpm lint`: clean
- Task 1/2/3 verify greps: all pass (`CRON` env wiring corrected, `STATUS-GREEN`, `UI-STRUCTURE-OK`)

## User Setup Required
The orchestrator must add two GitHub repo secrets for the cron (DATABASE_URL already exists from Phase 0 CI):
- `ENABLE_BANKING_APP_ID` — the Enable Banking application id (JWT `kid`)
- `ENABLE_BANKING_PRIVATE_KEY` — the multi-line RS256 `.pem` CONTENT (written to a runner temp file at runtime)

## Next Phase Readiness
- **Task 4 (human visual checkpoint) is PENDING** — Claude built + wired the components and verified build/lint/tests; the orchestrator runs the visual verification with the user (`pnpm dev`, sign in, confirm fresh/stale/unknown/reconnect states + mobile readability + soft-dismiss per the UI-SPEC).
- The cron is the MVP dead-man's-switch detector; the banners are the visible half of ING-05/06. Phase 7 (reminders) builds on the same `connections.expires_at`/`consent_status` state.

## Self-Check: PASSED

All 8 created/modified files exist on disk; all 3 task commits (`6637d2c`, `1378818`, `3f5fb61`) are present in git history.

---
*Phase: 01-ingestion-enable-banking*
*Completed: 2026-06-22*
