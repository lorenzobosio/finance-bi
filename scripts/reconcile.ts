// scripts/reconcile.ts
//
// The data-trust reconciliation writer (DAT-01, D-03). Run by `pnpm reconcile` and by the daily
// cron (scripts/ingest.ts calls runReconcile after a clean pull). The contract, in one breath:
//
//   load balances + transactions + v_pnl_monthly.costs (each carrying is_demo) ->
//   PARTITION by is_demo (real and demo rows are NEVER mixed — the marts.ts chokepoint discipline) ->
//   build per-partition ReconcileInputs: (a) balance DELTAS across consecutive balances snapshots
//   vs Σ booked transactions in that interval, and (b) each mart cost total vs the same total
//   recomputed directly from source rows -> feed the PURE reconcile() engine -> upsert the flags
//   into reconciliation_flags idempotently (clear the partition's OPEN flags + insert the fresh set
//   inside a transaction, so a re-run adds ZERO duplicate rows; 'resolved' flags are preserved).
//
// NEVER compares an absolute bank balance to Σ transactions — the ledger is go-forward-only with no
// opening anchor (RESEARCH Pitfall 1). DB WRITES use the `postgres` driver via DATABASE_URL (the
// project's Node-side write plane, mirroring scripts/ingest.ts createServiceWriter) — never the
// elevated Supabase service key in a bundle, never @supabase/supabase-js (its server-only import fails
// an RSC build). A direct DB connection runs as the connection role and bypasses RLS (the write
// plane the cron needs). SERVER-PLANE ONLY (FND-03): never imported into the Next app/client bundle.
// Logs ONLY counts/status (V7) — never a € amount, description, IBAN, key, or the connection string.

import {
  reconcile,
  type ReconcileFlag,
  type ReconcileInput,
} from "@/lib/reconcile/engine";

// Go-forward reconciliation window: never reconcile periods before the ingest start (D-14). Mirrors
// INGEST_START_DATE = "2026-06-01" as the YYYYMM period key 202606.
export const RECONCILE_START_PERIOD = 202606;

// ---------------------------------------------------------------------------
// Row shapes the writer loads (each carries is_demo for the partition split).
// ---------------------------------------------------------------------------

/** A balances snapshot row for one account/day. */
export interface BalanceRow {
  accountId: string;
  asOfDate: string; // YYYY-MM-DD
  balanceEur: number;
  isDemo: boolean;
}

/** A source transaction row (the ledger side of both checks). */
export interface TxRow {
  accountId: string;
  bookingDate: string; // YYYY-MM-DD
  amountEur: number; // signed
  flowType: string | null;
  costCenter: string | null;
  isDemo: boolean;
}

