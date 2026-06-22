// scripts/eb-connect.ts
//
// One-time interactive Enable Banking SCA consent — the discovery-spike form (ING-01, D-07/D-08).
//
// WHAT IT DOES (run with `pnpm eb:connect`, once PER PERSON — Lorenzo, then Fernanda):
//   1. Signs a 1h RS256 JWT (jose) with kid=ENABLE_BANKING_APP_ID, reading the RSA
//      private key from the FILE at ENABLE_BANKING_PRIVATE_KEY_PATH. The key is never
//      inlined, echoed, or logged.
//   2. GET  /aspsps?country=DE&psu_type=personal      → finds Revolut, reads its
//      maximum_consent_validity (the legal consent ceiling, resolves part of A5).
//   3. POST /auth { redirect_url = ENABLE_BANKING_REDIRECT_URL (the deployed
//      /eb/callback — EB rejected http://localhost, D-07), psu_type=personal,
//      access.valid_until, random state } → prints the bank auth URL.
//   4. The user opens the URL, logs into Revolut, approves; Revolut redirects to the
//      deployed /eb/callback page which DISPLAYS the `code`. The user pastes that code
//      into this script's stdin prompt (D-07 — no localhost listener).
//   5. POST /sessions { code } → { session_id, accounts[], access.valid_until }.
//   6. Every EB response is zod-validated at the boundary (untrusted external JSON, V5).
//   7. Enumerates the returned accounts (name / type / usage) and FLAGS whether an
//      investing / securities account is present (resolves A2).
//   8. Saves the session to a gitignored .secrets/eb-session-<timestamp>.json.
//   9. Captures PII-SCRUBBED fixtures (test/fixtures/eb-sessions.json + one
//      /accounts/{uid}/transactions page) — real names/IBANs/amounts replaced with fake
//      but shape-preserving values (CLAUDE.md PII rule, T-01-02 / V7).
//  10. Appends the live findings to .planning/phases/01-ingestion-enable-banking/01-SPIKE.md.
//
// This spike form does NOT write the database (the schema migration is plan 01-02). It
// produces 01-SPIKE.md + the local session file + scrubbed fixtures only. Re-run per
// person; each run appends its own section + saves its own session file.
//
// SAFETY: the private key, App ID, session id, and real PII are never printed to stdout
// or committed. Only counts / account names / types / the consent window are surfaced.

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// Production modules built in Tasks 1 & 2 of this plan (01-03). The script no longer
// inlines its own signer/client — it uses the audited boundary-validated ones.
import { signEbJwt } from "@/lib/ingestion/enable-banking/jwt";
import {
  aspsps as ebAspsps,
  auth as ebAuth,
  sessions as ebSessions,
} from "@/lib/ingestion/enable-banking/client";
import {
  TxPageSchema,
  type SessionAccount,
  type SessionsResponse,
} from "@/lib/ingestion/enable-banking/schemas";
// NB: src/lib/supabase/service.ts begins with `import "server-only"`, which THROWS the
// moment the module is loaded outside an RSC graph (e.g. the vitest runner). The
// service_role client is therefore imported LAZILY inside createServiceWriter() (the only
// place it is actually constructed) so the contract test — which injects a fake writer and
// never builds the live one — can import this script without tripping the server-only guard.
// The FND-03 posture is unchanged: the service module is still server-only; we just defer
// its load to the live `pnpm eb:connect` run.

const EB_BASE = "https://api.enablebanking.com";
// This project is CommonJS (no "type":"module" in package.json) and `tsx` compiles these
// scripts to CJS — so `__dirname`/`__filename` are the portable entry-point references
// (ESM-only `import.meta.dirname` is undefined under CJS). `gen-calendar.ts` uses the same
// CJS conventions (`require.main === module`).
const REPO_ROOT = resolve(__dirname, "..");

// JWT signing + the EB client + the zod boundary schemas now live in the audited
// production modules src/lib/ingestion/enable-banking/{jwt,client,schemas}.ts
// (Tasks 1 & 2 of this plan). This script imports them rather than re-deriving them.
// Local aliases keep the scrub helpers below readable.
type SessionsResponseT = SessionsResponse;
type TxPageT = z.infer<typeof TxPageSchema>;

