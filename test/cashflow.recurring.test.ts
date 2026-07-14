import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (FLOW-01, D-01/D-02/D-12) — freezes the recurring-detection contract for the
// not-yet-existent PURE engine `@/lib/cashflow/recurring.ts` (built GREEN in a later Phase-9 plan).
// RED at RUNTIME only ("Cannot find package '@/lib/cashflow/recurring'"); the import specifier is
// COMPUTED (a string constant + `await import(/* @vite-ignore */ …)`) so `tsc --noEmit` stays green
// while the module is absent (STATE.md 07-01/08-01 KEY MECHANISM). A static import of a missing
// module is a TS2307 typecheck error — the computed specifier defers resolution to runtime.
//
// The engine is a PURE mirror of the momentum.ts convention (src/lib/goal/momentum.ts:18-79):
//   - explicit typed input of INJECTED aggregates + an `asOf: Date` (NEVER `new Date()` — an
//     internal clock renders the demo dead, RESEARCH Pitfall 2). Deterministic on a fixed asOf.
//   - clusters by the stored (ingest-normalized) `counterparty` + near-equal `amount_eur` at a
//     ~monthly cadence; ≥3 occurrences, a 25–35 day monthly interval, ±5% of the cluster MEDIAN
//     amount (D-01, Claude's-discretion thresholds).
//   - `confidence` in [0,1] via the coefficient-of-variation idiom (momentum.ts:67-70); NaN-safe
//     (divide-by-zero → a low-confidence result, NEVER NaN/Infinity; empty input → []).
//   - a STABLE `key` per merchant across runs (confirm idempotency — D-02).
//
// Synthetic € only; no PII.

const MODULE = "@/lib/cashflow/recurring";

interface RecurringTx {
  counterparty: string; // already normalized at ingest (the cluster key source)
  amount_eur: number; // signed EUR (negative = outflow)
  booking_date: string; // YYYY-MM-DD
}

interface RecurringCandidate {
  key: string;
  label: string;
  amount: number;
  cadence: "weekly" | "monthly" | "yearly";
  nextExpectedDate: string; // YYYY-MM-DD
  confidence: number;
}

interface RecurringModule {
  detectRecurring: (input: { transactions: RecurringTx[]; asOf: Date }) => RecurringCandidate[];
}

async function load(): Promise<RecurringModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return { detectRecurring: mod.detectRecurring as RecurringModule["detectRecurring"] };
}

// Three near-equal monthly Spotify debits (±5% of the €12.99 median) — the canonical positive case.
const SPOTIFY: RecurringTx[] = [
  { counterparty: "spotify", amount_eur: -12.99, booking_date: "2026-01-15" },
  { counterparty: "spotify", amount_eur: -12.99, booking_date: "2026-02-14" },
  { counterparty: "spotify", amount_eur: -13.2, booking_date: "2026-03-16" },
];
const AS_OF = new Date("2026-03-20T00:00:00Z");

function only(cs: RecurringCandidate[], counterparty: string): RecurringCandidate {
  const c = cs.find((x) => x.label.toLowerCase().includes(counterparty) || x.key.includes(counterparty));
  if (!c) throw new Error(`no candidate for ${counterparty}`);
  return c;
}

describe("detectRecurring — clusters a ≥3-occurrence monthly merchant (FLOW-01, D-01)", () => {
  it("detects a monthly candidate from 3 near-equal monthly debits", async () => {
    const { detectRecurring } = await load();
    const out = detectRecurring({ transactions: SPOTIFY, asOf: AS_OF });
    expect(out.length).toBeGreaterThanOrEqual(1);
    const c = only(out, "spotify");
    expect(c.cadence).toBe("monthly");
  });

  it("classifies the interval as monthly for a 25–35 day cadence", async () => {
    const { detectRecurring } = await load();
    const c = only(detectRecurring({ transactions: SPOTIFY, asOf: AS_OF }), "spotify");
    expect(c.cadence).toBe("monthly");
  });

  it("does NOT emit a candidate below the 3-occurrence threshold", async () => {
    const { detectRecurring } = await load();
    const twoOnly = SPOTIFY.slice(0, 2);
    expect(detectRecurring({ transactions: twoOnly, asOf: AS_OF })).toEqual([]);
  });
});

