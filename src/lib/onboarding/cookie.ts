// src/lib/onboarding/cookie.ts — the onboarding dismissal session-cookie name (D4-21 fallback).
//
// Dismissal is normally household-scoped (members.onboarding_dismissed_at), but an
// unmapped-but-allowlisted session has no members row to write — it degrades to this session
// cookie (Eval 08 R2) so the dismissal still holds for the device/session. Lives in its own
// module (NOT the "use server" actions file, which may only export async functions) so both the
// dismiss server action and the Home RSC can import the name.

/** The session-cookie the dismiss action sets for an unmapped member; read by the Home RSC. */
export const ONBOARDING_DISMISS_COOKIE = "onboarding_dismissed";