// ---------------------------------------------------------------------------
// Consent persistence (ING-01 / ING-05 / D-10 / D-22).
//
// persistSession UPSERTS the durable consent state into Postgres via the
// server-only service_role client (createServiceClient, D-16):
//   - exactly ONE connections row (session_id, consent_status='active',
//     expires_at = the REAL access.valid_until — read, never hardcoded);
//   - one accounts row per returned account (enable_banking_id=uid, iban, name,
//     default_cost_center mapped from the account identity, is_synced=true);
//   - a virtual is_investment=true accounts row (enable_banking_id=null,
//     is_synced=false) because the spike confirmed the investing account is NOT
//     exposed over PSD2 (A2/D-22);
//   - one import_batches heartbeat row (source='enable_banking', status='success').
//
// The DB writer is INJECTABLE so the contract test (test/connect.test.ts) can assert
// expires_at === access.valid_until against a thin in-memory writer with NO live DB
// connection. The default writer is built lazily from createServiceClient() and only
// constructed when the live `pnpm eb:connect` run actually persists.
// ---------------------------------------------------------------------------

/** A row to UPSERT into accounts (the subset eb-connect controls). */
export interface AccountUpsert {
  enableBankingId: string | null;
  iban: string | null;
  name: string;
  defaultCostCenter: string | null;
  isInvestment: boolean;
  isSynced: boolean;
}

/** A row to UPSERT into connections. */
export interface ConnectionUpsert {
  provider: "enable_banking";
  sessionId: string;
  consentStatus: "active";
  expiresAt: string;
}

/**
 * The minimal write surface persistSession needs. The default implementation drives
 * the Supabase service_role client; the test injects an in-memory fake. Keeping this
 * thin keeps PII out of the test and keeps the live writer in one audited place.
 */
export interface ConsentWriter {
  upsertConnection(row: ConnectionUpsert): Promise<void>;
  upsertAccount(row: AccountUpsert): Promise<void>;
  writeHeartbeat(): Promise<void>;
}

/**
 * Map a returned EB account to its analytical cost center (CAT-07 default, D-15 —
 * a LABEL, never an access boundary). Inference is by account name from the spike's
 * identities: "Lorenzo — personal" -> lorenzo, "Fernanda — personal" -> fernanda,
 * "Joint (shared)" -> compartilhado. Returns null when ownership cannot be inferred;
 * the live run then prompts the operator (this is a one-time human-run script).
 */
export function inferCostCenter(name: string | null | undefined): string | null {
  const n = (name ?? "").toLowerCase();
  if (n.includes("lorenzo")) return "lorenzo";
  if (n.includes("fernanda")) return "fernanda";
  if (n.includes("joint") || n.includes("shared") || n.includes("compartilhado")) {
    return "compartilhado";
  }
  return null;
}

/** Heuristic: does this account look like an investing/securities/savings pocket? */
const INVESTING_SIGNALS = ["invest", "securit", "stock", "brokerage"];
export function looksLikeInvesting(a: Pick<SessionAccount, "name" | "cash_account_type" | "usage" | "product">): boolean {
  const hay = `${a.name ?? ""} ${a.cash_account_type ?? ""} ${a.usage ?? ""} ${a.product ?? ""}`.toLowerCase();
  return INVESTING_SIGNALS.some((s) => hay.includes(s));
}

/**
 * Build the default service_role-backed writer. Constructed lazily so importing this
 * module (e.g. from the test) never touches Supabase env vars.
 */
