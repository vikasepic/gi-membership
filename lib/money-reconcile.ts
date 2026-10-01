import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { money } from "@/lib/money";
import { subscriptionIdOf } from "@/lib/renewals";

/**
 * The nightly check that our money records agree with Stripe's.
 *
 * Stripe is the record of money; `orders.status` is a claim about it. A $398
 * renewal sat "refunded" here for a day while Stripe had refunded nothing
 * (30 Sep 2026), and it surfaced from the member's account page. Each
 * mismatch goes to /admin/errors, once, until someone deals with it.
 *
 * Three questions:
 *  - an order marked refunded here: did Stripe refund it?
 *  - a refund Stripe made on one of our charges: is the order refunded here?
 *  - a renewal Stripe charged on one of our subscriptions: is there an order?
 *
 * The Stripe account is shared with other apps, so anything that cannot be
 * tied to one of our orders or subscriptions is left alone.
 */

export type MismatchKind = "refunded_here_not_in_stripe" | "refunded_in_stripe_not_here" | "paid_in_stripe_no_order";
export type Mismatch = { key: string; kind: MismatchKind; message: string; context: Record<string, unknown> };

export type ReconcileInput = {
  /** Orders marked refunded here, with what Stripe says went back (null: Stripe could not be read). */
  refundedOrders: { orderId: string; email: string; totalCents: number; currency: string; stripeRefundedCents: number | null }[];
  /** Recent refunds in Stripe, with the order of ours they belong to (null: not ours). */
  stripeRefunds: { refundId: string; amountCents: number; currency: string; status: string; order: { id: string; email: string; status: string } | null }[];
  /** Recent paid renewal invoices on our subscriptions. */
  paidInvoices: { invoiceId: string; number: string | null; amountCents: number; currency: string; email: string | null; hasOrder: boolean }[];
  /** True when the time budget ran out before every Stripe page was read. */
  partial?: boolean;
};

export function findMismatches(input: ReconcileInput): Mismatch[] {
  const out: Mismatch[] = [];
  for (const o of input.refundedOrders) {
    if (o.stripeRefundedCents !== 0 || o.totalCents <= 0) continue;
    out.push({
      key: `refunded_here_not_in_stripe:${o.orderId}`,
      kind: "refunded_here_not_in_stripe",
      message: `Marked refunded here, but Stripe refunded nothing: ${o.email}, ${money(o.totalCents, o.currency)} (order ${o.orderId.slice(0, 8)}). Refund it in Stripe, or set the order back to paid.`,
      context: { orderId: o.orderId, email: o.email },
    });
  }
  for (const r of input.stripeRefunds) {
    if (r.status !== "succeeded" || !r.order || r.order.status !== "paid") continue;
    out.push({
      key: `refunded_in_stripe_not_here:${r.refundId}`,
      kind: "refunded_in_stripe_not_here",
      message: `Stripe refunded ${money(r.amountCents, r.currency)} (${r.refundId}) to ${r.order.email}, but the order is still paid here (order ${r.order.id.slice(0, 8)}). Their access may still be on.`,
      context: { orderId: r.order.id, refundId: r.refundId, email: r.order.email },
    });
  }
  for (const i of input.paidInvoices) {
    if (i.hasOrder || i.amountCents <= 0) continue;
    out.push({
      key: `paid_in_stripe_no_order:${i.invoiceId}`,
      kind: "paid_in_stripe_no_order",
      message: `Stripe charged ${i.email ?? "a member"} ${money(i.amountCents, i.currency)} (invoice ${i.number ?? i.invoiceId}) and there is no order here. The renewal backfill should add it; if this stays, check the Stripe webhook.`,
      context: { invoiceId: i.invoiceId, email: i.email },
    });
  }
  return out;
}

/** Records each mismatch not already open on /admin/errors. Returns how many it added. */
export async function recordMismatches(mismatches: Mismatch[]): Promise<number> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  let added = 0;
  for (const m of mismatches) {
    const { data: open } = await db
      .from("error_events")
      .select("id")
      .eq("source", "money_reconcile")
      .is("resolved_at", null)
      .contains("context", { key: m.key })
      .limit(1);
    if (open && open.length > 0) continue;
    const { error } = await db.from("error_events").insert({
      store_id: storeId,
      source: "money_reconcile",
      message: m.message,
      context: { ...m.context, key: m.key, kind: m.kind },
    });
    if (!error) added++;
  }
  return added;
}

const RENEWAL_REASONS = new Set(["subscription_cycle", "subscription_update", "subscription_threshold"]);
const HOUR = 3600;

/** The charge a PaymentIntent made, and how much of it went back. Null when Stripe cannot say. */
async function refundedOnIntent(pi: string): Promise<number | null> {
  try {
    const intent = await stripe().paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
    const ch = intent.latest_charge;
    return ch && typeof ch !== "string" ? (ch.amount_refunded ?? 0) : null;
  } catch {
    return null;
  }
}

async function intentOfInvoice(invoiceId: string): Promise<string | null> {
  const { data } = await stripe().invoicePayments.list({ invoice: invoiceId, limit: 10 });
  for (const p of data) {
    const pi = p.payment?.payment_intent;
    if (pi && p.status === "paid") return typeof pi === "string" ? pi : pi.id;
  }
  return null;
}

