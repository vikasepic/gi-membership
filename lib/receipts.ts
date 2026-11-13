import "server-only";
import type Stripe from "stripe";
import { stripe, stripeMode } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { rowOf, type SubscriptionRow } from "@/lib/subscriptions";
import { isAppBilledOrder } from "@/lib/app-billed";
import { subscriptionIdOf } from "@/lib/renewals";

// A buyer's own purchase history, with whatever Stripe can actually hand them.
//
// The two purchase types produce different documents, and pretending otherwise
// would mean promising an invoice that does not exist:
//
//   One-time product  PaymentIntent -> Charge, which carries a hosted RECEIPT.
//                     Stripe creates no invoice for a PaymentIntent; that is an
//                     invoicing/subscription feature, not a payments one.
//   Subscription      A real Invoice, with a PDF and a hosted page.
//
// Both are fetched live from Stripe rather than stored. They are URLs to
// Stripe-hosted documents that Stripe can revoke or rotate, and a cached copy
// that 404s later is worse than a lookup that takes a moment.

export type PurchaseDoc = {
  orderId: string;
  createdAt: string;
  totalCents: number;
  currency: string;
  status: string;
  description: string;
  /** Stripe's receipt for the charge that paid it. Null when nothing was charged. */
  receiptUrl: string | null;
  /** Stripe's invoice page, when one exists. */
  invoiceUrl: string | null;
  /** A one-off payment with no invoice yet: the page offers to make one (lib/order-invoice). */
  canMakeInvoice: boolean;
  /**
   * The subscription this order started, if it started one. Renewals are
   * left out: their order is a payment on a subscription some other order
   * began, and the status belongs on that one line, not on every month.
   */
  subscriptionId: string | null;
  /** A renewal's Stripe invoice: its document, and where its refund shows. */
  invoiceId: string | null;
  /** What went back, per Stripe's charge where there is one. */
  refundedCents: number;
  /** When the order was marked refunded; null when it was not. */
  refundedAt: string | null;
};

