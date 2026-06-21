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

// Analytical label only — NOT an access boundary (D-15).
export const costCenter = pgEnum('cost_center', ['lorenzo', 'fernanda', 'shared']);

export const categoryGroup = pgEnum('category_group', [
  'essential',
  'desire',
  'investment',
]);

// ---------------------------------------------------------------------------
// Tables (full v1 per D-09 — all 12 + dim_calendar)
// ---------------------------------------------------------------------------

// The 2 household members (Lorenzo + Fernanda). Seeded in 0002.
export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Bank accounts (the 3 Revolut accounts). `default_cost_center` is the analytical
// label new transactions inherit; `currency` is EUR-only in the MVP.
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').references(() => members.id),
  name: text('name').notNull(),
  kind: text('kind'),
  defaultCostCenter: costCenter('default_cost_center'),
  currency: text('currency').notNull().default('EUR'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Open-banking consent / connection state. `expires_at` tracks the 90-day PSD2
// reconnect cadence (Phase 1 stores real consent expiry).
export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountRef: text('account_ref'),
  provider: text('provider'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  status: text('status'),
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
  setCostCenter: costCenter('set_cost_center'),
  setFlowType: flowType('set_flow_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// The fact table. `amount_eur` is signed numeric(14,2). `dedupe_hash` is NOT NULL +
// UNIQUE — the idempotency contract that makes Phase-1 daily pulls safe to re-run.
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
    costCenter: costCenter('cost_center'),
    categoryId: uuid('category_id').references(() => categories.id),
    ruleId: uuid('rule_id').references(() => rules.id),
    importBatchId: text('import_batch_id'),
    dedupeHash: text('dedupe_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transactions_dedupe_hash_uq').on(t.dedupeHash),
    index('transactions_account_id_idx').on(t.accountId),
    index('transactions_booking_date_idx').on(t.bookingDate),
  ],
);

// Per cost-center monthly budgets. `period_key` is YYYYMM (joins dim_calendar).
export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  costCenter: costCenter('cost_center').notNull(),
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
  (t) => [index('balances_account_id_idx').on(t.accountId)],
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
