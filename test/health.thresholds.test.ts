import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (D-07) — freezes the demo-partitioned, defaults-fallback contract for the
// not-yet-existent thresholds READ helper `@/lib/health/thresholds` (a later Phase-6 plan builds
// it). FAILS at import-resolution until the module lands — the intended Nyquist RED anchor, NOT a
// bug.
//
// The read mirrors `readHouseholdConfig` (`src/lib/goal/household.ts:58`): a PURE fn over an
// INJECTED @supabase/ssr client, `.eq("is_demo", demoFilter).maybeSingle()`, returning the seeded
// `DEFAULT_BANDS` when no row exists (pre-launch) OR on a read error (never throws — the page's own
// error boundary owns hard failures). A missing `.eq("is_demo", …)` would blend the real
// household's config into the public demo (Pitfall 3 — the 5,038→61,038 class of leak).
//
// Synthetic band numbers only; no PII.
import { readInsightThresholds, DEFAULT_BANDS } from "@/lib/health/thresholds";

/** The resolved (nested, camelCased) threshold bands the scorecard resolves each metric against. */
interface ThresholdBands {
  savingsRate: { healthy: number; watch: number };
  reserve: { healthy: number; watch: number };
  budgetAdherence: { watchOverPct: number };
  streak: { watchMisses: number };
}

/**
 * A spy household-config client recording every `.eq(col,val)` so the demo-partition threading can
 * be asserted. `data`/`error` configure the single `maybeSingle()` resolution (row present / absent
 * / error). Mirrors the `HouseholdReadClient` narrow slice (from→select→eq→maybeSingle).
 */
function makeFakeClient(result: { data: Record<string, unknown> | null; error: unknown }) {
  const eqs: Array<[string, unknown]> = [];
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: unknown) {
              eqs.push([col, val]);
              return {
                maybeSingle() {
                  return Promise.resolve(result);
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, eqs };
}

describe("DEFAULT_BANDS — the seeded personal-finance defaults (D-07)", () => {
  it("carries the savings-rate bands (≥0.20 healthy / 0.10–0.20 watch / <0.10 off)", () => {
    expect(DEFAULT_BANDS.savingsRate.healthy).toBe(0.2);
    expect(DEFAULT_BANDS.savingsRate.watch).toBe(0.1);
  });

  it("carries the months-of-reserve bands (≥6 healthy / 3–6 watch / <3 off)", () => {
    expect(DEFAULT_BANDS.reserve.healthy).toBe(6);
    expect(DEFAULT_BANDS.reserve.watch).toBe(3);
  });

  it("carries the budget-adherence watch ceiling (≤10% over = watch, beyond = off)", () => {
    expect(DEFAULT_BANDS.budgetAdherence.watchOverPct).toBe(0.1);
  });

  it("carries the €4k-streak watch ceiling (1 miss = watch, multiple = off)", () => {
    expect(DEFAULT_BANDS.streak.watchMisses).toBe(1);
  });
});

describe("readInsightThresholds — demo-partitioned, defaults-fallback (D-07, Pitfall 3)", () => {
  it("returns DEFAULT_BANDS when no row exists yet (pre-launch / unseeded partition)", async () => {
    const { client } = makeFakeClient({ data: null, error: null });
    const bands = await readInsightThresholds(client, false);
    expect(bands).toEqual(DEFAULT_BANDS);
  });

  it("maps a present row to the camelCased nested bands", async () => {
    const row = {
      savings_rate_healthy: 0.25,
      savings_rate_watch: 0.12,
      reserve_healthy: 8,
      reserve_watch: 4,
      budget_adherence_watch_over_pct: 0.15,
      streak_watch_misses: 2,
    };
    const { client } = makeFakeClient({ data: row, error: null });
    const bands: ThresholdBands = await readInsightThresholds(client, true);
    expect(bands).toEqual({
      savingsRate: { healthy: 0.25, watch: 0.12 },
      reserve: { healthy: 8, watch: 4 },
      budgetAdherence: { watchOverPct: 0.15 },
      streak: { watchMisses: 2 },
    });
  });

  it("threads the passed demoFilter into `.eq(\"is_demo\", …)` (the Pitfall-3 partition guard)", async () => {
    const { client, eqs } = makeFakeClient({ data: null, error: null });
    await readInsightThresholds(client, true);
    expect(eqs).toContainEqual(["is_demo", true]);

    const { client: realClient, eqs: realEqs } = makeFakeClient({ data: null, error: null });
    await readInsightThresholds(realClient, false);
    expect(realEqs).toContainEqual(["is_demo", false]);
  });

  it("degrades to DEFAULT_BANDS on a read error (never throws)", async () => {
    const { client } = makeFakeClient({ data: null, error: { message: "boom" } });
    await expect(readInsightThresholds(client, false)).resolves.toEqual(DEFAULT_BANDS);
  });
});
