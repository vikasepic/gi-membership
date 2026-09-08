import { describe, it, expect, afterAll } from "vitest";
import { startOfferCheckout } from "@/lib/offer-checkout";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];
const users: string[] = [];

async function offerOf(cents: number, extra: Record<string, unknown> = {}) {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  made.push(id);
  const { error } = await db.from("offers").insert({
    id,
    store_id: await getStoreId(),
    key: `zz-bc-${id}`,
    name: "zz bump-charge fixture",
    grant_type: "subscription",
    grant_app_id: APP,
    grant_entitlement_key: "content-engine",
    grant_channels: [],
    billing_type: "one_time",
    price_cents: cents,
    currency: "usd",
    headline: "fixture",
    description: "fixture",
    ...extra,
  });
  if (error) throw new Error(`fixture: ${error.message}`);
  // getOffer's `.prices` (what shownPrices/priceForChoice actually read) come
  // from offer_prices — nothing syncs backwards from the scalar columns above,
  // only offer_prices -> offers (0048's trigger). Without this row the bump
  // offer shows no ways to pay and bumpChoice: 0 refuses one that should be
  // buyable. Mirrors whatever `extra` put on the row above, so the sync
  // trigger finds nothing to correct.
  const billing_type = (extra.billing_type as string | undefined) ?? "one_time";
  const { error: priceErr } = await db.from("offer_prices").insert({
    offer_id: id,
    billing_type,
    interval: (extra.interval as string | undefined) ?? null,
    interval_count: (extra.interval_count as number | undefined) ?? 1,
    trial_days: (extra.trial_days as number | null | undefined) ?? null,
    price_cents: cents,
    sort_order: 0,
  });
  if (priceErr) throw new Error(`fixture price: ${priceErr.message}`);
  return id;
}

async function member() {
  const db = createServiceClient();
  const email = `bc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.test`;
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  const userId = created.data.user!.id;
  users.push(userId);
  await db.from("users").insert({ id: userId, store_id: await getStoreId(), email });
  return { userId, email };
}

describe.skipIf(!canRun)("a bump on an offer's checkout (integration)", () => {
  it("authorises ONE payment for both", async () => {
    const bumpId = await offerOf(2900);
    const hostId = await offerOf(4700, { bump_offer_id: bumpId });
    const { userId, email } = await member();

    const res = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const pi = await stripe().paymentIntents.retrieve(res.clientSecret.split("_secret_")[0]);
    expect(pi.amount).toBe(7600);
    expect(pi.metadata.bumpOfferId).toBe(bumpId);
    expect(pi.metadata.bumpPrepaid).toBe("true");
  });

  it("charges the offer alone when the bump is declined", async () => {
    const bumpId = await offerOf(2900);
    const hostId = await offerOf(4700, { bump_offer_id: bumpId });
    const { userId, email } = await member();

    const res = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: "none" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const pi = await stripe().paymentIntents.retrieve(res.clientSecret.split("_secret_")[0]);
    expect(pi.amount).toBe(4700);
    expect(pi.metadata.bumpOfferId).toBe("");
  });

  it("refuses an index that names nothing rather than charging the headline price", async () => {
    const bumpId = await offerOf(2900);
    const hostId = await offerOf(4700, { bump_offer_id: bumpId });
    const { userId, email } = await member();
    const res = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 9 });
    expect(res.ok).toBe(false);
  });

  // Beyond the brief's three: a recurring host opens a SetupIntent, which
  // moves no money today, so a one-time bump has no on-session charge to ride
  // — the same "refuse rather than silently drop" rule the brief states for
  // an unowned or unsellable bump applies here too, before any card is saved.
  it("refuses a bump on a host that won't produce a chargeable intent for it", async () => {
    const bumpId = await offerOf(2900);
    const hostId = await offerOf(4700, {
      bump_offer_id: bumpId,
      billing_type: "recurring",
      interval: "month",
      interval_count: 1,
      trial_days: 7,
    });
    const { userId, email } = await member();
    const res = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 0 });
    expect(res.ok).toBe(false);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of users) {
    await db.from("ownership").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
  for (const id of made) await db.from("offers").update({ bump_offer_id: null }).eq("id", id);
  for (const id of made) await db.from("offers").delete().eq("id", id);
});
