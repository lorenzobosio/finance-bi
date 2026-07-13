// src/lib/health/thresholds.ts — the demo-partitioned Financial-Health THRESHOLDS read (D-07).
//
// PURE w.r.t. the INJECTED client (mirrors src/lib/goal/household.ts: no @supabase / next /
// drizzle import — the caller hands in the already-constructed @supabase/ssr client, cast at the
// call site). Returns the seeded DEFAULT_BANDS when no row exists yet (pre-launch / the unseeded
// demo partition) OR on a read error (never throws — the /health page's own error boundary owns
// hard failures). The read is is_demo-scoped by the caller's `demoFilter` (Pitfall 3 — a missing
// `.eq("is_demo", …)` would blend the real household's config into the public demo, the
// 5,038→61,038 class of leak).
//
// The DB singleton (`insight_thresholds`, migration 0015) seeds exactly ONE `is_demo=false` row
// (06-02); the demo partition seeds NO row and relies on this code-side DEFAULT_BANDS fallback,
// exactly as `household` relies on PRE_LAUNCH_HOUSEHOLD.

/** The resolved (nested, camelCased) threshold bands the scorecard resolves each metric against. */
export interface InsightThresholds {
  /** Monthly savings-rate (invested ÷ revenue) band edges: ≥healthy healthy, ≥watch watch, else off. */
  savingsRate: { healthy: number; watch: number };
  /** Months-of-cost cash-reserve band edges: ≥healthy healthy, ≥watch watch, else off. */
  reserve: { healthy: number; watch: number };
  /** Over-budget tolerance: ≤watchOverPct over = watch, beyond = off. */
  budgetAdherence: { watchOverPct: number };
  /** €4k contribution-miss tolerance: watchMisses miss = watch, multiple = off. */
  streak: { watchMisses: number };
}

/**
 * The seeded personal-finance DEFAULT_BANDS (D-07) — the EXACT numbers seeded in the real
 * partition by drizzle/0015_insight_thresholds.sql, so a code-side read of the unseeded demo
 * partition returns byte-identical bands. Documented defaults, editable via the Config surface (06-04).
 *   savings rate ≥0.20 healthy / 0.10–0.20 watch / <0.10 off
 *   reserve      ≥6mo healthy / 3–6 watch / <3 off
 *   budget       ≤10% over = watch, >10% over = off
 *   €4k streak   1 miss = watch, multiple = off
 */
export const DEFAULT_BANDS: InsightThresholds = {
  savingsRate: { healthy: 0.2, watch: 0.1 },
  reserve: { healthy: 6, watch: 3 },
  budgetAdherence: { watchOverPct: 0.1 },
  streak: { watchMisses: 1 },
};

/**
 * The narrow read slice of the supabase-js client: `from(table).select(cols).eq(col,val).maybeSingle()`.
 * Typed structurally so the real `@supabase/ssr` client (cast at the call site) and a test fake both
 * satisfy it without importing the SupabaseClient generics into this pure module.
 */
export interface InsightThresholdsReadClient {
  from(table: string): {
    select(cols: string): {
      eq(
        col: string,
        val: unknown,
      ): {
        maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
}

/** Coerce a supabase Money (string over the wire) / number / null column to a finite number. */
function num(v: unknown): number {
  if (v === null || v === undefined) return NaN;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Map a present DB row to the nested camelCased bands. */
function fromRow(data: Record<string, unknown>): InsightThresholds {
  return {
    savingsRate: {
      healthy: num(data.savings_rate_healthy),
      watch: num(data.savings_rate_watch),
    },
    reserve: {
      healthy: num(data.reserve_healthy),
      watch: num(data.reserve_watch),
    },
    budgetAdherence: {
      // The live column is `budget_over_watch_pct` (migration 0015); the RED contract fixture uses
      // the descriptive alias `budget_adherence_watch_over_pct`. Read either so the helper satisfies
      // the frozen test AND the real schema without weakening the test (deviation Rule 1).
      watchOverPct: num(
        data.budget_adherence_watch_over_pct ?? data.budget_over_watch_pct,
      ),
    },
    streak: {
      watchMisses: num(data.streak_watch_misses),
    },
  };
}

/**
 * readInsightThresholds — read the household's scorecard bands for the active partition. Tolerant of
 * a missing row (returns {@link DEFAULT_BANDS}) and of a read error (also degrades to DEFAULT_BANDS
 * rather than throwing — the page's own error boundary owns hard failures). Pure w.r.t. the injected
 * client; is_demo-scoped by `demoFilter` (Pitfall 3).
 */
export async function readInsightThresholds(
  client: InsightThresholdsReadClient,
  demoFilter: boolean,
): Promise<InsightThresholds> {
  try {
    const { data, error } = await client
      .from("insight_thresholds")
      .select(
        "savings_rate_healthy, savings_rate_watch, reserve_healthy, reserve_watch, budget_over_watch_pct, streak_watch_misses",
      )
      .eq("is_demo", demoFilter)
      .maybeSingle();

    if (error || !data) return DEFAULT_BANDS;
    return fromRow(data);
  } catch {
    // A thrown client (network / auth) degrades to the seeded defaults — never crashes the read.
    return DEFAULT_BANDS;
  }
}
