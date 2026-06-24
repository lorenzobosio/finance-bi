import "server-only";

import { resolveMember, type Member } from "@/lib/identity/resolve-member";
import { createClient } from "@/lib/supabase/server";

// src/lib/identity/me.ts — the single server-side identity resolver (PERS-02, D4-25).
//
// ONE resolver, used by BOTH greeting surfaces (the Home h1 and the AppSidebar footer): it reads
// the signed-in email via getUser() (network-validated — NEVER getSession()), reads `members`
// once under RLS, and resolves the row with the pure `resolveMember`. Each surface lives in a
// different RSC tree (layout owns the sidebar; page.tsx owns Home), so both call this helper —
// the resolver logic exists in exactly ONE place (D4-25). It returns ONLY the email + the
// resolved displayName; the component renders displayName only, never the email (no PII in the
// RSC payload — T-04-R4). An unmapped/null session degrades to displayName=null → generic
// greeting (identity follows the session, never the data mode — D4-26).
//
// `server-only`: this pulls the @supabase/ssr server client; it must never reach a client bundle.

export interface Me {
  /** The signed-in email (for the sidebar fallback chip only — never rendered in the greeting). */
  email: string | undefined;
  /** The resolved member display name, or null when the email is unmapped / there is no session. */
  displayName: string | null;
}

/**
 * resolveMe — read the session email + the `members` roster once and resolve the display name.
 * getUser() is network-validated (D4-25); `members` is read under the caller's JWT + RLS.
 */
export async function resolveMe(): Promise<Me> {
  const supabase = await createClient();
  const [{ data: userData }, { data: memberData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("members").select("id, display_name, auth_email"),
  ]);

  const email = userData?.user?.email ?? undefined;
  const members: Member[] = (memberData ?? []).map((m) => ({
    id: m.id,
    displayName: m.display_name,
    authEmail: m.auth_email,
  }));
  const me = resolveMember(email, members);

  return { email, displayName: me?.displayName ?? null };
}
