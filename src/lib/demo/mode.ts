// src/lib/demo/mode.ts — the SINGLE demo-mode chokepoint (DEMO-03, D4-09/10/12, R-C).
//
// The most important correctness invariant of Phase 4: demo rows (`is_demo=true`) and real rows
// (`is_demo=false`) must NEVER be summed into one aggregation. This file is the ONE place a read
// decides its partition. Every mart read in src/app/(protected) AND every onboarding existence
// probe (connections/budgets counts) threads through here, so in demo mode the probes are also
// is_demo=true-gated (D4-12 / Eval 12 R2) and demo↔real never mix.
//
// The owner toggle is a per-request MODE, not an RLS change (D4-12): the signed-in owner is
// allowlisted and may legitimately read both partitions; the `demo_mode` cookie selects which.
// On the PUBLIC deploy the anon RLS cap (is_demo=true) is the sole control — a forged cookie
// cannot escalate, because RLS filters post-application on the anon role (T-04-T4). The elevated
// service key is never used here — anon key + the owner's JWT only (FND-03).
//
// PURITY SPLIT: the partition helpers (`partitionByDemo`, `demoModeProbeFilter`) are pure and
// unit-tested in a node env; `demoMode()` reads the request cookie and lazy-imports
// `next/headers` so importing the pure helpers never drags the server-only module into a test.

/** A row carrying the `is_demo` partition flag (the post-0010 row shape). */
export interface DemoFlagged {
  isDemo: boolean;
}

/**
 * partitionByDemo — split a mixed set into its real (is_demo=false) and demo (is_demo=true)
 * partitions. The pure mirror of the SQL `coalesce(is_demo,false)` GROUP BY (D4-10): a real
 * aggregation over the result is IDENTICAL whether or not demo rows were present (R-C).
 */
export function partitionByDemo<T extends DemoFlagged>(rows: T[]): { real: T[]; demo: T[] } {
  const real: T[] = [];
  const demo: T[] = [];
  for (const row of rows) {
    if (row.isDemo === true) demo.push(row);
    else real.push(row);
  }
  return { real, demo };
}

/**
 * demoModeProbeFilter — the existence-probe filter (D4-12 / Eval 12 R2). Onboarding signals
 * (connections/budgets counts) must ALSO be is_demo-gated, or demo mode would leak the real
 * connection count into the onboarding signal. Returns only the rows for the active partition:
 * is_demo=true rows when demo mode is on, is_demo=false rows when off (real mode).
 */
export function demoModeProbeFilter<T extends DemoFlagged>(rows: T[], demo: boolean): T[] {
  return rows.filter((r) => r.isDemo === demo);
}

/** The cookie the Config toggle writes; the chokepoint reads it to select the partition. */
export const DEMO_MODE_COOKIE = "demo_mode";

/**
 * demoMode — the per-request demo-mode flag for the signed-in owner. True when the `demo_mode`
 * cookie is set (the in-app toggle) OR `NEXT_PUBLIC_DEMO=1` (the public demo deploy). Reads the
 * request cookie via next/headers (lazy-imported so the pure helpers above stay node-testable).
 * Server-only.
 */
export async function demoMode(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_DEMO === "1") return true;
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return store.get(DEMO_MODE_COOKIE)?.value === "1";
}

/**
 * isDemoForReads — the boolean every mart read applies via `.eq('is_demo', isDemoForReads)`.
 * It is exactly `demoMode()` today (the single source of the partition for every read), exposed
 * under an intention-revealing name so call sites read as "filter reads to this partition".
 */
export async function isDemoForReads(): Promise<boolean> {
  return demoMode();
}
