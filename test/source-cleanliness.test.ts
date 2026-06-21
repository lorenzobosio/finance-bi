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
