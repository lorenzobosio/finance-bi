// scripts/types-drift.ts — the DAT-03 schema-drift gate (D-05). Run by `pnpm types:drift` in CI.
//
// The project HAND-AUTHORS src/lib/database.types.ts (the Supabase CLI is not in the toolchain), so
// `git diff` on that file only catches uncommitted edits, never a LIVE schema rename. This script is
// the real gate: it introspects the live schema over DATABASE_URL (already a CI secret, used by
// ingest.yml) and asserts every declared relation still matches.
//
//   LIVE side     : postgres(DATABASE_URL, { max: 1 }) → information_schema.columns for schema
//                   'public' → { table, column, nullable } (is_nullable === 'YES').
//   DECLARED side : read src/lib/database.types.ts as TEXT and parse it with the TypeScript
//                   compiler API (ts.createSourceFile) — walk Database.public.Tables.*.Row and
//                   Database.public.Views.*.Row members. The file is NEVER eval'd (T-07-09).
//   DIFF          : the pure src/lib/db/types-drift-core.diffColumnSets — exit 1 on ANY
//                   added/removed/renamed column or nullability flip; exit 0 when clean.
//   DEGRADE       : if DATABASE_URL is absent (forks / Dependabot without the secret), print a loud
//                   ::warning:: and exit 0 — mirrors ci.yml's test:rls degrade path.
//
// The gate asserts column-NAME presence + NULLABILITY, NOT exact SQL types: database.types.ts maps
// numeric → string (Money) and timestamptz → string by design, so exact-type comparison is noisy.
//
// SERVER-PLANE ONLY (FND-03): never imported into the app/client bundle. Prints ONLY relation/column
// names + drift reasons — NEVER the connection string, a secret, or any row data (T-07-10).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as ts from "typescript";

import { diffColumnSets, type ColumnShape } from "@/lib/db/types-drift-core";

const REPO_ROOT = resolve(__dirname, "..");
const TYPES_FILE = resolve(REPO_ROOT, "src/lib/database.types.ts");

// ---------------------------------------------------------------------------
// DECLARED side — parse src/lib/database.types.ts via the TS compiler API (never eval'd).
// ---------------------------------------------------------------------------

/** True when a type node admits `null` (a union member `null`, or a bare `null`). */
function isNullNode(node: ts.TypeNode): boolean {
  if (node.kind === ts.SyntaxKind.NullKeyword) return true;
  return ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword;
}

/** True when a column's declared type includes `null` (e.g. `string | null`, `Money | null`). */
function typeIncludesNull(node: ts.TypeNode | undefined): boolean {
  if (!node) return false;
  if (ts.isUnionTypeNode(node)) return node.types.some(isNullNode);
  return isNullNode(node);
}

/** The property-signature members of a TypeLiteral (`{ ... }`); [] for anything else. */
function membersOf(node: ts.TypeNode | undefined): ts.PropertySignature[] {
  if (node && ts.isTypeLiteralNode(node)) {
    return node.members.filter(ts.isPropertySignature);
  }
  return [];
}

/** Find one named member's type inside a TypeLiteral (e.g. `public` inside `Database`). */
function memberType(
  node: ts.TypeNode | undefined,
  name: string,
  sf: ts.SourceFile,
): ts.TypeNode | undefined {
  return membersOf(node).find((m) => m.name.getText(sf) === name)?.type;
}

/** Parse the hand-authored types file into the declared column set (Tables.*.Row + Views.*.Row). */
function parseDeclaredShape(): ColumnShape[] {
  const text = readFileSync(TYPES_FILE, "utf8");
  const sf = ts.createSourceFile(TYPES_FILE, text, ts.ScriptTarget.Latest, /* setParentNodes */ true);

  const dbAlias = sf.statements.find(
    (s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === "Database",
  );
  if (!dbAlias) throw new Error("could not find the `Database` type alias in database.types.ts");

  const publicNode = memberType(dbAlias.type, "public", sf);
  if (!publicNode) throw new Error("could not find `Database.public` in database.types.ts");

  const declared: ColumnShape[] = [];
  for (const group of ["Tables", "Views"] as const) {
    const groupNode = memberType(publicNode, group, sf);
    for (const rel of membersOf(groupNode)) {
      const relName = rel.name.getText(sf);
      const rowNode = memberType(rel.type, "Row", sf);
      for (const col of membersOf(rowNode)) {
        declared.push({
          table: relName,
          column: col.name.getText(sf),
          nullable: typeIncludesNull(col.type),
        });
      }
    }
  }
  return declared;
}

// ---------------------------------------------------------------------------
// LIVE side — introspect information_schema.columns via the postgres driver (parameterized;
// read-only). Lazy import so merely importing/typechecking this module never touches DATABASE_URL.
// ---------------------------------------------------------------------------

async function readLiveShape(databaseUrl: string, declaredRelations: Set<string>): Promise<ColumnShape[]> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    // Static tagged-template query, zero interpolation → no SQL-injection surface (T-07-09).
    const rows = await sql<{ table_name: string; column_name: string; is_nullable: string }[]>`
      select table_name, column_name, is_nullable
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position`;
    // Scope to the relations the app actually declares (base tables + v_* views). Live-only
    // internal relations are ignored — the gate protects the typed read/write surface, not the DB.
    return rows
      .filter((r) => declaredRelations.has(r.table_name))
      .map((r) => ({
        table: r.table_name,
        column: r.column_name,
        nullable: r.is_nullable === "YES",
      }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;

  // DEGRADE: no secret (forks / Dependabot) → loud warned-skip, never a hard fail. Mirrors
  // ci.yml's test:rls gating so dependency PRs stay mergeable.
  if (!databaseUrl || databaseUrl.trim() === "") {
    console.log(
      "::warning::DATABASE_URL is not set — schema-drift gate (DAT-03) SKIPPED. " +
        "The typed-mart contract is still compile-checked by `pnpm typecheck`; the live-schema " +
        "check runs on human pushes/merges where the secret is present.",
    );
    return 0;
  }

  const declared = parseDeclaredShape();
  const declaredRelations = new Set(declared.map((c) => c.table));
  const live = await readLiveShape(databaseUrl, declaredRelations);

  const drifts = diffColumnSets(live, declared);

  if (drifts.length === 0) {
    console.log(
      `types:drift OK — ${declaredRelations.size} declared relations / ${declared.length} columns ` +
        `match the live schema (name + nullability).`,
    );
    return 0;
  }

  console.log(`::error::schema drift detected — database.types.ts diverges from the live schema in ${drifts.length} place(s):`);
  for (const d of drifts) {
    console.log(`  - ${d.table}.${d.column}: ${d.reason}`);
  }
  console.log(
    "Fix: update src/lib/database.types.ts to match the live schema (or migrate the schema back). " +
      "A dropped/renamed mart column must NOT ship as `undefined → 0` (DSN-06c / DAT-03).",
  );
  return 1;
}

// Direct-run only (`pnpm types:drift` / `tsx scripts/types-drift.ts`); mirrors scripts/ingest.ts.
// No top-level await (CJS via tsx) — chain off main() and set the exit code.
const invokedDirectly = typeof require !== "undefined" && require.main === module;
if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      // Redacted to the error CLASS only — a postgres connect error can carry host/user, and the
      // connection string must never reach CI logs (T-07-10). Same convention as scripts/ingest.ts.
      console.error(`::error::types:drift fatal: ${err instanceof Error ? err.name : "UnknownError"}`);
      process.exit(1);
    });
}
