// src/lib/transactions/query.ts — the server-side transactions query builder (TXN-01, D-03/04).
//
// The ONE place the untrusted URL search params (filters + sort + free-text search + the keyset
// cursor) are validated, escaped, and composed into the RLS-authorized transactions read. Built
// GREEN against test/tx-query.test.ts (the frozen 08-01 contract). Injection-safe by construction
// (RESEARCH Pitfall 1 / T-08-11): zod-parse + allowlist every param, esc() the free-text term, and
// validate the cursor format BEFORE it reaches a PostgREST `.or()`/`.order()` string.
//
// PURE-ISH: this module receives the supabase client as an ARGUMENT — no `next/headers`, no
// `marts.ts` import — so it stays import-safe from an RSC and unit-testable over a fake builder.
// Pagination is KEYSET (never offset): the cursor generalizes to the ACTIVE sort column + the
// mandatory `id` tiebreaker (Pattern 2 / Pitfall 4). The default (no-param) path is byte-identical
// to the pre-08-04 page read (booking_date desc, id desc).

import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Page size — one extra row is fetched (PAGE_SIZE + 1) to detect the next keyset page. */
export const PAGE_SIZE = 50;

/** The two sortable columns (allowlist — never a raw param interpolated into `.order()`). */
export const SORT_COLUMNS = ["booking_date", "amount_eur"] as const;
export type SortCol = (typeof SORT_COLUMNS)[number];

/** Sort directions (allowlist). desc → the keyset comparator `lt`; asc → `gt` (Pattern 2). */
export const DIRECTIONS = ["asc", "desc"] as const;
export type Dir = (typeof DIRECTIONS)[number];

const DEFAULT_SORT: SortCol = "booking_date";
const DEFAULT_DIR: Dir = "desc";

/** The select projection — the columns the page renders, plus `account_id` (the account filter). */
export const SELECT_COLUMNS =
  "id, booking_date, description, description_raw, counterparty, amount_eur, flow_type, category_id, cost_center, account_id, accounts(name), categories(name)";

/** A validated keyset cursor: seek STRICTLY past (sortValue, id) in the active direction. */
export interface Cursor {
  value: string;
  id: string;
}

/** The validated, injection-safe transactions read parameters. */
export interface TxParams {
  categoryId?: string | null;
  costCenter?: string | null;
  accountId?: string | null;
  flowType?: string | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
  sort: SortCol;
  dir: Dir;
  cursor?: Cursor | null;
  limit?: number;
}

// --- Cursor codec ------------------------------------------------------------------------------
// Wire format: `<value>_<uuid>`. The value (a date `YYYY-MM-DD` or a decimal amount) never contains
// `_`; the id is a 36-char uuid (hex + dashes, no `_`), so the FIRST `_` is an unambiguous separator.
// The id is format-validated exactly like the pre-08-04 parseCursor (T-02-24) — a malformed cursor
// decodes to null (→ page-1 defaults) and NEVER throws.

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

/** Encode a keyset cursor to its URL-safe `<value>_<id>` string. */
export function encodeCursor(c: Cursor): string {
  return `${c.value}_${c.id}`;
}

/** Parse `<value>_<uuid>` into a validated cursor, or null (→ first page). Never throws. */
export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  const sep = raw.indexOf("_");
  if (sep === -1) return null;
  const value = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (value.length === 0) return null;
  if (!UUID_RE.test(id)) return null;
  return { value, id };
}

// --- esc() -------------------------------------------------------------------------------------
// The free-text `q` flows into a PostgREST `.or()` STRING (supabase-js has no parameterized OR).
// The reserved grammar metacharacters `, ( ) % \ *` are stripped so a search term can neither break
// the filter grammar nor be an injection surface (Pitfall 1). Stripping (not escaping) is the safest
// choice for a substring `ilike` — the remaining term still matches by substring.

/** Neutralize the PostgREST metacharacters `, ( ) % \ *` in a free-text term. */
export function esc(term: string): string {
  return term.replace(/[,()%\\*]/g, "");
}

