import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Wave-0 RED test (DSN-02) — globals.css must (a) resolve `--font-sans` to the real Geist
// variable, not to itself, and (b) declare the Tailwind v4 `@custom-variant dark` so the
// class-based dark strategy works.
//
// RED until Plan 03-03: today globals.css has the self-reference bug `--font-sans: var(--font-sans)`
// (line ~10) and NO `@custom-variant dark` line. Both assertions fail until the token fix +
// the dark-variant declaration land.

const css = readFileSync(
  fileURLToPath(new URL("../src/app/globals.css", import.meta.url)),
  "utf8",
);

describe("globals.css tokens (DSN-02)", () => {
  it("resolves --font-sans to var(--font-geist-sans), not to itself", () => {
    // The fixed declaration. Whitespace-tolerant so formatting doesn't break the gate.
    expect(css).toMatch(/--font-sans\s*:\s*var\(--font-geist-sans\)\s*;/);
    // And the self-reference bug must be gone.
    expect(css).not.toMatch(/--font-sans\s*:\s*var\(--font-sans\)\s*;/);
  });

  it("declares a @custom-variant dark for the class-based dark strategy", () => {
    expect(css).toMatch(/@custom-variant\s+dark\b/);
  });
});
