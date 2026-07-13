import { describe, expect, it } from "vitest";

// TDD RED (AI-03, D-15, Pitfall 3) — freezes the demo-partitioned, degrade-to-null contract for the
// latest-insight READ helper `@/lib/health/insight-read`. FAILS at import-resolution until the module
// lands — the intended RED anchor.
//
// The read mirrors `readHouseholdConfig` / `readInsightThresholds`: a PURE fn over an INJECTED
// @supabase/ssr client, threading `.eq("is_demo", demoFilter)`, ordering `created_at` desc, `limit(1)`,
// `maybeSingle()`. Returns the latest insight `{ kind, body, createdAt }` for the ACTIVE partition, or
// null when no row exists (the first-run placeholder signal) OR on a read error — NEVER throws (Home
// owns the degrade). A missing `.eq("is_demo", …)` would blend the real household's note into the
// public demo (the 5,038→61,038 class of leak).
//
// Synthetic body text only; no PII.
import { readLatestInsight } from "@/lib/health/insight-read";

interface InsightRow {
  kind: string;
  body: string;
  created_at: string;
}

/**
 * A spy insights client recording every `.eq(col,val)` + the `.order()` / `.limit()` args so the
 * demo-partition threading AND the "latest" ordering can be asserted. `result` configures the single
 * `maybeSingle()` resolution. Mirrors the narrow read slice (from→select→eq→order→limit→maybeSingle).
 */
function makeFakeClient(result: { data: InsightRow | null; error: unknown }) {
  const eqs: Array<[string, unknown]> = [];
  const orders: Array<[string, { ascending: boolean }]> = [];
  const limits: number[] = [];
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: unknown) {
              eqs.push([col, val]);
              return {
                order(col2: string, opts: { ascending: boolean }) {
                  orders.push([col2, opts]);
                  return {
                    limit(n: number) {
                      limits.push(n);
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
        },
      };
    },
  };
  return { client, eqs, orders, limits };
}

describe("readLatestInsight — demo-partitioned latest-note read (AI-03, D-15)", () => {
  it("returns null when no insight row exists yet (the first-run placeholder signal)", async () => {
    const { client } = makeFakeClient({ data: null, error: null });
    await expect(readLatestInsight(client, false)).resolves.toBeNull();
  });

  it("maps the latest row to { kind, body, createdAt }", async () => {
    const row = {
      kind: "weekly_report",
      body: "You're €44k from €100k — and this month behaved like a healthy business.",
      created_at: "2026-03-30T09:00:00.000Z",
    };
    const { client } = makeFakeClient({ data: row, error: null });
    const insight = await readLatestInsight(client, true);
    expect(insight).toEqual({
      kind: "weekly_report",
      body: row.body,
      createdAt: "2026-03-30T09:00:00.000Z",
    });
  });

  it("threads the passed demoFilter into `.eq(\"is_demo\", …)` (the Pitfall-3 partition guard)", async () => {
    const { client, eqs } = makeFakeClient({ data: null, error: null });
    await readLatestInsight(client, true);
    expect(eqs).toContainEqual(["is_demo", true]);

    const { client: realClient, eqs: realEqs } = makeFakeClient({ data: null, error: null });
    await readLatestInsight(realClient, false);
    expect(realEqs).toContainEqual(["is_demo", false]);
  });

  it("orders created_at descending and limits to 1 (the LATEST insight)", async () => {
    const { client, orders, limits } = makeFakeClient({ data: null, error: null });
    await readLatestInsight(client, false);
    expect(orders).toContainEqual(["created_at", { ascending: false }]);
    expect(limits).toContain(1);
  });

  it("degrades to null on a read error (never throws)", async () => {
    const { client } = makeFakeClient({ data: null, error: { message: "boom" } });
    await expect(readLatestInsight(client, false)).resolves.toBeNull();
  });
});
