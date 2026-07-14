import { ShieldCheck, TriangleAlert } from "lucide-react";

import type { ReconcileStatus } from "@/lib/reconcile/derive";

// ReconcileChip — the NON-SHAME data-trust status chip (DAT-02, D-04, UI-SPEC §5). Rendered in the
// StatusBanners stack beside the "data as of {date}" freshness banner. Presentational only: it takes
// the pure deriveReconcileStatus() result and renders ONE pill, reusing the anomaly-chip pill
// treatment verbatim (`rounded-full px-2 py-0.5 text-sm font-medium` + a lucide glyph + factual text).
//
// NON-SHAME (D-04): the 'warning' state uses the `--warning` amber tone ONLY — NEVER the red loss
// tone, no matter how many discrepancies (data trust is not an off-track metric). The 'ok' state is a
// calm neutral/muted pill. Color is NEVER the sole signal — each state carries an icon + factual text.
//
// No "use client": pure RSC markup (no hooks), so it imports cleanly into the StatusBanners server
// component.

export interface ReconcileChipProps {
  status: ReconcileStatus;
}

export function ReconcileChip({ status }: ReconcileChipProps) {
  const isWarning = status.tone === "warning";
  const Icon = isWarning ? TriangleAlert : ShieldCheck;
  const pillClass = isWarning
    ? "bg-amber-400/12 text-[var(--warning)]"
    : "bg-foreground/5 text-[var(--neutral-data)]";

  return (
    <div className="flex w-full items-center border-b border-foreground/10 bg-background px-4 py-2 sm:px-6">
      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-sm font-medium ${pillClass}`}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span>{status.label}</span>
      </span>
    </div>
  );
}
