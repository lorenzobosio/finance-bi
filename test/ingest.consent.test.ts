import { describe, expect, it } from "vitest";

// Wave-0 RED stub (ING-05) — the fail-soft consent-expiry contract.
//
// INTEGRATION test scaffolded RED now and filled GREEN in 01-03/01-04 (once
// scripts/ingest + the connections.consent_status column + import_batches exist). It
// references the FUTURE module scripts/ingest so the contract is visible. The import
// below resolves to a module that does not exist yet, so this suite is RED at
// import-resolution time — the intended Wave-0 state.
//
// Contract to prove (RESEARCH § Pattern 4 — fail-soft on auth expiry):
//   A mocked 403 from the EB API MUST:
//     - set connections.consent_status = 'expired'
//     - write an import_batches row with status = 'auth_expired'
//     - exit 0 (no crash — silent retry on expiry is the classic freeze failure)
//
// @ts-expect-error — module created GREEN in 01-03; RED at import-resolution now.
import { runIngest } from "../scripts/ingest";

describe.todo("ingest fails soft on a 403 consent expiry (ING-05)", () => {
  it("marks consent expired, records auth_expired, and exits 0", async () => {
    // Filled GREEN in 01-03/01-04: mock the transactions fetch to return 403.
    const result = await runIngest({ mockStatus: 403 });
    expect(result.consentStatus).toBe("expired");
    expect(result.batchStatus).toBe("auth_expired");
    expect(result.exitCode).toBe(0);
  });
});
