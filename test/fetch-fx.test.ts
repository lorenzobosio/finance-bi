import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Contract (ETF-03) — the ECB daily FX pull, proven against an INJECTED in-memory writer + an
// INJECTED XML source, so the fetch→parse→zod→upsert→fail-soft chain is exercised with NO live DB
// and NO network. Mirrors test/ingest.heartbeat.test.ts (runIngest + fake writer).
import { runFetchFx, type FxRateRow, type FxWriter } from "../scripts/fetch-fx";

const FIXTURE = readFileSync(
  fileURLToPath(new URL("./fixtures/eurofxref-daily.xml", import.meta.url)),
  "utf8",
);

function makeFakeFxWriter() {
  const rows: FxRateRow[] = [];
  const writer: FxWriter = {
    async upsertRates(input) {
      rows.push(...input);
      return input.length;
    },
  };
  return { writer, rows };
}

describe("fetch-fx pulls the ECB feed and upserts real EUR/USD + EUR/BRL rates (ETF-03)", () => {
  it("parses the ECB fixture, validates, and upserts exactly USD + BRL (is_demo=false)", async () => {
    const { writer, rows } = makeFakeFxWriter();
    const result = await runFetchFx({ writer, fetchXml: async () => FIXTURE });

    expect(result.status).toBe("success");
    expect(result.fetched).toBe(2);
    expect(result.upserted).toBe(2);
    expect(result.exitCode).toBe(0);

    // Only the two requested quotes are written (JPY/GBP in the feed are ignored), each EUR-based.
    const quotes = rows.map((r) => r.quote).sort();
    expect(quotes).toEqual(["BRL", "USD"]);
    expect(rows.every((r) => r.base === "EUR")).toBe(true);
    expect(rows.every((r) => r.rate > 0)).toBe(true);
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.rateDate))).toBe(true);
  });

  it("fails soft (writes nothing, exit 0) when the feed fetch throws", async () => {
    const { writer, rows } = makeFakeFxWriter();
    const result = await runFetchFx({
      writer,
      fetchXml: async () => {
        throw new Error("network down");
      },
    });

    expect(result.status).toBe("empty");
    expect(result.upserted).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("fails soft (empty, exit 0) on malformed XML — keeps the last-known row", async () => {
    const { writer, rows } = makeFakeFxWriter();
    const result = await runFetchFx({ writer, fetchXml: async () => "<not-ecb/>" });

    expect(result.status).toBe("empty");
    expect(result.upserted).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("exits 1 on a transient DB error (the hard-failure path)", async () => {
    const writer: FxWriter = {
      async upsertRates() {
        throw new Error("connection reset");
      },
    };
    const result = await runFetchFx({ writer, fetchXml: async () => FIXTURE });

    expect(result.status).toBe("error");
    expect(result.exitCode).toBe(1);
  });
});
