import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { wcagContrast } from "culori";

// Wave-0 RED test (DSN-01) — the WCAG-AA contrast gate over the semantic TEXT-tier tokens in
// src/app/globals.css, for BOTH themes. culori parses the OKLCH token values and computes the
// sRGB contrast ratio against the surface the text sits on. Every text-tier token must be
// ≥4.5:1 (WCAG AA for normal text).
//
// RED until Plan 03-03: the `.dark` block does NOT exist in globals.css yet, so the dark-theme
// assertions have no tokens to check — this suite fails ("no .dark block") until the tuned dark
// tier lands. The `:root` (light) half already passes by design (the text tier was authored
// AA-on-white in Phase 2); the dark tier is the new contract this phase must satisfy.
//
// culori is a devDep — it is NEVER shipped to the client (this is a build-time test gate).

const GLOBALS = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
const css = readFileSync(GLOBALS, "utf8");

// Pull the `{ … }` body of a top-level CSS block by selector (`:root` or `.dark`). Returns
// null when the block is absent (the dark block is absent today → RED).
function blockBody(selector: string): string | null {
  // Escape regex metacharacters in the selector (`.` in `.dark`).
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${esc}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  return m ? m[1] : null;
}

// Read a single `--token: <value>;` declaration out of a block body.
function token(body: string, name: string): string | null {
  const re = new RegExp(`--${name}\\s*:\\s*([^;]+);`);
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

// The semantic TEXT-tier tokens (used for text/icons, so contrast-as-text applies) and the
// surface each is read against: page text on --background, card text on --card.
const TEXT_TOKENS = ["gain", "loss", "warning", "neutral-data", "muted-foreground"] as const;

function assertTierAA(selector: string) {
  const body = blockBody(selector);
  expect(body, `globals.css must declare a ${selector} block`).not.toBeNull();
  const surfaces = {
    background: token(body as string, "background"),
    card: token(body as string, "card"),
  };
  expect(surfaces.background, `${selector} must declare --background`).not.toBeNull();
  expect(surfaces.card, `${selector} must declare --card`).not.toBeNull();

  for (const name of TEXT_TOKENS) {
    const value = token(body as string, name);
    expect(value, `${selector} must declare --${name}`).not.toBeNull();
    // Page text on --background and card text on --card must BOTH clear AA.
    const onBackground = wcagContrast(value as string, surfaces.background as string);
    const onCard = wcagContrast(value as string, surfaces.card as string);
    expect(
      onBackground,
      `${selector} --${name} on --background = ${onBackground.toFixed(2)}:1 (<4.5)`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      onCard,
      `${selector} --${name} on --card = ${onCard.toFixed(2)}:1 (<4.5)`,
    ).toBeGreaterThanOrEqual(4.5);
  }
}

describe("contrast gate — every semantic text token ≥4.5:1 vs its surface (DSN-01)", () => {
  it("light theme (:root) clears WCAG AA on --background and --card", () => {
    assertTierAA(":root");
  });

  it("dark theme (.dark) clears WCAG AA on --background and --card", () => {
    // RED until Plan 03-03 adds the `.dark` block with the tuned dark text tier.
    assertTierAA(".dark");
  });
});
