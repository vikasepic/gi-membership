import { describe, it, expect, afterAll, vi } from "vitest";
import { startOfferCheckout, completeOfferCheckout } from "@/lib/offer-checkout";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

/**
 * The admin picker end to end: saveOffer persists bump_offer_id, and the value
 * it persisted is the one a real buyer gets charged and granted.
 *
 * Deliberately NOT a raw `bump_offer_id` insert for the host fixture, unlike
 * every other bump fixture in this file's siblings. Seeding it that way would
 * pass identically whether or not toOfferRow writes the column — which is
 * exactly the bug this task exists to fix (an earlier task left the write out
 * on purpose because the form had no control posting it; the form now does).
 * Routing the setup through the real saveOffer is what makes this test able
 * to fail when the picker silently doesn't save.
 */
const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];
const users: string[] = [];

// saveOffer opens with requireAdmin() and closes with revalidatePath() — a
// signed-in cookie and a Next render tree, neither of which exists under
// vitest. Mocked the same way app/admin/offers/offer-prices-save.test.ts
// already calls this exact action outside of a request. @/lib/admin is
// deliberately left UNMOCKED: a mocked updateOffer would only prove saveOffer
// threads bumpOfferId into its input object, not that the column in the
// database actually moves.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: async () => {} }));

const { saveOffer } = await import("@/app/admin/offers/actions");

async function mk(cents: number): Promise<string> {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  made.push(id);
  const { error } = await db.from("offers").insert({
    id, store_id: await getStoreId(), key: `zz-e2e-${id}`, name: "zz e2e fixture",
    grant_type: "subscription", grant_app_id: APP,
    grant_entitlement_key: "content-engine", grant_channels: [],
    billing_type: "one_time", price_cents: cents, currency: "usd",
    headline: "fixture", description: "fixture", active: true,
  });
  if (error) throw new Error(`fixture: ${error.message}`);
  // startOfferCheckout resolves prices from offer_prices, not the scalar
  // mirror on offers — see the identical note in offer-bump-charge's own
  // fixture helper. Without this row the offer has no way to pay.
  const { error: priceErr } = await db
    .from("offer_prices")
    .insert({ offer_id: id, billing_type: "one_time", price_cents: cents, sort_order: 0 });
  if (priceErr) throw new Error(`fixture price: ${priceErr.message}`);
  return id;
}

/**
 * What the real offer form posts when an admin points the picker at a bump.
 *
 * `headline` is a parameter (not hardcoded) so a caller can prove an edit to
 * some OTHER field still round-trips the same bumpOfferId — the picker keeps
 * a disqualified current value selected (see the comment beside the select),
 * so a save that touches nothing about the bump still posts its id unchanged.
 */
function hostForm(hostId: string, cents: number, bumpOfferId: string, headline = "fixture"): FormData {
  const fd = new FormData();
  fd.set("id", hostId);
  fd.set("key", `zz-e2e-${hostId}`); // unchanged — proving the bump slot, not a rename
  fd.set("name", "zz e2e fixture");
  fd.set("grantType", "subscription");
  fd.set("grantAppId", APP);
  fd.set("grantEntitlementKey", "content-engine");
  fd.set("headline", headline);
  fd.set(
    "prices",
    JSON.stringify([
      {
        id: "host-price", label: "", billingType: "one_time", interval: null,
        intervalCount: 1, trialDays: null, priceCents: cents, compareAtCents: null, archived: false,
      },
    ]),
  );
  fd.set("currency", "usd");
  fd.set("acceptLabel", "Yes, add this");
  fd.set("declineLabel", "No thanks");
  fd.set("bumpOfferId", bumpOfferId);
  // The schema's `active` preprocessing defaults absent to false — leaving
  // this out would deactivate the host offer on its own save.
  fd.set("active", "on");
  for (const empty of [
    "grantProductId", "description", "imageUrl", "bullets", "pageAltOfferId",
    "activecampaignTagId", "activecampaignTrialTagId", "activecampaignCancelledTagId",
    "otoBody", "otoVideoUrl",
  ]) {
    fd.set(empty, "");
  }
  return fd;
}

