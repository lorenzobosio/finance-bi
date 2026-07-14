import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (TXN-03, D-06) — freezes the PURE merchant-avatar contract for the not-yet-existent
// `@/lib/transactions/merchant-avatar` (built GREEN in 08-04). RED at RUNTIME only; the import
// specifier is COMPUTED so `tsc --noEmit` stays green while the module is absent (07-01 KEY MECHANISM).
//
// D-06: a DETERMINISTIC initials/neutral avatar derived from the merchant string — NO external logo
// service, NO network call with the merchant name (privacy). This suite pins:
//   - single-word merchant → first TWO letters, uppercased;
//   - multi-word merchant → first letter of the first two words, uppercased;
//   - a STABLE hash into the design-token chart ramp (var(--chart-1..5)) — same input, same color;
//   - a blank/null merchant → { initials: null } (the neutral-icon fallback signal).
//
// Synthetic values only; no PII.

const MODULE = "@/lib/transactions/merchant-avatar";

interface Avatar {
  initials: string | null;
  color: string;
}

interface AvatarModule {
  merchantAvatar: (name: string | null | undefined) => Avatar;
}

async function load(): Promise<AvatarModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return { merchantAvatar: mod.merchantAvatar as AvatarModule["merchantAvatar"] };
}

const RAMP = /^var\(--chart-[1-5]\)$/;

describe("merchant-avatar — initials derivation (TXN-03, D-06)", () => {
  it("single-word merchant → the first two letters, uppercased", async () => {
    const { merchantAvatar } = await load();
    expect(merchantAvatar("spotify").initials).toBe("SP");
  });

  it("multi-word merchant → the first letter of the first two words, uppercased", async () => {
    const { merchantAvatar } = await load();
    expect(merchantAvatar("Whole Foods Market").initials).toBe("WF");
  });

  it("collapses extra whitespace between words", async () => {
    const { merchantAvatar } = await load();
    expect(merchantAvatar("Deutsche   Bahn").initials).toBe("DB");
  });
});

describe("merchant-avatar — neutral fallback (TXN-03)", () => {
  it("blank / whitespace / null / undefined → { initials: null } (neutral icon)", async () => {
    const { merchantAvatar } = await load();
    expect(merchantAvatar("").initials).toBeNull();
    expect(merchantAvatar("   ").initials).toBeNull();
    expect(merchantAvatar(null).initials).toBeNull();
    expect(merchantAvatar(undefined).initials).toBeNull();
  });
});

describe("merchant-avatar — stable token color (TXN-03, Pattern 5)", () => {
  it("returns a color from the var(--chart-1..5) ramp", async () => {
    const { merchantAvatar } = await load();
    expect(merchantAvatar("Spotify").color).toMatch(RAMP);
  });

  it("is stable — the same merchant hashes to the same color across calls", async () => {
    const { merchantAvatar } = await load();
    expect(merchantAvatar("Spotify").color).toBe(merchantAvatar("Spotify").color);
    expect(merchantAvatar("Rewe").color).toBe(merchantAvatar("Rewe").color);
  });
});
