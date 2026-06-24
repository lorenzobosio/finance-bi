// src/lib/identity/greeting.ts — the PURE time-of-day greeting (PERS-02, D4-24).
//
// `buildGreeting(name|null, now?)` is a pure function (the `now` clock is always injectable, the
// same pattern as the period helpers, so the unit tests are deterministic). Tone is time-of-day
// (the Monzo/Revolut/N26 product greeting at the h1 level — D4-24):
//   hours < 12        → "Good morning"
//   12 ≤ hours < 18   → "Good afternoon"
//   hours ≥ 18        → "Good evening"
// With a name → "Good {part}, {name}"; with a null name (unmapped/public-demo) → the generic
// "Good {part}" with NO trailing comma. Identity is cosmetic — this NEVER throws, and the output
// NEVER contains an @-sign (the component renders displayName only, never the auth email — D4-25).
//
// No real name or email literal lives here. (source-cleanliness stays green.)

/** Derive the time-of-day part from the local hours of `now`. */
function partOfDay(now: Date): "morning" | "afternoon" | "evening" {
  const hours = now.getHours();
  if (hours < 12) return "morning";
  if (hours < 18) return "afternoon";
  return "evening";
}

/**
 * buildGreeting — the time-of-day greeting string (PERS-02). `name` null → generic fallback
 * (no name, no trailing comma). `now` defaults to the current clock; inject it for tests.
 */
export function buildGreeting(name: string | null, now: Date = new Date()): string {
  const part = partOfDay(now);
  return name === null ? `Good ${part}` : `Good ${part}, ${name}`;
}
