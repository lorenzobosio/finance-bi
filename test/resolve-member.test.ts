import { describe, expect, it } from "vitest";

// Wave-0 RED (PERS-01, D4-24) — freezes the identity resolver contract for the not-yet-existent
// `src/lib/identity/resolve-member.ts`. RED on import until the later wave builds it.
//
// `resolveMember(email, members[])` maps the authenticated email to a member — case- and
// whitespace-insensitive (the same `.trim().toLowerCase()` normalize as `seed-allowlist.mjs`).
// An unmapped-but-allowlisted email returns null (NEVER throws): identity is COSMETIC, access
// stays on `is_email_allowed()`. No real email literal appears here — only synthetic addresses.
import { resolveMember, type Member } from "@/lib/identity/resolve-member";

// Synthetic members — fictional addresses only (no real owner PII; source-cleanliness stays green).
const MEMBERS: Member[] = [
  { id: "m-1", displayName: "Alex", authEmail: "alex@example.test" },
  { id: "m-2", displayName: "Sam", authEmail: "sam@example.test" },
];

describe("resolveMember (PERS-01) — case/whitespace-insensitive match, null degrade", () => {
  it("exact match resolves the member", () => {
    expect(resolveMember("alex@example.test", MEMBERS)?.id).toBe("m-1");
  });

  it("case-insensitive match resolves the member", () => {
    expect(resolveMember("ALEX@EXAMPLE.TEST", MEMBERS)?.id).toBe("m-1");
  });

  it("leading/trailing whitespace is trimmed before matching", () => {
    expect(resolveMember("  sam@example.test  ", MEMBERS)?.id).toBe("m-2");
  });

  it("an unmapped (but allowlisted) email yields null — never throws", () => {
    expect(resolveMember("unmapped@example.test", MEMBERS)).toBeNull();
  });

  it("a null email yields null", () => {
    expect(resolveMember(null, MEMBERS)).toBeNull();
  });

  it("an undefined email yields null", () => {
    expect(resolveMember(undefined, MEMBERS)).toBeNull();
  });

  it("an empty / whitespace-only email yields null", () => {
    expect(resolveMember("", MEMBERS)).toBeNull();
    expect(resolveMember("   ", MEMBERS)).toBeNull();
  });

  it("never throws on a member row with a null authEmail", () => {
    const withNull: Member[] = [
      { id: "m-3", displayName: "Casey", authEmail: null },
      ...MEMBERS,
    ];
    expect(() => resolveMember("alex@example.test", withNull)).not.toThrow();
    expect(resolveMember("alex@example.test", withNull)?.id).toBe("m-1");
  });
});
