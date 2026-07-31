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

  await finalizeOrder(paymentIntent);

  // Sign them in before branching, so the OTO page and the library both know
  // who they are. A buyer who signed up at checkout has no password and would
  // otherwise have to go and find an email to open what they just paid for.
  //
  // Skipped when a session already exists: a signed-in member buying a second
  // product must not be logged out and back in, and must never be swapped onto
  // a different account by a URL.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const tokenHash = await mintPostPurchaseLogin(paymentIntent, clientSecret);
    if (tokenHash) {
      // A failure here is not fatal: the purchase is already complete, and the
      // thank-you page still works signed out. They just get the login they
      // would have had before.
      await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    }
  }

  const token = await resolveOtoForOrder(paymentIntent);
  if (token) return go(`/checkout/oto?token=${encodeURIComponent(token)}`);
  return go(`/checkout/thank-you?payment_intent=${paymentIntent}&redirect_status=succeeded`);
}

// Relative Location only. Behind the production proxy `request.url` carries the
// container's internal host, so building an absolute URL from its origin sends
// people to https://0.0.0.0:3000/… — the same trap the auth callback documents.
function go(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}
