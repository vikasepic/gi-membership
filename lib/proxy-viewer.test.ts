import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * The proxy's admin gate with a read-only person in it (users.is_viewer):
 * five report pages open, everything else under /admin sends them to Journeys.
 * Spec: docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
 */

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  row: null as null | { is_admin?: boolean; is_viewer?: boolean },
  throws: false,
  lookups: 0,
  selected: "",
  refreshed: null as null | { name: string; value: string },
}));
vi.mock("@/lib/redirect-cache", () => ({ cachedRedirectRules: async () => [] }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { setAll: (l: { name: string; value: string; options: object }[]) => void } }) => ({
    auth: {
      getUser: async () => {
        if (state.refreshed) opts.cookies.setAll([{ ...state.refreshed, options: { path: "/" } }]);
        return { data: { user: state.user } };
      },
    },
    from: () => {
      const q = {
        select: (cols: string) => ((state.selected = cols), q),
        eq: () => q,
        maybeSingle: async () => {
          state.lookups++;
          if (state.throws) throw new Error("db down");
          return { data: state.row, error: null };
        },
      };
      return q;
    },
  }),
}));

const { proxy } = await import("@/proxy");
const hit = (path: string, method = "GET") => proxy(new NextRequest(`https://grow.greaterinside.com${path}`, { method }));
const pathOf = (res: Response) => {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.ADMIN_EMAILS = "owner@example.test";
  state.user = { id: "u1", email: "ads@example.test" };
  state.row = { is_admin: false, is_viewer: true };
  state.throws = false;
  state.lookups = 0;
  state.refreshed = null;
});

describe("a read-only person at the admin gate", () => {
  it("opens a report page, on one lookup", async () => {
    const res = await hit("/admin/orders");
    expect(res.status).toBe(200);
    expect(pathOf(res)).toBeNull();
    expect(state.lookups).toBe(1);
    expect(state.selected).toBe("is_admin, is_viewer");
  });

  it.each(["/admin/members/abc-123", "/admin/orders/export", "/admin/journeys", "/admin/traffic", "/admin/attribution/visits"])("opens %s", async (p) => {
    expect((await hit(p)).status).toBe(200);
  });

  it.each(["/admin/settings", "/admin", "/admin/membersX", "/admin/offers/1/page-editor", "/admin/subscriptions"])(
    "is sent to Journeys from %s",
    async (p) => {
      expect(pathOf(await hit(p))).toBe("/admin/journeys");
    },
  );

  it("is sent to Journeys with the query dropped", async () => {
    expect(pathOf(await hit("/admin/settings?tab=redirects"))).toBe("/admin/journeys");
  });

  it.each([
    ["/admin/members/../settings", "a parent step"],
    ["/admin/members/%2e%2e/settings", "an encoded parent step"],
    ["/admin/orders%2f..%2fsettings", "an encoded slash"],
    ["/admin/orders/..%2fsettings", "a half-encoded parent step"],
    ["/admin/membersX/abc", "a name that only starts like a report page"],
    ["/admin/traffic/%ZZ", "an encoding that does not decode"],
  ])("is sent to Journeys from %s (%s)", async (p) => {
    expect(pathOf(await hit(p))).toBe("/admin/journeys");
  });

  it("opens a funnel whose name needed encoding", async () => {
    expect((await hit("/admin/traffic/caf%C3%A9")).status).toBe(200);
  });

  it("keeps a session refreshed on this request when it sends them to Journeys", async () => {
    // getUser() may rotate the tokens and hand the new ones to setAll. They
    // were set on the response the gate then threw away; it only worked
    // because the auth server tolerates the old token for a few seconds.
    state.refreshed = { name: "sb-zz-auth-token", value: "fresh-token" };
    const res = await hit("/admin/settings");
    expect(pathOf(res)).toBe("/admin/journeys");
    expect(res.headers.getSetCookie().join("\n")).toContain("sb-zz-auth-token=fresh-token");
  });

  it("opens a report page with a trailing slash", async () => {
    expect((await hit("/admin/orders/")).status).toBe(200);
  });

  it("/Admin is not an admin address: the gate does not apply and the router has no such page", async () => {
    // Next matches routes case-sensitively, so this is a 404 for everyone. The
    // gate must not treat it as a report page either.
    const res = await hit("/Admin/Settings");
    expect(pathOf(res)).toBeNull();
    expect(state.lookups).toBe(0);
  });

  it("may post to a report page: the action's own guard is what refuses it", async () => {
    expect((await hit("/admin/members/abc-123", "POST")).status).toBe(200);
  });

  it("is refused when the lookup fails", async () => {
    state.throws = true;
    expect(pathOf(await hit("/admin/orders"))).toBe("/login");
  });
});

describe("everyone else at the admin gate, as before", () => {
  it("a member with neither flag goes to the login", async () => {
    state.row = { is_admin: false, is_viewer: false };
    expect(pathOf(await hit("/admin/orders"))).toBe("/login");
    expect(pathOf(await hit("/admin/settings"))).toBe("/login");
  });

  it("nobody signed in goes to the login", async () => {
    state.user = null;
    expect(pathOf(await hit("/admin/journeys"))).toBe("/login");
  });

  it("an admin opens anything, both flags or one", async () => {
    state.row = { is_admin: true, is_viewer: true };
    expect((await hit("/admin/settings")).status).toBe(200);
  });

  it("an environment admin opens anything without the table being asked", async () => {
    state.user = { id: "o1", email: "owner@example.test" };
    expect((await hit("/admin/settings")).status).toBe(200);
    expect(state.lookups).toBe(0);
  });
});
