// src/lib/fx/parse-ecb.ts — the ZERO-DEP ECB reference-rate parser (ETF-03 / BRL-01, D-01). PURE.
//
// The ECB daily feed (`eurofxref-daily.xml`) is an external, untrusted payload. We extract ONLY three
// scalars — the `time` date and, per requested quote, its `currency`/`rate` — with a regex. Using a
// general XML parser would open the door to XML-entity / DTD expansion (T-12-07); a scalar regex
// cannot expand entities, so NOT depending on a parser is itself the mitigation (and keeps the
// dependency surface — package.json / lockfile — untouched, T-12-SC).
//
// Rates are quote-per-EUR (A5): EUR/USD=1.1405 ⇒ 1 EUR = 1.1405 USD, stored as-is. A requested
// currency ABSENT from the feed is skipped (never emitted with a null rate). An empty / malformed /
// no-time feed returns `[]` — fail-soft, NEVER throws (Pitfall 6: a parse failure keeps the last-known
// row, it does not crash the daily cron). DB-free, clock-free, no I/O.

/** A single parsed reference rate: EUR → quote, on a given publish date, quote-per-EUR. */
export interface FxRow {
  base: "EUR";
  quote: string;
  rateDate: string; // "YYYY-MM-DD"
  rate: number; // quote-per-EUR, finite & positive
}

/** The quotes we care about by default (Fernanda's BRL remittance + the USD ETF valuation). */
const DEFAULT_QUOTES = ["USD", "BRL"] as const;

/** Matches the ECB `<Cube time='YYYY-MM-DD'>` publish date (single OR double quotes). */
const TIME_RE = /time=['"](\d{4}-\d{2}-\d{2})['"]/;

/**
 * Parse the ECB daily reference-rate XML into quote-per-EUR rows for the requested quotes.
 *
 * Pure over a string — NO fetch, NO DOMParser (Node has no browser DOM). Only the `time` date and each
 * requested `<Cube currency rate/>` scalar are read; anything else (GBP, JPY, DTDs, entities) is
 * ignored. Returns `[]` — never throws — on empty/malformed/no-time input.
 */
export function parseEcbRates(
  xml: string,
  quotes: readonly string[] = DEFAULT_QUOTES,
): FxRow[] {
  if (typeof xml !== "string" || xml.length === 0) return [];

  const timeMatch = TIME_RE.exec(xml);
  if (!timeMatch) return [];
  const rateDate = timeMatch[1];

  const rows: FxRow[] = [];
  for (const quote of quotes) {
    // Escape the quote for the regex (currencies are A-Z, but stay safe against odd input).
    const safe = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cubeRe = new RegExp(
      `currency=['"]${safe}['"]\\s+rate=['"]([\\d.]+)['"]`,
    );
    const match = cubeRe.exec(xml);
    if (!match) continue; // absent currency → skipped, never a null-rate row

    const rate = Number.parseFloat(match[1]);
    if (!Number.isFinite(rate) || rate <= 0) continue; // guard non-finite / non-positive

    rows.push({ base: "EUR", quote, rateDate, rate });
  }

  return rows;
}
