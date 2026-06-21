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
];

export default eslintConfig;
