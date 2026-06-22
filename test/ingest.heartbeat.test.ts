import { describe, expect, it } from "vitest";

// Wave-0 RED stub (ING-04) — the guaranteed-heartbeat-every-run contract.
//
// INTEGRATION test scaffolded RED now and filled GREEN in 01-03 (once scripts/ingest
// + the import_batches table exist). It references the FUTURE module scripts/ingest so
// the contract is visible. The import below resolves to a module that does not exist
// yet, so this suite is RED at import-resolution time — the intended Wave-0 state.
//
// Contract to prove (RESEARCH § Pattern 3 — heartbeat in finally):
//   An import_batches row is written on BOTH a zero-new-tx run (status 'empty') and a
//   forced-error run (status 'error'/'auth_expired'). The keep-alive write happens
//   unconditionally, even when nothing changes — that real DB write resets the
//   Supabase 7-day inactivity timer.
//
// @ts-expect-error — module created GREEN in 01-03; RED at import-resolution now.
import { runIngest } from "../scripts/ingest";

describe.todo("ingest writes an import_batches heartbeat on every run (ING-04)", () => {
  it("writes a batch row on a zero-new-transaction run", async () => {
    // Filled GREEN in 01-03: mock a fetch returning zero transactions, run ingest,
    // assert exactly one import_batches row exists with status 'empty'.
    const result = await runIngest({ mockTransactions: [] });
    expect(result.batchWritten).toBe(true);
    expect(result.batchStatus).toBe("empty");
  });

  it("writes a batch row on a forced-error run", async () => {
    // Filled GREEN in 01-03: force the fetch to throw, run ingest, assert a batch row
    // is still written (heartbeat in finally) with an error status.
    const result = await runIngest({ forceError: true });
    expect(result.batchWritten).toBe(true);
  });
});
