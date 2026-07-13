import { describe, expect, it } from "vitest";

// G5 (D5-11) — the honest Adventures "accruing" decomposition. The UAT caught the dishonest copy:
// the epic-trip (big) pool was labelled "unlocks at the next €10k" when it actually unlocks at the
// €100k major. accruingParts tags each non-zero locked pool with its TRUE unlock threshold.

import { accruingParts } from "@/lib/goal/adventures-view";

describe("accruingParts (G5 / D5-11)", () => {
  it("tags the demo's big pool at €100k, never a false €60k (the UAT bug)", () => {
    // The demo fold end-state: only the big pool is locked (advSmallLocked already released).
    const parts = accruingParts({ wealth: 56000, advSmallLocked: 0, advBig: 3800 });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ amount: 3800, unlocksAtEur: 100000, kind: "big" });
    // The dishonest €60k "next €10k" claim must NOT appear for the big pool.
    expect(parts.some((p) => p.unlocksAtEur === 60000)).toBe(false);
  });

  it("returns BOTH pools correctly tagged when both are locked", () => {
    const parts = accruingParts({ wealth: 56000, advSmallLocked: 1900, advBig: 1900 });
    const small = parts.find((p) => p.kind === "small");
    const big = parts.find((p) => p.kind === "big");
    expect(small).toEqual({ amount: 1900, unlocksAtEur: 60000, kind: "small" });
    expect(big).toEqual({ amount: 1900, unlocksAtEur: 100000, kind: "big" });
  });

  it("returns [] when nothing is locked", () => {
    expect(accruingParts({ wealth: 0, advSmallLocked: 0, advBig: 0 })).toEqual([]);
  });
});
