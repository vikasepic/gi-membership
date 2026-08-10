import { describe, it, expect, vi } from "vitest";

/**
 * The refusals that happen before anything is asked of Postgres.
 *
 * Each of these is asserted today only inside a `describe.skipIf` integration
 * suite, so CI — which has no service-role key — never runs one of them. They
 * do not need a database: that is the whole point of them. A guard that sits
 * above `createServiceClient()` is checkable by making the client itself
 * explode, which is what this file does.
 *
 * So the mutation each test catches is the same one twice over: delete the
 * guard, or move it below the client call. Either way the client throws and
 * the test fails with "nothing here should reach the database" rather than
 * with a message about the guard, which is the honest report — the guarantee
 * is the ORDER, not the wording.
 */

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => {
    throw new Error("nothing here should reach the database");
  },
}));
vi.mock("@/lib/store", () => ({
  getStoreId: async () => {
    throw new Error("nothing here should reach the database");
  },
}));

const { copyPage, saveSection } = await import("@/lib/pages");
const { createMember } = await import("@/lib/members");
const { moveItemTo } = await import("@/lib/curriculum-admin");

const ID = "00000000-0000-0000-0000-0000000000a1";

describe("refusals that never reach Postgres", () => {
  it("refuses to copy a page onto itself", async () => {
    // Below the client call this would delete the source and then copy it
    // back from nothing — the destructive half of copyPage runs first.
    await expect(
      copyPage({ ownerType: "product", ownerId: ID }, { ownerType: "product", ownerId: ID }),
    ).rejects.toThrow(/same page/i);
  });

  it("refuses a section key the code does not define", async () => {
    await expect(
      saveSection("product", ID, "not-a-section", {
        enabled: true, style: "paper", accent: null, variant: null, content: {},
      }),
    ).rejects.toThrow(/unknown section/i);
  });

  it("refuses a member whose email is not one", async () => {
    // Returns rather than throws: the admin screen shows it beside the field.
    expect(await createMember({ email: "not-an-address" })).toEqual({
      ok: false,
      error: "That is not an email address.",
    });
  });

  it("refuses a negative or fractional position", async () => {
    // The move is one RPC because sibling order is a unique index; a bad index
    // reaching it is a constraint error with a Postgres message on it.
    for (const bad of [-1, 1.5, NaN]) {
      await expect(moveItemTo(ID, null, bad), String(bad)).rejects.toThrow(/bad index/i);
    }
  });

  it("lets a good value through to the client, so these are guards and not walls", async () => {
    // Without this the four above would still pass with the guards widened to
    // refuse everything — which is not the behaviour any of them describe.
    await expect(moveItemTo(ID, null, 0)).rejects.toThrow(/reach the database/);
    await expect(
      copyPage({ ownerType: "product", ownerId: ID }, { ownerType: "offer", ownerId: ID }),
    ).rejects.toThrow(/reach the database/);
  });
});
