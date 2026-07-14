// src/lib/transactions/merchant-avatar.ts — the deterministic, privacy-first merchant avatar
// derivation (TXN-03, D-06). Built GREEN against test/merchant-avatar.test.ts.
//
// A PURE function of the merchant string → { initials, color }. NO external logo service, NO
// network call with the merchant name (D-06, privacy) — "resolvable" degrades to clean local
// initials over a stable design-token color. Zero dependencies, node-testable.
//
//   - single word           → the first TWO letters, uppercased ("spotify" → "SP");
//   - multi-word            → the first letter of the first two words ("Whole Foods Market" → "WF");
//   - blank / whitespace / null / undefined → { initials: null } (the neutral-icon fallback signal);
//   - color                 → a STABLE hash of the trimmed name into the chart ramp (var(--chart-1..5)).

/** The design-token chart ramp — the avatar color is a stable hash into this array (Pattern 5). */
const RAMP = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export interface MerchantAvatarData {
  /** The 1–2 uppercase initials, or null when the name is blank/unknown (→ neutral icon). */
  initials: string | null;
  /** A stable `var(--chart-N)` ramp token (or `var(--muted)` for the neutral fallback). */
  color: string;
}

/**
 * merchantAvatar — derive the deterministic initials + stable token color from a merchant string.
 * Pure; makes zero external/network calls (D-06). Same input → same color, every call.
 */
export function merchantAvatar(name: string | null | undefined): MerchantAvatarData {
  const clean = (name ?? "").trim();
  if (!clean) return { initials: null, color: "var(--muted)" };

  const words = clean.split(/\s+/).filter(Boolean);
  const initials = (
    words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]
  ).toUpperCase();

  // Stable 32-bit rolling hash → an index into the chart ramp (deterministic, no crypto needed).
  let h = 0;
  for (const ch of clean) h = (h * 31 + ch.charCodeAt(0)) >>> 0;

  return { initials, color: RAMP[h % RAMP.length] };
}
