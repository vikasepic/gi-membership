import "server-only";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Mint a one-time login token for the person who just paid, or return null.
 *
 * WHY THIS IS SAFE TO DO AT ALL
 *
 * Checkout creates the account before payment (it needs a customer to charge),
 * so an account existing proves nothing about who is sitting at the browser.
 * What does prove it is the PaymentIntent client secret: Stripe puts it in the
 * return URL, and only the browser that completed that payment ever sees it.
 * So the secret is checked against the live PaymentIntent, and the payment must
 * actually have succeeded.
 *
 * WHY IT IS CONSUMED
 *
 * That proof has no expiry of its own. Someone who pastes their thank-you URL
 * into a support chat, or leaves it in shared browser history, would otherwise
 * be handing over a working session for as long as the link survives. Marking
 * the order first means the second attempt gets nothing — including two
 * concurrent requests racing on the same URL.
 *
 * Returns a `token_hash` the caller verifies with the SSR client, because only
 * a route handler may set cookies.
 */
export async function mintPostPurchaseLogin(
  paymentIntentId: string,
  clientSecret: string | null,
): Promise<string | null> {
  if (!paymentIntentId || !clientSecret) return null;

  let pi;
  try {
    pi = await stripe().paymentIntents.retrieve(paymentIntentId);
  } catch {
    return null;
  }
  // Both halves matter: the secret proves which browser, the status proves the
  // money moved. Neither alone is enough to hand out a session.
  if (pi.client_secret !== clientSecret || pi.status !== "succeeded") return null;

  const db = createServiceClient();
  const { data: order } = await db
    .from("orders")
    .select("id, email, user_id, session_granted_at")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!order?.user_id || !order.email) return null;
  if (order.session_granted_at) return null; // already used

  // Claim it BEFORE minting, and only if still unclaimed, so two requests
  // arriving together cannot both mint. The .is() filter is the compare part of
  // a compare-and-set — without it, both would update and both would proceed.
  const { data: claimed } = await db
    .from("orders")
    .update({ session_granted_at: new Date().toISOString() })
    .eq("id", order.id)
    .is("session_granted_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return null;

  const { data, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: order.email as string,
  });
  if (error || !data?.properties?.hashed_token) return null;
  return data.properties.hashed_token;
}
