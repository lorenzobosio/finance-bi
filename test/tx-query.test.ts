import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (TXN-01, D-03/D-04) — freezes the PURE tx-query contract for the not-yet-existent
// `@/lib/transactions/query` (built GREEN in 08-04). RED at RUNTIME only (the module does not
// resolve). The import specifier is COMPUTED (a string constant + `await import(/* @vite-ignore */)`)
// so `tsc --noEmit` stays green — a static OR literal-dynamic import of a missing module is a TS2307
// compile error (STATE.md 07-01 KEY MECHANISM). Only `pnpm test` is RED until the module lands.
//
// This suite pins three security-critical contracts (RESEARCH Pitfall 1 + Pattern 2/3):
//   1. The keyset cursor codec — round-trips {value,id}, generalizes to the ACTIVE sort column,
//      and a malformed cursor decodes to null (→ page-1 defaults) and NEVER throws (mirrors the
//      existing parseCursor format-validation, transactions/page.tsx:30-39, T-02-24).
//   2. buildTxQuery — over a FAKE supabase builder, always threads `.eq("is_demo", …)`, applies
//      every present filter, composes the free-text search as a SECOND `.or()` group, then the
//      keyset `.or()`, and orders by the active sort column then the `id` tiebreaker (same dir).
//   3. esc() — neutralizes the PostgREST metacharacters `, ( ) % \ *` before the search term
//      reaches the `.or()` string; parseTxParams allowlists sort∈{booking_date,amount_eur} and
//      dir∈{asc,desc} (an out-of-allowlist value falls back to the default, never interpolated raw).
//
// Synthetic values only; no PII.

const MODULE = "@/lib/transactions/query";

type Dir = "asc" | "desc";
type SortCol = "booking_date" | "amount_eur";

interface Cursor {
  value: string;
  id: string;
}

interface TxParams {
  categoryId?: string | null;
  costCenter?: string | null;
  accountId?: string | null;
  flowType?: string | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
  sort: SortCol;
  dir: Dir;
  cursor?: Cursor | null;
  limit?: number;
}

interface QueryModule {
  encodeCursor: (c: Cursor) => string;
  decodeCursor: (raw: string | undefined | null) => Cursor | null;
  esc: (term: string) => string;
  parseTxParams: (record: Record<string, string | undefined>) => TxParams;
  buildTxQuery: (supabase: unknown, params: TxParams, demoFilter: boolean) => unknown;
}

async function load(): Promise<QueryModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return {
    encodeCursor: mod.encodeCursor as QueryModule["encodeCursor"],
    decodeCursor: mod.decodeCursor as QueryModule["decodeCursor"],
    esc: mod.esc as QueryModule["esc"],
    parseTxParams: mod.parseTxParams as QueryModule["parseTxParams"],
    buildTxQuery: mod.buildTxQuery as QueryModule["buildTxQuery"],
  };
}

// A chainable supabase-js builder DOUBLE that records every method call. `.from/.select/.eq/.gte/
// .lte/.or/.order/.limit` all return the same recorder so buildTxQuery can chain freely.
interface Call {
  method: string;
  args: unknown[];
}
function fakeSupabase(): { supabase: unknown; calls: Call[] } {
  const calls: Call[] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ["from", "select", "eq", "gte", "lte", "or", "order", "limit"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    };
  }
  return { supabase: builder, calls };
}

function eqArgs(calls: Call[], col: string): unknown | undefined {
  return calls.find((c) => c.method === "eq" && c.args[0] === col)?.args[1];
}

const UUID = "00000000-0000-0000-0000-000000000abc";

