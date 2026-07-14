// src/lib/cashflow/recurring.ts — the recurring-payment detector (FLOW-01, D-01/D-12). PURE.
//
// A pure mirror of the momentum.ts convention (src/lib/goal/momentum.ts:18-79): an explicit typed
// input of INJECTED rows + an `asOf: Date` (NEVER `new Date()`/`Date.now()` — an internal clock
// renders the demo dead, RESEARCH Pitfall 2). Deterministic on a fixed `asOf`.
//
// The engine clusters the injected transactions by their STORED (ingest-normalized) `counterparty`
// (case-folded — already normalized at ingest) + near-equal `amount_eur` (within ±5% of the cluster
// MEDIAN), at a recognised cadence derived from the median inter-occurrence gap (weekly / monthly /
// yearly). A cluster qualifies at ≥3 occurrences (D-01). `confidence` is the coefficient-of-variation
// idiom (momentum.ts:67-70) over the gap intervals × the amount spread, clamped to [0,1] and
// divide-by-zero-guarded (never NaN/Infinity; empty input → []). `key` is the case-folded counterparty
// — stable across runs (confirm idempotency, D-02) and the value the confirm action scopes the
// `transactions.is_recurring` stamp by (matched on `transactions.counterparty`).
//
// SERVER/CLIENT-AGNOSTIC & PURE: no DB/UI import, no `@supabase/ssr`, no Drizzle, no wall clock.

import { addDays, differenceInDays, format, parseISO } from "date-fns";

/** One injected transaction row (the caller/RSC owns the read; the engine never fetches). */
export interface RecurringTx {
  /** The ingest-normalized counterparty (the cluster key source). */
  counterparty: string;
  /** Signed EUR (negative = outflow, positive = income). */
  amount_eur: number;
  /** Booking date, YYYY-MM-DD. */
  booking_date: string;
}

export interface DetectRecurringInput {
  transactions: RecurringTx[];
  /** The display clock — injected, NEVER read from the wall clock (Pitfall 2). */
  asOf: Date;
}

export type Cadence = "weekly" | "monthly" | "yearly";

export interface RecurringCandidate {
  /** Stable per-merchant key (case-folded counterparty) — idempotent across runs (D-02). */
  key: string;
  /** Human label (the counterparty as stored). */
  label: string;
  /** Representative signed amount (the cluster median). */
  amount: number;
  cadence: Cadence;
  /** Projected next occurrence (last booking + median interval), YYYY-MM-DD. */
  nextExpectedDate: string;
  /** 0..1 confidence (interval-consistency × amount-consistency), NaN-safe. */
  confidence: number;
}

/** Minimum occurrences before a cluster becomes a candidate (D-01). */
const MIN_OCCURRENCES = 3;
/** Amount tolerance: within ±5% of the cluster MEDIAN. */
const AMOUNT_TOLERANCE = 0.05;

/** Recognised cadence bands (median inter-occurrence gap, in days). A cluster outside all bands is skipped. */
const CADENCE_BANDS: Array<{ cadence: Cadence; min: number; max: number }> = [
  { cadence: "weekly", min: 5, max: 10 },
  { cadence: "monthly", min: 25, max: 35 },
  { cadence: "yearly", min: 355, max: 375 },
];

/** The median of a numeric list (empty → 0). Pure, NaN-safe. */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * The coefficient-of-variation consistency of a list, in [0,1] — 1 = perfectly consistent, 0 = noisy.
 * Divide-by-zero guarded (avg <= 0 → 0), exactly like momentum.ts:64. Never NaN/Infinity.
 */
function cvConsistency(xs: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const avg = xs.reduce((a, c) => a + c, 0) / n;
  if (avg <= 0) return 0;
  const variance = xs.reduce((a, c) => a + (c - avg) ** 2, 0) / n;
  const cv = Math.sqrt(variance) / avg;
  return Math.max(0, Math.min(1, 1 - cv));
}

/**
 * detectRecurring — cluster the injected transactions into recurring-payment candidates. Pure and
 * deterministic on a fixed `asOf`: same input → deep-equal output, and the same merchant always maps
 * to the same `key`. Never reads the wall clock; never touches the DB/UI.
 */
export function detectRecurring({ transactions }: DetectRecurringInput): RecurringCandidate[] {
  if (transactions.length === 0) return [];

  // 1. Group by the case-folded counterparty (the stable cluster key).
  const groups = new Map<string, RecurringTx[]>();
  for (const tx of transactions) {
    const key = tx.counterparty.trim().toLowerCase();
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(tx);
    else groups.set(key, [tx]);
  }

  const candidates: RecurringCandidate[] = [];

  for (const [key, rowsRaw] of groups) {
    // 2. Keep only occurrences within ±5% of the group's median amount magnitude (a variable-spend
    //    merchant with wildly-varying amounts collapses below the occurrence threshold → dropped).
    const magnitudes = rowsRaw.map((r) => Math.abs(r.amount_eur));
    const medianMag = median(magnitudes);
    if (medianMag <= 0) continue;
    const rows = rowsRaw.filter(
      (r) => Math.abs(Math.abs(r.amount_eur) - medianMag) <= medianMag * AMOUNT_TOLERANCE,
    );
    if (rows.length < MIN_OCCURRENCES) continue;

    // 3. Sort by booking date; derive inter-occurrence gaps (days).
    const sorted = [...rows].sort((a, b) => a.booking_date.localeCompare(b.booking_date));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(differenceInDays(parseISO(sorted[i].booking_date), parseISO(sorted[i - 1].booking_date)));
    }
    const medianGap = median(gaps);

    // 4. Classify the cadence from the median gap; skip clusters outside every recognised band.
    const band = CADENCE_BANDS.find((b) => medianGap >= b.min && medianGap <= b.max);
    if (!band) continue;

    // 5. Representative amount = the cluster median (signed); next date = last booking + median gap.
    const signedMedian = median(sorted.map((r) => r.amount_eur));
    const last = sorted[sorted.length - 1];
    const nextExpectedDate = format(addDays(parseISO(last.booking_date), Math.round(medianGap)), "yyyy-MM-dd");

    // 6. Confidence = interval-consistency × amount-consistency (both CV-based over the FILTERED
    //    cluster, clamped, NaN-safe).
    const confidence = Math.max(
      0,
      Math.min(1, cvConsistency(gaps) * cvConsistency(sorted.map((r) => Math.abs(r.amount_eur)))),
    );

    candidates.push({
      key,
      label: last.counterparty,
      amount: signedMedian,
      cadence: band.cadence,
      nextExpectedDate,
      confidence,
    });
  }

  // Deterministic output order (stable across input permutations).
  return candidates.sort((a, b) => a.key.localeCompare(b.key));
}
