// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The two role flags on a member, admin and read-only, never linger together.
 *
 * Found in the final review, 18 Nov 2026: a read-only person made an admin
 * kept is_viewer, and the person page hides the read-only switch on an admin.
 * Take admin away later and they fell back, unseen, to reading every customer.
 */
const updates = vi.hoisted(() => [] as { table: string; values: Record<string, unknown>; id: string }[]);
const fail = vi.hoisted(() => ({ message: null as string | null }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => (updates.push({ table, values, id }), { error: fail.message ? { message: fail.message } : null }),
      }),
    }),
  }),
}));

const { setMemberAdmin, setMemberViewer } = await import("@/lib/members");

beforeEach(() => {
  updates.length = 0;
  fail.message = null;
});

describe("a switch that did not save", () => {
  it.each([
    ["admin", () => setMemberAdmin("u1", true)],
    ["read-only", () => setMemberViewer("u1", true)],
  ])("the %s switch says so instead of looking as if it worked", async (_name, call) => {
    fail.message = 'column "is_viewer" does not exist';
    await expect(call()).rejects.toThrow('column "is_viewer" does not exist');
  });
});

describe("making or unmaking an admin", () => {
  it("making an admin drops read-only access: an admin already sees everything", async () => {
    await setMemberAdmin("u1", true);
    expect(updates).toEqual([{ table: "users", values: { is_admin: true, is_viewer: false }, id: "u1" }]);
  });

  it("taking admin away leaves an ordinary member, not a read-only one", async () => {
    await setMemberAdmin("u1", false);
    expect(updates).toEqual([{ table: "users", values: { is_admin: false, is_viewer: false }, id: "u1" }]);
  });
});

describe("the read-only switch", () => {
  it("touches the read-only flag alone", async () => {
    await setMemberViewer("u1", true);
    expect(updates).toEqual([{ table: "users", values: { is_viewer: true }, id: "u1" }]);
  });
});
