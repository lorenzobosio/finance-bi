import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard for the Phase-4 UAT bug: after migration 0010 the marts + the 8 demo-bearing
// tables emit BOTH partitions (is_demo true|false). EVERY read of a demo-bearing source in
// src/app MUST filter `.eq("is_demo", <demoFilter>)` or real + demo rows get summed into one
// number (the owner's real "invested" jumped 5.038 → 61.038 = real + the €56k demo seed).
// This test fails the build if a protected page reads a demo-bearing source without the filter.

const ROOT = join(__dirname, "..");

// The post-0010 demo-bearing sources: the 7 partitioned marts + the 8 demo-bearing tables.
const DEMO_BEARING = [
  "v_home_kpis", "v_pnl_monthly", "v_costcenter_bva", "v_balance_trend",
  "v_category_breakdown", "v_pct_of_revenue", "v_sublet_pnl",
  "transactions", "balances", "budgets", "connections",
  "goals", "milestones", "investment_contributions", "insights",
  // Phase-5 goal tables (0014) — also demo-bearing; a missing filter blends demo↔real (T-05-12).
  "household", "goal_events", "transfer_overrides",
  // Phase-6 health settings table (0015) — demo-bearing; a missing filter would blend the real
  // household's threshold config into the public demo (Pitfall 3).
  "insight_thresholds",
  // Phase-8 accounts surface (0017) — `accounts` gains `is_demo` + an additive anon
  // `demo_anon_read using(is_demo=true)` policy, and `v_account_summary` is the new latest-per-account
  // mart the /accounts page reads. Both are demo-bearing: any read must thread `.eq("is_demo", …)`
  // or the anon /accounts demo blends real account names with the demo partition (RESEARCH Pitfall 2).
  "accounts", "v_account_summary",
  // Phase-9 cashflow surface (0018) — `recurring_series` (the managed recurring/subscription list)
  // gains `is_demo` + the additive anon `demo_anon_read using(is_demo=true)` policy. Any read of it
  // must thread `.eq("is_demo", …)` or the anon /cashflow demo blends the real household's
  // subscription labels/amounts with the demo partition (T-09-01).
  "recurring_series",
];

// The mart-backed protected pages (extend when Phase 5 adds bucket pages).
const PAGES = [
  "src/app/(protected)/page.tsx",
  "src/app/(protected)/spending/page.tsx",
  "src/app/(protected)/cost-centers/page.tsx",
  "src/app/(protected)/transactions/page.tsx",
  "src/app/(protected)/config/page.tsx",
  // Phase-6 scorecard page (06-03) — every demo-bearing read here must thread `.eq("is_demo", …)`.
  // Staged-RED until the page exists (readFileSync throws on the absent path — intended).
  "src/app/(protected)/health/page.tsx",
  // Phase-8 accounts page (08-03) — reads `v_account_summary` + `balances` per partition. And the
  // owner-only CSV export route (08-05) re-runs the filtered transactions read. Both must thread
  // `.eq("is_demo", …)`. Staged-RED until 08-03/08-05 create them (readFileSync throws — intended,
  // the established convention: the same staging the health page used through Phase 6).
  "src/app/(protected)/accounts/page.tsx",
  "src/app/api/transactions/export/route.ts",
  // Phase-9 cashflow sections (09-03..06) — the four server-driven /cashflow section components that
  // read the demo-bearing `recurring_series` (+ marts). Every demo-bearing read here must thread
  // `.eq("is_demo", …)`. Staged-RED until those plans create them (readFileSync throws ENOENT on the
  // absent paths — the intended staging, exactly the convention the health/accounts pages used).
  "src/components/cashflow/recurring-section.tsx",
  "src/components/cashflow/safe-to-spend-section.tsx",
  "src/components/cashflow/bills-section.tsx",
  "src/components/cashflow/projection-section.tsx",
];

describe("demo-partition read filter (DEMO-03 / D4-12)", () => {
  for (const rel of PAGES) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const demoReads = DEMO_BEARING.filter((t) => src.includes(`.from("${t}")`));
    if (demoReads.length === 0) continue;

    it(`${rel} filters every demo-bearing read by is_demo`, () => {
      const filterCount = (src.match(/\.eq\("is_demo",/g) ?? []).length;
      // At least one is_demo filter per demo-bearing read in the file.
      expect(filterCount).toBeGreaterThanOrEqual(demoReads.length);
    });
  }
});
