// scripts/fetch-fx.ts
//
// The headless daily FX pull (ETF-03 / BRL-01, D-01). Run by `pnpm fetch-fx` and the daily
// GitHub Actions cron. The contract, in one breath:
//
//   GET the FREE keyless ECB reference feed (eurofxref-daily.xml, Node 20 global fetch, HTTPS,
//   no key) -> parseEcbRates(xml) (the zero-dep 12-03 parser -> quote-per-EUR rows, USD+BRL) ->
//   zod-validate each row (base 'EUR', quote ∈ {USD,BRL}, ISO rate_date, rate > 0 finite) ->
//   UPSERT public.fx_rates ON CONFLICT (base, quote, rate_date, is_demo) DO UPDATE SET rate =
//   excluded.rate, is_demo = false (idempotent — a re-pull rewrites the same (pair,date) row) ->
//   log ONLY counts/status.
//
// FAIL-SOFT (D-01 / RESEARCH Pitfall 6): a fetch or parse failure WRITES NOTHING and keeps the
// last-known fx_rates row — the app's latestRate() falls back to it. The feed layer is SOFT
// (network/parse error -> exit 0, never a red cron); only a transient DB error on the upsert
// exits 1. Mirrors scripts/ingest.ts's soft-vs-hard split.
//
// WRITE PLANE (FND-03): DB writes use the `postgres` driver via DATABASE_URL — the project's
// Node-side write plane (mirroring scripts/ingest.ts createServiceWriter). It does NOT use the
// elevated Supabase service client (its `import "server-only"` throws outside an RSC build and the
// supabase-js browser SDK eagerly opens a Realtime WebSocket Node 20 lacks). A direct DB connection
// runs as the connection role and bypasses RLS (the write plane the cron needs). SERVER-PLANE ONLY:
// never imported into the Next app/client bundle; never a public/client-inlined env var.
//
// Logs ONLY counts/status (V7) — never the rates, no key, no JWT, no connection string.

import { z } from "zod";

import { parseEcbRates } from "@/lib/fx/parse-ecb";

/** The FREE, keyless ECB daily reference-rate feed (HTTPS only — V9). */
export const ECB_DAILY_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/** The quotes the app persists (Fernanda's BRL remittance + the USD ETF valuation). */
const QUOTES = ["USD", "BRL"] as const;

// ---------------------------------------------------------------------------
// Untrusted-payload validation (T-12-12). parseEcbRates already guards finite/positive, but the
// zod re-validation is the defense-in-depth boundary before any DB write: base is EUR, the quote
// is one we asked for, the date is ISO, and the rate is a positive finite number.
// ---------------------------------------------------------------------------

const FxRowSchema = z.object({
  base: z.literal("EUR"),
  quote: z.enum(QUOTES),
  rateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "rate_date must be YYYY-MM-DD"),
  rate: z
    .number()
    .positive()
    .refine((n) => Number.isFinite(n), "rate must be finite"),
});

/** A validated reference-rate row ready to upsert (quote-per-EUR, A5). */
export type FxRateRow = z.infer<typeof FxRowSchema>;

// ---------------------------------------------------------------------------
// Injectable DB writer (mirrors scripts/ingest.ts IngestWriter). The default impl drives the
// postgres driver via DATABASE_URL; a contract test injects a thin in-memory fake (NO live DB).
// ---------------------------------------------------------------------------

