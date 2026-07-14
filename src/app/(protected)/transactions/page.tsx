import Link from "next/link";

import { TxTable, type TxRow } from "@/components/transactions/tx-table";
import { TxToolbar, type ToolbarOption } from "@/components/transactions/tx-toolbar";
import type { CategoryOption, CostCenterOption } from "@/components/transactions/edit-popover";
import { Card } from "@/components/ui/card";
import { costCenterDisplayName } from "@/lib/cost-center-display";
import { createClient } from "@/lib/supabase/server";
import { isDemoForReads } from "@/lib/demo/mode";
import { PAGE_SIZE, buildTxQuery, encodeCursor, parseTxParams } from "@/lib/transactions/query";

// Transactions (CAT-04/05, D2-01/02/03, TXN-01/03) — the dense, server-side TanStack power table +
// the inline edit/recategorize popover. ALL reads run through the @supabase/ssr server client under
// the user JWT → the 2-email allowlist RLS authorizes (shared visibility; both users may edit any
// row — cost center is an analytical label, not an access wall). NEVER the Drizzle/postgres client
// and NEVER service_role (RESEARCH Pitfall 3).
//
// The read is composed by buildTxQuery (src/lib/transactions/query.ts): zod-parsed + allowlisted +
// esc()-neutralized filters/sort/search, always partitioned by `.eq('is_demo', demoFilter)`, and
// paginated by the GENERALIZED KEYSET cursor (active sort column + id) — NOT offset (UI-SPEC §5;
// Pitfalls 3/4). Filters/sort/search live in URL search params (shareable, RSC re-reads).

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

type TxQueryRow = {
  id: string;
  booking_date: string;
  description: string | null;
  description_raw: string | null;
  counterparty: string | null;
  amount_eur: string | number | null;
  flow_type: string | null;
  category_id: string | null;
  cost_center: string | null;
  account_id: string | null;
  accounts: { name: string | null } | { name: string | null }[] | null;
  categories: { name: string | null } | { name: string | null }[] | null;
};

function embedName(rel: { name: string | null } | { name: string | null }[] | null): string | null {
  if (rel === null) return null;
  return Array.isArray(rel) ? (rel[0]?.name ?? null) : rel.name;
}

