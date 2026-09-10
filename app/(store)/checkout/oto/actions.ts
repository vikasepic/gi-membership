"use server";

import { redirect } from "next/navigation";
import { acceptOto, otoBounceHref } from "@/lib/checkout";
import { verifyOtoToken } from "@/lib/oto-token";
import { sendPostPurchaseIfDue } from "@/lib/post-purchase-send";
import { otoSigningSecret } from "@/lib/env";

// POST-only accept (a server action is always POST). Single-use is enforced in
// acceptOto; any failure path lands on thank-you (or, for an offer-checkout
// order, /library) without a double charge.
export async function acceptOtoAction(formData: FormData) {
  const token = formData.get("token");
  // Which way to pay was chosen: an INDEX into the list this order's upsell
  // shows, resolved server-side against that same list. The field cannot name
  // an offer or a price — only a position in something already offered.
  //
  // "alt" still parses, because a page loaded before this shipped and
  // submitted after it must not lose the choice somebody made.
  const raw = formData.get("choice");
  const choice =
    typeof raw === "string" && /^\d+$/.test(raw)
      ? Number(raw)
      : raw === "alt"
        ? ("alt" as const)
        : undefined;
  if (typeof token === "string" && token) {
    const res = await acceptOto(token, choice);
    // Verified again purely to learn WHICH ORDER this was, for otoBounceHref —
    // acceptOto's own return type stays exactly what it already is, since
    // downstream callers (and this file's other bounce below) rely on that.
    // Cheap and side-effect-free: a signature/expiry check on a string,
    // nothing here trusts it for anything but the order id inside it, and
    // acceptOto has already done the one thing that actually matters (the
    // single-use claim) before this ever runs.
    const verified = verifyOtoToken(token, otoSigningSecret());
    const orderId = verified.ok ? verified.payload.orderId : null;
    // The decision on the upsell is the end of the funnel, whichever way it
    // went — so the email can finally list everything. A product order goes on
    // to /checkout/thank-you, which calls this again and gets "already"; an
    // OFFER order goes to /library and would otherwise have no immediate send
    // at all. Never allowed to throw: the charge is done either way.
    if (orderId) {
      try {
        await sendPostPurchaseIfDue(orderId);
      } catch (e) {
        console.error("[acceptOto] welcome email failed (the sweep will retry):", e);
      }
    }
    redirect(await otoBounceHref(orderId, res.ok ? "accepted" : res.error));
  }
  redirect(await otoBounceHref(null));
}
