import { describe, it, expect, afterAll, vi } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

/**
 * The admin picker end to end: saveOffer persists upsell_offer_id.
 *
 * Deliberately NOT a raw `upsell_offer_id` insert for the host fixture — the
 * same reasoning as offer-bump-e2e.integration.test.ts's identical comment
 * about the bump: seeding it directly would pass identically whether or not
 * toOfferRow actually writes the column, which is exactly the shape of bug
 * that shipped for the bump before that write existed. Routing setup through
 * the real saveOffer is what makes this test able to fail when the picker
 * silently doesn't save.
 */
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];

// saveOffer opens with requireAdmin() and closes with revalidatePath() — a
// signed-in cookie and a Next render tree, neither of which exists under
// vitest. Mocked the same way offer-bump-e2e (and offer-prices-save.test.ts)
// already call this exact action outside of a request. @/lib/admin is
// deliberately left UNMOCKED: a mocked updateOffer would only prove saveOffer
// threads upsellOfferId into its input object, not that the column in the
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
    id, store_id: await getStoreId(), key: `zz-upsell-e2e-${id}`, name: "zz upsell e2e fixture",
    grant_type: "subscription", grant_app_id: APP,
    grant_entitlement_key: "content-engine", grant_channels: [],
    billing_type: "one_time", price_cents: cents, currency: "usd",
    headline: "fixture", description: "fixture", active: true,
  });
  if (error) throw new Error(`fixture: ${error.message}`);
  return id;
}

/**
 * What the real offer form posts when an admin points the upsell picker at
 * an offer. `headline` is a parameter so a caller can prove an edit to some
 * OTHER field still round-trips the same upsellOfferId unchanged — see the
 * "only re-validate a CHANGED id" comment beside the guard in actions.ts.
 */
function hostForm(hostId: string, cents: number, upsellOfferId: string, headline = "fixture"): FormData {
  const fd = new FormData();
  fd.set("id", hostId);
  fd.set("key", `zz-upsell-e2e-${hostId}`); // unchanged — proving the upsell slot, not a rename
  fd.set("name", "zz upsell e2e fixture");
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
  fd.set("upsellOfferId", upsellOfferId);
  // The schema's `active` preprocessing defaults absent to false — leaving
  // this out would deactivate the host offer on its own save.
  fd.set("active", "on");
  for (const empty of [
    "grantProductId", "description", "imageUrl", "bullets", "pageAltOfferId", "bumpOfferId",
    "activecampaignTagId", "activecampaignTrialTagId", "activecampaignCancelledTagId",
    "otoBody", "otoVideoUrl",
  ]) {
    fd.set(empty, "");
  }
  return fd;
}

describe.skipIf(!canRun)("setting an offer's upsell from the admin form (integration)", () => {
  it("saves through saveOffer", async () => {
    const db = createServiceClient();
    const upsellId = await mk(2900);
    const hostId = await mk(4700);

    const res = await saveOffer({}, hostForm(hostId, 4700, upsellId));
    expect(res.error, res.error).toBeFalsy();

    // THE regression this test exists to catch: without toOfferRow writing
    // upsell_offer_id, this comes back null even though saveOffer reported
    // success — the picker would validate and then silently fail to save.
    const { data: row } = await db.from("offers").select("upsell_offer_id").eq("id", hostId).single();
    expect(row?.upsell_offer_id).toBe(upsellId);
  });

  /**
   * Mirrors offer-bump-e2e's identical repro for the bump picker: the picker
   * keeps the CURRENTLY SELECTED upsell visible even once it stops qualifying
   * (deactivated by an edit to THAT offer), so a save that touches nothing
   * about the upsell re-posts its id unchanged. saveOffer must not choke on
   * that — upsellSlotError would refuse the id outright since the upsell is
   * now inactive, so saveOffer only re-applies the guard when the posted id
   * actually differs from what is already stored.
   */
  it("keeps an unrelated save from silently erasing an upsell that stopped qualifying", async () => {
    const db = createServiceClient();
    const upsellId = await mk(2900);
    const hostId = await mk(4700);

    const setup = await saveOffer({}, hostForm(hostId, 4700, upsellId));
    expect(setup.error, setup.error).toBeFalsy();

    // An edit to the UPSELL, not the host — the host's own picker is never
    // touched. Ordinary enough that it happens without anyone thinking about
    // what else points at this offer.
    const { error: deactivateErr } = await db.from("offers").update({ active: false }).eq("id", upsellId);
    expect(deactivateErr).toBeNull();

    // Only the headline is actually changing; upsellId is reposted unchanged.
    const res = await saveOffer({}, hostForm(hostId, 4700, upsellId, "fixture, retitled"));
    expect(res.error, res.error).toBeFalsy();

    const { data: row } = await db.from("offers").select("upsell_offer_id, headline").eq("id", hostId).single();
    expect(row?.headline).toBe("fixture, retitled"); // the edit that was actually asked for went through
    expect(row?.upsell_offer_id).toBe(upsellId); // and the untouched upsell slot survived it
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  // upsell_offer_id is cross-referencing across these two fixtures — null it
  // before deleting either, or the FK on whichever row survives longer blocks
  // its own delete.
  for (const id of made) await db.from("offers").update({ upsell_offer_id: null }).eq("id", id);
  for (const id of made) await db.from("offers").delete().eq("id", id);
});
