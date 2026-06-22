import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TxPageSchema,
  SessionsResponseSchema,
} from "@/lib/ingestion/enable-banking/schemas";

// The Enable Banking boundary schemas MUST accept the live, PII-scrubbed fixtures captured
// from the real Revolut API (V5 boundary validation). This locks the field shapes against
// regression — in particular the real `credit_debit_indicator` values are CRDT and **DBIT**
// (Revolut sends DBIT for debit, NOT "DBDT" — the live connect run surfaced that the schema
// + plan had a typo, which would have made the daily cron reject EVERY real transaction).
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
      "utf8",
    ),
  );

describe("Enable Banking boundary schemas accept the live fixtures", () => {
  it("TxPageSchema parses the real transactions page (CRDT + DBIT)", () => {
    const page = TxPageSchema.parse(fixture("eb-transactions-page.json"));
    expect(page.transactions.length).toBeGreaterThan(0);
    const indicators = new Set(
      page.transactions.map((t) => t.credit_debit_indicator),
    );
    expect(indicators.has("CRDT")).toBe(true);
    expect(indicators.has("DBIT")).toBe(true); // the value that was rejected before the fix
  });

  it("SessionsResponseSchema parses the real /sessions fixture", () => {
    const session = SessionsResponseSchema.parse(fixture("eb-sessions.json"));
    expect(session.session_id).toBeTruthy();
    expect(typeof session.access.valid_until).toBe("string");
  });
});
