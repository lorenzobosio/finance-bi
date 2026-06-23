import { BudgetEditor, type BudgetRow } from "@/components/budget-editor";
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
    <div className="space-y-12">
      <header>
        <h1 className="text-xl font-semibold">Config</h1>
      </header>

      {/* --- Budgets editor (BI-06, D2-12/13) --- */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Budgets</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set a monthly budget per cost center. Budgets start empty — use{" "}
            <span className="font-medium">Set from history</span> to prefill last month&apos;s
            actual.
          </p>
        </div>
        <BudgetEditor
          rows={rows}
          periodKey={period}
          priorPeriodKey={previousPeriodKey(period)}
        />
      </section>

      {/* --- Reconnect / consent pointer (the banner itself is in the shell) --- */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Connection</h2>
        <p className="text-sm text-muted-foreground">
          Bank consent is re-authorized here. If the sync banner above shows a reconnect prompt,
          follow it to renew access — open banking consent lapses periodically.
        </p>
      </section>
    </div>
  );
}
