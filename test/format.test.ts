import { describe, expect, it } from "vitest";

// BI-05 — the de-DE money/percent formatters are the SINGLE source of truth
// (UI-SPEC §Charting "Number formatting — single source of truth"). Every later
// numeric cell/axis consumes formatEUR/formatPct; no page hand-rolls `Intl`.
//
// Locked spec strings (UI-SPEC): period thousands, comma decimal, `€` prefixed
// (`€5.038,00`). Negatives lead with a minus on the WHOLE token (`-€42,18`),
// never parentheses. Percent uses the German non-breaking space before `%`
// (`12,4 %`) — asserted literally below with a U+00A0 in the expected string.
import { formatEUR, formatMonths, formatPct } from "@/lib/format";

// Phase-12 (BRL-01) — `formatBRL` joins this SINGLE-source formatter file (the format.test.ts grep
// confines every `new Intl.NumberFormat` here). It is loaded via the COMPUTED dynamic-import idiom so
// `tsc --noEmit` stays green while the symbol is absent (added in 12-03); RED at runtime until then
// ("formatBRL is not a function") — the intended staged anchor, NOT a bug.
const FORMAT_MODULE = "@/lib/format";
async function loadFormatBRL(): Promise<(n: number, decimals?: number) => string> {
  const mod = (await import(/* @vite-ignore */ FORMAT_MODULE)) as Record<string, unknown>;
  return mod.formatBRL as (n: number, decimals?: number) => string;
}

// A literal non-breaking space (U+00A0) — the German thin-space-before-% convention.
// Spelled out as a unicode escape so the intent survives editors that collapse it.
const NBSP = " ";

describe("formatEUR — de-DE money, € prefixed (BI-05, UI-SPEC)", () => {
  it("renders period thousands + comma decimals with 2 decimals by default", () => {
    expect(formatEUR(5038)).toBe("€5.038,00");
    expect(formatEUR(820.5)).toBe("€820,50");
    expect(formatEUR(100000)).toBe("€100.000,00");
  });

  it("honors an explicit decimals argument (0 decimals on hero KPI values)", () => {
    expect(formatEUR(42180, 0)).toBe("€42.180");
  });

  it("renders negatives with a LEADING minus on the whole token, not parentheses", () => {
    expect(formatEUR(-42.18)).toBe("-€42,18");
  });
});

describe("formatPct — de-DE one-decimal with the German space before % (BI-05)", () => {
  it("renders one decimal and a non-breaking space (U+00A0) before %", () => {
    expect(formatPct(12.4)).toBe(`12,4${NBSP}%`);
    expect(formatPct(0)).toBe(`0${NBSP}%`);
  });

  it("uses the non-breaking space, NOT a normal ASCII space", () => {
    // Guard against a regression that swaps the U+00A0 for a plain " ".
    expect(formatPct(12.4)).not.toBe("12,4 %");
    expect(formatPct(12.4).charCodeAt(formatPct(12.4).length - 2)).toBe(0x00a0);
  });
});

describe("formatMonths — de-DE months-of-reserve (BI-07)", () => {
  it("renders one decimal max with the non-breaking space before 'months'", () => {
    expect(formatMonths(3.2)).toBe(`3,2${NBSP}months`);
    expect(formatMonths(3)).toBe(`3${NBSP}months`);
  });
});

describe("formatBRL — de-DE money, R$ prefixed (BRL-01, Fernanda's remittance view)", () => {
  it("renders period thousands + comma decimals with 2 decimals by default", async () => {
    const formatBRL = await loadFormatBRL();
    expect(formatBRL(246418.5)).toBe("R$246.418,50");
  });

  it("honors an explicit 0-decimals argument (hero KPI values)", async () => {
    const formatBRL = await loadFormatBRL();
    expect(formatBRL(0, 0)).toBe("R$0");
    expect(formatBRL(42180, 0)).toBe("R$42.180");
  });

  it("renders negatives with a LEADING minus on the WHOLE token, not parentheses", async () => {
    const formatBRL = await loadFormatBRL();
    expect(formatBRL(-42.18)).toBe("-R$42,18");
  });
});
