// test/goal.hero-view.test.ts — the PURE Home-hero glance view-model (D5-12). Node env, no DOM.
//
// The hero card is a client island (@number-flow needs a DOM), so the GLANCE LOGIC — next-milestone
// remaining, the gated ETA sentence, and the compact streak-chain nodes — is factored into a pure
// module and tested here. The component then only renders these primitives (no logic to DOM-test).

import { describe, expect, it } from "vitest";

import {
  etaLine,
  nextMilestone,
  nextMilestoneRemaining,
  streakChainNodes,
} from "@/lib/goal/hero-view";
import type { EtaResult } from "@/lib/goal/momentum";

describe("nextMilestone / nextMilestoneRemaining", () => {
  it("returns the smallest ladder rung strictly above the current wealth", () => {
    expect(nextMilestone(0)).toBe(10_000);
    expect(nextMilestone(10_000)).toBe(25_000); // exactly on a rung → the NEXT one opens
    expect(nextMilestone(12_500)).toBe(25_000);
    expect(nextMilestone(80_000)).toBe(100_000);
  });

  it("returns null once the top milestone is reached (nothing above €100k on the ladder)", () => {
    expect(nextMilestone(100_000)).toBeNull();
    expect(nextMilestone(140_000)).toBeNull();
  });

  it("gives the € remaining to that rung, clamped ≥ 0, null past the top", () => {
    expect(nextMilestoneRemaining(0)).toBe(10_000);
    expect(nextMilestoneRemaining(12_500)).toBe(12_500);
    expect(nextMilestoneRemaining(100_000)).toBeNull();
  });
});

describe("etaLine (gated, honest — D5-15)", () => {
  const building: EtaResult = {
    confident: false,
    minYears: null,
    maxYears: null,
    message: "…",
    confidence: 0,
  };
  const confident: EtaResult = {
    confident: true,
    minYears: 3.2,
    maxYears: 4.1,
    message: "On track.",
    confidence: 0.8,
  };

  it("shows the warm 'building your pace' copy when not confident (never a false date)", () => {
    const line = etaLine(building);
    expect(line).toMatch(/building your pace/i);
    expect(line).not.toMatch(/\d{4}/); // no false-precise year
  });

  it("shows a RANGE (never a single date) when confident", () => {
    expect(etaLine(confident)).toBe("~3–4 years at your current pace.");
  });

  it("collapses equal bounds to a singular '~1 year' (never '~1–1 years' / '1 years') — G3", () => {
    const oneYear: EtaResult = {
      confident: true,
      minYears: 0.9,
      maxYears: 1.2,
      message: "…",
      confidence: 0.8,
    };
    expect(etaLine(oneYear)).toBe("~1 year at your current pace.");
  });

  it("collapses equal bounds to a plural '~2 years' — G3", () => {
    const twoYears: EtaResult = {
      confident: true,
      minYears: 1.6,
      maxYears: 2.4,
      message: "…",
      confidence: 0.8,
    };
    expect(etaLine(twoYears)).toBe("~2 years at your current pace.");
  });
});

describe("streakChainNodes (compact 6-node pulse — never red)", () => {
  const T = 4_000;
  // now = 2026-07-XX → provisional = 202607, last closed = 202606.
  const now = new Date("2026-07-13T00:00:00Z");

  it("returns the last N closed months oldest→newest as hit booleans + the provisional head", () => {
    const inv = new Map<number, number>([
      [202601, T],
      [202602, T],
      [202603, 1_200], // a lighter month — a miss node, NOT red (color is the caller's job)
      [202604, T],
      [202605, T],
      [202606, T],
      [202607, 500], // provisional head, still filling
    ]);
    const { hits, provisionalHit } = streakChainNodes(inv, now, 6);
    expect(hits).toEqual([true, true, false, true, true, true]);
    expect(provisionalHit).toBe(false);
  });

  it("excludes pre-launch months (no phantom miss nodes before the couple started)", () => {
    const inv = new Map<number, number>([
      [202605, T],
      [202606, T],
    ]);
    const { hits } = streakChainNodes(inv, now, 6, "2026-05-01");
    expect(hits).toEqual([true, true]); // only the two post-launch closed months
  });

  it("flags the provisional head once it has already reached €4k", () => {
    const inv = new Map<number, number>([[202607, T]]);
    const { provisionalHit } = streakChainNodes(inv, now, 6);
    expect(provisionalHit).toBe(true);
  });
});