export interface FxWriter {
  /** Upsert rates ON CONFLICT (base, quote, rate_date, is_demo) DO UPDATE. Returns rows written. */
  upsertRates(rows: FxRateRow[]): Promise<number>;
  /** Release the DB connection (postgres-driver writer). Optional for fakes. */
  close?(): Promise<void>;
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
export async function createFxWriter(): Promise<FxWriter> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(requireEnv("DATABASE_URL"), { max: 1, onnotice: () => {} });
  return {
    async upsertRates(rows) {
      let upserted = 0;
      for (const r of rows) {
        // is_demo = false — the real partition. ON CONFLICT rewrites the same (pair, date) row so a
        // re-pull is idempotent (the UNIQUE(base, quote, rate_date, is_demo) key is the safety net).
        const res = await sql`
          insert into fx_rates (base, quote, rate_date, rate, is_demo)
          values (${r.base}, ${r.quote}, ${r.rateDate}, ${r.rate}, false)
          on conflict (base, quote, rate_date, is_demo)
          do update set rate = excluded.rate
          returning id`;
        if (res.length > 0) upserted += 1;
      }
      return upserted;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

// ---------------------------------------------------------------------------
// Injectable fetch layer — a test injects the XML without a network call.
// ---------------------------------------------------------------------------

/** Fetch the raw ECB XML (HTTPS, keyless). Throws on a non-2xx / network error (soft-handled below). */
async function defaultFetchXml(): Promise<string> {
  const res = await fetch(ECB_DAILY_URL);
  if (!res.ok) throw new Error(`ECB feed HTTP ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// runFetchFx — the testable core. Options let a contract test inject the writer + the XML source
// (NO live DB, NO network). The default path fetches the live feed and builds the postgres writer.
// ---------------------------------------------------------------------------

export interface RunFetchFxOptions {
  /** Inject the DB writer (the test passes an in-memory fake). */
  writer?: FxWriter;
  /** Inject the XML source (the test passes a fixture; a throw exercises the soft-fail path). */
  fetchXml?: () => Promise<string>;
}

export interface RunFetchFxResult {
  status: "success" | "empty" | "error";
  /** Rows that parsed + validated (candidates for upsert). */
  fetched: number;
  /** Rows actually written. */
  upserted: number;
  exitCode: 0 | 1;
}

export async function runFetchFx(opts: RunFetchFxOptions = {}): Promise<RunFetchFxResult> {
  const ownWriter = !opts.writer;
  let writer = opts.writer;

  // --- Phase 1: fetch + parse + validate (SOFT — any failure writes NOTHING and exits 0) --------
  const rows: FxRateRow[] = [];
  try {
    const xml = opts.fetchXml ? await opts.fetchXml() : await defaultFetchXml();
    // parseEcbRates never throws — it fails soft to [] on empty/malformed/no-time XML.
    for (const raw of parseEcbRates(xml, QUOTES)) {
      const parsed = FxRowSchema.safeParse(raw);
      if (parsed.success) rows.push(parsed.data);
    }
  } catch (e) {
    // Network/parse soft failure — keep the last-known rows, write nothing, exit 0 (never red).
    console.log(
      `[fetch-fx] status=soft-skip reason=${e instanceof Error ? e.name : "UnknownError"} upserted=0 exit=0`,
    );
    return { status: "empty", fetched: 0, upserted: 0, exitCode: 0 };
  }

  if (rows.length === 0) {
    // Feed reachable but carried no USD/BRL row — nothing to write, keep last-known, exit 0.
    console.log(`[fetch-fx] status=empty fetched=0 upserted=0 exit=0`);
    return { status: "empty", fetched: 0, upserted: 0, exitCode: 0 };
  }

  // --- Phase 2: DB upsert (HARD — a transient DB error exits 1) ----------------------------------
  try {
    if (!writer) writer = await createFxWriter();
    const upserted = await writer.upsertRates(rows);
    console.log(`[fetch-fx] status=success fetched=${rows.length} upserted=${upserted} exit=0`);
    return { status: "success", fetched: rows.length, upserted, exitCode: 0 };
  } catch (e) {
    console.log(
      `[fetch-fx] status=error reason=${e instanceof Error ? e.name : "UnknownError"} exit=1`,
    );
    return { status: "error", fetched: rows.length, upserted: 0, exitCode: 1 };
  } finally {
    if (ownWriter) await writer?.close?.();
  }
}

// Only run when executed directly (`pnpm fetch-fx` / `tsx scripts/fetch-fx.ts`). When IMPORTED
// (by a test) this must NOT auto-run. CJS `require.main === module` is the portable direct-run
// check (same convention as scripts/ingest.ts / scripts/reconcile.ts).
const invokedDirectly = typeof require !== "undefined" && require.main === module;

if (invokedDirectly) {
  runFetchFx()
    .then((r) => process.exit(r.exitCode))
    .catch((err) => {
      console.error(`[fetch-fx] fatal: ${err instanceof Error ? err.name : "UnknownError"}`);
      process.exit(1);
    });
}
