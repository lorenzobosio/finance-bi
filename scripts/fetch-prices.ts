// scripts/fetch-prices.ts
//
// The headless daily ETF-close pull (ETF-01, D-03/D-07). Run by `pnpm fetch-prices` and the daily
// GitHub Actions cron. SOURCE-AGNOSTIC + DEGRADABLE — the honest degrade is the whole point:
//
//   read a configurable free ETF-close source URL from a cron-plane env var (ETF_PRICE_SOURCE_URL);
//   IF unset OR the fetch/parse fails -> WRITE NOTHING and exit 0 (the app falls back to the seeded/
//   last-known price + the getGoalTotal cost basis — RESEARCH Pitfall 5). When a close IS obtained ->
//   zod-validate (close > 0 finite, ISO date) -> UPSERT public.prices ON CONFLICT (isin, price_date,
//   is_demo) DO UPDATE with is_demo = false, keyed by WEALTH_ISIN -> log ONLY counts/status.
//
// OWNER PENDENCY (D-07): no clean keyless ETF-close source for IE000716YHJ7 is wired yet. This script
// is deliberately source-agnostic so choosing the real feed later is a config change (set the env var
// + swap the tiny adapter) — NOT a code rewrite, and NEVER a blocker for the phase. Until then the pull
// is a no-op every run and the app degrades to the seeded/last-known price. Any source KEY (if a keyed
// source is later chosen) is a cron-plane secret ONLY — never a public/client-inlined env var, never
// logged.
//
// WRITE PLANE (FND-03): DB writes use the `postgres` driver via DATABASE_URL — the project's Node-side
// write plane (mirroring scripts/ingest.ts / scripts/fetch-fx.ts). It does NOT use the elevated
// Supabase service client (its `import "server-only"` throws outside an RSC build; the browser SDK opens
// a Realtime WebSocket Node 20 lacks). A direct DB connection bypasses RLS (the write plane the cron
// needs). SERVER-PLANE ONLY: never imported into the Next app/client bundle; never a public/client env.
//
// Logs ONLY counts/status (V7) — never the price, no source key, no connection string.

import { z } from "zod";

import { WEALTH_ISIN } from "@/lib/goal/constants";

// ---------------------------------------------------------------------------
// Untrusted-payload validation (T-12-12): a close must be a positive finite number on an ISO date,
// in a named currency, before any DB write. Defense-in-depth on top of the adapter's own guard.
// ---------------------------------------------------------------------------

const PriceCloseSchema = z.object({
  close: z
    .number()
    .positive()
    .refine((n) => Number.isFinite(n), "close must be finite"),
  priceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "price_date must be YYYY-MM-DD"),
  currency: z.string().min(1),
});

/** A validated ETF close for WEALTH_ISIN on one day. */
export type PriceClose = z.infer<typeof PriceCloseSchema>;

/** The row upserted into public.prices. */
export interface PriceRow extends PriceClose {
  isin: string;
}

// ---------------------------------------------------------------------------
// Injectable DB writer (mirrors scripts/fetch-fx.ts FxWriter). The default impl drives the postgres
// driver via DATABASE_URL; a contract test injects a thin in-memory fake (NO live DB).
// ---------------------------------------------------------------------------

