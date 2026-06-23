import { describe, expect, it } from "vitest";

// Wave-0 RED test (DSN-06a) — locks the `pickBalance` CLBD-preference contract that
// Plan 03-02 will turn GREEN. The function was extracted/exported from scripts/ingest.ts
// in Plan 03-01 so it is importable here as a SINGLE implementation (write-plane only).
//
// THE BUG THIS GUARDS (RESEARCH § Pattern 7): the CURRENT pickBalance returns the FIRST
// numeric amount in the EB `balances[]` payload, ignoring `balance_type`. Enable Banking
// returns several typed balances per account (interim available ITAV, interim booked ITBD,
// closing booked CLBD, …) and their ORDER is not guaranteed. For the daily go-forward
// snapshot the closing-booked balance (CLBD) is the authoritative figure; an interim
// available (ITAV) can include pending holds and is NOT comparable month-over-month.
//
// Contract (RED until 03-02): pickBalance prefers CLBD, then ITBD, then ITAV, and only
// falls back to the first any-numeric amount when none of those three types are present —
// so a snapshot is never lost.
import { pickBalance } from "@/lib/ingestion/pick-balance";
import type { Balance } from "@/lib/ingestion/enable-banking/schemas";

// Build a typed EB balance entry (EUR). `balance_amount.amount` is a STRING per the EB
// schema; `balance_type` is the EB code. Synthetic round numbers only — no real figures.
const bal = (type: string, amount: string): Balance => ({
  name: null,
  balance_amount: { currency: "EUR", amount },
  balance_type: type,
  reference_date: "2026-06-22",
});

describe("pickBalance — prefers CLBD over interim balances (DSN-06a)", () => {
  it("returns the CLBD amount even when an ITAV entry comes FIRST in the payload", () => {
    // ITAV (interim available, includes pending holds) is listed first; CLBD (closing booked)
    // is the authoritative snapshot and must win regardless of array order.
    const bals: Balance[] = [bal("ITAV", "1200"), bal("CLBD", "1000")];
    expect(pickBalance(bals)).toBe(1000);
  });

  it("honours the preference order CLBD > ITBD > ITAV", () => {
    // All three present, deliberately ordered ITAV, ITBD, CLBD — CLBD wins.
    expect(
      pickBalance([bal("ITAV", "300"), bal("ITBD", "200"), bal("CLBD", "100")]),
    ).toBe(100);

    // CLBD absent → ITBD is preferred over ITAV.
    expect(pickBalance([bal("ITAV", "300"), bal("ITBD", "200")])).toBe(200);

    // Only ITAV present → ITAV is used.
    expect(pickBalance([bal("ITAV", "300")])).toBe(300);
  });

  it("falls back to the first any-numeric amount when none of CLBD/ITBD/ITAV are present (snapshot never lost)", () => {
    // An unexpected/unknown balance_type must not drop the snapshot — the any-numeric
    // fallback still returns a value (this case is GREEN today and stays GREEN after 03-02).
    const bals: Balance[] = [bal("XPCD", "500"), bal("OTHER", "600")];
    expect(pickBalance(bals)).toBe(500);
  });
});
