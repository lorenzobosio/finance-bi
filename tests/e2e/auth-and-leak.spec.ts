import { expect, test } from "@playwright/test";

// Auth + anon-no-leak boundary E2E (E2E-02, D-12; threats T-07-22/T-07-23).
//
// The suite runs on the `NEXT_PUBLIC_DEMO=1` build, where `src/middleware.ts` early-returns before
// any Google-OAuth work and the anon RLS cap pins every read to `is_demo=true`. That path CANNOT
// exercise the real unauthenticated→/login redirect (there is no session tier to fail), and Google
// OAuth has no headless IdP to script (RESEARCH Pitfall 4). So the boundary is covered in layers:
//
//   1. RENDER-tier no-leak (asserted here): on the demo build, NO real-household PII renders — no
//      real owner name, no @-email, no IBAN-shaped token — only the synthetic Alice/Bob demo.
//   2. AUTH-tier redirect (unauthenticated → /login): covered by the middleware UNIT test
//      (`test/middleware*.mjs` / vitest) + the frozen PUBLIC_PATHS list — NOT scripted here, because
//      the demo webServer disables the auth gate by design. Recorded in the SUMMARY.
//   3. DB-tier no-leak (anon reads only see is_demo=true): covered by `pnpm test:rls` /
//      `pnpm test:rls:demo` at the SQL layer. Recorded in the SUMMARY.
test.describe("Anon-no-leak — the demo build never renders real-household data", () => {
  // The render-tier no-leak invariant applies to every no-login surface.
  const surfaces = ["/", "/goal", "/transactions"] as const;

  for (const path of surfaces) {
    test(`no PII / no real-owner figure leaks on ${path}`, async ({ page }) => {
      await page.goto(path);
      // innerText = VISIBLE text only (excludes <script>/<style>), so framework CSS `@media` and
      // inline-JS "@" don't false-positive — catch a real email in what a user SEES, not a CSS at-rule.
      const body = (await page.innerText("body")) ?? "";
      const lc = body.toLowerCase();
      // The real owners must NEVER appear in a public-demo render (D4-08/26).
      expect(lc).not.toContain("lorenzo");
      expect(lc).not.toContain("fernanda");
      // No REAL email address and no IBAN-shaped token in the visible demo surface (D4-06, R-D).
      expect(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(body)).toBe(false);
      expect(/\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4,}\b/.test(body)).toBe(false);
    });
  }
});

// The auth-redirect contract is documented, not scripted on the demo build (see the layered note
// above). This test records the invariant so the suite reads as intentional coverage, and asserts
// the ONE thing the demo build CAN prove about the boundary: /api/health is reachable WITHOUT a
// session (it is public in PUBLIC_PATHS) — i.e. the public surface is not gated, while the
// protected-path redirect is proven by the middleware unit test on the real (non-demo) build.
test("public /api/health is reachable without a session (PUBLIC_PATHS)", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
});
