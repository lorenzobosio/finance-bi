// Full v1 dimensional schema for the Finance BI app (D-09).
//
// Design rules baked in here:
//  - Money columns are ALWAYS numeric(14,2) — never floats (comparability/correctness).
//  - `transactions.dedupe_hash` is NOT NULL + UNIQUE so Phase-1 ingestion is idempotent
//    from day one (dedupe key = account + date + amount + normalized description + bank id).
//  - `flow_type` is the correctness keystone: only `investimento` feeds the €100k goal;
//    `transferencia` (internal transfers) is excluded from cost/revenue.
//  - `cost_center` is an analytical label, NEVER an access boundary (D-15). RLS (0001) is
//    the only access wall and gates on the 2-email allowlist.
//
// This file is the source of truth for DDL only. It is consumed by drizzle-kit
// (build-time) to generate drizzle/0000_init.sql. RLS policies and the seed are
// hand-written SQL migrations (0001, 0002) per D-08 — Drizzle does not manage RLS.

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  timestamp,
  integer,
  boolean,
  date,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums (define once, reuse)
// ---------------------------------------------------------------------------

// Correctness keystone: only `investimento` feeds the €100k goal; `transferencia`
// (internal transfers) is excluded from both cost and revenue.
export const flowType = pgEnum('flow_type', [
  'revenue',
  'cost',
  'investimento',
  'transferencia',
]);

// NOTE: `cost_center` is NO LONGER a fixed enum. Phase 1 replaced it with the extensible
// `costCenters` lookup table (D-24) so new centers (e.g. `sublocacao`) add a row instead
// of a breaking enum migration. The four former enum columns are now text FKs to
// costCenters.code. It remains an analytical label only, NEVER an access boundary (D-15).

export const categoryGroup = pgEnum('category_group', [
  'essential',
  'desire',
  'investment',
]);

// ---------------------------------------------------------------------------
// Tables (full v1 per D-09 — all 12 + dim_calendar + app_allowlist)
// ---------------------------------------------------------------------------

// Access-control allowlist (Phase-0 hardening). This is the ONLY place the set of
// permitted emails lives in the database. It is seeded at deploy time from the
// `ALLOWED_EMAILS` env (scripts/seed-allowlist.ts) — NEVER from committed SQL — so no
// real email literal ever lands in a migration. RLS gates every data table on
// `public.is_email_allowed(jwt email)`, a SECURITY DEFINER function that reads THIS
// table. RLS is enabled on app_allowlist too; the SECURITY DEFINER function is what
// lets the policies consult it without recursing.
export const appAllowlist = pgTable('app_allowlist', {
  email: text('email').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Extensible cost-center lookup (D-24) — replaces the fixed `cost_center` enum so a new
// center (e.g. `sublocacao`) is one INSERT, not a breaking enum migration. Seeded
// lorenzo/fernanda/compartilhado/sublocacao in 0003. Analytical label only (D-15) —
// FK-referenced by accounts.default_cost_center, rules.set_cost_center,
// transactions.cost_center, budgets.cost_center.
export const costCenters = pgTable('cost_centers', {
  code: text('code').primaryKey(),
  label: text('label'),
});

// The 2 household members (Lorenzo + Fernanda). Seeded in 0002 (names only — no emails).
export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Email is OPTIONAL and is NOT an access boundary (the allowlist table is). It is left
  // nullable so the seed can store first names only — no real email PII in committed SQL
  // (Phase-0 public-repo hardening). Unique still applies to any non-null value.
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Bank accounts (the 3 Revolut accounts + a virtual investing account). `default_cost_center`
// is the analytical label new transactions inherit; `currency` is EUR-only in the MVP.
// Phase-1 ingestion fields: `is_investment` flags the (virtual) ETF pocket — investimento is
// keyed on ANY is_investment account (D-22); `enable_banking_id`/`iban` link a row to the
// live bank account; `is_synced` marks accounts the daily pull should refresh.
// Phase-8 (0017): `is_demo` partitions the real accounts (backfilled false — ingestion never sets
// it) from the seeded demo accounts, so the ADDITIVE anon `demo_anon_read using (is_demo = true)`
// policy (hand-written in 0017, not Drizzle-managed) caps the public demo to the demo partition —
// real account names never reach anon (the 0013 exclusion, reopened SAFELY). The
// `v_account_summary` mart (latest CLBD balance per account per partition) is also hand-written in
// 0017 (security_invoker) — like v_balance_trend/v_bucket_spend, views live in the migration only.
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').references(() => members.id),
  name: text('name').notNull(),
  kind: text('kind'),
  defaultCostCenter: text('default_cost_center').references(() => costCenters.code),
  currency: text('currency').notNull().default('EUR'),
  isInvestment: boolean('is_investment').notNull().default(false),
  enableBankingId: text('enable_banking_id').unique(),
  iban: text('iban'),
  isSynced: boolean('is_synced').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  isDemo: boolean('is_demo').notNull().default(false),
});

