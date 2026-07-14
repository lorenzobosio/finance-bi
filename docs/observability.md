# Observability setup — Sentry (optional) + `/api/health` (OBS-01, D-06/D-07)

This is the **owner runbook** for Phase-7 observability. The code
(`src/instrumentation.ts` + `src/instrumentation-client.ts` + the `withSentryConfig`
wrap in `next.config.ts` + `src/app/api/health/route.ts`) is already committed and
works **with no configuration at all**. One optional manual step — creating a Sentry
project — lives outside git; do it only if you want error capture.

> **The one design rule (D-07):** Sentry is **DSN-gated**. With no `SENTRY_DSN` /
> `NEXT_PUBLIC_SENTRY_DSN` set, `Sentry.init` is **never called** — a true no-op with
> zero runtime overhead. The app builds and runs fully **without a Sentry account**.
> This is the single Phase-7 external account, and it is entirely optional.

---

## What you get for free (no setup)

- **`/api/health`** — a public liveness probe, already live on every deploy. No account,
  no env, no step required. See the contract below.
- **Sentry wiring** — present but inert. The moment you add a DSN (below), server +
  browser errors start flowing; until then nothing initialises.

---

## Step A — (Optional) Create a Sentry project and add the DSN

Do this only if you want the unattended pipeline (the daily cron, an RSC read that fails
at 3am) to report errors to a dashboard.

1. Create a free Sentry account and a **Next.js** project at <https://sentry.io>.
2. Copy the project's **DSN** from **Project Settings → Client Keys (DSN)**. (A DSN is an
   ingest URL, not a secret credential — but still add it as an env var, not to git.)
3. In **Vercel → the real project → Settings → Environment Variables**, add both:

   | Variable | Value | Scope | Why |
   |----------|-------|-------|-----|
   | `SENTRY_DSN` | the DSN | Server | Server + edge + cron error capture (`register()`) |
   | `NEXT_PUBLIC_SENTRY_DSN` | the same DSN | Server + browser | Browser error capture (`instrumentation-client.ts`); `NEXT_PUBLIC_*` is inlined into the client bundle |

4. (Optional) To upload source maps for readable stack traces, add `SENTRY_AUTH_TOKEN`
   (an **Organization Auth Token** from Sentry). Without it, source-map upload is
   **skipped** and the build never fails — `next.config.ts` guards the upload on this
   token's presence.
5. Redeploy. With the DSN set, errors now appear in Sentry; without it, everything still
   runs exactly as before.

> Do **not** put a DSN or auth token in this repo, in `.env` committed files, or in any
> example here. They belong only in Vercel / GitHub Actions secrets.

---

## Secret & PII discipline (why Sentry can't leak your data)

Even with a DSN configured, the wiring is built to never ship secrets or PII:

- **`sendDefaultPii: false`** on both server and client init — no IP, cookies, or
  user-identifying request data is attached.
- **A `beforeSend` scrubber** (server) strips `request`, `extra`, `contexts.env`, and
  `server_name` before an event leaves the process, so a stack-adjacent `DATABASE_URL`
  or the `service_role` key cannot be exfiltrated (threat **T-07-12**).
- **`tracesSampleRate: 0`** — errors only, no performance-trace spend.
- **The client instrumentation never imports the server-only `service_role` chokepoint**
  (the elevated Supabase client) or any server module — the browser bundle stays clean.
- The pipeline already logs **counts only** (V7 discipline in `scripts/ingest.ts`);
  Sentry preserves that — never log or attach connection strings or keys.

If you ever see a Sentry event carrying an `env`/`extra` field with a connection string,
that is a regression — the scrubber above exists to prevent exactly that.

---

## `/api/health` — the liveness probe (D-06)

**Contract:**

```
GET /api/health  ->  200  { "app": "ok", "db": "ok" | "error", "ts": "<ISO-8601>" }
```

- **`app`** — always `"ok"` if the process is serving.
- **`db`** — a low-info DB liveness signal: a **HEAD count** (no rows returned) against
  the anon-readable `categories` reference table, run through the anon `@supabase/ssr`
  client under RLS. It **never** uses the `service_role` client. On any DB fault it
  degrades to `"error"` — the handler **never throws / never 500s**.
- **`ts`** — server timestamp of the probe.

**Intended use:**

- **Uptime pings** — point any external monitor at `https://<your-deploy>/api/health`.
  It is public (in `PUBLIC_PATHS`), so an unauthenticated ping receives the JSON instead
  of a 307 redirect to `/login`.
- **E2E smoke** — the Playwright suite (07-08) asserts the `{ app, db, ts }` shape.

**Safety (threat T-07-13):** the response is intentionally **low-info** — no rows, no
secrets, no env. It is safe to expose unauthenticated. Rate-limiting is out of scope for
a read-only liveness probe (T-07-14, accepted).

> Cron / ingest freshness (`lastIngestAt`, ">24–48h since last successful ingest") is a
> separate signal added in **07-07** — `/api/health` stays a minimal liveness probe here.
