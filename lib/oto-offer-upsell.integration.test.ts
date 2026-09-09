import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Real Postgres. Skips without a service-role key — a public URL cannot write.
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * An offer's own checkout can carry an upsell now (0072), the same way a
 * product's always could. Four things had to keep working together for that:
 *
 *  - resolveOtoForOrder must resolve the slot from `offers.upsell_offer_id`
 *    when the paid intent's metadata carries offerId (the standalone offer
 *    checkout's own shape — startOfferCheckout writes no productId at all),
 *    and must still resolve a PRODUCT's slot exactly as before when it does.
 *  - An offer-checkout order that has gone on to ACCEPT an upsell holds two
 *    order_items rows of `kind: "oto"` (its own purchase, and the accepted
 *    upsell — both booked that way, see completeOfferCheckout and acceptOto
 *    in lib/checkout.ts). upsellPricesFor has to keep identifying the HOST as
 *    the earliest of the two, not just "an oto row on this order".
 *  - A bounce out of the OTO page belongs on /library for that kind of order,
 *    never on a product's thank-you page.
 *
 * Real rows throughout, not mocks of the queries under test — a mock of "does
 * this order have a product line" would only be a test of my own opinion
 * about it.
 */

const META: Record<string, string> = {};
vi.mock("@/lib/stripe", async (orig) => ({
  ...(await orig<typeof import("@/lib/stripe")>()),
  stripe: () => ({
    paymentIntents: { retrieve: async () => ({ metadata: META }) },
    setupIntents: { retrieve: async () => ({ metadata: META }) },
  }),
}));

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { resolveOtoForOrder, upsellPricesFor, otoBounceHref } = await import("@/lib/checkout");

// Namespaced to this migration (0072) so a parallel suite sharing the one
// local store can never pick up one of these rows by accident.
const ID = (n: string) => `00000000-0000-0000-0000-0000000072${n}`;
const USER = ID("01");
const GRANTED_HOST = ID("02"); // what the HOST offer hands over
const GRANTED_UPSELL = ID("03"); // what the UPSELL offer hands over
const HOST_OFFER = ID("04"); // bought through the standalone offer checkout
const UPSELL_OFFER = ID("05"); // its upsell — RECURRING, on purpose (see below)
const PRODUCT = ID("06"); // a product-checkout order, for the unchanged case
const GRANTED_PRODUCT_UPSELL = ID("07");
const PRODUCT_UPSELL_OFFER = ID("08");
const ORDER_OFFER = ID("09"); // offer-checkout order: host line only
const ORDER_OFFER_ACCEPTED = ID("0a"); // offer-checkout order: host + accepted upsell
const ORDER_PRODUCT = ID("0b"); // product-checkout order
const PI_OFFER = "pi_oto_offer_upsell_test_offer";
const PI_PRODUCT = "pi_oto_offer_upsell_test_product";

beforeAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  const store_id = await getStoreId();

  // A fixture that fails quietly proves nothing: every case below would then
  // pass "returns null/empty" for the wrong reason.
  const must = <T extends { error: unknown }>(what: string, r: T): T => {
    if (r.error) throw new Error(`${what}: ${JSON.stringify(r.error)}`);
    return r;
  };

  for (const [id, slug, title] of [
    [GRANTED_HOST, "upsell-test-granted-host", "Granted by host"],
    [GRANTED_UPSELL, "upsell-test-granted-upsell", "Granted by upsell"],
    [PRODUCT, "upsell-test-product", "Base product"],
    [GRANTED_PRODUCT_UPSELL, "upsell-test-granted-product-upsell", "Granted by product's upsell"],
  ] as const) {
    must(
      `product ${slug}`,
      await db
        .from("products")
        .upsert({ id, store_id, slug, title, price_cents: 1900, currency: "usd", status: "published" }, { onConflict: "id" }),
    );
  }

  // Created BEFORE the host: the host's own row references this one via
  // upsell_offer_id, and the FK has nothing to point at otherwise.
  //
  // RECURRING on purpose — this is the case a bump could never allow (see
  // upsellSlotError / offer-upsell-validation.test.ts). offer_prices is
  // seeded explicitly below: startOfferCheckout-style readers (upsellPricesFor
  // included) resolve prices from that table, never from these scalar columns.
  must(
    "upsell offer",
    await db.from("offers").upsert(
      {
        id: UPSELL_OFFER, store_id, key: "upsell-test-upsell", name: "Upsell offer",
        grant_type: "product", grant_product_id: GRANTED_UPSELL,
        billing_type: "recurring", interval: "month", interval_count: 1,
        price_cents: 2900, currency: "usd",
        headline: "Upsell", accept_label: "Yes", active: true,
      },
      { onConflict: "id" },
    ),
  );
  // No stable id to upsert against (and, unlike offers/products, this fixture
  // set never re-runs against a row from a previous pass — afterAll deletes it
  // by offer_id). Plain insert, same as every other offer_prices fixture row
  // in this suite.
  must(
    "upsell offer price",
    await db
      .from("offer_prices")
      .insert({ offer_id: UPSELL_OFFER, billing_type: "recurring", interval: "month", interval_count: 1, price_cents: 2900, sort_order: 0 }),
  );

  must(
    "host offer",
    await db.from("offers").upsert(
      {
        id: HOST_OFFER, store_id, key: "upsell-test-host", name: "Host offer",
        grant_type: "product", grant_product_id: GRANTED_HOST,
        billing_type: "one_time", price_cents: 4700, currency: "usd",
        headline: "Host", accept_label: "Yes", active: true,
        upsell_offer_id: UPSELL_OFFER,
      },
      { onConflict: "id" },
    ),
  );

  must(
    "product's own upsell offer",
    await db.from("offers").upsert(
      {
        id: PRODUCT_UPSELL_OFFER, store_id, key: "upsell-test-product-upsell", name: "Product's upsell",
        grant_type: "product", grant_product_id: GRANTED_PRODUCT_UPSELL,
        billing_type: "one_time", price_cents: 3900, currency: "usd",
        headline: "Product upsell", accept_label: "Yes", active: true,
      },
      { onConflict: "id" },
    ),
  );
  must("link product's own upsell slot", await db.from("products").update({ upsell_offer_id: PRODUCT_UPSELL_OFFER }).eq("id", PRODUCT));

  must("user", await db.from("users").upsert({ id: USER, store_id, email: "upsell-test@example.com" }, { onConflict: "id" }));

  for (const [id, pi, cents] of [
    [ORDER_OFFER, PI_OFFER, 4700],
    [ORDER_PRODUCT, PI_PRODUCT, 1900],
  ] as const) {
    must(
      `order ${id}`,
      await db.from("orders").upsert(
        {
          id, store_id, user_id: USER, email: "upsell-test@example.com",
          status: "paid", currency: "usd", subtotal_cents: cents, total_cents: cents,
          stripe_payment_intent_id: pi,
        },
        { onConflict: "id" },
      ),
    );
  }
  // No Stripe intent at all — otoBounceHref never needs one, and this order
  // exists purely to hold the two "oto" lines below.
  must(
    `order ${ORDER_OFFER_ACCEPTED}`,
    await db.from("orders").upsert(
      { id: ORDER_OFFER_ACCEPTED, store_id, user_id: USER, email: "upsell-test@example.com", status: "paid", currency: "usd", subtotal_cents: 4700, total_cents: 4700 },
      { onConflict: "id" },
    ),
  );

  must(
    "host oto line (order with no accepted upsell)",
    await db.from("order_items").insert({ store_id, order_id: ORDER_OFFER, kind: "oto", offer_id: HOST_OFFER, description: "Host offer", amount_cents: 4700 }),
  );

  // The trap this task called out by name: two "oto" rows on one order.
  // Explicit created_at, a full minute apart, so the ordering this test
  // proves cannot pass by an accident of insert timing.
  must(
    "host oto line (order WITH an accepted upsell)",
    await db.from("order_items").insert({
      store_id, order_id: ORDER_OFFER_ACCEPTED, kind: "oto", offer_id: HOST_OFFER,
      description: "Host offer", amount_cents: 4700,
      created_at: new Date(Date.now() - 60_000).toISOString(),
    }),
  );
  must(
    "accepted-upsell oto line",
    await db.from("order_items").insert({
      store_id, order_id: ORDER_OFFER_ACCEPTED, kind: "oto", offer_id: UPSELL_OFFER,
      description: "Upsell offer", amount_cents: 2900,
      created_at: new Date().toISOString(),
    }),
  );

  must(
    "product line",
    await db.from("order_items").insert({ store_id, order_id: ORDER_PRODUCT, kind: "product", product_id: PRODUCT, description: "Base product", amount_cents: 1900 }),
  );
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  await db.from("oto_tokens").delete().in("order_id", [ORDER_OFFER, ORDER_OFFER_ACCEPTED, ORDER_PRODUCT]);
  await db.from("order_items").delete().in("order_id", [ORDER_OFFER, ORDER_OFFER_ACCEPTED, ORDER_PRODUCT]);
  await db.from("orders").delete().in("id", [ORDER_OFFER, ORDER_OFFER_ACCEPTED, ORDER_PRODUCT]);
  // Null the cross-references before deleting either side — offers_upsell_not_self
  // and the products FK are both ON DELETE SET NULL, but nulling explicitly
  // means cleanup never depends on that, matching every sibling fixture here.
  await db.from("offers").update({ upsell_offer_id: null }).eq("id", HOST_OFFER);
  await db.from("products").update({ upsell_offer_id: null }).eq("id", PRODUCT);
  await db.from("offer_prices").delete().eq("offer_id", UPSELL_OFFER);
  await db.from("offers").delete().in("id", [HOST_OFFER, UPSELL_OFFER, PRODUCT_UPSELL_OFFER]);
  await db.from("products").delete().in("id", [GRANTED_HOST, GRANTED_UPSELL, PRODUCT, GRANTED_PRODUCT_UPSELL]);
  await db.from("users").delete().eq("id", USER);
});