export async function createServiceWriter(): Promise<ConsentWriter> {
  // Lazy dynamic import — keeps `import "server-only"` out of the test's import graph (see
  // the import-section note). The test injects a fake writer and never reaches this path.
  const { createServiceClient } = await import("@/lib/supabase/service");
  const sb = createServiceClient();
  return {
    async upsertConnection(row) {
      const { error } = await sb
        .from("connections")
        .upsert(
          {
            provider: row.provider,
            session_id: row.sessionId,
            consent_status: row.consentStatus,
            expires_at: row.expiresAt, // the REAL valid_until — never hardcoded
          },
          { onConflict: "session_id" },
        );
      if (error) throw new Error(`connections upsert failed: ${error.message}`);
    },
    async upsertAccount(row) {
      const { error } = await sb.from("accounts").upsert(
        {
          enable_banking_id: row.enableBankingId,
          iban: row.iban,
          name: row.name,
          default_cost_center: row.defaultCostCenter,
          is_investment: row.isInvestment,
          is_synced: row.isSynced,
        },
        { onConflict: "enable_banking_id" },
      );
      if (error) throw new Error(`accounts upsert failed: ${error.message}`);
    },
    async writeHeartbeat() {
      const now = new Date().toISOString();
      const { error } = await sb.from("import_batches").insert({
        source: "enable_banking",
        status: "success",
        started_at: now,
        finished_at: now,
      });
      if (error) throw new Error(`heartbeat insert failed: ${error.message}`);
    },
  };
}

/**
 * Persist a successful /sessions response to Postgres (ING-01 / ING-05).
 *
 * Writes (via the injected or default service_role writer):
 *   1. one connections row — expires_at === session.access.valid_until (D-10);
 *   2. one accounts row per returned account (cost center inferred, is_synced=true);
 *   3. a virtual is_investment=true accounts row when no investing account is
 *      exposed (A2/D-22 — the confirmed Revolut case);
 *   4. one import_batches heartbeat (source='enable_banking', status='success').
 *
 * @returns { sessionId, accountUids, expiresAt } — expiresAt is the REAL consent
 *          window read from the response (the contract test asserts this equals the
 *          fixture access.valid_until; never a hardcoded 90/180).
 */
export async function persistSession(
  session: SessionsResponseT,
  writer?: ConsentWriter,
  costCenterByUid: Record<string, string> = {},
): Promise<{ sessionId: string; accountUids: string[]; expiresAt: string }> {
  const w = writer ?? (await createServiceWriter());
  const expiresAt = session.access.valid_until;

  // 1. The single connections row — the source of truth the cron reuses.
  await w.upsertConnection({
    provider: "enable_banking",
    sessionId: session.session_id,
    consentStatus: "active",
    expiresAt,
  });

  // 2. One accounts row per returned account. The operator-confirmed override (if any)
  //    wins over name inference for default_cost_center.
  let anyInvestingExposed = false;
  for (const a of session.accounts) {
    const investing = looksLikeInvesting(a);
    if (investing) anyInvestingExposed = true;
    await w.upsertAccount({
      enableBankingId: a.uid,
      iban: a.account_id?.iban ?? null,
      name: a.name ?? a.uid,
      defaultCostCenter: costCenterByUid[a.uid] ?? inferCostCenter(a.name),
      isInvestment: investing,
      isSynced: true,
    });
  }

  // 3. Virtual investing row (A2/D-22) — investing pocket is NOT PSD2-exposed for
  //    Revolut, so investimento is matched on the OUTGOING leg against this row.
  if (!anyInvestingExposed) {
    await w.upsertAccount({
      enableBankingId: null, // virtual — no live bank account behind it
      iban: null, // the counterparty signature is set when the contribution rule lands (01-04)
      name: "Investing (virtual)",
      defaultCostCenter: null,
      isInvestment: true,
      isSynced: false, // the daily pull does not refresh a virtual account
    });
  }

  // 4. Heartbeat — the connect run itself counts as a keep-alive.
  await w.writeHeartbeat();

  return {
    sessionId: session.session_id,
    accountUids: session.accounts.map((a) => a.uid),
    expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Load .env.local first: \`set -a; . ./.env.local; set +a\``,
    );
  }
  return v;
}

