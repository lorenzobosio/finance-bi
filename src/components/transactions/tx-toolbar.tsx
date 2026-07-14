"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Transactions filter/search toolbar (TXN-01, D-04). CLIENT island: it OWNS no data — it reads the
// current URL search params and, on any change, `router.replace`s a new URLSearchParams. The server
// (buildTxQuery under RLS + the is_demo chokepoint) re-reads the params and returns the authoritative
// page, so filters/sort/search are shareable + RSC-friendly. EVERY change also clears `after` so the
// keyset cursor restarts at page 1 (a stale cursor from the previous filter set would skip/dupe rows).

export interface ToolbarOption {
  value: string;
  label: string;
}

// The "All" sentinel — Radix Select.Item cannot carry an empty value, so "All" maps to DELETING the
// param. The "Needs review" chip uses the uncategorized sentinel (mirrors query.ts UNCATEGORIZED).
const ALL = "__all__";
const UNCATEGORIZED = "__uncategorized__";

const FLOW_OPTIONS: ToolbarOption[] = [
  { value: "revenue", label: "Revenue" },
  { value: "cost", label: "Cost" },
  { value: "investimento", label: "Investment" },
  { value: "transferencia", label: "Transfer" },
];

export function TxToolbar({
  categories,
  costCenters,
  accounts,
  demo = false,
}: {
  categories: ToolbarOption[];
  costCenters: ToolbarOption[];
  accounts: ToolbarOption[];
  // Demo/anon session — the export button is hidden (the route 403s anyway; belt & braces, D-05).
  demo?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Push a mutated copy of the current params; ALWAYS reset the keyset cursor (`after`).
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === ALL || value === "") next.delete(key);
      else next.set(key, value);
      next.delete("after"); // reset keyset → page 1 on any filter/search change
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  const category = searchParams.get("category") ?? "";
  const needsReview = category === UNCATEGORIZED;

  // Debounced free-text search — a controlled input pushed 300ms after the last keystroke so we
  // don't navigate on every character. Seeded from the URL (shareable / back-button correct).
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Keep the input in sync when the URL changes externally (Clear filters, back button).
    setQ(searchParams.get("q") ?? "");
  }, [searchParams]);

  function onSearch(value: string) {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParam("q", value.trim() || null), 300);
  }

  const hasFilters =
    searchParams.has("category") ||
    searchParams.has("cost_center") ||
    searchParams.has("account") ||
    searchParams.has("flow") ||
    searchParams.has("from") ||
    searchParams.has("to") ||
    searchParams.has("q");

  // The CSV export carries the ACTIVE filters/sort but DROPS the keyset cursor (`after`) — the
  // export is the FULL filtered set, so starting mid-keyset would skip the earlier rows.
  const exportParams = new URLSearchParams(searchParams.toString());
  exportParams.delete("after");
  const exportQs = exportParams.toString();
  const exportHref = `/api/transactions/export${exportQs ? `?${exportQs}` : ""}`;

  return (
    <div className="space-y-3">
      {/* Row 1: the selects + the date range. */}
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          id="tx-category"
          label="Category"
          placeholder="All categories"
          value={needsReview ? "" : category}
          options={categories}
          onChange={(v) => setParam("category", v)}
        />
        <FilterSelect
          id="tx-cost-center"
          label="Cost center"
          placeholder="All cost centers"
          value={searchParams.get("cost_center") ?? ""}
          options={costCenters}
          onChange={(v) => setParam("cost_center", v)}
        />
        <FilterSelect
          id="tx-account"
          label="Account"
          placeholder="All accounts"
          value={searchParams.get("account") ?? ""}
          options={accounts}
          onChange={(v) => setParam("account", v)}
        />
        <FilterSelect
          id="tx-flow"
          label="Flow"
          placeholder="All flows"
          value={searchParams.get("flow") ?? ""}
          options={FLOW_OPTIONS}
          onChange={(v) => setParam("flow", v)}
        />

        <div className="space-y-1.5">
          <Label htmlFor="tx-from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="tx-from"
            type="date"
            className="w-[9.5rem]"
            value={searchParams.get("from") ?? ""}
            onChange={(e) => setParam("from", e.target.value || null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tx-to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="tx-to"
            type="date"
            className="w-[9.5rem]"
            value={searchParams.get("to") ?? ""}
            onChange={(e) => setParam("to", e.target.value || null)}
          />
        </div>
      </div>

      {/* Row 2: the search input + the "Needs review" chip + Clear + the CSV export slot (08-05). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search description or counterparty…"
            aria-label="Search transactions"
            className="pl-8"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        {/* "Needs review" (Uncategorized) — a SERVER filter (category=__uncategorized__), not a
            post-fetch pin (Pitfall 6): server sort is authoritative. */}
        <Button
          type="button"
          size="sm"
          variant={needsReview ? "default" : "outline"}
          aria-pressed={needsReview}
          onClick={() => setParam("category", needsReview ? null : UNCATEGORIZED)}
          className={cn(needsReview && "font-medium")}
        >
          Needs review
        </Button>

        {hasFilters && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => router.replace(pathname)}
          >
            <X className="size-3.5" aria-hidden />
            Clear filters
          </Button>
        )}

        {/* CSV export (TXN-02, D-05) — an owner-only download of the CURRENTLY-FILTERED real set.
            A plain anchor to the Route Handler (Content-Disposition attachment), carrying the active
            filters/sort. Hidden in demo mode (the route 403s regardless — belt & braces). */}
        {!demo && (
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <a href={exportHref} aria-label="Export the filtered transactions to CSV">
              <Download className="size-3.5" aria-hidden />
              Export CSV
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  placeholder,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  options: ToolbarOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value || ALL} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-[11rem]" aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
