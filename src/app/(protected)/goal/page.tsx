import { Sparkles, TrendingUp } from "lucide-react";

import { CelebrationOverlay, type CelebrationEvent } from "@/components/celebration-overlay";
import { MilestoneLadder, type LadderRung } from "@/components/milestone-ladder";
import { SharedWhyCard } from "@/components/shared-why-card";
import { TrophyShelf, type TrophySeal } from "@/components/trophy-shelf";
import { RemittanceSection } from "@/components/goal/remittance-section";
import { ValuationSection, type ValuationModel } from "@/components/goal/valuation-section";
import { WhatIfPanel } from "@/components/goal/what-if-panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { setLaunchDate } from "@/lib/actions/set-launch-date";
import { costCenterDisplayName } from "@/lib/cost-center-display";
import { demoAwareNow, isDemoForReads } from "@/lib/demo/mode";
import { formatEUR, formatPct } from "@/lib/format";
import {
  allocate,
  EMPTY_STATE,
  foldAllocation,
  spendableAdventuresSmall,
  type AllocationEvent,
  type BucketState,
} from "@/lib/goal/allocation";
import { accruingParts } from "@/lib/goal/adventures-view";
import { GOAL_EUR, LEVEL_STEP_EUR, MAJOR_STEP_EUR, MILESTONES, WEALTH_ISIN } from "@/lib/goal/constants";
import { latestRate } from "@/lib/fx/convert";
import type { FxRow } from "@/lib/fx/parse-ecb";
import { perBucketMarketValue } from "@/lib/valuation/per-bucket";
import {
  marketValue,
  unitsFromContributions,
  unrealizedPnl,
  type Contribution,
  type PricePoint,
} from "@/lib/valuation/valuation";
import { detectAndRecordGoalEvents } from "@/lib/goal/detect-events";
import { etaLine } from "@/lib/goal/hero-view";
import { activeDenominator, getGoalTotal } from "@/lib/goal/getGoalTotal";
import { readHouseholdConfig, type HouseholdReadClient } from "@/lib/goal/household";
import { computeEta } from "@/lib/goal/momentum";
import { computeStreak, type StreakResult } from "@/lib/goal/streak";
import { currentPeriodKey } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

// The Goal page (`/goal`) — the JOURNEY depth (D5-12). Home answers the 1-minute glance; THIS page is
// the ladder you climb, the milestones with dates, the honest gated ETA, the multi-goal denominator,
// the shared editable "why", and — crucially — the FIRST-CLASS pre-launch "waiting" state (D5-16).
//
// The couple is currently pre-launch (unemployed): with no launch_date the page is NOT an empty/sad
// zero-state — it is a plan waiting for them (the "why" as primary content, a ghosted ladder, the
// buckets defined-but-dormant, a "Set your launch date" CTA). NO streak / "missed €4k" copy appears.
//
// Reads go through @supabase/ssr under RLS, partitioned by is_demo (T-05-17) — NEVER src/lib/db/marts
// (D3-13). The €100k figure is the WEALTH COST BASIS via getGoalTotal (the SMALLER number, D5-02),
// visually distinct from any "total across all buckets". All €/% via formatEUR/formatPct (de-DE).

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** A euro threshold → a compact "€Nk" label (e.g. 100000 → "€100k"). */
function kLabel(eur: number): string {
  return `€${Math.round(eur / 1000)}k`;
}

/** A price_date ("YYYY-MM-DD") → its YYYYMM integer period key (dim_calendar grain). */
function priceDateToPeriodKey(d: string): number {
  return Number(d.slice(0, 7).replace("-", ""));
}

