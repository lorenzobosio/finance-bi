// src/lib/identity/resolve-member.ts — the PURE identity resolver (PERS-01, D4-24).
//
// Maps the authenticated Google email to a household member. Identity is COSMETIC: a match
// changes the greeting only; access stays on `is_email_allowed()` (drizzle/0001). An unmapped
// (but allowlisted) email — or a null/empty email, or a member row with a null auth_email —
// must yield null and NEVER throw, so the greeting degrades to generic and full access is
// unchanged (D4-24/26).
//
// This file is PURE (no DB handle, no React import): the layout reads `members` under RLS and
// hands the rows in. Normalization MUST match seed-allowlist.mjs (`.trim().toLowerCase()`) so
// the in-app resolver and the env-seeded `members.auth_email` agree byte-for-byte.
//
// No real email literal lives here — only the column contract. (source-cleanliness stays green.)

/** A household member row, as the greeting/resolver consume it (camelCased from the DB row). */
export interface Member {
  id: string;
  displayName: string;
  /** The mapped Google email (env-seeded); null when the member is not yet mapped. */
  authEmail: string | null;
}

/** Normalize an email the same way as seed-allowlist.mjs: trim + lowercase. */
function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * resolveMember(email, members[]) — case/whitespace-insensitive match on `auth_email`.
 * Returns the matching member or null. NEVER throws: a null/undefined/empty email, an
 * unmapped email, or a member with a null auth_email all degrade to null.
 */
export function resolveMember(
  email: string | null | undefined,
  members: Member[],
): Member | null {
  if (email === null || email === undefined) return null;
  const needle = normalize(email);
  if (needle.length === 0) return null;
  for (const m of members) {
    if (m.authEmail !== null && normalize(m.authEmail) === needle) return m;
  }
  return null;
}
