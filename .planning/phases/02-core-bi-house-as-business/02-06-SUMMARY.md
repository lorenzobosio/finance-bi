---
phase: 02-core-bi-house-as-business
plan: 06
subsystem: ui
tags: [next-app-router, react-19, server-actions, supabase-ssr, rls, zod, keyset-pagination, shadcn, radix, transacoes, recategorize, rules]

# Dependency graph
requires:
  - phase: 02-05
    provides: the write-plane template ('use server' action module + sibling *.schema.ts), recategorize.schema.ts frozen contract, budgets.ts Server-Action pattern
  - phase: 02-02
    provides: DB-backed rules engine + db-rules.ts match_criteria {contains} shape (the matcher this re-apply core mirrors)
  - phase: 02-04
    provides: app shell + (protected)/page.tsx RLS-read RSC pattern + shared ?period selector
  - phase: 01
    provides: @supabase/ssr server client (createClient, anon + user JWT), allowlist RLS on transactions/rules, normalized transactions (description/cost_center/category_id/flow_type)
provides:
  - "Transações page: dense, server-side KEYSET-paginated (booking_date,id) transactions table — Uncategorized surfaced first, investimento/transferência 'excluded' chip (CAT-06)"
  - "Inline edit popover (Radix, keyboard + focus-restore): Save change → recategorize one row; 'Also create a rule for future {merchant}' → forward-only rule; SEPARATE 'Re-apply to {n}…' confirm dialog"
  - "recategorize Server Action: validates RecategorizeInputSchema, updates EXACTLY ONE transactions row, optional forward rule — never touches history on save (D2-03)"
  - "createRuleFromTx Server Action: inserts one forward-only rule (priority 100, version 1, match_criteria {contains}); modifies no transactions (D2-02/CAT-05)"
  - "reapplyRuleToPast Server Action + the PURE computeReapply/reapplyRuleToTransactions core: explicit, idempotent re-apply to past returning a server-side affected-count (CAT-05)"
  - "First-party shadcn primitives: table, popover, select, dialog, badge, skeleton"
affects: [config-rules-management, goal-page, ai-insights]

# Tech tracking
tech-stack:
  added: ["shadcn table/popover/select/dialog/badge/skeleton (first-party, registries={})", "supabase-js keyset .or() row-value seek", "useTransition optimistic write paths"]
  patterns:
    - "Testable Server-Action seam: the 'use server' module exports the public async action + a __-prefixed core taking an injected client factory, so the action body is asserted DB-free (mirrors ingest.ts IngestWriter/IngestFetcher fakes) while staying RLS-only in production"
    - "A 'use server' module may export ONLY async functions — the PURE re-apply core + its types live in reapply-rule.ts (plain module, what the frozen test imports), and the 'use server' wrapper lives in reapply-rule.action.ts; never re-export across a 'use server' boundary (it zeroes the module's exports)"
    - "Server-side KEYSET pagination via supabase-js: .order(booking_date desc).order(id desc).limit(N+1) + a validated `?after=<date>_<uuid>` cursor expressed as .or('booking_date.lt.D,and(booking_date.eq.D,id.lt.ID)') — no offset, parameterized (no raw SQL concat)"

key-files:
  created:
    - "src/lib/actions/recategorize.ts"
    - "src/lib/actions/recategorize.shared.ts"
    - "src/lib/actions/create-rule.ts"
    - "src/lib/actions/reapply-rule.ts"
    - "src/lib/actions/reapply-rule.action.ts"
    - "src/components/transacoes/tx-table.tsx"
    - "src/components/transacoes/edit-popover.tsx"
    - "src/app/(protected)/transacoes/page.tsx"
    - "src/components/ui/table.tsx"
    - "src/components/ui/popover.tsx"
    - "src/components/ui/select.tsx"
    - "src/components/ui/dialog.tsx"
    - "src/components/ui/badge.tsx"
    - "src/components/ui/skeleton.tsx"
    - "test/recategorize.test.ts"
  modified:
    - "test/reapply.test.ts"