// Open-banking consent / connection state. `expires_at` tracks the PSD2 reconnect cadence
// (Phase 1 stores the real 180-day consent expiry from access.valid_until). Phase-1 fields:
// `consent_status` (active|expired), `last_pull_at` (daily-pull heartbeat), `session_id`
// (the Enable Banking session uid the pull reuses).
export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountRef: text('account_ref'),
  provider: text('provider'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  status: text('status'),
  consentStatus: text('consent_status'),
  lastPullAt: timestamp('last_pull_at', { withTimezone: true }),
  sessionId: text('session_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Fixed, comparable category taxonomy (MoM/YoY comparability). `parent_id` is a
// self-FK for the parent/child taxonomy. Seeded in 0002.
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    group: categoryGroup('group').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
  },
  (t) => [index('categories_parent_id_idx').on(t.parentId)],
);

// Versioned categorization rules (Phase 1 applies them). `priority`/`version` make
// re-runs deterministic and comparable.
export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  priority: integer('priority').notNull().default(0),
  version: integer('version').notNull().default(1),
  matchCriteria: text('match_criteria'),
  setCategory: uuid('set_category').references(() => categories.id),
  setCostCenter: text('set_cost_center').references(() => costCenters.code),
  setFlowType: flowType('set_flow_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// The fact table. `amount_eur` is signed numeric(14,2). `dedupe_hash` is NOT NULL +
// UNIQUE — the idempotency contract that makes Phase-1 daily pulls safe to re-run.
// Phase-1 ingestion fields: `description_raw` (untouched bank memo), `counterparty` +
// `counterparty_iban` (drive transferencia/investimento matching — IBANs ARE returned,
// per the spike), `is_recurring` (rule hint), `status` (BOOK/PEND; PEND is filtered at
// normalize time but kept here for audit).
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    bookingDate: date('booking_date').notNull(),
    valueDate: date('value_date'),
    amountEur: numeric('amount_eur', { precision: 14, scale: 2 }).notNull(),
    description: text('description'),
    flowType: flowType('flow_type'),
    costCenter: text('cost_center').references(() => costCenters.code),
    categoryId: uuid('category_id').references(() => categories.id),
    ruleId: uuid('rule_id').references(() => rules.id),
    importBatchId: text('import_batch_id'),
    dedupeHash: text('dedupe_hash').notNull(),
    descriptionRaw: text('description_raw'),
    counterparty: text('counterparty'),
    counterpartyIban: text('counterparty_iban'),
    isRecurring: boolean('is_recurring').notNull().default(false),
    status: text('status'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transactions_dedupe_hash_uq').on(t.dedupeHash),
    index('transactions_account_id_idx').on(t.accountId),
    index('transactions_booking_date_idx').on(t.bookingDate),
  ],
);

// Per cost-center monthly budgets. `period_key` is YYYYMM (joins dim_calendar).
// `category_id` (D2-14) is a NULLABLE FK to categories.id: NULL = a cost-center-grain
// budget (the existing per-person / shared budget); set = a finer category-grain budget,
// so budgeted-vs-actual (BI-02) works at BOTH grains without a breaking change.
export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  costCenter: text('cost_center')
    .notNull()
    .references(() => costCenters.code),
  categoryId: uuid('category_id').references(() => categories.id),
  periodKey: integer('period_key').notNull(),
  amountEur: numeric('amount_eur', { precision: 14, scale: 2 }).notNull(),
});

// The €4k contribution legs feeding the €100k goal. `period_key` is YYYYMM.
export const investmentContributions = pgTable('investment_contributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').references(() => transactions.id),
  amountEur: numeric('amount_eur', { precision: 14, scale: 2 }).notNull(),
  periodKey: integer('period_key').notNull(),
  memberId: uuid('member_id').references(() => members.id),
});

// The north-star goal (€100,000 invested, cost_basis metric in the MVP).
export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  targetEur: numeric('target_eur', { precision: 14, scale: 2 }).notNull(),
  metric: text('metric').notNull().default('cost_basis'),
});

// Goal milestones (10k/25k/50k/75k/100k). `achieved_at` is set when crossed.
export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  goalId: uuid('goal_id')
    .notNull()
    .references(() => goals.id),
  thresholdEur: numeric('threshold_eur', { precision: 14, scale: 2 }).notNull(),
  achievedAt: timestamp('achieved_at', { withTimezone: true }),
});

