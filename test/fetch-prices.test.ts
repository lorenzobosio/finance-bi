import { describe, expect, it } from "vitest";

// Contract (ETF-01, D-07) — the DEGRADABLE ETF-close pull, proven against an INJECTED writer + an
// INJECTED close source, so the degrade→zod→upsert chain is exercised with NO live DB and NO network.
import {
  parseTwelveDataQuote,
  parseYahooChart,
  runFetchPrices,
  type PriceRow,
  type PriceWriter,
} from "../scripts/fetch-prices";
import { WEALTH_ISIN } from "@/lib/goal/constants";

function makeFakePriceWriter() {
  const rows: PriceRow[] = [];
  const writer: PriceWriter = {
    async upsertPrice(row) {
      rows.push(row);
      return 1;
    },
  };
  return { writer, rows };
}

describe("fetch-prices is source-agnostic + degradable (ETF-01, D-07)", () => {
  it("degrades to a no-op (exit 0) when the source yields no close (null)", async () => {
    const { writer, rows } = makeFakePriceWriter();
    // Inject an explicit null source (the default adapter is now a live Yahoo fetch, so we model the
    // "source unavailable / unparseable" degrade deterministically instead of relying on env absence).
    const result = await runFetchPrices({ writer, fetchClose: async () => null });

    expect(result.status).toBe("degraded");
    expect(result.upserted).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("upserts a valid close keyed by WEALTH_ISIN (is_demo=false) when a source is present", async () => {
    const { writer, rows } = makeFakePriceWriter();
    const result = await runFetchPrices({
      writer,
      fetchClose: async () => ({ close: 12.34, priceDate: "2026-07-14", currency: "USD" }),
    });

    expect(result.status).toBe("success");
    expect(result.upserted).toBe(1);
    expect(result.exitCode).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].isin).toBe(WEALTH_ISIN);
    expect(rows[0].close).toBe(12.34);
  });

  it("degrades (exit 0) when the source throws — never crashes the cron", async () => {
    const { writer, rows } = makeFakePriceWriter();
    const result = await runFetchPrices({
      writer,
      fetchClose: async () => {
        throw new Error("source 503");
      },
    });

    expect(result.status).toBe("degraded");
    expect(result.exitCode).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("degrades (exit 0) on an invalid close (<= 0) — writes nothing", async () => {
    const { writer, rows } = makeFakePriceWriter();
    const result = await runFetchPrices({
      writer,
      fetchClose: async () => ({ close: -1, priceDate: "2026-07-14", currency: "USD" }),
    });

    expect(result.status).toBe("degraded");
    expect(result.exitCode).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("exits 1 on a transient DB error (the hard-failure path)", async () => {
    const writer: PriceWriter = {
      async upsertPrice() {
        throw new Error("connection reset");
      },
    };
    const result = await runFetchPrices({
      writer,
      fetchClose: async () => ({ close: 10, priceDate: "2026-07-14", currency: "USD" }),
    });

    expect(result.status).toBe("error");
    expect(result.exitCode).toBe(1);
  });
});

// The Twelve Data /quote parser (pure) — fixtures only, no network. Twelve Data returns `close` as a
// STRING, a date in `datetime`, the quote `currency`, and a `{ status: "error" }` / `{ code }` envelope
// on failure; all must degrade to null (never throw) so the pull no-ops honestly.
describe("parseTwelveDataQuote — Twelve Data /quote → validated close (ETF-01)", () => {
  it("parses a valid quote (string close + datetime + currency)", () => {
    const got = parseTwelveDataQuote({
      symbol: "FWRA",
      exchange: "XETR",
      currency: "EUR",
      datetime: "2026-07-14",
      close: "123.45",
    });
    expect(got).toEqual({ close: 123.45, priceDate: "2026-07-14", currency: "EUR" });
  });

  it("slices an intraday datetime to YYYY-MM-DD", () => {
    const got = parseTwelveDataQuote({ close: "10.5", datetime: "2026-07-14 15:30:00", currency: "USD" });
    expect(got?.priceDate).toBe("2026-07-14");
  });

  it("returns null on the Twelve Data error envelope (bad symbol / quota)", () => {
    expect(parseTwelveDataQuote({ code: 404, message: "symbol not found", status: "error" })).toBeNull();
    expect(parseTwelveDataQuote({ status: "error", message: "run out of API credits" })).toBeNull();
  });

  it("returns null on a missing / non-positive / non-numeric close", () => {
    expect(parseTwelveDataQuote({ currency: "EUR", datetime: "2026-07-14" })).toBeNull();
    expect(parseTwelveDataQuote({ close: "0" })).toBeNull();
    expect(parseTwelveDataQuote({ close: "-3.2" })).toBeNull();
    expect(parseTwelveDataQuote({ close: "n/a" })).toBeNull();
    expect(parseTwelveDataQuote(null)).toBeNull();
    expect(parseTwelveDataQuote("not an object")).toBeNull();
  });
});

// The Yahoo Finance /v8/finance/chart parser (pure, the DEFAULT source) — fixtures only, no network.
describe("parseYahooChart — Yahoo chart → validated close (ETF-01, default source)", () => {
  const chart = (meta: Record<string, unknown>) => ({ chart: { result: [{ meta }], error: null } });

  const T_2026_07_15 = Math.floor(Date.UTC(2026, 6, 15) / 1000); // month is 0-indexed

  it("parses a valid chart meta (regularMarketPrice + currency + unix time)", () => {
    const got = parseYahooChart(
      chart({ regularMarketPrice: 8.173, currency: "EUR", regularMarketTime: T_2026_07_15 }),
    );
    expect(got).toEqual({ close: 8.173, priceDate: "2026-07-15", currency: "EUR" });
  });

  it("falls back to chartPreviousClose when regularMarketPrice is absent", () => {
    const got = parseYahooChart(
      chart({ chartPreviousClose: 9.19, currency: "USD", regularMarketTime: T_2026_07_15 }),
    );
    expect(got).toEqual({ close: 9.19, priceDate: "2026-07-15", currency: "USD" });
  });

  it("returns null on Yahoo's error envelope / missing meta / bad price", () => {
    expect(parseYahooChart({ chart: { result: null, error: { code: "Not Found" } } })).toBeNull();
    expect(parseYahooChart({ chart: { result: [{}] } })).toBeNull();
    expect(parseYahooChart(chart({ regularMarketPrice: 0, currency: "EUR" }))).toBeNull();
    expect(parseYahooChart(null)).toBeNull();
  });
});
