import { describe, expect, it } from "vitest";

// BI-05 — the de-DE money/percent formatters are the SINGLE source of truth
// (UI-SPEC §Charting "Number formatting — single source of truth"). Every later
// numeric cell/axis consumes formatEUR/formatPct; no page hand-rolls `Intl`.
//
// Locked spec strings (UI-SPEC): period thousands, comma decimal, `€` prefixed
// (`€5.038,00`). Negatives lead with a minus on the WHOLE token (`-€42,18`),
// never parentheses. Percent uses the German non-breaking space before `%`
// (`12,4 %`) — asserted literally below with a U+00A0 in the expected string.
import { formatEUR, formatPct } from "@/lib/format";

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
