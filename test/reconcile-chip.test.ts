import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (DAT-02, D-04) — freezes the PURE data-trust chip-derivation contract for the
// not-yet-existent `@/lib/reconcile/derive` (built GREEN in 07-03). RED at RUNTIME (module does not
// resolve); the COMPUTED import specifier keeps `tsc --noEmit` green. Mirrors the `deriveFreshness`
// pure-derivation style in `src/lib/status/connection-status.ts`.
//
// NON-SHAME invariant (the load-bearing one): the reconcile chip is FACTUAL, never red-shaming —
// 0 open flags reads "reconciled" (tone 'ok'); N>0 reads "N discrepancies" (tone 'warning', amber).
// The tone is NEVER a loss/red tone, no matter how many discrepancies (mirrors the anomaly-chip
// non-shame convention; KpiTone loss/red is reserved for genuine off-track metrics, not data trust).

const MODULE = "@/lib/reconcile/derive";

interface ReconcileStatus {
  tone: string;
  label: string;
}

async function loadDerive(): Promise<(openCount: number) => ReconcileStatus> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return mod.deriveReconcileStatus as (openCount: number) => ReconcileStatus;
}

describe("deriveReconcileStatus — 0 open flags → reconciled/ok", () => {
  it("returns tone 'ok' with reconciled copy", async () => {
    const derive = await loadDerive();
    const status = derive(0);
    expect(status.tone).toBe("ok");
    expect(status.label).toMatch(/reconcil/i);
  });
});

describe("deriveReconcileStatus — N>0 open flags → warning naming the count", () => {
  it("returns tone 'warning' and names the discrepancy count", async () => {
    const derive = await loadDerive();
    const status = derive(3);
    expect(status.tone).toBe("warning");
    expect(status.label).toMatch(/3/);
  });
});

describe("deriveReconcileStatus — NEVER a loss/red tone (non-shame)", () => {
  it("uses only factual amber/neutral tones for any count", async () => {
    const derive = await loadDerive();
    for (const n of [0, 1, 5, 42]) {
      expect(derive(n).tone).not.toBe("loss");
    }
  });
});
