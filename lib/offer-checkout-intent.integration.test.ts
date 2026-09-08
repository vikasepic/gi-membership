import { describe, it, expect, afterAll } from "vitest";
import { startOfferCheckout } from "@/lib/offer-checkout";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];
const users: string[] = [];

async function offerOf(billing: "one_time" | "recurring") {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  made.push(id);
  // active: true directly — startOfferCheckout requires an active offer, and
  // nothing reads the row between insert and the checkout call, so the
  // insert-inactive-then-flip-active dance a copied fixture would do here is
  // pure noise.
  const { error } = await db.from("offers").insert({
    id,
    store_id: await getStoreId(),
    key: `zz-intent-${id}`,
    name: "zz intent fixture",
    grant_type: "subscription",
    grant_app_id: APP,
    grant_entitlement_key: "content-engine",
    grant_channels: [],
    billing_type: billing,
    interval: billing === "recurring" ? "month" : null,
    trial_days: billing === "recurring" ? 7 : null,
    price_cents: 4700,
    currency: "usd",
    headline: "fixture",
    description: "fixture",
    active: true,
  });
  if (error) throw new Error(`fixture offer: ${error.message}`);
  return id;
}

async function member() {
  const db = createServiceClient();
  const email = `intent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.test`;
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  const userId = created.data.user!.id;
  users.push(userId);
  await db.from("users").insert({ id: userId, store_id: await getStoreId(), email });
  return { userId, email };
}

describe.skipIf(!canRun)("which intent an offer checkout opens (integration)", () => {
  it("charges a one-time offer on-session", async () => {
    const { userId, email } = await member();
    const offerId = await offerOf("one_time");
    const res = await startOfferCheckout({ userId, email, offerId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("payment");
    expect(res.clientSecret.startsWith("pi_")).toBe(true);
  });

  it("still saves a card for a trial, because $0 cannot be a payment", async () => {
    const { userId, email } = await member();
    const offerId = await offerOf("recurring");
    const res = await startOfferCheckout({ userId, email, offerId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("setup");
    expect(res.clientSecret.startsWith("seti_")).toBe(true);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of made) await db.from("offers").delete().eq("id", id);
  for (const id of users) {
    await db.from("ownership").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
});
