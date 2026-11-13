import "server-only";
import type Stripe from "stripe";
import { stripe, stripeMode } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { recordError, messageOf } from "@/lib/errors";
import { isAppBilledOrder } from "@/lib/app-billed";
import { money } from "@/lib/money";

/**
 * Stripe's own invoice for a one-off order, made on the buyer's first ask
 * (owner, 13 Nov 2026). Spec:
 * docs/superpowers/specs/2026-11-13-stripe-invoice-per-purchase-design.md.
 *
 * Stripe makes no invoice for a PaymentIntent, so this makes one after the
 * fact: same Stripe account, so the same business details and branding the
 * subscription invoices carry. It is paid by attaching the order's own
 * succeeded payment, never by collecting again. Grow stores nothing: the
 * invoice id rides on the PaymentIntent's metadata.
 *
 * Every step reads the invoice's state first, so a repeat, a double click or
 * a run cut short converges on the same invoice.
 */

export type InvoiceResult =
  | { ok: true; invoiceId: string; hostedUrl: string | null; pdfUrl: string | null }
  | { ok: false; reason: "not_found" | "not_eligible" | "view_only" | "stripe_error" };

type Line = { description: string; amountCents: number };

/**
 * The invoice's lines: the order's own paid lines, never a subscription's
 * (those bill on their own invoices). An invoice that disagrees with the money
 * is worse than a plain one, so lines that don't add up to the charge become
 * one line at the charge.
 */
export function invoiceLines(input: {
  items: { description: string; amountCents: number; subscription: boolean }[];
  taxCents: number;
  chargedCents: number;
  fallbackDescription: string;
}): Line[] {
  const lines: Line[] = input.items
    .filter((i) => !i.subscription && i.amountCents > 0)
    .map((i) => ({ description: i.description, amountCents: i.amountCents }));
  if (input.taxCents > 0) lines.push({ description: "Tax", amountCents: input.taxCents });
  const sum = lines.reduce((t, l) => t + l.amountCents, 0);
  return sum === input.chargedCents ? lines : [{ description: input.fallbackDescription, amountCents: input.chargedCents }];
}

/** The coupon, said on the invoice: the stored lines are already after it. */
export function couponMemo(code: string | null, discountCents: number, currency: string): string | null {
  if (!code || discountCents <= 0) return null;
  return `Coupon ${code} applied: -${money(discountCents, currency)}`;
}

const ORDER_COLUMNS =
  "id, user_id, status, livemode, created_at, currency, coupon_code, discount_cents, tax_cents, stripe_payment_intent_id, stripe_customer_id, stripe_invoice_id";

const done = (inv: Stripe.Invoice): InvoiceResult => ({
  ok: true,
  invoiceId: inv.id ?? "",
  hostedUrl: inv.hosted_invoice_url ?? null,
  pdfUrl: inv.invoice_pdf ?? null,
});

/** Stripe answers a second request with the same key while the first is running with a 409. */
async function withKeyRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status !== 409 || attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

