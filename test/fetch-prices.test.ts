import { describe, expect, it } from "vitest";

// Contract (ETF-01, D-07) — the DEGRADABLE ETF-close pull, proven against an INJECTED writer + an
// INJECTED close source, so the degrade→zod→upsert chain is exercised with NO live DB and NO network.
import { runFetchPrices, type PriceRow, type PriceWriter } from "../scripts/fetch-prices";
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
  it("degrades to a no-op (exit 0) when NO source is configured", async () => {
    const { writer, rows } = makeFakePriceWriter();
    // No fetchClose injected and no ETF_PRICE_SOURCE_URL env → the default adapter returns null.
    const result = await runFetchPrices({ writer });

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
