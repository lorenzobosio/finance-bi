import { describe, expect, it } from "vitest";

import type { Flag } from "@/lib/health/anomaly";

// Wave-0 TDD RED (Phase-14 REM-02, D-05) — freezes the pure overspend view-model + per-period dismiss
// predicate landing in the not-yet-existent `@/lib/status/overspend-view`:
//   • buildOverspendView(flags: Flag[], labels: Record<string,string>): OverspendView
//   • isOverspendDismissed(currentScopes: string[], dismissedScopes: string[]): boolean
//
// RED at RUNTIME only: the COMPUTED dynamic-import specifier keeps `tsc --noEmit` green while the
// module is absent (the recurring-series.action.test.ts idiom), and `await import(...)` REJECTS
// ("Cannot find package '@/lib/status/overspend-view'") until 14-03 lands it.
//
// The banner is CALM (D-05): it lists ONLY over-budget cost centers (`f.remaining < 0`), NEVER on-pace
// flags. Capped to a primary + an "and {n} more" count. Dismiss is per-period — the caller keys
// localStorage by `period_key`; this suite asserts the PREDICATE (not the storage): a banner stays
// dismissed only while the current over-budget scopes are a subset of the dismissed set, so a NEW cost
// center flipping over re-shows.
//
// Synthetic € only; no PII.

const VIEW_MODULE = "@/lib/status/overspend-view";

interface OverspendView {
  show: boolean;
  primaryLabel: string;
  extraCount: number;
  scopes: string[];
}

type BuildOverspendView = (flags: Flag[], labels: Record<string, string>) => OverspendView;
type IsOverspendDismissed = (currentScopes: string[], dismissedScopes: string[]) => boolean;

async function loadView(): Promise<{
  buildOverspendView: BuildOverspendView;
  isOverspendDismissed: IsOverspendDismissed;
}> {
  const mod = (await import(/* @vite-ignore */ VIEW_MODULE)) as Record<string, unknown>;
  return {
    buildOverspendView: mod.buildOverspendView as BuildOverspendView,
    isOverspendDismissed: mod.isOverspendDismissed as IsOverspendDismissed,
  };
}

/** A synthetic flag helper — over-budget when `remaining < 0`. */
function flag(scope: string, remaining: number, onPace = false): Flag {
  const budget = 100;
  return { scope, budget, actual: budget - remaining, remaining, onPace };
}

const LABELS: Record<string, string> = {
  lorenzo: "Lorenzo",
  fernanda: "Fernanda",
  compartilhado: "Shared",
};

describe("buildOverspendView() — over-budget only, never on-pace (calm banner, D-05)", () => {
  it("empty flags -> { show: false } (banner not rendered)", async () => {
    const { buildOverspendView } = await loadView();
    const view = buildOverspendView([], LABELS);
    expect(view.show).toBe(false);
  });

  it("no over-budget flags (on-pace only) -> { show: false } (on-pace never surfaces here)", async () => {
    const { buildOverspendView } = await loadView();
    const view = buildOverspendView([flag("lorenzo", 20, true)], LABELS);
    expect(view.show).toBe(false);
  });

  it("one offender -> single banner with resolved label, extraCount 0", async () => {
    const { buildOverspendView } = await loadView();
    // A mix: one over-budget + one on-pace-only — only the over one surfaces.
    const view = buildOverspendView([flag("lorenzo", -30), flag("fernanda", 10, true)], LABELS);
    expect(view.show).toBe(true);
    expect(view.primaryLabel).toBe("Lorenzo");
    expect(view.extraCount).toBe(0);
    expect(view.scopes).toEqual(["lorenzo"]);
  });

  it("two+ offenders -> extraCount === n-1 and scopes sorted (drives 'and {n} more')", async () => {
    const { buildOverspendView } = await loadView();
    // Worst-first input order (as detectAnomalies returns): fernanda is the worst.
    const view = buildOverspendView([flag("fernanda", -50), flag("lorenzo", -10)], LABELS);
    expect(view.show).toBe(true);
    expect(view.primaryLabel).toBe("Fernanda");
    expect(view.extraCount).toBe(1);
    expect(view.scopes).toEqual(["fernanda", "lorenzo"]);
  });

  it("resolves the raw scope code to a display label, falling back to the raw code when unmapped", async () => {
    const { buildOverspendView } = await loadView();
    const view = buildOverspendView([flag("unmapped_scope", -5)], LABELS);
    expect(view.primaryLabel).toBe("unmapped_scope");
  });
});

describe("isOverspendDismissed() — per-period re-show on a NEW offender (D-05)", () => {
  it("dismissed when current scopes are a subset of the dismissed set", async () => {
    const { isOverspendDismissed } = await loadView();
    expect(isOverspendDismissed(["lorenzo"], ["lorenzo"])).toBe(true);
    expect(isOverspendDismissed(["lorenzo"], ["lorenzo", "fernanda"])).toBe(true);
  });

  it("re-shows when a NEW cost center flips over (current NOT a subset of dismissed)", async () => {
    const { isOverspendDismissed } = await loadView();
    expect(isOverspendDismissed(["lorenzo", "fernanda"], ["lorenzo"])).toBe(false);
  });
});
