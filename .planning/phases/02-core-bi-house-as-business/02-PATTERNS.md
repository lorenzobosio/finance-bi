# Phase 2: Core BI + house-as-business - Pattern Map

**Mapped:** 2026-06-23
**Files analyzed:** 28 new/modified files
**Analogs found:** 24 / 28 (4 net-new with no direct analog → use RESEARCH.md patterns)

> Read-only analysis. All excerpts cite real files + line numbers in the current repo. The
> planner should reference these analogs in each PLAN.md action; do NOT re-derive patterns.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **Data layer / migrations** | | | | |
| `src/lib/db/schema.ts` (extend `budgets.categoryId`; mart view defs) | model | CRUD | self (`budgets`, `transactions` in `schema.ts`) | exact (in-file) |
| `drizzle/0005_budgets_category_id.sql` (ALTER budgets) | migration | transform | `drizzle/0003_ingestion.sql` (ADD COLUMN + FK) | exact |
| `drizzle/0006_builtin_rules_seed.sql` (seed builtin rules w/ fixed uuids) | migration | batch | `drizzle/0002_seed.sql` (fixed-uuid seed + on conflict) | exact |
| `drizzle/0007_marts.sql` (P&L / sublet / breakdown / budget / balance views) | migration | transform | `drizzle/0001_rls_policies.sql` (hand-written SQL DDL) | role-match |
| `drizzle/0008_marts_rls.sql` + balances UNIQUE idx | migration | transform | `drizzle/0001_rls_policies.sql` (`enable rls` + allowlist policy per object) | exact |
| `src/lib/db/marts.ts` (typed `pgView(...).existing()` mart handles) | model | transform | `schema.ts` (pgTable defs) | role-match |
| **Rules engine (DB-backed)** | | | | |
| `src/lib/ingestion/rules/engine.ts` (extend: optional `dbRules` arg) | service | transform | self (`engine.ts`) | exact (in-file) |
| `src/lib/ingestion/rules/builtins.ts` (extend: `BUILTIN_RULE_IDS` uuid map; calibrate sublet) | model | transform | self (`builtins.ts`) | exact (in-file) |
| `src/lib/ingestion/rules/db-rules.ts` (load+order DB rules) | service | CRUD | `connection-status.ts` (typed read + pure derive split) | role-match |
| `scripts/ingest.ts` (stamp real `rule_id`, line ~196) | service | batch | self (`ingest.ts`) | exact (in-file) |
| **Server Actions (write plane)** | | | | |
| `src/lib/actions/recategorize.ts` | controller | request-response | RESEARCH Pattern 6 (no existing Server Action) | no-analog (build from research) |
| `src/lib/actions/create-rule.ts` | controller | request-response | RESEARCH Pattern 6 | no-analog |
| `src/lib/actions/reapply-rule.ts` (idempotent bulk) | controller | batch | `ingest.ts` `upsertBalance` check-then-write idempotency | partial |
| `src/lib/actions/budgets.ts` (set + set-from-history) | controller | CRUD | RESEARCH Pattern 6 | no-analog |
| **Read-plane utilities** | | | | |
| `src/lib/format.ts` (`formatEUR`/`formatPct`, de-DE) | utility | transform | `src/lib/utils.ts` (`cn`/`cx` shared util) | role-match |
| `src/lib/period.ts` (period_key, provisional/YoY-history) | utility | transform | `connection-status.ts` (pure `derive*` helpers + injected `now`) | exact |
| **Pages (RSC read plane)** | | | | |
| `src/app/(protected)/layout.tsx` (shell + nav + month selector + banners) | route | request-response | `src/app/(protected)/page.tsx` + `status-banners.tsx` | role-match |
| `src/app/(protected)/page.tsx` (Home KPIs — replace stub) | route | request-response | `(protected)/page.tsx` (RLS read) | exact (in-file) |
| `src/app/(protected)/gastos/page.tsx` | route | request-response | `(protected)/page.tsx` | role-match |
| `src/app/(protected)/cost-centers/page.tsx` | route | request-response | `(protected)/page.tsx` | role-match |
| `src/app/(protected)/transacoes/page.tsx` (keyset table + inline edit) | route | request-response | `(protected)/page.tsx` | role-match |
| `src/app/(protected)/config/page.tsx` | route | request-response | `(protected)/page.tsx` | role-match |
| **Components** | | | | |
| `src/components/ui/chart.tsx` (shadcn add) | component | — | shadcn CLI (official) | n/a (scaffold) |
| `src/components/charts/*` (BarList, CategoryBar, ProgressBar, waterfall) | component | — | `src/components/ui/button.tsx` (cva + `cn` shadcn convention); `cx` alias for Tremor Raw | role-match |
| `src/components/kpi-card.tsx` | component | — | `button.tsx` + `(protected)/page.tsx` card markup | partial |
| **Tests** | | | | |
| `test/rules-db.test.ts`, `test/marts.test.ts`, `test/period.test.ts`, `test/format.test.ts`, `test/reapply.test.ts`, `test/actions.test.ts` | test | — | `test/rules.test.ts` (frozen contract; injected fakes) | role-match |

