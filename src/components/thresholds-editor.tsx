"use client";

// ThresholdsEditor — the Config scorecard-band write surface (UI-SPEC §4, D-07, HEALTH-01).
//
// One numeric input per editable band edge (savings rate, cash reserve, budget adherence, €4k
// streak), pre-filled from the current insight_thresholds row (or the seeded DEFAULT_BANDS when the
// partition has no row yet). "Save thresholds" posts every input to the LOCKED `setThresholds`
// Server Action (zod-parse → @supabase/ssr → parsed fields only → revalidate). "Reset to defaults"
// repopulates the inputs with DEFAULT_BANDS and saves — a normal parsed write, NOT a destructive
// delete (no confirmation UI, per UI-SPEC §Copywriting).
//
// Inputs clear a ≥44px min tap height (Fernanda PWA — UI-SPEC §Mobile). Bands are labelled in plain
// English so a non-technical reader knows exactly what each edge tunes.

import { useState, useTransition } from "react";

import { setThresholds } from "@/lib/actions/set-thresholds";
import { DEFAULT_BANDS, type InsightThresholds } from "@/lib/health/thresholds";

/** The flat, form-shaped band values (the keys match the `setThresholds` FormData names). */
interface BandValues {
  savingsRateHealthy: number;
  savingsRateWatch: number;
  reserveHealthy: number;
  reserveWatch: number;
  budgetAdherenceWatchOverPct: number;
  streakWatchMisses: number;
}

/** Flatten the nested bands the read side returns into the flat, form-shaped values. */
function flatten(bands: InsightThresholds): BandValues {
  return {
    savingsRateHealthy: bands.savingsRate.healthy,
    savingsRateWatch: bands.savingsRate.watch,
    reserveHealthy: bands.reserve.healthy,
    reserveWatch: bands.reserve.watch,
    budgetAdherenceWatchOverPct: bands.budgetAdherence.watchOverPct,
    streakWatchMisses: bands.streak.watchMisses,
  };
}

/** The editable edges, in render order, with plain-English labels + a hint of the unit. */
const FIELDS: ReadonlyArray<{
  name: keyof BandValues;
  label: string;
  hint: string;
  step: string;
}> = [
  {
    name: "savingsRateHealthy",
    label: "Savings rate — healthy at or above",
    hint: "Share of revenue invested (e.g. 0.20 = 20%).",
    step: "0.01",
  },
  {
    name: "savingsRateWatch",
    label: "Savings rate — watch at or above",
    hint: "Below this is off-track.",
    step: "0.01",
  },
  {
    name: "reserveHealthy",
    label: "Cash reserve — healthy at or above (months)",
    hint: "Months of cost covered by cash.",
    step: "0.5",
  },
  {
    name: "reserveWatch",
    label: "Cash reserve — watch at or above (months)",
    hint: "Below this is off-track.",
    step: "0.5",
  },
  {
    name: "budgetAdherenceWatchOverPct",
    label: "Budget — watch when over by",
    hint: "Over-budget tolerance (e.g. 0.10 = 10% over). Beyond this is off-track.",
    step: "0.01",
  },
  {
    name: "streakWatchMisses",
    label: "€4k streak — watch after this many misses",
    hint: "Whole number of missed months tolerated before off-track.",
    step: "1",
  },
];

export function ThresholdsEditor({ current }: { current: InsightThresholds }) {
  const [values, setValues] = useState<BandValues>(() => flatten(current));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update(name: keyof BandValues, raw: string) {
    setSaved(false);
    setValues((prev) => ({ ...prev, [name]: raw === "" ? Number.NaN : Number(raw) }));
  }

  function resetToDefaults() {
    const defaults = flatten(DEFAULT_BANDS);
    setValues(defaults);
    setSaved(false);
    // Reset is a normal parsed write (no destructive delete): persist the seeded defaults so the
    // scorecard reflects them immediately after revalidate.
    const fd = new FormData();
    for (const { name } of FIELDS) fd.set(name, String(defaults[name]));
    startTransition(async () => {
      await setThresholds(fd);
      setSaved(true);
    });
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await setThresholds(fd);
          setSaved(true);
        })
      }
      className="flex flex-col gap-5"
    >
      <ul className="flex flex-col divide-y divide-border">
        {FIELDS.map((field) => {
          const value = values[field.name];
          return (
            <li
              key={field.name}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <label htmlFor={`threshold-${field.name}`} className="min-w-56 flex-1">
                <span className="block text-sm font-medium">{field.label}</span>
                <span className="block text-xs text-muted-foreground">{field.hint}</span>
              </label>
              <input
                id={`threshold-${field.name}`}
                name={field.name}
                type="number"
                inputMode="decimal"
                min={0}
                step={field.step}
                value={Number.isFinite(value) ? String(value) : ""}
                onChange={(e) => update(field.name, e.target.value)}
                className="h-11 w-28 rounded-md border border-border bg-transparent px-3 font-mono text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Save thresholds
        </button>
        <button
          type="button"
          onClick={resetToDefaults}
          disabled={pending}
          className="inline-flex h-11 items-center rounded-md px-4 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Reset to defaults
        </button>
        {/* Live region pre-exists in the DOM (only its text toggles) so SR reliably announces
            the save — regions inserted together with their content are often skipped. */}
        <span role="status" className="text-xs text-muted-foreground">
          {saved && !pending ? "Saved." : ""}
        </span>
      </div>
    </form>
  );
}
