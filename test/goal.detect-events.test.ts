import { describe, expect, it, vi } from "vitest";

// Detect+record wiring + celebration-seen write-plane test (GOAL-11/02, D5-14/18, T-05-21/23).
//
// DB-free: both units take an injected client factory (mirroring recategorize.test.ts) so we assert
// exactly which supabase-js calls fire — no live DB. The PURE detection/dedupe math is frozen in
// goal.events.test.ts; this asserts the PERSISTENCE contract:
//   • the upsert carries `on conflict (dedupe_key, is_demo) do nothing` (onConflict + ignoreDuplicates)
//   • a re-run with every key already recorded writes NO new goal_events row (idempotency, T-05-21)
//   • milestones.achieved_at is stamped only on first cross (fills a NULL, partition-scoped, GOAL-02)
//   • markCelebrationSeen flips ONLY seen=true on the one row by id (never a bulk update)
// Synthetic € + uuids only (no PII).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { detectAndRecordGoalEvents, type DetectEventsClient } from "@/lib/goal/detect-events";
import { __markCelebrationSeen } from "@/lib/actions/celebration-seen";
import type { WriteClient } from "@/lib/actions/recategorize.shared";

interface RecordedCall {
  table: string;
  op: "select" | "upsert" | "update";
  payload?: unknown;
  options?: unknown;
  eqs: Array<[string, unknown]>;
  isNull?: [string, null];
}

/** A spy supabase-js client recording upsert/update/select calls for goal_events + milestones. */
function makeFakeSupabase(existingKeys: string[] = []) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    let current: RecordedCall | null = null;
    const builder = {
      select(_columns: string) {
        current = { table, op: "select", eqs: [] };
        return this;
      },
      upsert(values: unknown, options: unknown) {
        calls.push({ table, op: "upsert", payload: values, options, eqs: [] });
        return Promise.resolve({ error: null });
      },
      update(payload: Record<string, unknown>) {
        current = { table, op: "update", payload, eqs: [] };
        calls.push(current);
        return this;
      },
      eq(col: string, val: unknown) {
        if (current) current.eqs.push([col, val]);
        // A SELECT chain ends on its .eq → resolve the partition's existing keys.
        if (current?.op === "select") {
          return Promise.resolve({
            data: existingKeys.map((dedupe_key) => ({ dedupe_key })),
            error: null,
          });
        }
        // An UPDATE chain keeps chaining (.eq().eq().is() for milestones, or terminal .eq for seen).
        return this;
      },
      is(col: string, val: null) {
        if (current) current.isNull = [col, val];
        return Promise.resolve({ error: null });
      },
      // Make the builder awaitable so a terminal `.update().eq(...)` chain (celebration-seen) resolves.
      then(resolve: (v: { error: null }) => void) {
        resolve({ error: null });
      },
    };
    return builder;
  }

  return { client: { from }, calls };
}

describe("detectAndRecordGoalEvents — idempotent shared upsert (GOAL-11, T-05-21)", () => {
  it("upserts newly-crossed events with on-conflict-do-nothing on (dedupe_key, is_demo)", async () => {
    const { client, calls } = makeFakeSupabase([]);
    await detectAndRecordGoalEvents({ wealth: 25000, isDemo: false }, async () => client as unknown as DetectEventsClient);

    const upserts = calls.filter((c) => c.table === "goal_events" && c.op === "upsert");
    expect(upserts).toHaveLength(1);
    expect(upserts[0].options).toEqual({
      onConflict: "dedupe_key,is_demo",
      ignoreDuplicates: true,
    });
    // €25k → levels at €10k and €20k, all is_demo=false, seen=false.
    const rows = upserts[0].payload as Array<Record<string, unknown>>;
    const keys = rows.map((r) => r.dedupe_key).sort();
    expect(keys).toEqual(["level:10000", "level:20000"]);
    expect(rows.every((r) => r.is_demo === false && r.seen === false)).toBe(true);
  });

  it("writes NO new goal_events row when every key is already recorded (idempotency)", async () => {
    const { client, calls } = makeFakeSupabase(["level:10000", "level:20000"]);
    await detectAndRecordGoalEvents({ wealth: 20000, isDemo: false }, async () => client as unknown as DetectEventsClient);
    expect(calls.filter((c) => c.table === "goal_events" && c.op === "upsert")).toHaveLength(0);
  });

  it("stamps milestones.achieved_at only where NULL, partition-scoped (GOAL-02)", async () => {
    const { client, calls } = makeFakeSupabase([]);
    await detectAndRecordGoalEvents({ wealth: 25000, isDemo: true }, async () => client as unknown as DetectEventsClient);

    const stamps = calls.filter((c) => c.table === "milestones" && c.op === "update");
    // €25k crosses the €10k and €25k named milestones (not 50/75/100k).
    const thresholds = stamps
      .map((s) => s.eqs.find(([c]) => c === "threshold_eur")?.[1] as number)
      .sort((a, b) => a - b);
    expect(thresholds).toEqual([10000, 25000]);
    for (const s of stamps) {
      expect(s.payload).toHaveProperty("achieved_at");
      expect(s.isNull).toEqual(["achieved_at", null]);
      expect(s.eqs).toContainEqual(["is_demo", true]);
    }
  });
});

describe("markCelebrationSeen — flips only seen=true on one row (D5-14)", () => {
  const EVENT_UUID = "00000000-0000-4000-8000-000000000abc";

  it("issues a single goal_events update scoped by id with only seen=true", async () => {
    const { client, calls } = makeFakeSupabase([]);
    await __markCelebrationSeen({ eventId: EVENT_UUID }, async () => client as unknown as WriteClient);

    const updates = calls.filter((c) => c.table === "goal_events" && c.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ seen: true });
    expect(updates[0].eqs).toEqual([["id", EVENT_UUID]]);
  });

  it("rejects a non-uuid eventId (zod boundary)", async () => {
    const { client } = makeFakeSupabase([]);
    await expect(__markCelebrationSeen({ eventId: "nope" }, async () => client as unknown as WriteClient)).rejects.toThrow();
  });
});