/** Normalize a raw Next searchParams entry (string | string[] | undefined) to a single string. */
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function TransacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const raw = await searchParams;

  // Flatten to a plain record, then zod-parse → validated, injection-safe params (allowlisted
  // sort/dir, esc()-able search, format-checked cursor). A malformed param falls back to a default.
  const record: Record<string, string | undefined> = {};
  for (const k of Object.keys(raw)) record[k] = first(raw[k]);
  const params = parseTxParams(record);

  // Demo-mode partition selector (D4-12) — every read below threads `.eq('is_demo', demoFilter)`.
  const demoFilter = await isDemoForReads();

  // --- The page rows: buildTxQuery under RLS, fetch PAGE_SIZE+1 to detect the next keyset page ---
  const { data: txData, error } = await buildTxQuery(supabase, params, demoFilter);

  // Dropdown options: categories + cost centers + accounts (all under RLS; accounts is_demo-gated).
  const { data: catData } = await supabase
    .from("categories")
    .select("id, name")
    .order("name", { ascending: true });
  const { data: ccData } = await supabase
    .from("cost_centers")
    .select("code, label")
    .order("code", { ascending: true });
  const { data: acctData } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("is_demo", demoFilter)
    .order("name", { ascending: true });

  if (error) {
    return (
      <p role="alert" className="text-sm text-[var(--loss)]">
        Couldn&apos;t load this view. The data sync may be in progress. Refresh in a moment; if
        it persists, check the connection on Config.
      </p>
    );
  }

  const categories: CategoryOption[] = (catData ?? []).map((c) => ({ id: c.id, name: c.name }));
  // Demo-mode display remap: person cost-center LABELS become the anonymized persona (Alice/Bob);
  // the FK codes/partition are unchanged (display-only — D4-08/26). Shared/Sublet stay generic.
  const costCenters: CostCenterOption[] = (ccData ?? []).map((cc) => ({
    code: cc.code,
    label: costCenterDisplayName(cc.code, cc.label ?? cc.code, demoFilter),
  }));
  const ccLabelByCode = new Map(costCenters.map((cc) => [cc.code, cc.label]));

  // Toolbar option lists (the account name is already anon-safe in the demo partition — D-06).
  const categoryOptions: ToolbarOption[] = categories.map((c) => ({ value: c.id, label: c.name }));
  const costCenterOptions: ToolbarOption[] = costCenters.map((cc) => ({
    value: cc.code,
    label: cc.label,
  }));
  const accountOptions: ToolbarOption[] = (acctData ?? []).map((a) => ({
    value: a.id,
    label: a.name,
  }));

  const fetched = (txData ?? []) as TxQueryRow[];
  const hasNext = fetched.length > PAGE_SIZE;
  const pageRows = hasNext ? fetched.slice(0, PAGE_SIZE) : fetched;

  // Count past rows per merchant (within this page) so the popover can show "{n} matching".
  const merchantCounts = new Map<string, number>();
  for (const r of pageRows) {
    const m = r.description ?? r.counterparty ?? r.description_raw ?? "";
    merchantCounts.set(m, (merchantCounts.get(m) ?? 0) + 1);
  }

  // Server sort is authoritative — no post-fetch re-sort. Uncategorized-first is now the toolbar's
  // "Needs review" filter (server-side, Pitfall 6), NOT a client re-order of the page.
  const rows: TxRow[] = pageRows.map((r) => {
    const merchant = r.description ?? r.counterparty ?? r.description_raw ?? "Unknown";
    return {
      id: r.id,
      bookingDate: r.booking_date,
      merchant,
      accountName: embedName(r.accounts),
      categoryId: r.category_id,
      categoryName: embedName(r.categories),
      costCenter: r.cost_center,
      costCenterLabel: r.cost_center ? (ccLabelByCode.get(r.cost_center) ?? r.cost_center) : null,
      amountEur: num(r.amount_eur),
      flowType: r.flow_type,
      matchingPastCount: merchantCounts.get(merchant) ?? 0,
    };
  });

  // Next-page cursor = the LAST row's ACTIVE-sort value + id (keyset, generalized — never offset).
  const last = pageRows[pageRows.length - 1];
  let nextHref: string | null = null;
  if (hasNext && last) {
    const value = params.sort === "amount_eur" ? String(last.amount_eur) : last.booking_date;
    const nextParams = new URLSearchParams();
    for (const k of Object.keys(record)) {
      if (k !== "after" && record[k]) nextParams.set(k, record[k] as string);
    }
    nextParams.set("after", encodeCursor({ value, id: last.id }));
    nextHref = `/transactions?${nextParams.toString()}`;
  }

  // "First page" preserves the filters/sort but drops the keyset cursor.
  const firstParams = new URLSearchParams();
  for (const k of Object.keys(record)) {
    if (k !== "after" && record[k]) firstParams.set(k, record[k] as string);
  }
  const firstHref = firstParams.toString() ? `/transactions?${firstParams.toString()}` : "/transactions";

  return (
    <div className="@container/main space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Transactions</h1>
      </header>

      <TxToolbar
        categories={categoryOptions}
        costCenters={costCenterOptions}
        accounts={accountOptions}
        demo={demoFilter}
      />

      {/* The dense table SHELL inside a Card surface (the table owns its own scroll + the
          mobile stacked-card variant). No padding so the rows reach the card edge. */}
      <Card className="py-0 [--card-spacing:0px]">
        <TxTable rows={rows} categories={categories} costCenters={costCenters} />
      </Card>

      {/* Keyset "next" link — there is no page number (cursor pagination, not offset). */}
      <div className="flex items-center justify-end gap-3">
        {record.after && (
          <Link
            href={firstHref}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            First page
          </Link>
        )}
        {nextHref && (
          <Link
            href={nextHref}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Next 50 →
          </Link>
        )}
      </div>
    </div>
  );
}
