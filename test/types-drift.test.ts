import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (DAT-03, D-05) — freezes the PURE diff helper contract for the not-yet-existent
// `@/lib/db/types-drift-core` (built GREEN in 07-04). RED at RUNTIME (module does not resolve); the
// COMPUTED import specifier keeps `tsc --noEmit` green. The postgres/TS-parse I/O lives in
// `scripts/types-drift.ts`; the diff of column-name/nullability SETS is factored here so it is
// node-unit-testable with fixtures (no live DB).
//
// The gate asserts NAME presence + nullability parity, NOT exact SQL types (the hand-authored
// database.types.ts maps numeric→string / timestamptz→string by design — exact-type comparison is
// noisy). A drift is any added/removed/renamed column OR a nullability flip.

const MODULE = "@/lib/db/types-drift-core";

interface Column {
  table: string;
  column: string;
  nullable: boolean;
}

interface Drift {
  table: string;
  column: string;
  reason: string;
}

async function loadDiff(): Promise<(live: Column[], declared: Column[]) => Drift[]> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return mod.diffColumnSets as (live: Column[], declared: Column[]) => Drift[];
}

const BASE: Column[] = [
  { table: "transactions", column: "id", nullable: false },
  { table: "transactions", column: "amount_eur", nullable: false },
  { table: "transactions", column: "description", nullable: true },
];

describe("diffColumnSets — no drift on identical shapes", () => {
  it("returns [] when live and declared match exactly", async () => {
    const diff = await loadDiff();
    expect(diff([...BASE], [...BASE])).toEqual([]);
  });
});

describe("diffColumnSets — a live column MISSING from declared is drift", () => {
  it("flags a column present live but absent in the declared types", async () => {
    const diff = await loadDiff();
    const live = [...BASE, { table: "transactions", column: "counterparty_iban", nullable: true }];
    const drift = diff(live, [...BASE]);
    expect(drift.length).toBeGreaterThanOrEqual(1);
  });
});

describe("diffColumnSets — a declared column MISSING from live is drift", () => {
  it("flags a column declared in the types but dropped/renamed live", async () => {
    const diff = await loadDiff();
    const declared = [...BASE, { table: "transactions", column: "old_column", nullable: true }];
    const drift = diff([...BASE], declared);
    expect(drift.length).toBeGreaterThanOrEqual(1);
  });
});

describe("diffColumnSets — a nullability FLIP is drift", () => {
  it("flags a column whose nullability differs between live and declared", async () => {
    const diff = await loadDiff();
    const live = BASE.map((c) =>
      c.column === "description" ? { ...c, nullable: false } : c,
    );
    const drift = diff(live, [...BASE]);
    expect(drift.length).toBeGreaterThanOrEqual(1);
  });
});

describe("diffColumnSets — v_* view nullability is NOT compared (DAT-03)", () => {
  it("does not flag a view column whose live nullability differs from declared (Postgres reports every view column nullable regardless of COALESCE)", async () => {
    const diff = await loadDiff();
    const declared = [{ table: "v_pnl_monthly", column: "revenue", nullable: false }];
    const live = [{ table: "v_pnl_monthly", column: "revenue", nullable: true }];
    expect(diff(live, declared)).toHaveLength(0);
  });

  it("still flags a renamed/dropped VIEW column (name drift on views is real)", async () => {
    const diff = await loadDiff();
    const declared = [{ table: "v_pnl_monthly", column: "revenue", nullable: false }];
    const live = [{ table: "v_pnl_monthly", column: "revenue_renamed", nullable: true }];
    expect(diff(live, declared).length).toBeGreaterThanOrEqual(1);
  });
});

// Wave-0 TDD RED (DAT-03 / FLOW-01, D-11) — the drift gate compares the LIVE Postgres schema against
// the hand-authored `src/lib/database.types.ts`. Migration 0018 adds `recurring_series`; if 09-02
// forgets to declare it in database.types.ts, the live/declared column SETS diverge and `pnpm
// types:drift` fails against the real DB. This suite pins the EXPECTATION at the source level (a text
// probe of the declared types) so it is RED until 09-02 declares the relation + its columns — the
// intended staged-RED anchor, NOT a bug. A text probe (not an import of a missing module) keeps
// `tsc --noEmit` green.
describe("database.types.ts declares recurring_series (0018 drift expectation, staged-RED)", () => {
  const declaredTypes = readFileSync(
    join(__dirname, "..", "src/lib/database.types.ts"),
    "utf8",
  );

  it("declares the recurring_series relation", () => {
    expect(declaredTypes).toMatch(/recurring_series\s*:/);
  });

  it("declares the recurring_series columns the 0018 migration adds", () => {
    for (const col of [
      "series_key",
      "amount_eur",
      "cadence",
      "next_date",
      "status",
      "is_demo",
    ]) {
      expect(declaredTypes.includes(col)).toBe(true);
    }
  });
});
