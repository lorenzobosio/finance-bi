import * as Sentry from "@sentry/nextjs";

/**
 * Browser error capture (OBS-01, D-07). The current browser-init entry for
 * @sentry/nextjs 9+/Next 15 (the deprecated `sentry.client.config.ts` is gone).
 *
 * DSN-GATED, NO-OP BY DEFAULT: returns immediately when `NEXT_PUBLIC_SENTRY_DSN`
 * is absent, so the client bundle pays nothing and the app runs with no Sentry
 * account. `NEXT_PUBLIC_*` is the only DSN the browser may read (the server DSN
 * is intentionally NOT public).
 *
 * SECRET DISCIPLINE: this file is CLIENT-tier — it MUST NEVER import the
 * server-only `service_role` chokepoint (the elevated Supabase client) or any other
 * server-only module. `sendDefaultPii: false` keeps user identity/IP out of events (T-07-12).
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}
