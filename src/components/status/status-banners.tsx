import { getConnectionStatus } from "@/lib/status/connection-status";

import { FreshnessBanner } from "./freshness-banner";
import { ReconnectBanner } from "./reconnect-banner";

// The global status-banner layout slot (UI-SPEC Placement). A Server Component that reads
// the live connection state via getConnectionStatus() (RLS, user JWT — never service_role)
// and renders the two banners full-bleed at the top of the authenticated app shell:
//   1. ReconnectBanner first (top) — higher-urgency, action-required (shown only if needed)
//   2. FreshnessBanner second (below) — always shown
// Static (scrolls with the page) for Phase 1, stacked vertically, no gap between them
// (each carries its own bottom border for separation).

export async function StatusBanners() {
  // FreshnessBanner re-derives fresh/stale/unknown from lastSyncAt itself; the slot only
  // needs lastSyncAt + needsReconnect.
  const { lastSyncAt, needsReconnect } = await getConnectionStatus();

  return (
    <div className="w-full">
      <ReconnectBanner needsReconnect={needsReconnect} />
      <FreshnessBanner lastSyncAt={lastSyncAt} />
    </div>
  );
}
