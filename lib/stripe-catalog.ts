import "server-only";
import { stripe, stripeMode } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import type { Offer } from "@/lib/types";

/**
 * This store's catalogue, as Stripe sees it.
 *
 * Extracted from lib/checkout.ts because three places now need it and one of
 * them is lib/coupons.ts, which checkout.ts imports — leaving these there would
 * have made the cycle.
 *
 * A one-off purchase is a bare PaymentIntent with an amount on it, so Stripe
 * never had to know what was being sold and for most of this store's life it
 * did not. That turned out to cost two things:
 *
 *  - **A coupon could not be restricted to a product.** Stripe's "specific
 *    products" restriction matches Stripe product ids, and this catalogue had
 *    none, so the option could not even be chosen in Stripe's own UI. Every
 *    code was account-wide by construction, on an account shared with six
 *    other apps.
 *  - **Nothing in Stripe said what a charge was for**, beyond the metadata on
 *    the intent.
 *
 * So every product now gets a Stripe Product. It is created once, cached on
 * the row per mode, and never used to price anything: the amount charged still
 * comes from our own database, always. This is identity, not pricing — a
 * Stripe Price object would be a second copy of a number we already hold, free
 * to drift from it, and nothing would ever charge against it.
 */

/**
 * The Stripe Product a product is known by.
 *
 * One per product, not one per price: every way to buy a thing is the same
 * thing on different terms, and a Stripe product per price turns a dashboard
 * into a list nobody can read.
 *
 * Idempotency-keyed on our own id and the mode, so a race or a retry returns
 * the same Stripe product rather than making a second one.
 */
export async function ensureStripeProductForProduct(product: {
  id: string;
  title: string;
  stripeProductIdTest?: string | null;
  stripeProductIdLive?: string | null;
}): Promise<string> {
  const mode = stripeMode();
  const existing = mode === "live" ? product.stripeProductIdLive : product.stripeProductIdTest;
  if (existing) return existing;
  const created = await stripe().products.create(
    { name: product.title, metadata: { productId: product.id } },
    { idempotencyKey: `prod_product_${product.id}_${mode}` },
  );
  const db = createServiceClient();
  const col = mode === "live" ? "stripe_product_id_live" : "stripe_product_id_test";
  await db.from("products").update({ [col]: created.id }).eq("id", product.id);
  return created.id;
}

/** The same, for an offer. Bumps and upsells are sold as offers, not products. */
export async function ensureStripeProduct(offer: Offer): Promise<string> {
  const mode = stripeMode();
  const existing = mode === "live" ? offer.stripeProductIdLive : offer.stripeProductIdTest;
  if (existing) return existing;
  const product = await stripe().products.create(
    { name: offer.name, metadata: { offerId: offer.id } },
    { idempotencyKey: `prod_offer_${offer.id}_${mode}` },
  );
  const db = createServiceClient();
  const col = mode === "live" ? "stripe_product_id_live" : "stripe_product_id_test";
  await db.from("offers").update({ [col]: product.id }).eq("id", offer.id);
  return product.id;
}

/**
 * Make sure a product is in Stripe, without ever failing the caller.
 *
 * Called when a product is saved, so the admin can pick it in Stripe's coupon
 * UI straight away rather than only after somebody has bought it. Saving a
 * product must not depend on Stripe being reachable, so a failure here is
 * swallowed: the checkout path calls the strict version and catches up.
 */
export async function backfillStripeProduct(product: {
  id: string;
  title: string;
  stripeProductIdTest?: string | null;
  stripeProductIdLive?: string | null;
}): Promise<void> {
  try {
    await ensureStripeProductForProduct(product);
  } catch {
    // Deliberately silent. The strict call at checkout is the one that has to
    // succeed, and a store whose admin cannot save because Stripe is having a
    // bad afternoon is a worse store.
  }
}
