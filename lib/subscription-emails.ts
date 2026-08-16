import "server-only";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { siteUrl } from "@/lib/env";
import { money } from "@/lib/money";
import { buildTrialEndingEmail, buildPaymentFailedEmail, sendEmail } from "@/lib/email";
import { sendCrmEvent } from "@/lib/crm";

/**
 * The two moments a subscriber hears nothing and quietly leaves.
 *
 * A trial converting is the single most common reason a first subscription
 * charge gets disputed — nobody remembers signing up seven days ago. And a
 * declined card deliberately does NOT revoke access, because Stripe is still
 * retrying one that often works on the second attempt, which means an email is
 * the only thing standing between an expired card and a customer who vanishes.
 *
 * Both link to /account rather than to a portal session: a session URL is
 * short-lived and single-customer, and one sitting in an inbox is either
 * expired by the time it is clicked or a link nobody should be forwarding.
 */

/** Who and what a subscription belongs to, as far as the store knows. */
async function subscriberFor(stripeSubscriptionId: string) {
  const db = createServiceClient();
  const { data: rows } = await db
    .from("ownership")
    .select("user_id, offer_id, product_id, product_price_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .limit(1);
  const row = rows?.[0];
  if (!row) return null;

  // A product subscription is the other half of this now. Without it the
  // trial-ending email says "your subscription" three days before charging
  // somebody — which is the exact ambiguity this email exists to remove.
  //
  // The price comes from the row they are ON, not the product's headline: a
  // product sold monthly and yearly would otherwise warn the yearly subscriber
  // about the monthly figure.
  const [{ data: user }, { data: offer }, { data: product }, { data: price }] = await Promise.all([
    db.from("users").select("email").eq("id", row.user_id as string).maybeSingle(),
    row.offer_id
      ? db.from("offers").select("name, price_cents, currency, interval").eq("id", row.offer_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    row.product_id
      ? db.from("products").select("title, currency").eq("id", row.product_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    row.product_price_id
      ? db
          .from("product_prices")
          .select("price_cents, interval")
          .eq("id", row.product_price_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!user?.email) return null;
  // Presented as the same shape either way, so the two senders below stay one
  // piece of code rather than growing a branch each.
  const asOffer =
    offer ??
    (product
      ? {
          name: product.title as string,
          price_cents: (price?.price_cents as number) ?? 0,
          currency: product.currency as string,
          interval: (price?.interval as string) ?? null,
        }
      : null);
  return { email: user.email as string, offer: asOffer };
}

const on = (unix: number | null | undefined) =>
  unix
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(new Date(unix * 1000))
    : "the end of your trial";

/** Three days out, from customer.subscription.trial_will_end. */
export async function sendTrialEndingEmail(sub: Stripe.Subscription): Promise<void> {
  const who = await subscriberFor(sub.id);
  if (!who) return;
  const name = (who.offer?.name as string) ?? "your subscription";
  const price = who.offer
    ? money(who.offer.price_cents as number, who.offer.currency as string)
    : money(sub.items.data[0]?.price.unit_amount ?? 0, sub.currency);

  await sendEmail(
    who.email,
    buildTrialEndingEmail({
      productName: name,
      priceLabel: price,
      intervalLabel: who.offer?.interval ? `/${who.offer.interval}` : "",
      chargeOn: on(sub.trial_end),
      manageUrl: `${siteUrl()}/account`,
    }),
  );
  // The CRM hears about it too, so a sequence can be built on it without
  // waiting for this store to grow one.
  await sendCrmEvent({
    type: "trial_ending",
    email: who.email,
    occurredAt: Math.floor(Date.now() / 1000),
  });
}

/** On a declined renewal. Access is kept; this is the only nudge. */
export async function sendPaymentFailedEmail(stripeSubscriptionId: string): Promise<void> {
  const who = await subscriberFor(stripeSubscriptionId);
  if (!who) return;
  await sendEmail(
    who.email,
    buildPaymentFailedEmail({
      productName: (who.offer?.name as string) ?? "your subscription",
      manageUrl: `${siteUrl()}/account`,
    }),
  );
}

/** Kept here so the webhook does not have to know how Stripe types this. */
export const subscriptionFrom = (event: Stripe.Event) => event.data.object as Stripe.Subscription;

export const stripeClient = stripe;
