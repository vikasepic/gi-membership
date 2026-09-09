import { completeOfferCheckout } from "@/lib/offer-checkout";
import { resolveOtoForOfferOrder } from "@/lib/checkout";
import { mintOfferLogin } from "@/lib/post-purchase";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Where Stripe sends somebody back after paying, or after the card is saved
 * for a trial.
 *
 * This is where the purchase is actually granted — completeOfferCheckout is
 * idempotent, so a refresh or a double redirect grants once and then no-ops.
 *
 * A route handler rather than a page, and that is the whole reason it changed:
 * an offer can be bought by a stranger now, and a stranger who has just signed
 * up at checkout has no password. They have to be signed in on the way back or
 * they land on /library, get bounced to /login, and have to go and find an
 * email to open the thing they have just paid for. Only a route handler may
 * write a session cookie — a Server Component cannot set cookies while it
 * renders, which is what the old page here was.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Either kind, because a one-time offer is now paid for rather than saved.
  const intentId =
    url.searchParams.get("payment_intent") ?? url.searchParams.get("setup_intent");
  const clientSecret =
    url.searchParams.get("payment_intent_client_secret") ??
    url.searchParams.get("setup_intent_client_secret");
  const redirectStatus = url.searchParams.get("redirect_status");

  if (!intentId) return go("/library");
  if (redirectStatus && redirectStatus !== "succeeded") {
    return go(`/library?offer=${encodeURIComponent(redirectStatus)}`);
  }

  // Everything from here is best-effort in the same sense the product route is:
  // the card is saved by now, so an exception would turn a completed purchase
  // into an error page — the worst outcome available.
  let result: { ok: true; orderId?: string } | { ok: false; error: string };
  try {
    result = await completeOfferCheckout(intentId);
  } catch (e) {
    console.error("[offer complete] failed:", e);
    result = { ok: false, error: "unknown" };
  }

  // Sign a first-time buyer in — after the grant, because the claim is on the
  // ownership row that grant creates.
  //
  // Skipped when a session already exists: a member buying a second thing must
  // not be logged out and back in, and must never be swapped onto another
  // account by a URL.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const tokenHash = await mintOfferLogin(intentId, clientSecret);
      if (tokenHash) await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    }
  } catch (e) {
    // Not fatal. They can still sign in with a link the ordinary way, and the
    // thing they bought is already theirs.
    console.error("[offer complete] auto sign-in failed:", e);
  }

  // An upsell for the offer just bought, resolved from the ORDER
  // completeOfferCheckout just created or reclaimed — never by asking Stripe
  // to retrieve `intentId` again and reading its metadata. That was the old
  // mechanism (resolveOtoForOrder, still used unchanged by the PRODUCT route)
  // and it cannot work here: a recurring offer's order carries neither
  // stripe_payment_intent_id nor stripe_setup_intent_id (completeOfferCheckout
  // deliberately never writes the latter — see its own comment), so that
  // lookup always came back empty for exactly the case an upsell exists to
  // serve — the recurring case is the whole point of this feature. See
  // resolveOtoForOfferOrder's own comment for the rest.
  //
  // Gated on `result.orderId` rather than just `result.ok`: it is absent on a
  // RECURRING offer's eligibility short-circuit inside completeOfferCheckout
  // (that path never races a webhook, so by the time that short-circuit is
  // reachable this visit is a refresh and already had its one chance at the
  // OTO on the trip that created the subscription). A PAID offer's
  // short-circuit hands the id back instead: the Stripe webhook calls
  // completeOfferCheckout for every offer PaymentIntent too, and when it
  // lands first, THIS is the buyer's only visit here, not a refresh — the id
  // lets it still resolve the OTO.
  //
  // When it IS present, the order it names is not guaranteed to already carry
  // its own host order_items row (two of completeOfferCheckout's success
  // returns hand back an order whose winning caller may still be mid-
  // fulfilment) — resolveOtoForOfferOrder fails closed on that itself, so
  // nothing extra is checked here.
  //
  // Wrapped exactly as the product route wraps its own call: the money (if
  // any) has already moved by this point, so a lookup failure must send the
  // buyer onward, never turn a completed purchase into an error page.
  if (result.ok && result.orderId) {
    try {
      const token = await resolveOtoForOfferOrder(result.orderId);
      if (token) return go(`/checkout/oto?token=${encodeURIComponent(token)}`);
    } catch (e) {
      console.error("[offer complete] OTO lookup failed, sending to library:", e);
    }
  }

  return go(`/library?offer=${result.ok ? "added" : result.error}`);
}

// Relative Location only. Behind the production proxy `request.url` carries the
// container's internal host, so an absolute URL built from its origin sends the
// buyer to a hostname that does not exist outside the box.
function go(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}
