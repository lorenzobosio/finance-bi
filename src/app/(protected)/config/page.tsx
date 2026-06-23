import { BudgetEditor, type BudgetRow } from "@/components/budget-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { currentPeriodKey, previousPeriodKey } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

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
  searchParams: Promise<{ period?: string }>;
}) {
  const supabase = await createClient();
  const now = new Date();
  const currentKey = currentPeriodKey(now);
  const { period: rawPeriod } = await searchParams;
  const period = parsePeriod(rawPeriod, currentKey);

  // Read existing cost-center-grain budgets for the selected period (under RLS).
  const { data: budgetRows, error } = await supabase
    .from("budgets")
    .select("cost_center, category_id, period_key, amount_eur")
    .eq("period_key", period)
    .is("category_id", null);

  if (error) {
    return (
      <p role="alert" className="text-sm text-[var(--loss)]">
        Couldn&apos;t load this view. The data sync may be in progress. Refresh in a moment;
        if it persists, check the connection on Config.
      </p>
    );
  }

  // Build one editor row per household cost center — "not set" when no budget row exists
  // (D2-12: the absence of a row is the not-set state, never a synthesized €0 cap).
  const rows: BudgetRow[] = HOUSEHOLD_CENTERS.map((cc) => {
    const existing = (budgetRows ?? []).find((b) => b.cost_center === cc.code);
    return {
      costCenter: cc.code,
      name: cc.name,
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

      {/* Three tabs (Budgets · Rules · Connection), each a Card surface (UI-SPEC §Re-Skin Map). */}
      <Tabs defaultValue="budgets" className="gap-4">
        <TabsList>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
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
            <CardContent>
              {/* Demo-mode slot — wiring lands in Phase 4 (disabled placeholder this phase). */}
              <div className="flex items-center gap-3 opacity-60">
                <Switch id="demo-mode" disabled aria-describedby="demo-mode-hint" />
                <Label htmlFor="demo-mode" className="text-sm">
                  Demo mode
                </Label>
                <span id="demo-mode-hint" className="text-xs text-muted-foreground">
                  Coming soon — Phase 4
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
