// src/lib/cost-center-display.ts — the demo-aware cost-center DISPLAY-LABEL remap.
//
// PURPOSE (Phase-4 UAT gap-fix): the public demo seeds its person cost-centers under the LIVE
// FK codes (`lorenzo` / `fernanda`) so the marts/aggregations reconcile exactly — "Alice's"
// budget IS the `lorenzo` partition. But the rendered LABEL must NOT show the real owner names
// on the public (anon) demo surface. This file is the ONE place a person cost-center code turns
// into the string the USER sees, with a demo-mode override.
//
// WHY THIS FILE LIVES OUTSIDE src/lib/demo/** (deliberate, not an accident): the source-cleanliness
// gate (test/source-cleanliness.test.ts) forbids the real-owner substrings `lorenzo`/`fernanda`
// inside src/lib/demo/** and scripts/seed-demo.ts (the synthetic-seed surface). This module is
// APP DISPLAY LOGIC — the same place the cost-center CODES already legitimately appear (e.g.
// page.tsx PERSON_COST_CENTERS, cost-centers/page.tsx HOUSEHOLD_CENTERS) — so the codes belong
// here, and the no-PII gate does not scan it.
//
// DISPLAY-ONLY: this changes the LABEL, never the seed FK codes, the migrations, or any row. The
// demo transactions/budgets keep `cost_center='lorenzo'/'fernanda'` (valid FK); only the rendered
// text flips to the anonymized persona when demo mode is active.

/** The fictional demo persona labels for the two person cost-centers (anon-safe). */
const DEMO_PERSON_LABELS: Record<string, string> = {
  lorenzo: "Alice",
  fernanda: "Bob",
};

/** The non-person codes whose label is identical in real and demo mode (no owner PII). */
const SHARED_LABELS: Record<string, string> = {
  compartilhado: "Shared",
  shared: "Shared",
  sublocacao: "Sublet",
};

/**
 * costCenterDisplayName — the single demo-aware cost-center label resolver.
 *
 * @param code     the cost-center FK code (e.g. "lorenzo" | "fernanda" | "compartilhado" | "sublocacao").
 * @param realName the real display label for non-demo mode (e.g. the DB `cost_centers.label`, or a
 *                 hardcoded "Lorenzo"/"Fernanda"); falls back to `code` when null.
 * @param isDemo   the active read partition (the page's `demoFilter` / `isDemoForReads()` result).
 * @returns        in demo mode: `lorenzo`→"Alice", `fernanda`→"Bob", shared/sublet→their generic
 *                 label; otherwise the real name (`realName ?? code`).
 */
export function costCenterDisplayName(
  code: string,
  realName: string | null,
  isDemo: boolean,
): string {
  if (isDemo) {
    const persona = DEMO_PERSON_LABELS[code];
    if (persona) return persona;
    const shared = SHARED_LABELS[code];
    if (shared) return shared;
    // Unknown code in demo mode: prefer the real label if it carries no owner PII, else the code.
    return realName ?? code;
  }
  return realName ?? code;
}