export async function invoiceForOrder(args: { orderId: string; userId: string; create: boolean }): Promise<InvoiceResult> {
  const db = createServiceClient();
  const { data: order } = await db
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", args.orderId)
    .eq("user_id", args.userId)
    .in("status", ["paid", "refunded"])
    .maybeSingle();
  if (!order) return { ok: false, reason: "not_found" };

  const { data: rows } = await db
    .from("order_items")
    .select("description, amount_cents, kind, offer_id, product_id, stripe_subscription_id")
    .eq("order_id", order.id as string);
  const items = (rows ?? []) as {
    description: string; amount_cents: number; kind: string; offer_id: string | null; product_id: string | null; stripe_subscription_id: string | null;
  }[];

  const piId = order.stripe_payment_intent_id as string | null;
  const customerId = order.stripe_customer_id as string | null;
  if (
    order.livemode !== (stripeMode() === "live") ||
    !piId ||
    !customerId ||
    order.stripe_invoice_id ||
    isAppBilledOrder(items.map((i) => ({ kind: i.kind, offerId: i.offer_id, productId: i.product_id })))
  ) {
    return { ok: false, reason: "not_eligible" };
  }

  try {
    const s = stripe();
    const pi = await s.paymentIntents.retrieve(piId);
    const charged = pi.amount_received ?? 0;
    const piCustomer = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
    // The payment is attached to the invoice, so both must be the same customer's.
    if (charged <= 0 || piCustomer !== customerId) return { ok: false, reason: "not_eligible" };
    const fail = async (why: string): Promise<InvoiceResult> => {
      await recordError({ source: "order_invoice", message: `No invoice for order ${order.id}: ${why}`, context: { orderId: order.id } });
      return { ok: false, reason: "stripe_error" };
    };

    let invoice: Stripe.Invoice | null = null;
    let voided: string | null = null;
    const remembered = pi.metadata?.grow_invoice_id;
    if (remembered) {
      const found = await s.invoices.retrieve(remembered);
      if (found.status === "void") voided = found.id ?? remembered;
      else invoice = found;
    }
    if (invoice?.status === "paid") return done(invoice);
    if (!args.create) return { ok: false, reason: "view_only" };

    if (!invoice) {
      const customer = await s.customers.retrieve(customerId);
      // Stripe spends a customer's balance on the next invoice it finalizes:
      // their credit would go on money already taken. Left to a person.
      const balance = "deleted" in customer && customer.deleted ? 0 : ((customer as Stripe.Customer).balance ?? 0);
      if (balance !== 0) return fail(`customer ${customerId} has a Stripe balance of ${balance}`);
      if (!("deleted" in customer && customer.deleted) && !(customer as Stripe.Customer).name) {
        const { data: user } = await db.from("users").select("username").eq("id", args.userId).maybeSingle();
        const name = ((user?.username as string | null) ?? "").trim();
        if (name) await s.customers.update(customerId, { name });
      }
      const currency = (order.currency as string) ?? pi.currency;
      invoice = await withKeyRetry(() =>
        s.invoices.create(
          {
            customer: customerId,
            collection_method: "charge_automatically",
            auto_advance: false,
            pending_invoice_items_behavior: "exclude",
            effective_at: Math.floor(Date.parse(order.created_at as string) / 1000),
            currency,
            description: couponMemo(order.coupon_code as string | null, (order.discount_cents as number) ?? 0, currency) ?? undefined,
            metadata: { store_created: "true", orderId: order.id as string },
          },
          // A voided invoice must not hand its key's cached answer back.
          { idempotencyKey: `grow-invoice-${order.id}${voided ? `-after-${voided}` : ""}` },
        ),
      );
      // Remembered at once, so a run cut short after this finds it again.
      await s.paymentIntents.update(piId, { metadata: { grow_invoice_id: invoice.id ?? "" } });
    }

    const id = invoice.id ?? "";
    // Lines only on a draft with none: a resume past the 24h key window would add them twice.
    if (invoice.status === "draft" && (invoice.lines?.data?.length ?? 0) === 0) {
      const lines = invoiceLines({
        items: items.map((i) => ({ description: i.description, amountCents: i.amount_cents, subscription: !!i.stripe_subscription_id })),
        taxCents: (order.tax_cents as number) ?? 0,
        chargedCents: charged,
        fallbackDescription: items.map((i) => i.description).join(" + ") || "Purchase",
      });
      for (const [n, l] of lines.entries()) {
        await withKeyRetry(() =>
          s.invoiceItems.create(
            { customer: customerId, invoice: id, amount: l.amountCents, currency: invoice!.currency, description: l.description },
            { idempotencyKey: `grow-invoice-${id}-line-${n}` },
          ),
        );
      }
    }
    if (invoice.status === "draft") {
      invoice = await s.invoices.finalizeInvoice(id, { auto_advance: false }).catch(() => s.invoices.retrieve(id));
    }
    if (invoice.status === "open") {
      // Never attach to an invoice that disagrees with the money. Voiding gives
      // back any balance Stripe applied; the next click starts a clean one.
      if (invoice.amount_due !== charged || (invoice.starting_balance ?? 0) !== 0) {
        await s.invoices.voidInvoice(id);
        return fail(`invoice ${id} came to ${invoice.amount_due} against a charge of ${charged}; voided`);
      }
      // ponytail: no out-of-band fallback. A failed or timed-out attach stays open and unshown; the next click retries it.
      invoice = await s.invoices.attachPayment(id, { payment_intent: piId }).catch(() => s.invoices.retrieve(id));
      if (invoice.status !== "paid") invoice = await s.invoices.retrieve(id);
    }
    // Only a paid invoice reaches the buyer: an open one's page has a live Pay button.
    if (invoice.status !== "paid") return fail(`invoice ${id} is ${invoice.status}, not paid`);
    return done(invoice);
  } catch (e) {
    await recordError({ source: "order_invoice", message: `Could not make the invoice for order ${order.id}: ${messageOf(e)}`, context: { orderId: order.id } });
    return { ok: false, reason: "stripe_error" };
  }
}