---

## Pattern Assignments

### `drizzle/0006_builtin_rules_seed.sql` (migration, batch) + `builtins.ts` uuid map

**Analog:** `drizzle/0002_seed.sql` lines 27–45 — the fixed-uuid, `on conflict do nothing` seed convention.

**Fixed-uuid seed pattern** (`0002_seed.sql:27-31`):
```sql
insert into public.categories (id, name, "group", parent_id) values
  ('11111111-1111-1111-1111-111111111101',  'Essential',  'essential',  null),
  ...
on conflict (id) do nothing;
```
- **Apply (D2-04):** seed the 6 `RuleId` strings (`investimento`, `transferencia`, `revenue`, `sublocacao_revenue`, `sublocacao_cost`, `cost_default`) as real `rules` rows with deterministic literal uuids (e.g. `66666666-…-0001`). Add `export const BUILTIN_RULE_IDS: Record<RuleId, string>` in `builtins.ts` mirroring those literals.
- The `rules` table already exists (`schema.ts:142-151`): columns `priority, version, matchCriteria, setCategory, setCostCenter, setFlowType`. Seed `version = RULESET_VERSION` (1, `builtins.ts:25`).

### `scripts/ingest.ts` — stamp real `rule_id` (service, batch, in-file edit)

**Analog:** self, `ingest.ts:188-199`. The bug is the hardcoded `${null}` at **line 196**:
```ts
          ) values (
            ${t.accountId}, ${t.bookingDate}, ..., ${t.categoryId},
            ${null}, ${t.importBatchId}, ${t.dedupeHash}, ${t.isRecurring}, ${t.status}
          )
```
- **Fix (D2-04 / Pitfall 5):** the engine already returns `cls.ruleId` and `ingest.ts:386` already propagates it into `TxUpsert.ruleId`. Change `${null}` → `${BUILTIN_RULE_IDS[t.ruleId] ?? dbRuleId}`. `TxUpsert.ruleId` is already typed `string` (`ingest.ts:68`).
- **DB-rules load:** add a `getDbRules()` to the `IngestWriter` interface (`ingest.ts:105-127`) mirroring `getAccounts()` (`ingest.ts:162-180`), and pass them into `applyRules(toRuleTx(n), accountsById, dbRules)` at `ingest.ts:372`.

### `src/lib/ingestion/rules/engine.ts` — DB-backed (service, transform, in-file)

**Analog:** self. Keep the pure, ordered, first-match-wins contract (`engine.ts:92-185`).

**Extended signature (RESEARCH Pattern 5; keep `test/rules.test.ts` green via default arg):**
```ts
export function applyRules(
  tx: RuleTx,
  accountsById: Map<string, RuleAccount>,
  dbRules: DbRule[] = [],   // NEW — default [] keeps the frozen test green (Pitfall 6)
): Classification {
  // 1. evaluate dbRules in (priority, version) order, first-match-wins on matchCriteria
  // 2. fall through to the EXISTING hardcoded ordering (investimento > transferencia > ...)
}
```
- **Landmine (Pitfall 1):** the engine defaults `costCenter` to `"shared"` (`engine.ts:97`) but the DB seeds `compartilhado` (`0003_ingestion.sql:38-43`). Reconcile in Wave 0 — either alias a `shared` row or map `shared→compartilhado`. Add a test asserting emitted codes ⊆ `cost_centers.code`.
- `SUBLET_COST_CENTER="sublocacao"` (`builtins.ts:49`) already matches the seed — keep.

### `src/lib/ingestion/rules/db-rules.ts` (service, CRUD — NEW)

**Analog:** `connection-status.ts:60-81` — the typed read + pure-derive split.
- The cron loads DB rules through the WRITE plane (`postgres` driver, like `ingest.ts:163-180` `getAccounts`). The `DbRule` interface is specified in RESEARCH Pattern 5 (`id/priority/version/matchCriteria/setCategory/setCostCenter/setFlowType`).
- Keep ordering/matching as **pure** exported helpers (mirrors `deriveFreshness`/`deriveNeedsReconnect`, `connection-status.ts:31-44`) so `test/rules-db.test.ts` runs with no DB.

### `src/lib/format.ts` (utility, transform — NEW)

**Analog:** `src/lib/utils.ts:1-11` — the single-source shared-util convention (one tiny file, named exports, an aliased duplicate for a second consumer).

