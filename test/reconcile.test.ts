import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (DAT-01, D-01/02) — freezes the PURE reconciliation-engine contract for the
// not-yet-existent `@/lib/reconcile/engine` (built GREEN in 07-03). RED at RUNTIME (the module does
// not resolve) — the intended Nyquist RED anchor, NOT a bug. The import specifier is COMPUTED (a
// string constant) so `tsc --noEmit` stays green (a static/literal import of a missing module is a
// TS2307 compile error); only `pnpm test` is RED until the engine lands. Mirrors the pure-engine
// shape of `src/lib/goal/allocation.ts`.
//
// CRITICAL correctness nuance (RESEARCH Pitfall 1): the ledger is go-forward-only with no opening
// balance, so absolute `balances.balance_eur` NEVER equals Σ transactions. The engine reconciles
// DELTAS (change in bank balance across a period vs Σ booked tx) and mart-total vs the same total
// recomputed from source rows — never absolutes. Tolerance €0.01, inclusive at the boundary.
//
// Orientation convention this contract pins (the implementer must match):
//   balance_delta  → expectedEur = bankDeltaEur (bank is the source of truth), actualEur = ledgerDeltaEur
//   mart_vs_ledger → expectedEur = ledgerRecomputedEur (recomputed-from-source truth), actualEur = martTotalEur
//   deltaEur       → the absolute magnitude |expected − actual|, rounded to cents
//
// Synthetic € only; no PII.

const MODULE = "@/lib/reconcile/engine";

interface ReconcileInput {
  accountId: string;
  periodKey: number;
  bankDeltaEur: number | null;
  ledgerDeltaEur: number;
  martTotalEur: number;
  ledgerRecomputedEur: number;
  isDemo: boolean;
}

interface ReconcileFlag {
  kind: "balance_delta" | "mart_vs_ledger";
  accountId: string;
  periodKey: number;
  expectedEur: number;
  actualEur: number;
  deltaEur: number;
  isDemo: boolean;
}

interface Engine {
  reconcile: (inputs: ReconcileInput[]) => ReconcileFlag[];
  RECONCILE_TOLERANCE_EUR: number;
}

async function loadEngine(): Promise<Engine> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return {
    reconcile: mod.reconcile as Engine["reconcile"],
    RECONCILE_TOLERANCE_EUR: mod.RECONCILE_TOLERANCE_EUR as number,
  };
}

// An all-reconciled input (bank == ledger, mart == recomputed) — override one pair per case.
function input(over: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    accountId: "acc-1",
    periodKey: 202607,
    bankDeltaEur: 0,
    ledgerDeltaEur: 0,
    martTotalEur: 0,
    ledgerRecomputedEur: 0,
    isDemo: false,
    ...over,
  };
}

describe("reconcile — the tolerance constant", () => {
  it("exposes RECONCILE_TOLERANCE_EUR = 0.01", async () => {
    const { RECONCILE_TOLERANCE_EUR } = await loadEngine();
    expect(RECONCILE_TOLERANCE_EUR).toBe(0.01);
  });
});

describe("reconcile — balance_delta (bank-delta vs ledger-delta)", () => {
  it("(a) a difference ABOVE €0.01 emits one balance_delta flag with the correct expected/actual/delta", async () => {
    const { reconcile } = await loadEngine();
    const flags = reconcile([input({ bankDeltaEur: 100, ledgerDeltaEur: 99.5 })]);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("balance_delta");
    expect(flags[0].expectedEur).toBe(100);
    expect(flags[0].actualEur).toBe(99.5);
    expect(flags[0].deltaEur).toBeCloseTo(0.5, 2);
    expect(flags[0].accountId).toBe("acc-1");
    expect(flags[0].periodKey).toBe(202607);
  });

  it("(c) a difference of EXACTLY €0.01 emits NO flag (tolerance is inclusive at the boundary)", async () => {
    const { reconcile } = await loadEngine();
    // |0.01 − 0| === 0.01 === RECONCILE_TOLERANCE_EUR; an inclusive `<=` compare must NOT flag it.
    expect(reconcile([input({ bankDeltaEur: 0.01, ledgerDeltaEur: 0 })])).toEqual([]);
  });

  it("skips the balance check when bankDeltaEur is null (only one snapshot — no period delta)", async () => {
    const { reconcile } = await loadEngine();
    expect(reconcile([input({ bankDeltaEur: null, ledgerDeltaEur: 999 })])).toEqual([]);
  });
});

describe("reconcile — mart_vs_ledger (mart total vs recomputed-from-source)", () => {
  it("(b) a difference above tolerance emits one mart_vs_ledger flag", async () => {
    const { reconcile } = await loadEngine();
    const flags = reconcile([input({ martTotalEur: 200, ledgerRecomputedEur: 200.05 })]);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("mart_vs_ledger");
    expect(flags[0].expectedEur).toBe(200.05);
    expect(flags[0].actualEur).toBe(200);
    expect(flags[0].deltaEur).toBeCloseTo(0.05, 2);
  });
});

describe("reconcile — partition tagging + the clean case", () => {
  it("(d) carries isDemo onto the emitted flag verbatim (the leak-guard tag)", async () => {
    const { reconcile } = await loadEngine();
    const demo = reconcile([input({ bankDeltaEur: 50, ledgerDeltaEur: 40, isDemo: true })]);
    expect(demo).toHaveLength(1);
    expect(demo[0].isDemo).toBe(true);

    const real = reconcile([input({ bankDeltaEur: 50, ledgerDeltaEur: 40, isDemo: false })]);
    expect(real[0].isDemo).toBe(false);
  });

  it("(e) an all-within-tolerance input array emits []", async () => {
    const { reconcile } = await loadEngine();
    const flags = reconcile([
      input(),
      input({ bankDeltaEur: 5, ledgerDeltaEur: 5, martTotalEur: 10, ledgerRecomputedEur: 10 }),
    ]);
    expect(flags).toEqual([]);
  });
});
