import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Contract for FND-01 / FND-02c: session refresh + route protection + allowlist gate.
// The allowlist is sourced from the DB via the `is_email_allowed` RPC (NOT an env var),
// so these tests drive the RPC result rather than `process.env.ALLOWED_EMAILS`.

let mockUser: { email: string | null } | null = null;
let mockAllowed = false;
let mockRpcError: { message: string } | null = null;
const signOut = vi.fn(async () => ({ error: null }));
const rpc = vi.fn(async () => ({
  data: mockRpcError ? null : mockAllowed,
  error: mockRpcError,
}));

// Mock @supabase/ssr so the middleware's createServerClient(...) is exercised without a
// live Supabase project. getUser() is the validated call; rpc() is the allowlist lookup.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser }, error: null }),
      signOut,
    },
    rpc,
  }),
}));

beforeEach(() => {
  mockUser = null;
  mockAllowed = false;
  mockRpcError = null;
  signOut.mockClear();
  rpc.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
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
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lets an authenticated, allowlisted user through (no redirect, no sign-out)", async () => {
    mockUser = { email: "lorenzo@example.com" };
    mockAllowed = true;
    const middleware = await loadMiddleware();
    const res = await middleware(
      new NextRequest("https://app.example.com/dashboard"),
    );
    expect(rpc).toHaveBeenCalledWith("is_email_allowed", {
      check_email: "lorenzo@example.com",
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBeNull();
  });

  it("signs out an authenticated but non-allowlisted user and redirects to /login?denied=1", async () => {
    mockUser = { email: "stranger@example.com" };
    mockAllowed = false;
    const middleware = await loadMiddleware();
    const res = await middleware(
      new NextRequest("https://app.example.com/dashboard"),
    );
    expect(signOut).toHaveBeenCalledOnce();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?denied=1");
  });

  it("fails closed: signs out + denies when the allowlist RPC errors", async () => {
    mockUser = { email: "lorenzo@example.com" };
    mockRpcError = { message: "transient db error" };
    const middleware = await loadMiddleware();
    const res = await middleware(
      new NextRequest("https://app.example.com/dashboard"),
    );
    expect(signOut).toHaveBeenCalledOnce();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?denied=1");
  });
});
