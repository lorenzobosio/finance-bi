---
phase: 02-core-bi-house-as-business
plan: 04
subsystem: ui
tags: [next-app-router, react-19, tailwind-v4, shadcn, tremor-raw, recharts-3, supabase-ssr, rls, kpi, dashboard]

# Dependency graph
requires:
  - phase: 02-01
    provides: format.ts (formatEUR/formatPct), period.ts (currentPeriodKey/isProvisional)
  - phase: 02-03
    provides: live marts (v_home_kpis, v_pnl_monthly, v_costcenter_bva) under RLS/security_invoker
  - phase: 01
    provides: status-banners.tsx (FreshnessBanner/ReconnectBanner), @supabase/ssr server client
provides:
  - "Authenticated app shell ((protected)/layout.tsx): desktop sidebar + mobile bottom-nav, StatusBanners mounted once"
  - "Shared ?period=YYYYMM month selector (MonthSelector) — the app-wide period state every later page reads"
  - "Home dashboard: 4 North-Star KPI cards (€100k progress, €4k this month, per-person budget, margin %) reading the marts under RLS"
  - "Reusable KpiCard component (label + mono value + status/delta + mini-viz + drill-down)"
  - "Tremor Raw ProgressBar (role=progressbar + aria-valuenow/valuetext + reduced-motion)"
  - "shadcn chart base (ui/chart.tsx, Recharts-3-native) for later chart waves"
  - "Semantic finance palette in globals.css (--gain/--loss/--warning/--neutral-data)"
  - "previousPeriodKey helper (year-boundary-safe MoM key) in period.ts"
affects: [gastos, cost-centers, transacoes, config, goal-page, pwa]

# Tech tracking
tech-stack:
  added: ["shadcn ui/chart.tsx (Recharts-3)", "Tremor Raw ProgressBar block"]
  patterns:
    - "App shell owns StatusBanners (once) + the shared ?period selector; pages read searchParams.period server-side"
    - "Client nav islands (SidebarNav/BottomNav) inside a Server Component layout"
    - "KPI cards read marts via @supabase/ssr (anon + user JWT + RLS) — never service_role/Drizzle in src/app"
    - "All money/percent through formatEUR/formatPct — no ad-hoc Intl in UI"

key-files:
  created:
    - "src/app/(protected)/layout.tsx"
    - "src/components/app-nav.tsx"
    - "src/components/month-selector.tsx"
    - "src/components/kpi-card.tsx"
    - "src/components/charts/progress-bar.tsx"
    - "src/components/ui/chart.tsx"
  modified:
    - "src/app/(protected)/page.tsx"
    - "src/app/layout.tsx"
    - "src/app/globals.css"
    - "src/lib/period.ts"
    - "test/period.test.ts"

key-decisions:
  - "Moved StatusBanners from the root layout into the protected shell so the trust strip never shows on the public login page and never double-mounts (single-mount acceptance criterion)"
  - "Added the semantic finance palette (--gain/--loss/--warning/--neutral-data) the UI-SPEC mandates but globals.css was missing — required for the KPI status colors"
  - "Added previousPeriodKey (year-boundary-safe) instead of naive period-1 arithmetic for the margin MoM delta"
  - "Restored recharts to ^3.8.1 after the shadcn CLI silently downgraded it to ^3.8.0 (UI-SPEC pins Recharts 3.8.1)"

patterns-established:
  - "Pattern: shared period state via ?period=YYYYMM + a server-side parse/clamp guard (T-02-12); future pages parse the same param"
  - "Pattern: KpiCard status is icon + text + color (never color alone); €100k hero emphasis is structural (ring + md:col-span-2), not a larger font"

requirements-completed: [BI-05, BI-04, BI-01]

# Metrics
duration: 22min
completed: 2026-06-23
status: complete
---

# Phase 2 Plan 04: App Shell + Home KPIs Summary

**The first user-facing slice: an authenticated app shell (sidebar/bottom-nav + shared ?period selector + freshness banner) and a Home dashboard whose 4 KPI cards answer the North-Star questions — €100k progress, €4k this month, per-person budget, margin % — reading the live marts under RLS with correct provisional/empty states.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-06-23T14:57:00Z
- **Completed:** 2026-06-23T15:05:00Z
- **Tasks:** 2
- **Files modified:** 11 (6 created, 5 modified)

