import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Wave 0 contract for FND-01. RED until Plan 03 creates `src/lib/auth/allowlist.ts`
// exporting `isAllowed`. Do NOT stub the production symbol here — this test is the
// executable contract Plan 03 turns green.
import { isAllowed } from "@/lib/auth/allowlist";

const ORIGINAL = process.env.ALLOWED_EMAILS;

describe("isAllowed() — ALLOWED_EMAILS allowlist (FND-01)", () => {
  beforeEach(() => {
    process.env.ALLOWED_EMAILS = "lorenzo@example.com, Fernanda@Example.com";
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ALLOWED_EMAILS;
    else process.env.ALLOWED_EMAILS = ORIGINAL;
  });

  it("returns true for an email on the allowlist", () => {
    expect(isAllowed("lorenzo@example.com")).toBe(true);
  });

  it("returns false for an email not on the allowlist", () => {
    expect(isAllowed("stranger@example.com")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAllowed("LORENZO@EXAMPLE.COM")).toBe(true);
    expect(isAllowed("fernanda@example.com")).toBe(true);
  });

  it("trims whitespace around the candidate and the configured entries", () => {
    expect(isAllowed("  lorenzo@example.com  ")).toBe(true);
  });

  it("returns false when ALLOWED_EMAILS is empty or unset", () => {
    process.env.ALLOWED_EMAILS = "";
    expect(isAllowed("lorenzo@example.com")).toBe(false);
  });
});
