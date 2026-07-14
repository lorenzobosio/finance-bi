import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (TXN-02, D-05) — freezes the PURE CSV-encoder contract for the not-yet-existent
// `@/lib/transactions/csv` (built GREEN in 08-05). RED at RUNTIME only; the import specifier is
// COMPUTED so `tsc --noEmit` stays green while the module is absent (STATE.md 07-01 KEY MECHANISM).
//
// The financial CSV is opened in Excel/Sheets by the owner — it is a formula-injection target
// (RESEARCH Code Examples, OWASP CSV_Injection). This suite pins:
//   - a cell whose FIRST character is a formula trigger (`= + - @` tab CR) is prefixed with a
//     leading apostrophe (neutralized) BEFORE any quoting;
//   - a cell containing a quote/comma/newline is RFC-4180 quoted with doubled quotes;
//   - a stable, deterministic header row + column order.
//
// Synthetic values only; no PII.

const MODULE = "@/lib/transactions/csv";

interface TxCsvRow {
  bookingDate: string;
  merchant: string;
  category: string | null;
  costCenter: string | null;
  amountEur: number;
  flowType: string | null;
}

interface CsvModule {
  toCsv: (rows: TxCsvRow[]) => string;
}

async function load(): Promise<CsvModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return { toCsv: mod.toCsv as CsvModule["toCsv"] };
}

const HEADER = "Date,Merchant,Category,Cost Center,Amount,Flow";

function row(over: Partial<TxCsvRow> = {}): TxCsvRow {
  return {
    bookingDate: "2026-07-14",
    merchant: "Spotify",
    category: "Subscriptions",
    costCenter: "Shared",
    amountEur: -9.99,
    flowType: "cost",
    ...over,
  };
}

describe("tx-csv — header + determinism (TXN-02)", () => {
  it("emits a stable header row as the first line", async () => {
    const { toCsv } = await load();
    const first = toCsv([]).split(/\r?\n/)[0];
    expect(first).toBe(HEADER);
  });

  it("is deterministic — the same rows produce byte-identical output", async () => {
    const { toCsv } = await load();
    const rows = [row(), row({ merchant: "Rewe", amountEur: -42.1 })];
    expect(toCsv(rows)).toBe(toCsv(rows));
  });
});

describe("tx-csv — formula-injection neutralization (TXN-02, OWASP)", () => {
  for (const trigger of ["=", "+", "-", "@", "\t", "\r"]) {
    it(`prefixes a leading '${JSON.stringify(trigger)}' cell with an apostrophe`, async () => {
      const { toCsv } = await load();
      const out = toCsv([row({ merchant: `${trigger}SUM(A1)` })]);
      // The neutralized cell carries a leading apostrophe before the trigger character.
      expect(out).toContain(`'${trigger}SUM(A1)`);
    });
  }

  it("neutralizes THEN quotes a triggering cell that also contains a comma", async () => {
    const { toCsv } = await load();
    const out = toCsv([row({ merchant: "=cmd,injected" })]);
    // Apostrophe-prefixed AND RFC-4180 quoted (the comma forces quoting).
    expect(out).toContain(`"'=cmd,injected"`);
  });
});

describe("tx-csv — RFC-4180 quoting (TXN-02)", () => {
  it("quotes a cell containing a comma", async () => {
    const { toCsv } = await load();
    const out = toCsv([row({ merchant: "Bar, Inc" })]);
    expect(out).toContain(`"Bar, Inc"`);
  });

  it("quotes and doubles embedded quotes", async () => {
    const { toCsv } = await load();
    const out = toCsv([row({ merchant: 'He said "hi"' })]);
    expect(out).toContain(`"He said ""hi"""`);
  });

  it("quotes a cell containing a newline", async () => {
    const { toCsv } = await load();
    const out = toCsv([row({ merchant: "line1\nline2" })]);
    expect(out).toContain(`"line1\nline2"`);
  });

  it("leaves a plain cell unquoted", async () => {
    const { toCsv } = await load();
    const out = toCsv([row({ merchant: "Spotify" })]);
    expect(out).toContain("Spotify");
    expect(out).not.toContain(`"Spotify"`);
  });
});
