// src/components/goal/remittance-section.tsx — Fernanda's EUR≈BRL remittance view (BRL-01, UI-SPEC §4).
//
// An async Server Component that reads the latest `fx_rates` ITSELF, threading `.eq("is_demo", …)` on
// its own read (Pitfall 3 / T-12-15) — a missing filter would blend the seeded demo rates into the
// real household's figures (the Phase-4 "5.038 → 61.038" blend class, at the FX boundary). Reads go
// through @supabase/ssr under RLS — never service_role, never the marts module.
//
// The load-bearing contract: a converted figure NEVER appears bare. The primary `{€} ≈ {R$}` line is
// ALWAYS accompanied by the mandatory provenance line `EUR/BRL {rate} · as of {date}`, and the EUR/USD
// context line carries the ETF's USD exposure with the same discipline. The card is CALM — --card
// surface + --neutral-data text, never brand violet, never a gain/loss color (a conversion is
// informational, not a performance signal). No rate row → the honest "no rate yet" copy, never a
// bare/stale number. All money flows through formatEUR/formatBRL (no hand-rolled Intl).

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { latestRate, remittanceView } from "@/lib/fx/convert";
import type { FxRow } from "@/lib/fx/parse-ecb";
import { formatBRL, formatEUR } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Render a quote-per-EUR reference rate in the de-DE convention (comma decimal, 2–4 dp). A rate is a
 * ratio, NOT money, so it does not route through formatEUR/formatBRL — `toLocaleString` mirrors how the
 * page already formats non-money scalars (dates), keeping every `new Intl.NumberFormat` in format.ts.
 */
function rateLabel(rate: number): string {
  return rate.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export async function RemittanceSection({
  amountEur,
  demoFilter,
}: {
  amountEur: number;
  demoFilter: boolean;
}) {
  const supabase = await createClient();

  // Self-read the latest FX rows, partitioned to ONE partition (Pitfall 3 / demo-read-filter guard).
  const { data: fxRows } = await supabase
    .from("fx_rates")
    .select("base, quote, rate_date, rate")
    .eq("is_demo", demoFilter);

  const rows: FxRow[] = (fxRows ?? []).map((r) => ({
    base: "EUR" as const,
    quote: r.quote as string,
    rateDate: r.rate_date as string,
    rate: num(r.rate),
  }));

  const latestBrl = latestRate(rows, "BRL");
  const latestUsd = latestRate(rows, "USD");
  const view = remittanceView(amountEur, latestBrl);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          In Brazilian reais
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {view === null ? (
          // No rate row — the honest "no rate yet" state, never a bare/stale number (UI-SPEC §4).
          <p className="text-sm text-[var(--neutral-data)]">
            Couldn&apos;t refresh the exchange rate yet — your reais will appear here once a rate
            arrives.
          </p>
        ) : (
          <>
            <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--neutral-data)]">
              {formatEUR(view.eur, 0)} <span className="text-muted-foreground">≈</span>{" "}
              {formatBRL(view.brl, 0)}
            </p>
            {/* MANDATORY provenance — a converted figure NEVER appears without its rate + as-of date. */}
            <p className="text-xs text-muted-foreground">
              EUR/BRL {rateLabel(view.rate)} · as of {view.rateDate}
            </p>
          </>
        )}

        {/* EUR/USD context — the ETF is priced in USD; same provenance discipline. */}
        {latestUsd && (
          <p className="text-xs text-muted-foreground">
            ETF priced in USD · EUR/USD {rateLabel(latestUsd.rate)} as of {latestUsd.rateDate}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
