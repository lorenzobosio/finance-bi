import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (ETF-03 / BRL-01, D-02) — freezes the pure conversion + remittance contract for the
// not-yet-existent PURE engine `@/lib/fx/convert.ts` (built GREEN in a later Phase-12 plan). RED at
// RUNTIME only ("Cannot find package '@/lib/fx/convert'"); the COMPUTED import specifier keeps
// `tsc --noEmit` green while the module is absent (the 11-01/10-01/08-01 idiom).
//
// The ECB rate is quote-per-EUR (A5): EUR/USD=1.1405 ⇒ €X becomes X·1.1405 USD, so `convert(eur, rate)
// = eur * rate` (NEVER eur / rate — inverting would 1/x the conversion). `latestRate(rows, quote)`
// selects the NEWEST rate_date (falling back to the last-known when today's publish is absent —
// weekends/holidays repeat the last business-day rate, Pitfall 6). The remittance view-model carries
// its rate + as-of date so no converted figure is ever shown without its provenance (UI-SPEC §4). All
// engine outputs COERCE FINITE — NaN/±∞ inputs never produce a NaN money figure (momentum/projection
// `finite()` discipline). Synthetic € only; no PII.

const MODULE = "@/lib/fx/convert";
const TOL = 1e-6;

interface FxRow {
  base: string;
  quote: string;
  rateDate: string; // YYYY-MM-DD
  rate: number; // quote-per-EUR
}

interface RemittanceView {
  eur: number;
  brl: number;
  rate: number;
  rateDate: string;
}

interface ConvertModule {
  convert: (amountEur: number, rate: number) => number;
  toUSD: (amountEur: number, rate: number) => number;
  toBRL: (amountEur: number, rate: number) => number;
  latestRate: (rows: FxRow[], quote: string) => FxRow | null;
  remittanceView: (amountEur: number, latestBrl: FxRow | null) => RemittanceView | null;
}

async function load(): Promise<ConvertModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return {
    convert: mod.convert as ConvertModule["convert"],
    toUSD: mod.toUSD as ConvertModule["toUSD"],
    toBRL: mod.toBRL as ConvertModule["toBRL"],
    latestRate: mod.latestRate as ConvertModule["latestRate"],
    remittanceView: mod.remittanceView as ConvertModule["remittanceView"],
  };
}

describe("convert — eur * rate, quote-per-EUR (A5)", () => {
  it("converts EUR→USD by multiplying (1000 € × 1.1405 = 1140.50 USD)", async () => {
    const { convert } = await load();
    expect(convert(1000, 1.1405)).toBeCloseTo(1140.5, 6);
  });

  it("toUSD / toBRL are the same multiply, semantically named", async () => {
    const { toUSD, toBRL } = await load();
    expect(toUSD(1000, 1.1405)).toBeCloseTo(1140.5, 6);
    expect(toBRL(1000, 5.8431)).toBeCloseTo(5843.1, 6);
  });

  it("is NOT the inverse (dividing would 1/x the figure — the A5 regression guard)", async () => {
    const { toBRL } = await load();
    // 1000 / 5.8431 ≈ 171.14 — the WRONG answer; the engine must NOT produce it.
    expect(Math.abs(toBRL(1000, 5.8431) - 1000 / 5.8431)).toBeGreaterThan(TOL);
  });
});

describe("convert — finite coercion (NaN/±∞ never leak out)", () => {
  it("coerces a NaN amount to a finite figure (never NaN out)", async () => {
    const { convert } = await load();
    expect(Number.isNaN(convert(NaN, 1.1405))).toBe(false);
    expect(Number.isFinite(convert(NaN, 1.1405))).toBe(true);
  });

  it("coerces a ±∞ rate to a finite figure", async () => {
    const { convert } = await load();
    expect(Number.isFinite(convert(1000, Infinity))).toBe(true);
    expect(Number.isFinite(convert(1000, -Infinity))).toBe(true);
  });
});

describe("latestRate — newest rate_date, last-known fallback (Pitfall 6)", () => {
  const rows: FxRow[] = [
    { base: "EUR", quote: "BRL", rateDate: "2026-07-12", rate: 5.8, },
    { base: "EUR", quote: "BRL", rateDate: "2026-07-14", rate: 5.8431 },
    { base: "EUR", quote: "USD", rateDate: "2026-07-14", rate: 1.1405 },
    { base: "EUR", quote: "BRL", rateDate: "2026-07-13", rate: 5.82 },
  ];

  it("selects the NEWEST rate_date for the quote", async () => {
    const { latestRate } = await load();
    const brl = latestRate(rows, "BRL");
    expect(brl?.rateDate).toBe("2026-07-14");
    expect(brl?.rate).toBeCloseTo(5.8431, 6);
  });

  it("falls back to the last-known row when the newest date is another quote's only", async () => {
    const { latestRate } = await load();
    // Only older BRL rows present → still returns the most recent BRL (2026-07-13), never null.
    const older = rows.filter((r) => r.rateDate !== "2026-07-14");
    expect(latestRate(older, "BRL")?.rateDate).toBe("2026-07-13");
  });

  it("returns null when the quote is entirely absent", async () => {
    const { latestRate } = await load();
    expect(latestRate(rows, "CHF")).toBeNull();
  });
});

describe("remittanceView — carries the rate + as-of date (UI-SPEC §4 provenance)", () => {
  it("builds { eur, brl, rate, rateDate } from an amount + the latest BRL rate", async () => {
    const { remittanceView } = await load();
    const view = remittanceView(1000, {
      base: "EUR",
      quote: "BRL",
      rateDate: "2026-07-14",
      rate: 5.8431,
    });
    expect(view?.eur).toBeCloseTo(1000, 6);
    expect(view?.brl).toBeCloseTo(5843.1, 6);
    expect(view?.rate).toBeCloseTo(5.8431, 6);
    expect(view?.rateDate).toBe("2026-07-14");
  });

  it("returns null when there is no rate (a converted figure is NEVER shown without provenance)", async () => {
    const { remittanceView } = await load();
    expect(remittanceView(1000, null)).toBeNull();
  });
});
