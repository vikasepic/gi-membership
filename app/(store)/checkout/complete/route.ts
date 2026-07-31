import { NextResponse } from "next/server";
import { finalizeOrder, resolveOtoForOrder } from "@/lib/checkout";
import { mintPostPurchaseLogin } from "@/lib/post-purchase";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Post-payment router: finalize the order (idempotent), sign a first-time buyer
// in, then branch to the OTO if one is eligible, otherwise to thank-you.
//
// This is a route handler rather than a page because it has to set a session
// cookie, and only a route handler (or a server action) may do that — a Server
// Component cannot write cookies while rendering. It renders nothing either
// way; every path here ends in a redirect.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentIntent = url.searchParams.get("payment_intent");
  const clientSecret = url.searchParams.get("payment_intent_client_secret");
  const redirectStatus = url.searchParams.get("redirect_status");

  if (!paymentIntent || redirectStatus !== "succeeded") {
    return go(`/checkout/thank-you${redirectStatus ? `?redirect_status=${redirectStatus}` : ""}`);
  }

  // Everything from here is best-effort. The card has already been charged, so
  // an exception on this route turns a completed purchase into an error page —
  // by far the worst outcome available. finalizeOrder is idempotent and the
  // Stripe webhook calls it too, so a failure here is recoverable; an error
  // page shown to someone who just paid is not.
  try {
    await finalizeOrder(paymentIntent);
  } catch (e) {
    console.error("[complete] finalizeOrder failed (webhook will retry):", e);
  }

  // Sign them in before branching, so the OTO page and the library both know
  // who they are. A buyer who signed up at checkout has no password and would
  // otherwise have to go and find an email to open what they just paid for.
  //
  // Skipped when a session already exists: a signed-in member buying a second
  // product must not be logged out and back in, and must never be swapped onto
  // a different account by a URL.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const tokenHash = await mintPostPurchaseLogin(paymentIntent, clientSecret);
      if (tokenHash) {
        await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
      }
    }
  } catch (e) {
    // Not fatal: the thank-you page works signed out, and they can still log in
    // with a link the ordinary way.
    console.error("[complete] auto sign-in failed:", e);
  }

  // resolveOtoForOrder retrieves the PaymentIntent, which throws on an id Stripe
  // doesn't know. Missing the upsell is a lost opportunity; failing the whole
  // route is a lost customer.
  try {
    const token = await resolveOtoForOrder(paymentIntent);
    if (token) return go(`/checkout/oto?token=${encodeURIComponent(token)}`);
  } catch (e) {
    console.error("[complete] OTO lookup failed, sending to thank-you:", e);
  }
  return go(`/checkout/thank-you?payment_intent=${paymentIntent}&redirect_status=succeeded`);
}

// Relative Location only. Behind the production proxy `request.url` carries the
// container's internal host, so building an absolute URL from its origin sends
// people to https://0.0.0.0:3000/… — the same trap the auth callback documents.
function go(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}
