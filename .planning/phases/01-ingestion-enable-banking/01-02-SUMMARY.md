---
phase: 01-ingestion-enable-banking
plan: 02
status: complete
requirements: [ING-03, ING-04, CAT-01, CAT-07]
completed: 2026-06-22
---

# Plan 01-02 Summary — ingestion schema + cost_centers lookup + import_batches (live-applied)

## What was built

- **Extended `schema.ts`** (additive ingestion columns):
  - `accounts`: `is_investment` (NOT NULL default false — the D-22 investing flag), `enable_banking_id` (text UNIQUE), `iban`, `is_synced` (NOT NULL default true).
  - `transactions`: `description_raw`, `counterparty`, `counterparty_iban`, `is_recurring` (NOT NULL default false), `status`.
  - `connections`: `consent_status`, `last_pull_at`, `session_id`.
- **cost_center: fixed enum → extensible lookup (D-24).** Replaced the `cost_center` pgEnum with a `cost_centers` lookup table (`code` PK, `label`), and converted the four former enum columns (`accounts.default_cost_center`, `rules.set_cost_center`, `transactions.cost_center`, `budgets.cost_center`) to **text FKs** referencing `cost_centers.code`. Seeded `lorenzo / fernanda / compartilhado / sublocacao`. The legacy `shared` value maps to `compartilhado`.
- **`import_batches`** audit/heartbeat table (ING-04): id, started_at, finished_at, status, source, fetched, inserted, skipped, error.
- **`drizzle/0003_ingestion.sql`** (generated, then hand-finished) + **`drizzle/0004_ingestion_rls.sql`** (RLS) + extended **`test/rls.assert.mjs`**.

## Final cost_center representation (per plan output)

- **Lookup table `cost_centers`**, FK-referenced by the 4 columns — new centers are now one `INSERT`, not a breaking enum migration.
- **`shared` → `compartilhado` translation** baked into 0003 (an `UPDATE ... WHERE = 'shared'` per column, after the enum→text conversion and before the FKs validate). The affected tables were empty at apply time, so it was a no-op in practice but keeps the migration correct against any data.

## Requirements

- **ING-03** ✓ — ingestion columns present (the UNIQUE `dedupe_hash` already existed from Phase 0).
- **ING-04** ✓ — `import_batches` table live with RLS + allowlist policy.
- **CAT-01** ✓ — fixed taxonomy sufficient; cost centers now extensible.
- **CAT-07** ✓ — `accounts.default_cost_center` is the FK the default-cost-center rule reads.

## Verification (LIVE)

- `pnpm db:generate` emitted 0003 with all new columns/tables; `pnpm build` clean.
- `pnpm drizzle-kit migrate` applied **0003 + 0004 to the live Supabase DB** → `[✓] migrations applied successfully`.
- `pnpm test:rls` (live) **passed**: `tables=16` (was 14), every public table `rowsecurity=true` (incl. `import_batches` + `cost_centers`), the table-driven allowlist still gates correctly, and `cost_centers` holds exactly the 4 D-24 codes.

## Deviations / notable

- **drizzle snapshot chain repair** — the Phase-0 hand-written 0001/0002 left `0002_snapshot.json.prevId` pointing at 0000 instead of 0001 (a parent-snapshot collision that blocked `db:generate`). Relinked 0002 → 0001 (metadata only; no DB/SQL impact). Future `db:generate` runs are now clean.
- **`USING ... ::text` casts** were hand-added to the enum→text `ALTER COLUMN`s — Postgres rejects an enum→text conversion without an explicit cast, which drizzle-kit omits; this would have failed the live apply.
- **0004 as a custom migration** — scaffolded via `drizzle-kit generate --custom --name ingestion_rls` so the journal + snapshot stay consistent (mirrors how Phase 0 created 0001/0002); RLS is hand-written (Drizzle doesn't manage RLS).
- Execution ran **inline on branch `phase-01-wave2-schema`** (not a worktree subagent): Task 3 is `autonomous:false` and needs `.env.local`, which a worktree checkout would not contain.

## Deferred / notes

- `transactions.import_batch_id` stays plain text (stores the `import_batches` uuid; no FK rewrite — RESEARCH low-risk note).
- The category-management UI (rich taxonomy editing) remains Phase 2 (D-20).
