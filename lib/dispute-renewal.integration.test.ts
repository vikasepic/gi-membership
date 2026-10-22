import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type Stripe from "stripe";

/**
 * A chargeback on a RENEWAL has to find its order.
 *
 * `handleDispute` looked the order up by `stripe_payment_intent_id`, and a
 * renewal order has none — it is keyed on `stripe_invoice_id` (AGENTS.md).
 * So the lookup missed, the item fallback (also keyed on a payment intent)
 * missed, and the whole handler ran against `order = null`:
 *
 *   - nothing was revoked: production logged "Access revoked (0)"
 *   - the buyer's follow-up emails were never paused, that step sits inside
 *     `if (order)`
 *   - Meta was never told the money came back, same block
 *   - the chargeback alert named a PaymentIntent instead of the customer,
 *     on a dispute with a deadline somebody has to act on
 *
 * Seen on production 21 Oct 2026, the store's first chargeback.
 */

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { handleDispute } = await import("@/lib/reversals");

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const users: string[] = [];
const disputeIds: string[] = [];
let storeId = "";

describe.skipIf(!canRun)("a chargeback on a renewal (integration)", () => {
  beforeAll(async () => {
    storeId = await getStoreId();
  });
  const db = () => createServiceClient();
  const rand = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  /** A renewal order exactly as recordRenewal writes one: invoice, no intent. */
  async function chargedBackRenewal() {
    const email = `zzdispute_${rand()}@example.com`;
    const created = await db().auth.admin.createUser({
      email,
      password: "password12345",
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    users.push(userId);
    await db().from("users").insert({ id: userId, store_id: storeId, email, username: "Zz Tester" });

    const invoiceId = `in_zz_${rand()}`;
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
        // The whole point: a renewal carries an invoice and NO payment intent.
        stripe_invoice_id: invoiceId,
        stripe_payment_intent_id: null,
      })
      .select("id")
      .single();
    if (error || !order) throw new Error(`fixture order: ${error?.message}`);

    const item = await db().from("order_items").insert({
      store_id: storeId,
      order_id: order.id,
      kind: "renewal",
      description: "zz Funnel App - Monthly",
      amount_cents: 2900,
      stripe_subscription_id: `sub_zz_${rand()}`,
    });
    if (item.error) throw new Error(`fixture item: ${item.error.message}`);

    return { email, userId, invoiceId, orderId: order.id as string };
  }

  function dispute(piId: string): Stripe.Dispute {
    const id = `dp_zz_${rand()}`;
    disputeIds.push(id);
    return {
      id,
      amount: 2926,
      currency: "usd",
      reason: "product_unacceptable",
      status: "needs_response",
      created: Math.floor(Date.now() / 1000),
      charge: `ch_zz_${rand()}`,
      payment_intent: piId,
      evidence_details: { due_by: Math.floor(Date.now() / 1000) + 14 * 86_400 },
    } as unknown as Stripe.Dispute;
  }

  it("finds the order through the invoice when the payment intent matches nothing", async () => {
    const f = await chargedBackRenewal();
    // No order anywhere carries this intent — exactly the production case.
    const d = dispute(`pi_zz_nomatch_${rand()}`);

    let piRevokeCalls = 0;
    await handleDispute(
      d,
      async () => {
        piRevokeCalls++;
        return { revoked: 0 };
      },
      // The charge -> invoice hop, injected so the test makes no Stripe call.
      { invoiceIdFor: async () => f.invoiceId },
    );

    // The order was found, so the payment-intent fallback was never needed.
    expect(piRevokeCalls).toBe(0);

    // revokeOwnershipForOrder marks the order refunded. Before the fix nothing
    // reached it and the row stayed "paid".
    const { data: after } = await db()
      .from("orders")
      .select("status")
      .eq("id", f.orderId)
      .single();
    expect(after!.status).toBe("refunded");

    // And the alert names the person, not an opaque intent id, because a
    // dispute has a deadline somebody has to act on.
    const { data: errs } = await db()
      .from("error_events")
      .select("message")
      .eq("source", "chargeback")
      .order("created_at", { ascending: false })
      .limit(5);
    const mine = (errs ?? []).find((e) => (e.message as string).includes(f.email));
    expect(mine, "a chargeback alert naming the buyer").toBeTruthy();
  });

  it("still falls back to the payment intent when no order matches at all", async () => {
    // An upsell is charged on its own intent and recorded on the order ITEM,
    // so there is genuinely no order to find. That path must survive.
    const d = dispute(`pi_zz_orphan_${rand()}`);
    let piRevokeCalls = 0;
    await handleDispute(
      d,
      async () => {
        piRevokeCalls++;
        return { revoked: 1 };
      },
      { invoiceIdFor: async () => null },
    );
    expect(piRevokeCalls).toBe(1);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const c = createServiceClient();
  for (const id of disputeIds) {
    await c.from("error_events").delete().eq("context->>disputeId", id);
  }
  for (const u of users) {
    const { data: orders } = await c.from("orders").select("id").eq("user_id", u);
    for (const o of orders ?? []) await c.from("order_items").delete().eq("order_id", o.id);
    await c.from("ownership").delete().eq("user_id", u);
    await c.from("orders").delete().eq("user_id", u);
    await c.from("users").delete().eq("id", u);
    await c.auth.admin.deleteUser(u);
  }
});
