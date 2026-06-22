import { describe, expect, it } from "vitest";

// Wave-0 contract (ING-05) — the fail-soft consent-expiry contract, now GREEN (01-04).
//
// INTEGRATION test: scripts/ingest exposes a testable `runIngest` core with an INJECTABLE
// writer, so the 403 fail-soft path is proven against a thin in-memory writer (NO live DB).
//
// Contract proven (RESEARCH § Pattern 4 — fail-soft on auth expiry):
//   A mocked 403 from the EB API MUST:
//     - set connections.consent_status = 'expired'
//     - write an import_batches row with status = 'auth_expired'
//     - exit 0 (no crash — silent retry on expiry is the classic freeze failure)
import { runIngest, type IngestWriter } from "../scripts/ingest";
import { makeFakeIngestWriter } from "./helpers/fake-ingest-writer";

describe("ingest fails soft on a 403 consent expiry (ING-05)", () => {
  it("marks consent expired, records auth_expired, and exits 0", async () => {
    const { writer, batches, consentExpiredFor } = makeFakeIngestWriter();
    const result = await runIngest({
      writer: writer as IngestWriter,
      mockStatus: 403,
    });
    expect(result.consentStatus).toBe("expired");
    expect(result.batchStatus).toBe("auth_expired");
    expect(result.exitCode).toBe(0);
    // The connection was actually flagged + a heartbeat with the auth_expired status written.
    expect(consentExpiredFor()).toHaveLength(1);
    expect(batches).toHaveLength(1);
    expect(batches[0].status).toBe("auth_expired");
  });
});
