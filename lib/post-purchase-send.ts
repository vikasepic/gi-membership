import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettingsOrDefaults } from "@/lib/settings";
import { buildPostPurchaseEmail, firstNameOf } from "@/lib/post-purchase-email";
import { sendEmail } from "@/lib/email";

/**
 * The welcome email, sent when the checkout is actually over.
 *
 * Not when payment clears. A bump is taken at the checkout and an upsell one
 * page later, so an email sent at payment can only ever list part of what
 * somebody just bought — and listing two of their three purchases is worse
 * than listing none, because it reads as a delivery that went wrong.
 *
 * "Over" is not a timer either. A fixed ten-minute wait is wrong for the person
 * who decides in ninety seconds and wrong for the person who reads the upsell
 * twice. The real signal is already in the database: an upsell in flight holds
 * a pending row in `oto_tokens`. No pending token means nothing else is coming.
 *
 * Called from three places, because there are three ways a checkout ends:
 *
 *  - the thank-you page, which every path lands on;
 *  - the sweep, for the buyer who closed the tab on the upsell and never
 *    arrived — without it they would simply never get the email;
 *  - and the sweep again for an offer that expired unanswered.
 *
 * Calling it twice is harmless: `post_purchase_sent_at` is claimed before the
 * send, so two requests racing produce one email.
 */

/** How long an unanswered upsell holds the email back before the sweep gives up. */
const ABANDON_GRACE_MINUTES = 30;

type Sent = "sent" | "already" | "waiting" | "disabled" | "no-order";

export async function sendPostPurchaseIfDue(orderId: string): Promise<Sent> {
  const db = createServiceClient();

  const { data: order } = await db
    .from("orders")
    .select("id, email, status, post_purchase_sent_at, created_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "paid" || !order.email) return "no-order";
  if (order.post_purchase_sent_at) return "already";

  const settings = await getSettingsOrDefaults();
  const conf = settings.postPurchaseEmail;
  if (!conf.enabled) return "disabled";

  // Still deciding on an upsell. The token expiring is what eventually releases
  // this — checked against the clock rather than the row's status, because an
  // abandoned token stays "pending" for ever.
  const { data: pending } = await db
    .from("oto_tokens")
    .select("id")
    .eq("order_id", orderId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (pending && pending.length > 0) return "waiting";

  // Everything they bought, in the order it was bought: the product, then the
  // bump taken beside it, then any upsell. `order_items` is written by all
  // three paths, so this needs no knowledge of which happened.
  const { data: items } = await db
    .from("order_items")
    .select("description, created_at")
    .eq("order_id", orderId)
    .order("created_at");
  const products = (items ?? [])
    .map((i) => String(i.description ?? "").trim())
    .filter(Boolean);

  // The name they typed at checkout, if they typed one. A signed-in member may
  // have none stored at all, and the greeting degrades rather than inventing
  // "there".
  const { data: profile } = await db
    .from("users")
    .select("full_name")
    .eq("email", order.email)
    .maybeSingle();

  // Claimed BEFORE sending, and only if it is still unclaimed. Two requests
  // arriving together — the thank-you page and the sweep — then produce one
  // email rather than two, because the second update matches no row.
  //
  // The cost of this order is that a send which throws is not retried. That is
  // the right way round: a buyer receiving one welcome late is a smaller
  // problem than a buyer receiving four.
  const { data: claimed } = await db
    .from("orders")
    .update({ post_purchase_sent_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("post_purchase_sent_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return "already";

  const mail = buildPostPurchaseEmail({
    firstName: firstNameOf(profile?.full_name as string | null),
    products,
    settings: conf,
  });

  await sendEmail(order.email as string, mail, {
    from: conf.senderName ? `${conf.senderName} <${conf.senderEmail}>` : conf.senderEmail,
    replyTo: conf.replyTo,
  });
  return "sent";
}

/**
 * The buyers the thank-you page never saw.
 *
 * Someone who closes the tab on the upsell has paid, owns what they bought, and
 * has been told nothing. Their token stays "pending" until it expires, and then
 * this picks them up.
 *
 * Bounded at both ends: nothing older than a day, because an order that has sat
 * unsent that long has a reason nobody wants re-sent in a batch, and nothing
 * newer than the grace window, which is what keeps this from racing a buyer who
 * is still reading the upsell.
 */
export async function sweepPostPurchaseEmails(): Promise<{ sent: number; skipped: number }> {
  const db = createServiceClient();
  const now = Date.now();
  const { data: orders } = await db
    .from("orders")
    .select("id")
    .eq("status", "paid")
    .is("post_purchase_sent_at", null)
    .lt("created_at", new Date(now - ABANDON_GRACE_MINUTES * 60_000).toISOString())
    .gt("created_at", new Date(now - 24 * 60 * 60_000).toISOString())
    .order("created_at")
    .limit(50);

  let sent = 0;
  let skipped = 0;
  for (const o of orders ?? []) {
    // One failure must not stop the sweep: the next order in the list is a
    // different buyer with a different problem.
    try {
      const res = await sendPostPurchaseIfDue(o.id as string);
      if (res === "sent") sent++;
      else skipped++;
    } catch (e) {
      skipped++;
      console.error("[post-purchase sweep] order failed:", o.id, e);
    }
  }
  return { sent, skipped };
}
