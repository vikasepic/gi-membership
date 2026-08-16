import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { mapSubscriptionStatus, type OwnershipStatus } from "@/lib/subscription-sync";
import { pushOwnershipStateToApps } from "@/lib/app-sync";
import { tagLifecycle } from "@/lib/ac-tags";

// Where our records and Stripe disagree about a subscription.
//
// They can disagree in two directions and only one of them is visible to the
// customer:
//
//   we say canceled, Stripe says trialing   they are being billed and have
//                                           lost access. This is the bad one.
//   we say trialing, Stripe says canceled   they have access they stopped
//                                           paying for.
//
// The first happened because refunding an order revoked the offer's ownership
// and told the app to withdraw access, without ever cancelling the Stripe
// subscription — so the money kept going and the product went away. Nobody
// finds that themselves; they just churn.
//
// Stripe is the source of truth here. It is the system holding the card.

export type SubscriptionDrift = {
  ownershipId: string;
  userId: string;
  email: string | null;
  offerId: string | null;
  offerName: string | null;
  subscriptionId: string;
  /** What our records say. */
  ours: OwnershipStatus;
  /** What Stripe says, or "missing" when it has never heard of it. */
  theirs: OwnershipStatus | "missing";
  /** True when they are paying and we have taken their access away. */
  losingAccess: boolean;
};

/**
 * Every subscription-backed ownership row whose status Stripe disagrees with.
 *
 * One Stripe call per row. There are tens of these, not thousands, and asking
 * about each one is the only way to be sure — a list built from our own tables
 * would be built from the very records that are wrong.
 */
export async function findSubscriptionDrift(): Promise<SubscriptionDrift[]> {
  const db = createServiceClient();
  const { data: rows } = await db
    .from("ownership")
    .select("id, user_id, offer_id, product_id, status, stripe_subscription_id")
    .not("stripe_subscription_id", "is", null);
  if (!rows || rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.user_id as string))];
  const offerIds = [...new Set(rows.map((r) => r.offer_id).filter(Boolean) as string[])];
  // Products subscribe too now. A drifting row with no name beside it is a row
  // nobody can act on — and acting on it is the entire point of this screen.
  const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean) as string[])];
  const [{ data: users }, { data: offers }, { data: products }] = await Promise.all([
    db.from("users").select("id, email").in("id", userIds),
    offerIds.length > 0
      ? db.from("offers").select("id, name").in("id", offerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    productIds.length > 0
      ? db.from("products").select("id, title").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const emailOf = new Map((users ?? []).map((u) => [u.id as string, u.email as string]));
  const nameOf = new Map<string, string>([
    ...(offers ?? []).map((o) => [o.id as string, o.name as string] as [string, string]),
    ...(products ?? []).map((p) => [p.id as string, p.title as string] as [string, string]),
  ]);

  const out: SubscriptionDrift[] = [];
  for (const row of rows) {
    const subscriptionId = row.stripe_subscription_id as string;
    const ours = row.status as OwnershipStatus;
    let theirs: OwnershipStatus | "missing";
    try {
      const sub = await stripe().subscriptions.retrieve(subscriptionId);
      theirs = mapSubscriptionStatus(sub.status);
    } catch {
      // Stripe has never heard of it. Usually a subscription created in test
      // mode against a store now running live keys. Reported, never repaired:
      // a wrong key would make every row look missing, and acting on that
      // would revoke the whole store.
      theirs = "missing";
    }
    if (theirs === ours) continue;
    out.push({
      ownershipId: row.id as string,
      userId: row.user_id as string,
      email: emailOf.get(row.user_id as string) ?? null,
      offerId: (row.offer_id as string | null) ?? null,
      // Whichever this row is for. The field is still called offerName because
      // every screen reading it says "what is drifting", and a second field
      // would mean every one of them learning which kind it was.
      offerName:
        nameOf.get((row.offer_id as string) ?? "") ??
        nameOf.get((row.product_id as string) ?? "") ??
        null,
      subscriptionId,
      ours,
      theirs,
      losingAccess: theirs !== "missing" && theirs !== "canceled" && ours === "canceled",
    });
  }
  // Worst first: someone being billed with no access is the reason this exists.
  return out.sort((a, b) => Number(b.losingAccess) - Number(a.losingAccess));
}

/**
 * Make our records match Stripe.
 *
 * Only where Stripe actually answered. A row Stripe cannot find is left alone
 * and reported — see above.
 */
export async function repairSubscriptionDrift(): Promise<{
  repaired: SubscriptionDrift[];
  skipped: SubscriptionDrift[];
}> {
  const drift = await findSubscriptionDrift();
  const fixable = drift.filter((d) => d.theirs !== "missing");
  const db = createServiceClient();

  for (const d of fixable) {
    await db.from("ownership").update({ status: d.theirs }).eq("id", d.ownershipId);
    // The app is told either way round: it has to give access back as readily
    // as it takes it, and it was the app's copy that went wrong for the
    // customer in the first place.
    await pushOwnershipStateToApps([d.ownershipId]);
    if (d.offerId) {
      try {
        await tagLifecycle({
          userId: d.userId,
          offerIds: [d.offerId],
          status: d.theirs as OwnershipStatus,
        });
      } catch (e) {
        console.error("[repairSubscriptionDrift] tags failed:", e);
      }
    }
  }
  return { repaired: fixable, skipped: drift.filter((d) => d.theirs === "missing") };
}
