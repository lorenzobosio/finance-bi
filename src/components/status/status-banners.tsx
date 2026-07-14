import { isDemoForReads } from "@/lib/demo/mode";
import { deriveReconcileStatus } from "@/lib/reconcile/derive";
import { readOpenReconcileFlags, type ReconcileReadClient } from "@/lib/reconcile/read";
import { getConnectionStatus } from "@/lib/status/connection-status";
import { createClient } from "@/lib/supabase/server";

import { FreshnessBanner } from "./freshness-banner";
import { ReconcileChip } from "./reconcile-chip";
import { ReconnectBanner } from "./reconnect-banner";

// The global status-banner layout slot (UI-SPEC Placement). A Server Component that reads
// the live connection state via getConnectionStatus() (RLS, user JWT — never the elevated
// service key) and renders the banners full-bleed at the top of the authenticated app shell:
//   1. ReconnectBanner first (top) — higher-urgency, action-required (shown only if needed)
//   2. FreshnessBanner second (below) — always shown
//   3. ReconcileChip third — the DAT-02 non-shame data-trust chip (demo-partitioned)
// Static (scrolls with the page), stacked vertically, no gap (each carries its own bottom border).

export async function StatusBanners() {
  // FreshnessBanner re-derives fresh/stale/unknown from lastSyncAt itself; the slot only
  // needs lastSyncAt + needsReconnect.
  const { lastSyncAt, needsReconnect } = await getConnectionStatus();

  // The reconciliation chip reads the OPEN flags for the ACTIVE partition under the user JWT + RLS
  // (never the elevated service key), is_demo-scoped (T-07-05) so a real read never sees demo flags.
  const supabase = await createClient();
  const demoFilter = await isDemoForReads();
  const { openCount } = await readOpenReconcileFlags(
    supabase as unknown as ReconcileReadClient,
    demoFilter,
  );
  const reconcileStatus = deriveReconcileStatus(openCount);

  return (
    <div className="w-full">
      <ReconnectBanner needsReconnect={needsReconnect} />
      <FreshnessBanner lastSyncAt={lastSyncAt} />
      <ReconcileChip status={reconcileStatus} />
    </div>
  );
}
