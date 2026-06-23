// scripts/ingest.ts
//
// The headless daily pull (ING-02/03/04/05, CAT-02/03/07). Run by `pnpm ingest` and the
// GitHub Actions cron. The contract, in one breath:
//
//   sign a 1h JWT -> read the connections row (session_id, last_pull_at, expires_at) ->
//   for each synced account: GET …/transactions?date_from=<last_pull_at − overlap>
//   (paginated by continuation_key) + a balances snapshot -> zod-validate -> normalize
//   (PDNG excluded) -> dedupe_hash -> UPSERT ON CONFLICT (dedupe_hash) DO NOTHING (a
//   re-pull adds ZERO rows) -> applyRules stamps flow_type/cost_center/category_id/
//   is_recurring/rule_id at write time -> upsert a balances snapshot -> ALWAYS write an
//   import_batches heartbeat in a finally -> on success advance connections.last_pull_at.
//
// Fail-soft: a ConsentExpiredError (403) sets connections.consent_status='expired', writes
// a batch with status 'auth_expired', and exits 0 (the banner is the alert — NEVER a silent
// retry, which is the classic freeze). A transient error writes status 'error' and exits 1.
// Forward-only — no historical backfill (D-14).
//
// DB WRITES use the `postgres` driver via DATABASE_URL (the project's Node-side DB pattern,
// mirroring scripts/eb-connect.ts) — NOT createServiceClient()/@supabase/supabase-js:
// service.ts's `import "server-only"` throws outside an RSC build, and supabase-js eagerly
// inits a Realtime WebSocket that Node 20 lacks. A direct DB connection runs as the
// connection role and bypasses RLS (the service_role-equivalent the cron needs).
//
// SERVER-PLANE ONLY (FND-03): never imported into the Next app/client bundle. Logs ONLY
// counts/status (V7) — never full descriptions, amounts, IBANs, keys, or the JWT.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { signEbJwt } from "@/lib/ingestion/enable-banking/jwt";
import {
  ConsentExpiredError,
  balances as ebBalances,
  fetchTransactions as ebFetchTransactions,
} from "@/lib/ingestion/enable-banking/client";
import type { Balance, RawTx } from "@/lib/ingestion/enable-banking/schemas";
import { normalize, type Normalized } from "@/lib/ingestion/normalize";
import { dedupeHash } from "@/lib/ingestion/dedupe";
import { applyRules, type RuleAccount } from "@/lib/ingestion/rules/engine";
import { BUILTIN_RULE_IDS, INVESTING_SIGNATURE, type RuleId } from "@/lib/ingestion/rules/builtins";
import type { DbRule } from "@/lib/ingestion/rules/db-rules";

const REPO_ROOT = resolve(__dirname, "..");

// A small overlap so a delayed catch-up run never misses a same-day transaction. Idempotency
// (the dedupe hash + ON CONFLICT DO NOTHING) makes the overlap harmless — re-seen rows match.
const OVERLAP_DAYS = 2;

// ---------------------------------------------------------------------------
// Injectable DB writer (mirrors eb-connect's ConsentWriter). The default impl drives the
// postgres driver; the contract test injects a thin in-memory fake (NO live DB).
// ---------------------------------------------------------------------------

/** A normalized + classified row ready to upsert into transactions. */
export interface TxUpsert {
  accountId: string;
  bookingDate: string;
  valueDate: string | null;
  amountEur: number;
  descriptionRaw: string;
  counterparty: string | null;
  counterpartyIban: string | null;
  flowType: "revenue" | "cost" | "investimento" | "transferencia";
  costCenter: string;
  categoryId: string | null;
  isRecurring: boolean;
  ruleId: string;
  importBatchId: string;
  dedupeHash: string;
  status: string;
}

/** A balances snapshot row for one account/day. */
export interface BalanceUpsert {
  accountId: string;
  asOfDate: string;
  balanceEur: number;
}

/** The import_batches heartbeat row written EVERY run. */
export interface BatchRow {
  id: string;
  source: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  fetched: number;
  inserted: number;
  skipped: number;
  error: string | null;
}

/** The accounts the cron should refresh, plus the matching shape the rules engine needs. */
export interface IngestAccount extends RuleAccount {
  /** The Enable Banking account uid; null for the virtual (not-synced) investing row. */
  enableBankingId: string | null;
  isSynced: boolean;
}

/**
 * The minimal write surface ingest needs. The default impl is the postgres-driver writer;
 * the contract test injects an in-memory fake. Keeping it thin keeps PII out of the test.
 */
