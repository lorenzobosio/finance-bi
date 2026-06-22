import { describe, expect, it } from "vitest";

// Wave-0 RED stub (ING-05) — the persisted-consent-window contract.
//
// This is an INTEGRATION test scaffolded RED now and filled GREEN in 01-03 (once the
// connections write-path + schema columns exist). It references the FUTURE module
// scripts/eb-connect so the contract is visible from the start. The import below
// resolves to a module that does not exist yet, so this suite is RED at
// import-resolution time — the intended Wave-0 state.
//
// Contract to prove (RESEARCH § Pattern 1 / Pattern 4):
//   After a mocked POST /sessions returns { access: { valid_until } }, the persisted
//   connections row's expires_at MUST equal that response access.valid_until — the
//   real consent window is READ, never hardcoded.
//
// @ts-expect-error — module created GREEN in 01-03; RED at import-resolution now.
import { persistSession } from "../scripts/eb-connect";

describe.todo(
  "eb:connect persists connections.expires_at from the real access.valid_until (ING-05)",
  () => {
    it("stores expires_at === response access.valid_until", async () => {
      // Filled GREEN in 01-03: mock POST /sessions -> { access: { valid_until } },
      // call persistSession, assert the written connections.expires_at matches.
      const validUntil = "2026-12-19T00:00:00Z";
      const mockSessionsResponse = {
        session_id: "sess-test",
        accounts: [],
        access: { valid_until: validUntil },
      };
      const written = await persistSession(mockSessionsResponse);
      expect(written.expiresAt).toBe(validUntil);
    });
  },
);
