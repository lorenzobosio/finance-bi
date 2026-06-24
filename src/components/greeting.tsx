import { buildGreeting } from "@/lib/identity/greeting";

// <Greeting /> — the Home h1 greeting (PERS-02, D4-25).
//
// A thin Server Component that renders the time-of-day greeting in the Home `<h1>` role. It
// receives the already-resolved `displayName | null` (the layout does the ONE `members` read +
// resolveMember; D4-25 — one resolver, zero extra session reads) and renders ONLY the name —
// never the auth email — so no PII enters the RSC payload (T-04-R4). An unmapped/public-demo
// session passes `name={null}` → the generic "Good {part}" fallback (identity follows the
// session, never the data mode — D4-26).

interface GreetingProps {
  /** The resolved member display name, or null to degrade to the generic greeting. */
  name: string | null;
  className?: string;
}

export function Greeting({ name, className }: GreetingProps) {
  return <h1 className={className ?? "text-xl font-semibold"}>{buildGreeting(name)}</h1>;
}
