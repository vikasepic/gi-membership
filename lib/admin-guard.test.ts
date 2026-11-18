import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Who the admin guards let through, now that there are two kinds of person
 * in the admin: an admin, and a read-only one (users.is_viewer).
 *
 * The rule under test: nothing that lets a change through ever passes for a
 * read-only person. requireViewer() is the only guard that does, and only
 * pages and downloads call it.
 * Spec: docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
 */

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  row: null as null | { is_admin?: boolean; is_viewer?: boolean },
  throws: false,
  lookups: 0,
}));
vi.mock("@/lib/supabase/server", () => {
  const service = () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          state.lookups++;
          if (state.throws) throw new Error("db down");
          return { data: state.row, error: null };
        },
      };
      return q;
    },
  });
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
    createServiceClient: service,
  };
});
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const guard = () => import("@/lib/admin-guard");
const member = { id: "u1", email: "ads@example.test" };

beforeEach(() => {
  vi.resetModules();
  process.env.ADMIN_EMAILS = "owner@example.test";
  state.user = member;
  state.row = null;
  state.throws = false;
  state.lookups = 0;
});

describe("a read-only person", () => {
  beforeEach(() => {
    state.row = { is_admin: false, is_viewer: true };
  });

  it("is not an admin to anything that lets a change through", async () => {
    const g = await guard();
    expect(await g.getAdminUser()).toBeNull();
    expect(await g.userIsAdmin(member)).toBe(false);
    await expect(g.requireAdmin()).rejects.toThrow("redirect:/login");
  });

  it("passes the read-only guard, as a viewer", async () => {
    const g = await guard();
    const got = await g.requireViewer();
    expect(got.role).toBe("viewer");
    expect(got.user.id).toBe("u1");
  });
});

describe("an admin", () => {
  it("flagged both ways is an admin", async () => {
    state.row = { is_admin: true, is_viewer: true };
    const g = await guard();
    expect((await g.requireViewer()).role).toBe("admin");
    expect(await g.getAdminUser()).not.toBeNull();
  });

  it("through the environment stays an admin whatever the table says, and the table is not asked", async () => {
    state.user = { id: "o1", email: "Owner@Example.test" };
    state.row = { is_admin: false, is_viewer: true };
    const g = await guard();
    expect((await g.requireViewer()).role).toBe("admin");
    expect(state.lookups).toBe(0);
  });
});

describe("everyone else", () => {
  it("a member with neither flag is sent to the login", async () => {
    state.row = { is_admin: false, is_viewer: false };
    await expect((await guard()).requireViewer()).rejects.toThrow("redirect:/login");
  });

  it("nobody signed in is sent to the login", async () => {
    state.user = null;
    await expect((await guard()).requireViewer()).rejects.toThrow("redirect:/login");
    expect(state.lookups).toBe(0);
  });

  it("a lookup that fails denies", async () => {
    state.row = { is_admin: false, is_viewer: true };
    state.throws = true;
    await expect((await guard()).requireViewer()).rejects.toThrow("redirect:/login");
  });
});

describe("read-only access taken away", () => {
  it("is gone on the next request: the role is asked for again, never remembered", async () => {
    state.row = { is_admin: false, is_viewer: true };
    const g = await guard();
    expect((await g.getAdminRole())?.role).toBe("viewer");
    state.row = { is_admin: false, is_viewer: false };
    expect(await g.getAdminRole()).toBeNull();
  });
});
