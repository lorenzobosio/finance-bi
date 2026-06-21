// SERVER-ONLY Drizzle client.
//
// `import 'server-only'` makes the build FAIL if this module is ever imported into a
// client/browser bundle. This client connects with a privileged Postgres role that
// BYPASSES RLS (Pitfall 1 / T-00-06), so it must NEVER serve request-time user reads —
// those go through `@supabase/ssr` (the user's JWT) so RLS enforces the allowlist.
//
// Its only jobs: drizzle-kit migrations (build-time) and, from Phase 1+, server-only
// ingestion writes run from the GitHub Action (outside the browser).
//
// Connection string: `DATABASE_URL` is the Supabase Session pooler (port 5432, full
// Postgres features) — no `prepare:false` needed. If this client is ever pointed at the
// Transaction pooler (6543), add `{ prepare: false }` (Pitfall 4).

import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — required for the server-only Drizzle client.');
}

const client = postgres(connectionString);
export const db = drizzle({ client, schema });