describe("tx-query — keyset cursor codec (TXN-01, Pattern 2)", () => {
  it("round-trips {value,id} for the default sort (booking_date)", async () => {
    const { encodeCursor, decodeCursor } = await load();
    const c: Cursor = { value: "2026-07-14", id: UUID };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("generalizes the cursor value to the alternate sort column (amount_eur)", async () => {
    const { encodeCursor, decodeCursor } = await load();
    const c: Cursor = { value: "-123.45", id: UUID };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("decodes a malformed cursor to null and NEVER throws (→ page-1 defaults)", async () => {
    const { decodeCursor } = await load();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("nounderscore")).toBeNull(); // no separator
    expect(decodeCursor("2026-07-14_not-a-uuid")).toBeNull(); // bad id format
  });
});

describe("tx-query — parseTxParams allowlists sort + dir (TXN-01, Pitfall 1)", () => {
  it("accepts an in-allowlist sort/dir pair", async () => {
    const { parseTxParams } = await load();
    const p = parseTxParams({ sort: "amount_eur", dir: "asc" });
    expect(p.sort).toBe("amount_eur");
    expect(p.dir).toBe("asc");
  });

  it("falls back to the defaults for an out-of-allowlist sort/dir (never interpolated raw)", async () => {
    const { parseTxParams } = await load();
    const p = parseTxParams({ sort: "description; drop table tx", dir: "sideways" });
    expect(p.sort).toBe("booking_date");
    expect(p.dir).toBe("desc");
  });

  it("defaults sort=booking_date dir=desc when both are absent", async () => {
    const { parseTxParams } = await load();
    const p = parseTxParams({});
    expect(p.sort).toBe("booking_date");
    expect(p.dir).toBe("desc");
  });
});

describe("tx-query — esc() neutralizes PostgREST metacharacters (TXN-01, Pitfall 1)", () => {
  it("strips/neutralizes every one of `, ( ) % \\ *` from the search term", async () => {
    const { esc } = await load();
    const out = esc("a,b(c)d%e\\f*g");
    expect(/[,()%\\*]/.test(out)).toBe(false);
  });

  it("leaves an already-safe term intact", async () => {
    const { esc } = await load();
    expect(esc("cafe")).toBe("cafe");
  });
});

describe("tx-query — buildTxQuery composition (TXN-01, Pattern 2/3)", () => {
  it("ALWAYS threads .eq(is_demo, demoFilter) as the partition chokepoint", async () => {
    const { buildTxQuery } = await load();
    const { supabase, calls } = fakeSupabase();
    buildTxQuery(supabase, { sort: "booking_date", dir: "desc" }, true);
    expect(eqArgs(calls, "is_demo")).toBe(true);

    const b = fakeSupabase();
    buildTxQuery(b.supabase, { sort: "booking_date", dir: "desc" }, false);
    expect(eqArgs(b.calls, "is_demo")).toBe(false);
  });

  it("applies each present filter to the correct column", async () => {
    const { buildTxQuery } = await load();
    const { supabase, calls } = fakeSupabase();
    buildTxQuery(
      supabase,
      {
        categoryId: "cat-1",
        costCenter: "lorenzo",
        accountId: "acc-1",
        flowType: "cost",
        from: "2026-01-01",
        to: "2026-12-31",
        sort: "booking_date",
        dir: "desc",
      },
      false,
    );
    expect(eqArgs(calls, "category_id")).toBe("cat-1");
    expect(eqArgs(calls, "cost_center")).toBe("lorenzo");
    expect(eqArgs(calls, "account_id")).toBe("acc-1");
    expect(eqArgs(calls, "flow_type")).toBe("cost");
    const gte = calls.find((c) => c.method === "gte" && c.args[0] === "booking_date");
    const lte = calls.find((c) => c.method === "lte" && c.args[0] === "booking_date");
    expect(gte?.args[1]).toBe("2026-01-01");
    expect(lte?.args[1]).toBe("2026-12-31");
  });

  it("omits a filter that is absent", async () => {
    const { buildTxQuery } = await load();
    const { supabase, calls } = fakeSupabase();
    buildTxQuery(supabase, { sort: "booking_date", dir: "desc" }, false);
    expect(eqArgs(calls, "category_id")).toBeUndefined();
    expect(eqArgs(calls, "account_id")).toBeUndefined();
  });

  it("composes the free-text search as an .or() over description + counterparty (ilike)", async () => {
    const { buildTxQuery } = await load();
    const { supabase, calls } = fakeSupabase();
    buildTxQuery(supabase, { q: "cafe", sort: "booking_date", dir: "desc" }, false);
    const orStr = calls.filter((c) => c.method === "or").map((c) => String(c.args[0]));
    const search = orStr.find((s) => s.includes("description.ilike") && s.includes("counterparty.ilike"));
    expect(search).toBeDefined();
    expect(search).toContain("cafe");
  });

  it("emits the keyset .or() seek matching the active sort column + id tiebreaker (desc → lt)", async () => {
    const { buildTxQuery } = await load();
    const { supabase, calls } = fakeSupabase();
    buildTxQuery(
      supabase,
      { cursor: { value: "2026-07-14", id: UUID }, sort: "booking_date", dir: "desc" },
      false,
    );
    const orStr = calls.filter((c) => c.method === "or").map((c) => String(c.args[0]));
    const seek = orStr.find((s) => s.includes("booking_date.lt.2026-07-14"));
    expect(seek).toBeDefined();
    expect(seek).toContain(`and(booking_date.eq.2026-07-14,id.lt.${UUID})`);
  });

  it("flips the keyset comparator for asc (gt) and generalizes to amount_eur", async () => {
    const { buildTxQuery } = await load();
    const { supabase, calls } = fakeSupabase();
    buildTxQuery(
      supabase,
      { cursor: { value: "42.50", id: UUID }, sort: "amount_eur", dir: "asc" },
      false,
    );
    const orStr = calls.filter((c) => c.method === "or").map((c) => String(c.args[0]));
    const seek = orStr.find((s) => s.includes("amount_eur.gt.42.50"));
    expect(seek).toBeDefined();
    expect(seek).toContain(`and(amount_eur.eq.42.50,id.gt.${UUID})`);
  });

  it("adds the search .or() BEFORE the keyset .or() (both AND-composed)", async () => {
    const { buildTxQuery } = await load();
    const { supabase, calls } = fakeSupabase();
    buildTxQuery(
      supabase,
      { q: "cafe", cursor: { value: "2026-07-14", id: UUID }, sort: "booking_date", dir: "desc" },
      false,
    );
    const ors = calls.filter((c) => c.method === "or").map((c) => String(c.args[0]));
    expect(ors.length).toBeGreaterThanOrEqual(2);
    const searchIdx = ors.findIndex((s) => s.includes("description.ilike"));
    const keysetIdx = ors.findIndex((s) => s.includes("booking_date.lt."));
    expect(searchIdx).toBeGreaterThanOrEqual(0);
    expect(keysetIdx).toBeGreaterThan(searchIdx);
  });

  it("orders by the active sort column THEN id, both in the same direction", async () => {
    const { buildTxQuery } = await load();
    const { supabase, calls } = fakeSupabase();
    buildTxQuery(supabase, { sort: "amount_eur", dir: "asc" }, false);
    const orders = calls.filter((c) => c.method === "order");
    expect(orders.length).toBeGreaterThanOrEqual(2);
    expect(orders[0].args[0]).toBe("amount_eur");
    expect((orders[0].args[1] as { ascending?: boolean }).ascending).toBe(true);
    expect(orders[1].args[0]).toBe("id");
    expect((orders[1].args[1] as { ascending?: boolean }).ascending).toBe(true);
  });
});