key-decisions:
  - "Honored the FROZEN test/reapply.test.ts contract (reapplyRuleToTransactions / ReapplyTx / ReapplyRule from @/lib/actions/reapply-rule) over the plan frontmatter's computeReapply-only naming — the RED stub is the authoritative contract; computeReapply is exported alongside as the plan also asked"
  - "Split the re-apply into a PURE core module (reapply-rule.ts — the test's import path, types + pure fns) and a 'use server' wrapper (reapply-rule.action.ts), because a 'use server' module cannot export types or non-async values"
  - "Testable __-seam: __recategorize/__createRuleFromTx take an injected client factory so the action bodies are asserted DB-free; the public recategorize/createRuleFromTx wrap them with the real @supabase/ssr client"
  - "reapplyRuleToPast resolves its argument as a rule uuid OR a merchant string (the inline editor only knows the merchant → looks up that merchant's forward rule by match_criteria->>contains) so the popover's re-apply targets the right rule"

patterns-established:
  - "Pattern: 'use server' action module = public async action + __-prefixed core(injected factory) for DB-free assertion; pure cores/types live in a sibling plain module (never re-exported across the 'use server' boundary)"
  - "Pattern: supabase-js keyset/seek pagination on (booking_date, id) with a validated string cursor — the stable, offset-free Transações table"

requirements-completed: [CAT-04, CAT-05, CAT-06]

# Metrics
duration: 13min
completed: 2026-06-23
status: complete
---

# Phase 2 Plan 06: Transações Write-Path Vertical Slice Summary

**The Transações table + inline edit: a server-side keyset-paginated transactions view where a user re-categorizes a row and assigns its cost center (one row only), creates a forward-only rule so they never re-tag the same merchant twice, and explicitly re-applies a rule to past rows with an idempotent server-side affected-count — all through zod-validated Server Actions under the allowlist RLS, never service_role; raw history never silently rewritten.**

## Performance
- **Duration:** ~13 min
- **Tasks:** 3 (two TDD)
- **Files:** 16 (15 created, 1 modified)

## Accomplishments
- Built the **recategorize + create-rule** Server Actions (CAT-04): `recategorize` validates `RecategorizeInputSchema`, updates **EXACTLY ONE** transactions row (`.eq('id', txId)` — never a bulk update on save, D2-03), and optionally delegates to `createRuleFromTx`, which inserts **one forward-only rule** (`match_criteria: { contains: merchant }`, `priority 100`, `version 1`) touching **no** existing transactions (D2-02/CAT-05). Both write through `@supabase/ssr` under the allowlist RLS; the DB write carries only the zod-parsed fields (mass-assignment guard).
- Built the **reapply-rule** action + its pure core (CAT-05): `computeReapply`/`reapplyRuleToTransactions` return only rows matching the rule whose cost center is **not already** the target — so a re-run affects **0 rows** (idempotent, the ingest.ts check-then-write idiom). `reapplyRuleToPast` is a **distinct, explicit** action (its own file) — never called from recategorize/createRule — that bulk-`UPDATE`s the computed set under RLS and returns `{ affected }`.
- Built the **Transações page**: a dense, fixed-row-height table with **server-side keyset pagination** on `(booking_date, id)` (validated `?after=<date>_<uuid>` cursor → a parameterized `.or()` seek — NOT offset; the id tiebreaker is mandatory), skeleton rows, and the "No transactions yet" empty state. **Uncategorized rows are surfaced first** (amber `TriangleAlert` + pill); `investimento`/`transferência` rows carry the muted **`excluded`** chip so the table reconciles with the P&L (CAT-06).
- Built the **edit popover** (Radix, full keyboard + focus-restore): clicking Category/Cost-center opens a popover with two selects + the "**Also create a rule for future {merchant}**" toggle and a **Save change** button (optimistic via `useTransition`). A **SEPARATE** "**Re-apply to {n} matching past transactions**" control opens a confirm dialog (showing the count) that calls `reapplyRuleToPast` and surfaces the server-returned affected-count — never on the save path.
- TDD: `test/recategorize.test.ts` (injected-fake supabase client → asserts the one-row update, the forward-rule shape, and that recategorize never exposes `reapplyRuleToPast`); extended `test/reapply.test.ts` with the `computeReapply` idempotency assertions. Full suite **128/128 green** (the last Wave-0 RED stub now resolves).

## Task Commits

