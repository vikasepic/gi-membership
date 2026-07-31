import "server-only";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

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
  /** Stripe-hosted receipt or invoice page. Null when Stripe has neither. */
  documentUrl: string | null;
  /** A direct PDF, which only invoices have. */
  pdfUrl: string | null;
  kind: "receipt" | "invoice" | "none";
};

export async function purchaseDocsForUser(userId: string): Promise<PurchaseDoc[]> {
  const db = createServiceClient();
  const { data: orders } = await db
    .from("orders")
    .select("id, created_at, total_cents, currency, status, stripe_payment_intent_id")
    .eq("store_id", await getStoreId())
    .eq("user_id", userId)
    .in("status", ["paid", "refunded"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (!orders || orders.length === 0) return [];

  const ids = orders.map((o) => o.id as string);
  const { data: items } = await db
    .from("order_items")
    .select("order_id, description")
    .in("order_id", ids);

  const descriptionByOrder = new Map<string, string[]>();
  for (const i of items ?? []) {
    const list = descriptionByOrder.get(i.order_id as string) ?? [];
    list.push(i.description as string);
    descriptionByOrder.set(i.order_id as string, list);
  }

  const docs: PurchaseDoc[] = [];
  for (const order of orders) {
    const base: PurchaseDoc = {
      orderId: order.id as string,
      createdAt: order.created_at as string,
      totalCents: (order.total_cents as number) ?? 0,
      currency: (order.currency as string) ?? "usd",
      status: order.status as string,
      description: (descriptionByOrder.get(order.id as string) ?? []).join(" + ") || "Purchase",
      documentUrl: null,
      pdfUrl: null,
      kind: "none",
    };

    const piId = order.stripe_payment_intent_id as string | null;
    if (!piId) {
      // A $0 order — a trial start books no PaymentIntent, so there is nothing
      // for Stripe to have issued and nothing to link to.
      docs.push(base);
      continue;
    }

    try {
      const pi = await stripe().paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
      const charge = pi.latest_charge;
      if (charge && typeof charge !== "string") {
        base.documentUrl = charge.receipt_url ?? null;
        base.kind = charge.receipt_url ? "receipt" : "none";
      }
    } catch {
      // Leave it linkless rather than failing the page: the purchase record is
      // ours and still worth showing without Stripe's copy of it.
    }
    docs.push(base);
  }

  return docs;
}

/**
 * Invoices for this customer's subscriptions — the only place Stripe issues a
 * real invoice with a PDF.
 */
export async function subscriptionInvoicesForUser(
  userId: string,
): Promise<{ number: string; createdAt: number; totalCents: number; currency: string; pdfUrl: string | null; hostedUrl: string | null }[]> {
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
    const invoices = await stripe().invoices.list({ customer: customerId, limit: 24 });
    return invoices.data
      // A $0 trial invoice is noise on this list — there is nothing to account for.
      .filter((i) => (i.amount_paid ?? 0) > 0)
      .map((i) => ({
        number: i.number ?? i.id ?? "",
        createdAt: i.created,
        totalCents: i.amount_paid ?? 0,
        currency: i.currency ?? "usd",
        pdfUrl: i.invoice_pdf ?? null,
        hostedUrl: i.hosted_invoice_url ?? null,
      }));
  } catch {
    return [];
  }
}
