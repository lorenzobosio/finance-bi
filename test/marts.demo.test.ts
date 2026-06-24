import { describe, expect, it } from "vitest";

// Wave-0 RED (DEMO-03, D4-09/10/12, R-C) — the DOUBLE-COUNT GUARD.
//
// The single most important correctness invariant of Phase 4: demo rows (`is_demo=true`) and
// real rows (`is_demo=false`) must NEVER be summed into one aggregation. The marts in
// `drizzle/0007_marts.sql` are unconditional scans today; the instant a seeded `is_demo=true`
// row lands in `transactions` WITHOUT the `is_demo` mart filter, every KPI silently inflates by
// ~€55k. This suite EXISTS BEFORE the column so that unsafe intermediate state fails loudly.
//
// Two contracts, both RED until the later wave builds the demo-aware helpers:
//   1. `partitionByDemo` / `martRowsForMode` — the pure filter the SQL `coalesce(is_demo,false)`
//      GROUP BY (D4-10) and the `src/lib/demo/mode.ts` chokepoint (D4-12) replicate: a real read
//      is IDENTICAL whether or not demo rows are present.
//   2. `demoModeProbeFilter` — the existence-probe filter (connections/budgets counts must ALSO
//      be `is_demo`-gated in demo mode — D4-12 / Eval 12 R2).
//
// Synthetic round numbers only — no real figures, no PII (source-cleanliness stays green).
import { sumRevenue, sumCosts, type MartTx } from "@/lib/db/marts";
// The not-yet-existent demo-isolation helpers — RED on import until the later wave builds them.
import {
  partitionByDemo,
  demoModeProbeFilter,
  type DemoFlagged,
} from "@/lib/demo/mode";

// A mart row carrying the `is_demo` partition flag (the post-0010 row shape).
const row = (
  flowType: MartTx["flowType"],
  amount: number,
  isDemo: boolean,
  costCenter: MartTx["costCenter"] = "shared",
): MartTx & DemoFlagged => ({
  flowType,
  amount,
  costCenter,
  categoryId: null,
  isDemo,
});

describe("double-count guard (DEMO-03, R-C) — a real read is identical with or without demo rows", () => {
  const realRows = [row("revenue", 1000, false), row("cost", 300, false)];
  const demoRows = [row("revenue", 9999, true), row("cost", 8888, true)];
  const mixed = [...realRows, ...demoRows];

  it("partitionByDemo splits a mixed set into real (is_demo=false) and demo (is_demo=true)", () => {
    const { real, demo } = partitionByDemo(mixed);
    expect(real).toHaveLength(2);
    expect(demo).toHaveLength(2);
    expect(real.every((r) => r.isDemo === false)).toBe(true);
    expect(demo.every((r) => r.isDemo === true)).toBe(true);
  });

  it("a real aggregation over the mixed set equals the same aggregation with demo rows removed", () => {
    const { real } = partitionByDemo(mixed);
    // The double-count would manifest as sumRevenue(mixed) === 10999; the partition makes it 1000.
    expect(sumRevenue(real)).toBe(sumRevenue(realRows));
    expect(sumCosts(real)).toBe(sumCosts(realRows));
    expect(sumRevenue(real)).toBe(1000);
    expect(sumCosts(real)).toBe(300);
  });

  it("a demo aggregation reads ONLY the demo rows (the in-app toggle partition, D4-12)", () => {
    const { demo } = partitionByDemo(mixed);
    expect(sumRevenue(demo)).toBe(9999);
    expect(sumCosts(demo)).toBe(8888);
  });
});

describe("demo-mode existence-probe filter (D4-12 / Eval 12 R2)", () => {
  // Existence probes (connections/budgets counts that drive `getOnboardingState`) must ALSO be
  // is_demo-gated, or demo mode would leak the real connection count into the onboarding signal.
  const probeRows: DemoFlagged[] = [
    { isDemo: false } as DemoFlagged,
    { isDemo: true } as DemoFlagged,
    { isDemo: true } as DemoFlagged,
  ];

  it("returns only is_demo=true rows when demo mode is on", () => {
    expect(demoModeProbeFilter(probeRows, true)).toHaveLength(2);
    expect(demoModeProbeFilter(probeRows, true).every((r) => r.isDemo === true)).toBe(true);
  });

  it("returns only is_demo=false rows when demo mode is off (real mode)", () => {
    expect(demoModeProbeFilter(probeRows, false)).toHaveLength(1);
    expect(demoModeProbeFilter(probeRows, false).every((r) => r.isDemo === false)).toBe(true);
  });
});