**Spec (UI-SPEC §Charting, locked):**
```ts
export function formatEUR(n: number, decimals?: number): string  // '€5.038,00' de-DE, € prefixed
export function formatPct(n: number): string                      // '12,4 %' de-DE, space before %
```
- de-DE `Intl.NumberFormat`, period thousands / comma decimal; 0 decimals on hero KPI, 2 in tables. NEVER call `Intl` ad-hoc elsewhere (UI-SPEC).

### `src/lib/period.ts` (utility, transform — NEW)

**Analog:** `connection-status.ts:31-44` — pure derivation helpers with **injected `now`** for deterministic tests.
```ts
// mirror this shape exactly:
export function deriveFreshness(lastSyncAt: Date | null, now: Date): Freshness { ... }
```
- Build `isProvisional(periodKey, now)`, `hasYoYHistory(periods)`, `periodKeyForYoY(pk) → pk - 100` as pure functions taking `now`. Tested in `test/period.test.ts` (no DB).

### `src/lib/actions/*.ts` (controller, request-response — NEW, no direct analog)

**Analog:** none in repo (first Server Actions). Use **RESEARCH Pattern 6** + the `@supabase/ssr` read client from `src/lib/supabase/server.ts:13-36`.

**Locked write-plane shape (RESEARCH Pattern 6):**
```ts
'use server';
import { createClient } from '@/lib/supabase/server';   // anon + user JWT → allowlist RLS
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const RecatInput = z.object({ txId: z.string().uuid(), categoryId: z.string().uuid().nullable(),
                              costCenter: z.string(), createRule: z.boolean(), merchant: z.string() });

export async function recategorize(raw: unknown) {
  const i = RecatInput.parse(raw);                  // V5: validate before write
  const sb = await createClient();
  await sb.from('transactions').update({ category_id: i.categoryId, cost_center: i.costCenter })
          .eq('id', i.txId);                        // D2-03: ONE row only
  if (i.createRule) {                               // D2-02: forward-only rule
    await sb.from('rules').insert({ match_criteria: i.merchant, set_category: i.categoryId,
                                    set_cost_center: i.costCenter, priority: 100, version: 1 });
  }
  revalidatePath('/transacoes');
}
```
- **Security (Pitfall 3):** NEVER import the `postgres`/Drizzle client or `service.ts` here. RLS already authorizes writes (`0001_rls_policies.sql:116-145` — `allowlist_all for all to authenticated` on `transactions`/`rules`/`budgets`). No new policy needed.
- **`reapply-rule.ts` (CAT-05/D2-03):** separate idempotent bulk action returning `{ affected: number }`; never auto-applied on save. Idempotency idiom mirrors `ingest.ts:204-216` `upsertBalance` (check-then-write, second run is a no-op). A large bulk MAY use the `postgres` WRITE client server-side (still server-only).

### Pages — `src/app/(protected)/*/page.tsx` (route, request-response)

**Analog:** `src/app/(protected)/page.tsx:1-60` — the RSC RLS-read pattern (this stub is replaced by Home).

**Read pattern** (`page.tsx:9-21`):
```ts
export default async function ProtectedHome() {
  const supabase = await createClient();                     // @supabase/ssr server client
  const { data: { user } } = await supabase.auth.getUser();
  const { data: members, error } = await supabase
    .from("members").select("id, display_name").order("display_name", { ascending: true });
  // ... error path renders role="alert" text-destructive (page.tsx:36-40)
```
- **Apply to every page:** read marts (`v_pnl_monthly`, `v_home_kpis`, …) via `supabase.from('<view>')` under RLS — never the Drizzle client (`page.tsx:7-8` comment). Pages read the shared `?period=YYYYMM` (UI-SPEC §0).
- **Graceful error/empty states:** mirror `page.tsx:36-56` (error → `role="alert"`; empty list → muted "No …" row). UI-SPEC §7 first-class states (€0 grey, Provisional pill, Uncategorized slice).

### `src/app/(protected)/layout.tsx` (route — NEW)

