import { describe, expect, it } from "vitest";

// Wave-0 contract (ING-04) — the guaranteed-heartbeat-every-run contract, now GREEN (01-04).
//
// INTEGRATION test: scripts/ingest exposes a testable `runIngest` core with an INJECTABLE
// writer (mirroring eb-connect's ConsentWriter + test/connect.test.ts's makeFakeWriter), so
// the heartbeat invariant is proven against a thin in-memory writer with NO live DB.
//
// Contract proven (RESEARCH § Pattern 3 — heartbeat in finally):
//   An import_batches row is written on BOTH a zero-new-tx run (status 'empty') and a
//   forced-error run (status 'error'). The keep-alive write happens unconditionally from the
//   finally block, even when nothing changes / the run fails — that real DB write resets the
//   Supabase inactivity timer.
import { runIngest, type IngestWriter } from "../scripts/ingest";
import { makeFakeIngestWriter } from "./helpers/fake-ingest-writer";

describe("ingest writes an import_batches heartbeat on every run (ING-04)", () => {
  it("writes a batch row on a zero-new-transaction run", async () => {
    const { writer, batches } = makeFakeIngestWriter();
    const result = await runIngest({
      writer: writer as IngestWriter,
      mockTransactions: [],
    });
    expect(result.batchWritten).toBe(true);
    expect(result.batchStatus).toBe("empty");
    // The heartbeat was actually persisted (exactly one batch row, status 'empty').
    expect(batches).toHaveLength(1);
    expect(batches[0].status).toBe("empty");
  });

  it("writes a batch row on a forced-error run", async () => {
    const { writer, batches } = makeFakeIngestWriter();
    const result = await runIngest({
      writer: writer as IngestWriter,
      forceError: true,
    });
    expect(result.batchWritten).toBe(true);
    // Heartbeat written from the finally even though the run threw.
    expect(batches).toHaveLength(1);
    expect(batches[0].status).toBe("error");
    // A transient error fails CI (exit 1) but still leaves the keep-alive trace.
    expect(result.exitCode).toBe(1);
  });
});
