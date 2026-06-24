import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Phase-0 hardening — public-repo regression guard.
//
// This repo is going public. The two real allowlisted emails are PII and must live
// ONLY in `.env.local` (git-ignored). They must NEVER appear in any TRACKED file
// (migrations, seeds, tests, docs, source). This test greps every tracked file and
// FAILS if a forbidden email literal is found.
//
// It loads the forbidden literals from `.env.local` (ALLOWED_EMAILS) at runtime so the
// real emails are NEVER written into this committed test. It also derives a generic
// pattern (the two local-parts @ gmail.com) as a second net. Assertions are on counts /
// booleans only — the offending email value is never printed, so a CI log of a failing
// run never leaks the PII it is protecting.
//
// If `.env.local` is absent (e.g. fresh CI without the secret), the env-derived literals
// are skipped, but the structural gmail-pattern net still runs against tracked files.

const repoRoot = resolve(__dirname, "..");

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\n").filter((f) => f.length > 0);
}

function loadForbiddenLiteralsFromEnvLocal(): string[] {
  const envPath = resolve(repoRoot, ".env.local");
  if (!existsSync(envPath)) return [];
  const raw = readFileSync(envPath, "utf8");
  const line = raw.split("\n").find((l) => /^\s*ALLOWED_EMAILS\s*=/.test(l));
  if (!line) return [];
  const value = line.replace(/^\s*ALLOWED_EMAILS\s*=/, "").trim();
  return value
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

// Files whose CONTENT we scan. Skip obvious binaries and the lockfile by extension.
const BINARY_OR_NOISE = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|eot|pdf|lock)$/i;

function scannableFiles(): string[] {
  return trackedFiles().filter((f) => {
    if (BINARY_OR_NOISE.test(f)) return false;
    if (f === "pnpm-lock.yaml") return false;
    // The guard test itself legitimately mentions ".env.local" / patterns; it never
    // contains a real email literal, so scanning it is safe and intentional.
    return true;
  });
}

function readTracked(file: string): string {
  try {
    return readFileSync(resolve(repoRoot, file), "utf8");
  } catch {
    return "";
  }
}

describe("source cleanliness — no real allowlist PII in tracked files (Phase-0)", () => {
  const files = scannableFiles();

  it("has at least one tracked file to scan (sanity)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("contains NO real allowlisted email literal from .env.local in any tracked file", () => {
    const forbidden = loadForbiddenLiteralsFromEnvLocal();
    if (forbidden.length === 0) {
      // No .env.local available in this environment — the structural net below still runs.
      return;
    }
    const offendingFileCount = files.filter((f) => {
      const content = readTracked(f).toLowerCase();
      return forbidden.some((email) => content.includes(email));
    }).length;
    // Assert on a COUNT only — never print the email or the file's contents.
    expect(offendingFileCount).toBe(0);
  });

  it("contains NO gmail.com address matching the two allowlisted local-parts in tracked files", () => {
    // Structural backstop independent of .env.local: the two known local-parts of the
    // real emails. Encoded as a regex over local-part + @gmail.com so the full address
    // is never spelled out as a single literal in this committed file.
    const localParts = ["lorenzobrazilbosio", "femarqs3"];
    const pattern = new RegExp(
      `(?:${localParts.join("|")})@gmail\\.com`,
      "i",
    );
    const offendingFileCount = files.filter((f) =>
      pattern.test(readTracked(f)),
    ).length;
    expect(offendingFileCount).toBe(0);
  });
});

// Phase-4 extension (R-D, Threat 2/3) — the public-demo is the first unauthenticated surface,
// so three structural guards permanently block the highest-leverage PII / privilege leaks:
//   (1) NO email literal in a migration or seed script (a reviewer/agent "helpfully" writing
//       `UPDATE members SET auth_email='real@email'` would be a permanent git-history leak — D4-23
//       mandates DDL-only migrations + env-seeded population).
//   (2) NO real-IBAN-shaped token in the synthetic seed generator/script (D4-06: every demo row
//       carries `counterparty_iban: null`; the generator emits synthetic labels only).
//   (3) NEXT_PUBLIC_DEMO (the public-demo flag) must NEVER co-locate with the `service_role`
//       chokepoint (FND-03 / Threat-3: the public bundle must never carry the write-plane key).
//
// All three assert on COUNTS only (the offending content is never printed). This test file must
// itself spell out the patterns it scans for, so it carries the marker token `gsd-cleanliness-allow`
// and is excluded from the scans below — the guards never self-trip.
const SELF_ALLOW_MARKER = "gsd-cleanliness-allow";

function selfAllowed(file: string): boolean {
  // This guard test legitimately contains the pattern strings; skip any file carrying the marker.
  return readTracked(file).includes(SELF_ALLOW_MARKER);
}

describe("source cleanliness — Phase-4 demo/identity PII + privilege guards", () => {
  const files = scannableFiles();

  it("contains NO email literal in any tracked drizzle/** or scripts/** file (R-D, no PII in git)", () => {
    // local-part @ domain . tld — a generic email shape. Migrations are DDL-only and seed scripts
    // are env-seeded, so a literal email in either is a forbidden hardcoded credential/PII.
    const emailShape = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const offendingFileCount = files.filter((f) => {
      if (!/^(drizzle|scripts)\//.test(f)) return false;
      if (selfAllowed(f)) return false;
      return emailShape.test(readTracked(f));
    }).length;
    expect(offendingFileCount).toBe(0);
  });

  it("contains NO real-IBAN-shaped token in src/lib/demo/** or scripts/seed-demo.ts (D4-06 synthetic-only)", () => {
    // IBAN shape: two uppercase letters, two digits, then 4-or-more alphanumerics (word-boundaried
    // so ordinary identifiers do not false-positive). The seed must be synthetic; counterparty_iban
    // is null on every row, so no IBAN-shaped literal may appear in the generator/seed surface.
    const ibanShape = /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4,}\b/;
    const offendingFileCount = files.filter((f) => {
      const inScope = /^src\/lib\/demo\//.test(f) || f === "scripts/seed-demo.ts";
      if (!inScope) return false;
      if (selfAllowed(f)) return false;
      return ibanShape.test(readTracked(f));
    }).length;
    expect(offendingFileCount).toBe(0);
  });

  it("never co-locates NEXT_PUBLIC_DEMO with the service_role chokepoint in one file (FND-03, Threat-3)", () => {
    // The public-demo bundle gets ONLY the anon key (D4-15). A file that mentions the public-demo
    // flag AND imports the server-only service-role client would risk dragging the write plane into
    // the public bundle — forbidden. Assert no tracked file contains both.
    const demoFlag = /NEXT_PUBLIC_DEMO\b/;
    const serviceRole = /service_role|createServiceClient|supabase\/service/;
    const offendingFileCount = files.filter((f) => {
      if (selfAllowed(f)) return false;
      const content = readTracked(f);
      return demoFlag.test(content) && serviceRole.test(content);
    }).length;
    expect(offendingFileCount).toBe(0);
  });
});
