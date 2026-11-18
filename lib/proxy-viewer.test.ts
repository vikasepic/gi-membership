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
}));
vi.mock("@/lib/redirect-cache", () => ({ cachedRedirectRules: async () => [] }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
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
