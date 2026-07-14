// src/lib/reconcile/engine.ts — the PURE data-trust reconciliation engine (DAT-01, D-02).
//
// PURE, deterministic, NO I/O — no @supabase / next / drizzle / postgres import (mirrors the pure
// engine shape of src/lib/goal/allocation.ts). The cron/script (scripts/reconcile.ts) loads rows and
// feeds them in; this module only computes flags, so it stays node-unit-testable with zero DB.
//
// CRITICAL correctness nuance (RESEARCH Pitfall 1): the ledger is go-forward-only from 2026-06-01
// with NO opening-balance anchor, so absolute `balances.balance_eur` NEVER equals Σ transactions.
// This engine reconciles DELTAS (the change in bank balance across a period vs Σ booked transactions
// in that interval) and mart-total vs the same total recomputed from source rows — NEVER absolutes.
//
// Orientation convention (frozen by test/reconcile.test.ts — the implementer must match):
//   balance_delta  → expectedEur = bankDeltaEur (the bank is the source of truth), actualEur = ledgerDeltaEur
//   mart_vs_ledger → expectedEur = ledgerRecomputedEur (recomputed-from-source truth), actualEur = martTotalEur
//   deltaEur       → the absolute magnitude |expected − actual|, rounded to cents
//
// Tolerance €0.01, INCLUSIVE at the boundary: a gap of exactly €0.01 emits NO flag (only a gap
// STRICTLY GREATER than the tolerance is a discrepancy). NO PII — numeric deltas + account + period only.

/** The reconciliation tolerance in EUR. A gap at or below this is within tolerance (no flag). */
export const RECONCILE_TOLERANCE_EUR = 0.01;

/**
 * One account/period reconciliation input. Both checks are optional per row: the balance-delta check
 * is skipped when `bankDeltaEur` is null (only one snapshot exists, so there is no period delta).
 */
export interface ReconcileInput {
  accountId: string;
  periodKey: number;
  /** The change in bank-reported balance across the period (two consecutive snapshots); null = skip. */
  bankDeltaEur: number | null;
  /** Σ booked transactions.amount_eur in the same interval. */
  ledgerDeltaEur: number;
  /** A mart total (e.g. v_pnl_monthly.costs). */
  martTotalEur: number;
  /** The same total recomputed directly from the source transactions rows. */
  ledgerRecomputedEur: number;
  /** The partition tag carried onto every emitted flag (the leak-guard tag). */
  isDemo: boolean;
}

/** One recorded discrepancy. `expectedEur`/`actualEur` follow the orientation convention above. */
export interface ReconcileFlag {
  kind: "balance_delta" | "mart_vs_ledger";
  accountId: string;
  periodKey: number;
  expectedEur: number;
  actualEur: number;
  /** The absolute magnitude |expected − actual|, rounded to cents. */
  deltaEur: number;
  isDemo: boolean;
}

/** Round a EUR magnitude to whole cents (avoids float-dust in the stored delta). */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * reconcile — the deterministic contract. For each input:
 *   • when `bankDeltaEur` is non-null AND |bankDeltaEur − ledgerDeltaEur| exceeds the tolerance,
 *     emit one `balance_delta` flag (expected = bankDeltaEur, actual = ledgerDeltaEur);
 *   • when |martTotalEur − ledgerRecomputedEur| exceeds the tolerance, emit one `mart_vs_ledger`
 *     flag (expected = ledgerRecomputedEur, actual = martTotalEur).
 * A gap of exactly €0.01 is within tolerance (no flag). `isDemo` is carried onto every flag verbatim.
 * NEVER compares an absolute bank balance to the summed ledger (Pitfall 1). Pure — no I/O.
 */
export function reconcile(inputs: ReconcileInput[]): ReconcileFlag[] {
  const flags: ReconcileFlag[] = [];

  for (const input of inputs) {
    // balance_delta — only when a period delta exists (two snapshots).
    if (input.bankDeltaEur !== null) {
      const expected = input.bankDeltaEur;
      const actual = input.ledgerDeltaEur;
      if (Math.abs(expected - actual) > RECONCILE_TOLERANCE_EUR) {
        flags.push({
          kind: "balance_delta",
          accountId: input.accountId,
          periodKey: input.periodKey,
          expectedEur: expected,
          actualEur: actual,
          deltaEur: toCents(Math.abs(expected - actual)),
          isDemo: input.isDemo,
        });
      }
    }

    // mart_vs_ledger — the mart total vs the total recomputed from source rows.
    {
      const expected = input.ledgerRecomputedEur;
      const actual = input.martTotalEur;
      if (Math.abs(expected - actual) > RECONCILE_TOLERANCE_EUR) {
        flags.push({
          kind: "mart_vs_ledger",
          accountId: input.accountId,
          periodKey: input.periodKey,
          expectedEur: expected,
          actualEur: actual,
          deltaEur: toCents(Math.abs(expected - actual)),
          isDemo: input.isDemo,
        });
      }
    }
  }

  return flags;
}
