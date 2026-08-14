"use server";

import { createClient } from "@/lib/supabase/server";
import { previewOfferCoupon, startOfferCheckout } from "@/lib/offer-checkout";

// Starts the standalone offer checkout for the signed-in member. The offer id
// comes from the client, so the user is taken from the session and never from
// the form — the card being saved must belong to whoever is actually signed in.
export async function startOffer(
  offerId: string,
  /** Which way to pay — an index into the list the offer's page shows. */
  priceChoice?: number,
  /** The code they typed. Re-checked on the server; never trusted for a price. */
  couponCode?: string | null,
): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Please log in first." };

  const res = await startOfferCheckout({
    userId: user.id,
    email: user.email,
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
 * Signed in only — this is a members' checkout, and an open endpoint that says
 * which codes are valid is a way to enumerate them.
 */
export async function previewOfferCouponAction(
  offerId: string,
  code: string,
  priceChoice?: number,
): Promise<
  | { ok: true; label: string; discountCents: number; clamped: boolean; recurringDiscount: boolean }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in first." };
  return previewOfferCoupon({ offerId, code, priceChoice });
}
