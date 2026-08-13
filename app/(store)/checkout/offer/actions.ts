"use server";

import { createClient } from "@/lib/supabase/server";
import { startOfferCheckout } from "@/lib/offer-checkout";

// Starts the standalone offer checkout for the signed-in member. The offer id
// comes from the client, so the user is taken from the session and never from
// the form — the card being saved must belong to whoever is actually signed in.
export async function startOffer(
  offerId: string,
  /** Which way to pay — an index into the list the offer's page shows. */
  priceChoice?: number,
): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Please log in first." };

  const res = await startOfferCheckout({ userId: user.id, email: user.email, offerId, priceChoice });
  if (!res.ok) return res;
  return { ok: true, clientSecret: res.clientSecret };
}
