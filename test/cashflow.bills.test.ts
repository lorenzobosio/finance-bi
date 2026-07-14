import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (FLOW-03, D-07/D-08/D-12) — freezes the bills-calendar expansion contract for the
// not-yet-existent PURE engine `@/lib/cashflow/bills.ts` (built GREEN in a later Phase-9 plan). RED
// at RUNTIME only ("Cannot find package '@/lib/cashflow/bills'"); the COMPUTED import specifier keeps
// `tsc --noEmit` green while the module is absent.
//
// The engine expands each `active` recurring series forward over a rolling window by cadence
// (D-07: 60-day / 2-month default). PURE — `from` is INJECTED, never an internal clock (Pitfall 2).
//   - the BILL list is OUTFLOWS ONLY (known recurring debits); recurring INCOME (salary) is flagged
//     SEPARATELY, not a "bill" (D-08 — the calendar renders it as a distinct `--gain` marker).
//   - only `active` series expand; a `dismissed` series contributes nothing.
//
// Synthetic € only; no PII.

const MODULE = "@/lib/cashflow/bills";

interface BillSeries {
  key: string;
  label: string;
  amount: number; // signed EUR (negative = outflow, positive = income)
  cadence: "weekly" | "monthly" | "yearly";
  nextDate: string; // YYYY-MM-DD — the next expected occurrence
  status: "active" | "dismissed";
  direction: "outflow" | "income";
}

interface BillOccurrence {
  key: string;
  label: string;
  amount: number;
  date: string; // YYYY-MM-DD
}

interface BillsResult {
  bills: BillOccurrence[]; // outflows only
  income: BillOccurrence[]; // recurring income, flagged separately
}

interface BillsModule {
  projectBills: (series: BillSeries[], from: string, days: number) => BillsResult;
}

async function load(): Promise<BillsModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return { projectBills: mod.projectBills as BillsModule["projectBills"] };
}

const FROM = "2026-03-01";
const WINDOW = 60;

const RENT: BillSeries = {
  key: "rent",
  label: "Rent",
  amount: -1600,
  cadence: "monthly",
  nextDate: "2026-03-01",
  status: "active",
  direction: "outflow",
};
const SPOTIFY: BillSeries = {
  key: "spotify",
  label: "Spotify",
  amount: -12.99,
  cadence: "monthly",
  nextDate: "2026-03-15",
  status: "active",
  direction: "outflow",
};
const SALARY: BillSeries = {
  key: "salary",
  label: "Salary",
  amount: 4200,
  cadence: "monthly",
  nextDate: "2026-03-28",
  status: "active",
  direction: "income",
};

describe("projectBills — outflows-only bill list, income flagged separately (FLOW-03, D-08)", () => {
  it("puts recurring debits in `bills` and recurring income in `income`", async () => {
    const { projectBills } = await load();
    const out = projectBills([RENT, SPOTIFY, SALARY], FROM, WINDOW);
    // Every bill entry is an outflow-derived series.
    expect(out.bills.length).toBeGreaterThanOrEqual(2);
    expect(out.bills.every((b) => b.key === "rent" || b.key === "spotify")).toBe(true);
    // Salary is NOT a bill — it lands in the income lane.
    expect(out.bills.some((b) => b.key === "salary")).toBe(false);
    expect(out.income.some((b) => b.key === "salary")).toBe(true);
  });

  it("expands a monthly series ~twice across a 60-day window", async () => {
    const { projectBills } = await load();
    const out = projectBills([RENT], FROM, WINDOW);
    // Mar 01 + Apr 01 both fall inside [2026-03-01, +60d).
    expect(out.bills.filter((b) => b.key === "rent").length).toBeGreaterThanOrEqual(2);
    for (const occ of out.bills) {
      expect(occ.date >= FROM).toBe(true);
    }
  });
});

describe("projectBills — only active series expand (D-07)", () => {
  it("ignores a dismissed series entirely", async () => {
    const { projectBills } = await load();
    const dismissed: BillSeries = { ...SPOTIFY, status: "dismissed" };
    const out = projectBills([dismissed], FROM, WINDOW);
    expect(out.bills).toEqual([]);
    expect(out.income).toEqual([]);
  });

  it("returns empty lanes for empty input (no throw, no NaN)", async () => {
    const { projectBills } = await load();
    const out = projectBills([], FROM, WINDOW);
    expect(out.bills).toEqual([]);
    expect(out.income).toEqual([]);
  });
});

describe("projectBills — deterministic on an injected `from` (RESEARCH Pitfall 2)", () => {
  it("is deterministic: two calls with the same from/window are deep-equal", async () => {
    const { projectBills } = await load();
    const a = projectBills([RENT, SALARY], FROM, WINDOW);
    const b = projectBills([RENT, SALARY], FROM, WINDOW);
    expect(b).toEqual(a);
  });

  it("every emitted occurrence carries a finite amount and a dated occurrence", async () => {
    const { projectBills } = await load();
    const out = projectBills([RENT, SPOTIFY, SALARY], FROM, WINDOW);
    for (const occ of [...out.bills, ...out.income]) {
      expect(Number.isFinite(occ.amount)).toBe(true);
      expect(occ.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
