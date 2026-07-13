// src/lib/goal/events.ts — once-only celebration detection (GOAL-11, D5-14/18). PURE.
//
// `detectGoalEvents()` produces ONE event per newly-crossed €10k LEVEL and €100k MAJOR of the Wealth
// cost basis, ascending. It is IDEMPOTENT: re-running with the already-recorded `dedupeKey`s in
// `existingDedupeKeys` yields NO new event (the DB's UNIQUE (dedupe_key, is_demo) is the persistence
// mirror). The `dedupeKey` shape (`level:10000` / `major:100000`) distinguishes level vs major so a
// €100,000 crossing (BOTH a level AND a major at €100,000) never collides on the composite-unique row.

import { LEVEL_STEP_EUR, MAJOR_STEP_EUR } from "./constants";

export interface GoalEvent {
  kind: "level" | "major";
  /** The € threshold crossed (a multiple of €10k for levels, €100k for majors). */
  threshold: number;
  /** The stable idempotency key, e.g. `level:30000` / `major:100000`. */
  dedupeKey: string;
}

export interface DetectGoalEventsInput {
  /** The current Wealth cost basis. */
  wealth: number;
  /** Already-recorded dedupeKeys — matches are excluded (idempotency). */
  existingDedupeKeys?: Set<string>;
}

/** Every crossed multiple of `step` in (0, wealth]. */
function crossedMultiples(wealth: number, step: number): number[] {
  const out: number[] = [];
  for (let t = step; t <= wealth; t += step) out.push(t);
  return out;
}

/**
 * Detect the newly-crossed level/major celebration events for a Wealth cost basis (ascending by
 * threshold, levels then majors). Pure: filters out any `existingDedupeKeys` so a re-run is a no-op.
 */
export function detectGoalEvents({
  wealth,
  existingDedupeKeys,
}: DetectGoalEventsInput): GoalEvent[] {
  const seen = existingDedupeKeys ?? new Set<string>();
  const events: GoalEvent[] = [];

  for (const threshold of crossedMultiples(wealth, LEVEL_STEP_EUR)) {
    const dedupeKey = `level:${threshold}`;
    if (!seen.has(dedupeKey)) events.push({ kind: "level", threshold, dedupeKey });
  }
  for (const threshold of crossedMultiples(wealth, MAJOR_STEP_EUR)) {
    const dedupeKey = `major:${threshold}`;
    if (!seen.has(dedupeKey)) events.push({ kind: "major", threshold, dedupeKey });
  }

  return events;
}
