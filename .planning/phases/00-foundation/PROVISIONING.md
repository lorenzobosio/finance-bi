# Phase 0 — External-Service Provisioning Checklist

> These three services cannot be created via CLI/API by the executor — they require
> the developer's own Google / Supabase / Vercel accounts. Complete every box, then
> reply **"provisioned"** to unblock the continuation agent.
>
> - Plan 02 (schema push) needs `DATABASE_URL`.
> - Plan 03 (auth) needs the Supabase URL + keys and the Google OAuth client.
> - Plan 04 (deploy) needs the Vercel project link with all 5 env vars set.

All real values go in **`.env.local`** (git-ignored) and in the Vercel + GitHub
dashboards. Only `.env.example` (placeholders) is ever committed.

---

## Key-style note (RESEARCH A3) — read first

A Supabase project created in 2025+ issues **new-style** keys
`sb_publishable_…` / `sb_secret_…` instead of the legacy `anon` / `service_role`
JWT keys. Either style works. **Keep the env-var NAMES below exactly as written**
and paste whichever key VALUE the dashboard gives you:

| Env var name (do not change) | Legacy value | New-style value |
|------------------------------|--------------|-----------------|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / `public` key | `sb_publishable_…` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key | `sb_secret_…` key |

**Record which style your project issued** when you reply (the SUMMARY needs it so
Plans 02–04 use the right key values).

---

## 1. Supabase project (single production project — D-18)

- [ ] **Create the project.** Supabase Dashboard → **New Project** (one prod project; no dev/prod split).
- [ ] **Copy these 4 values into `.env.local`:**
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` — Project Settings → API → **Project URL**
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings → API → **anon/public** key (or the `sb_publishable_` key)
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → **service_role** key (or the `sb_secret_` key) — **SERVER ONLY, never prefix with `NEXT_PUBLIC_`**
  - [ ] `DATABASE_URL` — Project Settings → Database → Connection string → **Session pooler (port 5432)** (full Postgres features; used by Drizzle migrations in Plan 02)
- [ ] **Enable Google auth.** Supabase Dashboard → **Authentication → Providers → Google** → toggle on, then paste the Google OAuth **client id + secret** from step 2 (D-14).

> Tip: the Session pooler (5432) string is preferred for migrations. If you ever run
> Drizzle from a serverless/Action context, the Transaction pooler is port 6543 and
> requires `prepare: false` (Pitfall 4) — not needed for Phase 0 migrations.

---

## 2. Google Cloud OAuth 2.0 client (FND-01)

- [ ] **Create the client.** Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID → Web application**.
- [ ] **Authorized redirect URIs** (add all three; **no wildcards** — T-00-03):
  - [ ] `https://<project-ref>.supabase.co/auth/v1/callback` (the Supabase callback — get `<project-ref>` from the Supabase URL)
  - [ ] your Vercel **production** URL (e.g. `https://<your-app>.vercel.app`) — available after step 3
  - [ ] `http://localhost:3000/auth/callback` (local dev)
- [ ] **Copy the client id + secret** and paste them into Supabase → Authentication → Providers → Google (step 1).

---

## 3. Vercel project (Hobby — D-18, FND-05)

- [ ] **Link the GitHub repo.** Vercel Dashboard → **Add New Project → Import Git Repository** → select this repo (Hobby tier).
- [ ] **Set all 5 environment variables** in Project Settings → Environment Variables:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (mark it **not** exposed to the browser)
  - [ ] `ALLOWED_EMAILS`
  - [ ] `DATABASE_URL`
- [ ] Note the assigned production URL and add it to the Google OAuth redirect URIs (step 2).

---

## 4. Allowlist (FND-01)

- [ ] Set `ALLOWED_EMAILS` in `.env.local` to the **2 allowlisted Google emails**, comma-separated, lowercase. Example: `lorenzo@example.com,fernanda@example.com`.

---

## Done criteria (reply "provisioned" once all are true)

- [ ] Supabase project exists; Google provider enabled with the OAuth client id/secret.
- [ ] Google Cloud OAuth Web client exists with the three redirect URIs.
- [ ] Vercel project linked to the GitHub repo with all 5 env vars set.
- [ ] `.env.local` holds all 5 real values.
- [ ] You recorded which Supabase **key style** the project issued (legacy `anon`/`service_role` vs new `sb_publishable_`/`sb_secret_`).
