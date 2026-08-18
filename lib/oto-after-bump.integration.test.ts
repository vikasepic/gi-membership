import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Real Postgres. Skips without a service-role key — a public URL cannot write.
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Does taking the bump cost you the upsell?
 *
 * It did, for every order. `resolveOtoForOrder` returned null the moment the
 * order carried a bump at all — so a store selling one thing as a bump and a
 * completely different thing as an upsell showed the second to nobody who took
 * the first. The buyers most willing to spend were the only ones never asked.
 *
 * The rule is ownership now, and these are the four cases it has to get right.
 * Real rows, because the whole question is what `ownershipFor` counts — and a
 * mock of that would be a test of my opinion about it.
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
const { resolveOtoForOrder } = await import("@/lib/checkout");

// Hex only — "ot" is not a UUID, and Postgres refuses the insert rather
// than telling a test why nothing is there.
const ID = (n: string) => `00000000-0000-0000-0000-00000000e0${n}`;
const USER = ID("01");
const PRODUCT = ID("02"); // what they bought
const GRANTED = ID("03"); // what the upsell hands over
const UPSELL = ID("04"); // the upsell offer
const BUMP = ID("05"); // an unrelated bump offer
const ORDER = ID("06");
const PI = "pi_oto_after_bump_test";

async function ownsTheUpsell(yes: boolean) {
  const db = createServiceClient();
  if (!yes) {
    await db.from("ownership").delete().eq("user_id", USER).eq("product_id", GRANTED);
    return;
  }
  await db.from("ownership").insert({
    store_id: await getStoreId(),
    user_id: USER,
    product_id: GRANTED,
    source: "bump",
    status: "trialing", // the case a naive "is it active" check would sell twice
  });
}

beforeAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  const store_id = await getStoreId();

  const must = <T extends { error: unknown }>(what: string, r: T): T => {
    // A fixture that fails quietly is a test that proves nothing: every case
    // below would pass "returns null" for the wrong reason.
    if (r.error) throw new Error(`${what}: ${JSON.stringify(r.error)}`);
    return r;
  };

  for (const [id, slug, title] of [
    [PRODUCT, "oto-test-base", "Base"],
    [GRANTED, "oto-test-granted", "Granted"],
  ] as const) {
    must(`product ${slug}`, await db.from("products").upsert(
      { id, store_id, slug, title, price_cents: 1900, currency: "usd", status: "published" },
      { onConflict: "id" },
    ));
  }

  for (const [id, key, name] of [
    [UPSELL, "oto-test-upsell", "The upsell"],
    [BUMP, "oto-test-bump", "An unrelated bump"],
  ] as const) {
    must(`offer ${key}`, await db.from("offers").upsert(
      {
        id, store_id, key, name,
        grant_type: "product", grant_product_id: GRANTED,
        billing_type: "one_time", price_cents: 2900, currency: "usd",
        headline: name, accept_label: "Yes", active: true,
      },
      { onConflict: "id" },
    ));
  }

  must("link", await db.from("products").update({ upsell_offer_id: UPSELL, bump_offer_id: BUMP }).eq("id", PRODUCT));
  must("user", await db.from("users").upsert({ id: USER, store_id, email: "oto-test@example.com" }, { onConflict: "id" }));
  must("order", await db.from("orders").upsert(
    {
      id: ORDER, store_id, user_id: USER, email: "oto-test@example.com",
      status: "paid", currency: "usd", subtotal_cents: 1900, total_cents: 1900,
      stripe_payment_intent_id: PI,
    },
    { onConflict: "id" },
  ));
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  await db.from("oto_tokens").delete().eq("order_id", ORDER);
  await db.from("ownership").delete().eq("user_id", USER);
  await db.from("orders").delete().eq("id", ORDER);
  await db.from("products").update({ upsell_offer_id: null, bump_offer_id: null }).eq("id", PRODUCT);
  await db.from("offers").delete().in("id", [UPSELL, BUMP]);
  await db.from("products").delete().in("id", [PRODUCT, GRANTED]);
  await db.from("users").delete().eq("id", USER);
});

describe.skipIf(!canRun)("the upsell after a bump", () => {
  it("shows when no bump was taken", async () => {
    for (const k of Object.keys(META)) delete META[k];
    Object.assign(META, { productId: PRODUCT, userId: USER });
    await ownsTheUpsell(false);
    expect(await resolveOtoForOrder(PI)).toBeTruthy();
  });

  it("shows when a DIFFERENT thing was taken as the bump", async () => {
    // The case that was costing money: an unrelated add-on suppressed the
    // upsell entirely, so the keenest buyers were the only ones never asked.
    for (const k of Object.keys(META)) delete META[k];
    Object.assign(META, { productId: PRODUCT, userId: USER, bumpOfferId: BUMP });
    await ownsTheUpsell(false);
    expect(await resolveOtoForOrder(PI)).toBeTruthy();
  });

  it("does NOT show when the bump was the same thing and they now own it", async () => {
    // Selling one person the same offer twice in ninety seconds.
    for (const k of Object.keys(META)) delete META[k];
    Object.assign(META, { productId: PRODUCT, userId: USER, bumpOfferId: UPSELL });
    await ownsTheUpsell(true);
    expect(await resolveOtoForOrder(PI)).toBeNull();
  });

  it("offers a second chance at the same thing when the bump was declined", async () => {
    // Bump and upsell may deliberately be the same offer. Declining it at the
    // checkout is not owning it, and the second ask is the point of an upsell.
    for (const k of Object.keys(META)) delete META[k];
    Object.assign(META, { productId: PRODUCT, userId: USER });
    await ownsTheUpsell(false);
    expect(await resolveOtoForOrder(PI)).toBeTruthy();
  });

  it("counts a trialing grant as owned", async () => {
    // A bump taken on a free trial is owned. A check that only counted
    // "active" would sell it again at full price a moment later.
    for (const k of Object.keys(META)) delete META[k];
    Object.assign(META, { productId: PRODUCT, userId: USER });
    await ownsTheUpsell(true); // inserted with status "trialing"
    expect(await resolveOtoForOrder(PI)).toBeNull();
  });
});
