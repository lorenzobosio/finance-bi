// src/lib/goal/hero-view.ts — the PURE Home-hero glance view-model (D5-12). No DB, no clock (now
// injected), no I/O. The Goal-Hero card is a client island (@number-flow needs the DOM), so the
// GLANCE LOGIC lives here — testable in the node env — and the component only renders primitives.
//
// Three glance pieces (the D5-12 "1-minute" promise): the next-milestone remaining, the gated ETA
// sentence (honest RANGE or the warm "building your pace" copy — never a false-precise date, D5-15),
// and the compact 6-node streak chain (hit/miss nodes + the provisional filling head). The streak
// nodes carry NO color decision here — the caller renders miss/light months in neutral, never red
// (D5-07); this module only says which months hit €4k.

import { MILESTONES, MONTHLY_TARGET_EUR } from "./constants";
import type { EtaResult } from "./momentum";
import { currentPeriodKey, previousPeriodKey } from "../period";

/** The next milestone rung strictly above `wealth`, or null once the top (€100k) is reached. */
export function nextMilestone(wealth: number): number | null {
  for (const m of MILESTONES) {
    if (wealth < m) return m;
  }
  return null;
}

/** € remaining to the next milestone rung (clamped ≥ 0); null once the top rung is passed. */
export function nextMilestoneRemaining(wealth: number): number | null {
  const m = nextMilestone(wealth);
  return m === null ? null : Math.max(0, m - wealth);
}

/** Round a year figure for the ETA range, never below 1 (conservative — never overstates speed). */
function roundYears(y: number): number {
  return Math.max(1, Math.round(y));
}

/**
 * The gated ETA sentence (UI-SPEC Copywriting). Not confident (under ~2 funded months / too noisy /
 * zero run-rate) → the warm "building your pace" copy with NO year. Confident → an honest RANGE
 * ("~3–4 years at your current pace."), never a single false-precise date (D5-15).
 */
export function etaLine(eta: EtaResult): string {
  if (!eta.confident || eta.minYears === null || eta.maxYears === null) {
    return "Building your pace — your ETA appears after a couple of funded months.";
  }
  const lo = roundYears(eta.minYears);
  const hi = Math.max(lo, roundYears(eta.maxYears));
  const range = lo === hi ? `${lo}` : `${lo}–${hi}`; // en-dash between the bounds
  return `~${range} years at your current pace.`;
}

export interface StreakChainNodes {
  /** The last `count` CLOSED post-launch months, oldest → newest: true when that month hit €4k. */
  hits: boolean[];
  /** True when the OPEN (provisional) month has already reached €4k — a filling head, not counted. */
  provisionalHit: boolean;
}

/**
 * The compact streak-chain nodes for the hero pulse. Walks back `count` CLOSED months from the
 * last closed month, oldest → newest, dropping any month before `launchDate` (no phantom
 * pre-launch miss nodes — D5-07/D5-01). A month "hit" when its TOTAL investimento ≥ €4,000 (D5-06).
 */
export function streakChainNodes(
  invByPeriod: Map<number, number>,
  now: Date,
  count = 6,
  launchDate?: string | null,
): StreakChainNodes {
  const provisionalKey = currentPeriodKey(now);
  const launchKey =
    launchDate == null ? null : Number(launchDate.slice(0, 7).replace("-", ""));

  const keys: number[] = [];
  let k = previousPeriodKey(provisionalKey);
  for (let i = 0; i < count; i++) {
    keys.push(k);
    k = previousPeriodKey(k);
  }
  keys.reverse(); // oldest → newest

  const hits = keys
    .filter((key) => launchKey == null || key >= launchKey)
    .map((key) => (invByPeriod.get(key) ?? -1) >= MONTHLY_TARGET_EUR);

  const provisionalHit = (invByPeriod.get(provisionalKey) ?? -1) >= MONTHLY_TARGET_EUR;

  return { hits, provisionalHit };
}
