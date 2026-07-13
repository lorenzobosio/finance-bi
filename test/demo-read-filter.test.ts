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
];

// The mart-backed protected pages (extend when Phase 5 adds bucket pages).
const PAGES = [
  "src/app/(protected)/page.tsx",
  "src/app/(protected)/spending/page.tsx",
  "src/app/(protected)/cost-centers/page.tsx",
  "src/app/(protected)/transactions/page.tsx",
  "src/app/(protected)/config/page.tsx",
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