export async function purchaseDocsForUser(userId: string): Promise<PurchaseDoc[]> {
  const db = createServiceClient();
  const { data: orders } = await db
    .from("orders")
    .select("id, created_at, updated_at, total_cents, currency, status, livemode, stripe_payment_intent_id, stripe_invoice_id, stripe_customer_id")
    .eq("store_id", await getStoreId())
    .eq("user_id", userId)
    .in("status", ["paid", "refunded"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (!orders || orders.length === 0) return [];

  const ids = orders.map((o) => o.id as string);
  const { data: items } = await db
    .from("order_items")
    .select("order_id, description, kind, stripe_subscription_id, offer_id, product_id")
    .in("order_id", ids);

  const descriptionByOrder = new Map<string, string[]>();
  const subscriptionByOrder = new Map<string, string>();
  const linesByOrder = new Map<string, { kind: string; offerId: string | null; productId: string | null }[]>();
  for (const i of items ?? []) {
    linesByOrder.set(i.order_id as string, [
      ...(linesByOrder.get(i.order_id as string) ?? []),
      { kind: i.kind as string, offerId: (i.offer_id as string | null) ?? null, productId: (i.product_id as string | null) ?? null },
    ]);
    const list = descriptionByOrder.get(i.order_id as string) ?? [];
    list.push(i.description as string);
    descriptionByOrder.set(i.order_id as string, list);
    const sub = i.stripe_subscription_id as string | null;
    if (sub && i.kind !== "renewal" && !subscriptionByOrder.has(i.order_id as string)) {
      subscriptionByOrder.set(i.order_id as string, sub);
    }
  }

  const docs: PurchaseDoc[] = [];
  for (const order of orders) {
    // Paid to a connected app, not to Grow: that app shows it. See lib/app-billed.
    if (isAppBilledOrder(linesByOrder.get(order.id as string) ?? [])) continue;
    const base: PurchaseDoc = {
      orderId: order.id as string,
      createdAt: order.created_at as string,
      totalCents: (order.total_cents as number) ?? 0,
      currency: (order.currency as string) ?? "usd",
      status: order.status as string,
      description: (descriptionByOrder.get(order.id as string) ?? []).join(" + ") || "Purchase",
      receiptUrl: null,
      invoiceUrl: null,
      canMakeInvoice: false,
      subscriptionId: subscriptionByOrder.get(order.id as string) ?? null,
      invoiceId: (order.stripe_invoice_id as string | null) ?? null,
      // The whole order until Stripe says otherwise below; a partial refund
      // is read off the charge.
      refundedCents: order.status === "refunded" ? ((order.total_cents as number) ?? 0) : 0,
      refundedAt: order.status === "refunded" ? ((order.updated_at as string) ?? null) : null,
    };

    // An order from the other Stripe mode is not this key's to look up.
    if (order.livemode !== (stripeMode() === "live")) {
      docs.push(base);
      continue;
    }

    const piId = order.stripe_payment_intent_id as string | null;
    try {
      if (piId) {
        // A one-off: the charge's receipt, and the invoice lib/order-invoice
        // made for it, which the PaymentIntent remembers.
        const pi = await stripe().paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
        const charge = pi.latest_charge;
        if (charge && typeof charge !== "string") {
          base.receiptUrl = charge.receipt_url ?? null;
          if ((charge.amount_refunded ?? 0) > 0) base.refundedCents = charge.amount_refunded;
        }
        const made = pi.metadata?.grow_invoice_id;
        const inv = made ? await stripe().invoices.retrieve(made) : null;
        if (inv && inv.status === "paid") base.invoiceUrl = inv.hosted_invoice_url ?? null;
        base.canMakeInvoice =
          !base.invoiceUrl && !!order.stripe_customer_id && (pi.amount_received ?? 0) > 0 && !order.stripe_invoice_id;
      } else {
        // A renewal is keyed on its invoice; a subscription's paid first charge
        // is the invoice Stripe raised when it started. A $0 order has neither.
        let invoiceId = (order.stripe_invoice_id as string | null) ?? null;
        if (!invoiceId && base.subscriptionId && base.totalCents > 0) {
          const list = await stripe().invoices.list({ subscription: base.subscriptionId, limit: 10 });
          invoiceId = list.data.find((i) => i.billing_reason === "subscription_create" && (i.amount_paid ?? 0) > 0)?.id ?? null;
        }
        if (invoiceId) Object.assign(base, await invoiceDocs(invoiceId));
      }
    } catch {
      // Leave it linkless rather than failing the page: the purchase record is
      // ours and still worth showing without Stripe's copy of it.
    }
    docs.push(base);
  }

  return docs;
}

/** A Stripe invoice's page and the receipt of the charge that paid it. */
async function invoiceDocs(invoiceId: string): Promise<{ invoiceUrl: string | null; receiptUrl: string | null }> {
  // Stripe refuses an expand deeper than four levels, so the charge is a second read.
  const inv = await stripe().invoices.retrieve(invoiceId, { expand: ["payments"] });
  const paidBy = inv.payments?.data?.map((p) => p.payment?.payment_intent).find(Boolean);
  const piId = typeof paidBy === "string" ? paidBy : paidBy?.id;
  const charge = piId ? (await stripe().paymentIntents.retrieve(piId, { expand: ["latest_charge"] })).latest_charge : null;
  return {
    invoiceUrl: inv.hosted_invoice_url ?? null,
    receiptUrl: charge && typeof charge !== "string" ? (charge.receipt_url ?? null) : null,
  };
}

/**
 * Invoices for this customer's subscriptions — the only place Stripe issues a
 * real invoice with a PDF.
 */
export type SubscriptionInvoice = {
  id: string;
  number: string;
  createdAt: number;
  totalCents: number;
  currency: string;
  pdfUrl: string | null;
  hostedUrl: string | null;
  /** Refunded through credit notes: the only way Stripe shows a refund on an invoice. */
  refundedCents: number;
  creditNotePdfUrl: string | null;
};

export async function subscriptionInvoicesForUser(
  userId: string,
): Promise<SubscriptionInvoice[]> {
  const db = createServiceClient();
  const { data: order } = await db
    .from("orders")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();
  const customerId = order?.stripe_customer_id as string | undefined;
  if (!customerId) return [];

  try {
    const [invoices, notes] = await Promise.all([
      stripe().invoices.list({ customer: customerId, limit: 24 }),
      stripe().creditNotes.list({ customer: customerId, limit: 100 }),
    ]);
    const notePdf = new Map<string, string>();
    for (const n of notes.data) {
      const inv = typeof n.invoice === "string" ? n.invoice : n.invoice?.id;
      if (inv && n.status !== "void" && !notePdf.has(inv)) notePdf.set(inv, n.pdf);
    }
    return invoices.data
      // A $0 trial invoice is noise on this list — there is nothing to account for.
      .filter((i) => (i.amount_paid ?? 0) > 0)
      // Only a subscription's: a one-off purchase's invoice sits on its own row above.
      .filter((i) => subscriptionIdOf(i) !== null)
      .map((i) => ({
        id: i.id ?? "",
        number: i.number ?? i.id ?? "",
        createdAt: i.created,
        totalCents: i.amount_paid ?? 0,
        currency: i.currency ?? "usd",
        pdfUrl: i.invoice_pdf ?? null,
        hostedUrl: i.hosted_invoice_url ?? null,
        refundedCents: i.post_payment_credit_notes_amount ?? 0,
        creditNotePdfUrl: notePdf.get(i.id ?? "") ?? null,
      }));
  } catch {
    return [];
  }
}

/**
 * This member's own subscriptions, by Stripe id, for the account page.
 *
 * Scoped to the user as well as the ids, so a purchase row can only ever show
 * a subscription that belongs to the person reading it. Never throws: a page
 * that cannot say the status still shows the purchase.
 */
export async function subscriptionsForUser(userId: string, ids: string[]): Promise<Map<string, SubscriptionRow>> {
  const out = new Map<string, SubscriptionRow>();
  if (ids.length === 0) return out;
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("subscriptions")
      .select("*")
      .eq("store_id", await getStoreId())
      .eq("user_id", userId)
      .in("stripe_subscription_id", ids);
    for (const r of data ?? []) {
      const row = rowOf(r);
      out.set(row.stripeSubscriptionId, row);
    }
  } catch {
    // Shown without a status rather than not shown.
  }
  return out;
}