/** A period_key (YYYYMM) → an English "Mon YYYY" caption (UTC, no locale leakage into the date math). */
function periodLabel(key: number): string {
  const year = Math.floor(key / 100);
  const month = key % 100;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** An ISO timestamp (e.g. milestones.achieved_at) → an English "Mon YYYY" caption (UTC). */
function monthYearFromIso(iso: string | null): string | undefined {
  if (iso === null) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Whole calendar months between two period_keys (inclusive of the launch month → "Month 1"). */
function monthsSince(launchKey: number, currentKey: number): number {
  const ly = Math.floor(launchKey / 100);
  const lm = launchKey % 100;
  const cy = Math.floor(currentKey / 100);
  const cm = currentKey % 100;
  return (cy - ly) * 12 + (cm - lm) + 1;
}

export default async function GoalPage() {
  const supabase = await createClient();
  // Demo-mode partition selector (T-05-17) resolved FIRST so the display clock can be demo-anchored
  // (G1/D5-16). EVERY read filters to ONE partition so demo and real rows are NEVER blended (a
  // missing is_demo filter would read the real launch date in demo mode). Real mode is identical.
  const demoFilter = await isDemoForReads();
  const now = demoAwareNow(demoFilter, new Date());
  const currentKey = currentPeriodKey(now);

  // The household singleton (D5-01/16) — launch_date gates the whole journey; NULL = pre-launch.
  const household = await readHouseholdConfig(
    supabase as unknown as HouseholdReadClient,
    demoFilter,
  );

  // Monthly investimento totals (the only investimento grain available; per-leg transfers +
  // per-transfer overrides are unavailable as a view — same Rule-3 data-grain adaptation as Home).
  const { data: allPnl } = await supabase
    .from("v_pnl_monthly")
    .select("period_key, investimento")
    .eq("is_demo", demoFilter);

  // transfer_overrides — threaded (demo-partitioned) to keep the read guard honest (T-05-17); the
  // monthly grain can't map a per-transaction override, so it does not alter the monthly fold here.
  await supabase
    .from("transfer_overrides")
    .select("transaction_id, wealth_eur, brazil_eur, adv_small_eur, adv_big_eur")
    .eq("is_demo", demoFilter);

  const launchDate = household.launchDate;
  const preLaunch = launchDate === null;

  // Fold the launch-gated monthly investimento through the pure waterfall → the bucket balances.
  const periodsAsc = (allPnl ?? [])
    .slice()
    .sort((a, b) => Number(a.period_key) - Number(b.period_key));

  const investEvents: AllocationEvent[] = periodsAsc
    .filter((r) => num(r.investimento) > 0)
    .map((r) => {
      const key = Number(r.period_key);
      const mm = String(key % 100).padStart(2, "0");
      return {
        kind: "transfer" as const,
        amount: num(r.investimento),
        bookingDate: `${Math.floor(key / 100)}-${mm}-01`,
        id: key,
      };
    });

  const goalState = foldAllocation(investEvents, { launchDate });

  // ---------- Phase-12 ETF valuation + FX (ETF-02/04/05, D-05/D-07) ----------
  // Every new read threads `.eq("is_demo", demoFilter)` (Pitfall 3 / T-12-15). Prices are stored in the
  // ETF's native USD (Open Q3); the valuation engine is currency-agnostic, so the closes are converted
  // to EUR at read via the latest EUR/USD reference rate BEFORE the engine sees them.
  const [{ data: contribRows }, { data: priceRows }, { data: fxRows }] = await Promise.all([
    supabase
      .from("investment_contributions")
      .select("amount_eur, period_key")
      .eq("is_demo", demoFilter),
    supabase
      .from("prices")
      .select("price_date, close, currency")
      .eq("isin", WEALTH_ISIN)
      .eq("is_demo", demoFilter),
    supabase
      .from("fx_rates")
      .select("base, quote, rate_date, rate")
      .eq("is_demo", demoFilter),
  ]);

  const fxRowsParsed: FxRow[] = (fxRows ?? []).map((r) => ({
    base: "EUR" as const,
    quote: r.quote as string,
    rateDate: r.rate_date as string,
    rate: num(r.rate),
  }));
  const eurUsd = latestRate(fxRowsParsed, "USD");
  const eurUsdRate = eurUsd !== null && eurUsd.rate > 0 ? eurUsd.rate : null;

  // Convert a USD close to EUR (closeEur = closeUsd ÷ EUR/USD); pass EUR closes through unchanged. A
  // USD close with no rate to convert by is NaN → dropped below → the series falls to the cost basis.
  const toEurClose = (close: number, currency: string): number =>
    currency === "EUR" ? close : eurUsdRate !== null ? close / eurUsdRate : NaN;

  const priceSeriesEur: PricePoint[] = (priceRows ?? [])
    .map((r) => ({
      periodKey: priceDateToPeriodKey(r.price_date as string),
      close: toEurClose(num(r.close), (r.currency as string) ?? "EUR"),
    }))
    .filter((p) => Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => a.periodKey - b.periodKey);

  // The latest close (highest price_date) → EUR, plus its as-of date for the provenance caption.
  let latestPriceRow: { price_date: string; close: string; currency: string } | null = null;
  for (const r of priceRows ?? []) {
    const row = r as unknown as { price_date: string; close: string; currency: string };
    if (latestPriceRow === null || row.price_date > latestPriceRow.price_date) latestPriceRow = row;
  }
  let latestCloseEur: number | null = null;
  if (latestPriceRow !== null) {
    const c = toEurClose(num(latestPriceRow.close), latestPriceRow.currency ?? "EUR");
    latestCloseEur = Number.isFinite(c) && c > 0 ? c : null;
  }

  const contribs: Contribution[] = (contribRows ?? []).map((r) => ({
    amountEur: num(r.amount_eur),
    periodKey: Number(r.period_key),
  }));
  const totalCostBasis = contribs.reduce((sum, c) => sum + c.amountEur, 0);
  const units = unitsFromContributions(contribs, priceSeriesEur);
  const totalMarketValue = marketValue(units, latestCloseEur); // null ⇒ UNPRICED (honest fallback).
  // "Priced" requires a POSITIVE market value: units=0 with a valid close yields 0 (not null), which is
  // NOT a genuine valuation (nothing is invested via the tracked pipeline yet, or all legs predate the
  // first price) — treat it as unpriced so the hero/label/per-bucket all fall back to the honest cost
  // basis together, never a false €0 (audit finding, getGoalTotal 0-vs-null).
  const priced = totalMarketValue !== null && totalMarketValue > 0;
  const totalPnl = unrealizedPnl(totalMarketValue, totalCostBasis);
  const pricedAsOf = priced ? (latestPriceRow?.price_date ?? null) : null;

  // The ETF-04 SWAP: Wealth's pro-rata market value when priced, else null → getGoalTotal falls back to
  // the honest cost basis (`state.wealth`), never a stale/invented figure (Pitfall 5, D-07).
  const wealthMarketValue =
    priced && totalMarketValue !== null
      ? perBucketMarketValue(goalState.wealth, totalCostBasis, totalMarketValue)
      : null;

  const goalTotal = getGoalTotal(goalState, { wealthMarketValue }); // market value when priced (D-05).
  const denominator = activeDenominator(goalTotal); // GOAL-12 multi-goal ceiling.
  const pct = denominator > 0 ? Math.min(100, (goalTotal / denominator) * 100) : 0;

  // Walk the launch-gated transfers to record the month each €10k rung was first crossed (achieved-at).
  const liveOrdered = investEvents
    .filter((e) => launchDate !== null && e.bookingDate >= launchDate)
    .sort((a, b) => Number(a.id) - Number(b.id));
  const rungThresholds: number[] = [];
  for (let t = LEVEL_STEP_EUR; t <= denominator; t += LEVEL_STEP_EUR) rungThresholds.push(t);
  const crossedAt = new Map<number, number>();
  let running: BucketState = { ...EMPTY_STATE };
  for (const e of liveOrdered) {
    running = allocate(e.amount, running, {});
    for (const t of rungThresholds) {
      if (!crossedAt.has(t) && running.wealth >= t) crossedAt.set(t, Number(e.id));
    }
  }

  const rungs: LadderRung[] = rungThresholds.map((t) => ({
    threshold: t,
    achieved: goalTotal >= t,
    achievedLabel: crossedAt.has(t) ? periodLabel(crossedAt.get(t)!) : undefined,
    major: t % MAJOR_STEP_EUR === 0,
  }));

  // The launch key + tenure ("Month N") — pre-launch is Month 0 ("starts when you're ready").
  const launchKey =
    launchDate === null ? null : Number(launchDate.slice(0, 7).replace("-", ""));
  const tenureMonth = launchKey === null ? 0 : Math.max(0, monthsSince(launchKey, currentKey));

  // The demo-aware couple identity (the anon demo shows the personas, never the real owners — D4-08/26).
  const nameA = costCenterDisplayName("lorenzo", "Lorenzo", demoFilter);
  const nameB = costCenterDisplayName("fernanda", "Fernanda", demoFilter);
  const attribution = `${nameA} & ${nameB}, Berlin`;

  const identity = (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        <Avatar className="size-8 ring-2 ring-background">
          <AvatarFallback className="text-xs">{nameA[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <Avatar className="size-8 ring-2 ring-background">
          <AvatarFallback className="text-xs">{nameB[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
      </div>
      <span className="text-sm text-muted-foreground">
        {nameA} &amp; {nameB}
      </span>
    </div>
  );

  // ---------- PRE-LAUNCH: the first-class "waiting" state (D5-16) ----------
  if (preLaunch) {
    return (
      <div className="@container/main space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Our €100k — the freedom fund.</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Building €100k together. Month 0 — starts when you&apos;re ready.
            </p>
          </div>
          {identity}
        </header>

        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Your plan is ready. The ladder ahead, the buckets, the €4.000-a-month rhythm — it all
          starts the month you set your launch date. No streak is running yet; nothing to catch up
          on.
        </p>

        {/* The launch-date CTA — the single primary action pre-launch (D5-16). Native date input +
            a server-action <form> (no client JS needed; works on Fernanda's mobile). */}
        <form
          action={setLaunchDate}
          className="flex flex-wrap items-end gap-3 rounded-xl bg-card p-6 ring-1 ring-foreground/10"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="launchDate" className="text-sm font-medium">
              Set your launch date
            </label>
            <input
              id="launchDate"
              name="launchDate"
              type="date"
              required
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--brand)] px-5 text-sm font-medium text-[var(--brand-fg)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Begin the journey
          </button>
        </form>

        {/* The "why" as PRIMARY content + the ghosted ladder side by side. */}
        <div className="grid grid-cols-1 gap-6 @3xl/main:grid-cols-2">
          <SharedWhyCard why={household.why} attribution={attribution} />
          <MilestoneLadder wealth={0} denominator={GOAL_EUR} rungs={rungs} preLaunch />
        </div>

        {/* The three buckets, defined but DORMANT (visible + hopeful, not absent). */}
        <section aria-label="Your buckets, waiting to fund">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Your buckets — ready when you launch
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
            {[
              { name: "Wealth", note: "Pay-yourself-first toward €100k" },
              { name: "Brazil", note: "The trips home" },
              { name: "Adventures", note: "The bigger journeys" },
            ].map((b) => (
              <div key={b.name} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
                <div className="text-sm font-medium">{b.name}</div>
                <div className="mt-1 font-mono text-3xl font-semibold tabular-nums leading-none text-muted-foreground">
                  {formatEUR(0, 0)}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{b.note} · dormant until launch</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // ---------- ACTIVE / mid-journey (post-launch) ----------
  const invByPeriod = new Map<number, number>(
    (allPnl ?? []).map((r) => [Number(r.period_key), num(r.investimento)] as const),
  );
  const streak: StreakResult = computeStreak(invByPeriod, now, launchDate);

  // The full streak chain: every CLOSED post-launch month, oldest → newest (hit = ≥€4k).
  const chainKeys: number[] = [];
  for (let k = launchKey!; k < currentKey; ) {
    chainKeys.push(k);
    const mm = k % 100;
    k = mm === 12 ? (Math.floor(k / 100) + 1) * 100 + 1 : k + 1;
  }
  const chain = chainKeys.map((key) => ({ key, hit: (invByPeriod.get(key) ?? -1) >= 4000 }));
  const provisionalHit = (invByPeriod.get(currentKey) ?? -1) >= 4000;

  // The honest, confidence-gated ETA (D5-15) to the active €100k rung, from the trailing pace.
  const postLaunchMonthly = periodsAsc
    .filter((r) => Number(r.period_key) >= launchKey!)
    .map((r) => num(r.investimento));
  const eta = computeEta({
    remaining: Math.max(0, denominator - goalTotal),
    monthlyContributions: postLaunchMonthly.slice(-6),
  });
  // The honest, singular-aware ETA copy (G3/D5-15) — shared with the Home hero via etaLine (no
  // hand-rolled duplicate that could regress to "~1–1 years").
  const etaSentence = etaLine(eta);

  // The what-if base pace: the average of the FUNDED (>0) months in the SAME trailing window the
  // hero ETA uses (guard the empty case to 0). Reuses the already-is_demo-partitioned reads — no
  // new query (WHATIF-02, Pitfall 4). The panel receives plain numbers only (no client Supabase).
  const trailingSix = postLaunchMonthly.slice(-6);
  const fundedTrailing = trailingSix.filter((m) => m > 0);
  const baseMonthlyContribution =
    fundedTrailing.length > 0
      ? fundedTrailing.reduce((sum, m) => sum + m, 0) / fundedTrailing.length
      : 0;

  // Buckets (post-launch balances).
  const brazil = goalState.brazil;
  const advSpendable = spendableAdventuresSmall(goalState);
  // The honest per-pool accruing decomposition (G5/D5-11): each locked pool tagged with its TRUE
  // unlock gate (small → next €10k, big/epic-trip → €100k) — never one false "next €10k" claim.
  const advParts = accruingParts(goalState);

  // PERS-05 suggest-only nudge: six closed post-launch months in a row each over €5.000 → SUGGEST
  // raising targets. This NEVER writes a target — it is a suggestion the couple decides on.
  const lastSixClosed = chain.slice(-6);
  const raiseTargetsNudge =
    lastSixClosed.length === 6 &&
    lastSixClosed.every((m) => (invByPeriod.get(m.key) ?? 0) > 5000);

  // ---------- The shared, once-only celebration + trophy shelf (GOAL-11/02, D5-14/18) ----------
  // Detect newly-crossed €10k levels / €100k majors AFTER the fold and upsert them idempotently
  // (on conflict (dedupe_key, is_demo) do nothing) — partition-scoped, via @supabase/ssr (never
  // service_role). Stamps milestones.achieved_at on first cross. A re-render writes nothing new.
  await detectAndRecordGoalEvents({ wealth: goalTotal, isDemo: demoFilter });

  // The newest UNSEEN event for THIS partition — the celebration renders for it once, then the
  // "Save to our wins" action flips the SHARED seen flag so it never replays (both partners, once).
  const { data: unseenRows } = await supabase
    .from("goal_events")
    .select("id, kind, threshold, achieved_at")
    .eq("is_demo", demoFilter)
    .eq("seen", false)
    .order("threshold", { ascending: false, nullsFirst: false })
    .order("achieved_at", { ascending: false })
    .limit(1);
  const unseen = unseenRows?.[0];
  const celebration: CelebrationEvent | null = unseen
    ? {
        id: unseen.id,
        kind: unseen.kind,
        threshold: unseen.threshold,
        achievedAt: unseen.achieved_at,
      }
    : null;

  // The trophy shelf seals — the named milestones (10/25/50/75/100k), demo-partitioned. Achieved =
  // the Wealth cost basis has crossed it; the reached-month comes from the stamped achieved_at.
  const { data: milestoneRows } = await supabase
    .from("milestones")
    .select("threshold_eur, achieved_at")
    .eq("is_demo", demoFilter);
  const achievedAtByThreshold = new Map<number, string | null>(
    (milestoneRows ?? []).map((m) => [num(m.threshold_eur), m.achieved_at] as const),
  );
  const seals: TrophySeal[] = MILESTONES.map((threshold) => ({
    threshold,
    achieved: goalTotal >= threshold,
    reachedLabel:
      goalTotal >= threshold ? monthYearFromIso(achievedAtByThreshold.get(threshold) ?? null) : undefined,
  }));

  // The per-bucket allocation model (ETF-05): each bucket's cost basis → its pro-rata market value
  // (cost basis when unpriced) against the SAME total cost basis the swap uses, so the three shares
  // partition the total market value. Presentational-only numbers — the section reads no DB.
  const advCostBasis = goalState.advSmallUnlocked + goalState.advSmallLocked + goalState.advBig;
  const bucketBases = [
    { label: "Wealth", cb: goalState.wealth },
    { label: "Brazil", cb: goalState.brazil },
    { label: "Adventures", cb: advCostBasis },
  ];
  const bucketValues = bucketBases.map((b) => ({
    label: b.label,
    value:
      priced && totalMarketValue !== null
        ? perBucketMarketValue(b.cb, totalCostBasis, totalMarketValue)
        : b.cb,
  }));
  const bucketValuesTotal = bucketValues.reduce((sum, b) => sum + b.value, 0);
  const valuationModel: ValuationModel = {
    priced,
    marketValue: totalMarketValue,
    unrealizedPnl: totalPnl,
    costBasis: totalCostBasis,
    pricedAsOf,
    perBucket: bucketValues.map((b) => ({
      label: b.label,
      value: b.value,
      share: bucketValuesTotal > 0 ? (b.value / bucketValuesTotal) * 100 : 0,
    })),
  };

  return (
    <div className="@container/main space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Our €100k — the journey</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Building €100k together · Month {tenureMonth}
          </p>
        </div>
        {identity}
      </header>

      {/* HERO — the Wealth cost basis (the €100k figure). Labeled unambiguously; distinct from any
          all-bucket total (the hard visual rule, D5-02). */}
      <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Invested toward €100.000
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-3xl font-semibold tabular-nums leading-none">
            {formatEUR(goalTotal, 0)}
          </span>
          <span className="text-sm text-muted-foreground">
            of{" "}
            <span className="font-mono tabular-nums">{formatEUR(denominator, 0)}</span> ·{" "}
            {formatPct(pct)}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{etaSentence}</p>
        {/* Honest basis caption (D-07): market value + as-of when priced, else a labelled cost basis. */}
        <p className="mt-1 text-xs text-[var(--neutral-data)]">
          {priced ? `Market value · priced ${pricedAsOf ?? ""}`.trim() : "Cost basis — no live price yet"}
        </p>

        {/* The full €4k streak chain (never red; a lighter month is neutral — D5-07). */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
            {chain.map((m) => (
              <span
                key={m.key}
                className={`size-2.5 rounded-full ${m.hit ? "bg-[var(--gain)]" : "bg-[var(--neutral-data)]"}`}
              />
            ))}
            <span
              className={`size-3 rounded-full ring-2 ring-[var(--brand)] ${provisionalHit ? "bg-[var(--gain)]" : "bg-transparent"}`}
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {streak.comeback
              ? `Back on track — the chain is alive again. Longest: ${streak.longest} months.`
              : streak.isBroken
                ? `Chain restarted — back on it. Longest: ${streak.longest} months.`
                : `${streak.current} month${streak.current === 1 ? "" : "s"} in a row · longest ${streak.longest}.`}
          </p>
        </div>
      </section>

      {/* INVESTMENTS — live market value + unrealized P/L + per-bucket allocation, alive on the demo
          with zero external call (ETF-02/05). Presentational: fed the fully-computed model above. */}
      <ValuationSection model={valuationModel} />

      {/* IN REAIS — Fernanda's remittance view of the €100k figure, with mandatory FX provenance
          (BRL-01). The section self-reads the latest fx_rates for its OWN partition (is_demo). */}
      <RemittanceSection amountEur={goalTotal} demoFilter={demoFilter} />

      {/* THE "WHAT IF?" PANEL — the reporting app becomes a planning app (WHATIF-02, active branch
          only; hidden pre-launch where no baseline pace exists). Fed by the already-resolved,
          is_demo-partitioned numbers — no new read. Ephemeral: it never writes or mutates the goal. */}
      <WhatIfPanel
        currentInvested={goalTotal}
        baseMonthlyContribution={baseMonthlyContribution}
        trailingContributions={trailingSix}
      />

      {/* THE LADDER + the shared why. */}
      <div className="grid grid-cols-1 gap-6 @3xl/main:grid-cols-2">
        <MilestoneLadder wealth={goalTotal} denominator={denominator} rungs={rungs} />
        <SharedWhyCard why={household.why} attribution={attribution} />
      </div>

      {/* PERS-05 suggest-only nudge — a suggestion the couple decides on; NEVER auto-changes a target. */}
      {raiseTargetsNudge && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand-muted)] p-4 text-sm"
        >
          <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--brand)]" />
          <p>
            You invested over €5.000 for 6 months running — want to raise your targets? You decide.
          </p>
        </div>
      )}

      {/* The multi-goal buckets (Brazil + Adventures). The Wealth engine is the hero above. */}
      <section aria-label="Your buckets">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Your buckets
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
          {/* Brazil — factual debt framing when negative (D5-06/GOAL-09), never blame. */}
          <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
            <div className="text-sm font-medium">Brazil</div>
            <div
              className={`mt-1 font-mono text-3xl font-semibold tabular-nums leading-none ${brazil < 0 ? "text-[var(--loss)]" : ""}`}
            >
              {formatEUR(brazil, 0)}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {brazil < 0
                ? `Brazil is ${formatEUR(-brazil, 0)} behind — the next transfer settles this first.`
                : "The trips home."}
            </p>
          </div>

          {/* Adventures — the hard-lock two-number display (D5-11): Spendable prominent, Accruing secondary. */}
          <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
            <div className="text-sm font-medium">Adventures</div>
            <div className="mt-1 flex items-center gap-1 font-mono text-3xl font-semibold tabular-nums leading-none text-[var(--gain)]">
              <TrendingUp aria-hidden="true" className="size-5 shrink-0" />
              {formatEUR(advSpendable, 0)}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Spendable now</p>
            {advParts.length > 0 && (
              <div className="mt-2 space-y-1 text-sm text-[var(--neutral-data)]">
                {advParts.map((part) => (
                  <p key={part.kind}>
                    {part.kind === "small"
                      ? `Accruing (unlocks at ${kLabel(part.unlocksAtEur)})`
                      : `Accruing for the epic trip (unlocks at ${kLabel(part.unlocksAtEur)})`}
                    : {formatEUR(part.amount, 0)}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* THE TROPHY SHELF — achieved (brand-fill + reached month) + locked (ghosted, motivating) seals. */}
      <TrophyShelf seals={seals} />

      {/* THE SHARED CELEBRATION — renders only for an unseen goal_events row; reduced-motion safe. */}
      {celebration && <CelebrationOverlay event={celebration} names={{ a: nameA, b: nameB }} />}
    </div>
  );
}
