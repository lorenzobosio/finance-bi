"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { DEMO_MODE_COOKIE } from "@/lib/demo/mode";
import { createClient } from "@/lib/supabase/server";
import { resolveMember, type Member } from "@/lib/identity/resolve-member";

// Demo-mode + onboarding-resurface Server Actions (DEMO-03, D4-12 / D4-21).
//
// setDemoMode writes/clears the `demo_mode` cookie the single chokepoint (src/lib/demo/mode.ts)
// reads to select the is_demo partition for every read. It is a per-request MODE for the
// signed-in owner — NOT an RLS change, NO service_role (the owner's own JWT + the anon key only,
// FND-03). revalidatePath('/', 'layout') re-renders the shell + the current page so the data
// switches and the persistent DEMO DATA banner appears/disappears immediately.
//
// showSetupChecklist clears the household-scoped `members.onboarding_dismissed_at` flag (D4-21)
// so an incomplete-but-dismissed household can re-surface the setup guide from Config. Matched by
// the resolved member (auth_email); a no-op when the email is unmapped (degrades safely).

/** The demo_mode cookie lifetime — a session-ish 30 days (the toggle is a convenience, not a boundary). */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Set or clear the demo_mode cookie, then revalidate the shell so reads re-partition. */
export async function setDemoMode(enabled: boolean): Promise<void> {
  const store = await cookies();
  if (enabled) {
    store.set(DEMO_MODE_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  } else {
    store.delete(DEMO_MODE_COOKIE);
  }
  revalidatePath("/", "layout");
}

/** Clear the onboarding dismissal flag for the signed-in member so the checklist re-surfaces. */
export async function showSetupChecklist(): Promise<void> {
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
  // Unmapped member → no household row to update; degrade safely (the session-cookie path is
  // owned by the onboarding plan). Mapped → clear the dismissal so the guide re-surfaces.
  if (me) {
    await supabase.from("members").update({ onboarding_dismissed_at: null }).eq("id", me.id);
  }
  revalidatePath("/", "layout");
}
