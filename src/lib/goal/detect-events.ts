// src/lib/goal/detect-events.ts — the RSC-side wiring that turns the PURE detector into a persisted,
// idempotent, SHARED once-only celebration (GOAL-11, GOAL-02, D5-14/18).
//
// The Goal page computes the Wealth cost basis (the fold), then calls this. It:
//   1. reads the already-recorded dedupeKeys for the ACTIVE demo partition,
//   2. runs the PURE `detectGoalEvents()` to find only the NEWLY-crossed €10k levels / €100k majors,
//   3. UPSERTs them into `goal_events` with `on conflict (dedupe_key, is_demo) do nothing` — the DB
//      composite-unique is the real idempotency guarantee (a concurrent re-detect writes nothing),
//   4. stamps `milestones.achieved_at` for every named milestone (10/25/50/75/100k) first crossed
//      (GOAL-02) — a partition-scoped update that only fills a NULL achieved_at (never re-stamps).
//
// Authorization: the AUTHENTICATED `@supabase/ssr` server client (anon key + the owner's JWT →
// allowlist RLS authorizes the insert, FND-03) — NEVER `service_role` (T-05-23). Because the row is
// SHARED (not a device flag), the other partner still sees the created-unseen row once on next login.
//
// Testability: a `factory` seam injects a fake client so the idempotency contract runs DB-free
// (mirrors recategorize.ts). The pure detection + dedupe math is frozen in test/goal.events.test.ts;
// this module's test asserts the upsert carries the on-conflict-do-nothing options.

import { detectGoalEvents } from "@/lib/goal/events";
import { MILESTONES } from "@/lib/goal/constants";
import { createClient } from "@/lib/supabase/server";

/**
 * The narrow slice of the supabase-js client this wiring touches. Typed structurally so a test fake
 * and the real `@supabase/ssr` client both satisfy it without the full SupabaseClient generics.
 */
export interface DetectEventsClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): PromiseLike<{
        data: Array<{ dedupe_key: string }> | null;
        error: unknown;
      }>;
    };
    upsert(
      values: Array<Record<string, unknown>>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ): PromiseLike<{ error: unknown }>;
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: unknown,
      ): {
        eq(
          column: string,
          value: unknown,
        ): { is(column: string, value: null): PromiseLike<{ error: unknown }> };
      };
    };
  };
}

/** A factory producing an RLS-authorized client (the real `createClient`, or a test fake). */
export type DetectEventsClientFactory = () => Promise<DetectEventsClient>;

export interface DetectGoalEventsWiringInput {
  /** The current Wealth cost basis (the €100k figure — the fold result). */
  wealth: number;
  /** The active read/write partition (`isDemoForReads()`): demo and real rows never mix (T-05-17). */
  isDemo: boolean;
}

/**
 * detectAndRecordGoalEvents — read prior keys → detect newly-crossed events → idempotent upsert +
 * milestone stamp, all partition-scoped. Safe to call on every Goal page render: a re-run after the
 * events already exist writes nothing new (the DB `on conflict (dedupe_key, is_demo) do nothing`).
 */
export async function detectAndRecordGoalEvents(
  { wealth, isDemo }: DetectGoalEventsWiringInput,
  factory: DetectEventsClientFactory = createClient as unknown as DetectEventsClientFactory,
): Promise<void> {
  const sb = await factory();

  // (1) The already-recorded keys for THIS partition — matches are excluded by the pure detector.
  const { data: existing } = await sb.from("goal_events").select("dedupe_key").eq("is_demo", isDemo);
  const existingDedupeKeys = new Set((existing ?? []).map((r) => r.dedupe_key));

  // (2) Only the NEWLY-crossed levels/majors.
  const events = detectGoalEvents({ wealth, existingDedupeKeys });

  // (3) Idempotent upsert — on conflict (dedupe_key, is_demo) do nothing. `ignoreDuplicates: true`
  // makes supabase-js emit `INSERT ... ON CONFLICT DO NOTHING`; the composite-unique is the guard.
  if (events.length > 0) {
    const rows = events.map((e) => ({
      kind: e.kind,
      threshold: e.threshold,
      dedupe_key: e.dedupeKey,
      is_demo: isDemo,
      seen: false,
    }));
    await sb
      .from("goal_events")
      .upsert(rows, { onConflict: "dedupe_key,is_demo", ignoreDuplicates: true });
  }

  // (4) Stamp milestones.achieved_at on first crossing (GOAL-02). Only fills a NULL achieved_at
  // (`.is('achieved_at', null)`) so a re-run never rewrites the original reached date.
  const nowIso = new Date().toISOString();
  for (const threshold of MILESTONES) {
    if (wealth >= threshold) {
      await sb
        .from("milestones")
        .update({ achieved_at: nowIso })
        .eq("threshold_eur", threshold)
        .eq("is_demo", isDemo)
        .is("achieved_at", null);
    }
  }
}
