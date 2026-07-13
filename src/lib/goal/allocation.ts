// src/lib/goal/allocation.ts — the deterministic allocation WATERFALL (D5-05: derived-on-read).
//
// PURE, event-ordered fold — NO DB, NO filesystem, NO network, NO wall clock (the launch gate is
// injected). The fold IS the balance: nothing is stored, each transfer is split by priority and the
// running `BucketState` is the answer (identical philosophy to src/lib/db/marts.ts / period.ts).
//
// The waterfall priority for a broker transfer (_GOAL-BUCKETS-SPEC.md §"Allocation waterfall"):
//   (1) settle any NEGATIVE bucket (debt) FIRST — a prior over-spend on Brazil/Adventures is repaid
//       before a single euro reaches a positive bucket (debt-first invariant).
//   (2) Wealth up to €4,000 (MONTHLY_TARGET_EUR). Crossing a €10,000 Wealth gate RELEASES the accrued
//       Adventures-small LOCKED tranche → UNLOCKED (spendable), and resets the locked pool (hard-lock:
//       money accrued after a gate stays locked until the NEXT gate).
//   (3) Brazil up to €200 (BRAZIL_MONTHLY_EUR).
//   (4) the remainder 50/50 into Adventures-small (LOCKED) / Adventures-big.
//
// Money is carried as POSITIVE magnitudes; a bucket can go NEGATIVE only via a SPEND event (debt).
// Manual per-transfer override (D5-04) replaces the discretionary split (2–4) with the couple's
// explicit amounts, but debt settlement (1) STILL runs first (RESEARCH Open Question Q1 resolution).
// Adventures SPEND routes to Adventures-small-unlocked normally, or to Adventures-big when the
// epic-trip window is active (RESEARCH Open Question Q2 resolution — the flag is read upstream and
// passed into the fold).

import {
  BRAZIL_MONTHLY_EUR,
  LEVEL_STEP_EUR,
  MAJOR_STEP_EUR,
  MONTHLY_TARGET_EUR,
} from "./constants";

/**
 * The running balance of the five money buckets plus the bookkeeping gate index.
 * `advSmallUnlocked` is the SPENDABLE Adventures-small pool; `advSmallLocked` is accrued-but-locked
 * until the next €10k Wealth gate. `lastGateIndex` = floor(wealth / €10,000) at the last fold step
 * (used to detect a newly-crossed gate — it is NOT money, so the conservation property ignores it).
 */
export interface BucketState {
  wealth: number;
  brazil: number;
  advSmallUnlocked: number;
  advSmallLocked: number;
  advBig: number;
  lastGateIndex: number;
}

/** The all-zero starting balance (a fresh, post-launch couple with no history). */
export const EMPTY_STATE: BucketState = {
  wealth: 0,
  brazil: 0,
  advSmallUnlocked: 0,
  advSmallLocked: 0,
  advBig: 0,
  lastGateIndex: 0,
};

/** A manual per-transfer override (D5-04): the couple's explicit split, replacing the waterfall (2–4). */
export interface AllocationOverride {
  wealth?: number;
  brazil?: number;
  /** The Adventures share of an override accrues to Adventures-small LOCKED (or big when epic-trip). */
  adventures?: number;
}

/** Per-`allocate` options: an explicit override and the epic-trip routing flag. */
export interface AllocateOptions {
  override?: AllocationOverride;
  /** When true, an override's Adventures share (and Adventures SPEND) route to Adventures-big. */
  epicTrip?: boolean;
}

/** An ordered event the fold consumes: a broker TRANSFER (inflow) or a bucket SPEND (outflow). */
export interface AllocationEvent {
  kind: "transfer" | "spend";
  amount: number;
  /** ISO `YYYY-MM-DD`; the fold orders by (bookingDate, id) and gates on launch_date. */
  bookingDate: string;
  /** Stable tiebreaker for same-day ordering (optional). */
  id?: string | number;
  /** SPEND target bucket ("brazil" | "adventures"); Adventures routes small-unlocked or big. */
  bucket?: "brazil" | "adventures";
  /** A per-transfer manual override (D5-04). */
  override?: AllocationOverride;
  /** Epic-trip window active for this event (routes Adventures to big). */
  epicTrip?: boolean;
}

const DEBT_BUCKETS: Array<keyof BucketState> = ["brazil", "advSmallUnlocked", "advBig"];

/**
 * Apply ONE broker transfer to a prior balance, returning the NEW balance. Pure: `prior` is not
 * mutated. The full waterfall (debt-first → Wealth+gate → Brazil → 50/50 remainder), or the couple's
 * explicit `override` split (with debt-first still applied) when `opts.override` is given.
 */
