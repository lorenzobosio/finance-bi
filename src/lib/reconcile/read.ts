// src/lib/reconcile/read.ts — the demo-partitioned OPEN-flags READ helper (DAT-02, D-04).
//
// PURE w.r.t. the INJECTED client (mirrors src/lib/goal/household.ts + src/lib/health/thresholds.ts:
// no @supabase / next / drizzle import — the caller hands in the already-constructed @supabase/ssr
// client, cast at the call site). Reads the OPEN reconciliation_flags for the ACTIVE partition so the
// data-trust chip + the /health drill-down can render "All reconciled" or "N discrepancies".
//
// SECURITY (T-07-05 — the load-bearing invariant): the read is is_demo-scoped by the caller's
// `isDemo`. A missing `.eq("is_demo", …)` would blend the real household's discrepancies into the
// public demo — the 5,038→61,038 class of leak. The read runs under the user JWT + RLS (never the
// elevated service key). Tolerant of a read error (returns an empty result, NEVER throws — the app
// shell / page error boundary owns hard failures). NO PII: numeric deltas + period + kind only.

/** One open discrepancy row, camelCased for the drill-down (numeric columns coerced to numbers). */
export interface OpenReconcileFlag {
  periodKey: number;
  kind: string;
  expectedEur: number;
  actualEur: number;
  deltaEur: number;
}

/** The resolved read: the open-flag count (drives the chip) + the rows (drive the drill-down). */
export interface OpenReconcileFlags {
  openCount: number;
  flags: OpenReconcileFlag[];
}

/** The raw reconciliation_flags row shape the read selects (numeric cols arrive as strings). */
interface ReconcileFlagRow {
  period_key: number;
  kind: string;
  expected_eur: string | number | null;
  actual_eur: string | number | null;
  delta_eur: string | number | null;
}

/**
 * The narrow read slice of the supabase-js client: `from(table).select(cols).eq(col,val).eq(col,val)`
 * awaited to `{ data, error }`. Typed structurally (a self-returning, thenable filter builder) so the
 * real `@supabase/ssr` client (cast at the call site) and a test fake both satisfy it without
 * importing the SupabaseClient generics into this pure module.
 */
interface ReconcileFlagsBuilder
  extends PromiseLike<{ data: ReconcileFlagRow[] | null; error: unknown }> {
  eq(col: string, val: unknown): ReconcileFlagsBuilder;
}

export interface ReconcileReadClient {
  from(table: string): {
    select(cols: string): ReconcileFlagsBuilder;
  };
}

/** Coerce a supabase Money (string over the wire) / number / null column to a finite number. */
function num(v: string | number | null): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * readOpenReconcileFlags — read the OPEN flags for the active partition. is_demo-scoped by the
 * caller's `isDemo` (T-07-05). Degrades to an empty result on a read error (never throws). Pure
 * w.r.t. the injected client.
 */
export async function readOpenReconcileFlags(
  client: ReconcileReadClient,
  isDemo: boolean,
): Promise<OpenReconcileFlags> {
  try {
    const { data, error } = await client
      .from("reconciliation_flags")
      .select("period_key, kind, expected_eur, actual_eur, delta_eur")
      .eq("status", "open")
      .eq("is_demo", isDemo);

    if (error || !data) return { openCount: 0, flags: [] };

    const flags: OpenReconcileFlag[] = data.map((r) => ({
      periodKey: Number(r.period_key),
      kind: r.kind,
      expectedEur: num(r.expected_eur),
      actualEur: num(r.actual_eur),
      deltaEur: num(r.delta_eur),
    }));
    return { openCount: flags.length, flags };
  } catch {
    // A thrown client (network / auth) degrades to the empty result — never crashes the shell.
    return { openCount: 0, flags: [] };
  }
}