export interface PriceWriter {
  /** Upsert one price ON CONFLICT (isin, price_date, is_demo) DO UPDATE. Returns rows written (0/1). */
  upsertPrice(row: PriceRow): Promise<number>;
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
 * importing this module (e.g. a test, or the no-source degrade path) never touches DATABASE_URL.
 */
export async function createPriceWriter(): Promise<PriceWriter> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(requireEnv("DATABASE_URL"), { max: 1, onnotice: () => {} });
  return {
    async upsertPrice(row) {
      // is_demo = false — the real partition. ON CONFLICT rewrites the same (isin, date) row so a
      // re-pull is idempotent (the UNIQUE(isin, price_date, is_demo) key is the safety net).
      const res = await sql`
        insert into prices (isin, price_date, close, currency, is_demo)
        values (${row.isin}, ${row.priceDate}, ${row.close}, ${row.currency}, false)
        on conflict (isin, price_date, is_demo)
        do update set close = excluded.close, currency = excluded.currency
        returning id`;
      return res.length > 0 ? 1 : 0;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

// ---------------------------------------------------------------------------
// Source adapter (DEGRADABLE, D-07). Reads a configurable source URL from the cron-plane env var and
// parses one close. This is a PLACEHOLDER generic JSON adapter (`{ close, date?, currency? }`) — swap
// it for the real free ETF-close parser once a source is chosen (OWNER PENDENCY). It NEVER throws to
// the caller for a source problem: an unset URL / non-2xx / unparseable body all return null so the
// pull degrades to a no-op. Any source KEY belongs in a cron-plane secret, never inlined/logged here.
// ---------------------------------------------------------------------------

async function defaultFetchClose(): Promise<PriceClose | null> {
  const sourceUrl = process.env.ETF_PRICE_SOURCE_URL;
  if (!sourceUrl || sourceUrl.trim() === "") return null; // no source configured → degrade (D-07)

  const res = await fetch(sourceUrl);
  if (!res.ok) return null; // upstream error → degrade, write nothing

  const json = (await res.json()) as Record<string, unknown>;
  const close = Number(json?.close);
  if (!Number.isFinite(close) || close <= 0) return null; // no usable close → degrade
  const priceDate =
    typeof json?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.date)
      ? json.date
      : new Date().toISOString().slice(0, 10);
  const currency = typeof json?.currency === "string" && json.currency ? json.currency : "USD";
  return { close, priceDate, currency };
}

// ---------------------------------------------------------------------------
// runFetchPrices — the testable core. Options let a contract test inject the writer + the close source
// (NO live DB, NO network). The default path reads ETF_PRICE_SOURCE_URL and builds the postgres writer.
// ---------------------------------------------------------------------------

export interface RunFetchPricesOptions {
  /** Inject the DB writer (the test passes an in-memory fake). */
  writer?: PriceWriter;
  /**
   * Inject the close source (the test passes a fake). Return `null` to model an absent/unavailable
   * source (the degrade path); a raw object is zod-validated by the core. A throw is caught + degraded.
   */
  fetchClose?: () => Promise<unknown | null>;
}

export interface RunFetchPricesResult {
  /** `success` = a close was written; `degraded` = no source / unavailable / invalid (no-op); `error` = DB fault. */
  status: "success" | "degraded" | "error";
  upserted: number;
  exitCode: 0 | 1;
}

export async function runFetchPrices(
  opts: RunFetchPricesOptions = {},
): Promise<RunFetchPricesResult> {
  const ownWriter = !opts.writer;
  let writer = opts.writer;

  // --- Phase 1: obtain + validate a close (SOFT — no source / any failure → no-op, exit 0) -------
  let raw: unknown | null = null;
  try {
    raw = opts.fetchClose ? await opts.fetchClose() : await defaultFetchClose();
  } catch {
    raw = null; // degrade honestly on any source-side failure (D-07)
  }

  if (raw == null) {
    console.log(`[fetch-prices] status=degraded reason=no-source upserted=0 exit=0`);
    return { status: "degraded", upserted: 0, exitCode: 0 };
  }

  const parsed = PriceCloseSchema.safeParse(raw);
  if (!parsed.success) {
    // A reachable-but-malformed source is still a degrade, never a crash (T-12-12).
    console.log(`[fetch-prices] status=degraded reason=invalid upserted=0 exit=0`);
    return { status: "degraded", upserted: 0, exitCode: 0 };
  }

  // --- Phase 2: DB upsert (HARD — a transient DB error exits 1) ----------------------------------
  try {
    if (!writer) writer = await createPriceWriter();
    const upserted = await writer.upsertPrice({ isin: WEALTH_ISIN, ...parsed.data });
    console.log(`[fetch-prices] status=success upserted=${upserted} exit=0`);
    return { status: "success", upserted, exitCode: 0 };
  } catch (e) {
    console.log(
      `[fetch-prices] status=error reason=${e instanceof Error ? e.name : "UnknownError"} exit=1`,
    );
    return { status: "error", upserted: 0, exitCode: 1 };
  } finally {
    if (ownWriter) await writer?.close?.();
  }
}

// Only run when executed directly (`pnpm fetch-prices` / `tsx scripts/fetch-prices.ts`). When
// IMPORTED (by a test) this must NOT auto-run. CJS `require.main === module` is the portable
// direct-run check (same convention as scripts/ingest.ts / scripts/fetch-fx.ts).
const invokedDirectly = typeof require !== "undefined" && require.main === module;

if (invokedDirectly) {
  runFetchPrices()
    .then((r) => process.exit(r.exitCode))
    .catch((err) => {
      console.error(`[fetch-prices] fatal: ${err instanceof Error ? err.name : "UnknownError"}`);
      process.exit(1);
    });
}
