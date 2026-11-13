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
    if (charged <= 0) return { ok: false, reason: "not_eligible" };

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
    if (invoice.status === "draft") {
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
      invoice = await s.invoices.finalizeInvoice(id, { auto_advance: false }).catch(() => s.invoices.retrieve(id));
    }
    if (invoice.status === "open") {
      try {
        invoice = await s.invoices.attachPayment(id, { payment_intent: piId });
      } catch (e) {
        const now = await s.invoices.retrieve(id);
        if (now.status === "paid") invoice = now;
        else {
          // ponytail: logged, not queued; a refused attach is Stripe's rule about that payment, and out of band is the documented fallback.
          console.warn(`[order_invoice] attach refused for ${id}, marking paid out of band: ${messageOf(e)}`);
          invoice = await s.invoices.pay(id, { paid_out_of_band: true });
        }
      }
    }
    // attachPayment can answer before the invoice reads paid; the next click finds it either way.
    if (invoice.status !== "paid") invoice = await s.invoices.retrieve(id);
    return done(invoice);
  } catch (e) {
    await recordError({ source: "order_invoice", message: `Could not make the invoice for order ${order.id}: ${messageOf(e)}`, context: { orderId: order.id } });
    return { ok: false, reason: "stripe_error" };
  }
}
