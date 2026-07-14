import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (OBS-02, D-08) — freezes the cache-key/tag ISOLATION contract for the
// not-yet-existent `@/lib/db/marts-read` (built GREEN in 07-06). RED at RUNTIME (module does not
// resolve); the COMPUTED import specifier keeps `tsc --noEmit` green.
//
// THE LEAK GUARD (RESEARCH Pitfall 2 — the Phase-4 demo-isolation bug, reincarnated): `unstable_cache`
// is process-global while `is_demo` is per-request. If the cache KEY or TAG omits `isDemo`, a cached
// demo read can be served to a real user (or vice-versa) — real + demo figures blended. This suite
// pins the invariant: the key for the real partition is NEVER equal to the demo partition's key for
// any view/period, and the tag is `marts:real` / `marts:demo`. Getting this wrong re-opens the leak.

const MODULE = "@/lib/db/marts-read";

interface MartsRead {
  martsCacheKey: (view: string, period: number, isDemo: boolean) => unknown;
  martsCacheTag: (isDemo: boolean) => string;
}

async function loadMartsRead(): Promise<MartsRead> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return {
    martsCacheKey: mod.martsCacheKey as MartsRead["martsCacheKey"],
    martsCacheTag: mod.martsCacheTag as MartsRead["martsCacheTag"],
  };
}

// Type-agnostic comparison: the key may be a string or a string[] — compare its serialized form.
const keyStr = (k: unknown) => JSON.stringify(k);

describe("martsCacheKey — isDemo partitions the key", () => {
  it("the real key differs from the demo key for the same (view, period)", async () => {
    const { martsCacheKey } = await loadMartsRead();
    const real = martsCacheKey("v_home_kpis", 202607, false);
    const demo = martsCacheKey("v_home_kpis", 202607, true);
    expect(keyStr(real)).not.toBe(keyStr(demo));
  });

  it("real and demo keys are NEVER equal for any view/period (the isolation invariant)", async () => {
    const { martsCacheKey } = await loadMartsRead();
    const views = ["v_home_kpis", "v_pnl_monthly", "v_bucket_spend"];
    const periods = [202606, 202607, 202612];
    for (const view of views) {
      for (const period of periods) {
        const real = keyStr(martsCacheKey(view, period, false));
        const demo = keyStr(martsCacheKey(view, period, true));
        expect(real).not.toBe(demo);
      }
    }
  });
});

describe("martsCacheTag — isDemo partitions the tag", () => {
  it("the real tag is 'marts:real' and the demo tag is 'marts:demo'", async () => {
    const { martsCacheTag } = await loadMartsRead();
    expect(martsCacheTag(false)).toBe("marts:real");
    expect(martsCacheTag(true)).toBe("marts:demo");
  });
});
