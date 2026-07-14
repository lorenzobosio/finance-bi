// Vitest stub for the `server-only` package (whose real index.js throws at import so it can
// never load in a Client Component). Server-only source modules (e.g. src/lib/db/marts-read.ts)
// keep their real `import "server-only"` build-guard for the Next bundle; this empty alias only
// applies under vitest (node) so their PURE, injected-arg helpers stay unit-testable.
export {};