// --- parseTxParams -----------------------------------------------------------------------------
// zod-parse the raw URL search-param record. sort/dir are allowlisted via `z.enum(...).catch(...)`
// so an out-of-allowlist value falls back to the default — NEVER interpolated raw (Pitfall 1).

const sortSchema = z.enum(SORT_COLUMNS).catch(DEFAULT_SORT);
const dirSchema = z.enum(DIRECTIONS).catch(DEFAULT_DIR);

/** Trim a raw param to a non-empty string, or undefined (an absent/blank filter is omitted). */
function opt(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * parseTxParams — validate the raw URL search-param record into injection-safe TxParams.
 * Recognized keys: category, cost_center, account, flow, from, to, q, sort, dir, after.
 * sort ∈ {booking_date, amount_eur} (default booking_date); dir ∈ {asc, desc} (default desc);
 * `after` is decoded through the cursor codec (a malformed cursor → page 1).
 */
export function parseTxParams(record: Record<string, string | undefined>): TxParams {
  return {
    categoryId: opt(record.category),
    costCenter: opt(record.cost_center),
    accountId: opt(record.account),
    flowType: opt(record.flow),
    from: opt(record.from),
    to: opt(record.to),
    q: opt(record.q),
    sort: sortSchema.parse(record.sort),
    dir: dirSchema.parse(record.dir),
    cursor: decodeCursor(record.after),
  };
}

// --- buildTxQuery ------------------------------------------------------------------------------
// Composes the RLS-authorized read: always `.eq('is_demo', demoFilter)` (the partition chokepoint,
// D4-12), then each present filter (AND-ed), then the free-text search `.or()` group, then the
// keyset `.or()` seek on the active sort column, then `.order(sortCol).order(id).limit(PAGE_SIZE+1)`.
// PostgREST AND-s multiple `.or()` calls: `(search-OR) AND (keyset-OR) AND filters` (Pattern 3).

/**
 * buildTxQuery — compose the injection-safe, keyset-paginated transactions read under RLS.
 * The `supabase` client is passed in (the RSC's `@supabase/ssr` server client, or a test fake).
 */
export function buildTxQuery(
  supabase: SupabaseClient<Database>,
  params: TxParams,
  demoFilter: boolean,
) {
  const sortCol: SortCol = params.sort;
  const ascending = params.dir === "asc";
  const cmp = ascending ? "gt" : "lt"; // asc → gt ; desc → lt (Pattern 2)

  let query = supabase
    .from("transactions")
    .select(SELECT_COLUMNS)
    .eq("is_demo", demoFilter);

  // Filters — plain `.eq/.gte/.lte`, AND-ed with the keyset seek. An absent filter is omitted.
  if (params.categoryId) query = query.eq("category_id", params.categoryId);
  if (params.costCenter) query = query.eq("cost_center", params.costCenter);
  if (params.accountId) query = query.eq("account_id", params.accountId);
  if (params.flowType) query = query.eq("flow_type", params.flowType);
  if (params.from) query = query.gte("booking_date", params.from);
  if (params.to) query = query.lte("booking_date", params.to);

  // Free-text search — a SECOND `.or()` group over description + counterparty (esc()-neutralized).
  if (params.q) {
    const term = esc(params.q);
    query = query.or(`description.ilike.%${term}%,counterparty.ilike.%${term}%`);
  }

  // Keyset seek — generalized to the ACTIVE sort column + the mandatory id tiebreaker (Pitfall 4).
  if (params.cursor) {
    const { value, id } = params.cursor;
    query = query.or(
      `${sortCol}.${cmp}.${value},and(${sortCol}.eq.${value},id.${cmp}.${id})`,
    );
  }

  const limit = (params.limit ?? PAGE_SIZE) + 1; // one extra row → next-page detection

  return query
    .order(sortCol, { ascending })
    .order("id", { ascending })
    .limit(limit);
}
