// scripts/seed-allowlist.mjs — Phase-0 hardening.
//
// Seeds the `app_allowlist` table from the `ALLOWED_EMAILS` env at DEPLOY time. This is
// the ONLY path by which real emails enter the database — they are NEVER written into a
// committed migration or seed SQL file, so the (soon-public) repo stays PII-free.
//
// Normalization MUST match src/lib/auth/allowlist.ts (isAllowed): split on comma, trim,
// lowercase, drop blanks. That keeps the app gate and the DB allowlist in lockstep.
//
// Run:  set -a; . ./.env.local; set +a; pnpm db:seed-allowlist
// It reads DATABASE_URL + ALLOWED_EMAILS from the environment and NEVER prints either
// value (it prints a COUNT only), so logs cannot leak secrets or PII.

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    'FATAL: DATABASE_URL is not set. Load it first: set -a; . ./.env.local; set +a',
  );
  process.exit(1);
}

/** Parse ALLOWED_EMAILS into a normalized, de-duplicated list (same rules as isAllowed). */
export function parseAllowedEmails(raw) {
  const seen = new Set();
  for (const entry of (raw ?? '').split(',')) {
    const e = entry.trim().toLowerCase();
    if (e.length > 0) seen.add(e);
  }
  return [...seen];
}

async function main() {
  const emails = parseAllowedEmails(process.env.ALLOWED_EMAILS);
  if (emails.length === 0) {
    console.error(
      'FATAL: ALLOWED_EMAILS is empty or unset — refusing to seed an empty allowlist ' +
        '(that would lock everyone out). Set ALLOWED_EMAILS in .env.local.',
    );
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // Upsert each allowlisted email. created_at defaults on insert; do nothing on conflict.
    await sql`
      insert into public.app_allowlist ${sql(
        emails.map((email) => ({ email })),
        'email',
      )}
      on conflict (email) do nothing
    `;
    const [{ count }] = await sql`select count(*)::int as count from public.app_allowlist`;
    // Print COUNTS only — never the email values.
    console.log(
      `Seeded app_allowlist: ${emails.length} configured, ${count} row(s) now in table.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Only run when invoked directly (not when imported by a test).
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('seed-allowlist.mjs');
if (invokedDirectly) {
  main().catch((err) => {
    console.error('FATAL:', err.message);
    process.exit(1);
  });
}