// Daily balance snapshots per account (Phase 2 BI).
export const balances = pgTable(
  'balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    asOfDate: date('as_of_date').notNull(),
    balanceEur: numeric('balance_eur', { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [
    index('balances_account_id_idx').on(t.accountId),
    // One snapshot per account per day. upsertBalance (scripts/ingest.ts) keys its
    // check-then-write on exactly this pair; the UNIQUE constraint closes the Pattern-10
    // landmine so a concurrent cron run can't duplicate a day's snapshot (the marts assume
    // one row per account/day). Added live in drizzle/0008_marts_rls.sql.
    uniqueIndex('balances_account_date_uq').on(t.accountId, t.asOfDate),
  ],
);

// AI-written daily/weekly insights (Phase 5 writer target).
export const insights = pgTable('insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind'),
  body: text('body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  tokenCount: integer('token_count'),
});

// Calendar dimension — seeded 2024-2035 in 0002. `period_key` (YYYYMM int) is the
// join key for MoM/YoY: MoM compares adjacent period_keys; YoY uses period_key - 100.
// Dense day rows mean empty months still render as €0 (Pitfall 6).
export const dimCalendar = pgTable('dim_calendar', {
  date: date('date').primaryKey(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  quarter: integer('quarter').notNull(),
  periodKey: integer('period_key').notNull(),
});

// Per-pull ingestion audit + heartbeat (ING-04). The daily cron writes ONE row per pull
// (via service_role, server-only) so a zero-new-tx run AND an auth-expired run both leave
// a trace — the freshness/reconnect banners (01-05) read the latest row. RLS-gated like
// every table (0004). transactions.import_batch_id stores this id as text (no FK, D-low-risk).
export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status'),
  source: text('source'),
  fetched: integer('fetched'),
  inserted: integer('inserted'),
  skipped: integer('skipped'),
  error: text('error'),
});

// ---------------------------------------------------------------------------
// Phase-5 (0014) Goal-as-a-Journey schema delta (D5-01/05/10/11/17/18).
//
// DDL-vs-RLS split (0001/0002 convention): these table defs are the DDL source of
// truth; the RLS enable + allowlist_all + anon `is_demo = true` policies, the
// buckets/cost_centers/categories seeds, the `goal_events (dedupe_key, is_demo)`
// unique, and the `v_bucket_spend` mart are hand-written in drizzle/0014_goal_journey.sql
// (Drizzle does not manage RLS/seeds/views). Mirrors how 0010–0013 hand-write the demo
// isolation + anon-read surface (the migration journal is hand-maintained past 0009).
// ---------------------------------------------------------------------------

// buckets — the 3 virtual sinking-fund buckets over ONE ETF (GOAL-07). REFERENCE data
// (like cost_centers): the same 3 rows serve real + demo → NO is_demo partition. Seeded
// wealth/brazil/adventures with instrument_isin 'IE000716YHJ7' + monthly_target_eur
// (wealth 4000 / brazil 200 / adventures NULL) in 0014. Value is derived pro-rata by
// contribution share (ETF market value deferred to Phase 12 — D5-02, GOAL-06).
export const buckets = pgTable('buckets', {
  code: text('code').primaryKey(), // 'wealth' | 'brazil' | 'adventures'
  name: text('name').notNull(),
  instrumentIsin: text('instrument_isin').notNull(),
  monthlyTargetEur: numeric('monthly_target_eur', { precision: 14, scale: 2 }), // nullable
});

// household — singleton settings (D5-01/10/17). DEMO-BEARING (the demo renders launch_date +
// why). `launch_date` NULL = the first-class pre-launch "waiting" state (D5-16); `why` is the
// shared editable statement (PERS-04); `epic_trip_active` gates the Adventures big-trip tranche
// state (D5-10). is_demo partitions the real singleton from the seeded demo one.
export const household = pgTable('household', {
  id: uuid('id').primaryKey().defaultRandom(),
  launchDate: date('launch_date'),
  why: text('why'),
  epicTripActive: boolean('epic_trip_active').notNull().default(false),
  isDemo: boolean('is_demo').notNull().default(false),
});

// goal_events — once-only celebrations (GOAL-11, D5-14/18). DEMO-BEARING. A crossed level
// (every €10k) / major (every €100k) / milestone / best-streak is recorded ONCE via a
// UNIQUE (dedupe_key, is_demo) composite so both partners see it on next login and a re-detect
// is idempotent (`on conflict (dedupe_key, is_demo) do nothing`). A GLOBAL unique(dedupe_key)
// would collide the real vs demo 'level:10000' key — the composite keeps the two partitions
// independent. `seen` is the shared played-flag PATCHed true after the client shows it.
export const goalEvents = pgTable(
  'goal_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(), // 'level' | 'major' | 'milestone' | 'streak_best'
    threshold: integer('threshold'), // 10000 / 100000 / streak length (nullable)
    periodKey: integer('period_key'),
    achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull().defaultNow(),
    dedupeKey: text('dedupe_key').notNull(),
    seen: boolean('seen').notNull().default(false),
    isDemo: boolean('is_demo').notNull().default(false),
  },
  (t) => [uniqueIndex('goal_events_dedupe_key_is_demo_uq').on(t.dedupeKey, t.isDemo)],
);

