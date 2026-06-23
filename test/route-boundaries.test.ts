import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Wave-0 RED test (DSN-06d) — every protected route must ship a `loading.tsx` (Suspense
// fallback) and an `error.tsx` (error boundary) so a slow/failed mart read degrades to a
// skeleton or a recoverable error UI instead of a hung or blank page.
//
// RED until Plans 03/04/05/06: no route boundary exists in the repo today (confirmed: no
// loading.tsx/error.tsx anywhere under src/app), AND the routes are still the pt-BR
// `gastos`/`transacoes`. The anglicized `spending`/`transactions` dirs + the boundary files
// land in the later waves — this fs assertion fails until then.

const appDir = fileURLToPath(new URL("../src/app", import.meta.url));

// The protected route segments that must each carry both boundary files, RELATIVE to src/app.
// The `(protected)` route-group root provides the shell-level pair; each leaf refines it.
const PROTECTED_ROUTES = [
  "(protected)",
  "(protected)/spending",
  "(protected)/transactions",
  "(protected)/cost-centers",
  "(protected)/config",
] as const;

describe("route boundaries — every protected route has loading.tsx + error.tsx (DSN-06d)", () => {
  for (const route of PROTECTED_ROUTES) {
    it(`${route} has a loading.tsx`, () => {
      expect(existsSync(`${appDir}/${route}/loading.tsx`)).toBe(true);
    });
    it(`${route} has an error.tsx`, () => {
      expect(existsSync(`${appDir}/${route}/error.tsx`)).toBe(true);
    });
  }
});
