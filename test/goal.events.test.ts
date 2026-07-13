import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (GOAL-11, D5-14/18) — freezes the once-only celebration-detection contract for the
// not-yet-existent pure engine `src/lib/goal/events.ts` (Plan 02 builds it). FAILS at
// import-resolution until the module lands — the intended Nyquist RED anchor, NOT a bug.
//
// `detectGoalEvents()` produces ONE event per newly-crossed €10k LEVEL and €100k MAJOR of the Wealth
// cost basis. It is IDEMPOTENT: re-running with the already-recorded `dedupeKey`s in
// `existingDedupeKeys` yields NO new event (the DB's UNIQUE (dedupe_key, is_demo) is the persistence
// mirror — GOAL-11). The `dedupeKey` shape distinguishes level vs major vs threshold so a €100k
// crossing (both a level AND a major at €100,000) never collides. Pure; synthetic € only.
import { detectGoalEvents, type GoalEvent } from "@/lib/goal/events";

describe("detectGoalEvents() — one event per newly-crossed €10k level (GOAL-11)", () => {
  it("crossing to €25,000 emits level events at €10,000 and €20,000 (no €100k major yet)", () => {
    const events: GoalEvent[] = detectGoalEvents({ wealth: 25000 });
    const levels = events.filter((e) => e.kind === "level").map((e) => e.threshold).sort((a, b) => a - b);
    expect(levels).toEqual([10000, 20000]);
    expect(events.some((e) => e.kind === "major")).toBe(false);
  });

  it("dedupeKey shape distinguishes level vs major vs threshold", () => {
    const events = detectGoalEvents({ wealth: 20000 });
    const byKey = new Map(events.map((e) => [e.threshold + ":" + e.kind, e.dedupeKey]));
    expect(byKey.get("10000:level")).toBe("level:10000");
    expect(byKey.get("20000:level")).toBe("level:20000");
  });
});

describe("detectGoalEvents() — €100k major crossing (GOAL-11, D5-18)", () => {
  it("crossing €100,000 emits BOTH a level and a major at €100,000, distinguished by dedupeKey", () => {
    const events = detectGoalEvents({ wealth: 100000 });
    const major = events.find((e) => e.kind === "major" && e.threshold === 100000);
    const levelAt100k = events.find((e) => e.kind === "level" && e.threshold === 100000);
    expect(major).toBeDefined();
    expect(major?.dedupeKey).toBe("major:100000");
    expect(levelAt100k).toBeDefined();
    expect(levelAt100k?.dedupeKey).toBe("level:100000");
    // Distinct keys → the composite-unique DB row never collides between level and major.
    expect(major?.dedupeKey).not.toBe(levelAt100k?.dedupeKey);
  });
});

describe("detectGoalEvents() — idempotency via dedupeKey (GOAL-11)", () => {
  it("re-running with every prior dedupeKey already recorded yields NO new event", () => {
    const first = detectGoalEvents({ wealth: 25000 });
    const already = new Set(first.map((e) => e.dedupeKey));
    const second = detectGoalEvents({ wealth: 25000, existingDedupeKeys: already });
    expect(second).toEqual([]);
  });

  it("only the NEWLY-crossed level is emitted when history already holds the earlier ones", () => {
    // Already celebrated €10k and €20k; Wealth is now €31,000 → only €30,000 is new.
    const already = new Set(["level:10000", "level:20000"]);
    const events = detectGoalEvents({ wealth: 31000, existingDedupeKeys: already });
    expect(events.map((e) => e.dedupeKey)).toEqual(["level:30000"]);
  });
});