async function ebFetch(
  path: string,
  jwt: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${EB_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  if (!res.ok) {
    // Surface the status + EB error body (which is NOT financial PII) but never the JWT.
    throw new Error(
      `EB ${init?.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 500)}`,
    );
  }
  return json;
}

// Stable fake IBAN/name/amount generators for PII scrubbing — shape-preserving.
function fakeIban(seed: number): string {
  const n = String(10_000_000_000_000_000 + seed).slice(0, 16);
  return `DE89${n}`;
}
function scrubName(seed: number): string {
  return `Counterparty ${String.fromCharCode(65 + (seed % 26))}`;
}
function scrubAmount(seed: number): string {
  // Deterministic fake magnitude, two decimals, preserving "string amount" shape.
  return (((seed * 37) % 5000) + 1 + Number(((seed * 7) % 100) / 100)).toFixed(2);
}

/** Replace real financial PII in a /sessions response with fake, shape-preserving values. */
function scrubSession(session: SessionsResponseT): SessionsResponseT {
  return {
    ...session,
    session_id: "sess-REDACTED",
    accounts: session.accounts.map((a, i) => {
      // The base schema is `.passthrough()`, so Revolut fields it doesn't model
      // (all_account_ids, identification_hash[es], postal_address, …) survive the
      // spread — and several of them carry real PII (IBANs, addresses, stable account
      // tokens). Redact those explicitly; a public repo must never hold real values.
      const scrubbed = {
        ...a,
        uid: `uid-${i + 1}`,
        name: a.name ? `Account ${i + 1}` : a.name,
        account_id: a.account_id
          ? { ...a.account_id, iban: a.account_id.iban ? fakeIban(i + 1) : undefined }
          : a.account_id,
      } as Record<string, unknown>;

      if (Array.isArray(scrubbed.all_account_ids)) {
        scrubbed.all_account_ids = (
          scrubbed.all_account_ids as Array<Record<string, unknown>>
        ).map((id) => ({
          ...id,
          identification: id.identification ? fakeIban(i + 1) : id.identification,
        }));
      }
      if ("identification_hash" in scrubbed && scrubbed.identification_hash) {
        scrubbed.identification_hash = "hash-REDACTED";
      }
      if (Array.isArray(scrubbed.identification_hashes)) {
        scrubbed.identification_hashes = (
          scrubbed.identification_hashes as unknown[]
        ).map(() => "hash-REDACTED");
      }
      // Defensively drop free-text PII carriers we never need in a fixture.
      for (const k of ["postal_address", "account_servicer", "details"] as const) {
        if (scrubbed[k]) scrubbed[k] = null;
      }
      return scrubbed as (typeof session.accounts)[number];
    }),
  };
}

/** Replace real financial PII in a transactions page with fake, shape-preserving values. */
function scrubTxPage(page: TxPageT): TxPageT {
  return {
    ...page,
    continuation_key: page.continuation_key ? "cont-REDACTED" : undefined,
    transactions: page.transactions.map((t, i) => ({
      ...t,
      transaction_id: t.transaction_id ? `txn-${i + 1}` : t.transaction_id,
      entry_reference: t.entry_reference ? `entry-${i + 1}` : t.entry_reference,
      transaction_amount: t.transaction_amount
        ? { ...t.transaction_amount, amount: scrubAmount(i + 1) }
        : t.transaction_amount,
      creditor: t.creditor ? { ...t.creditor, name: scrubName(i) } : t.creditor,
      creditor_account: t.creditor_account
        ? { ...t.creditor_account, iban: t.creditor_account.iban ? fakeIban(i + 100) : undefined }
        : t.creditor_account,
      debtor: t.debtor ? { ...t.debtor, name: scrubName(i + 13) } : t.debtor,
      debtor_account: t.debtor_account
        ? { ...t.debtor_account, iban: t.debtor_account.iban ? fakeIban(i + 200) : undefined }
        : t.debtor_account,
      remittance_information: t.remittance_information
        ? t.remittance_information.map((_, j) => `remittance line ${j + 1}`)
        : t.remittance_information,
    })),
  };
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

const VALID_COST_CENTERS = ["lorenzo", "fernanda", "compartilhado"] as const;

/**
 * Confirm the default_cost_center for each account with the operator (a one-time
 * human-run script). Accounts whose owner is inferred from the name are auto-confirmed;
 * only ambiguous ones prompt. Returns a uid -> cost_center map passed to persistSession
 * as an explicit override (so the account name is never mutated).
 *
 * Each value must be a seeded cost_centers code (lorenzo/fernanda/compartilhado, D-24).
 */
async function confirmCostCenters(
  accounts: SessionAccount[],
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const a of accounts) {
    let cc = inferCostCenter(a.name);
    if (!cc) {
      const answer = (
        await prompt(
          `  Cost center for account "${a.name ?? a.uid}" — one of ${VALID_COST_CENTERS.join(
            "/",
          )}: `,
        )
      ).toLowerCase();
      if (!(VALID_COST_CENTERS as readonly string[]).includes(answer)) {
        throw new Error(
          `Invalid cost center "${answer}" — expected one of ${VALID_COST_CENTERS.join(", ")}.`,
        );
      }
      cc = answer;
    }
    map[a.uid] = cc;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------
async function main() {
  const appId = requireEnv("ENABLE_BANKING_APP_ID");
  const keyPath = requireEnv("ENABLE_BANKING_PRIVATE_KEY_PATH");
  const redirectUrl = requireEnv("ENABLE_BANKING_REDIRECT_URL");

  const person =
    (await prompt(
      "Whose Revolut login is this consent for? (e.g. Lorenzo / Fernanda): ",
    )) || "unknown";

  // Read the RSA private key BY PATH — never inlined, never logged.
  const absKeyPath = resolve(REPO_ROOT, keyPath);
  if (!existsSync(absKeyPath)) {
    throw new Error(
      `Private key file not found at ${keyPath} (resolved ${absKeyPath}). Set ENABLE_BANKING_PRIVATE_KEY_PATH.`,
    );
  }
  const privateKeyPem = await readFile(absKeyPath, "utf8");

  console.log("\n[1/5] Signing RS256 JWT (kid = App ID)…");
  const jwt = await signEbJwt(appId, privateKeyPem);
  console.log("      JWT signed (1h TTL). App ID + key are not printed.");

  // 2. GET /aspsps — find Revolut, read the consent ceiling (audited client, zod-validated).
  console.log("\n[2/5] GET /aspsps?country=DE&psu_type=personal …");
  const aspsps = await ebAspsps(jwt, "DE", "personal");
  const revolut = aspsps.aspsps.find((a) =>
    a.name.toLowerCase().includes("revolut"),
  );
  if (!revolut) {
    const names = aspsps.aspsps.map((a) => a.name).join(", ");
    throw new Error(
      `Revolut not found in /aspsps for country=DE. Available: ${names}`,
    );
  }
  console.log(
    `      Found ASPSP "${revolut.name}" (${revolut.country}). maximum_consent_validity = ${
      revolut.maximum_consent_validity ?? "(not provided)"
    }s`,
  );

  // 3. POST /auth — request the bank authorization URL.
  // valid_until: request the ASPSP ceiling if provided, else 90 days (PSD2-safe default).
  const ceilingSeconds = revolut.maximum_consent_validity ?? 90 * 24 * 3600;
  const validUntil = new Date(Date.now() + ceilingSeconds * 1000).toISOString();
  const state = randomUUID();
  console.log("\n[3/5] POST /auth (requesting bank authorization URL)…");
  const auth = await ebAuth(jwt, {
    access: { valid_until: validUntil },
    aspsp: { name: revolut.name, country: revolut.country },
    psu_type: "personal",
    state,
    redirect_url: redirectUrl, // exact whitelisted constant (T-01-05), never built from input
  });

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(`  ACTION REQUIRED for: ${person}`);
  console.log("  1. Open this URL in your browser:");
  console.log(`\n     ${auth.url}\n`);
  console.log(`  2. Log in to Revolut as ${person} and APPROVE the consent.`);
  console.log("  3. You will be redirected to the /eb/callback page, which");
  console.log("     DISPLAYS a `code`. Copy that code.");
  console.log("────────────────────────────────────────────────────────────\n");

  const code = await prompt("Paste the `code` from the /eb/callback page here: ");
  if (!code) throw new Error("No code pasted — aborting.");

  // 5. POST /sessions — exchange the code for the session + accounts (zod-validated).
  console.log("\n[4/5] POST /sessions (exchanging code)…");
  const session = await ebSessions(jwt, code);

  // Enumerate accounts + flag an investing/securities account.
  console.log("\n  Accounts exposed by this consent:");
  let investingFound = false;
  for (const [i, a] of session.accounts.entries()) {
    const type = a.cash_account_type ?? a.product ?? "(no type)";
    const usage = a.usage ?? "(no usage)";
    const isInvesting = looksLikeInvesting(a);
    if (isInvesting) investingFound = true;
    const cc = inferCostCenter(a.name);
    console.log(
      `    [${i + 1}] name="${a.name ?? "(none)"}" type=${type} usage=${usage} currency=${
        a.currency ?? "?"
      } iban=${a.account_id?.iban ? "present" : "absent"} cost_center=${cc ?? "(unknown)"}${
        isInvesting ? "  <-- INVESTING?" : ""
      }`,
    );
  }
  console.log(
    `\n  Investing/securities account present? ${investingFound ? "YES (see flag above)" : "NO (not exposed over PSD2)"}`,
  );
  console.log(`  access.valid_until = ${session.access.valid_until}`);

  // 5b. Confirm the cost-center mapping with the operator before persisting. This is a
  //     one-time human-run script, so an interactive confirm is the right gate when the
  //     account identity cannot be inferred from EB metadata (default_cost_center, CAT-07).
  const costCenterByUid = await confirmCostCenters(session.accounts);

  // 5c. PERSIST the consent: connections (expires_at = the real valid_until) + accounts
  //     (+ a virtual investing row since the spike confirmed it is NOT exposed) + heartbeat.
  console.log("\n  Persisting consent to Postgres (service_role)…");
  const writer = await createServiceWriter();
  await persistSession(session, writer, costCenterByUid);
  const persisted = { expiresAt: session.access.valid_until };
  console.log(
    `  Persisted: 1 connections row (expires_at=${persisted.expiresAt}), ${
      session.accounts.length
    } account row(s)${investingFound ? "" : " + 1 virtual investing row"}, 1 heartbeat.`,
  );

  // 8. Save the session locally (gitignored).
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const secretsDir = resolve(REPO_ROOT, ".secrets");
  await mkdir(secretsDir, { recursive: true });
  const sessionFile = resolve(secretsDir, `eb-session-${ts}.json`);
  await writeFile(
    sessionFile,
    JSON.stringify(
      { person, savedAt: new Date().toISOString(), ...session },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\n  Saved session (gitignored) -> .secrets/${sessionFile.split("/").pop()}`);

  // 9a. Capture a PII-scrubbed /sessions fixture.
  const scrubbedSession = scrubSession(session);
  await mkdir(resolve(REPO_ROOT, "test/fixtures"), { recursive: true });
  await writeFile(
    resolve(REPO_ROOT, "test/fixtures/eb-sessions.json"),
    JSON.stringify(scrubbedSession, null, 2),
    "utf8",
  );
  console.log("  Wrote PII-scrubbed fixture -> test/fixtures/eb-sessions.json");

  // 9b. Capture one transactions page (PII-scrubbed) from the first account.
  let txStability = "(not captured)";
  let pendPresent = "(not captured)";
  let ibanAvailability = "(not captured)";
  if (session.accounts.length > 0) {
    const uid = session.accounts[0].uid;
    console.log(`\n[5/5] GET /accounts/${"<uid>"}/transactions (one page)…`);
    try {
      const dateFrom = new Date(Date.now() - 30 * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      const txRaw = await ebFetch(
        `/accounts/${uid}/transactions?date_from=${dateFrom}`,
        jwt,
      );
      const page = TxPageSchema.parse(txRaw);
      const scrubbed = scrubTxPage(page);
      await writeFile(
        resolve(REPO_ROOT, "test/fixtures/eb-transactions-page.json"),
        JSON.stringify(scrubbed, null, 2),
        "utf8",
      );
      console.log(
        `  Wrote PII-scrubbed fixture -> test/fixtures/eb-transactions-page.json (${page.transactions.length} tx)`,
      );
      const first = page.transactions[0];
      txStability = first?.transaction_id
        ? "transaction_id present"
        : first?.entry_reference
          ? "only entry_reference present"
          : "neither id present";
      pendPresent = page.transactions.some((t) => t.status === "PEND")
        ? "YES — PEND rows present"
        : "NO — only BOOK in this window";
      ibanAvailability = page.transactions.some(
        (t) => t.creditor_account?.iban || t.debtor_account?.iban,
      )
        ? "YES — creditor/debtor IBANs present on at least one tx"
        : "NO — no counterparty IBANs in this page";
    } catch (e) {
      console.warn(
        `  Could not capture a transactions page (non-fatal): ${(e as Error).message}`,
      );
    }
  }

  // 10. Append findings to 01-SPIKE.md.
  await appendSpike({
    person,
    revolutName: revolut.name,
    maxConsentValidity: revolut.maximum_consent_validity ?? undefined,
    accounts: session.accounts.map((a) => ({
      name: a.name ?? undefined,
      type: a.cash_account_type ?? a.product ?? undefined,
      usage: a.usage ?? undefined,
      currency: a.currency ?? undefined,
      ibanPresent: Boolean(a.account_id?.iban),
    })),
    investingFound,
    validUntil: persisted.expiresAt,
    txStability,
    pendPresent,
    ibanAvailability,
  });

  console.log(
    "\n  Appended findings to .planning/phases/01-ingestion-enable-banking/01-SPIKE.md",
  );
  console.log(
    `\n  Done for ${person}. Re-run \`pnpm eb:connect\` for the next person if needed.\n`,
  );
}

interface SpikeFindings {
  person: string;
  revolutName: string;
  maxConsentValidity?: number;
  accounts: {
    name?: string;
    type?: string;
    usage?: string;
    currency?: string;
    ibanPresent: boolean;
  }[];
  investingFound: boolean;
  validUntil: string;
  txStability: string;
  pendPresent: string;
  ibanAvailability: string;
}

async function appendSpike(f: SpikeFindings) {
  const spikePath = resolve(
    REPO_ROOT,
    ".planning/phases/01-ingestion-enable-banking/01-SPIKE.md",
  );
  const rows = f.accounts
    .map(
      (a, i) =>
        `| ${i + 1} | ${a.name ?? "(none)"} | ${a.type ?? "(none)"} | ${
          a.usage ?? "(none)"
        } | ${a.currency ?? "?"} | ${a.ibanPresent ? "present" : "absent"} |`,
    )
    .join("\n");
  const section = `

---

## Live run — ${f.person} (${new Date().toISOString()})

**ASPSP:** ${f.revolutName} · **maximum_consent_validity:** ${
    f.maxConsentValidity ?? "(not provided)"
  }s

### Exposed accounts (resolves A2)

| # | name | type | usage | currency | iban |
|---|------|------|-------|----------|------|
${rows}

- **Investing/securities account exposed? ${
    f.investingFound ? "YES" : "NO"
  }** — ${
    f.investingFound
      ? "investimento can be detected on the INCOMING leg (the credit landing on the is_investment account); the credit leg must still be excluded from revenue (CAT-03)."
      : "investing account NOT exposed over PSD2 (the expected case) — investimento is detected on the OUTGOING leg via a VIRTUAL is_investment=true account row matched by counterparty IBAN/description (D-22)."
  }
- **Real consent window (resolves A5): \`access.valid_until\` = ${f.validUntil}** — this drives \`connections.expires_at\`; read, never hardcoded.
- **Counterparty IBAN availability (resolves A6):** ${f.ibanAvailability}.
- **Stable transaction id (informs A3):** ${f.txStability}.
- **PEND rows (informs A4):** ${f.pendPresent}.
`;
  await appendFile(spikePath, section, "utf8");
}

// Only run the interactive flow when this file is executed directly (e.g.
// `pnpm eb:connect` / `tsx scripts/eb-connect.ts`). When the module is IMPORTED — by the
// 01-03 connections-write test (test/connect.test.ts imports `persistSession`) or any
// future consumer — `main()` must NOT auto-run (it would prompt + exit the process and
// crash the test runner). CJS `require.main === module` is the portable direct-run check
// (same convention as scripts/gen-calendar.ts).
const invokedDirectly =
  typeof require !== "undefined" && require.main === module;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(
      `\nERROR: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
}