1. **Task 1 (TDD): recategorize + create-rule Server Actions** — `53460e2` (feat)
2. **Task 2 (TDD): reapply-rule — explicit, idempotent re-apply to past** — `c2f1d0b` (feat)
3. **Task 3: Transações keyset table + inline edit popover** — `e3af8d9` (feat)

## Files Created/Modified
- `src/lib/actions/recategorize.ts` (created) — `'use server'`; `__recategorize` (injected-factory core) updates one row + optional forward rule; public `recategorize` wraps it with the real client.
- `src/lib/actions/recategorize.shared.ts` (created) — the structural `WriteClient` interface + factory/`CreateRuleInput` types (non-`'use server'`, so the actions + test share them).
- `src/lib/actions/create-rule.ts` (created) — `'use server'`; `__createRuleFromTx`/`createRuleFromTx` insert one forward-only rule (`{ contains }`, priority 100, version 1), no-op on a blank merchant.
- `src/lib/actions/reapply-rule.ts` (created) — the PURE core + types the frozen test imports: `computeReapply`, `reapplyRuleToTransactions`, `ReapplyRule`, `ReapplyTx` (case-insensitive substring matcher mirroring db-rules.ts).
- `src/lib/actions/reapply-rule.action.ts` (created) — `'use server'`; `reapplyRuleToPast` resolves a rule by uuid OR merchant, computes the affected set, bulk-`UPDATE`s only those rows via `@supabase/ssr`, returns `{ affected }`.
- `src/components/transacoes/tx-table.tsx` (created) — dense table (Date · Merchant · Account · Category · Cost center · Amount); Uncategorized pill + `excluded` chip; `TxTableSkeleton`; mono/tabular amounts via `formatEUR`.
- `src/components/transacoes/edit-popover.tsx` (created) — `'use client'` Radix popover/select + the forward-rule toggle + the separate re-apply confirm dialog.
- `src/app/(protected)/transacoes/page.tsx` (created) — RSC: validated keyset cursor → seek query (RLS, embeds account/category names) + the categories/cost_centers dropdown reads; Uncategorized-first ordering; "Next 50 →" keyset link.
- `src/components/ui/{table,popover,select,dialog,badge,skeleton}.tsx` (created) — first-party shadcn primitives (`registries={}`).
- `test/recategorize.test.ts` (created) — DB-free behaviour test (injected fake; schema boundary; one-row guarantee; reapply-isolation guard).
- `test/reapply.test.ts` (modified) — extended the frozen idempotency suite with `computeReapply` assertions.