## Accomplishments
- Built the authenticated app shell: desktop ~240px sidebar + mobile 56px bottom tab bar, locked nav order (Home · Gastos · Cost Centers · Transações · Config) + disabled Goal (Phase 3) placeholder, with `<StatusBanners />` mounted once full-bleed at the top.
- Shipped the MANDATORY shared month selector (`?period=YYYYMM`): current-month default, prev/next arrows, next disabled at the current month, `MMM yyyy` mono label — the app-wide period state every later mart-backed page keys off.
- Replaced the Home stub with the real 4-KPI dashboard reading `v_home_kpis` / `v_pnl_monthly` / `v_costcenter_bva` via `@supabase/ssr` (anon + user JWT + RLS), ordered to the 4 questions with structural €100k hero emphasis.
- First-class states: current open month shows a Provisional pill and the €4k card is never red; no-budgets renders a distinct neutral "Budgets not set"; a brand-new account shows the calm "Synchronizing" band over €0 states.
- Added the reusable KpiCard, the Tremor Raw ProgressBar (a11y `role=progressbar`), the shadcn Recharts-3 chart base, and the semantic finance palette.

## Task Commits

Each task was committed atomically:

1. **Task 1: App shell — nav + shared ?period selector + freshness banner** - `88cbdba` (feat)
2. **Task 2: Home — 4 headline KPI cards from the marts + KpiCard + ProgressBar** - `ac31f87` (feat)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `src/app/(protected)/layout.tsx` (created) - Authenticated shell: sidebar/bottom-nav, mounts StatusBanners once, shared top bar with the month selector.
- `src/components/app-nav.tsx` (created) - SidebarNav + BottomNav from one locked nav list + disabled Goal placeholder; active-state via usePathname.
- `src/components/month-selector.tsx` (created) - Client island that reads/writes `?period=YYYYMM`; parse/clamp guard, current-month default, next disabled at current month.
- `src/components/kpi-card.tsx` (created) - Reusable KPI card: label + mono value + status pill / delta chip (icon+text+color) + optional mini-viz; whole card is a drill-down link; structural `emphasis` for the hero.
- `src/components/charts/progress-bar.tsx` (created) - Tremor Raw ProgressBar adapted to the semantic palette with `role=progressbar` + aria-valuenow/valuetext + reduced-motion.
- `src/components/ui/chart.tsx` (created) - shadcn official chart base (Recharts-3-native) for later chart waves.
- `src/app/(protected)/page.tsx` (modified) - Real Home: parses ?period, reads the 3 marts under RLS, derives the 4 KPIs + provisional/empty/no-budget states.
- `src/app/layout.tsx` (modified) - Removed StatusBanners (moved into the protected shell).
- `src/app/globals.css` (modified) - Added the semantic finance palette tokens (`--gain`/`--loss`/`--warning`/`--neutral-data` + fills) to `:root` and `@theme inline`.
- `src/lib/period.ts` (modified) - Added `previousPeriodKey` (year-boundary-safe MoM key).
- `test/period.test.ts` (modified) - Added 2 tests for `previousPeriodKey`.

## Decisions Made
- Mounted `StatusBanners` in the protected shell (not root layout) — keeps the trust strip off the public login page and satisfies the single-mount acceptance criterion. Verified by grep (1 JSX mount in the protected layout, 0 in the root layout).
- Added the semantic finance palette that the UI-SPEC §Color mandates but `globals.css` was still missing — the KPI status tones (gain/loss/warning/neutral) depend on it.
- Used a dedicated `previousPeriodKey` helper rather than `period - 1` so January's MoM delta correctly points at the prior December.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added the semantic finance palette to globals.css**
- **Found during:** Task 2 (KpiCard / Home KPIs)
- **Issue:** The UI-SPEC §Color requires `--gain`/`--loss`/`--warning`/`--neutral-data` (text + fill tiers, AA on white) as the only chromatic tokens, but `globals.css` only had the greyscale base — the KPI status colors had nothing to reference.
- **Fix:** Added the 6 tokens (text + fill) to `:root` and mapped them in `@theme inline`, using the exact OKLCH values the UI-SPEC specifies.
- **Files modified:** src/app/globals.css
- **Verification:** `pnpm build` + `pnpm lint` green; KpiCard/ProgressBar reference the tokens via `var(--gain)` etc.
- **Committed in:** ac31f87 (Task 2 commit)