// transfer_overrides — per-transfer manual split of one investimento leg across the buckets
// (D5-05). DEMO-BEARING (may be empty for the demo). The transaction is the PK (one override
// per transfer). The four legs feed the auditable derived-on-read fold; there are NO stored
// bucket balances — only this per-transfer override plus goal_events persist (never derived).
export const transferOverrides = pgTable('transfer_overrides', {
  transactionId: uuid('transaction_id')
    .primaryKey()
    .references(() => transactions.id),
  wealthEur: numeric('wealth_eur', { precision: 14, scale: 2 }).notNull(),
  brazilEur: numeric('brazil_eur', { precision: 14, scale: 2 }).notNull(),
  advSmallEur: numeric('adv_small_eur', { precision: 14, scale: 2 }).notNull(),
  advBigEur: numeric('adv_big_eur', { precision: 14, scale: 2 }).notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
});

// ---------------------------------------------------------------------------
// Phase-6 (0015) financial-health scorecard thresholds (D-07, HEALTH-01).
//
// DDL-vs-RLS split (0001/0002 convention): this def is the DDL source of truth; the RLS
// enable + allowlist_all + anon `is_demo = true` policy + the single real-partition default
// seed are hand-written in drizzle/0015_insight_thresholds.sql (Drizzle does not manage
// RLS/seeds). Mirrors how 0010–0014 hand-write the demo isolation + anon-read surface.
// ---------------------------------------------------------------------------

// insight_thresholds — the scorecard's editable healthy/watch/off-track bands (D-07).
// DEMO-BEARING singleton settings table: ONE is_demo=false row holds the real config
// (06-04 edits it); the demo partition seeds NO row and relies on the code-side DEFAULT_BANDS
// fallback (06-03), mirroring how `household` seeds no demo row and relies on
// PRE_LAUNCH_HOUSEHOLD. savings_rate_* = (revenue−cost)/revenue band edges; reserve_* =
// months-of-cost cash-reserve edges; budget_over_watch_pct = over-budget tolerance
// (≤10% over = watch); streak_watch_misses = contribution-miss tolerance (1 = watch).
export const insightThresholds = pgTable('insight_thresholds', {
  id: uuid('id').primaryKey().defaultRandom(),
  savingsRateHealthy: numeric('savings_rate_healthy', { precision: 6, scale: 4 }).notNull(),
  savingsRateWatch: numeric('savings_rate_watch', { precision: 6, scale: 4 }).notNull(),
  reserveHealthy: numeric('reserve_healthy', { precision: 6, scale: 2 }).notNull(),
  reserveWatch: numeric('reserve_watch', { precision: 6, scale: 2 }).notNull(),
  budgetOverWatchPct: numeric('budget_over_watch_pct', { precision: 6, scale: 4 }).notNull(),
  streakWatchMisses: integer('streak_watch_misses').notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
});

// ---------------------------------------------------------------------------
// Phase-7 (0016) data-trust reconciliation ledger (D-01, DAT-01/02).
//
// DDL-vs-RLS split (0001/0002 convention): this def is the DDL source of truth; the RLS
// enable + allowlist_all + anon `is_demo = true` policy are hand-written in
// drizzle/0016_reconciliation_flags.sql (Drizzle does not manage RLS). Mirrors how 0010–0015
// hand-write the demo isolation + anon-read surface. NO seed — flags are cron-written (07-03).
// ---------------------------------------------------------------------------

// reconciliation_flags — the per-account/period discrepancy ledger (D-01). DEMO-BEARING:
// real flags carry is_demo=false; the public demo is authored fully-reconciled (0 open flags,
// the non-shame demo) so it seeds NONE. accountId is NULLABLE — a household/mart-level flag
// (mart_vs_ledger) has no single owning account. NO PII: numeric deltas + account + period +
// kind only — never a description/counterparty/IBAN (T-07-04). kind = 'balance_delta' (bank
// balance vs derived ledger) | 'mart_vs_ledger'; status = 'open' | 'resolved'.
export const reconciliationFlags = pgTable('reconciliation_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').references(() => accounts.id), // nullable: household/mart-level flags
  periodKey: integer('period_key').notNull(),
  kind: text('kind').notNull(), // 'balance_delta' | 'mart_vs_ledger'
  expectedEur: numeric('expected_eur', { precision: 14, scale: 2 }).notNull(),
  actualEur: numeric('actual_eur', { precision: 14, scale: 2 }).notNull(),
  deltaEur: numeric('delta_eur', { precision: 14, scale: 2 }).notNull(),
  status: text('status').notNull().default('open'), // 'open' | 'resolved'
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  isDemo: boolean('is_demo').notNull().default(false),
});