describe("detectRecurring — amount tolerance + next-date projection (D-01)", () => {
  it("keeps amounts within ±5% of the cluster median in one cluster", async () => {
    const { detectRecurring } = await load();
    const c = only(detectRecurring({ transactions: SPOTIFY, asOf: AS_OF }), "spotify");
    // The reported amount is representative of the ~€12.99 median magnitude.
    expect(Math.abs(c.amount)).toBeGreaterThanOrEqual(12);
    expect(Math.abs(c.amount)).toBeLessThanOrEqual(14);
  });

  it("splits a merchant whose amounts differ by MORE than tolerance into no monthly cluster", async () => {
    const { detectRecurring } = await load();
    // Same merchant, wildly varying amounts (a variable-spend merchant, NOT a subscription).
    const varying: RecurringTx[] = [
      { counterparty: "rewe", amount_eur: -12.0, booking_date: "2026-01-10" },
      { counterparty: "rewe", amount_eur: -83.4, booking_date: "2026-02-11" },
      { counterparty: "rewe", amount_eur: -41.7, booking_date: "2026-03-09" },
    ];
    const out = detectRecurring({ transactions: varying, asOf: AS_OF });
    // Either no candidate, or one with a low confidence — never a false-confident monthly bill.
    if (out.length > 0) {
      expect(out[0].confidence).toBeLessThan(0.9);
    }
  });

  it("projects nextExpectedDate = last occurrence + median interval (after the last booking)", async () => {
    const { detectRecurring } = await load();
    const c = only(detectRecurring({ transactions: SPOTIFY, asOf: AS_OF }), "spotify");
    // The last debit is 2026-03-16; the next monthly expectation is roughly a month later.
    expect(c.nextExpectedDate > "2026-03-16").toBe(true);
    expect(c.nextExpectedDate).toMatch(/^2026-04/);
  });
});

describe("detectRecurring — confidence bounds + NaN-safety (D-12)", () => {
  it("bounds confidence within [0,1]", async () => {
    const { detectRecurring } = await load();
    const out = detectRecurring({ transactions: SPOTIFY, asOf: AS_OF });
    for (const c of out) {
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
      expect(Number.isNaN(c.confidence)).toBe(false);
      expect(Number.isFinite(c.confidence)).toBe(true);
    }
  });

  it("returns [] on empty input (no NaN, no throw)", async () => {
    const { detectRecurring } = await load();
    expect(detectRecurring({ transactions: [], asOf: AS_OF })).toEqual([]);
  });

  it("never surfaces NaN/Infinity in any numeric field", async () => {
    const { detectRecurring } = await load();
    for (const c of detectRecurring({ transactions: SPOTIFY, asOf: AS_OF })) {
      expect(Number.isFinite(c.amount)).toBe(true);
      expect(Number.isFinite(c.confidence)).toBe(true);
    }
  });
});

describe("detectRecurring — deterministic (no wall clock, stable key) (RESEARCH Pitfall 2)", () => {
  it("is deterministic on a fixed asOf: two calls are deep-equal", async () => {
    const { detectRecurring } = await load();
    const a = detectRecurring({ transactions: SPOTIFY, asOf: AS_OF });
    const b = detectRecurring({ transactions: SPOTIFY, asOf: AS_OF });
    expect(b).toEqual(a);
  });

  it("emits a STABLE key for the same merchant across runs (confirm idempotency, D-02)", async () => {
    const { detectRecurring } = await load();
    const k1 = only(detectRecurring({ transactions: SPOTIFY, asOf: AS_OF }), "spotify").key;
    const k2 = only(
      detectRecurring({ transactions: [...SPOTIFY].reverse(), asOf: AS_OF }),
      "spotify",
    ).key;
    expect(k1).toBe(k2);
    expect(k1.length).toBeGreaterThan(0);
  });
});
