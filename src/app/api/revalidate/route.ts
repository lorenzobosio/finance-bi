import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";

/**
 * POST /api/revalidate — on-demand mart-cache invalidation for the ingestion cron (OBS-02, D-08).
 *
 * The GitHub-Action cron runs OUTSIDE the app process, so it cannot call `revalidateTag` directly.
 * After a successful `pnpm ingest` it POSTs here with a shared-secret bearer; this route invalidates
 * ONLY the real partition tag ("marts:real"). The demo partition is deliberately NOT invalidated —
 * an ingest only ever changes real (is_demo=false) data; the demo partition changes solely when the
 * demo seed re-runs (which owns its own invalidation). Never expose an unauthenticated cache-bust.
 *
 * AUTH: the `authorization` header must equal `Bearer ${REVALIDATE_SECRET}`, compared in CONSTANT
 * TIME (timingSafeEqual) so a mismatch cannot be timed byte-by-byte. It FAILS CLOSED: a missing
 * secret env, a missing header, or any length/value mismatch returns 401 BEFORE any body work
 * (threat T-07-16 — unauthenticated cache poisoning / DoS). The secret is never logged.
 *
 * This route is added to middleware PUBLIC_PATHS so the sessionless cron can reach it on the REAL
 * deploy — the bearer secret is therefore the SOLE gate (there is no user session on this path).
 *
 * `force-dynamic` so the handler is never statically optimized / cached.
 */
export const dynamic = "force-dynamic";

/** Constant-time string compare (length-guarded — length inequality is not itself secret). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;
  const provided = req.headers.get("authorization");

  // Fail closed, fast, before touching the request body.
  if (!secret || !provided || !safeEqual(provided, `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Only the real partition changed on an ingest — never invalidate the demo partition here.
  revalidateTag("marts:real");

  return Response.json({ revalidated: true, ts: Date.now() });
}
