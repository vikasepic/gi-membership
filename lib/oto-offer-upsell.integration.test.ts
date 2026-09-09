import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Real Postgres. Skips without a service-role key — a public URL cannot write.
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * An offer's own checkout can carry an upsell now (0072), the same way a
 * product's always could. Several things had to keep working together for
 * that:
 *
 *  - resolveOtoForOfferOrder must resolve the slot from `offers.upsell_offer_id`
 *    straight from the order id completeOfferCheckout hands back — including
 *    for a RECURRING host offer, whose order carries no Stripe intent id at
 *    all (neither stripe_payment_intent_id nor stripe_setup_intent_id — see
 *    completeOfferCheckout's own comment on why the latter is never written).
 *    That is the case an intent-id lookup could never have reached, and it is
 *    the whole point of this feature: it is what distinguishes an upsell from
 *    a bump.
 *  - resolveOtoForOrder must keep resolving a PRODUCT's slot exactly as
 *    before — untouched by any of the above.
 *  - An offer-checkout order that has gone on to ACCEPT an upsell holds two
 *    order_items rows of `kind: "oto"` (its own purchase, and the accepted
 *    upsell — both booked that way, see completeOfferCheckout and acceptOto
 *    in lib/checkout.ts). upsellPricesFor has to keep identifying the HOST as
 *    the earliest of the two, not just "an oto row on this order".
 *  - A bounce out of the OTO page belongs on /library for an offer-checkout
 *    order, never on a product's thank-you page — INCLUDING a recurring
 *    product order, which writes no order_items row at all (a pre-existing,
 *    separate gap) and so reads exactly like an offer-checkout order unless
 *    otoBounceHref also checks stripe_setup_intent_id.
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
const { resolveOtoForOrder, resolveOtoForOfferOrder, upsellPricesFor, otoBounceHref } =
  await import("@/lib/checkout");

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
const HOST_OFFER_RECURRING = ID("0c"); // RECURRING host — the case C1 exists to fix
const ORDER_OFFER_RECURRING = ID("0d"); // its order: no PI, no SI, exactly like completeOfferCheckout writes one
const ORDER_PRODUCT_RECURRING = ID("0e"); // recurring PRODUCT order: SI set, no order_items row at all
const PI_OFFER = "pi_oto_offer_upsell_test_offer";
const PI_PRODUCT = "pi_oto_offer_upsell_test_product";
const SI_PRODUCT_RECURRING = "seti_oto_offer_upsell_test_product_recurring";

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

  // The RECURRING host — C1's own fixture. Shares UPSELL_OFFER with the
  // one-time host above; nothing stops two placements pointing at the same
  // upsell, and it saves seeding a second one.
  must(
    "recurring host offer",
    await db.from("offers").upsert(
      {
        id: HOST_OFFER_RECURRING, store_id, key: "upsell-test-host-recurring", name: "Recurring host offer",
        grant_type: "product", grant_product_id: GRANTED_HOST,
        billing_type: "recurring", interval: "month", interval_count: 1,
        price_cents: 3900, currency: "usd",
        headline: "Recurring host", accept_label: "Yes", active: true,
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

  // C1's own fixture: NEITHER stripe_payment_intent_id NOR stripe_setup_intent_id
  // — both omitted entirely, exactly how completeOfferCheckout actually writes
  // a recurring offer's order (see its own comment on why the latter is never
  // set). No intentId, real or fake, would ever find this row via
  // resolveOtoForOrder's `.or(...)` match; resolveOtoForOfferOrder does not
  // need one.
  must(
    `order ${ORDER_OFFER_RECURRING}`,
    await db.from("orders").upsert(
      { id: ORDER_OFFER_RECURRING, store_id, user_id: USER, email: "upsell-test@example.com", status: "paid", currency: "usd", subtotal_cents: 3900, total_cents: 3900 },
      { onConflict: "id" },
    ),
  );

  // C2's own fixture: stripe_setup_intent_id SET (a recurring product order
  // always has one — createCheckoutIntent's recurring branch writes it) and
  // NO order_items row of any kind — that insert lives only in the ONE-TIME
  // branch, a pre-existing gap this fixture reproduces rather than works
  // around.
  must(
    `order ${ORDER_PRODUCT_RECURRING}`,
    await db.from("orders").upsert(
      {
        id: ORDER_PRODUCT_RECURRING, store_id, user_id: USER, email: "upsell-test@example.com",
        status: "paid", currency: "usd", subtotal_cents: 1900, total_cents: 1900,
        stripe_setup_intent_id: SI_PRODUCT_RECURRING,
      },
      { onConflict: "id" },
    ),
  );

  must(
    "host oto line (order with no accepted upsell)",
    await db.from("order_items").insert({ store_id, order_id: ORDER_OFFER, kind: "oto", offer_id: HOST_OFFER, description: "Host offer", amount_cents: 4700 }),
  );

  // The RECURRING host's own purchase line — what completeOfferCheckout
  // itself writes on the success path this task fixes.
  must(
    "recurring host oto line",
    await db.from("order_items").insert({ store_id, order_id: ORDER_OFFER_RECURRING, kind: "oto", offer_id: HOST_OFFER_RECURRING, description: "Recurring host offer", amount_cents: 3900 }),
  );

  // The trap this task called out by name: two "oto" rows on one order, and
  // whether hostOfferIdFor's `.order("created_at")` is load-bearing or just
  // decorative. The UPSELL row is inserted FIRST here — backwards from how a
  // real purchase-then-accept sequence would ever happen — with the HOST's
  // own created_at explicitly backdated a full minute BEFORE it. If
  // hostOfferIdFor's `.order("created_at", { ascending: true })` were ever
  // deleted, an unordered `limit(1)` would be far more likely to hand back
  // whichever row was inserted first (this table's default scan order) — the
  // upsell, wrongly — so this fixture is what makes the ordering assertion
  // below actually depend on the ORDER BY, not pass by an accident of
  // insertion order the way inserting the host row first (as this fixture
  // used to) would let it.
  must(
    "accepted-upsell oto line",
    await db.from("order_items").insert({
      store_id, order_id: ORDER_OFFER_ACCEPTED, kind: "oto", offer_id: UPSELL_OFFER,
      description: "Upsell offer", amount_cents: 2900,
      created_at: new Date().toISOString(),
    }),
  );
  must(
    "host oto line (order WITH an accepted upsell)",
    await db.from("order_items").insert({
      store_id, order_id: ORDER_OFFER_ACCEPTED, kind: "oto", offer_id: HOST_OFFER,
      description: "Host offer", amount_cents: 4700,
      created_at: new Date(Date.now() - 60_000).toISOString(),
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
  const ORDERS = [ORDER_OFFER, ORDER_OFFER_ACCEPTED, ORDER_PRODUCT, ORDER_OFFER_RECURRING, ORDER_PRODUCT_RECURRING];
  await db.from("oto_tokens").delete().in("order_id", ORDERS);
  await db.from("order_items").delete().in("order_id", ORDERS);
  await db.from("orders").delete().in("id", ORDERS);
  // Null the cross-references before deleting either side. offers_upsell_not_self
  // is a CHECK (`upsell_offer_id is null or upsell_offer_id <> id`, 0072) — it
  // fires on insert/update against a self-reference, and has nothing to do
  // with deletion at all. What IS "on delete set null" is the upsell_offer_id
  // FOREIGN KEY itself, on both offers (0072) and products (0001) — so this
  // cleanup would eventually resolve those references on its own even without
  // nulling them here. Nulling explicitly first just means cleanup never
  // depends on FK cascade ordering across a multi-id DELETE, matching every
  // sibling fixture in this suite.
  await db.from("offers").update({ upsell_offer_id: null }).eq("id", HOST_OFFER);
  await db.from("offers").update({ upsell_offer_id: null }).eq("id", HOST_OFFER_RECURRING);
  await db.from("products").update({ upsell_offer_id: null }).eq("id", PRODUCT);
  await db.from("offer_prices").delete().eq("offer_id", UPSELL_OFFER);
  await db.from("offers").delete().in("id", [HOST_OFFER, HOST_OFFER_RECURRING, UPSELL_OFFER, PRODUCT_UPSELL_OFFER]);
  await db.from("products").delete().in("id", [GRANTED_HOST, GRANTED_UPSELL, PRODUCT, GRANTED_PRODUCT_UPSELL]);
  await db.from("users").delete().eq("id", USER);
});

describe.skipIf(!canRun)("an offer's own checkout can carry an upsell", () => {
  it("resolves an upsell straight from the order id, for the HOST OFFER's own slot", async () => {
    expect(await resolveOtoForOfferOrder(ORDER_OFFER)).toBeTruthy();
  });

  it("still resolves a PRODUCT's own slot via resolveOtoForOrder, unchanged", async () => {
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

  // -------------------------------------------------------------------------
  // CRITICAL 1 — a recurring host offer's upsell. Proven broken before this
  // task: resolveOtoForOrder can only find an order by matching an intent id
  // against stripe_payment_intent_id/stripe_setup_intent_id, and a recurring
  // offer's order carries neither (see ORDER_OFFER_RECURRING's own fixture
  // comment above). resolveOtoForOfferOrder resolves it from the order id
  // instead, which completeOfferCheckout always has, intent id or not.
  // -------------------------------------------------------------------------
  describe("a RECURRING host offer's upsell (the case that was broken)", () => {
    it("resolves straight from the order id — no PaymentIntent, no SetupIntent, no Stripe call at all", async () => {
      expect(await resolveOtoForOfferOrder(ORDER_OFFER_RECURRING)).toBeTruthy();
    });

    it("the OLD mechanism genuinely cannot find this order — pins WHY resolveOtoForOfferOrder had to exist", async () => {
      // Not a fake/unlucky id: THIS order was never given an intent id to
      // match in the first place (see its own fixture comment), so no string
      // passed here — real or invented — could ever succeed. Also guards
      // against reintroducing an offer branch into resolveOtoForOrder, which
      // the product path is the only caller of on purpose.
      for (const k of Object.keys(META)) delete META[k];
      Object.assign(META, { offerId: HOST_OFFER_RECURRING, userId: USER });
      expect(await resolveOtoForOrder("seti_matches_no_order_because_none_was_ever_recorded")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // CRITICAL 2 — a recurring PRODUCT order. Proven broken before this task:
  // otoBounceHref decided "product order" solely by a `product_id`
  // order_items row, and createCheckoutIntent's RECURRING branch writes no
  // order_items row at all (see ORDER_PRODUCT_RECURRING's own fixture
  // comment above) — so it read exactly like an offer-checkout order and
  // bounced to /library instead of thank-you.
  // -------------------------------------------------------------------------
  describe("a RECURRING product order (stripe_setup_intent_id set, no order_items row at all)", () => {
    it("still sends a declined upsell to thank-you, not /library", async () => {
      expect(await otoBounceHref(ORDER_PRODUCT_RECURRING, "declined")).toBe("/checkout/thank-you?oto=declined");
    });

    it("still sends an accepted upsell to thank-you too — /library has no 'accepted' copy for a product buyer", async () => {
      expect(await otoBounceHref(ORDER_PRODUCT_RECURRING, "accepted")).toBe("/checkout/thank-you?oto=accepted");
    });
  });
});
