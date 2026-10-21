import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type Stripe from "stripe";

/**
 * What a renewal knows about the person who bought.
 *
 * A renewal is written from a Stripe webhook. There is no browser and no
 * request, so the IP, the user agent and the page have to come from the
 * checkout that won the subscription — the same way the visitor, the country
 * and the campaign labels already do.
 *
 * They did not, and the cost is not bookkeeping. `buyerContextFor` reads them
 * off the order row it is given, so every renewal reached Meta with no
 * `client_ip_address` and no `client_user_agent`. On 20 Oct 2026 the pixel put
 * IP and user agent coverage on Purchase at 16.7% against 100% on email, and
 * a server event missing both is one Meta can count but barely match.
 */

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { recordRenewal } = await import("@/lib/renewals");

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const users: string[] = [];
let storeId = "";

const IP = "203.0.113.77";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) zz-test";
const SOURCE = "https://grow.greaterinside.com/p/zz-renewal-fixture";

describe.skipIf(!canRun)("what a renewal carries from the sale (integration)", () => {
  beforeAll(async () => {
    storeId = await getStoreId();
  });
  const db = () => createServiceClient();
  const rand = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  /** A member whose checkout recorded the request it came from. */
  async function subscriber(): Promise<{ sub: string; originId: string }> {
    const email = `zzmatch_${rand()}@example.com`;
    const created = await db().auth.admin.createUser({
      email,
      password: "password12345",
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    users.push(userId);
    await db().from("users").insert({ id: userId, store_id: storeId, email, username: "Priya Shah" });

    const sub = `sub_zz_${rand()}`;
    const { data: order, error } = await db()
      .from("orders")
      .insert({
        store_id: storeId,
        user_id: userId,
        email,
        status: "paid",
        total_cents: 2900,
        subtotal_cents: 2900,
        currency: "usd",
        client_ip: IP,
        client_user_agent: UA,
        source_url: SOURCE,
        buyer_country: "GB",
      })
      .select("id")
      .single();
    if (error || !order) throw new Error(`fixture order: ${error?.message}`);

    const item = await db().from("order_items").insert({
      store_id: storeId,
      order_id: order.id,
      kind: "product",
      description: "zz Renewal Fixture",
      amount_cents: 2900,
      stripe_subscription_id: sub,
    });
    if (item.error) throw new Error(`fixture item: ${item.error.message}`);
    return { sub, originId: order.id as string };
  }

  function invoice(sub: string): Stripe.Invoice {
    const now = Math.floor(Date.now() / 1000);
    return {
      id: `in_zz_${rand()}`,
      billing_reason: "subscription_cycle",
      amount_paid: 2900,
      subtotal: 2900,
      currency: "usd",
      livemode: false,
      created: now,
      status_transitions: { paid_at: now },
      total_taxes: [],
      parent: { subscription_details: { subscription: sub, metadata: {} } },
      lines: {
        data: [
          {
            description: "1 × zz Renewal Fixture (at $29.00 / month)",
            period: { start: now, end: now + 30 * 86_400 },
          },
        ],
      },
    } as unknown as Stripe.Invoice;
  }

  it("carries the request the sale was made from, so the conversion can be matched", async () => {
    const s = await subscriber();
    const res = await recordRenewal(invoice(s.sub), { track: false, receipt: false });
    if (!res.recorded) throw new Error(res.reason);

    const { data } = await db()
      .from("orders")
      .select("client_ip, client_user_agent, source_url, buyer_country")
      .eq("id", res.orderId)
      .single();

    // buyerContextFor reads exactly these off the row, and hands them to Meta
    // as client_ip_address / client_user_agent / event_source_url.
    expect(data!.client_ip).toBe(IP);
    expect(data!.client_user_agent).toBe(UA);
    expect(data!.source_url).toBe(SOURCE);
    // Already carried before this change; here so a regression on the fixture
    // itself cannot be mistaken for the three above failing.
    expect(data!.buyer_country).toBe("GB");
  });

  it("leaves them null when the sale never recorded them either", async () => {
    // A subscription a connected app started has no checkout of ours behind
    // it. Inventing an address for one is worse than sending none: Meta
    // matches on it.
    const email = `zzmatch_${rand()}@example.com`;
    const created = await db().auth.admin.createUser({
      email,
      password: "password12345",
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    users.push(userId);
    await db().from("users").insert({ id: userId, store_id: storeId, email, username: "Sam Okafor" });

    const sub = `sub_zz_${rand()}`;
    const { data: order, error } = await db()
      .from("orders")
      .insert({
        store_id: storeId,
        user_id: userId,
        email,
        status: "paid",
        total_cents: 2900,
        subtotal_cents: 2900,
        currency: "usd",
      })
      .select("id")
      .single();
    if (error || !order) throw new Error(`fixture order: ${error?.message}`);
    const item = await db().from("order_items").insert({
      store_id: storeId,
      order_id: order.id,
      kind: "product",
      description: "zz Renewal Fixture",
      amount_cents: 2900,
      stripe_subscription_id: sub,
    });
    if (item.error) throw new Error(`fixture item: ${item.error.message}`);

    const res = await recordRenewal(invoice(sub), { track: false, receipt: false });
    if (!res.recorded) throw new Error(res.reason);
    const { data } = await db()
      .from("orders")
      .select("client_ip, client_user_agent, source_url")
      .eq("id", res.orderId)
      .single();
    expect(data!.client_ip).toBeNull();
    expect(data!.client_user_agent).toBeNull();
    expect(data!.source_url).toBeNull();
  });
});

afterAll(async () => {
  if (!canRun) return;
  const c = createServiceClient();
  for (const u of users) {
    const { data: orders } = await c.from("orders").select("id").eq("user_id", u);
    for (const o of orders ?? []) await c.from("order_items").delete().eq("order_id", o.id);
    await c.from("orders").delete().eq("user_id", u);
    await c.from("users").delete().eq("id", u);
    await c.auth.admin.deleteUser(u);
  }
});
