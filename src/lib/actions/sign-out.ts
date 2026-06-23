"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Sign-out Server Action (FND-01). Clears the @supabase/ssr cookie session under the user's
// own JWT (never service_role) and redirects to the public login page. Invoked from the
// sidebar footer's sign-out button via a <form action={signOut}>.

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
