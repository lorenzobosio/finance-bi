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
import { SignJWT, importPKCS8 } from "jose";
import { z } from "zod";

const EB_BASE = "https://api.enablebanking.com";
// This project is CommonJS (no "type":"module" in package.json) and `tsx` compiles these
// scripts to CJS — so `__dirname`/`__filename` are the portable entry-point references
// (ESM-only `import.meta.dirname` is undefined under CJS). `gen-calendar.ts` uses the same
// CJS conventions (`require.main === module`).
const REPO_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// JWT signing (mirrors the frozen src/lib/ingestion/enable-banking/jwt.ts contract
// in test/jwt.test.ts — RS256, kid=appId, iss/aud, exp-iat = 3600). The real jwt.ts
// module is created GREEN in plan 01-04; the spike inlines an equivalent signer.
// ---------------------------------------------------------------------------
export async function signEbJwt(
  appId: string,
  privateKeyPem: string,
): Promise<string> {
  const key = await importPKCS8(privateKeyPem, "RS256");
  return new SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: "RS256", kid: appId })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

// ---------------------------------------------------------------------------
// zod schemas for the untrusted EB responses (V5 — validate at the boundary).
// Kept permissive (.passthrough / optional) so a real Revolut response that carries
// extra fields still parses; the spike's job is to OBSERVE the shape, not reject it.
// ---------------------------------------------------------------------------
const AspspSchema = z
  .object({
    name: z.string(),
    country: z.string(),
    maximum_consent_validity: z.number().nullish(),
    psu_types: z.array(z.string()).nullish(),
  })
  .passthrough();
const AspspsResponse = z
  .object({ aspsps: z.array(AspspSchema) })
  .passthrough();

const AuthResponse = z
  .object({
    url: z.string(),
    authorization_id: z.string().nullish(),
    psu_id_hash: z.string().nullish(),
  })
  .passthrough();

const AccountIdentification = z
  .object({ iban: z.string().nullish(), other: z.unknown().nullish() })
  .passthrough();
const SessionAccount = z
  .object({
    uid: z.string(),
    account_id: AccountIdentification.nullish(),
    name: z.string().nullish(),
    currency: z.string().nullish(),
    cash_account_type: z.string().nullish(),
    usage: z.string().nullish(),
    product: z.string().nullish(),
  })
  .passthrough();
const SessionsResponse = z
  .object({
    session_id: z.string(),
    accounts: z.array(SessionAccount),
    access: z.object({ valid_until: z.string() }).passthrough(),
    aspsp: z.unknown().nullish(),
  })
  .passthrough();
export type SessionsResponseT = z.infer<typeof SessionsResponse>;

// Transaction-page schema (matches RESEARCH § Code Examples). Permissive on purpose.
const RawTx = z
  .object({
    transaction_id: z.string().nullish(),
    entry_reference: z.string().nullish(),
    status: z.string().nullish(),
    booking_date: z.string().nullish(),
    value_date: z.string().nullish(),
    credit_debit_indicator: z.string().nullish(),
    transaction_amount: z
      .object({ currency: z.string(), amount: z.string() })
      .partial()
      .nullish(),
    creditor: z.object({ name: z.string().nullish() }).passthrough().nullish(),
    creditor_account: z
      .object({ iban: z.string().nullish() })
      .passthrough()
      .nullish(),
    debtor: z.object({ name: z.string().nullish() }).passthrough().nullish(),
    debtor_account: z
      .object({ iban: z.string().nullish() })
      .passthrough()
      .nullish(),
    remittance_information: z.array(z.string()).nullish(),
  })
  .passthrough();
const TxPage = z
  .object({
    transactions: z.array(RawTx),
    continuation_key: z.string().nullish(),
  })
  .passthrough();
type TxPageT = z.infer<typeof TxPage>;

// ---------------------------------------------------------------------------
// persistSession — exported for the 01-03 connections write-path contract
// (test/connect.test.ts, currently describe.todo). In the spike form it just maps the
// validated /sessions response to the durable consent fields. The DB write lands in
// plan 01-03 once the schema columns exist; here we only return the values that will be
// stored, so the contract (expires_at === response access.valid_until — read, never
// hardcoded; ING-05) is already expressible.
// ---------------------------------------------------------------------------
export function persistSession(session: {
  session_id: string;
  accounts: { uid: string }[];
  access: { valid_until: string };
}): { sessionId: string; accountUids: string[]; expiresAt: string } {
  return {
    sessionId: session.session_id,
    accountUids: session.accounts.map((a) => a.uid),
    expiresAt: session.access.valid_until,
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

  // 2. GET /aspsps — find Revolut, read the consent ceiling.
  console.log("\n[2/5] GET /aspsps?country=DE&psu_type=personal …");
  const aspspsRaw = await ebFetch(
    "/aspsps?country=DE&psu_type=personal",
    jwt,
  );
  const aspsps = AspspsResponse.parse(aspspsRaw);
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
  const authRaw = await ebFetch("/auth", jwt, {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: revolut.name, country: revolut.country },
      psu_type: "personal",
      state,
      redirect_url: redirectUrl, // exact whitelisted constant (T-01-05), never built from input
    }),
  });
  const auth = AuthResponse.parse(authRaw);

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

  // 5. POST /sessions — exchange the code for the session + accounts.
  console.log("\n[4/5] POST /sessions (exchanging code)…");
  const sessionsRaw = await ebFetch("/sessions", jwt, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  const session = SessionsResponse.parse(sessionsRaw);
  const persisted = persistSession(session);

  // Enumerate accounts + flag an investing/securities account.
  console.log("\n  Accounts exposed by this consent:");
  const investingSignals = ["invest", "securit", "stock", "brokerage", "saving"];
  let investingFound = false;
  for (const [i, a] of session.accounts.entries()) {
    const type = a.cash_account_type ?? a.product ?? "(no type)";
    const usage = a.usage ?? "(no usage)";
    const hay = `${a.name ?? ""} ${type} ${usage} ${a.product ?? ""}`.toLowerCase();
    const isInvesting = investingSignals.some((s) => hay.includes(s));
    if (isInvesting) investingFound = true;
    console.log(
      `    [${i + 1}] name="${a.name ?? "(none)"}" type=${type} usage=${usage} currency=${
        a.currency ?? "?"
      } iban=${a.account_id?.iban ? "present" : "absent"}${isInvesting ? "  <-- INVESTING?" : ""}`,
    );
  }
  console.log(
    `\n  Investing/securities account present? ${investingFound ? "YES (see flag above)" : "NO (not exposed over PSD2)"}`,
  );
  console.log(`  access.valid_until = ${persisted.expiresAt}`);

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
      const page = TxPage.parse(txRaw);
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