export function allocate(
  amount: number,
  prior: Partial<BucketState> = {},
  opts: AllocateOptions = {},
): BucketState {
  const state: BucketState = { ...EMPTY_STATE, ...prior };
  // The gate index BEFORE this transfer — trust an explicit lastGateIndex, else derive from Wealth.
  const oldGateIndex =
    prior.lastGateIndex ?? Math.floor(state.wealth / LEVEL_STEP_EUR);
  let remaining = amount;

  // (1) Debt-first: repay every negative bucket before any positive allocation.
  for (const b of DEBT_BUCKETS) {
    if (remaining <= 0) break;
    if (state[b] < 0) {
      const pay = Math.min(remaining, -state[b]);
      state[b] += pay;
      remaining -= pay;
    }
  }

  /** Release the accrued locked Adventures-small tranche when a €10k Wealth gate is newly crossed. */
  const applyGate = () => {
    const newGateIndex = Math.floor(state.wealth / LEVEL_STEP_EUR);
    if (newGateIndex > oldGateIndex) {
      state.advSmallUnlocked += state.advSmallLocked;
      state.advSmallLocked = 0;
    }
    state.lastGateIndex = newGateIndex;
  };

  if (opts.override) {
    // (D5-04) explicit split replaces the discretionary waterfall — debt-first already ran.
    const ovr = opts.override;
    state.wealth += ovr.wealth ?? 0;
    applyGate();
    state.brazil += ovr.brazil ?? 0;
    const adv = ovr.adventures ?? 0;
    if (opts.epicTrip) state.advBig += adv;
    else state.advSmallLocked += adv;
    return state;
  }

  // (2) Wealth up to €4,000, then release any newly-crossed gate.
  const toWealth = Math.min(remaining, MONTHLY_TARGET_EUR);
  state.wealth += toWealth;
  remaining -= toWealth;
  applyGate();

  // (3) Brazil up to €200.
  const toBrazil = Math.min(remaining, BRAZIL_MONTHLY_EUR);
  state.brazil += toBrazil;
  remaining -= toBrazil;

  // (4) 50/50 remainder → Adventures-small LOCKED (hard-lock, accrued after the gate) / Adventures-big.
  if (remaining > 0) {
    const half = remaining / 2;
    state.advSmallLocked += half;
    state.advBig += remaining - half;
  }

  return state;
}

/** Apply ONE spend to a prior balance (can push the bucket NEGATIVE = debt). Pure. */
function spend(
  amount: number,
  prior: BucketState,
  bucket: "brazil" | "adventures",
  epicTrip: boolean,
): BucketState {
  const state: BucketState = { ...prior };
  if (bucket === "brazil") {
    state.brazil -= amount;
  } else if (epicTrip) {
    state.advBig -= amount;
  } else {
    state.advSmallUnlocked -= amount;
  }
  return state;
}

/** Options for the whole fold: the injected launch gate (events before it are excluded, D5-01/16). */
export interface FoldOptions {
  /** ISO `YYYY-MM-DD`, or null to exclude ALL events (pre-launch state). */
  launchDate: string | null;
}

/**
 * The deterministic fold over an ordered event stream (D5-05). Events dated BEFORE `launchDate`
 * (or all events when `launchDate` is null) are excluded; the rest are ordered by (bookingDate, id)
 * and applied — TRANSFER via {@link allocate}, SPEND via the internal debt-creating spend. Pure:
 * returns a fresh {@link BucketState}; an empty post-launch set returns {@link EMPTY_STATE}.
 */
export function foldAllocation(
  events: AllocationEvent[],
  opts: FoldOptions,
): BucketState {
  const launch = opts.launchDate;
  const live =
    launch === null
      ? []
      : events.filter((e) => e.bookingDate >= launch);

  const ordered = [...live].sort((a, b) => {
    if (a.bookingDate !== b.bookingDate)
      return a.bookingDate < b.bookingDate ? -1 : 1;
    const ai = a.id ?? 0;
    const bi = b.id ?? 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });

  let state: BucketState = { ...EMPTY_STATE };
  for (const e of ordered) {
    if (e.kind === "transfer") {
      state = allocate(e.amount, state, {
        override: e.override,
        epicTrip: e.epicTrip,
      });
    } else {
      state = spend(
        e.amount,
        state,
        e.bucket ?? "adventures",
        e.epicTrip ?? false,
      );
    }
  }
  return state;
}

/**
 * The SPENDABLE Adventures-small amount = the UNLOCKED pool ONLY (D5-11 hard-lock). Never
 * unlocked+locked — accrued-but-locked money is not spendable until its €10k gate releases it.
 */
export function spendableAdventuresSmall(state: Partial<BucketState>): number {
  return state.advSmallUnlocked ?? 0;
}

/**
 * The ACTIVE goal denominator on the multi-goal ladder (GOAL-12): the next €100,000 multiple ≥ the
 * given Wealth, clamped ≥ €100,000. Exactly at a €100k boundary the NEXT goal opens
 * (`activeDenominator(100000) === 200000`).
 */
export function activeDenominator(wealth: number): number {
  const next = (Math.floor(wealth / MAJOR_STEP_EUR) + 1) * MAJOR_STEP_EUR;
  return Math.max(next, MAJOR_STEP_EUR);
}
