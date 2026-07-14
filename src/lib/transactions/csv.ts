// src/lib/transactions/csv.ts — the PURE, injection-safe CSV encoder for the owner-only
// transactions export (TXN-02, D-05). No I/O: it turns already-fetched rows into a CSV string.
//
// The exported financial CSV is opened in Excel / Google Sheets by the owner, so a cell whose
// text is a spreadsheet FORMULA is a client-side code-execution (RCE) vector (OWASP CSV_Injection,
// RESEARCH Code Examples). This module bakes the neutralization inline (no CSV library — a flat
// ~6-column table is trivial to build and this keeps the ONE security rule in one tested place;
// the "don't-hand-roll" exception is deliberate):
//   1. NEUTRALIZE — a cell whose FIRST character is a formula trigger (`= + - @` tab CR) is
//      prefixed with a leading apostrophe so a spreadsheet treats it as literal text, not a formula.
//   2. QUOTE — AFTER neutralization, a cell containing a quote / comma / CR / LF is RFC-4180 quoted
//      (wrapped in double quotes, internal quotes doubled). Order matters: neutralize THEN quote.
// Rows are joined with CRLF (RFC-4180 line terminator). Frozen contract: test/tx-csv.test.ts.

import { formatEUR } from "@/lib/format";

/** The export row shape — the display fields of a filtered transaction (no PII beyond the row). */
export interface TxCsvRow {
  bookingDate: string;
  merchant: string;
  category: string | null;
  costCenter: string | null;
  amountEur: number;
  flowType: string | null;
}

/** The stable header row — the deterministic column order the body follows. */
const HEADER = ["Date", "Merchant", "Category", "Cost Center", "Amount", "Flow"] as const;

/** RFC-4180 line terminator. */
const CRLF = "\r\n";

/**
 * A cell whose FIRST character triggers spreadsheet formula evaluation. `-` is escaped and the
 * class also covers the whitespace triggers tab (\t) and carriage return (\r) that some clients
 * strip before parsing a leading `=`/`+`/`@` (OWASP CSV_Injection).
 */
const DANGEROUS = /^[=+\-@\t\r]/;

/** Characters that force RFC-4180 quoting (comma, double-quote, CR, LF). */
const MUST_QUOTE = /[",\r\n]/;

/**
 * csvCell — encode a single value to an injection-safe, RFC-4180 field.
 * `null`/`undefined` → an empty field. Neutralize a leading formula trigger with `'`, THEN quote
 * (doubling internal quotes) if the — possibly prefixed — text carries a quote/comma/CR/LF.
 */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (DANGEROUS.test(s)) s = `'${s}`; // neutralize BEFORE quoting
  if (MUST_QUOTE.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** csvRow — one record's fields, in the header's column order, each through `csvCell`, comma-joined. */
function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * toCsv — encode the filtered transaction rows to a CSV string: a stable header line followed by
 * one line per row (Date, Merchant, Category, Cost Center, Amount, Flow), joined with CRLF. Money
 * flows through the de-DE `formatEUR` (the single money-format source — no new Intl here). PURE +
 * deterministic: the same rows always produce byte-identical output.
 */
export function toCsv(rows: TxCsvRow[]): string {
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      csvRow([
        r.bookingDate,
        r.merchant,
        r.category,
        r.costCenter,
        formatEUR(r.amountEur),
        r.flowType,
      ]),
    );
  }
  return lines.join(CRLF);
}

/**
 * csvFilename — the download filename `transactions-<ISO date>.csv` (UTC calendar day). Accepts a
 * clock for deterministic testing; defaults to now.
 */
export function csvFilename(now: Date = new Date()): string {
  return `transactions-${now.toISOString().slice(0, 10)}.csv`;
}
