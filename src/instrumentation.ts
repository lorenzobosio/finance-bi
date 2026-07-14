import * as Sentry from "@sentry/nextjs";

/**
 * Server + edge error capture for the unattended pipeline (OBS-01, D-07).
 *
 * DSN-GATED, NO-OP BY DEFAULT: `register()` returns immediately when `SENTRY_DSN`
 * is absent, so the app builds and runs with ZERO Sentry overhead and NO external
 * account. Sentry is the ONE optional Phase-7 external account the owner may create
 * later; everything works without it.
 *
 * NOTE on location: this file lives in `src/` (NOT the repo root) because Next 15
 * resolves the instrumentation hook from `rootDir = join(appDir, "..")`, and this
 * project's `appDir` is `src/app` — so `src/instrumentation.ts` is the path Next
 * actually detects (the same reason `src/middleware.ts` lives here). A repo-root
 * `instrumentation.ts` would be silently ignored and Sentry would never initialise.
 *
 * SECRET/PII DISCIPLINE (V7 / Pitfall 6, T-07-12): `sendDefaultPii: false` plus a
 * `beforeSend` scrubber strip any `request`, `extra`, `contexts.env`, or `server_name`
 * fields that could carry a `DATABASE_URL`, the `service_role` key, or a cookie/JWT.
 * This module is server-tier only and never imports `src/lib/supabase/service.ts`.
 */

/**
 * Defensive scrubber: drop the event fields that could carry a connection string,
 * a secret key, cookies, or auth headers before the event leaves the process.
 * Sentry's own defaults already omit most of these with `sendDefaultPii: false`;
 * this is belt-and-suspenders so a future `captureException(err, { extra })` call
 * cannot accidentally exfiltrate an env value.
 */
function beforeSend(
  event: Sentry.ErrorEvent,
): Sentry.ErrorEvent | null {
  // Never ship request bodies/headers/cookies (may carry the session JWT).
  delete event.request;
  // Never ship arbitrary attached data (a stack-adjacent DATABASE_URL / key).
  delete event.extra;
  // Never ship the host env or server identity.
  if (event.contexts) {
    delete event.contexts.env;
  }
  delete event.server_name;
  return event;
}

export async function register() {
  // True no-op without a DSN — no init, no network, no overhead.
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Never attach IP / cookies / user-identifying request data.
    sendDefaultPii: false,
    // Errors only — no performance tracing spend for this tiny pipeline.
    tracesSampleRate: 0,
    beforeSend,
  });
}

// Next 15 request-error hook — auto-captures RSC / route-handler / middleware errors.
// When no DSN is set, `register()` never called `Sentry.init`, so this is inert.
export const onRequestError = Sentry.captureRequestError;