/** A mart cost total from v_pnl_monthly (one per period/partition). */
export interface MartCostRow {
  periodKey: number;
  costs: number;
  isDemo: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers (no I/O — the assembly logic is unit-testable like the engine).
// ---------------------------------------------------------------------------

/** Round a EUR magnitude to whole cents (kills float dust before the tolerance compare). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Coerce a date column (postgres.js may return a Date or a string) to a YYYY-MM-DD string. */
export function coerceDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** The YYYYMM period key for a YYYY-MM-DD booking/as-of date. */
export function periodKeyFromDate(date: string): number {
  return Number(date.slice(0, 4)) * 100 + Number(date.slice(5, 7));
}

/**
 * buildReconcileInputs — assemble the engine inputs for ONE is_demo partition (the caller passes
 * already-partitioned rows so real/demo are never mixed). Produces two disjoint input kinds:
 *   • balance_delta rows: one per consecutive (prev, curr) balances snapshot per account, with
 *     bankDeltaEur = curr − prev and ledgerDeltaEur = Σ tx.amount_eur in (prev.asOf, curr.asOf].
 *     martTotal/ledgerRecomputed are 0 so the engine's mart check is a no-op for these rows.
 *   • mart_vs_ledger rows: one per mart cost total, with martTotalEur = costs and ledgerRecomputedEur
 *     recomputed from source rows (Σ −amount_eur where flow_type='cost' and cost_center≠'sublocacao'
 *     for the period — the v_pnl_monthly.costs formula). bankDeltaEur = null so the balance check is
 *     skipped. accountId is "" (no owning account) → persisted as NULL.
 * Only periods ≥ RECONCILE_START_PERIOD are considered (go-forward window). Pure.
 */
export function buildReconcileInputs(
  balances: BalanceRow[],
  txs: TxRow[],
  marts: MartCostRow[],
): ReconcileInput[] {
  const inputs: ReconcileInput[] = [];

  // --- balance_delta: consecutive snapshot pairs per account ------------------------------------
  const byAccount = new Map<string, BalanceRow[]>();
  for (const b of balances) {
    const list = byAccount.get(b.accountId) ?? [];
    list.push(b);
    byAccount.set(b.accountId, list);
  }
  for (const [accountId, snaps] of byAccount) {
    const ordered = [...snaps].sort((a, b) => (a.asOfDate < b.asOfDate ? -1 : a.asOfDate > b.asOfDate ? 1 : 0));
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1];
      const curr = ordered[i];
      const periodKey = periodKeyFromDate(curr.asOfDate);
      if (periodKey < RECONCILE_START_PERIOD) continue;
      const bankDeltaEur = round2(curr.balanceEur - prev.balanceEur);
      const ledgerDeltaEur = round2(
        txs
          .filter(
            (t) =>
              t.accountId === accountId &&
              t.bookingDate > prev.asOfDate &&
              t.bookingDate <= curr.asOfDate,
          )
          .reduce((acc, t) => acc + t.amountEur, 0),
      );
      inputs.push({
        accountId,
        periodKey,
        bankDeltaEur,
        ledgerDeltaEur,
        martTotalEur: 0,
        ledgerRecomputedEur: 0,
        isDemo: curr.isDemo,
      });
    }
  }

  // --- mart_vs_ledger: mart cost total vs source recompute --------------------------------------
  for (const m of marts) {
    if (m.periodKey < RECONCILE_START_PERIOD) continue;
    const ledgerRecomputedEur = round2(
      txs
        .filter(
          (t) =>
            t.flowType === "cost" &&
            t.costCenter !== "sublocacao" &&
            periodKeyFromDate(t.bookingDate) === m.periodKey,
        )
        // v_pnl_monthly.costs sums -amount_eur (cost legs are stored as negative signed amounts).
        .reduce((acc, t) => acc + -t.amountEur, 0),
    );
    inputs.push({
      accountId: "", // no owning account for a mart-level flag → persisted as NULL
      periodKey: m.periodKey,
      bankDeltaEur: null, // skip the balance check for a mart row
      ledgerDeltaEur: 0,
      martTotalEur: round2(m.costs),
      ledgerRecomputedEur,
      isDemo: m.isDemo,
    });
  }

  return inputs;
}

// ---------------------------------------------------------------------------
// Injectable writer (mirrors scripts/ingest.ts IngestWriter). The default impl drives the postgres
// driver via DATABASE_URL; a test can inject an in-memory fake with no live DB.
// ---------------------------------------------------------------------------

export interface ReconcileWriter {
  /** All balances snapshots (each with is_demo), for the delta pairs. */
  loadBalances(): Promise<BalanceRow[]>;
  /** All source transactions (each with is_demo), for both ledger sides. */
  loadTransactions(): Promise<TxRow[]>;
  /** The v_pnl_monthly cost totals (each with is_demo), for the mart-vs-ledger check. */
  loadMartCosts(): Promise<MartCostRow[]>;
  /**
   * Idempotent per-partition upsert: inside a transaction, clear this partition's OPEN flags and
   * insert the fresh set ('resolved' flags are preserved). Returns the cleared + inserted counts.
   */
  replaceOpenFlags(
    isDemo: boolean,
    flags: ReconcileFlag[],
  ): Promise<{ cleared: number; inserted: number }>;
  /** Release the DB connection (postgres-driver writer). Optional for fakes. */
  close?(): Promise<void>;
}

/** The reconcile run summary (counts only — V7). */
export interface ReconcileResult {
  flagsWritten: number;
  cleared: number;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Load .env.local first: \`set -a; . ./.env.local; set +a\``,
    );
  }
  return v;
}

/**
 * Build the default postgres-driver writer (bypasses RLS — the write plane). Constructed lazily so
 * importing this module (e.g. a test) never touches DATABASE_URL. Never the elevated service key.
 */
