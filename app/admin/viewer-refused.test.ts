// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A read-only person changes nothing, whatever they send.
 *
 * The proxy lets them post to the report pages (a server action posts to the
 * page it sits on), and a hidden button is only tidiness. This is the
 * boundary: the real actions, the real guard, signed in as someone whose row
 * says is_viewer. Each must refuse before anything is written or Stripe is
 * reached. The last case signs in as an admin to prove the trap can spring.
 * Spec: docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
 */

const state = vi.hoisted(() => ({
  row: { is_admin: false, is_viewer: true } as { is_admin: boolean; is_viewer: boolean },
  writes: [] as string[],
  stripe: 0,
}));

vi.mock("@/lib/supabase/server", () => {
  const WRITES = new Set(["insert", "update", "upsert", "delete", "rpc"]);
  // Any chain of calls; ends in the signed-in person's own row. A write
  // anywhere on the chain is recorded with its table.
  const chain = (table: string): unknown =>
    new Proxy(function () {}, {
      get(_t, prop: string) {
        if (prop === "then") return (ok: (v: unknown) => void) => ok({ data: state.row, error: null });
        return (..._args: unknown[]) => {
          if (WRITES.has(prop)) state.writes.push(`${table}.${prop}`);
          return chain(table);
        };
      },
    });
  const service = () => ({
    from: (table: string) => chain(table),
    rpc: (name: string) => (state.writes.push(`rpc.${name}`), chain(name)),
    auth: { admin: new Proxy({}, { get: (_t, prop: string) => async () => (state.writes.push(`auth.admin.${prop}`), { data: null, error: null }) }) },
  });
  return {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u-ads", email: "ads@example.test" } } }) } }),
    createServiceClient: service,
  };
});
vi.mock("stripe", () => ({
  default: class {
    constructor() {
      state.stripe++;
    }
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => state.writes.push("cookie.set"), delete: () => state.writes.push("cookie.delete") }),
  headers: async () => new Headers(),
}));

const members = await import("@/app/admin/members/actions");
const orders = await import("@/app/admin/orders/actions");

const form = () => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    userId: "u-victim", email: "victim@example.test", newEmail: "moved@example.test", subscriptionId: "sub_1", days: "7",
    ownershipId: "own_1", orderId: "ord_1", confirm: "REFUND", grant: "offer:1", makeAdmin: "true", makeViewer: "true", hidden: "true",
  })) fd.set(k, v);
  return fd;
};

// Every exported action on the two pages a read-only person can reach.
const ACTIONS: [string, () => Promise<unknown>][] = [
  ["refundOrderAction", () => orders.refundOrderAction({}, form())],
  ["cancelSubscriptionAction", () => members.cancelSubscriptionAction(form())],
  ["extendTrialAction", () => members.extendTrialAction(form())],
  ["addMemberAction", () => members.addMemberAction({}, form())],
  ["grantAccessAction", () => members.grantAccessAction({}, form())],
  ["revokeAccessAction", () => members.revokeAccessAction(form())],
  ["toggleAdminAction", () => members.toggleAdminAction(form())],
  ["toggleViewerAction", () => (members as unknown as { toggleViewerAction: (f: FormData) => Promise<void> }).toggleViewerAction(form())],
  ["toggleRecentBuyersHiddenAction", () => members.toggleRecentBuyersHiddenAction(form())],
  ["deleteMemberAction", () => members.deleteMemberAction({}, form())],
  ["viewAsMemberAction", () => members.viewAsMemberAction(form())],
  ["changeEmailAction", () => members.changeEmailAction({}, form())],
];

beforeEach(() => {
  process.env.ADMIN_EMAILS = "owner@example.test";
  state.row = { is_admin: false, is_viewer: true };
  state.writes = [];
  state.stripe = 0;
});

describe("a read-only person calling the admin's actions directly", () => {
  it.each(ACTIONS)("%s refuses, writes nothing and never reaches Stripe", async (_name, call) => {
    await expect(call()).rejects.toThrow("redirect:/login");
    expect(state.writes).toEqual([]);
    expect(state.stripe).toBe(0);
  });

  it("covers every action the two files export", () => {
    const exported = [...Object.keys(members), ...Object.keys(orders)].filter((k) => k.endsWith("Action")).sort();
    expect(ACTIONS.map(([n]) => n).sort()).toEqual(exported);
  });

  it("the same call as an admin does write, so the cases above can fail", async () => {
    state.row = { is_admin: true, is_viewer: false };
    await members.toggleRecentBuyersHiddenAction(form());
    expect(state.writes).toEqual(["users.update"]);
  });
});
