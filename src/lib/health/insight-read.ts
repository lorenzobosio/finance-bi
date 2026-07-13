// src/lib/health/insight-read.ts — the demo-partitioned LATEST-insight read (AI-03, D-15, Pitfall 3).
//
// PURE w.r.t. the INJECTED client (mirrors src/lib/goal/household.ts + src/lib/health/thresholds.ts:
// no @supabase / next / drizzle import — the caller hands in the already-constructed @supabase/ssr
// client, cast at the call site). Returns the LATEST insight for the ACTIVE read partition (any
// `kind` — the persistent voice between weekly/monthly runs, D-04), degrading to null when no row
// exists yet (the first-run placeholder signal) OR on a read error (never throws — Home owns the
// degrade so the goal hero + KPIs always follow, never an empty hole, AI-03/D-15).
//
// The read is is_demo-scoped by the caller's `demoFilter` (Pitfall 3 — a missing `.eq("is_demo", …)`
// would blend the real household's note into the public demo, the 5,038→61,038 class of leak). The
// demo partition renders the D-16 pre-seeded insights through this SAME read, so the public demo
// showcases the voice with zero model calls.

/** The resolved latest insight the voice card renders (camelCased from the DB row). */
export interface LatestInsight {
  /** `weekly_report` | `whats_changed` | overspend note — Home renders whichever is newest (D-04). */
  kind: string;
  /** The externally-authored CFO-memo prose. Rendered as ESCAPED plain text on Home (stored-XSS guard). */
  body: string;
  /** ISO `created_at` — the generated-on date shown in the header lockup (an old date signals staleness). */
  createdAt: string;
}

/** The raw insights row shape the read selects (a subset of the table). */
interface InsightRow {
  kind: string;
  body: string;
  created_at: string;
}

/**
 * The narrow read slice of the supabase-js client:
 * `from(table).select(cols).eq(col,val).order(col,opts).limit(n).maybeSingle()`.
 * Typed structurally so the real `@supabase/ssr` client (cast at the call site) and a test fake both
 * satisfy it without importing the SupabaseClient generics into this pure module.
 */
export interface InsightReadClient {
  from(table: string): {
    select(cols: string): {
      eq(
        col: string,
        val: unknown,
      ): {
        order(
          col: string,
          opts: { ascending: boolean },
        ): {
          limit(n: number): {
            maybeSingle(): Promise<{ data: InsightRow | null; error: unknown }>;
          };
        };
      };
    };
  };
}

/**
 * readLatestInsight — read the newest insight for the active partition. Tolerant of a missing row
 * (returns null → the first-run placeholder) and of a read error (also degrades to null rather than
 * throwing — Home's own error boundary owns hard failures). Pure w.r.t. the injected client;
 * is_demo-scoped by `demoFilter` (Pitfall 3).
 */
export async function readLatestInsight(
  client: InsightReadClient,
  demoFilter: boolean,
): Promise<LatestInsight | null> {
  try {
    const { data } = await client
      .from("insights")
      .select("kind, body, created_at")
      .eq("is_demo", demoFilter)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;
    return {
      kind: data.kind,
      body: data.body,
      createdAt: data.created_at,
    };
  } catch {
    // A thrown client (network / auth) degrades to null — never crashes the read (D-15).
    return null;
  }
}
