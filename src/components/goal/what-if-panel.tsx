"use client";

// src/components/goal/what-if-panel.tsx — the "What if?" scenario panel (WHATIF-02, D-04/D-06/D-07).
//
// The moment the reporting app becomes a PLANNING app: drag three sliders (extra €/month, a one-off
// lump sum, skip N months) and watch the €100k ETA + the "≈ N months sooner/later" delta recompute
// LIVE on the client via the shared pure `projectGoal()` — zero server round-trip (D-04).
//
// EPHEMERAL by construction (D-06/D-08): it is client `useState` only — NO useTransition, NO Server
// Action, NO FormData, NO URL-param / localStorage write, NO fetch. Reset = setState back to 0. It
// NEVER writes, persists, or mutates the real goal state. The honesty rules (qualitative-vs-precise
// delta, low-confidence caveat, never-red-for-later) live in the node-tested `whatIfView` view-model;
// this component is thin glue that reuses `projectGoal`, `etaLine`, `formatEUR`, `CountUp`, `Slider`.

import { useState } from "react";

import { CountUp } from "@/components/motion/count-up";
import { Slider } from "@/components/ui/slider";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { formatEUR } from "@/lib/format";
import { etaLine } from "@/lib/goal/hero-view";
import { projectGoal } from "@/lib/goal/project-goal";
import { CAVEAT_COPY, resetValues, whatIfView } from "@/lib/goal/what-if-view";

interface WhatIfPanelProps {
  /** The Wealth cost basis (the €100k figure) — server-passed, already is_demo-partitioned. */
  currentInvested: number;
  /** The derived base monthly pace (avg of the funded trailing months) — server-passed. */
  baseMonthlyContribution: number;
  /** The REAL trailing monthly contributions — the ONLY thing the confidence gate reads. */
  trailingContributions: number[];
}

export function WhatIfPanel({
  currentInvested,
  baseMonthlyContribution,
  trailingContributions,
}: WhatIfPanelProps) {
  // Ephemeral client state only — the three levers, all default 0. NO persistence surface.
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [lumpSum, setLumpSum] = useState(0);
  const [skipMonths, setSkipMonths] = useState(0);
  const prefersReduced = usePrefersReducedMotion();

  const base = { currentInvested, baseMonthlyContribution, trailingContributions };
  // Recompute on EVERY render (every slider change): the scenario + the untouched baseline.
  const scenario = projectGoal({ ...base, extraMonthly, lumpSum, skipMonths });
  const baseline = projectGoal({ ...base });
  const vm = whatIfView(scenario, baseline);

  function reset() {
    const zero = resetValues();
    setExtraMonthly(zero.extraMonthly);
    setLumpSum(zero.lumpSum);
    setSkipMonths(zero.skipMonths);
  }

  // The slider rows — value labels routed through formatEUR (never an inline Intl formatter).
  const rows = [
    {
      id: "whatif-extra-monthly",
      label: "Extra €/month",
      value: extraMonthly,
      set: setExtraMonthly,
      min: 0,
      max: 2000,
      step: 50,
      valueLabel: `+${formatEUR(extraMonthly, 0)}/mo`,
    },
    {
      id: "whatif-lump-sum",
      label: "One-off lump sum",
      value: lumpSum,
      set: setLumpSum,
      min: 0,
      max: 20000,
      step: 500,
      valueLabel: formatEUR(lumpSum, 0),
    },
    {
      id: "whatif-skip-months",
      label: "Skip N months",
      value: skipMonths,
      set: setSkipMonths,
      min: 0,
      max: 6,
      step: 1,
      valueLabel: `skip ${skipMonths} ${skipMonths === 1 ? "month" : "months"}`,
    },
  ] as const;

  // The delta line + tone. sooner→gain (green), later→warning (amber) — NEVER --loss/red (D-06).
  const deltaTone =
    vm.signal === "gain"
      ? "text-[var(--gain)]"
      : vm.signal === "warning"
        ? "text-[var(--warning)]"
        : "text-muted-foreground";

  return (
    <section
      aria-label="What-if scenario simulator"
      className="space-y-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10"
    >
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          What if?
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Play with the levers — see what reaches €100k sooner. Nothing here changes your real plan.
        </p>
      </div>

      {/* The three levers. Each row is a ≥44px pointer target (Slider Root min-h-11). */}
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                id={`${row.id}-label`}
                htmlFor={row.id}
                className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {row.label}
              </label>
              <span className="font-mono text-sm font-medium tabular-nums">{row.valueLabel}</span>
            </div>
            <Slider
              id={row.id}
              aria-labelledby={`${row.id}-label`}
              value={[row.value]}
              min={row.min}
              max={row.max}
              step={row.step}
              onValueChange={(next) => row.set(next[0] ?? 0)}
            />
          </div>
        ))}
      </div>

      {/* The live readout — screen readers hear the recomputed ETA (aria-live). */}
      <div
        aria-live="polite"
        className={prefersReduced ? "space-y-2" : "space-y-2 transition-opacity"}
      >
        {vm.caveat === "zero-contribution" ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {CAVEAT_COPY["zero-contribution"]}
          </p>
        ) : vm.caveat === "low-confidence" ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {CAVEAT_COPY["low-confidence"]}
          </p>
        ) : scenario.monthsToGoal === 0 ? (
          <p className="text-sm text-foreground">You&apos;d reach €100k right away.</p>
        ) : (
          <>
            <p className="text-sm text-foreground">{etaLine(scenario.eta)}</p>
            {vm.deltaMonths !== null && vm.deltaMonths !== 0 ? (
              <p className={`text-sm font-medium ${deltaTone}`}>
                ≈{" "}
                <CountUp
                  value={Math.abs(vm.deltaMonths)}
                  format={{ maximumFractionDigits: 0 }}
                  className="font-mono tabular-nums"
                />{" "}
                {vm.direction === "sooner"
                  ? "months sooner at this pace."
                  : "months later — still your call."}
              </p>
            ) : vm.direction !== "none" ? (
              // Qualitative delta — a direction without a false-precise count (either side uncertain).
              <p className={`text-sm font-medium ${deltaTone}`}>
                {vm.direction === "sooner" ? "Sooner at this pace." : "Later — still your call."}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                This is your current pace. Move a slider — add to your monthly, drop in a lump sum,
                or skip a month — to see how your €100k ETA shifts.
              </p>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-11 items-center rounded-md px-4 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Reset to baseline
      </button>
    </section>
  );
}
