/**
 * Allowlist parser for FND-01.
 *
 * The app-layer half of the 2-email allowlist (the other half is the Plan-02 RLS
 * policy). `ALLOWED_EMAILS` is a comma-separated list of the emails permitted to use
 * the app; it MUST stay in sync with the hardcoded emails in the RLS policy
 * (drizzle/0001_rls_policies.sql).
 *
 * Fails CLOSED: an empty or unset `ALLOWED_EMAILS` rejects every email.
 */

/** Parse `ALLOWED_EMAILS` into a normalized (trimmed, lowercased, non-empty) set. */
function parseAllowed(): Set<string> {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * Returns true only if `email` (case-insensitively, trimmed) is on the
 * `ALLOWED_EMAILS` allowlist. Returns false for empty/unset env (fail closed) and
 * for any falsy/blank candidate.
 */
export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const candidate = email.trim().toLowerCase();
  if (candidate.length === 0) return false;
  return parseAllowed().has(candidate);
}
