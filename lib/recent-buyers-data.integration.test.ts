import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * What the recent buyers popup is allowed to read. Every exclusion here is a
 * card that would otherwise name the wrong person: a refund, a test payment, a
 * renewal posing as a new buyer, the owner, someone who asked to be hidden.
 */

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { loadPurchaseRows } = await import("@/lib/recent-buyers-data");

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const tag = `zz-rb-${Date.now()}`;
const users: string[] = [];
const offers: string[] = [];
const products: string[] = [];
let storeId = "";

describe.skipIf(!canRun)("loading recent buyers (integration)", () => {
  const db = () => createServiceClient();
  let n = 0;

  async function buyer(over: { username?: string; country?: string | null; isAdmin?: boolean; hidden?: boolean } = {}) {
    n += 1;
    const email = `${tag}-${n}@example.com`;
    const created = await db().auth.admin.createUser({ email, password: "password12345", email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const id = created.data.user.id;
    users.push(id);
    const { error } = await db().from("users").insert({
      id,
      store_id: storeId,
      email,
      username: over.username ?? `Buyer${n} Zz`,
      country: over.country ?? null,
      is_admin: over.isAdmin ?? false,
      hide_from_recent_buyers: over.hidden ?? false,
    });
    if (error) throw new Error(`fixture user: ${error.message}`);
    return id;
  }

  async function product(over: { show?: boolean; status?: string } = {}) {
    const { data, error } = await db()
      .from("products")
      .insert({
        store_id: storeId,
        slug: `${tag}-p${products.length}`,
        title: `${tag} course`,
        price_cents: 2900,
        status: over.status ?? "published",
        show_recent_buyers: over.show ?? true,
        cover_path: "library/zz-cover.webp",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`fixture product: ${error?.message}`);
    products.push(data.id);
    return data.id as string;
  }

  async function offer(over: { show?: boolean; active?: boolean; grantProductId?: string; interval?: string; name?: string } = {}) {
    const { data, error } = await db()
      .from("offers")
      .insert({
        store_id: storeId,
        key: `${tag}-o${offers.length}`,
        name: over.name ?? `${tag} offer ${offers.length}`,
        headline: "zz",
        grant_type: over.grantProductId ? "product" : "course",
        grant_product_id: over.grantProductId ?? null,
        billing_type: over.interval ? "recurring" : "one_time",
        interval: over.interval ?? null,
        price_cents: 2900,
        active: over.active ?? true,
        show_recent_buyers: over.show ?? true,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`fixture offer: ${error?.message}`);
    offers.push(data.id);
    return data.id as string;
  }

  async function order(
    userId: string,
    item: { kind: "product" | "bump" | "oto" | "renewal"; offerId?: string; productId?: string },
    over: { status?: string; livemode?: boolean; invoice?: boolean; country?: string | null; orderPi?: string; itemPi?: string } = {},
  ) {
    const { data, error } = await db()
      .from("orders")
      .insert({
        store_id: storeId,
        user_id: userId,
        email: `${tag}@example.com`,
        status: over.status ?? "paid",
        livemode: over.livemode ?? true,
        total_cents: 2900,
        subtotal_cents: 2900,
        currency: "usd",
        buyer_country: over.country ?? null,
        stripe_invoice_id: over.invoice ? `in_${tag}_${n}` : null,
        stripe_payment_intent_id: over.orderPi ?? null,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`fixture order: ${error?.message}`);
    const res = await db().from("order_items").insert({
      store_id: storeId,
      order_id: data.id,
      kind: item.kind,
      offer_id: item.offerId ?? null,
      product_id: item.productId ?? null,
      description: tag,
      amount_cents: 2900,
      stripe_payment_intent_id: over.itemPi ?? null,
    });
    if (res.error) throw new Error(`fixture item: ${res.error.message}`);
  }

  const mine = async () => (await loadPurchaseRows(new Date())).filter((r) => users.includes(r.userId));

  beforeAll(async () => {
    storeId = await getStoreId();
  });

  it("reads a paid, live first purchase with its name, country and picture", async () => {
    const p = await product();
    const u = await buyer({ username: "Priya Zz", country: "GB" });
    await order(u, { kind: "product", productId: p }, { country: "IN" });
    const rows = (await mine()).filter((r) => r.userId === u);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ username: "Priya Zz", country: "IN", productId: p, itemKind: "product", verb: "enrolled in" });
    expect(rows[0].imageUrl).toContain("library/zz-cover.webp");
  });

  it("falls back to the member's country when the order has none", async () => {
    const p = await product();
    const u = await buyer({ country: "DE" });
    await order(u, { kind: "product", productId: p });
    expect((await mine()).find((r) => r.userId === u)?.country).toBe("DE");
  });

  it("leaves out refunds, test payments and renewals", async () => {
    const o = await offer();
    const refunded = await buyer();
    const test = await buyer();
    const renewing = await buyer();
    await order(refunded, { kind: "oto", offerId: o }, { status: "refunded" });
    await order(test, { kind: "oto", offerId: o }, { livemode: false });
    // Kind "oto", not "renewal": only the invoice may keep it out, which is the rule under test.
    await order(renewing, { kind: "oto", offerId: o }, { invoice: true });
    const ids = (await mine()).map((r) => r.userId);
    expect(ids).not.toContain(refunded);
    expect(ids).not.toContain(test);
    expect(ids).not.toContain(renewing);
  });

  it("leaves out admins and members hidden from recent buyers", async () => {
    const o = await offer();
    const admin = await buyer({ isAdmin: true });
    const hidden = await buyer({ hidden: true });
    await order(admin, { kind: "oto", offerId: o });
    await order(hidden, { kind: "oto", offerId: o });
    const ids = (await mine()).map((r) => r.userId);
    expect(ids).not.toContain(admin);
    expect(ids).not.toContain(hidden);
  });

  it("leaves out items switched off, offers no longer active and unpublished products", async () => {
    const off = await offer({ show: false });
    const inactive = await offer({ active: false });
    const draft = await product({ status: "draft" });
    const a = await buyer();
    const b = await buyer();
    const c = await buyer();
    await order(a, { kind: "oto", offerId: off });
    await order(b, { kind: "oto", offerId: inactive });
    await order(c, { kind: "product", productId: draft });
    const ids = (await mine()).map((r) => r.userId);
    expect(ids).not.toContain(a);
    expect(ids).not.toContain(b);
    expect(ids).not.toContain(c);
  });

  it("carries the product an offer grants, and says joined for a subscription", async () => {
    const p = await product();
    const granting = await offer({ grantProductId: p });
    const monthly = await offer({ interval: "month" });
    const u = await buyer();
    const v = await buyer();
    await order(u, { kind: "oto", offerId: granting });
    await order(v, { kind: "oto", offerId: monthly });
    const rows = await mine();
    expect(rows.find((r) => r.userId === u)).toMatchObject({ offerId: granting, grantProductId: p, verb: "enrolled in" });
    expect(rows.find((r) => r.userId === u)?.imageUrl).toContain("library/zz-cover.webp");
    expect(rows.find((r) => r.userId === v)?.verb).toBe("joined");
  });

  it("leaves out the owner, who is an admin through ADMIN_EMAILS and not the table", async () => {
    const o = await offer();
    const owner = await buyer();
    const { data } = await db().from("users").select("email").eq("id", owner).single();
    const before = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = `someone-else@example.com, ${String(data?.email).toUpperCase()}`;
    try {
      await order(owner, { kind: "oto", offerId: o });
      expect((await mine()).map((r) => r.userId)).not.toContain(owner);
    } finally {
      process.env.ADMIN_EMAILS = before;
    }
  });

  it("prints the offer's public name, not the internal label after the dash", async () => {
    const o = await offer({ name: `${tag} Funnel App — bump $27` });
    const u = await buyer();
    await order(u, { kind: "oto", offerId: o });
    expect((await mine()).find((r) => r.userId === u)?.itemName).toBe(`${tag} Funnel App`);
  });

  it("carries the granted product's own title and picture for its page", async () => {
    const p = await product();
    const granting = await offer({ grantProductId: p });
    const u = await buyer();
    await order(u, { kind: "oto", offerId: granting });
    const r = (await mine()).find((x) => x.userId === u);
    expect(r?.grantProductName).toBe(`${tag} course`);
    expect(r?.grantProductImage).toContain("library/zz-cover.webp");
  });

  it("drops an upsell refunded on its own charge, and keeps one still owned", async () => {
    const o = await offer();
    const refunded = await buyer();
    const kept = await buyer();
    await order(refunded, { kind: "oto", offerId: o }, { orderPi: `pi_${tag}_a1`, itemPi: `pi_${tag}_b1` });
    await order(kept, { kind: "oto", offerId: o }, { orderPi: `pi_${tag}_a2`, itemPi: `pi_${tag}_b2` });
    // revokeOwnershipForItem cancels the access and leaves the order paid.
    await db().from("ownership").insert([
      { store_id: storeId, user_id: refunded, offer_id: o, source: "oto", status: "canceled" },
      { store_id: storeId, user_id: kept, offer_id: o, source: "oto", status: "active" },
    ]);
    const ids = (await mine()).map((r) => r.userId);
    expect(ids).not.toContain(refunded);
    expect(ids).toContain(kept);
  });

  it("does not count an offer's buyers toward a product whose own switch is off", async () => {
    const p = await product({ show: false });
    const granting = await offer({ grantProductId: p });
    const u = await buyer();
    await order(u, { kind: "oto", offerId: granting });
    // Still the offer's buyer, on the offer's page; not the switched-off product's.
    expect((await mine()).find((r) => r.userId === u)).toMatchObject({ offerId: granting, grantProductId: null });
  });
});

afterAll(async () => {
  if (!canRun) return;
  const c = createServiceClient();
  for (const u of users) {
    const { data: rows } = await c.from("orders").select("id").eq("user_id", u);
    for (const o of rows ?? []) await c.from("order_items").delete().eq("order_id", o.id);
    await c.from("ownership").delete().eq("user_id", u);
    await c.from("orders").delete().eq("user_id", u);
    await c.from("users").delete().eq("id", u);
    await c.auth.admin.deleteUser(u);
  }
  for (const o of offers) await c.from("offers").delete().eq("id", o);
  for (const p of products) await c.from("products").delete().eq("id", p);
});
