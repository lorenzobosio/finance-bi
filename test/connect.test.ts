import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Wave-0 contract (ING-05) — the persisted-consent-window contract, now GREEN (01-03).
//
// Proves (RESEARCH § Pattern 1 / Pattern 4): after a (mocked) POST /sessions returns
// { access: { valid_until } }, the persisted connections row's expires_at MUST equal
// that response access.valid_until — the REAL consent window is READ, never hardcoded.
//
// No live DB: persistSession takes an injectable ConsentWriter, so the test captures
// the upserts with a thin in-memory fake. The /sessions payload is the live,
// PII-scrubbed fixture (test/fixtures/eb-sessions.json).
import {
  persistSession,
  type AccountUpsert,
  type ConnectionUpsert,
  type ConsentWriter,
} from "../scripts/eb-connect";
import {
  SessionsResponseSchema,
  type SessionsResponse,
} from "../src/lib/ingestion/enable-banking/schemas";

const fixturePath = fileURLToPath(
  new URL("./fixtures/eb-sessions.json", import.meta.url),
);

/** A thin in-memory ConsentWriter that records every upsert — no Supabase connection. */
function makeFakeWriter() {
  const connections: ConnectionUpsert[] = [];
  const accounts: AccountUpsert[] = [];
  let heartbeats = 0;
  const writer: ConsentWriter = {
    async upsertConnection(row) {
      connections.push(row);
    },
    async upsertAccount(row) {
      accounts.push(row);
    },
    async writeHeartbeat() {
      heartbeats += 1;
    },
  };
  return { writer, connections, accounts, heartbeats: () => heartbeats };
}

describe("eb:connect persists connections.expires_at from the real access.valid_until (ING-05)", () => {
  it("stores expires_at === response access.valid_until (explicit mock)", async () => {
    const validUntil = "2026-12-19T00:00:00Z";
    const mockSessionsResponse: SessionsResponse = {
      session_id: "sess-test",
      accounts: [],
      access: { valid_until: validUntil },
    };
    const { writer, connections } = makeFakeWriter();

    const written = await persistSession(mockSessionsResponse, writer);

    expect(written.expiresAt).toBe(validUntil);
    expect(connections).toHaveLength(1);
    expect(connections[0].expiresAt).toBe(validUntil);
    expect(connections[0].consentStatus).toBe("active");
    expect(connections[0].provider).toBe("enable_banking");
  });

  it("reads expires_at straight from the live captured /sessions fixture (never hardcoded)", async () => {
    const fixture: SessionsResponse = SessionsResponseSchema.parse(
      JSON.parse(readFileSync(fixturePath, "utf8")),
    );
    const { writer, connections } = makeFakeWriter();

    const written = await persistSession(fixture, writer);

    expect(written.expiresAt).toBe(fixture.access.valid_until);
    expect(connections[0].expiresAt).toBe(fixture.access.valid_until);
  });

  it("upserts one accounts row per returned account + a virtual investing row + a heartbeat", async () => {
    const fixture: SessionsResponse = SessionsResponseSchema.parse(
      JSON.parse(readFileSync(fixturePath, "utf8")),
    );
    const { writer, accounts, heartbeats } = makeFakeWriter();

    await persistSession(fixture, writer);

    // The fixture has 1 cash account, none investing -> 1 real row + 1 virtual row.
    expect(accounts).toHaveLength(fixture.accounts.length + 1);
    const virtual = accounts.find((a) => a.isInvestment && a.enableBankingId === null);
    expect(virtual).toBeDefined();
    expect(virtual!.isSynced).toBe(false);
    // A real account row carries the live uid and is marked synced.
    const real = accounts.find((a) => a.enableBankingId === fixture.accounts[0].uid);
    expect(real).toBeDefined();
    expect(real!.isSynced).toBe(true);
    expect(heartbeats()).toBe(1);
  });
});
