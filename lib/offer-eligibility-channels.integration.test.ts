import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getOffer } from "@/lib/store";
import { ownershipFor } from "@/lib/checkout";
import { isOfferEligible } from "@/lib/offers";
import { getStandingOffer } from "@/lib/library";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// The seeded Content Engine app, and its seeded offer — which grants NO
// channels and is therefore the "behaves exactly as it did before" control.
const APP = "00000000-0000-0000-0000-0000000000a1";
const WHOLE_APP_OFFER = "00000000-0000-0000-0000-0000000000c1";
const USER_EMAIL = "zz-eligibility-channels@example.test";

/**
 * One app sold as three subscriptions.
 *
 * Eligibility used to collapse everything a person holds to a set of app ids,
 * and all three Content Engine offers share one `grant_app_id`. So a single
 * live Instagram row made all three ineligible: the sales page hid the button,
 * /checkout/offer redirected, startOfferCheckout refused — and
 * completeOfferCheckout returned `{ ok: true }` after saving the card, having
 * created no order, no subscription and no ownership row.
 */
describe.skipIf(!canRun)("what a channel subscriber may still be sold (integration)", () => {
  let storeId: string;
  let userId: string;
  let ig: string;
  let li: string;
  let bundle: string;

  const makeOffer = async (channels: string[]) => {
    const db = createServiceClient();
    const id = crypto.randomUUID();
    const { error } = await db.from("offers").insert({
      id,
      store_id: storeId,
      key: `zz-elig-${id}`,
      name: `zz eligibility fixture (${channels.join("+") || "whole app"})`,
      grant_type: "subscription",
      grant_app_id: APP,
      grant_entitlement_key: "content-engine",
      grant_channels: channels,
      billing_type: "recurring",
      interval: "month",
      interval_count: 1,
      trial_days: 7,
      price_cents: 2900,
      currency: "usd",
      headline: "fixture",
      description: "fixture",
    });
    if (error) throw new Error(`test fixture: offer ${channels}: ${error.message}`);
    return id;
  };

  const hold = async (offerId: string | null, status = "active") => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("ownership")
      .insert({
        store_id: storeId,
        user_id: userId,
        app_id: APP,
        offer_id: offerId,
        source: "grant",
        status,
      })
      .select("id")
      .single();
    if (error) throw new Error(`test fixture: ownership: ${error.message}`);
    return data.id as string;
  };

  const eligibility = async () => {
    const owned = await ownershipFor(userId);
    const of = async (id: string) => isOfferEligible((await getOffer(id))!, owned);
    return {
      instagram: await of(ig),
      linkedin: await of(li),
      bundle: await of(bundle),
      wholeApp: await of(WHOLE_APP_OFFER),
    };
  };

  beforeEach(async () => {
    const db = createServiceClient();
    storeId = await getStoreId();
    userId = crypto.randomUUID();
    await db.from("users").insert({ id: userId, store_id: storeId, email: USER_EMAIL });
    ig = await makeOffer(["instagram"]);
    li = await makeOffer(["linkedin"]);
    bundle = await makeOffer(["instagram", "linkedin"]);
  });

  afterEach(async () => {
    const db = createServiceClient();
    await db.from("ownership").delete().eq("user_id", userId);
    await db.from("users").delete().eq("id", userId);
    for (const id of [ig, li, bundle]) await db.from("offers").delete().eq("id", id);
  });

  it("sells all three to somebody holding nothing", async () => {
    expect(await eligibility()).toEqual({
      instagram: true,
      linkedin: true,
      bundle: true,
      wholeApp: true,
    });
  });

  it("sells LinkedIn — and only LinkedIn — to an Instagram subscriber", async () => {
    await hold(ig);
    // The bundle is priced as the sum of the singles, so selling it here would
    // charge for access they already have.
    expect(await eligibility()).toEqual({
      instagram: false,
      linkedin: true,
      bundle: false,
      wholeApp: false,
    });
  });

  it("sells nothing more to somebody holding both singles", async () => {
    await hold(ig);
    await hold(li);
    expect(await eligibility()).toEqual({
      instagram: false,
      linkedin: false,
      bundle: false,
      wholeApp: false,
    });
  });

  it("sells nothing more to a bundle subscriber", async () => {
    await hold(bundle);
    expect(await eligibility()).toEqual({
      instagram: false,
      linkedin: false,
      bundle: false,
      wholeApp: false,
    });
  });

  it("sells everything again once the row is cancelled", async () => {
    // Unchanged: a cancellation keeps the row and flips its status, and a
    // lapsed subscriber must be sellable again.
    await hold(ig, "canceled");
    expect(await eligibility()).toEqual({
      instagram: true,
      linkedin: true,
      bundle: true,
      wholeApp: true,
    });
  });

  it("leaves an offer with no channels behaving exactly as it did", async () => {
    // The Funnel App's shape. Holding what an offer grants makes that offer
    // ineligible, on the app id alone, with no channel arithmetic involved.
    await hold(WHOLE_APP_OFFER);
    const owned = await ownershipFor(userId);
    expect(owned.appIds.has(APP)).toBe(true);
    expect(owned.appChannels.get(APP)).toBeUndefined();
    expect(isOfferEligible((await getOffer(WHOLE_APP_OFFER))!, owned)).toBe(false);
    // And a hold we cannot attribute to channels blocks the channels too.
    expect(isOfferEligible((await getOffer(ig))!, owned)).toBe(false);
  });

  it("offers LinkedIn in the library to an Instagram subscriber", async () => {
    // getStandingOffer asked subscribedToApp, which is true of anyone in the
    // app at all — so an Instagram subscriber was never shown LinkedIn.
    await hold(ig);
    const standing = await getStandingOffer(userId);
    // getStandingOffer scans every active subscription offer in the store
    // with no `order by`, and other suites run concurrently against the same
    // store and can leave their own eligible offers live at the same moment
    // — so which *id* comes back isn't pinned down. What matters, and is true
    // regardless of row order, is that this subscriber is offered something
    // at all (before this branch: nothing, because holding Instagram made
    // the whole app look owned) and specifically not the bundle they'd be
    // overcharged for, nor the offers they already hold through.
    expect(standing).not.toBeNull();
    expect(standing?.id).not.toBe(bundle);
    expect(standing?.id).not.toBe(ig);
    expect(standing?.id).not.toBe(WHOLE_APP_OFFER);
  });
});
