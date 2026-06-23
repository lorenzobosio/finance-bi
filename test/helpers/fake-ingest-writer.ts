// test/helpers/fake-ingest-writer.ts
//
// A thin in-memory IngestWriter for the ingest contract tests — records every write, opens
// NO Supabase / postgres connection (mirrors test/connect.test.ts's makeFakeWriter). The
// default seeded state is one active connection + one real synced cash account + the virtual
// investing row, which is enough to drive the heartbeat / consent-expiry / empty paths.

import type {
  BalanceUpsert,
  BatchRow,
  IngestAccount,
  IngestWriter,
  TxUpsert,
} from "../../scripts/ingest";
import type { DbRule } from "../../src/lib/ingestion/rules/db-rules";

export interface FakeIngestState {
  writer: IngestWriter;
  batches: BatchRow[];
  txUpserts: TxUpsert[][];
  balances: BalanceUpsert[];
  lastPull: { connectionId: string; at: string }[];
  consentExpiredFor: () => string[];
}

export function makeFakeIngestWriter(
  overrides: {
    accounts?: IngestAccount[];
    lastPullAt?: string | null;
    dbRules?: DbRule[];
  } = {},
): FakeIngestState {
  const batches: BatchRow[] = [];
  const txUpserts: TxUpsert[][] = [];
  const balances: BalanceUpsert[] = [];
  const lastPull: { connectionId: string; at: string }[] = [];
  const expired: string[] = [];

  const accounts: IngestAccount[] = overrides.accounts ?? [
    {
      id: "acct-lorenzo",
      enableBankingId: "uid-1",
      iban: "DE00LORENZO",
      defaultCostCenter: "lorenzo",
      isInvestment: false,
      isSynced: true,
    },
    {
      id: "acct-investing",
      enableBankingId: null, // virtual — not synced
      iban: "DE00INVESTING",
      defaultCostCenter: "shared",
      isInvestment: true,
      isSynced: false,
      counterpartySignature: "vanguard",
    },
  ];

  const writer: IngestWriter = {
    async getConnection() {
      return {
        id: "conn-1",
        sessionId: "sess-test",
        lastPullAt: overrides.lastPullAt ?? null,
        consentStatus: "active",
      };
    },
    async getAccounts() {
      return accounts;
    },
    async getDbRules() {
      return overrides.dbRules ?? [];
    },
    async upsertTransactions(rows) {
      txUpserts.push(rows);
      return rows.length; // the fake treats every row as newly inserted
    },
    async upsertBalance(row) {
      balances.push(row);
    },
    async markConsentExpired(connectionId) {
      expired.push(connectionId);
    },
    async advanceLastPull(connectionId, at) {
      lastPull.push({ connectionId, at });
    },
    async writeBatch(row) {
      batches.push(row);
    },
  };

  return {
    writer,
    batches,
    txUpserts,
    balances,
    lastPull,
    consentExpiredFor: () => expired,
  };
}
