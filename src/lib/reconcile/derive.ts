// src/lib/reconcile/derive.ts — the PURE data-trust chip-status derivation (DAT-02, D-04).
//
// PURE (mirrors the deriveFreshness style in src/lib/status/connection-status.ts): no I/O, no imports.
// Maps the open-flag COUNT to a factual, NON-SHAME chip status.
//
// NON-SHAME invariant (load-bearing): the reconcile chip is FACTUAL, never red-shaming —
//   0 open flags → tone 'ok'   + "All reconciled"        (a neutral/muted pill)
//   N>0 open     → tone 'warning' (amber) + "N discrepancies — review"
// The tone is NEVER a loss/red tone, no matter how many discrepancies (mirrors the anomaly-chip
// non-shame convention; the KpiTone loss/red is reserved for genuine off-track metrics, not data
// trust). The 'warning' tone maps to the amber --warning token in the chip.

export type ReconcileTone = "ok" | "warning";

export interface ReconcileStatus {
  /** 'ok' (all reconciled) or 'warning' (amber) — NEVER a loss/red tone. */
  tone: ReconcileTone;
  /** The number of open discrepancy flags in the active partition. */
  count: number;
  /** Factual, non-shame chip copy. */
  label: string;
}

/**
 * deriveReconcileStatus — map an open-flag count to the chip status. 0 → reconciled/ok; N>0 →
 * warning naming the count ("1 discrepancy — review" / "N discrepancies — review"). Pure.
 */
export function deriveReconcileStatus(openCount: number): ReconcileStatus {
  const count = Math.max(0, Math.trunc(openCount));
  if (count === 0) {
    return { tone: "ok", count: 0, label: "All reconciled" };
  }
  const noun = count === 1 ? "discrepancy" : "discrepancies";
  return { tone: "warning", count, label: `${count} ${noun} — review` };
}
