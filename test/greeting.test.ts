import { describe, expect, it } from "vitest";

// Wave-0 RED (PERS-02, D4-24) — freezes the greeting contract for the not-yet-existent
// `src/lib/identity/greeting.ts`. RED on import until the later wave builds it.
//
// `buildGreeting(name|null, now?)` is a PURE function (the `now` clock is always injectable for
// deterministic tests, like the period helpers). Tone is time-of-day (D4-24):
//   < 12h  → "Good morning, {name}"
//   12–18h → "Good afternoon, {name}"
//   ≥ 18h  → "Good evening, {name}"
// An unmapped member (null name) → the generic "Good {part}" with NO name and NO trailing comma
// (identity is cosmetic — buildGreeting never throws). The output never contains an @-sign.
import { buildGreeting } from "@/lib/identity/greeting";

// Fixed local-time clocks for each part of day (the helper reads local hours from `now`).
const at = (hour: number) => new Date(2026, 5, 24, hour, 0, 0); // month is 0-indexed (June)

describe("buildGreeting (PERS-02) — time-of-day tone with a name", () => {
  it("before 12:00 → 'Good morning, {name}'", () => {
    expect(buildGreeting("Alex", at(8))).toBe("Good morning, Alex");
  });

  it("12:00–17:59 → 'Good afternoon, {name}'", () => {
    expect(buildGreeting("Alex", at(12))).toBe("Good afternoon, Alex");
    expect(buildGreeting("Alex", at(17))).toBe("Good afternoon, Alex");
  });

  it("18:00 or later → 'Good evening, {name}'", () => {
    expect(buildGreeting("Alex", at(18))).toBe("Good evening, Alex");
    expect(buildGreeting("Alex", at(23))).toBe("Good evening, Alex");
  });
});

describe("buildGreeting — generic fallback when the member is unmapped (null name)", () => {
  it("null name → 'Good {part}' with NO name and NO trailing comma", () => {
    expect(buildGreeting(null, at(8))).toBe("Good morning");
    expect(buildGreeting(null, at(13))).toBe("Good afternoon");
    expect(buildGreeting(null, at(20))).toBe("Good evening");
  });

  it("the generic fallback contains no comma (so no dangling 'Good morning,')", () => {
    expect(buildGreeting(null, at(8)).includes(",")).toBe(false);
  });

  it("never throws for any clock and never emits an @-sign", () => {
    for (let h = 0; h < 24; h++) {
      expect(() => buildGreeting("Alex", at(h))).not.toThrow();
      expect(buildGreeting("Alex", at(h)).includes("@")).toBe(false);
      expect(buildGreeting(null, at(h)).includes("@")).toBe(false);
    }
  });
});