export async function createReconcileWriter(): Promise<ReconcileWriter> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(requireEnv("DATABASE_URL"), { max: 1, onnotice: () => {} });
  return {
    async loadBalances() {
      const rows = await sql`
        select account_id, as_of_date, balance_eur, is_demo
        from balances`;
      return rows.map((r) => ({
        accountId: r.account_id as string,
        asOfDate: coerceDate(r.as_of_date),
        balanceEur: Number(r.balance_eur),
        isDemo: Boolean(r.is_demo),
      }));
    },
    async loadTransactions() {
      const rows = await sql`
        select account_id, booking_date, amount_eur, flow_type, cost_center, is_demo
        from transactions`;
      return rows.map((r) => ({
        accountId: r.account_id as string,
        bookingDate: coerceDate(r.booking_date),
        amountEur: Number(r.amount_eur),
        flowType: (r.flow_type as string | null) ?? null,
        costCenter: (r.cost_center as string | null) ?? null,
        isDemo: Boolean(r.is_demo),
      }));
    },
    async loadMartCosts() {
      const rows = await sql`
        select period_key, costs, is_demo
        from v_pnl_monthly
        where period_key >= ${RECONCILE_START_PERIOD}`;
      return rows.map((r) => ({
        periodKey: Number(r.period_key),
        costs: Number(r.costs),
        isDemo: Boolean(r.is_demo),
      }));
    },
    async replaceOpenFlags(isDemo, flags) {
      let cleared = 0;
      let inserted = 0;
      await sql.begin(async (tx) => {
        // Full daily recompute: drop the partition's OPEN flags, keep 'resolved' history.
        const del = await tx`
          delete from reconciliation_flags
          where status = 'open' and is_demo = ${isDemo}
          returning id`;
        cleared = del.length;
        for (const f of flags) {
          await tx`
            insert into reconciliation_flags
              (account_id, period_key, kind, expected_eur, actual_eur, delta_eur, status, is_demo)
            values
              (${f.accountId || null}, ${f.periodKey}, ${f.kind}, ${f.expectedEur},
               ${f.actualEur}, ${f.deltaEur}, 'open', ${isDemo})`;
          inserted += 1;
        }
      });
      return { cleared, inserted };
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

/**
 * runReconcile — the testable core. Loads rows, PARTITIONS by is_demo, runs the pure engine ONCE
 * per partition (real/demo never mixed), and idempotently upserts the flags. Returns counts only.
 */
export async function runReconcile(writer: ReconcileWriter): Promise<ReconcileResult> {
  const [balances, txs, marts] = await Promise.all([
    writer.loadBalances(),
    writer.loadTransactions(),
    writer.loadMartCosts(),
  ]);

  let flagsWritten = 0;
  let cleared = 0;
  // Two disjoint partitions — a real read never sees demo rows and vice-versa (T-07-05).
  for (const isDemo of [false, true]) {
    const inputs = buildReconcileInputs(
      balances.filter((b) => b.isDemo === isDemo),
      txs.filter((t) => t.isDemo === isDemo),
      marts.filter((m) => m.isDemo === isDemo),
    );
    const flags = reconcile(inputs);
    const res = await writer.replaceOpenFlags(isDemo, flags);
    flagsWritten += res.inserted;
    cleared += res.cleared;
  }

  // V7: counts/status only — never a € amount, account, or description.
  console.log(`[reconcile] flags=${flagsWritten} cleared=${cleared}`);
  return { flagsWritten, cleared };
}

// Only run when executed directly (`pnpm reconcile` / `tsx scripts/reconcile.ts`). When IMPORTED
// (by scripts/ingest.ts or a test) this must NOT auto-run. CJS `require.main === module` is the
// portable direct-run check (same convention as scripts/ingest.ts).
const invokedDirectly = typeof require !== "undefined" && require.main === module;

if (invokedDirectly) {
  (async () => {
    const writer = await createReconcileWriter();
    try {
      await runReconcile(writer);
    } finally {
      await writer.close?.();
    }
  })()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`[reconcile] fatal: ${err instanceof Error ? err.name : "UnknownError"}`);
      process.exit(1);
    });
}
