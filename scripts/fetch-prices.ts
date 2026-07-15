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
// SOURCE (D-07): three configured paths, in precedence order —
//   1) ETF_PRICE_SOURCE_URL — any endpoint returning `{ close, date?, currency? }` (explicit override).
//   2) ETF_PRICE_SOURCE=twelvedata + TWELVEDATA_API_KEY — Twelve Data /quote (opt-in; NOTE its FREE tier
//      does NOT cover FWRA's European/UK listings — needs a paid plan).
//   3) DEFAULT — Yahoo Finance /v8/finance/chart (FREE, NO key, covers FWRA's European listings). Zero-
//      config: the WEALTH ETF defaults to its Xetra EUR listing FWIA.DE (override via ETF_PRICE_SYMBOL,
//      e.g. FWRA.L for the USD primary — converted to EUR via fx_rates on read).
// Any failure (unreachable/rate-limited/unparseable) returns null → the pull no-ops and the app degrades
// to the seeded/last-known price + cost basis (never a blocker). Any source KEY is a cron-plane secret
// ONLY — read from env, never a public/client-inlined env var, never logged.
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
// Source adapters (DEGRADABLE, D-07). Two configured paths, both keyed off cron-plane env vars; either
// returns null (never throws) so an unset/failed source degrades to a no-op:
//   1) TWELVE DATA (preferred, free tier) — set TWELVEDATA_API_KEY. Symbol/exchange default to the
//      WEALTH ETF's Xetra listing (FWRA / XETR) and are overridable via ETF_PRICE_SYMBOL /
//      ETF_PRICE_EXCHANGE. The KEY is a cron-plane SECRET — read from env, NEVER inlined/logged.
//   2) GENERIC URL — set ETF_PRICE_SOURCE_URL to any endpoint returning `{ close, date?, currency? }`.
// Neither configured → null (the seeded/last-known price + cost-basis fallback holds).
// ---------------------------------------------------------------------------

/**
 * Pure parse of a Twelve Data `/quote` payload → a validated-shape close, or null. Handles the string
 * `close` Twelve Data returns, its `{ status: "error" }` / `{ code }` error envelope, and the `datetime`
 * date field. PURE (no fetch/env) so a fixture test can exercise every branch. NEVER throws.
 */
export function parseTwelveDataQuote(json: unknown): PriceClose | null {
  if (json === null || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (o.status === "error" || typeof o.code === "number") return null; // Twelve Data error envelope
  const close = Number(o.close);
  if (!Number.isFinite(close) || close <= 0) return null;
  const dt = typeof o.datetime === "string" ? o.datetime.slice(0, 10) : "";
  const priceDate = /^\d{4}-\d{2}-\d{2}$/.test(dt) ? dt : new Date().toISOString().slice(0, 10);
  const currency = typeof o.currency === "string" && o.currency ? o.currency : "USD";
  return { close, priceDate, currency };
}

async function fetchTwelveDataClose(apiKey: string): Promise<PriceClose | null> {
  const symbol = process.env.ETF_PRICE_SYMBOL?.trim() || "FWRA";
  const exchange = process.env.ETF_PRICE_EXCHANGE?.trim() || "XETR";
  const url =
    `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}` +
    `&exchange=${encodeURIComponent(exchange)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) return null; // upstream/quota error → degrade, write nothing
  return parseTwelveDataQuote(await res.json());
}

async function fetchGenericClose(sourceUrl: string): Promise<PriceClose | null> {
  const res = await fetch(sourceUrl);
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, unknown>;
  const close = Number(json?.close);
  if (!Number.isFinite(close) || close <= 0) return null;
  const priceDate =
    typeof json?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.date)
      ? json.date
      : new Date().toISOString().slice(0, 10);
  const currency = typeof json?.currency === "string" && json.currency ? json.currency : "USD";
  return { close, priceDate, currency };
}

/**
 * Pure parse of a Yahoo Finance `/v8/finance/chart` payload → a validated-shape close, or null. Reads
 * `chart.result[0].meta.regularMarketPrice` (falling back to `chartPreviousClose`), the quote `currency`,
 * and `regularMarketTime` (unix seconds) for the date. Handles Yahoo's `chart.error` envelope. PURE
 * (no fetch/env) so a fixture test exercises every branch. NEVER throws.
 */
export function parseYahooChart(json: unknown): PriceClose | null {
  if (json === null || typeof json !== "object") return null;
  const meta = (json as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } }).chart
    ?.result?.[0]?.meta;
  if (!meta || typeof meta !== "object") return null;
  const close = Number(meta.regularMarketPrice ?? meta.chartPreviousClose);
  if (!Number.isFinite(close) || close <= 0) return null;
  const t = Number(meta.regularMarketTime);
  const priceDate =
    Number.isFinite(t) && t > 0
      ? new Date(t * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const currency = typeof meta.currency === "string" && meta.currency ? meta.currency : "EUR";
  return { close, priceDate, currency };
}

async function fetchYahooClose(): Promise<PriceClose | null> {
  // Default = the WEALTH ETF's Xetra (EUR) listing FWIA.DE — EUR, so the headline needs no FX; override
  // via ETF_PRICE_SYMBOL (e.g. FWRA.L for the USD primary, converted via fx_rates). No key required.
  const symbol = process.env.ETF_PRICE_SYMBOL?.trim() || "FWIA.DE";
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null; // upstream/rate-limit → degrade, write nothing
  return parseYahooChart(await res.json());
}

async function defaultFetchClose(): Promise<PriceClose | null> {
  // Explicit generic URL wins (any endpoint returning `{ close, date?, currency? }`).
  const sourceUrl = process.env.ETF_PRICE_SOURCE_URL?.trim();
  if (sourceUrl) return fetchGenericClose(sourceUrl);

  // Opt-in Twelve Data (needs a PAID plan for FWRA's European/UK listings — free tier does NOT cover it).
  if (process.env.ETF_PRICE_SOURCE?.trim().toLowerCase() === "twelvedata") {
    const twelveKey = process.env.TWELVEDATA_API_KEY?.trim();
    return twelveKey ? fetchTwelveDataClose(twelveKey) : null;
  }

  // DEFAULT — Yahoo Finance chart (free, NO key, covers FWRA's European listings). Zero-config live
  // price; degrades to a no-op (seeded/last-known price + cost basis) if Yahoo is unreachable.
  return fetchYahooClose();
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
