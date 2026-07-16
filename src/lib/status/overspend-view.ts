// src/lib/status/overspend-view.ts — the PURE overspend view-model the REM-02 banner renders (D-05).
//
// The banner is CALM (D-05, non-shame): it surfaces ONLY over-budget cost centers (`remaining < 0`),
// NEVER on-pace-to-exceed flags — being on track to overspend is not yet a failure, so it stays out
// of the loud surface. This file is SELECTION LOGIC ONLY: no copy strings live here (the 14-05
// component owns the locked non-shame copy), no I/O, no clock (`demoAwareNow` is the caller's clock
// convention — this transform never reads a wall-clock or DB). It consumes the deterministic
// `detectAnomalies` `Flag[]` verbatim (D-08) — no detector is rebuilt.
//
// Mirrors the injected-input discipline of src/lib/goal/streak.ts + src/lib/health/anomaly.ts: a pure
// fn over already-read, already-detected inputs so the vitest suite stays deterministic.
//
// Synthetic € only; no PII, no amounts — only display labels + counts cross this boundary (T-14-10).

import type { Flag } from "@/lib/health/anomaly";

/**
 * The rendered overspend banner shape. `show` gates the whole surface; `primaryLabel` is the worst
 * offender's display name; `extraCount` drives the "and {n} more" tail; `scopes` (sorted, raw codes)
 * is the per-period dismiss key the caller stores in localStorage.
 */
export interface OverspendView {
  show: boolean;
  primaryLabel: string;
  extraCount: number;
  scopes: string[];
}

/**
 * buildOverspendView — pure selection over the `detectAnomalies` `Flag[]` (D-05, D-08).
 *
 * Filters to OVER-BUDGET flags only (`remaining < 0`) — on-pace-to-exceed flags never surface on this
 * calm banner. Returns the hidden shape when none are over budget. Otherwise the input is already
 * worst-first (detectAnomalies orders it), so `flags[0]` is the primary; the display label resolves
 * from `labels`, falling back to the raw scope code when unmapped. `scopes` is sorted ascending so the
 * per-period dismiss key is stable regardless of detector ordering.
 */
export function buildOverspendView(flags: Flag[], labels: Record<string, string>): OverspendView {
  const over = flags.filter((f) => f.remaining < 0);
  if (over.length === 0) {
    return { show: false, primaryLabel: "", extraCount: 0, scopes: [] };
  }
  const primaryScope = over[0].scope;
  return {
    show: true,
    primaryLabel: labels[primaryScope] ?? primaryScope,
    extraCount: over.length - 1,
    scopes: over.map((f) => f.scope).sort(),
  };
}

/**
 * isOverspendDismissed — the per-period dismiss predicate (D-05).
 *
 * The 14-05 banner keys localStorage by `period_key` and stores the dismissed `scopes[]`. A banner
 * stays dismissed ONLY while the current over-budget scopes are a SUBSET of the dismissed set — so a
 * NEW cost center flipping over budget is not a subset, and the banner re-shows on the next paint.
 * Empty `currentScopes` (nothing over budget) is vacuously dismissed.
 */
export function isOverspendDismissed(currentScopes: string[], dismissedScopes: string[]): boolean {
  return currentScopes.every((s) => dismissedScopes.includes(s));
}
