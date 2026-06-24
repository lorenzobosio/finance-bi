// scripts/seed-member-emails.mjs — Phase-4 identity (PERS-01, D4-23).
//
// Seeds `members.auth_email` from the `MEMBER_EMAIL_MAP` env at DEPLOY time. This is the ONLY
// path by which real emails enter the `members` table — they are NEVER written into a committed
// migration or seed SQL file, so the (soon-public) repo stays PII-free (R-D).
//
// MEMBER_EMAIL_MAP="email=display_name,email=display_name" — comma-delimited, the email is
// normalized exactly like seed-allowlist.mjs / src/lib/identity/resolve-member.ts (.trim()
// .toLowerCase()) so the in-app resolver and the seeded auth_email agree. Each entry UPDATEs the
// matching member BY display_name (the 0012 DDL-only migration added the auth_email column). The
// operator must set MEMBER_EMAIL_MAP AND ALLOWED_EMAILS consistently (same emails, different
// tables/purposes). Run AFTER 0012 is applied.
//
// Run:  set -a; . ./.env.local; set +a; pnpm db:seed-member-emails
// It reads DATABASE_URL + MEMBER_EMAIL_MAP from the environment and NEVER prints either value
// (it prints a COUNT only), so logs cannot leak secrets or PII.

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'FATAL: DATABASE_URL is not set. Load it first: set -a; . ./.env.local; set +a',
  );
  process.exit(1);
}

/**
 * Parse MEMBER_EMAIL_MAP into normalized [email, displayName] pairs. Split on comma, then each
 * entry on the FIRST '=' into [email, display_name]; trim both, lowercase the email (same
 * normalize as seed-allowlist / resolveMember); drop entries missing either side.
 */
export function parseMemberEmailMap(raw) {
  const pairs = [];
  for (const entry of (raw ?? '').split(',')) {
    const eq = entry.indexOf('=');
    if (eq === -1) continue;
    const email = entry.slice(0, eq).trim().toLowerCase();
    const displayName = entry.slice(eq + 1).trim();
    if (email.length > 0 && displayName.length > 0) {
      pairs.push({ email, displayName });
    }
  }
  return pairs;
}

async function main() {
  const pairs = parseMemberEmailMap(process.env.MEMBER_EMAIL_MAP);
  if (pairs.length === 0) {
    console.error(
      'FATAL: MEMBER_EMAIL_MAP is empty or unset — refusing to run (that would wipe no rows ' +
        'but signals a misconfiguration). Set MEMBER_EMAIL_MAP="email=display_name,…" in .env.local.',
    );
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    let mapped = 0;
    // Map each email to its member BY display_name. Parameterized (sql`…${value}`) — the email and
    // name are NEVER concatenated into the SQL string. Counts the rows actually updated.
    for (const { email, displayName } of pairs) {
      const updated = await sql`
        update public.members
        set auth_email = ${email}
        where display_name = ${displayName}
      `;
      mapped += updated.count;
    }
    // Print COUNTS only — never the email or name values.
    console.log(
      `Mapped ${mapped} member email(s) from ${pairs.length} configured entry(ies).`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Only run when invoked directly (not when imported by a test).
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('seed-member-emails.mjs');
if (invokedDirectly) {
  main().catch((err) => {
    console.error('FATAL:', err.message);
    process.exit(1);
  });
}
