# Deferred Items — Phase 00 Foundation

Out-of-scope discoveries logged during execution (not fixed in the originating plan).

## Plan 00-03

- **`.claude/scripts/**/*.cjs` lint errors (~114, `no-require-imports`)** — GSD tooling,
  untracked, not part of the Next app. Resolved structurally by adding `.claude/**` (and
  `.planning/**`, `drizzle/**`) to the ESLint `ignores` in `eslint.config.mjs` so lint
  only covers application code. No tooling source was changed.
