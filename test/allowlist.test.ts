import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Wave 0 contract for FND-01 + Phase-0 hardening. `isAllowed` is the app-layer half of
// the DB-driven allowlist: it parses `ALLOWED_EMAILS` (the env that ALSO seeds the
// `app_allowlist` table at deploy time) and must normalize identically to the seed
// script (trim + lowercase + drop blanks). These tests pin that parsing contract so the
// env, the seed, and the RLS wall can never silently disagree. No real emails appear
// here — example.com placeholders only (source-cleanliness guard enforces this).
import { isAllowed } from "@/lib/auth/allowlist";

const ORIGINAL = process.env.ALLOWED_EMAILS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ALLOWED_EMAILS;
  else process.env.ALLOWED_EMAILS = ORIGINAL;
});

describe("isAllowed() — ALLOWED_EMAILS allowlist (FND-01)", () => {
  beforeEach(() => {
    process.env.ALLOWED_EMAILS = "lorenzo@example.com, Fernanda@Example.com";
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

// ---------------------------------------------------------------------------
// Phase-0 hardening: extended env-parsing coverage. These pin the EXACT
// normalization that scripts/seed-allowlist.ts must reproduce when it upserts
// rows into app_allowlist, so the app gate and the DB allowlist stay in lockstep.
// ---------------------------------------------------------------------------
describe("isAllowed() — env parsing edge cases (Phase-0 hardening)", () => {
  it("fails closed when ALLOWED_EMAILS is unset", () => {
    delete process.env.ALLOWED_EMAILS;
    expect(isAllowed("lorenzo@example.com")).toBe(false);
  });

  it("supports a single configured email", () => {
    process.env.ALLOWED_EMAILS = "solo@example.com";
    expect(isAllowed("solo@example.com")).toBe(true);
    expect(isAllowed("other@example.com")).toBe(false);
  });

  it("supports multiple configured emails", () => {
    process.env.ALLOWED_EMAILS = "a@example.com,b@example.com,c@example.com";
    expect(isAllowed("a@example.com")).toBe(true);
    expect(isAllowed("b@example.com")).toBe(true);
    expect(isAllowed("c@example.com")).toBe(true);
    expect(isAllowed("d@example.com")).toBe(false);
  });

  it("ignores surrounding whitespace on each configured entry", () => {
    process.env.ALLOWED_EMAILS = "  a@example.com ,\tb@example.com\t,  c@example.com  ";
    expect(isAllowed("a@example.com")).toBe(true);
    expect(isAllowed("b@example.com")).toBe(true);
    expect(isAllowed("c@example.com")).toBe(true);
  });

  it("tolerates a trailing comma (empty trailing entry is dropped, not allowed)", () => {
    process.env.ALLOWED_EMAILS = "a@example.com,b@example.com,";
    expect(isAllowed("a@example.com")).toBe(true);
    expect(isAllowed("b@example.com")).toBe(true);
    // The empty trailing segment must NOT become an allowed entry.
    expect(isAllowed("")).toBe(false);
    expect(isAllowed("   ")).toBe(false);
  });

  it("tolerates leading, doubled, and interior empty segments", () => {
    process.env.ALLOWED_EMAILS = ",a@example.com,,b@example.com,";
    expect(isAllowed("a@example.com")).toBe(true);
    expect(isAllowed("b@example.com")).toBe(true);
    expect(isAllowed("")).toBe(false);
  });

  it("treats a whitespace-only ALLOWED_EMAILS as empty (fail closed)", () => {
    process.env.ALLOWED_EMAILS = "   ,  , \t ";
    expect(isAllowed("a@example.com")).toBe(false);
  });

  it("lowercases configured entries so a mixed-case env still matches", () => {
    process.env.ALLOWED_EMAILS = "MixedCase@Example.COM";
    expect(isAllowed("mixedcase@example.com")).toBe(true);
    expect(isAllowed("MIXEDCASE@EXAMPLE.COM")).toBe(true);
  });

  it("rejects null/undefined/blank candidates regardless of env", () => {
    process.env.ALLOWED_EMAILS = "a@example.com";
    expect(isAllowed(null)).toBe(false);
    expect(isAllowed(undefined)).toBe(false);
    expect(isAllowed("")).toBe(false);
    expect(isAllowed("   ")).toBe(false);
  });
});
