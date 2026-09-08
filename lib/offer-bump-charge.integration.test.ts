import { describe, it, expect, afterAll } from "vitest";
import { startOfferCheckout, completeOfferCheckout } from "@/lib/offer-checkout";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { STORE_TAG } from "@/lib/coupons";

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

/**
 * A second price on an existing bump offer, so a test can put one price where
 * the placement points and a different one where it doesn't. Every other
 * fixture in this file gives the bump exactly one price with an empty
 * `bump_price_ids`, where `shownPrices(prices, ids)` and `livePrices(prices)`
 * return the identical list — this is the shape that tells them apart. Same
 * insert shape as `lib/duplicate.integration.test.ts`'s own multi-price
 * fixtures: an explicit id, no reliance on `offer_prices_sync` (that trigger
 * only mirrors the FIRST live price onto `offers`, which already exists).
 */
async function addBumpPrice(offerId: string, cents: number, sortOrder: number): Promise<string> {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  const { error } = await db.from("offer_prices").insert({
    id,
    offer_id: offerId,
    billing_type: "one_time",
    price_cents: cents,
    sort_order: sortOrder,
  });
  if (error) throw new Error(`fixture second price: ${error.message}`);
  return id;
}

/** A flat, fixed-amount code — a clean number to check the arithmetic against. */
async function flatCode(amountOffCents: number) {
  const coupon = await stripe().coupons.create({
    amount_off: amountOffCents,
    currency: "usd",
    duration: "once",
    metadata: { store: STORE_TAG },
  });
  const code = `ZZBUMPCODE${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  await stripe().promotionCodes.create({ promotion: { type: "coupon", coupon: coupon.id }, code });
  return code;
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
    // Readable alongside the id: this account is shared with five other apps,
    // and a bare uuid can't be told apart from theirs in the Stripe dashboard.
    expect(pi.metadata.bumpOfferName).toBe("zz bump-charge fixture");
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

  // Every case above gives the bump exactly ONE price with an empty
  // bump_price_ids — a shape where shownPrices(prices, ids) and
  // livePrices(prices) return the identical list, so a resolution silently
  // swapped from the former to the latter would still pass all four. This is
  // the shape that tells them apart: a SECOND price on the bump offer, with
  // the placement naming only that one.
  it("buys the price the placement named, not any live price on the bump offer", async () => {
    const bumpId = await offerOf(1500); // the bump's own headline price, sort_order 0 — NOT placed here
    const placedId = await addBumpPrice(bumpId, 2900, 1); // the ONLY price this host placed
    const hostId = await offerOf(4700, { bump_offer_id: bumpId, bump_price_ids: [placedId] });
    const { userId, email } = await member();

    // bumpChoice: 0 is the only option shownPrices returns for this
    // placement — the SECOND price on the bump (2900), not its headline
    // (1500). Swap shownPrices(shownBump.prices, offer.bumpPriceIds ?? [])
    // for livePrices(shownBump.prices) and this list becomes both of the
    // bump's prices in the bump's own order, making index 0 the 1500 one — a
    // buyer reaching a price this host never placed.
    const bought = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 0 });
    expect(bought.ok).toBe(true);
    if (bought.ok) {
      const pi = await stripe().paymentIntents.retrieve(bought.clientSecret.split("_secret_")[0]);
      expect(pi.amount).toBe(4700 + 2900);
      expect(pi.metadata.bumpOfferId).toBe(bumpId);
    }

    // bumpChoice: 1 is out of range for what was actually placed — one price
    // — so it refuses. Under the same livePrices swap, the two-item list
    // would make index 1 resolve to the placed price and wrongly succeed.
    const refused = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 1 });
    expect(refused.ok).toBe(false);
  });

  // MINOR 2 regression: a bump can genuinely cost $0 (a free add-on, one-time,
  // price_cents 0) and still be a resolved bump whose "money" — none — is
  // already accounted for in this intent. bumpPrepaid used to be keyed off
  // bumpNowCents > 0, which wrote "" for a free bump exactly like a bump that
  // was never chosen at all — and a later task's fulfilment is meant to read
  // bumpPrepaid === "true" to decide whether to skip its own off-session
  // charge for it.
  it("marks a free bump prepaid too, not just a paid one", async () => {
    const bumpId = await offerOf(0);
    const hostId = await offerOf(4700, { bump_offer_id: bumpId });
    const { userId, email } = await member();

    const res = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const pi = await stripe().paymentIntents.retrieve(res.clientSecret.split("_secret_")[0]);
    expect(pi.amount).toBe(4700); // the free bump adds nothing to the charge
    expect(pi.metadata.bumpOfferId).toBe(bumpId);
    expect(pi.metadata.bumpPrepaid).toBe("true"); // not "" — its $0 is still already "taken"
  });
});

describe.skipIf(!canRun)("completing a bumped offer checkout (integration)", () => {
  it("books a subtotal/discount/total that add up, one line each, two grants, one charge — and a refresh doubles nothing", async () => {
    const bumpId = await offerOf(2900);
    const hostId = await offerOf(4700, { bump_offer_id: bumpId });
    const { userId, email } = await member();

    const start = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 0 });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const piId = start.clientSecret.split("_secret_")[0];

    // One on-session confirmation — the whole point of folding the bump into
    // the host's own intent instead of a second, off-session charge.
    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });

    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });

    const db = createServiceClient();
    const orders = await db
      .from("orders")
      .select("id, subtotal_cents, discount_cents, total_cents")
      .eq("user_id", userId);
    expect(orders.data).toHaveLength(1);
    const order = orders.data![0] as {
      id: string;
      subtotal_cents: number;
      discount_cents: number;
      total_cents: number;
    };

    // THE bug this task exists to fix: before the fix, subtotal_cents booked
    // the host alone (4700) and discount_cents was gross - total (4700 - 7600
    // = -2900) — negative on every bumped purchase, never mind a coupon.
    expect(order.subtotal_cents).toBe(7600); // 4700 host + 2900 bump
    expect(order.discount_cents).toBe(0); // never negative — no coupon here
    expect(order.total_cents).toBe(7600); // what the card was actually charged
    expect(order.subtotal_cents - order.discount_cents).toBe(order.total_cents);

    const items = await db
      .from("order_items")
      .select("kind, amount_cents")
      .eq("order_id", order.id);
    expect(items.data).toHaveLength(2);
    const sum = (items.data ?? []).reduce((s, i) => s + (i.amount_cents as number), 0);
    expect(sum).toBe(order.total_cents); // the two lines add up to what was charged
    const oto = items.data!.find((i) => i.kind === "oto");
    const bump = items.data!.find((i) => i.kind === "bump");
    expect(oto?.amount_cents).toBe(4700); // the host's share alone, not the combined total
    expect(bump?.amount_cents).toBe(2900);

    const own = await db.from("ownership").select("id").eq("user_id", userId);
    expect(own.data).toHaveLength(2); // the host's grant and the bump's, separately

    // Exactly one succeeded PaymentIntent for this purchase — fulfilBump must
    // not have opened a second, off-session charge for a card that (per the
    // global constraint here) may be Indian and refuse one outright.
    const allPis = await stripe().paymentIntents.list({ customer: start.customerId, limit: 10 });
    expect(allPis.data.filter((p) => p.status === "succeeded")).toHaveLength(1);

    // A refresh of the return page (the sequential re-entry the eligibility
    // check guards) must not double the order, its lines, or the grants.
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });
    const ordersAgain = await db.from("orders").select("id").eq("user_id", userId);
    expect(ordersAgain.data).toHaveLength(1);
    const itemsAgain = await db.from("order_items").select("id").eq("order_id", order.id);
    expect(itemsAgain.data).toHaveLength(2);
    const ownAgain = await db.from("ownership").select("id").eq("user_id", userId);
    expect(ownAgain.data).toHaveLength(2);
  });

  // IMPORTANT 2 (fix round 1): fulfilBump used to book the bump's line at
  // immediateChargeCents(getOffer(bumpOfferId)) — the bump's own HEADLINE
  // price — rather than the price this host actually placed it at and
  // charged. Same two-price shape as the "buys the price the placement
  // named" test above, but carried all the way through completion, where the
  // bug actually lived.
  it("books the bump's line at the price the host placed, not the bump's own headline", async () => {
    const bumpId = await offerOf(1500); // the bump's own headline — NOT placed here
    const placedId = await addBumpPrice(bumpId, 2900, 1); // the ONLY price this host placed
    const hostId = await offerOf(4700, { bump_offer_id: bumpId, bump_price_ids: [placedId] });
    const { userId, email } = await member();

    const start = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 0 });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const piId = start.clientSecret.split("_secret_")[0];

    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });

    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("id, total_cents")
      .eq("user_id", userId)
      .single();
    expect(order?.total_cents).toBe(4700 + 2900); // charged the PLACED price, not the 1500 headline

    const { data: items } = await db
      .from("order_items")
      .select("kind, amount_cents")
      .eq("order_id", order!.id as string);
    expect(items).toHaveLength(2);
    const bump = items!.find((i) => i.kind === "bump");
    // THE bug this test exists to catch: booked 1500 (the bump's headline)
    // instead of 2900 (what the placement named and the card was charged).
    expect(bump?.amount_cents).toBe(2900);
    const sum = (items ?? []).reduce((s, i) => s + (i.amount_cents as number), 0);
    expect(sum).toBe(order?.total_cents); // the lines still add up to what was charged
  });

  // IMPORTANT 6 (fix round 1): the one shape where the subtotal/discount
  // arithmetic is non-trivial — a coupon applies to the HOST alone
  // (couponSubtotal/resolveCoupon never see the bump), so the bump's own
  // money must survive untouched next to a discounted host line.
  it("discounts the host alone and still adds up with a bump riding along", async () => {
    const bumpId = await offerOf(2900);
    const hostId = await offerOf(4700, { bump_offer_id: bumpId });
    const { userId, email } = await member();
    const code = await flatCode(1000); // $10 off

    const start = await startOfferCheckout({
      userId,
      email,
      offerId: hostId,
      bumpChoice: 0,
      couponCode: code,
    });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const piId = start.clientSecret.split("_secret_")[0];

    const beforeConfirm = await stripe().paymentIntents.retrieve(piId);
    expect(beforeConfirm.amount).toBe(4700 - 1000 + 2900); // 6600: host discounted, bump untouched

    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });

    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("id, subtotal_cents, discount_cents, total_cents")
      .eq("user_id", userId)
      .single();
    expect(order?.subtotal_cents).toBe(7600); // 4700 host + 2900 bump, undiscounted
    expect(order?.discount_cents).toBe(1000); // the coupon's own figure, off the host alone
    expect(order?.total_cents).toBe(6600);
    expect((order?.subtotal_cents ?? 0) - (order?.discount_cents ?? 0)).toBe(order?.total_cents);

    const { data: items } = await db
      .from("order_items")
      .select("kind, amount_cents")
      .eq("order_id", order!.id as string);
    expect(items).toHaveLength(2);
    const oto = items!.find((i) => i.kind === "oto");
    const bump = items!.find((i) => i.kind === "bump");
    expect(oto?.amount_cents).toBe(3700); // 4700 - 1000 — the discount landed only on the host
    expect(bump?.amount_cents).toBe(2900); // untouched by the coupon
    const sum = (items ?? []).reduce((s, i) => s + (i.amount_cents as number), 0);
    expect(sum).toBe(order?.total_cents);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of users) {
    // orders/order_items reference the user and the offers above; both must
    // go before those FKs are torn down, or the fixture cleanup itself fails
    // and leaves every row behind for the next run to trip over.
    const { data: orders } = await db.from("orders").select("id").eq("user_id", id);
    for (const o of orders ?? []) await db.from("order_items").delete().eq("order_id", o.id as string);
    await db.from("orders").delete().eq("user_id", id);
    await db.from("ownership").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
  for (const id of made) await db.from("offers").update({ bump_offer_id: null }).eq("id", id);
  for (const id of made) await db.from("offers").delete().eq("id", id);
});