describe.skipIf(!canRun)("setting an offer's bump from the admin form (integration)", () => {
  it("saves through saveOffer, then charges and grants both in one payment", async () => {
    const db = createServiceClient();
    const bumpId = await mk(2900);
    const hostId = await mk(4700);

    const res = await saveOffer({}, hostForm(hostId, 4700, bumpId));
    expect(res.error, res.error).toBeFalsy();

    // THE regression this test exists to catch: without toOfferRow writing
    // bump_offer_id, this comes back null even though saveOffer reported success.
    const { data: row } = await db.from("offers").select("bump_offer_id").eq("id", hostId).single();
    expect(row?.bump_offer_id).toBe(bumpId);

    // Now prove it is live, not just stored: a real buyer, buying the host,
    // gets the bump saveOffer just attached — charged once, granted both.
    const email = `e2e_${Date.now()}@example.test`;
    const createdUser = await db.auth.admin.createUser({ email, email_confirm: true });
    const userId = createdUser.data.user!.id;
    users.push(userId);
    await db.from("users").insert({ id: userId, store_id: await getStoreId(), email });

    const start = await startOfferCheckout({ userId, email, offerId: hostId, bumpChoice: 0 });
    expect(start.ok).toBe(true);
    if (!start.ok) return;

    const piId = start.clientSecret.split("_secret_")[0];
    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/offer/complete",
    });
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true, orderId: expect.any(String) });

    // One charge for both — never a second, off-session charge for the bump.
    const pi = await stripe().paymentIntents.retrieve(piId);
    expect(pi.amount).toBe(7600);
    const all = await stripe().paymentIntents.list({ customer: pi.customer as string, limit: 10 });
    expect(all.data.filter((p) => p.status === "succeeded")).toHaveLength(1);

    const { data: orders } = await db
      .from("orders")
      .select("id, total_cents")
      .eq("user_id", userId);
    expect(orders).toHaveLength(1);
    const { data: items } = await db
      .from("order_items")
      .select("kind, offer_id, amount_cents")
      .eq("order_id", orders![0].id as string);
    expect(items).toHaveLength(2);
    // Both lines identified by name (kind + offer_id), not by elimination —
    // asserting only the bump line and "two items that sum to the total"
    // would also pass if the host's own line were mislabelled or attributed
    // to the wrong offer, as long as its amount happened to make the sum work.
    const hostItem = items!.find((i) => i.kind === "oto" && i.offer_id === hostId);
    const bumpItem = items!.find((i) => i.kind === "bump" && i.offer_id === bumpId);
    expect(hostItem?.amount_cents).toBe(4700); // the host's own share, not the combined total
    expect(bumpItem?.amount_cents).toBe(2900);
    const sum = items!.reduce((s, i) => s + (i.amount_cents as number), 0);
    expect(sum).toBe(orders![0].total_cents as number); // the lines add up to what was charged

    const { data: own } = await db.from("ownership").select("offer_id").eq("user_id", userId);
    expect(own).toHaveLength(2);

    // A refresh of the return page must not grant or bill again. No orderId
    // on this shape: the eligibility short-circuit that makes a refresh a
    // no-op returns before this call creates or reclaims any order of its own.
    expect(await completeOfferCheckout(piId)).toEqual({ ok: true });
    const { data: again } = await db.from("order_items").select("id").eq("order_id", orders![0].id as string);
    expect(again).toHaveLength(2);
  });

  /**
   * The reviewer's repro for the critical this task fixes: the picker's
   * filter used to hide a bump the moment it stopped qualifying, with no
   * clause keeping the CURRENTLY SELECTED one visible regardless. A host's
   * edit page would then render a <select> whose defaultValue matched no
   * <option>, the browser would silently fall back to "none", and the next
   * save of the host for ANY reason — this test uses a headline tweak —
   * posted an empty bumpOfferId that overwrote a bump nobody touched.
   *
   * `hostForm` here stands in for the browser: it posts bumpId unchanged,
   * because that is what the FIXED <select> now actually submits (the
   * disqualified option stays in the list — see the comment beside it in
   * offer-form.tsx). That is also exactly the shape saveOffer must not choke
   * on: bumpSlotError would refuse bumpId outright since the bump is now
   * inactive, so saveOffer only re-applies that guard when the posted id
   * actually differs from what is already stored (see the comment there).
   */
  it("keeps an unrelated save from silently erasing a bump that stopped qualifying", async () => {
    const db = createServiceClient();
    const bumpId = await mk(2900);
    const hostId = await mk(4700);

    const setup = await saveOffer({}, hostForm(hostId, 4700, bumpId));
    expect(setup.error, setup.error).toBeFalsy();

    // An edit to the BUMP, not the host — the host's own picker is never
    // touched. Ordinary enough that it happens without anyone thinking about
    // what else points at this offer.
    const { error: deactivateErr } = await db.from("offers").update({ active: false }).eq("id", bumpId);
    expect(deactivateErr).toBeNull();

    // Only the headline is actually changing; bumpId is reposted unchanged.
    const res = await saveOffer({}, hostForm(hostId, 4700, bumpId, "fixture, retitled"));
    expect(res.error, res.error).toBeFalsy();

    const { data: row } = await db
      .from("offers")
      .select("bump_offer_id, headline")
      .eq("id", hostId)
      .single();
    expect(row?.headline).toBe("fixture, retitled"); // the edit that was actually asked for went through
    expect(row?.bump_offer_id).toBe(bumpId); // and the untouched bump slot survived it
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of users) {
    await db.from("ownership").delete().eq("user_id", id);
    const { data: orders } = await db.from("orders").select("id").eq("user_id", id);
    for (const o of orders ?? []) await db.from("order_items").delete().eq("order_id", o.id as string);
    await db.from("orders").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
  // bump_offer_id is self-referencing across these two fixtures — null it
  // before deleting either, or the FK on whichever row survives longer blocks
  // its own delete.
  for (const id of made) await db.from("offers").update({ bump_offer_id: null }).eq("id", id);
  for (const id of made) await db.from("offers").delete().eq("id", id);
});
