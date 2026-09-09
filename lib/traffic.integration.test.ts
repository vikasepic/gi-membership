import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import {
  bumpPageCountOrThrow,
  pageCountsSince,
  paidByProduct,
  paidByOffer,
  productNames,
  recordOtoPageHit,
  todayUtc,
} from "@/lib/traffic";
import { rangeOf } from "@/lib/traffic-funnel";

// recordOtoPageHit -> recordPageHit reads next/headers, which throws outside
// a real request ("headers was called outside a request scope") — why every
// OTHER test in this file calls bumpPageCountOrThrow directly instead. This
// one has to go through recordOtoPageHit itself, since that is where the
// host-offer fallback under test lives, so it feeds headers() a fixture.
// cookies() — used by lib/supabase/server.ts's createClient, never by the
// createServiceClient this file uses — passes through the real module
// untouched.
vi.mock("next/headers", async (orig) => ({
  ...(await orig<typeof import("next/headers")>()),
  headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (vitest fixture)" }),
}));

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!canRun)("counting page views (integration)", () => {
  beforeEach(async () => {
    const db = createServiceClient();
    await db.from("page_counts").delete().eq("store_id", await getStoreId());
  });

  it("counts a view", async () => {
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    const rows = await pageCountsSince(rangeOf("7", todayUtc()));
    expect(rows).toContainEqual(
      expect.objectContaining({ path: "/p/thing", source: "meta", product: "thing", hits: 1 }),
    );
  });

  it("increments rather than adding a second row", async () => {
    // The whole point of doing it in one statement: a read-then-write would
    // lose one of two visitors arriving together.
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    const rows = (await pageCountsSince(rangeOf("7", todayUtc()))).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBe(3);
  });

  it("keeps sources apart on the same page", async () => {
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    await bumpPageCountOrThrow("/p/thing", "direct", "thing");
    const rows = (await pageCountsSince(rangeOf("7", todayUtc()))).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(2);
  });

  it("keeps two products' checkouts apart", async () => {
    // The reason the column exists. Before it, both of these were the row
    // "/checkout" and there was no way to know whose checkout it was.
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    await bumpPageCountOrThrow("/checkout", "meta", "carousels");
    const rows = (await pageCountsSince(rangeOf("7", todayUtc()))).filter((r) => r.path === "/checkout");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.product).sort()).toEqual(["carousels", "validator"]);
  });

  it("still increments now the key has five columns", async () => {
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    const rows = (await pageCountsSince(rangeOf("7", todayUtc()))).filter((r) => r.path === "/checkout");
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBe(2);
  });

  it("returns nothing rather than throwing when there is no traffic", async () => {
    expect(await pageCountsSince(rangeOf("7", todayUtc()))).toEqual([]);
  });

  it("names the store's products", async () => {
    const names = await productNames();
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      expect(typeof n.slug).toBe("string");
      expect(typeof n.title).toBe("string");
    }
  });

  it("counts the live paid order and not the test-mode one", async () => {
    // The shape assertion this replaces could not fail: `paidByProduct`
    // catches its own errors and returns [], which is an array whose zero
    // rows all pass a per-row type check. Two test-mode paid orders sit in
    // the production table, so the livemode filter is the thing worth
    // pinning, and it needs fixtures of its own to pin it.
    const db = createServiceClient();
    const store = await getStoreId();
    const { data: product } = await db
      .from("products")
      .select("id, slug")
      .eq("store_id", store)
      .limit(1)
      .single();
    expect(product).toBeTruthy();

    const live = crypto.randomUUID();
    const test = crypto.randomUUID();
    const countFor = async () =>
      (await paidByProduct(rangeOf("90", todayUtc()))).find((b) => b.product === product!.slug)?.orders ?? 0;

    // A delta, not an absolute: the seed's own orders are not this test's to
    // pin down, but the number of ITS OWN orders that get counted is.
    const before = await countFor();
    try {
      await db.from("orders").insert([
        { id: live, store_id: store, email: "live@example.com", status: "paid", total_cents: 100, livemode: true },
        { id: test, store_id: store, email: "test@example.com", status: "paid", total_cents: 100, livemode: false },
      ]);
      await db.from("order_items").insert(
        [live, test].map((order_id) => ({
          store_id: store,
          order_id,
          kind: "product",
          product_id: product!.id,
          description: "fixture",
          amount_cents: 100,
        })),
      );

      expect(await countFor()).toBe(before + 1);
    } finally {
      // order_items cascades on the order, but delete it explicitly so a
      // failed orders insert cannot leave items behind either.
      await db.from("order_items").delete().in("order_id", [live, test]);
      await db.from("orders").delete().in("id", [live, test]);
    }
  });
});