**2. [Rule 1 - Bug] Restored recharts to ^3.8.1 after the shadcn CLI downgraded it**
- **Found during:** Task 1 (`npx shadcn add chart`)
- **Issue:** The shadcn CLI rewrote `package.json` recharts from `^3.8.1` to `^3.8.0` and updated the lockfile/node_modules — an unintended dependency regression (UI-SPEC pins Recharts 3.8.1).
- **Fix:** Restored `package.json` to `^3.8.1`, reverted `pnpm-lock.yaml` via git, and `pnpm install --frozen-lockfile` to put 3.8.1 back in node_modules.
- **Files modified:** package.json (restored, no net diff), pnpm-lock.yaml (reverted)
- **Verification:** `node -e "require('recharts/package.json').version"` → 3.8.1; lockfile clean.
- **Committed in:** 88cbdba (Task 1 commit — package.json had no net change, so it carried no diff)

**3. [Rule 3 - Blocking] Moved StatusBanners from root layout into the protected shell**
- **Found during:** Task 1 (app shell)
- **Issue:** StatusBanners was already mounted in the root layout (Phase 1). Mounting it again in the protected layout (as the plan/UI-SPEC require) would double-mount it on every protected page and violate the single-mount acceptance criterion; it also showed on the public login page.
- **Fix:** Removed the root-layout mount; the protected shell now owns the single mount.
- **Files modified:** src/app/layout.tsx, src/app/(protected)/layout.tsx
- **Verification:** grep — 1 `<StatusBanners />` JSX mount in the protected layout, 0 in root.
- **Committed in:** 88cbdba (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 missing-critical, 1 bug, 1 blocking)
**Impact on plan:** All three were necessary for correctness / the locked design contract — adding the mandated palette, honoring the Recharts 3.8.1 pin, and enforcing the single-banner-mount rule. No scope creep.

## Issues Encountered
- None during planned work beyond the deviations above. The shadcn CLI ran successfully (first-party component only, no third-party registry — T-02-SC holds).

## Known Stubs
- **Disabled "Goal (Phase 3)" nav item** (`src/components/app-nav.tsx`) — INTENTIONAL per UI-SPEC §0 ("a disabled Goal placeholder may appear, greyed, Phase 3"). The €100k Goal page is a Phase-3 deliverable; the placeholder is non-interactive and clearly marked. Not a data stub.

## Deferred Issues
- **Pre-existing RED test stubs (out of scope):** `test/actions.test.ts` and `test/reapply.test.ts` fail because they import `@/lib/actions/*` modules that do not exist yet (committed as TDD RED stubs in plan 02-01; the Server Actions land in plans 02-05 / 02-06 per 02-PATTERNS.md). Untouched by this plan and unrelated to the Home/shell slice. Logged in `deferred-items.md`. All 16 in-scope suites pass (104 tests).

## User Setup Required
None - no external service configuration required. (Reads use the existing @supabase/ssr session + live marts from Plan 03.)

## Next Phase Readiness
- The shared `?period` selector + KpiCard + ProgressBar + chart base are ready for the remaining Phase-2 pages (Gastos, Cost Centers, Transações, Config), which all read the same period and marts.
- The disabled Goal nav slot is the hook the Phase-3 €100k goal page plugs into.
- No blockers.

## Self-Check: PASSED

- All 6 created files + the modified Home page exist on disk.
- Both task commits (`88cbdba`, `ac31f87`) exist in git history.
- `pnpm build` + `pnpm lint` green; 104 in-scope tests pass (the 2 failing suites are pre-existing out-of-scope RED stubs for unbuilt Server Actions).

---
*Phase: 02-core-bi-house-as-business*
*Completed: 2026-06-23*
