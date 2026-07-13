// src/lib/health/anomaly.ts — the PURE, deterministic overspend/anomaly DETECTOR (AI-05, D-10/11/13).
//
// THE load-bearing invariant (D-10): detection is DETERMINISTIC — the model NEVER decides WHETHER
// something is over budget; it only ranks/phrases the flagged set the weekly memo (06-07) consumes.
// A flag fires from the ALREADY-computed marts (`v_costcenter_bva` / `v_category_breakdown`), never
// from an LLM judgement. Mirrors `computeStreak`'s discipline (src/lib/goal/streak.ts:39): a PURE fn
// over mart-derived rows + an INJECTED `now` (never `new Date()` inside) + an injected
// `monthsWithData`, so the vitest suite stays deterministic — no I/O, no clock, no server/DB
// import. Phase-14 REM-02 re-imports this EXACT function to push-notify (D-13); Phase 6 is DISPLAY
// ONLY — this file builds no notification infrastructure.
//
// D-11 (the two branches):
//   1. BUDGET-RELATIVE (always on): over-budget when `remaining < 0`; on-pace-to-exceed when the
//      linear month projection `actual ÷ (dayOfMonth ÷ daysInMonth)` exceeds `budget` AND the day is
//      past a small floor (no day-1/2 projection noise).
//   2. MoM / STATISTICAL SPIKE (GATED): unreachable below 2 non-empty months of history — thin real
//      data must never "spike". Phase 6 ships the GATE, not heavy spike stats (a later plan / REM-02
//      threads the trailing baseline and enriches the branch without touching this call site).
//
// Synthetic € only; no PII, no merchant/tenant names live here — only the detection contract.

/** A cost-center / category budget-vs-actual row (the `v_costcenter_bva` slice the detector reads). */
export interface BvaRow {
  /** The cost-center (or category) label — becomes the flag `scope`. */
  costCenter: string;
  /** The budget cap for this period. Rows with `budget <= 0` are "not set" and never flagged (D2-12). */
  budget: number;
  /** Actual spend this period (the positive magnitude). */
  actual: number;
}

/** A category-breakdown row (the `v_category_breakdown` slice) — feeds the GATED spike branch (D-11). */
export interface CategoryRow {
  bucketLabel: string;
  costs: number;
}

/**
 * One deterministic overspend flag — enough for BOTH the non-shame chip AND the memo's ranking (D-10).
 * The AI never recomputes these fields; it only phrases/ranks the set.
 */
export interface Flag {
  /** The cost-center / category label the flag is about (the raw code; the UI resolves a display name). */
  scope: string;
  /** Actual spend this period. */
  actual: number;
  /** The budget cap. */
  budget: number;
  /** budget − actual; negative = already over budget. */
  remaining: number;
  /** True when the linear mid-month projection exceeds budget (on-pace-to-exceed). */
  onPace: boolean;
}

/**
 * The small day-of-month floor below which the linear projection is too noisy to trust: on day 1–2 a
 * tiny `actual` scales to an enormous month projection, so on-pace-to-exceed does not fire that early
 * (over-budget, which needs no projection, still fires from day 1). Kept small so mid-month flags fire.
 */
const ON_PACE_MIN_DAY = 3;

/** The minimum non-empty months of history before the statistical-spike branch is reachable (D-11). */
const SPIKE_MIN_MONTHS = 2;

/**
 * detectAnomalies — the PURE budget-relative overspend detector (AI-05, D-10/11/13).
 *
 * Reads ONLY its arguments (the already-read aggregates + the injected `now` + `monthsWithData`) — no
 * I/O, no wall-clock, no DB import — so `test/health.anomaly.test.ts` is deterministic and Phase-14
 * REM-02 can re-import it verbatim. For each budget-bearing `v_costcenter_bva` row it emits an
 * over-budget flag (`remaining < 0`) and/or an on-pace-to-exceed flag (the linear month projection
 * exceeds budget past the day floor). The MoM/statistical-spike branch over `categoryBreakdown` is
 * GATED behind `monthsWithData >= SPIKE_MIN_MONTHS` (D-11). Returns an ordered, worst-first `Flag[]`
 * so callers can take the top 1–2.
 */
export function detectAnomalies(
  costcenterBva: BvaRow[],
  categoryBreakdown: CategoryRow[],
  now: Date,
  monthsWithData: number,
): Flag[] {
  // dayOfMonth / daysInMonth from the INJECTED clock (local accessors mirror src/lib/period.ts so a
  // caller's demoAwareNow — constructed at local noon — reads the same month everywhere, TZ-stable).
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsedFraction = daysInMonth > 0 ? dayOfMonth / daysInMonth : 0;

  const flags: Flag[] = [];

  // --- Branch 1: BUDGET-RELATIVE (always on) — over-budget + on-pace-to-exceed (D-11) -------------
  for (const row of costcenterBva) {
    // D2-12: a missing / zero budget is "not set", NEVER a fake €0 cap — such rows are never flagged.
    if (row.budget <= 0) continue;

    const remaining = row.budget - row.actual;
    const overBudget = remaining < 0;

    // Linear month projection, only past the small day floor (no day-1/2 noise). Guards div-by-zero.
    const projection =
      dayOfMonth >= ON_PACE_MIN_DAY && elapsedFraction > 0 ? row.actual / elapsedFraction : 0;
    const onPace = projection > row.budget;

    if (overBudget || onPace) {
      flags.push({
        scope: row.costCenter,
        actual: row.actual,
        budget: row.budget,
        remaining,
        onPace,
      });
    }
  }

  // --- Branch 2: MoM / STATISTICAL SPIKE — GATED at <2 months of history (D-11) -------------------
  if (monthsWithData >= SPIKE_MIN_MONTHS && categoryBreakdown.length > 0) {
    // Phase 6 ships the history GATE only, not the rich spike statistics. A real spike is a category
    // whose cost far exceeds its OWN trailing baseline, but that baseline is not threaded into this
    // signature yet — a later plan / Phase-14 REM-02 adds it and re-imports this detector. Until then
    // no spike flag is emitted even past the gate; the load-bearing contract is the gate itself, which
    // makes the branch provably unreachable for thin (<2-month) real data (rich in the demo).
  }

  // --- Order worst-first so callers take the top 1–2: already-over-budget rows rank above on-pace- -
  // only rows; within each group the smaller (more negative) `remaining` is worse. Stable + pure →
  // same inputs yield the same ordered output (the determinism contract).
  flags.sort((a, b) => {
    const aOver = a.remaining < 0 ? 1 : 0;
    const bOver = b.remaining < 0 ? 1 : 0;
    if (aOver !== bOver) return bOver - aOver;
    return a.remaining - b.remaining;
  });

  return flags;
}
