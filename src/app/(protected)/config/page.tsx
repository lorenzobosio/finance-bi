import { cookies } from "next/headers";

import { BudgetEditor, type BudgetRow } from "@/components/budget-editor";
import { DemoToggle } from "@/components/demo-toggle";
import { ThresholdsEditor } from "@/components/thresholds-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { costCenterDisplayName } from "@/lib/cost-center-display";
import { DEMO_MODE_COOKIE, isDemoForReads } from "@/lib/demo/mode";
import {
  readInsightThresholds,
  type InsightThresholdsReadClient,
} from "@/lib/health/thresholds";
import { currentPeriodKey, previousPeriodKey } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

/** The Config tabs whose value `?tab=` may deep-link into (D4-22); fall back to budgets. */
const VALID_TABS = ["budgets", "rules", "connection", "thresholds"] as const;
function parseTab(raw: string | undefined): (typeof VALID_TABS)[number] {
  return (VALID_TABS as readonly string[]).includes(raw ?? "")
    ? (raw as (typeof VALID_TABS)[number])
    : "budgets";
}

// Config (BI-06, D2-12/13/14).
//
// The budgets editor: one editable € input per household cost center, starting empty/€0 (no
// hardcoded amounts committed, D2-12) with a "Set from history" prefill (D2-13). Writes go
// through the `setBudget` Server Action under the allowlist RLS (the FIRST write plane).
//
// Reconnect / consent: the existing Phase-1 ReconnectBanner is already mounted ONCE in the
// protected shell (StatusBanners) and shows on every page when consent expired — Config is
// where the user re-auths, so we surface a pointer to it rather than double-mounting the banner.
//
// Reads go through the @supabase/ssr server client under the user JWT + RLS — NEVER the
// Drizzle/postgres client and NEVER service_role (T-02-16 / RESEARCH Pitfall 3).

const HOUSEHOLD_CENTERS = [
  { code: "lorenzo", name: "Lorenzo" },
  { code: "fernanda", name: "Fernanda" },
  { code: "compartilhado", name: "Shared" },
] as const;

/** Parse/clamp the raw ?period search param to a valid YYYYMM int (mirrors Home, T-02-12). */
function parsePeriod(raw: string | undefined, currentKey: number): number {
  if (!raw || !/^\d{6}$/.test(raw)) return currentKey;
  const key = Number(raw);
  const month = key % 100;
  if (month < 1 || month > 12) return currentKey;
  if (key > currentKey) return currentKey;
  return key;
}

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; tab?: string }>;
}) {
  const supabase = await createClient();
  const now = new Date();
  const currentKey = currentPeriodKey(now);
  const { period: rawPeriod, tab: rawTab } = await searchParams;
  const period = parsePeriod(rawPeriod, currentKey);
  const activeTab = parseTab(rawTab);

  // Read the current demo-mode state from the cookie so the toggle renders its initial position
  // (the per-request MODE chokepoint owns the source of truth — D4-12).
  const cookieStore = await cookies();
  const demoEnabled = cookieStore.get(DEMO_MODE_COOKIE)?.value === "1";

  // Read existing cost-center-grain budgets for the selected period (under RLS), partitioned by
  // is_demo (D4-12) — demoEnabled is the owner's per-request demo-mode cookie (same chokepoint).
  const { data: budgetRows, error } = await supabase
    .from("budgets")
    .select("cost_center, category_id, period_key, amount_eur")
    .eq("period_key", period)
    .eq("is_demo", demoEnabled)
    .is("category_id", null);

  if (error) {
    return (
      <p role="alert" className="text-sm text-[var(--loss)]">
        Couldn&apos;t load this view. The data sync may be in progress. Refresh in a moment;
        if it persists, check the connection on Config.
      </p>
    );
  }

  // Read the current scorecard bands for the active partition (D-07). The insight_thresholds read
  // lives INSIDE `readInsightThresholds` (external module), is_demo-scoped by the passed demoFilter;
  // the seeded DEFAULT_BANDS back the editor when no row exists yet. Reads stay on the @supabase/ssr
  // seam (never the Drizzle/postgres client, never service_role).
  const bands = await readInsightThresholds(
    supabase as unknown as InsightThresholdsReadClient,
    await isDemoForReads(),
  );

  // Build one editor row per household cost center — "not set" when no budget row exists
  // (D2-12: the absence of a row is the not-set state, never a synthesized €0 cap).
  const rows: BudgetRow[] = HOUSEHOLD_CENTERS.map((cc) => {
    const existing = (budgetRows ?? []).find((b) => b.cost_center === cc.code);
    return {
      costCenter: cc.code,
      // Demo-mode display remap: person LABEL becomes the anonymized persona (Alice/Bob); the
      // FK code/partition is unchanged (display-only — D4-08/26). Shared stays "Shared".
      name: costCenterDisplayName(cc.code, cc.name, demoEnabled),
      categoryId: null,
      amount: num(existing?.amount_eur),
      isSet: !!existing,
    };
  });

  return (
    <div className="@container/main space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Config</h1>
      </header>

      {/* Workspace — the owner-only demo-mode toggle + the onboarding re-surface affordance
          (Surface 3a). A top-level Card, not inside a tab. The toggle writes the demo_mode cookie
          the single chokepoint reads; the persistent DEMO DATA banner appears in the shell. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Workspace
          </CardTitle>
          <CardDescription>
            Explore the app with a seeded sample household, or re-surface the setup checklist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DemoToggle initialEnabled={demoEnabled} />
        </CardContent>
      </Card>

      {/* Three tabs (Budgets · Rules · Connection), each a Card surface (UI-SPEC §Re-Skin Map).
          ?tab= deep-links into a tab (D4-22); the value falls back to "budgets". */}
      <Tabs defaultValue={activeTab} className="gap-4">
        <TabsList className="min-h-11">
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="thresholds">Health bands</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="connection">Connection</TabsTrigger>
        </TabsList>

        {/* --- Budgets editor (BI-06, D2-12/13) --- */}
        <TabsContent value="budgets">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Budgets
              </CardTitle>
              <CardDescription>
                Set a monthly budget per cost center. Budgets start empty — use{" "}
                <span className="font-medium">Set from history</span> to prefill last
                month&apos;s actual.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BudgetEditor
                rows={rows}
                periodKey={period}
                priorPeriodKey={previousPeriodKey(period)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Health bands editor (scorecard thresholds, D-07) --- */}
        <TabsContent value="thresholds">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Health bands
              </CardTitle>
              <CardDescription>
                Tune what <span className="font-medium">healthy</span>,{" "}
                <span className="font-medium">watch</span>, and{" "}
                <span className="font-medium">off-track</span> mean for the Financial-Health
                scorecard. Save to retune Home and{" "}
                <span className="font-medium">/health</span>, or reset to the seeded defaults.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ThresholdsEditor current={bands} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Rules (created inline on Transactions in Phase 2; a dedicated CRUD is Phase 8) --- */}
        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Rules
              </CardTitle>
              <CardDescription>
                Auto-categorization rules are created inline on the Transactions page — edit a
                row, then toggle{" "}
                <span className="font-medium">Also create a rule for future {`{merchant}`}</span>.
                Past transactions keep their categories unless you explicitly re-apply.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>

        {/* --- Reconnect / consent pointer (the banner itself is in the shell) --- */}
        <TabsContent value="connection">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Connection
              </CardTitle>
              <CardDescription>
                Bank consent is re-authorized here. If the sync banner above shows a reconnect
                prompt, follow it to renew access — open banking consent lapses periodically.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
