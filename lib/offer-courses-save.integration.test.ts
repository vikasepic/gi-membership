import { describe, it, expect, afterAll, vi } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

/**
 * The admin form end to end: an offer's Courses checklist reaches
 * offer_courses, and a courses-only offer without a course is refused rather
 * than saved as something that gives the buyer nothing.
 *
 * Through the real saveOffer and the real database, as offer-upsell-save does:
 * a mocked write would pass whether or not the courses were stored.
 */
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const offers: string[] = [];
const courses: string[] = [];

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: async () => {} }));

const { saveOffer } = await import("@/app/admin/offers/actions");

async function course(): Promise<string> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("courses")
    .insert({ store_id: await getStoreId(), slug: `zz-oc-save-${crypto.randomUUID()}`, title: "zz course", status: "published" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`fixture: ${error?.message}`);
  courses.push(data.id as string);
  return data.id as string;
}

async function offer(): Promise<string> {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  offers.push(id);
  const { error } = await db.from("offers").insert({
    id, store_id: await getStoreId(), key: `zz-oc-save-${id}`, name: "zz offer-courses save",
    grant_type: "subscription", grant_app_id: APP, grant_entitlement_key: "content-engine",
    billing_type: "one_time", price_cents: 2900, currency: "usd", headline: "fixture", active: true,
  });
  if (error) throw new Error(`fixture: ${error.message}`);
  return id;
}

/** What the real form posts: one `courseIds` entry per ticked course. */
function form(id: string, grant: Record<string, string>, courseIds: string[]): FormData {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("key", `zz-oc-save-${id}`);
  fd.set("name", "zz offer-courses save");
  for (const [k, v] of Object.entries(grant)) fd.set(k, v);
  for (const c of courseIds) fd.append("courseIds", c);
  fd.set("headline", "fixture");
  fd.set(
    "prices",
    JSON.stringify([
      { id: "p", label: "", billingType: "one_time", interval: null, intervalCount: 1, trialDays: null, priceCents: 2900, compareAtCents: null, archived: false },
    ]),
  );
  fd.set("currency", "usd");
  fd.set("acceptLabel", "Yes, add this");
  fd.set("declineLabel", "No thanks");
  fd.set("active", "on");
  for (const empty of [
    "grantProductId", "grantAppId", "grantEntitlementKey", "description", "imageUrl", "bullets", "pageAltOfferId",
    "bumpOfferId", "upsellOfferId", "activecampaignTagId", "activecampaignTrialTagId", "activecampaignCancelledTagId",
    "otoBody", "otoVideoUrl",
  ]) {
    if (!fd.has(empty)) fd.set(empty, "");
  }
  return fd;
}

const linked = async (offerId: string) => {
  const { data } = await createServiceClient()
    .from("offer_courses")
    .select("course_id")
    .eq("offer_id", offerId)
    .order("sort_order");
  return (data ?? []).map((r) => r.course_id as string);
};

describe.skipIf(!canRun)("an offer's courses, from the admin form (integration)", () => {
  it("saves a courses-only offer with every course ticked", async () => {
    const [a, b] = [await course(), await course()];
    const id = await offer();
    const res = await saveOffer({}, form(id, { grantType: "course" }, [a, b]));
    expect(res.error, res.error).toBeFalsy();
    const { data: row } = await createServiceClient()
      .from("offers")
      .select("grant_type, grant_app_id, grant_product_id")
      .eq("id", id)
      .single();
    expect(row).toEqual({ grant_type: "course", grant_app_id: null, grant_product_id: null });
    expect(await linked(id)).toEqual([a, b]);
  });

  it("refuses a courses-only offer with no course, and says why", async () => {
    const id = await offer();
    const res = await saveOffer({}, form(id, { grantType: "course" }, []));
    expect(res.error).toMatch(/course/i);
  });

  it("lets an app offer carry courses too, and clears them when unticked", async () => {
    const c = await course();
    const id = await offer();
    const app = { grantType: "subscription", grantAppId: APP, grantEntitlementKey: "content-engine" };
    expect((await saveOffer({}, form(id, app, [c]))).error).toBeFalsy();
    expect(await linked(id)).toEqual([c]);
    expect((await saveOffer({}, form(id, app, []))).error).toBeFalsy();
    expect(await linked(id)).toEqual([]);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of offers) await db.from("offers").delete().eq("id", id);
  for (const id of courses) await db.from("courses").delete().eq("id", id);
});
