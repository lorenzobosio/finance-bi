import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Wave 0 contract for FND-01 / FND-02c. RED until Plan 03 creates `src/middleware.ts`
// (session refresh + route protection + allowlist sign-out). Do NOT implement the
// middleware here — this test is the executable contract Plan 03 turns green.

// Controls what the mocked Supabase server client reports as the current user.
let mockUser: { email: string } | null = null;
const signOut = vi.fn(async () => ({ error: null }));

// Mock @supabase/ssr so the middleware's createServerClient(...) is exercised
// without a live Supabase project. getUser() is the validated call (not getSession()).
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser }, error: null }),
      signOut,
    },
  }),
}));

beforeEach(() => {
  mockUser = null;
  signOut.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.ALLOWED_EMAILS = "lorenzo@example.com,fernanda@example.com";
});

async function loadMiddleware() {
  // Imported lazily so the env + mocks above are in place first.
  const mod = await import("@/middleware");
  return mod.middleware;
}

describe("middleware route protection + allowlist (FND-01, FND-02c)", () => {
  it("redirects an unauthenticated request to a protected path to /login (307)", async () => {
    mockUser = null;
    const middleware = await loadMiddleware();
    const res = await middleware(
      new NextRequest("https://app.example.com/dashboard"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("signs out an authenticated but non-allowlisted user and redirects to /login?denied=1", async () => {
    mockUser = { email: "stranger@example.com" };
    const middleware = await loadMiddleware();
    const res = await middleware(
      new NextRequest("https://app.example.com/dashboard"),
    );
    expect(signOut).toHaveBeenCalledOnce();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?denied=1");
  });
});