export interface IngestWriter {
  /** The connections row the pull reads (session_id, last_pull_at, consent state). */
  getConnection(): Promise<{
    id: string;
    sessionId: string | null;
    lastPullAt: string | null;
    consentStatus: string | null;
  } | null>;
  /** The accounts to refresh (synced) + the investing rows used for classification. */
  getAccounts(): Promise<IngestAccount[]>;
  /** Load user-authored DB rules (consulted before the builtins; CAT-04). */
  getDbRules(): Promise<DbRule[]>;
  /** Upsert transactions ON CONFLICT (dedupe_hash) DO NOTHING. Returns the count inserted. */
  upsertTransactions(rows: TxUpsert[]): Promise<number>;
  /** Upsert a balances snapshot idempotently per (account_id, as_of_date). */
  upsertBalance(row: BalanceUpsert): Promise<void>;
  /** Flag the connection's consent as expired (the 403 fail-soft path). */
  markConsentExpired(connectionId: string): Promise<void>;
  /** Advance connections.last_pull_at (only on a successful run). */
  advanceLastPull(connectionId: string, at: string): Promise<void>;
  /** Write the import_batches heartbeat (ALWAYS — in finally). */
  writeBatch(row: BatchRow): Promise<void>;
  /** Release the DB connection (postgres-driver writer). Optional for fakes. */
  close?(): Promise<void>;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Load .env.local first: \`set -a; . ./.env.local; set +a\``,
    );
  }
  return v;
}

/**
 * Build the default postgres-driver writer (service_role-equivalent — bypasses RLS).
 * Constructed lazily so importing this module (e.g. the test) never touches DATABASE_URL.
 */
