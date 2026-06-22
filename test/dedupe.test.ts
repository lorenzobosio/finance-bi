import { describe, expect, it } from "vitest";

// Wave-0 RED test (ING-03) — freezes the contract for the not-yet-existent
// src/lib/ingestion/dedupe.ts. `dedupeHash` does NOT exist yet (created GREEN in
// plan 01-04); this suite fails at import-resolution time — the intended RED state.
//
// Contract frozen here (RESEARCH § Pattern 2 — deterministic, versioned hash):
//   dedupeHash(normalized) -> { hash: string; strategy: "bank_id" | "composite" }
//   - DETERMINISTIC: identical input -> identical hash.
//   - STABLE across value_date flips: hash unchanged when only value_date changes
//     (value_date moves between pulls; booking_date is the frozen period key).
//   - SENSITIVE: hash differs when amount, bookingDate, accountId, or bankTxId change.
//   - STRATEGY: a row WITH a bankTxId uses "bank_id"; WITHOUT uses "composite".
//   - IDEMPOTENT: de-duplicating the same batch twice by hash yields the original
//     count (zero added on the second pass).
import { dedupeHash } from "@/lib/ingestion/dedupe";

// A minimal Normalized-shaped row. The real `Normalized` type lives in normalize.ts
// (also created in 01-04); here we use a structural literal sufficient for hashing.
interface NormalizedLike {
  accountId: string;
  bankTxId: string | null;
  bookingDate: string; // YYYY-MM-DD — the frozen period key
  valueDate?: string; // moves between pulls; MUST NOT affect the hash
  amount: number; // signed EUR
  normalizedDescription: string;
}

const baseWithId: NormalizedLike = {
  accountId: "acct-lorenzo",
  bankTxId: "tx-abc-123",
  bookingDate: "2026-06-10",
  valueDate: "2026-06-11",
  amount: -42.5,
  normalizedDescription: "rewe berlin",
};

const baseNoId: NormalizedLike = {
  accountId: "acct-fernanda",
  bankTxId: null,
  bookingDate: "2026-06-10",
  valueDate: "2026-06-11",
  amount: -42.5,
  normalizedDescription: "rewe berlin",
};

describe("dedupeHash — deterministic, versioned idempotency key (ING-03)", () => {
  it("is deterministic — identical input yields identical hash", () => {
    expect(dedupeHash(baseWithId).hash).toBe(dedupeHash({ ...baseWithId }).hash);
    expect(dedupeHash(baseNoId).hash).toBe(dedupeHash({ ...baseNoId }).hash);
  });

  it("is IDENTICAL when only value_date changes (composite path)", () => {
    const a = dedupeHash(baseNoId);
    const b = dedupeHash({ ...baseNoId, valueDate: "2026-06-15" });
    expect(b.hash).toBe(a.hash);
  });

  it("is IDENTICAL when only value_date changes (bank_id path)", () => {
    const a = dedupeHash(baseWithId);
    const b = dedupeHash({ ...baseWithId, valueDate: "2026-06-20" });
    expect(b.hash).toBe(a.hash);
  });

  it("DIFFERS when amount changes", () => {
    expect(dedupeHash({ ...baseNoId, amount: -43.0 }).hash).not.toBe(
      dedupeHash(baseNoId).hash,
    );
  });

  it("DIFFERS when bookingDate changes", () => {
    expect(dedupeHash({ ...baseNoId, bookingDate: "2026-06-11" }).hash).not.toBe(
      dedupeHash(baseNoId).hash,
    );
  });

  it("DIFFERS when accountId changes", () => {
    expect(dedupeHash({ ...baseNoId, accountId: "acct-shared" }).hash).not.toBe(
      dedupeHash(baseNoId).hash,
    );
  });

  it("DIFFERS when bankTxId changes", () => {
    expect(dedupeHash({ ...baseWithId, bankTxId: "tx-different" }).hash).not.toBe(
      dedupeHash(baseWithId).hash,
    );
  });

  it("uses strategy 'bank_id' when a bankTxId is present", () => {
    expect(dedupeHash(baseWithId).strategy).toBe("bank_id");
  });

  it("uses strategy 'composite' when no bankTxId is present", () => {
    expect(dedupeHash(baseNoId).strategy).toBe("composite");
  });

  it("double-pull adds zero rows — de-duping the same batch twice keeps the count", () => {
    const batch: NormalizedLike[] = [
      baseWithId,
      baseNoId,
      { ...baseWithId, bankTxId: "tx-second", amount: -10 },
    ];
    const seen = new Set<string>();
    for (const row of batch) seen.add(dedupeHash(row).hash);
    const originalCount = seen.size;
    // Second pass over the same batch — must add nothing.
    let added = 0;
    for (const row of batch) {
      const { hash } = dedupeHash(row);
      if (!seen.has(hash)) {
        seen.add(hash);
        added += 1;
      }
    }
    expect(added).toBe(0);
    expect(seen.size).toBe(originalCount);
  });
});
