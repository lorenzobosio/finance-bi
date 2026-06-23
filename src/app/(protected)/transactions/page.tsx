import Link from "next/link";

import { TxTable, type TxRow } from "@/components/transactions/tx-table";
import type { CategoryOption, CostCenterOption } from "@/components/transactions/edit-popover";
import { createClient } from "@/lib/supabase/server";

// Transactions (CAT-04/05, D2-01/02/03) — the dense, server-side keyset-paginated table + the
// inline edit/recategorize popover. ALL reads run through the @supabase/ssr server client
// under the user JWT → the 2-email allowlist RLS authorizes (shared visibility; both users
// may edit any row — cost center is an analytical label, not an access wall). NEVER the
// Drizzle/postgres client and NEVER service_role (RESEARCH Pitfall 3).
//
// Pagination is KEYSET (cursor) on (booking_date, id) — NOT offset (UI-SPEC §5; RESEARCH
// keyset example). The id tiebreaker is mandatory (many tx share a booking date). The cursor
// is parsed/validated server-side before the seek; a malformed cursor falls back to page 1
// (T-02-24 — no raw param concatenated into the query).

const PAGE_SIZE = 50;

/** A validated keyset cursor: seek STRICTLY past (date, id) in descending order. */
interface Cursor {
  date: string;
  id: string;
}

/** Parse `?after=<YYYY-MM-DD>_<uuid>` into a validated cursor, or null (→ first page). */
function parseCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  const sep = raw.indexOf("_");
  if (sep === -1) return null;
  const date = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null;
  return { date, id };
}

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
  accounts: { name: string | null } | { name: string | null }[] | null;
  categories: { name: string | null } | { name: string | null }[] | null;
};

function embedName(rel: { name: string | null } | { name: string | null }[] | null): string | null {
  if (rel === null) return null;
  return Array.isArray(rel) ? (rel[0]?.name ?? null) : rel.name;
}

export default async function TransacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>;
}) {
  const supabase = await createClient();
  const { after } = await searchParams;
  const cursor = parseCursor(after);

  // --- Reads (all under RLS via @supabase/ssr) -----------------------------------------
  // The transactions page, embedding the account + category name. KEYSET seek, ordered by
  // (booking_date, id) DESC. The composite seek is `booking_date < d OR (booking_date = d AND
  // id < id)` — expressed via supabase-js `.or()` (parameterized; no string-built SQL).
  let query = supabase
    .from("transactions")
    .select(
      "id, booking_date, description, description_raw, counterparty, amount_eur, flow_type, category_id, cost_center, accounts(name), categories(name)",
    )
    .order("booking_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1); // fetch one extra to detect a next page

  if (cursor) {
    query = query.or(
      `booking_date.lt.${cursor.date},and(booking_date.eq.${cursor.date},id.lt.${cursor.id})`,
    );
  }

  const { data: txData, error } = await query;

  // Dropdown options: categories + cost centers (both under RLS).
  const { data: catData } = await supabase
    .from("categories")
    .select("id, name")
    .order("name", { ascending: true });
  const { data: ccData } = await supabase
    .from("cost_centers")
    .select("code, label")
    .order("code", { ascending: true });

  if (error) {
    return (
      <p role="alert" className="text-sm text-[var(--loss)]">
        Couldn&apos;t load this view. The data sync may be in progress. Refresh in a moment; if
        it persists, check the connection on Config.
      </p>
    );
  }

  const categories: CategoryOption[] = (catData ?? []).map((c) => ({ id: c.id, name: c.name }));
  const costCenters: CostCenterOption[] = (ccData ?? []).map((cc) => ({
    code: cc.code,
    label: cc.label ?? cc.code,
  }));
  const ccLabelByCode = new Map(costCenters.map((cc) => [cc.code, cc.label]));

  const fetched = (txData ?? []) as TxQueryRow[];
  const hasNext = fetched.length > PAGE_SIZE;
  const pageRows = hasNext ? fetched.slice(0, PAGE_SIZE) : fetched;

  // Count past rows per merchant (within this page) so the popover can show "{n} matching".
  const merchantCounts = new Map<string, number>();
  for (const r of pageRows) {
    const m = r.description ?? r.counterparty ?? r.description_raw ?? "";
    merchantCounts.set(m, (merchantCounts.get(m) ?? 0) + 1);
  }

  const mapped: TxRow[] = pageRows.map((r) => {
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

  // Surface Uncategorized rows FIRST (UI-SPEC §5), preserving the keyset date order within.
  const rows = [
    ...mapped.filter((r) => r.categoryId === null),
    ...mapped.filter((r) => r.categoryId !== null),
  ];

  // Next-page cursor = the last row of THIS page (keyset, not offset).
  const last = pageRows[pageRows.length - 1];
  const nextHref = hasNext && last ? `/transactions?after=${last.booking_date}_${last.id}` : null;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Transactions</h1>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border">
        <TxTable rows={rows} categories={categories} costCenters={costCenters} />
      </div>

      {/* Keyset "next" link — there is no page number (cursor pagination, not offset). */}
      <div className="flex items-center justify-end gap-3">
        {after && (
          <Link
            href="/transactions"
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
