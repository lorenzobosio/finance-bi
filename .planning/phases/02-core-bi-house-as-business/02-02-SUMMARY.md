---
phase: 02-core-bi-house-as-business
plan: 02
subsystem: database
tags: [drizzle, postgres, rules-engine, classification, migrations, typescript]

# Dependency graph
requires:
  - phase: 01-ingestion
    provides: "pure ordered rules engine (engine.ts), builtins.ts RuleId union, scripts/ingest.ts postgres-driver writer, cost_centers lookup, rules/budgets tables + RLS"
  - phase: 02-01
    provides: "Wave-0 RED stubs (test/rules-db.test.ts), mart formula-mirror harness decision"
provides:
  - "DB-backed rules engine: applyRules(tx, accounts, dbRules=[]) consults DB rules first (priority/version, first-match), falls through to builtins"
  - "src/lib/ingestion/rules/db-rules.ts — pure DbRule interface + orderDbRules/evaluateDbRules/matchesDbRule (DB-free, server-plane)"
  - "BUILTIN_RULE_IDS — deterministic 6666… uuid map seeded as real rules rows (D2-04 audit fix); writer stamps a real rule_id, never NULL"
  - "drizzle/0005_builtin_rules_seed.sql — 6 builtin rules + 'shared' cost-center alias (drift fix)"
  - "drizzle/0006_budgets_category_id.sql + schema.ts — nullable budgets.category_id FK (category-grain budgets, BI-02)"