describe.skipIf(!canRun)("an offer's own checkout can carry an upsell", () => {
  it("resolves an upsell token from the HOST OFFER's own slot", async () => {
    for (const k of Object.keys(META)) delete META[k];
    Object.assign(META, { offerId: HOST_OFFER, userId: USER }); // no productId — the offer-checkout shape
    expect(await resolveOtoForOrder(PI_OFFER)).toBeTruthy();
  });

  it("still resolves a PRODUCT's own slot, unchanged", async () => {
    for (const k of Object.keys(META)) delete META[k];
    Object.assign(META, { productId: PRODUCT, userId: USER }); // no offerId — the product-checkout shape
    expect(await resolveOtoForOrder(PI_PRODUCT)).toBeTruthy();
  });

  it("identifies the HOST as the EARLIEST oto line, not just any line of that kind", async () => {
    // If this instead picked the accepted upsell's own row (UPSELL_OFFER,
    // which has no upsell_offer_id of its own), the result would be empty —
    // so a wrong pick here fails closed rather than passing by coincidence.
    const prices = await upsellPricesFor(ORDER_OFFER_ACCEPTED);
    expect(prices).toHaveLength(1);
    expect(prices[0].priceCents).toBe(2900); // UPSELL_OFFER's own price
  });

  it("sends a declined upsell on an offer-checkout order to /library", async () => {
    expect(await otoBounceHref(ORDER_OFFER, "declined")).toBe("/library?offer=declined");
  });

  it("sends a declined upsell on a product-checkout order to thank-you, unchanged", async () => {
    expect(await otoBounceHref(ORDER_PRODUCT, "declined")).toBe("/checkout/thank-you?oto=declined");
  });

  it("defaults to thank-you when no order is known at all", async () => {
    expect(await otoBounceHref(null)).toBe("/checkout/thank-you");
  });
});