describe.skipIf(!canRun)("what an offer sold (integration)", () => {
  const KEY = `zz-paidbyoffer-${Date.now()}`;
  const made: { orders: string[]; offerId: string; userId: string } = {
    orders: [],
    offerId: "",
    userId: "",
  };

  beforeAll(async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();

    // grant_type: "product" requires grant_product_id (offers_check) — an
    // existing product from the seed, same as this file's other fixture
    // (below) already leans on one existing. Not this fixture's to create.
    const { data: product } = await db
      .from("products")
      .select("id")
      .eq("store_id", storeId)
      .limit(1)
      .single();
    if (!product) throw new Error("offer fixture: no product to grant");

    const { data: offer, error: offerErr } = await db
      .from("offers")
      .insert({
        store_id: storeId,
        key: KEY,
        name: "Paid-by-offer fixture",
        grant_type: "product",
        grant_product_id: product.id,
        billing_type: "one_time",
        price_cents: 1000,
        headline: "Fixture",
      })
      .select("id")
      .single();
    if (offerErr) throw new Error(`offer fixture: ${offerErr.message}`);
    made.offerId = offer!.id as string;

    made.userId = randomUUID();
    const { error: userErr } = await db
      .from("users")
      .insert({ id: made.userId, store_id: storeId, email: `${KEY}@example.com`, username: KEY });
    if (userErr) throw new Error(`user fixture: ${userErr.message}`);

    const order = async (created: string, livemode: boolean, host: string | null) => {
      const { data, error } = await db
        .from("orders")
        .insert({
          store_id: storeId,
          user_id: made.userId,
          email: `${KEY}@example.com`,
          status: "paid",
          currency: "usd",
          subtotal_cents: 1000,
          total_cents: 1000,
          livemode,
          host_offer_id: host,
          created_at: created,
        })
        .select("id")
        .single();
      if (error) throw new Error(`order fixture: ${error.message}`);
      made.orders.push(data!.id as string);
    };

    // The window under test is 2026-05-10 .. 2026-05-12, inclusive.
    await order("2026-05-10T00:00:00.000Z", true, made.offerId); // first midnight — counts
    await order("2026-05-12T23:59:59.000Z", true, made.offerId); // last day, late — counts
    await order("2026-05-09T23:59:59.000Z", true, made.offerId); // a second early — out
    await order("2026-05-13T00:00:00.000Z", true, made.offerId); // next midnight — out
    await order("2026-05-11T00:00:00.000Z", false, made.offerId); // test mode — out
    await order("2026-05-11T00:00:00.000Z", true, null); // a product order — out
  });

  afterAll(async () => {
    const db = createServiceClient();
    // Orders reference the user and the offer, so they go first or the FKs
    // block the rest and every row is left behind for the next run.
    for (const id of made.orders) await db.from("orders").delete().eq("id", id);
    if (made.userId) await db.from("users").delete().eq("id", made.userId);
    if (made.offerId) await db.from("offers").delete().eq("id", made.offerId);
    // recordOtoPageHit's own row, filed under this fixture's zz- key — no
    // other suite could produce one.
    await db.from("page_counts").delete().eq("product", KEY);
  });

  it("files an offer-originated upsell view under the host offer, not an empty product", async () => {
    // T1: orderFunnelKey resolves the order's BASE PRODUCT first. This order
    // has no such order_items row, so before the host_offer_id fallback
    // existed the hit was written with product "" and belonged to no funnel
    // at all — 24 such rows were sitting in production on 9 Sep 2026. A
    // source-reading test could only check that `host_offer_id` and
    // `orderFunnelKey` appear somewhere in lib/traffic.ts, and both still
    // would with the fallback deleted, because paidByOffer also names them.
    // This calls the real function against the real database instead.
    await recordOtoPageHit(made.orders[0]);
    const today = todayUtc();
    const rows = await pageCountsSince({ start: today, end: today });
    const row = rows.find((r) => r.path === "/checkout/oto" && r.product === KEY);
    expect(row?.hits).toBeGreaterThan(0);
  });

  it("counts an offer's own sales, once per order, live mode only", async () => {
    // The fourth step of an offer's funnel. An offer sold on its own page and
    // one taken as an upsell write the same order_items kind, so this counts
    // the order's host_offer_id instead.
    const rows = await paidByOffer({ start: "2026-05-10", end: "2026-05-12" });
    expect(rows.find((r) => r.product === KEY)?.orders).toBe(2);
  });

  it("counts nothing for a window the orders miss entirely", async () => {
    const rows = await paidByOffer({ start: "2026-06-01", end: "2026-06-30" });
    expect(rows.find((r) => r.product === KEY)).toBeUndefined();
  });
});
