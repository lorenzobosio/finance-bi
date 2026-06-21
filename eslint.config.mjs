import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Non-application directories: GSD tooling, planning docs, and generated
      // Drizzle SQL/migrations are not part of the Next app and must not be linted.
      ".claude/**",
      ".planning/**",
      "drizzle/**",
    ],
  },
  // FND-03 / D-16 — service_role guard, layer 2 (fast lint failure).
  // Layer 1 is `import "server-only"` at the top of service.ts (build error);
  // layer 3 is the CI bundle grep over .next/static. Together they keep the
  // elevated service_role client off the client/browser tier.
  {
    // Block any module from importing the service_role chokepoint. It is server-only
    // and must only be reached through audited Route Handlers / the GitHub Action,
    // never imported directly by app code. The service module itself does not import
    // this path (it IS the module), so the codebase stays lint-green today; the rule's
    // job is to fail the moment a future client/UI file tries to import it.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "*/lib/supabase/service",
                "**/lib/supabase/service",
                "@/lib/supabase/service",
              ],
              message:
                "service_role client is server-only (FND-03). Reach elevated DB access only inside audited Route Handlers / server code — never import this module into client/UI code.",
            },
          ],
        },
      ],
    },
  },
  {
    // Belt-and-suspenders: forbid referencing the service-role env var in client/UI
    // files (.tsx). The secret key must never be read in a component that can ship to
    // the browser; the bundle grep is the backstop if this is ever circumvented.
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.property.name='env'][property.name='SUPABASE_SERVICE_ROLE_KEY']",
          message:
            "SUPABASE_SERVICE_ROLE_KEY must never be referenced in client/UI files (FND-03).",
        },
      ],
    },
  },
];

export default eslintConfig;