affects: [02-03-reapply, 02-04-marts, 02-05-recategorize, 02-06-budgets, "category-grain budgeted-vs-actual", "rule audit trail"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure DB-rule plane: cron LOADS rows (write plane), engine RECEIVES them as an argument and stays DB-free (mirrors connection-status.ts typed-read/pure-derive split)"
    - "Deterministic builtin→uuid seed (6666… literals) so a code-side RuleId FK-resolves to a real rules.id"
    - "Cost-center alias row to reconcile a frozen-test code vs live-seed drift without editing the frozen test"

key-files:
  created:
    - "src/lib/ingestion/rules/db-rules.ts"
    - "drizzle/0005_builtin_rules_seed.sql"
    - "drizzle/0006_budgets_category_id.sql"
    - "drizzle/meta/0005_snapshot.json"
    - "drizzle/meta/0006_snapshot.json"
  modified:
    - "src/lib/ingestion/rules/builtins.ts"
    - "src/lib/ingestion/rules/engine.ts"
    - "src/lib/db/schema.ts"
    - "scripts/ingest.ts"
    - "test/rules-db.test.ts"
    - "test/helpers/fake-ingest-writer.ts"
    - "drizzle/meta/_journal.json"

key-decisions:
  - "Cost-center drift resolved by ADDING a ('shared','Shared') alias row in 0005 (not editing the frozen test, not changing the engine default) — the frozen test asserts 'shared'; compartilhado stays the canonical live default"
  - "Honored the frozen rules-db.test.ts API verbatim: DbRule uses { matchCriteria: {contains}, setsFlowType, setsCostCenter } and evaluateDbRules(tx, rows) — the test is the contract, over the RESEARCH sketch's string matchCriteria"
  - "match_criteria stored as JSON text ({\"contains\":\"…\"}); builtin-seed rows carry NULL criteria so they never match in the DB plane (handled in code) — they exist only for rule_id auditability"
  - "Classification.ruleId widened RuleId → RuleId | string so a DB-rule classification carries its own uuid; the writer maps a builtin RuleId via BUILTIN_RULE_IDS, else uses the DB uuid"

patterns-established:
  - "Pattern 5 (DB-backed rules + builtin fallback) realized: engine stays pure; cron is the only DB-touching plane"
  - "Hand-written numbered migration + matching journal entry + snapshot so drizzle-kit migrate applies it and a future db:generate diffs cleanly"

requirements-completed: [CAT-04, CAT-06, BI-02]

# Metrics
duration: 7min
completed: 2026-06-23
status: complete
---

# Phase 02 Plan 02: DB-Backed Rules Engine + Builtin-UUID Seed + budgets.category_id Summary

**Made the classifier DB-backed (consults `rules` rows first, falls back to the frozen builtin cascade), seeded the 6 builtins as real fixed-uuid rows so every classification stamps a non-NULL `rule_id`, reconciled the shared/compartilhado cost-center drift via a `shared` alias row, and added the nullable `budgets.category_id` FK — all autonomous work; the LIVE migration push remains a blocking human checkpoint.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-23T12:11:23Z
- **Completed:** 2026-06-23T12:18:00Z (autonomous tasks)
- **Tasks:** 2 of 3 (Task 3 = blocking human-action checkpoint, NOT executed — no DATABASE_URL)
- **Files modified:** 12 (7 modified, 5 created)

## Accomplishments
- `applyRules` now accepts an optional `dbRules` arg; DB rules are evaluated first in (priority, version) order, first-match-wins, then fall through UNCHANGED to the builtin cascade — the default `[]` keeps the frozen `test/rules.test.ts` green (10/10).
- New pure `src/lib/ingestion/rules/db-rules.ts` (`DbRule`, `orderDbRules`, `matchesDbRule`, `evaluateDbRules`) — DB-free, imports only a `type` from engine.ts, no postgres/Drizzle/@supabase.
- `BUILTIN_RULE_IDS` maps the 6 `RuleId` strings to fixed `6666…0001…0006` uuids, seeded as real `rules` rows in `0005`; the writer now stamps `BUILTIN_RULE_IDS[ruleId] ?? ruleId` for `rule_id` (D2-04 — no more `${null}`).
- Cost-center drift fixed: `0005` adds a `('shared','Shared')` alias so every code the engine can emit is a subset of `cost_centers.code`, with the frozen test untouched.
- `budgets.category_id` (nullable FK → categories.id) added in schema.ts + `0006` for category-grain budgeted-vs-actual (BI-02).
- `scripts/ingest.ts` loads DB rules once per run (`getDbRules`) and passes them into the engine; the postgres-driver writer parses JSON `match_criteria` defensively (skips builtin/null/malformed rows, never throws).

## Task Commits

1. **Task 1: builtin-uuid seed + budgets.category_id + cost-center drift** — `b2e4b34` (feat)
2. **Task 2: DB-backed engine (optional dbRules) + writer stamps real rule_id** — `9bdaea5` (feat)

**Plan metadata:** see final docs commit.

_TDD: each task delivered with its source + extended `test/rules-db.test.ts` assertions in one green commit; the frozen `test/rules.test.ts` was held byte-for-byte green throughout._

## Files Created/Modified
- `src/lib/ingestion/rules/db-rules.ts` (created) - Pure DbRule plane: ordering + first-match matcher, DB-free.
- `src/lib/ingestion/rules/builtins.ts` - Added `BUILTIN_RULE_IDS` deterministic uuid map.
- `src/lib/ingestion/rules/engine.ts` - `applyRules` gains `dbRules: DbRule[] = []` evaluated first; `Classification.ruleId` widened to `RuleId | string`.
- `src/lib/db/schema.ts` - `budgets.categoryId` nullable FK → categories.id.
- `scripts/ingest.ts` - `getDbRules()` on `IngestWriter` + service impl; `rule_id` INSERT stamps the real uuid (never NULL); engine call passes `dbRules`.
- `drizzle/0005_builtin_rules_seed.sql` (created) - 6 builtin rules (fixed uuids) + `shared` cost-center alias; `on conflict (id/code) do nothing`.
- `drizzle/0006_budgets_category_id.sql` (created) - `ALTER TABLE budgets ADD COLUMN category_id uuid REFERENCES categories(id)`.
- `drizzle/meta/_journal.json` + `0005_snapshot.json` + `0006_snapshot.json` (created/modified) - Registered both hand-written migrations so `drizzle-kit migrate` applies them in order and a future `db:generate` diffs cleanly.
- `test/rules-db.test.ts` - Exact-uuid map, cost-center subset (drift), DB-rule first-match + builtin-fallback assertions.
- `test/helpers/fake-ingest-writer.ts` - `getDbRules()` returning `[]` by default (overridable).

## Decisions Made
- **Drift fix via alias row, not test edit:** the frozen `rules.test.ts` exercises a SHARED account whose default code is the bare string `shared` and asserts the engine emits `shared`. The 0003 seed stored `compartilhado` and translated legacy `shared`→`compartilhado`, orphaning the engine's `shared`. Adding a `('shared','Shared')` alias in 0005 FK-resolves it while keeping `compartilhado` the canonical live default and the frozen assertions unchanged — exactly the path the plan prescribed when the frozen test expects `shared`.
- **Frozen-test API beats the RESEARCH sketch:** `rules-db.test.ts` (the contract) uses `matchCriteria: {contains}` (object), `setsFlowType`/`setsCostCenter`, and `evaluateDbRules(tx, rows)`. RESEARCH sketched a string `matchCriteria` + `orderDbRules`. I implemented the test's API as canonical and ALSO exported `orderDbRules` (plan frontmatter listed it) for downstream use.
- **JSON match_criteria:** user-rule criteria stored as JSON text; the writer parses defensively and skips null/malformed rows so a bad rule never crashes the cron. Builtin-seed rows have NULL criteria — they exist purely so a builtin classification's `rule_id` resolves.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered drizzle journal + snapshots for the hand-written migrations**
- **Found during:** Task 1 (writing 0005/0006)
- **Issue:** `drizzle-kit migrate` applies only migrations tracked in `drizzle/meta/_journal.json`; hand-written 0005/0006 would be silently skipped at the checkpoint, and a future `db:generate` would diff against a stale snapshot.
- **Fix:** Added `idx 5/6` journal entries + generated `0005_snapshot.json` (data-only, schema identical to 0004) and `0006_snapshot.json` (0005 + the `budgets.category_id` column/FK) with fresh id/prevId chaining.
- **Files modified:** drizzle/meta/_journal.json, drizzle/meta/0005_snapshot.json, drizzle/meta/0006_snapshot.json
- **Verification:** journal chain valid; `pnpm lint` green; migrations will apply in order after 0004 at the human checkpoint.
- **Committed in:** b2e4b34 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the migrations to actually apply at the checkpoint and for toolchain consistency. No scope creep.

## Issues Encountered
- None during planned work. The frozen `rules.test.ts` stayed green throughout (10/10); the full `rules + rules-db + ingest` set is 21/21 green; `pnpm lint` green.

## Deferred Issues (out of scope — pre-existing RED stubs)
Three Wave-0 RED stubs from plan 02-01 fail at import-resolution because their downstream modules don't exist yet (they belong to later plans, NOT this one):
- `test/reapply.test.ts` → imports `@/lib/actions/reapply-rule` (Plan 02-03)
- `test/marts.test.ts` → imports the mart formula helpers (Plan 02-04)
- `test/actions.test.ts` → imports `@/lib/actions/recategorize` + `@/lib/actions/budgets` (Plan 02-05/06)

These were RED before this plan started (`bb4e0f4 test(02-01): add four Wave-0 RED stubs`) and are correctly left untouched per the SCOPE BOUNDARY. Note `test/actions.test.ts` already imports `BudgetInputSchema` — Plan 06 will consume the new `budgets.category_id` column added here.

## BLOCKING Checkpoint — Task 3 (live migration) NOT executed
This plan is `autonomous: false`. Task 3 applies `0005` + `0006` to the LIVE Supabase Postgres, which needs the uncommitted `DATABASE_URL`. The executor has no DATABASE_URL and must not touch the live DB. The migration SQL FILES are written, committed, and journal-registered; the LIVE push is the human-action checkpoint below.

**Until the live push lands, the schema-applied must-have is UNMET:** TS types come from the Drizzle config (not the live DB), so build/verify would falsely pass while the live `rules` table lacks the 6 seeded uuids and `budgets` lacks `category_id`.

## Next Phase Readiness
- Code-side foundation ready: DB-backed engine, builtin-uuid seed, `budgets.category_id` available for Plan 06's category-grain budgets, real `rule_id` stamping for Plan 03's reapply audit trail.
- **Blocker:** the LIVE migration push (Task 3 checkpoint) must complete and `pnpm test:rls` must be green before downstream plans rely on the new column/rows existing in the live DB.

## Self-Check: PASSED

- FOUND: .planning/phases/02-core-bi-house-as-business/02-02-SUMMARY.md
- FOUND: drizzle/0005_builtin_rules_seed.sql
- FOUND: drizzle/0006_budgets_category_id.sql
- FOUND: src/lib/ingestion/rules/db-rules.ts
- FOUND commit: b2e4b34 (Task 1)
- FOUND commit: 9bdaea5 (Task 2)

---
*Phase: 02-core-bi-house-as-business*
*Completed (autonomous portion): 2026-06-23*
