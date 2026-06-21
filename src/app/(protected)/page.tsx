import { createClient } from "@/lib/supabase/server";

// This page is reached only after the middleware confirms an authenticated, allowlisted
// session. It performs ONE real RLS-bound read via the @supabase/ssr server client (the
// user's JWT), proving the gate end-to-end: an allowlisted user sees the seeded rows; a
// non-allowlisted user never reaches here (middleware bounces them) and RLS would return
// zero rows anyway (defense-in-depth, T-00-09/T-00-11). The Drizzle client is NOT used
// here — it bypasses RLS (RESEARCH Pitfall 1).
export default async function ProtectedHome() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Real authenticated read of a seeded table (members, 2 rows from Plan-02 seed),
  // returned under RLS for the allowlisted caller.
  const { data: members, error } = await supabase
    .from("members")
    .select("email, display_name")
    .order("display_name", { ascending: true });

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Finance BI</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user?.email ?? "unknown"}.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Household members (RLS-bound read)
        </h2>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load members: {error.message}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-card-foreground">
            {(members ?? []).map((m) => (
              <li
                key={m.email}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <span className="font-medium">{m.display_name}</span>
                <span className="text-sm text-muted-foreground">{m.email}</span>
              </li>
            ))}
            {(members ?? []).length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                No members visible.
              </li>
            )}
          </ul>
        )}
      </section>
    </main>
  );
}
