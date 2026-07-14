import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (PWA-01, D-17 isolation) — freezes the middleware public-path contract that the
// 11-02 slice must satisfy. A POSITIVE source-presence probe of src/middleware.ts (the readFileSync
// idiom from test/types-drift.test.ts): it is RED now (the four tokens are absent from PUBLIC_PATHS)
// and turns GREEN once 11-02 extends the allowlist.
//
// WHY these paths MUST be public (11-RESEARCH Pitfall 3): on the real deploy the auth middleware
// 307-redirects any unauthenticated request to /login. If /sw.js, /manifest.webmanifest, /icons, and
// the /~offline route are NOT allowlisted, the browser's SW/manifest/icon/offline fetches redirect to
// /login — the SW never registers, the manifest never parses, and the login page gets precached AS
// the offline fallback. Allowlisting these four low-info static paths fixes it.
//
// Node-env text probe only: we do NOT import middleware.ts (it pulls next/server + @supabase/ssr,
// which need the Next runtime). We assert on the SOURCE text, so this stays a pure node unit.

const MIDDLEWARE_SRC = readFileSync(
  join(__dirname, "..", "src/middleware.ts"),
  "utf8",
);

describe("middleware PUBLIC_PATHS — the four PWA static paths are allowlisted (D-17)", () => {
  // Positive presence: each token MUST appear (RED until 11-02 extends PUBLIC_PATHS).
  // NOT a negative/zero-count gate — a positive assertion cannot pass vacuously.
  for (const token of ["/sw.js", "/manifest.webmanifest", "/icons", "/~offline"]) {
    it(`declares "${token}" as a public path`, () => {
      expect(MIDDLEWARE_SRC).toContain(token);
    });
  }
});
