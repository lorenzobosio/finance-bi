// scripts/write-insight.ts
//
// The `insights` WRITER (AI-01/02) — step 3 of the gen-insight command. The contract, in one breath:
//
//   parse --kind + --body (+ optional --token-count) from argv -> open a postgres-driver connection
//   (DATABASE_URL) -> insert into public.insights (kind, body, is_demo=false, token_count) -> release
//   the connection in finally. Logs COUNTS ONLY — never the body text, never the connection string.
//
// The prose that lands here was written by the owner's SUBSCRIPTION-POOLED Claude Code session (the
// cloud routine, primary; or a local /loop, fallback) from the bounded PII-safe snapshot — there is
// NO metered path: this script adds no @anthropic-ai SDK and requires no ANTHROPIC_API_KEY (D-01).
//
// DB WRITES use the `postgres` driver via DATABASE_URL — the project's Node-side write plane
// (mirrors scripts/seed-demo.ts / scripts/ingest.ts). The direct connection role bypasses RLS to
// write the real (is_demo=false) row; it NEVER uses the privileged Supabase key and is NEVER
// imported into the Next app/client bundle (FND-03).

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Load .env.local first: \`set -a; . ./.env.local; set +a\``,
    );
  }
  return v;
}

/** The two insight kinds this phase generates (D-04): the weekly memo + the monthly MoM note. */
const ALLOWED_KINDS = new Set(["weekly_report", "whats_changed", "overspend"]);

/** Parse a `--flag value` pair from argv (supports `--flag=value` too). Returns null when absent. */
function parseFlag(argv: string[], flag: string): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === flag) return argv[i + 1] ?? null;
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return null;
}

export interface WriteInsightArgs {
  kind: string;
  body: string;
  tokenCount: number | null;
}

/** Extract + validate the writer args from argv. Throws (never logs the body) on a bad shape. */
export function parseWriteInsightArgs(argv: string[]): WriteInsightArgs {
  const kind = parseFlag(argv, "--kind");
  const body = parseFlag(argv, "--body");
  const tokenRaw = parseFlag(argv, "--token-count");

  if (!kind || !ALLOWED_KINDS.has(kind)) {
    throw new Error(
      `--kind must be one of ${[...ALLOWED_KINDS].join(" | ")} (got ${kind ? "an unrecognized kind" : "nothing"})`,
    );
  }
  if (!body || body.trim() === "") {
    throw new Error("--body is required (the CFO-memo prose)");
  }
  const tokenCount = tokenRaw != null && tokenRaw.trim() !== "" ? Number(tokenRaw) : null;
  if (tokenCount != null && !Number.isFinite(tokenCount)) {
    throw new Error("--token-count must be a number when provided");
  }
  return { kind, body, tokenCount };
}

/** Insert one real (is_demo=false) insight row via the DATABASE_URL/postgres write plane. */
export async function writeInsight(args: WriteInsightArgs): Promise<number> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(requireEnv("DATABASE_URL"), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql`
      insert into public.insights (kind, body, is_demo, token_count)
      values (${args.kind}, ${args.body}, ${false}, ${args.tokenCount})
      returning id`;
    return rows.length;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Only write when executed directly (`pnpm tsx scripts/write-insight.ts --kind … --body …`). When
// IMPORTED (a future test), do not auto-run. CJS `require.main === module` is the portable check.
const invokedDirectly = typeof require !== "undefined" && require.main === module;

if (invokedDirectly) {
  (async () => {
    const args = parseWriteInsightArgs(process.argv.slice(2));
    const inserted = await writeInsight(args);
    // Counts ONLY (V7) — never the body text, the kind's prose, or the connection string.
    console.log(`[write-insight] inserted=${inserted}`);
    process.exit(0);
  })().catch((err) => {
    console.error(`[write-insight] fatal: ${err instanceof Error ? err.name : "UnknownError"}`);
    process.exit(1);
  });
}