/** Reads both sides. `days` is how far back Stripe's refunds and invoices are read. */
export async function gatherReconcileInput(opts: { days?: number; now?: Date; budgetMs?: number } = {}): Promise<ReconcileInput> {
  // A night's work is seconds (4 refunds, 64 paid invoices in three days on
  // 1 Oct 2026). The budget is for a long look-back, so it stops inside the
  // cron's limit and says so rather than being killed half way.
  // Half each for the two Stripe reads, so a pile of one cannot starve the other.
  const budget = opts.budgetMs ?? 240_000;
  const refundsDeadline = Date.now() + budget / 2;
  let partial = false;
  const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const since = now - (opts.days ?? 3) * 24 * HOUR;
  const db = createServiceClient();
  const storeId = await getStoreId();

  // 1. Refunded here. Few rows; read 60 days so a slow-burning one is caught.
  const { data: refunded } = await db
    .from("orders")
    .select("id, email, total_cents, currency, stripe_payment_intent_id, stripe_invoice_id")
    .eq("store_id", storeId)
    .eq("status", "refunded")
    .eq("livemode", true)
    .gte("updated_at", new Date((now - 60 * 24 * HOUR) * 1000).toISOString())
    .order("updated_at", { ascending: false })
    .limit(200);
  const refundedOrders: ReconcileInput["refundedOrders"] = [];
  for (const o of refunded ?? []) {
    let pi = (o.stripe_payment_intent_id as string | null) ?? null;
    if (!pi && o.stripe_invoice_id) pi = await intentOfInvoice(o.stripe_invoice_id as string).catch(() => null);
    if (!pi) continue; // a $0 order: nothing was charged, so nothing to compare
    refundedOrders.push({
      orderId: o.id as string,
      email: o.email as string,
      totalCents: (o.total_cents as number) ?? 0,
      currency: (o.currency as string) ?? "usd",
      stripeRefundedCents: await refundedOnIntent(pi),
    });
  }

  // 2. Stripe's recent refunds, tied to an order of ours where one exists.
  const stripeRefunds: ReconcileInput["stripeRefunds"] = [];
  for await (const r of stripe().refunds.list({ created: { gte: since }, limit: 100 })) {
    if (Date.now() > refundsDeadline) { partial = true; break; }
    const pi = typeof r.payment_intent === "string" ? r.payment_intent : (r.payment_intent?.id ?? null);
    let order: { id: string; email: string; status: string } | null = null;
    if (pi) {
      const { data: byIntent } = await db.from("orders").select("id, email, status").eq("stripe_payment_intent_id", pi).maybeSingle();
      if (byIntent) order = { id: byIntent.id as string, email: byIntent.email as string, status: byIntent.status as string };
      else {
        const { data: pays } = await stripe().invoicePayments.list({ payment: { type: "payment_intent", payment_intent: pi }, limit: 1 });
        const inv = pays[0]?.invoice;
        const invId = typeof inv === "string" ? inv : (inv?.id ?? null);
        if (invId) {
          const { data: byInvoice } = await db.from("orders").select("id, email, status").eq("stripe_invoice_id", invId).maybeSingle();
          if (byInvoice) order = { id: byInvoice.id as string, email: byInvoice.email as string, status: byInvoice.status as string };
        }
      }
    }
    stripeRefunds.push({ refundId: r.id, amountCents: r.amount, currency: r.currency, status: r.status ?? "", order });
  }

  // 3. Stripe's recent paid renewals on subscriptions we hold. Not the last
  //    hour: the webhook that writes the order may still be on its way.
  const paidInvoices: ReconcileInput["paidInvoices"] = [];
  const invoicesDeadline = Date.now() + budget / 2;
  const ours = new Set(
    ((await db.from("subscriptions").select("stripe_subscription_id").eq("store_id", storeId)).data ?? []).map(
      (s) => s.stripe_subscription_id as string,
    ),
  );
  for await (const inv of stripe().invoices.list({ status: "paid", created: { gte: since, lte: now - HOUR }, limit: 100 })) {
    if (Date.now() > invoicesDeadline) { partial = true; break; }
    const sub = subscriptionIdOf(inv as Stripe.Invoice);
    if (!sub || !ours.has(sub) || !RENEWAL_REASONS.has(inv.billing_reason ?? "") || (inv.amount_paid ?? 0) <= 0) continue;
    const { data: order } = await db.from("orders").select("id").eq("stripe_invoice_id", inv.id ?? "").maybeSingle();
    paidInvoices.push({
      invoiceId: inv.id ?? "",
      number: inv.number ?? null,
      amountCents: inv.amount_paid ?? 0,
      currency: inv.currency ?? "usd",
      email: inv.customer_email ?? null,
      hasOrder: !!order,
    });
  }

  return { refundedOrders, stripeRefunds, paidInvoices, partial };
}

/** The nightly run: read both sides, report what disagrees. */
export async function reconcileMoney(opts: { dryRun?: boolean; days?: number; budgetMs?: number } = {}): Promise<{
  checked: { refundedOrders: number; stripeRefunds: number; paidInvoices: number; partial: boolean };
  mismatches: Mismatch[];
  recorded: number;
}> {
  const input = await gatherReconcileInput({ days: opts.days, budgetMs: opts.budgetMs });
  const mismatches = findMismatches(input);
  const recorded = opts.dryRun ? 0 : await recordMismatches(mismatches);
  return {
    checked: { refundedOrders: input.refundedOrders.length, stripeRefunds: input.stripeRefunds.length, paidInvoices: input.paidInvoices.length, partial: !!input.partial },
    mismatches,
    recorded,
  };
}
