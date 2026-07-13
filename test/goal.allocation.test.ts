import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (GOAL-08/10/12, D5-01/05) — freezes the deterministic allocation-waterfall
// contract for the not-yet-existent pure engine `src/lib/goal/allocation.ts` (Plan 02 builds it).
// This suite FAILS at import-resolution time until that module lands — the intended Nyquist RED
// anchor, NOT a bug (identical convention to test/marts.test.ts / test/reapply.test.ts).
//
// The waterfall is a PURE, event-ordered fold (D5-05 → derived-on-read): each broker transfer is
// split by priority — (1) settle any negative Brazil / Adventures-small debt FIRST, (2) Wealth up
// to €4,000 (crossing €10k gates releases the accrued Adventures-small tranche), (3) Brazil up to
// €200, (4) the remainder 50/50 into Adventures-small (locked) / Adventures-big. Bucket spend can
// push a bucket negative (debt). Nothing is stored — the fold IS the balance.
//
// The four worked examples below are transcribed VERBATIM from
// `.planning/redesign-research/_GOAL-BUCKETS-SPEC.md §"Allocation waterfall"` (and the RESEARCH
// Code-Examples table): every numeric expectation is the owner-confirmed spec, not an
// interpretation. Synthetic round € only — no real figures, no PII.
import {
  allocate,
  foldAllocation,
  spendableAdventuresSmall,
  activeDenominator,
  EMPTY_STATE,
  type BucketState,
  type AllocationEvent,
} from "@/lib/goal/allocation";

// The euro-denominated bucket fields (lastGateIndex is a bookkeeping index, not money).
const EURO_FIELDS = [
  "wealth",
  "brazil",
  "advSmallUnlocked",
  "advSmallLocked",
  "advBig",
] as const;

/** Sum every euro bucket of a state (used by the conservation property). */
function totalEuros(s: BucketState): number {
  return EURO_FIELDS.reduce((acc, f) => acc + s[f], 0);
}

describe("allocate() — the four _GOAL-BUCKETS-SPEC worked examples (GOAL-08)", () => {
  it("transfer €4,000 (no prior debt) → €4k Wealth only; Brazil/Adventures untouched", () => {
    const s = allocate(4000);
    expect(s.wealth).toBe(4000);
    expect(s.brazil).toBe(0);
    expect(s.advSmallUnlocked).toBe(0);
    expect(s.advSmallLocked).toBe(0);
    expect(s.advBig).toBe(0);
  });

  it("transfer €4,800 → €4k Wealth / €200 Brazil / €300 Adv-small / €300 Adv-big (remainder 600 split 50/50)", () => {
    const s = allocate(4800);
    expect(s.wealth).toBe(4000);
    expect(s.brazil).toBe(200);
    // No €10k gate crossed from €0 → the small share accrues as LOCKED (not spendable yet).
    expect(s.advSmallLocked).toBe(300);
    expect(s.advSmallUnlocked).toBe(0);
    expect(s.advBig).toBe(300);
  });

  it("owe Adventures-small −€200, transfer €4,000 → €200 settles Adventures, €3,800 Wealth, €0 Brazil/Adv", () => {
    const s = allocate(4000, { advSmallUnlocked: -200 });
    expect(s.advSmallUnlocked).toBe(0); // debt settled first
    expect(s.wealth).toBe(3800); // remaining after the €200 settlement
    expect(s.brazil).toBe(0);
    expect(s.advSmallLocked).toBe(0);
    expect(s.advBig).toBe(0);
  });

  it("owe Brazil −€100, transfer €3,000 → €100 settles Brazil, €2,900 Wealth, €0 Brazil/Adv", () => {
    const s = allocate(3000, { brazil: -100 });
    expect(s.brazil).toBe(0); // debt settled first
    expect(s.wealth).toBe(2900);
    expect(s.advSmallUnlocked).toBe(0);
    expect(s.advSmallLocked).toBe(0);
    expect(s.advBig).toBe(0);
  });
});

