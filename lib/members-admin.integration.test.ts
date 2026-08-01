import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import {
  createMember,
  grantProduct,
  grantOfferAccess,
  revokeOwnership,
  setMemberAdmin,
  accessForMember,
  listMembers,
} from "@/lib/members";

// Manual grants create REAL entitlement — a granted product appears in the
// library exactly like a bought one. These run against the real database.
const canRun = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const db = () => createServiceClient();

const emails: string[] = [];
const email = () => {
  const e = `mgr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
  emails.push(e);
  return e;
};

const PRODUCT = "00000000-0000-0000-0000-0000000000b1";
const OFFER = "00000000-0000-0000-0000-0000000000c1";

describe.skipIf(!canRun)("admin member management (integration)", () => {
  it("creates a member with no password, and is safe to run twice", async () => {
    const e = email();
    const first = await createMember({ email: e, fullName: "Comped Person" });
    expect(first.ok && first.existed).toBe(false);

    // Adding the same address again must adopt the existing member rather than
    // erroring — "add and grant" is how you comp someone already on the list.
    const second = await createMember({ email: e });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.existed).toBe(true);
    if (first.ok && second.ok) expect(second.userId).toBe(first.userId);
  });

  it("grants a product so it shows as owned", async () => {
    const e = email();
    const m = await createMember({ email: e });
    if (!m.ok) throw new Error(m.error);

    expect((await grantProduct({ userId: m.userId, productId: PRODUCT, grantedBy: "admin@test" })).ok).toBe(true);
    const held = await accessForMember(m.userId);
    expect(held.some((a) => a.kind === "product" && a.granted)).toBe(true);

    // Granting twice must not duplicate — the end state is the same either way.
    await grantProduct({ userId: m.userId, productId: PRODUCT, grantedBy: "admin@test" });
    expect((await accessForMember(m.userId)).filter((a) => a.kind === "product")).toHaveLength(1);
  });

  it("grants app access with no Stripe subscription behind it", async () => {
    const e = email();
    const m = await createMember({ email: e });
    if (!m.ok) throw new Error(m.error);

    expect((await grantOfferAccess({ userId: m.userId, offerId: OFFER, grantedBy: "admin@test" })).ok).toBe(true);
    const { data } = await db()
      .from("ownership")
      .select("app_id, source, granted_by, stripe_subscription_id")
      .eq("user_id", m.userId)
      .not("app_id", "is", null)
      .maybeSingle();
    expect(data?.source).toBe("grant");
    expect(data?.granted_by).toBe("admin@test");
    // A comp has no subscription: nothing renews, nothing to cancel in Stripe.
    expect(data?.stripe_subscription_id).toBeNull();
  });

  it("revokes a product by removing it, and app access by cancelling it", async () => {
    const e = email();
    const m = await createMember({ email: e });
    if (!m.ok) throw new Error(m.error);
    await grantProduct({ userId: m.userId, productId: PRODUCT, grantedBy: "a@t" });
    await grantOfferAccess({ userId: m.userId, offerId: OFFER, grantedBy: "a@t" });

    for (const a of await accessForMember(m.userId)) await revokeOwnership(a.id);

    const after = await accessForMember(m.userId);
    // The product row is gone; the app row stays as canceled so the connected
    // app has a state to be told about rather than a silent disappearance.
    expect(after.filter((a) => a.kind === "product")).toHaveLength(0);
    expect(after.filter((a) => a.kind === "app" && a.status === "canceled")).toHaveLength(1);
  });

  it("flags and unflags an admin, and surfaces it on the member list", async () => {
    const e = email();
    const m = await createMember({ email: e });
    if (!m.ok) throw new Error(m.error);

    await setMemberAdmin(m.userId, true);
    expect((await listMembers()).find((x) => x.id === m.userId)?.isAdmin).toBe(true);
    await setMemberAdmin(m.userId, false);
    expect((await listMembers()).find((x) => x.id === m.userId)?.isAdmin).toBe(false);
  });

  it("refuses something that is not an email", async () => {
    expect(await createMember({ email: "not-an-address" })).toEqual({
      ok: false,
      error: "That is not an email address.",
    });
  });
});

afterAll(async () => {
  if (!canRun) return;
  for (const e of emails) {
    const { data: u } = await db().from("users").select("id").eq("email", e).maybeSingle();
    if (u) {
      await db().from("ownership").delete().eq("user_id", u.id);
      await db().from("users").delete().eq("id", u.id);
      await db().auth.admin.deleteUser(u.id as string).catch(() => {});
    }
  }
});