export async function createServiceWriter(): Promise<IngestWriter> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(requireEnv("DATABASE_URL"), { max: 1, onnotice: () => {} });
  return {
    async getConnection() {
      const rows = await sql`
        select id, session_id, last_pull_at, consent_status
        from connections
        order by created_at desc
        limit 1`;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id as string,
        sessionId: (r.session_id as string | null) ?? null,
        lastPullAt: r.last_pull_at ? new Date(r.last_pull_at as string).toISOString() : null,
        consentStatus: (r.consent_status as string | null) ?? null,
      };
    },
    async getAccounts() {
      const rows = await sql`
        select id, enable_banking_id, iban, default_cost_center, is_investment, is_synced
        from accounts`;
      return rows.map((r) => {
        const isInvestment = Boolean(r.is_investment);
        return {
          id: r.id as string,
          enableBankingId: (r.enable_banking_id as string | null) ?? null,
          iban: (r.iban as string | null) ?? null,
          defaultCostCenter: (r.default_cost_center as string | null) ?? "shared",
          isInvestment,
          isSynced: Boolean(r.is_synced),
          // The non-PSD2-exposed investing pocket is matched by the contribution's description
          // ("To investment account"); cash accounts carry no signature (D-22, €100k keystone).
          counterpartySignature: isInvestment ? INVESTING_SIGNATURE : undefined,
        };
      });
    },
    async getDbRules() {
      // User-authored rules consulted BEFORE the builtins (CAT-04). The builtin-seed rows
      // (0005) carry NULL match_criteria, so they never match here — they exist only so a
      // builtin classification's rule_id FK-resolves. match_criteria is stored as JSON text
      // (e.g. {"contains":"<token>"}); parse defensively and skip a row whose criteria is
      // absent/unparseable rather than crash the whole cron.
      const rows = await sql`
        select id, priority, version, match_criteria, set_cost_center, set_flow_type
        from rules`;
      const parsed: DbRule[] = [];
      for (const r of rows) {
        const raw = r.match_criteria as string | null;
        if (raw == null || raw === "") continue; // builtin seed rows (no criteria) skipped
        let matchCriteria: { contains?: string };
        try {
          matchCriteria = JSON.parse(raw) as { contains?: string };
        } catch {
          continue; // malformed criteria — ignore this row, never throw
        }
        parsed.push({
          id: r.id as string,
          priority: Number(r.priority ?? 0),
          version: Number(r.version ?? 1),
          matchCriteria,
          setsCostCenter: (r.set_cost_center as string | null) ?? null,
          setsFlowType:
            (r.set_flow_type as DbRule["setsFlowType"] | null) ?? null,
        });
      }
      return parsed;
    },
    async upsertTransactions(rows) {
      if (rows.length === 0) return 0;
      let inserted = 0;
      // ON CONFLICT (dedupe_hash) DO NOTHING — the DB UNIQUE(dedupe_hash) is the real
      // idempotency safety net; a re-pull adds zero rows. RETURNING id counts only the
      // rows actually inserted (conflicts return nothing).
      for (const t of rows) {
        // Stamp the REAL rule_id (D2-04 — never NULL). A builtin classification carries a
        // RuleId string -> map it to its seeded uuid via BUILTIN_RULE_IDS; a DB-rule
        // classification already carries the DB rule's uuid (so the map is a no-op and we
        // fall back to t.ruleId). Every classified row now FK-resolves to a rules.id.
        const ruleId = BUILTIN_RULE_IDS[t.ruleId as RuleId] ?? t.ruleId;
        const res = await sql`
          insert into transactions (
            account_id, booking_date, value_date, amount_eur, description_raw,
            counterparty, counterparty_iban, flow_type, cost_center, category_id,
            rule_id, import_batch_id, dedupe_hash, is_recurring, status
          ) values (
            ${t.accountId}, ${t.bookingDate}, ${t.valueDate}, ${t.amountEur}, ${t.descriptionRaw},
            ${t.counterparty}, ${t.counterpartyIban}, ${t.flowType}, ${t.costCenter}, ${t.categoryId},
            ${ruleId}, ${t.importBatchId}, ${t.dedupeHash}, ${t.isRecurring}, ${t.status}
          )
          on conflict (dedupe_hash) do nothing
          returning id`;
        if (res.length > 0) inserted += 1;
      }
      return inserted;
    },
    async upsertBalance(row) {
      // Upsert by hand (check-then-update/insert) keyed on (account_id, as_of_date) —
      // idempotent per account/day. This pair is now backed by the
      // UNIQUE(account_id, as_of_date) constraint (balances_account_date_uq, 0008) which
      // closes the Pattern-10 duplicate-row landmine; the check-then-write stays as-is
      // (it already targets exactly that pair, so the constraint can never trip in normal
      // single-cron operation and a concurrent run is rejected rather than duplicated).
      const existing = await sql`
        select id from balances where account_id = ${row.accountId} and as_of_date = ${row.asOfDate} limit 1`;
      if (existing.length > 0) {
        await sql`update balances set balance_eur = ${row.balanceEur}
                  where account_id = ${row.accountId} and as_of_date = ${row.asOfDate}`;
      } else {
        await sql`insert into balances (account_id, as_of_date, balance_eur)
                  values (${row.accountId}, ${row.asOfDate}, ${row.balanceEur})`;
      }
    },
    async markConsentExpired(connectionId) {
      await sql`update connections set consent_status = 'expired' where id = ${connectionId}`;
    },
    async advanceLastPull(_connectionId, at) {
      // The daily pull is GLOBAL — the app JWT fetches every linked account regardless of
      // which consent's session_id we read — so a successful run advances EVERY active
      // connection's last_pull_at, not just one. This keeps the freshness banner correct no
      // matter which connection it reads (it reads the latest), and keeps each connection's
      // incremental date_from in step. Expired consents are left untouched (they did not pull).
      await sql`update connections set last_pull_at = ${at} where consent_status is distinct from 'expired'`;
    },
    async writeBatch(row) {
      await sql`
        insert into import_batches (source, status, started_at, finished_at, fetched, inserted, skipped, error)
        values (${row.source}, ${row.status}, ${row.startedAt}, ${row.finishedAt},
                ${row.fetched}, ${row.inserted}, ${row.skipped}, ${row.error})`;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

// ---------------------------------------------------------------------------
// Injectable fetch layer — the test mocks transactions/balances/403 without a network call.
// ---------------------------------------------------------------------------

/** The pull's data source. The default impl hits the audited EB client. */
export interface IngestFetcher {
  /** Yield raw transactions for an account since `dateFrom` (paginated upstream). */
  fetchTransactions(uid: string, dateFrom: string): AsyncGenerator<RawTx>;
  /** The balances snapshot for an account. */
  fetchBalances(uid: string): Promise<Balance[]>;
}

function defaultFetcher(jwt: string): IngestFetcher {
  return {
    fetchTransactions: (uid, dateFrom) => ebFetchTransactions(jwt, uid, dateFrom),
    fetchBalances: (uid) => ebBalances(jwt, uid),
  };
}

// ---------------------------------------------------------------------------
// runIngest — the testable core. Options let the contract test inject mocks (NO live DB,
// NO network). The default path signs the JWT and builds the postgres-driver writer.
// ---------------------------------------------------------------------------

export interface RunIngestOptions {
  /** Inject the DB writer (the test passes an in-memory fake). */
  writer?: IngestWriter;
  /** Inject the fetch layer (the test passes a mock). */
  fetcher?: IngestFetcher;
  /** Test shortcut: a fixed raw-transaction batch returned for every account (a zero-tx run is `[]`). */
  mockTransactions?: RawTx[];
  /** Test shortcut: force a transient error to prove the heartbeat still writes (finally). */
  forceError?: boolean;
  /** Test shortcut: force a 403 to prove the fail-soft consent-expired path. */
  mockStatus?: number;
}

export interface RunIngestResult {
  batchWritten: boolean;
  batchStatus: "success" | "empty" | "auth_expired" | "error";
  consentStatus: "active" | "expired";
  fetched: number;
  inserted: number;
  exitCode: 0 | 1;
}

/** Go-forward analysis window: never pull or consider transactions before this date (Lorenzo,
 * 2026-06-22). The MVP starts its monthly comparability at June 2026 — no historical backfill (D-14). */
export const INGEST_START_DATE = "2026-06-01";

/** Pick the incremental date_from: last_pull_at minus a small overlap, else a 30-day seed —
 * floored at INGEST_START_DATE so nothing before the go-forward window is ever fetched. */
function computeDateFrom(lastPullAt: string | null): string {
  const base = lastPullAt ? new Date(lastPullAt) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  base.setUTCDate(base.getUTCDate() - OVERLAP_DAYS);
  const computed = base.toISOString().slice(0, 10);
  return computed < INGEST_START_DATE ? INGEST_START_DATE : computed; // lexical compare on YYYY-MM-DD
}

/** Pick the first numeric balance amount from an EB balances payload (EUR-only MVP). */
function pickBalance(bals: Balance[]): number | null {
  for (const b of bals) {
    const amt = b.balance_amount?.amount;
    if (amt != null && amt !== "") {
      const n = Number(amt);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

export async function runIngest(opts: RunIngestOptions = {}): Promise<RunIngestResult> {
  const ownWriter = !opts.writer;
  const writer = opts.writer ?? (await createServiceWriter());

  const batchId = randomUUID();
  const startedAt = new Date().toISOString();
  let status: RunIngestResult["batchStatus"] = "success";
  let consentStatus: RunIngestResult["consentStatus"] = "active";
  let fetched = 0;
  let inserted = 0;
  let errorText: string | null = null;
  let connectionId: string | null = null;

  try {
    const connection = await writer.getConnection();
    if (!connection) {
      // No consent yet — nothing to pull. Still a heartbeat-worthy run (empty).
      status = "empty";
    } else {
      connectionId = connection.id;
      const accounts = await writer.getAccounts();
      const accountsById = new Map<string, IngestAccount>(accounts.map((a) => [a.id, a]));
      // Load user-authored DB rules once per run; the engine consults them before the builtins
      // (CAT-04). The cron is the WRITE plane that LOADS them — the engine stays pure.
      const dbRules = await writer.getDbRules();
      // Only refresh real, synced accounts (the virtual investing row has no live uid).
      const syncedAccounts = accounts.filter((a) => a.isSynced && a.enableBankingId);

      // Build the fetcher only when a real network pull is needed. The test shortcuts
      // (mockTransactions / mockStatus) and an injected fetcher skip the JWT signing, so a
      // test never needs the EB env vars or the private key.
      const needsLiveFetch =
        !opts.fetcher && opts.mockTransactions === undefined && opts.mockStatus === undefined;
      let fetcher = opts.fetcher;
      if (needsLiveFetch) {
        const appId = requireEnv("ENABLE_BANKING_APP_ID");
        const keyPath = requireEnv("ENABLE_BANKING_PRIVATE_KEY_PATH");
        const privateKeyPem = await readFile(resolve(REPO_ROOT, keyPath), "utf8");
        const jwt = await signEbJwt(appId, privateKeyPem);
        fetcher = defaultFetcher(jwt);
      }

      const dateFrom = computeDateFrom(connection.lastPullAt);
      const upserts: TxUpsert[] = [];

      for (const account of syncedAccounts) {
        const uid = account.enableBankingId as string;

        // A forced 403 (test) or a real 403 from the EB client throws ConsentExpiredError.
        if (opts.mockStatus === 403) {
          throw new ConsentExpiredError(`EB GET /accounts/${uid}/transactions -> 403`);
        }

        const rawRows: RawTx[] =
          opts.mockTransactions !== undefined
            ? opts.mockTransactions
            : fetcher
              ? await collect(fetcher.fetchTransactions(uid, dateFrom))
              : [];

        for (const raw of rawRows) {
          fetched += 1;
          const n = normalize(raw, account.id);
          if (!n) continue; // PDNG / non-BOOK excluded
          const { hash } = dedupeHash(n);
          const cls = applyRules(toRuleTx(n), accountsById, dbRules);
          upserts.push({
            accountId: n.accountId,
            bookingDate: n.bookingDate,
            valueDate: n.valueDate,
            amountEur: n.amount,
            descriptionRaw: n.descriptionRaw,
            counterparty: n.counterpartyName,
            counterpartyIban: n.counterpartyIban,
            flowType: cls.flowType,
            costCenter: cls.costCenter,
            categoryId: cls.categoryId,
            isRecurring: cls.isRecurring,
            ruleId: cls.ruleId,
            importBatchId: batchId,
            dedupeHash: hash,
            status: "BOOK",
          });
        }

        // Balances snapshot (forward-only; today's as_of_date).
        if (opts.mockTransactions === undefined && fetcher) {
          const bals = await fetcher.fetchBalances(uid);
          const balance = pickBalance(bals);
          if (balance != null) {
            await writer.upsertBalance({
              accountId: account.id,
              asOfDate: new Date().toISOString().slice(0, 10),
              balanceEur: balance,
            });
          }
        }
      }

      // Force-error path (test): prove the heartbeat still writes from the finally.
      if (opts.forceError) {
        throw new Error("forced error (test)");
      }

      inserted = await writer.upsertTransactions(upserts);
      status = fetched === 0 ? "empty" : "success";
    }
  } catch (e) {
    if (e instanceof ConsentExpiredError) {
      status = "auth_expired";
      consentStatus = "expired";
      if (connectionId) await writer.markConsentExpired(connectionId);
    } else {
      status = "error";
      // Log a redacted error class only — never the full message (may carry PII).
      errorText = e instanceof Error ? e.name : "UnknownError";
    }
  } finally {
    // GUARANTEED heartbeat — EVERY run (success/empty/auth_expired/error) leaves a row. This
    // real DB write is also the Supabase keep-alive (ING-04, Pitfall 6).
    const finishedAt = new Date().toISOString();
    await writer.writeBatch({
      id: batchId,
      source: "enable_banking",
      status,
      startedAt,
      finishedAt,
      fetched,
      inserted,
      skipped: Math.max(fetched - inserted, 0),
      error: errorText,
    });
    // Advance the freshness pointer ONLY on a clean success (never on empty/expired/error).
    if (status === "success" && connectionId) {
      await writer.advanceLastPull(connectionId, finishedAt);
    }
    if (ownWriter) await writer.close?.();
  }

  const exitCode: 0 | 1 = status === "error" ? 1 : 0;
  // Log ONLY counts/status (V7) — never descriptions/amounts/IBANs/keys.
  console.log(
    `[ingest] status=${status} fetched=${fetched} inserted=${inserted} consent=${consentStatus} exit=${exitCode}`,
  );

  return {
    batchWritten: true,
    batchStatus: status,
    consentStatus,
    fetched,
    inserted,
    exitCode,
  };
}

/** Map a Normalized row to the rules engine's input shape. */
function toRuleTx(n: Normalized) {
  return {
    accountId: n.accountId,
    amount: n.amount,
    counterpartyName: n.counterpartyName,
    counterpartyIban: n.counterpartyIban,
    normalizedDescription: n.normalizedDescription,
  };
}

/** Drain an async generator into an array. */
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

// Only run the pull when executed directly (`pnpm ingest` / `tsx scripts/ingest.ts`). When
// IMPORTED by the contract tests, runIngest must NOT auto-run. CJS `require.main === module`
// is the portable direct-run check (same convention as eb-connect.ts).
const invokedDirectly = typeof require !== "undefined" && require.main === module;

if (invokedDirectly) {
  runIngest()
    .then((r) => process.exit(r.exitCode))
    .catch((err) => {
      console.error(`[ingest] fatal: ${err instanceof Error ? err.name : "UnknownError"}`);
      process.exit(1);
    });
}
