"use server";

import { createClient } from "@/lib/supabase/server";
import { previewOfferCoupon, startOfferCheckout } from "@/lib/offer-checkout";
import { resolveBuyer } from "@/lib/checkout";

/**
 * Start the offer checkout — for a member, or for a stranger.
 *
 * It used to refuse anybody without a session, because it was built for the
 * library upsell: somebody who had already bought once, being offered an
 * add-on. Then offers got public sales pages, and that refusal became a login
 * wall in front of every one of them — an ad click landing on a price, a
 * button, and a demand to make an account before it would say anything else.
 *
 * A signed-in member is still taken from the SESSION and never from the form:
 * the card being saved must belong to whoever is actually signed in, and a
 * name and address in a request body are not proof of anything. The form's
 * details are read only when there is no session to read instead.
 */
export async function startOffer(
  offerId: string,
  /** Which way to pay — an index into the list the offer's page shows. */
  priceChoice?: number,
  /** The code they typed. Re-checked on the server; never trusted for a price. */
  couponCode?: string | null,
  /** Only read when nobody is signed in. */
  buyer?: { email?: string; fullName?: string },
): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string; code?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const resolved = await resolveBuyer(
    user?.id
      ? { existingUserId: user.id }
      : { email: buyer?.email, fullName: buyer?.fullName },
  );
  if (!resolved.ok) return resolved;

  const res = await startOfferCheckout({
    userId: resolved.userId,
    email: resolved.email,
    offerId,
    priceChoice,
    couponCode,
  });
  if (!res.ok) return res;
  return { ok: true, clientSecret: res.clientSecret };
}

/**
 * What a code takes off, before anybody commits to it.
 *
 * Open, now that the checkout it belongs to is. It was signed-in only to stop
 * codes being enumerated, and that reasoning does not survive the page being
 * public: the product checkout's equivalent has always been open, and a
 * would-be enumerator can simply make an account. Refusing here would only
 * have stopped the buyers.
 */
export async function previewOfferCouponAction(
  offerId: string,
  code: string,
  priceChoice?: number,
): Promise<
  | { ok: true; label: string; discountCents: number; clamped: boolean; recurringDiscount: boolean }
  | { ok: false; error: string }
> {
  return previewOfferCoupon({ offerId, code, priceChoice });
}
