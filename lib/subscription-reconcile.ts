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

/** A subscription Stripe did not answer about, even when asked a second time. */
export type UncheckedSubscription = { subscriptionId: string; error: string };

/**
 * Every subscription-backed ownership row whose status Stripe disagrees with.
 *
 * One Stripe call per row. There are tens of these, not thousands, and asking
 * about each one is the only way to be sure — a list built from our own tables
 * would be built from the very records that are wrong.
 */
/** Stripe lookups in flight at once. Well inside its 100/s live limit, shared with other apps. */
const STRIPE_BATCH = 20;

/**
 * What Stripe says about one subscription: its status, "missing" when Stripe
 * says it has no such object, or the error when it gave no answer at all.
 *
 * Only `resource_missing` is "missing". Every error used to be, so a burst
 * Stripe rate-limited turned live, paying subscriptions into a page of
 * "Stripe missing" (23 Oct 2026). A refusal says nothing about the subscription.
 */
async function stripeStatusOf(id: string): Promise<OwnershipStatus | "missing" | Error> {
  try {
    return mapSubscriptionStatus((await stripe().subscriptions.retrieve(id)).status);
  } catch (e) {
    if ((e as { code?: string }).code === "resource_missing") return "missing";
    return e instanceof Error ? e : new Error(String(e));
  }
}

export async function findSubscriptionDrift(): Promise<{
  drift: SubscriptionDrift[];
  unchecked: UncheckedSubscription[];
}> {
  const db = createServiceClient();
  const { data: rows } = await db
    .from("ownership")
    .select("id, user_id, offer_id, product_id, status, stripe_subscription_id")
    .not("stripe_subscription_id", "is", null);
  if (!rows || rows.length === 0) return { drift: [], unchecked: [] };

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

  // Asked of Stripe STRIPE_BATCH at a time, not one by one. One by one was
  // 123 calls at ~0.4 s each on 28 Sep 2026: the Errors page, which runs this
  // before it can render, took close to a minute and looked broken.
  const answers = new Map<string, OwnershipStatus | "missing" | Error>();
  const ids = [...new Set(rows.map((r) => r.stripe_subscription_id as string))];
  for (let i = 0; i < ids.length; i += STRIPE_BATCH) {
    const batch = ids.slice(i, i + STRIPE_BATCH);
    const got = await Promise.all(batch.map(stripeStatusOf));
    batch.forEach((id, j) => answers.set(id, got[j]));
  }
  // Whatever the burst could not get, asked again one at a time.
  for (const id of ids) {
    if (answers.get(id) instanceof Error) answers.set(id, await stripeStatusOf(id));
  }

  const statusOf = new Map<string, OwnershipStatus | "missing">();
  const unchecked: UncheckedSubscription[] = [];
  for (const [id, answer] of answers) {
    if (answer instanceof Error) unchecked.push({ subscriptionId: id, error: answer.message });
    else statusOf.set(id, answer);
  }
  if (unchecked.length > 0) {
    console.error(`[findSubscriptionDrift] Stripe did not answer for ${unchecked.length}:`, unchecked[0].error);
  }

  const out: SubscriptionDrift[] = [];
  for (const row of rows) {
    const subscriptionId = row.stripe_subscription_id as string;
    const ours = row.status as OwnershipStatus;
    const theirs = statusOf.get(subscriptionId);
    // No answer is neither agreement nor drift. It is listed apart.
    if (theirs === undefined || theirs === ours) continue;
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
  return { drift: out.sort((a, b) => Number(b.losingAccess) - Number(a.losingAccess)), unchecked };
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
  const { drift } = await findSubscriptionDrift();
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
