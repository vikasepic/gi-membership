// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Who may read the deploy warning the admin shell polls. A read-only person
 * has a tab open in the admin like anyone else and is about to be thrown off
 * it by the same deploy, so they are told. Raising a warning stays with the
 * CRON_SECRET holder; a session of any kind is not enough.
 */

const who = vi.hoisted(() => ({ role: null as null | "admin" | "viewer", announced: 0 }));
vi.mock("@/lib/admin-guard", () => ({
  getAdminRole: async () => (who.role ? { user: { id: "u1", email: "x@example.test" }, role: who.role } : null),
  requireAdmin: async () => {
    if (who.role !== "admin") throw new Error("redirect:/login");
    return { id: "u1", email: "x@example.test" };
  },
}));
vi.mock("@/lib/deploy-notice", () => ({
  currentNotice: async () => ({ at: "2026-11-18T04:10:00Z", seconds: 60 }),
  announceDeploy: async () => (who.announced++, { at: "now" }),
}));

const { GET, POST } = await import("@/app/api/deploy-notice/route");

beforeEach(() => {
  process.env.CRON_SECRET = "zz-secret";
  who.role = null;
  who.announced = 0;
});

describe("reading the deploy warning", () => {
  it.each(["admin", "viewer"] as const)("a signed-in %s is told", async (role) => {
    who.role = role;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notice: { at: "2026-11-18T04:10:00Z", seconds: 60 } });
  });

  it("nobody else is", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ notice: null });
  });
});

describe("raising a deploy warning", () => {
  it("is refused for a read-only person's session without the secret", async () => {
    who.role = "viewer";
    const res = await POST(new Request("https://grow.greaterinside.com/api/deploy-notice", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(who.announced).toBe(0);
  });
});