## Decisions Made
- **Frozen test wins over plan frontmatter naming.** `test/reapply.test.ts` (the Wave-0 RED anchor) imports `reapplyRuleToTransactions` / `ReapplyTx` / `ReapplyRule` from `@/lib/actions/reapply-rule`; the plan's `<action>` named only `computeReapply`. The frozen contract is authoritative — I implemented exactly its exports and additionally exported `computeReapply` (which the plan also asked for and the popover/action use).
- **Pure-core / 'use server'-wrapper split for re-apply.** A `'use server'` module may export only async functions (no types, no pure values). So `reapply-rule.ts` is a plain module (the test's import path: pure fns + types) and `reapply-rule.action.ts` carries the `'use server'` `reapplyRuleToPast`. This mirrors the 02-05 schema/action split.
- **Injected-factory `__`-seam for DB-free action tests.** The actions expose a `__recategorize(raw, factory)` / `__createRuleFromTx(input, factory)` core taking a client factory so the unit test injects a spy supabase client and asserts the exact calls — keeping the test DB-free while production uses the real `@supabase/ssr` `createClient`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A `'use server'` re-export zeroed recategorize.ts's exports**
- **Found during:** Task 3 (build of the popover importing `recategorize`)
- **Issue:** Task 1 added `export { __createRuleFromTx } from "@/lib/actions/create-rule"` to the `'use server'` `recategorize.ts` so the test could import both from one module. Next 15 treats a re-export in a `'use server'` file as a non-async export and **drops ALL exports** ("The module has no exports at all"), breaking `import { recategorize }`.
- **Fix:** Removed the re-export; `recategorize.ts` exports only its async actions. The test imports `__createRuleFromTx` directly from `create-rule.ts`.
- **Files modified:** src/lib/actions/recategorize.ts, test/recategorize.test.ts
- **Verification:** `pnpm build` + `pnpm lint` green; `pnpm test -- recategorize` GREEN (9).
- **Committed in:** e3af8d9 (Task 3 commit)

**2. [Rule 1 - Bug] reapplyRuleToPast couldn't resolve the rule the popover passed**
- **Found during:** Task 3 (wiring the re-apply confirm dialog)
- **Issue:** The action contract is `reapplyRuleToPast(ruleId)`, but the inline editor only knows the **merchant** string — passing it as a `ruleId` would never match a `rules.id` uuid, so the re-apply would always return `{ affected: 0 }`.
- **Fix:** The action now resolves its argument as a uuid id OR (when not a uuid) the merchant's most-recent forward rule via `match_criteria->>contains` — so the popover's "Re-apply to past" targets the correct rule and returns a real count. The `(ruleId)`-by-uuid path is unchanged for callers that already hold an id (e.g. Config rule management, D2-future).
- **Files modified:** src/lib/actions/reapply-rule.action.ts, src/components/transacoes/edit-popover.tsx
- **Verification:** `pnpm build` + `pnpm lint` green; full suite 128/128.
- **Committed in:** e3af8d9 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both were necessary for the slice to compile and for the re-apply to actually work end-to-end. No scope creep — the action contracts, security model, and CAT-05 invariants are unchanged.

## Issues Encountered
- `revalidatePath` throws outside a Next request context, so the DB-free action tests stub `next/cache` via `vi.mock` — the test asserts the supabase calls, not the cache revalidation. (Standard for unit-testing Server Action bodies.)

## Threat Surface
All STRIDE register items held: zod `.parse` field allow-list + parsed-fields-only writes (T-02-19 mass-assignment); re-apply idempotent + affected-count, targets only not-already-set rows (T-02-20); saving updates ONE row, re-apply is a separate explicit dialog — recategorize/createRule never reference `reapplyRuleToPast` (T-02-21, grep + test verified); only `@supabase/ssr` under `src/app`/`src/lib/actions`, no `service_role`/`DATABASE_URL`/Drizzle in the request path (T-02-22, grep — comment matches only); RLS is the write authz wall (T-02-23); the `(booking_date, id)` cursor is parsed/validated server-side, a malformed cursor falls back to page 1, no raw param concatenated into SQL (T-02-24); `npx shadcn add` wrote first-party radix-nova source only, `registries={}` — zero third-party installs (T-02-SC). No new threat surface beyond the register.

## Known Stubs
None — the Transações page renders live transactions under RLS; the recategorize/create-rule/reapply actions all carry real mutation bodies (the 02-05 `recategorize.ts` deferred body is now implemented). `matchingPastCount` is computed from the current page's rows (a within-page count for the popover label); the authoritative server-side count is returned by `reapplyRuleToPast` itself on confirm — not a data stub.

## User Setup Required
None — reads + writes use the existing `@supabase/ssr` session under the existing allowlist RLS on `transactions`/`rules` (no new policy, no external config).

## Next Phase Readiness
- The `'use server'` action + `__`-seam + pure-core/wrapper split is the template the **Config** rules/categories management (BI-06 continuation) reuses (it offers the same explicit re-apply on an edited rule, now resolvable by rule id).
- The keyset table + edit popover are reusable for any later transaction-drill surface (Goal contributions, AI insight "review these N rows").
- `reapplyRuleToPast` already accepts a rule id, so Config's rule editor can wire the same idempotent re-apply with zero action changes.

## Self-Check: PASSED
- All 15 created files + the 1 modified file exist on disk.
- All 3 task commits (`53460e2`, `c2f1d0b`, `e3af8d9`) exist in git history.
- `pnpm build` + `pnpm lint` green; `pnpm test` 128/128 (recategorize 9, reapply 4, actions 11 — all GREEN); the last Wave-0 RED stub (`reapply.test.ts`) now resolves.
- Security greps clean (no `service_role`/`DATABASE_URL`/Drizzle in `src/app`/`src/lib/actions` — comment matches only); tx query is keyset on `(booking_date, id)`, no `.range`/offset; recategorize/create-rule never reference `reapplyRuleToPast`.

---
*Phase: 02-core-bi-house-as-business*
*Completed: 2026-06-23*
