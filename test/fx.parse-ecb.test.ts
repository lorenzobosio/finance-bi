import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (ETF-03 / BRL-01, D-01) — freezes the ECB-feed parse contract for the not-yet-
// existent PURE engine `@/lib/fx/parse-ecb.ts` (built GREEN in a later Phase-12 plan). RED at RUNTIME
// only ("Cannot find package '@/lib/fx/parse-ecb'"); the COMPUTED import specifier keeps
// `tsc --noEmit` green while the module is absent (the 11-01/10-01/08-01 idiom).
//
// `parseEcbRates(xml)` extracts the `time` date + each `<Cube currency rate/>`, keeping ONLY the
// requested quotes (USD + BRL), and returns quote-per-EUR rows (A5: EUR/USD=1.1405 ⇒ 1 EUR = 1.1405
// USD, stored as-is). A currency ABSENT from the XML is skipped (never emitted with a null rate). An
// empty/malformed feed returns `[]` — fail-soft, NEVER throws (Pitfall 6: a fetch/parse failure keeps
// the last-known row, it does not crash the cron). Synthetic fixture only; no PII, no secret.

const MODULE = "@/lib/fx/parse-ecb";
const ROOT = join(__dirname, "..");

interface FxRow {
  base: string; // "EUR"
  quote: string; // "USD" | "BRL"
  rateDate: string; // "2026-07-14"
  rate: number; // quote-per-EUR
}

interface ParseModule {
  parseEcbRates: (xml: string, quotes?: readonly string[]) => FxRow[];
}

async function load(): Promise<ParseModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return { parseEcbRates: mod.parseEcbRates as ParseModule["parseEcbRates"] };
}

const FIXTURE = readFileSync(join(ROOT, "test/fixtures/eurofxref-daily.xml"), "utf8");

describe("parseEcbRates — extracts the requested quotes from the real-shape feed (ETF-03/BRL-01)", () => {
  it("returns the EUR/USD row (quote-per-EUR, A5)", async () => {
    const { parseEcbRates } = await load();
    const rows = parseEcbRates(FIXTURE, ["USD", "BRL"]);
    const usd = rows.find((r) => r.quote === "USD");
    expect(usd).toEqual({ base: "EUR", quote: "USD", rateDate: "2026-07-14", rate: 1.1405 });
  });

  it("returns the EUR/BRL row (the verified BRL presence, rate 5.8431)", async () => {
    const { parseEcbRates } = await load();
    const rows = parseEcbRates(FIXTURE, ["USD", "BRL"]);
    const brl = rows.find((r) => r.quote === "BRL");
    expect(brl).toEqual({ base: "EUR", quote: "BRL", rateDate: "2026-07-14", rate: 5.8431 });
  });

  it("SELECTS only the requested quotes — it does NOT take-all the 4 fixture currencies", async () => {
    const { parseEcbRates } = await load();
    const rows = parseEcbRates(FIXTURE, ["USD", "BRL"]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.quote))).toEqual(new Set(["USD", "BRL"]));
    // GBP + JPY are present in the XML but NOT requested — never leak into the result.
    expect(rows.some((r) => r.quote === "GBP" || r.quote === "JPY")).toBe(false);
  });

  it("skips a requested currency that is ABSENT from the XML (no null-rate row)", async () => {
    const { parseEcbRates } = await load();
    // CHF is not in the fixture — it must be silently skipped, never emitted with a null rate.
    const rows = parseEcbRates(FIXTURE, ["USD", "CHF"]);
    expect(rows.some((r) => r.quote === "CHF")).toBe(false);
    expect(rows.map((r) => r.quote)).toEqual(["USD"]);
  });
});

describe("parseEcbRates — fail-soft on empty/malformed feed (Pitfall 6, NEVER throws)", () => {
  it("returns [] for an empty string", async () => {
    const { parseEcbRates } = await load();
    expect(parseEcbRates("", ["USD", "BRL"])).toEqual([]);
  });

  it("returns [] for malformed XML (no time, no Cubes) instead of throwing", async () => {
    const { parseEcbRates } = await load();
    expect(() => parseEcbRates("<not-a-feed/>", ["USD", "BRL"])).not.toThrow();
    expect(parseEcbRates("<not-a-feed/>", ["USD", "BRL"])).toEqual([]);
  });
});