**Analog:** `src/components/status/status-banners.tsx:14-25` — mount `<StatusBanners />` once full-bleed at the shell top (it's an async Server Component reading RLS state).
```tsx
// already-built, reuse verbatim:
<StatusBanners />   // ReconnectBanner stacked over FreshnessBanner
```
- Add sidebar (desktop) / bottom-nav (mobile) + the shared month selector (`?period`) per UI-SPEC §0. Nav order: Home · Gastos · Cost Centers · Transações · Config.

### Charts — `src/components/charts/*`, `src/components/kpi-card.tsx` (component)

**Analog:** `src/components/ui/button.tsx:1-67` — the shadcn component convention (`"use client"` where needed, `cva` variants, `cn` from `@/lib/utils`, `data-slot` attrs).
- Tremor Raw blocks import the merge util as `cx` — already aliased in `src/lib/utils.ts:11` (`export const cx = cn`), so copy-paste works unmodified (FND-06).
- **Recharts-3 paste rules (UI-SPEC §Charting, locked):** `var(--chart-1)` NOT `hsl(var(--chart-1))`; `ChartContainer` MUST carry a `min-h-*`; only the Result bar of the waterfall is colored gain/loss; provide a data-table/`aria-label` a11y alternative.

### Tests — `test/*.test.ts` (test)

**Analog:** `test/rules.test.ts` (frozen 11-assertion contract) + the injected-fake pattern from `ingest.ts` (`IngestWriter`/`IngestFetcher`, `ingest.ts:105-127`, `264-275`).
- Pure helpers (`period.ts`, `format.ts`, db-rules ordering, reapply core, zod validators) test with no DB. Mart SQL → pure-TS mirror or `pg-mem`/fixture (RESEARCH Validation Architecture).
- **Do NOT touch the 11 existing assertions in `test/rules.test.ts`** (Pitfall 6) — extend via the default `dbRules = []` arg.

---

## Shared Patterns

### READ plane (all pages + marts)
**Source:** `src/lib/supabase/server.ts:13-36` (`createClient`) + `src/app/(protected)/page.tsx:9-21`.
**Apply to:** every page + any RSC mart read.
```ts
const supabase = await createClient();   // anon key + user JWT → RLS allowlist enforces
await supabase.from('<table-or-view>').select(...)
```
Never the Drizzle/`postgres` client in a page/action (Pitfall 3).

### WRITE plane — user mutations
**Source:** RESEARCH Pattern 6 (new) on top of `server.ts` + RLS `0001_rls_policies.sql:116-145`.
**Apply to:** all `src/lib/actions/*`. `'use server'` + `@supabase/ssr` + zod `.parse` + `revalidatePath`. No `service_role`, no `DATABASE_URL` under `src/app`/`src/lib/actions`.

### WRITE plane — cron / bulk
**Source:** `scripts/ingest.ts:143-238` (`createServiceWriter`, `postgres` driver via `DATABASE_URL`, bypasses RLS).
**Apply to:** the cron + (optionally) a large `reapply-rule` bulk update. Server-only; logs counts/status only (`ingest.ts:449-451`), never PII.

### Idempotency idiom
**Source:** `ingest.ts:204-216` (`upsertBalance` check-then-write) + `ingest.ts:184-199` (ON CONFLICT DO NOTHING).
**Apply to:** `reapply-rule` (second run affects 0 rows) and the new `balances` UNIQUE(account_id, as_of_date) index (RESEARCH Pattern 10 landmine — `schema.ts:228-239` has only `balances_account_id_idx`).

### Migration convention
**Source:** hand-written numbered SQL like `0001_rls_policies.sql` / `0002_seed.sql` / `0003_ingestion.sql`; Drizzle generates schema DDL, RLS+seed+views are hand-written (`schema.ts:12-14` comment).
**Apply to:** marts (`pgView(...).existing()`), the builtin-rules seed, and the per-view RLS (`enable row level security` + `allowlist_all for all to authenticated`, copy `0001_rls_policies.sql:91-97` block per object). **Every new view/table ships with RLS — no exceptions (T-00-04).**

### Pure-helper + injected-`now` discipline
**Source:** `connection-status.ts:31-44`.
**Apply to:** `period.ts`, `format.ts`, db-rules ordering, reapply core — keeps tests DB-free and deterministic.

### shadcn / Tremor Raw component convention
**Source:** `src/components/ui/button.tsx` (cva + `cn`); `src/lib/utils.ts:5-11` (`cn` + `cx` alias).
**Apply to:** all `src/components/charts/*` and `kpi-card.tsx`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/actions/recategorize.ts` | controller | request-response | No Server Action exists yet — first write plane. Use RESEARCH Pattern 6 + `server.ts`. |
| `src/lib/actions/create-rule.ts` | controller | request-response | Same — net-new write plane. |
| `src/lib/actions/budgets.ts` | controller | CRUD | Same — net-new; "set from history" reads a mart then writes via SSR. |
| `src/lib/db/marts.ts` (`pgView`) | model | transform | No view defined in the repo yet; closest is `schema.ts` pgTable style + hand-written SQL DDL. Use RESEARCH "Defining a mart as a typed Drizzle view" + `.existing()`. |

(Charts under `src/components/charts/*` are copy-paste Tremor Raw / shadcn source — first-party, no codebase analog needed beyond the `button.tsx` convention + `cx` alias.)

---

## Metadata

**Analog search scope:** `src/lib/{db,ingestion,supabase,status,utils}`, `src/app/(protected)`, `src/components/{ui,status}`, `scripts/`, `drizzle/`, `test/`.
**Files scanned:** 11 read in full (engine, builtins, schema, ingest, server, status-banners, utils, connection-status, Home page, button, 0001/0002/0003 migrations).
**Pattern extraction date:** 2026-06-23
