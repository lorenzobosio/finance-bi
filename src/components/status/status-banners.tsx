import { costCenterDisplayName } from "@/lib/cost-center-display";
import { demoAwareNow, isDemoForReads } from "@/lib/demo/mode";
import { detectAnomalies } from "@/lib/health/anomaly";
import { currentPeriodKey } from "@/lib/period";
import { deriveReconcileStatus } from "@/lib/reconcile/derive";
import { readOpenReconcileFlags, type ReconcileReadClient } from "@/lib/reconcile/read";
import { getConnectionStatus } from "@/lib/status/connection-status";
import {
  deriveIngestHealth,
  readLastIngestAt,
  type IngestHealthReadClient,
} from "@/lib/status/ingest-health";
import { buildOverspendView, type OverspendView } from "@/lib/status/overspend-view";
import {
  buildStaleIngestionView,
  type StaleIngestionView,
} from "@/lib/status/stale-ingestion-view";
import { createClient } from "@/lib/supabase/server";

import { FreshnessBanner } from "./freshness-banner";
import { OverspendBanner } from "./overspend-banner";
import { ReconcileChip } from "./reconcile-chip";
import { ReconnectBanner } from "./reconnect-banner";
import { StaleIngestionBanner } from "./stale-ingestion-banner";

// The global status-banner layout slot (UI-SPEC Placement / §"Banner stacking order"). A Server
// Component that reads the live status signals under the owner JWT + RLS (NEVER the elevated service
// key), is_demo-partitioned, and renders the banners full-bleed at the top of the authenticated shell:
//   1|3. ReconnectBanner (expired-destructive OR expiring-amber — one element, expired supersedes)
//   2.   StaleIngestionBanner (the loud dead-man's-switch)
//   4.   OverspendBanner (the calm, non-shame budget nudge)
//   5.   FreshnessBanner ("data as of {date}" — always-on trust strip)
//   6.   ReconcileChip (the DAT-02 data-trust pill)
// Static (scrolls with the page), stacked vertically, no gap (each carries its own bottom border).
//
// THE CLOCK SPLIT is load-bearing (Pitfall 3): the reconnect expiry countdown AND the ingest
// staleness are REAL-TIME facts computed on `new Date()`, while overspend is computed on the
// demo-aware clock (demoAwareNow) so demo and real agree with Home. Every read is tolerant — a
// failed read degrades ITS banner to hidden, never crashes the shell.

/** numeric columns arrive from the DB as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function StatusBanners() {
  // REAL clock — the expiry countdown + ingest staleness are real-time facts, NEVER demoAwareNow.
  const realNow = new Date();
  const { lastSyncAt, expiresInDays, reconnectState } = await getConnectionStatus(realNow);

  const supabase = await createClient();
  const demoFilter = await isDemoForReads();

  // Reconcile (existing) — the OPEN flags for the ACTIVE partition under the user JWT + RLS,
  // is_demo-scoped (T-07-05) so a real read never sees demo flags.
  const { openCount } = await readOpenReconcileFlags(
    supabase as unknown as ReconcileReadClient,
    demoFilter,
  );
  const reconcileStatus = deriveReconcileStatus(openCount);

  // OVERSPEND (demo-aware clock, REM-02) — match the Home call site EXACTLY so demo and real agree
  // (Pitfall 1 — is_demo threaded, correct period_key/clock). Read the current period's cost-center
  // budget-vs-actual, feed the SAME pure detector Home uses, and build the calm view. A failed read
  // degrades the banner to hidden.
  const overspendNow = demoAwareNow(demoFilter, realNow);
  const currentKey = currentPeriodKey(overspendNow);
  let overspendView: OverspendView = {
    show: false,
    primaryLabel: "",
    extraCount: 0,
    scopes: [],
  };
  try {
    const { data: bvaRows } = await supabase
      .from("v_costcenter_bva")
      .select("cost_center, category_id, period_key, budget, actual")
      .eq("period_key", currentKey)
      .eq("is_demo", demoFilter)
      .is("category_id", null);

    // monthsWithData — the distinct populated-period count (a cheap read mirroring Home's
    // v_pnl_monthly probe). It gates only the (currently no-op) statistical-spike branch of
    // detectAnomalies, so it never affects the budget-relative overspend flags this banner shows.
    const { data: periodRows } = await supabase
      .from("v_pnl_monthly")
      .select("period_key")
      .eq("is_demo", demoFilter);
    const monthsWithData = new Set((periodRows ?? []).map((r) => Number(r.period_key))).size;

    const flags = detectAnomalies(
      (bvaRows ?? []).map((r) => ({
        costCenter: r.cost_center,
        budget: num(r.budget),
        actual: num(r.actual),
      })),
      [],
      overspendNow,
      monthsWithData,
    ).slice(0, 2);

    // scope code → display name (demo-remapped Alice/Bob on the public deploy — display-only).
    const labels: Record<string, string> = {
      lorenzo: costCenterDisplayName("lorenzo", "Lorenzo", demoFilter),
      fernanda: costCenterDisplayName("fernanda", "Fernanda", demoFilter),
      compartilhado: costCenterDisplayName("compartilhado", "Shared", demoFilter),
    };
    overspendView = buildOverspendView(flags, labels);
  } catch {
    // A failed overspend read degrades to the hidden view — never crashes the shell.
  }

  // STALE INGESTION (real clock, REM-03) — the dead-man's-switch heartbeat over import_batches.
  let staleView: StaleIngestionView = { show: false };
  try {
    const lastIngestAt = await readLastIngestAt(supabase as unknown as IngestHealthReadClient);
    staleView = buildStaleIngestionView(deriveIngestHealth(lastIngestAt, realNow));
  } catch {
    // A failed heartbeat read degrades to hidden.
  }

  // The reconnect surface is a REAL-connection fact — the demo build never surfaces it (D-04): there
  // is no real connection to reconnect, and the CTA's start route 403s a demo caller anyway.
  const reconnectStateForRender = demoFilter ? "none" : reconnectState;

  return (
    <div className="w-full">
      <ReconnectBanner reconnectState={reconnectStateForRender} expiresInDays={expiresInDays} />
      <StaleIngestionBanner view={staleView} />
      <OverspendBanner view={overspendView} periodKey={String(currentKey)} />
      <FreshnessBanner lastSyncAt={lastSyncAt} />
      <ReconcileChip status={reconcileStatus} />
    </div>
  );
}