describe("allocate() — tranche hard-lock (GOAL-10, D5-11)", () => {
  it("tranche: spendable === advSmallUnlocked, NEVER unlocked+locked (500 released stays 500 despite 250 accrued)", () => {
    // The exact RESEARCH Code-Examples case: spendable(unlocked 500, locked 250) === 500.
    expect(
      spendableAdventuresSmall({ advSmallUnlocked: 500, advSmallLocked: 250 }),
    ).toBe(500);
  });

  it("tranche: crossing a €10k gate releases the accrued locked tranche; later accrual stays locked (hard-lock)", () => {
    // Prior: €8k Wealth with €500 accrued-but-locked Adventures-small, gate index still 0.
    const crossed = allocate(4000, { wealth: 8000, advSmallLocked: 500, lastGateIndex: 0 });
    expect(crossed.wealth).toBe(12000); // crosses the €10k gate
    expect(crossed.advSmallUnlocked).toBe(500); // the accrued tranche is now spendable
    expect(crossed.advSmallLocked).toBe(0); // …and the locked pool reset
    expect(crossed.lastGateIndex).toBe(1); // one gate credited
    expect(spendableAdventuresSmall(crossed)).toBe(500);

    // A further surplus transfer accrues MORE locked money but does NOT raise spendable (hard-lock).
    const later = allocate(4800, crossed); // €4k→Wealth, €200 Brazil, €600 remainder → +€300 locked
    expect(later.advSmallLocked).toBe(300);
    expect(spendableAdventuresSmall(later)).toBe(500); // still exactly 500 spendable at ~€16k
  });
});

describe("allocate() — conservation invariant (GOAL-08)", () => {
  it("conservation: Σ(bucket deltas) === transfer amount for any input (with or without prior debt)", () => {
    const cases: Array<{ amount: number; prior?: Partial<BucketState> }> = [
      { amount: 4000 },
      { amount: 4800 },
      { amount: 3000, prior: { brazil: -100 } },
      { amount: 4000, prior: { advSmallUnlocked: -200 } },
      { amount: 12000, prior: { wealth: 3000, advSmallLocked: 250 } }, // multi-gate crossing
    ];
    for (const { amount, prior } of cases) {
      const before = { ...EMPTY_STATE, ...prior } as BucketState;
      const after = allocate(amount, prior);
      // A gate crossing only MOVES money locked→unlocked (net 0), so conservation still holds.
      expect(totalEuros(after) - totalEuros(before)).toBeCloseTo(amount, 6);
    }
  });
});

describe("allocate() — debt-first invariant (GOAL-08)", () => {
  it("debt-first: no positive allocation to Wealth/Brazil/Adventures until every negative bucket is settled", () => {
    // €150 against €400 of Brazil debt only partially settles it → nothing reaches Wealth/Adv.
    const s = allocate(150, { brazil: -400 });
    expect(s.brazil).toBe(-250); // 150 of the 400 debt repaid
    expect(s.wealth).toBe(0); // debt not fully cleared → Wealth gets nothing
    expect(s.advSmallUnlocked).toBe(0);
    expect(s.advSmallLocked).toBe(0);
    expect(s.advBig).toBe(0);
  });
});

describe("foldAllocation() — pre-launch gate (D5-01/16)", () => {
  it("pre-launch: transfers dated before launch_date are excluded → all-zero state", () => {
    const events: AllocationEvent[] = [
      { kind: "transfer", amount: 4000, bookingDate: "2025-01-31" },
      { kind: "transfer", amount: 4800, bookingDate: "2025-02-28" },
    ];
    const state = foldAllocation(events, { launchDate: "2025-06-01" });
    expect(state).toEqual(EMPTY_STATE);
  });

  it("pre-launch: a null launch_date excludes ALL events → all-zero state", () => {
    const events: AllocationEvent[] = [
      { kind: "transfer", amount: 4000, bookingDate: "2025-01-31" },
    ];
    expect(foldAllocation(events, { launchDate: null })).toEqual(EMPTY_STATE);
  });

  it("pre-launch: only post-launch transfers fold in (the on/after-launch event counts)", () => {
    const events: AllocationEvent[] = [
      { kind: "transfer", amount: 4000, bookingDate: "2025-01-31" }, // pre-launch → excluded
      { kind: "transfer", amount: 4000, bookingDate: "2025-06-30" }, // post-launch → counts
    ];
    const state = foldAllocation(events, { launchDate: "2025-06-01" });
    expect(state.wealth).toBe(4000);
  });
});

describe("activeDenominator() — multi-goal ladder (GOAL-12)", () => {
  it("denominator: the active goal is the next €100k multiple ≥ Wealth, clamped ≥ €100,000", () => {
    expect(activeDenominator(0)).toBe(100000);
    expect(activeDenominator(50000)).toBe(100000);
    expect(activeDenominator(99999)).toBe(100000);
    expect(activeDenominator(100000)).toBe(200000); // exactly at €100k → the next goal opens
    expect(activeDenominator(150000)).toBe(200000);
    expect(activeDenominator(250000)).toBe(300000);
  });
});
