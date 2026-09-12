import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

/**
 * Stamp the finished basket onto the order's own PaymentIntent.
 *
 * The base intent is created BEFORE the order row exists — it is what the card
 * is charged against, and the order is written once Stripe has a client secret
 * — so it can never carry `orderId` at creation time. Nor can it carry the
 * basket: a bump is resolved during fulfilment and an upsell is a separate
 * purchase minutes later.
 *
 * So this runs afterwards, from the two places where the basket is final:
 * `finalizeOrder` once the order is paid and its items are written, and again
 * when an upsell is accepted. Metadata is a merge in Stripe, so a second call
 * rewrites these four keys and leaves every other key alone.
 *
 * Until 12 Sep 2026 these keys existed only on orders a one-time backfill had
 * touched, so every NEW order arrived in Stripe without them and the gap
 * reopened with each sale. Same shape as that backfill wrote, deliberately:
 * `kind:name:$amount` joined by " | ", so old and new orders read identically
 * in an export.
 *
 * Fire-and-forget. It reports nothing to the buyer and may never fail a paid
 * order, so every error is swallowed after being logged.
 */
export async function stampOrderMetadata(orderId: string): Promise<void> {
  try {
    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("stripe_payment_intent_id, currency, total_cents")
      .eq("id", orderId)
      .maybeSingle();

    const intentId = (order?.stripe_payment_intent_id as string | null) ?? null;
    // A subscription order is a SetupIntent and has no PaymentIntent to stamp.
    if (!intentId) return;

    const { data: rows } = await db
      .from("order_items")
      .select("kind, description, amount_cents, created_at")
      .eq("order_id", orderId);

    const items = rows ?? [];
    // Nothing to describe yet. Better to leave the keys absent than to write an
    // empty basket over a complete one on a retry.
    if (items.length === 0) return;

    await stripe().paymentIntents.update(intentId, {
      metadata: basketMetadata(
        orderId,
        items as BasketItem[],
        Number(order?.total_cents) || 0,
        (order?.currency as string) ?? "usd",
      ),
    });
  } catch (e) {
    console.error("[stampOrderMetadata] failed (the order is unaffected):", e);
  }
}

export type BasketItem = {
  kind: string;
  description: string;
  amount_cents: number;
  created_at?: string;
};

/**
 * The four metadata keys, from a basket. Pure, so the shape a buyer's order
 * ends up carrying can be asserted without a Stripe account.
 */
export function basketMetadata(
  orderId: string,
  items: BasketItem[],
  totalCents: number,
  currency: string,
): Record<string, string> {
  const code = (currency || "usd").toUpperCase();
  const money = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(cents / 100);

  // Product first, then the bump that rode with it, then anything added later —
  // the order somebody reads the basket in, not the order rows were inserted.
  const rank = (k: string) => (k === "product" ? 0 : k === "bump" ? 1 : 2);
  const sorted = [...items].sort(
    (a, b) =>
      rank(String(a.kind)) - rank(String(b.kind)) ||
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
  );

  return {
    orderId,
    items: sorted
      .map((i) => `${i.kind}:${i.description}:${money(Number(i.amount_cents) || 0)}`)
      .join(" | ")
      // Stripe refuses a metadata value over 500 characters, and refusing the
      // whole update would lose orderId along with it.
      .slice(0, 500),
    itemCount: String(sorted.length),
    orderTotal: money(totalCents),
  };
}
