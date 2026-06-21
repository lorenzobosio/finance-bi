// drizzle-kit configuration — BUILD-TIME ONLY (never bundled into the app).
//
// `DATABASE_URL` (Supabase Session pooler, port 5432) is read from the environment.
// Load `.env.local` into the shell before running drizzle-kit commands, e.g.:
//   set -a; . ./.env.local; set +a; pnpm db:migrate
// NEVER print DATABASE_URL or any secret to logs.

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/lib/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
