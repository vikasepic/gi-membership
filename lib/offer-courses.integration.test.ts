import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getOffer } from "@/lib/store";
import { coursesForUser, coursesForOffer, setOfferCourses, userOwnsCourse } from "@/lib/courses";
import { grantOfferOwnership } from "@/lib/checkout";
import { accessForMember } from "@/lib/members";

/**
 * An offer that gives courses directly, with no product in between (asked
 * 14 Oct 2026). See docs/superpowers/specs/2026-10-14-offer-courses-design.md.
 *
 * Real rows: the whole question is which ownership rows the course lookup
 * lands on, and a mock of that would be a test of my opinion about it.
 */
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";

describe.skipIf(!canRun)("courses granted by an offer (integration)", () => {
  let storeId: string;
  let userId: string;
  const offerIds: string[] = [];
  const courseIds: string[] = [];
  const tag = () => `zz-offer-courses-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  async function course(): Promise<string> {
    const db = createServiceClient();
    const { data, error } = await db
      .from("courses")
      .insert({ store_id: storeId, slug: tag(), title: "zz offer course", status: "published" })
      .select("id")
      .single();
    if (error || !data) throw new Error(`test fixture: course: ${error?.message}`);
    courseIds.push(data.id as string);
    return data.id as string;
  }

  async function offer(grant: "course" | "subscription"): Promise<string> {
    const db = createServiceClient();
    const id = crypto.randomUUID();
    const { error } = await db.from("offers").insert({
      id,
      store_id: storeId,
      key: tag(),
      name: "zz offer-courses fixture",
      grant_type: grant,
      grant_app_id: grant === "subscription" ? APP : null,
      grant_entitlement_key: grant === "subscription" ? "content-engine" : null,
      billing_type: "one_time",
      price_cents: 2900,
      currency: "usd",
      headline: "fixture",
    });
    if (error) throw new Error(`test fixture: offer: ${error.message}`);
    offerIds.push(id);
    return id;
  }

  const holding = (offerId: string, status: string, extra: Record<string, unknown> = {}) => ({
    store_id: storeId,
    user_id: userId,
    offer_id: offerId,
    source: "grant",
    status,
    ...extra,
  });

  beforeEach(async () => {
    const db = createServiceClient();
    storeId = await getStoreId();
    userId = crypto.randomUUID();
    await db.from("users").insert({ id: userId, store_id: storeId, email: `${tag()}@example.test` });
  });

  afterEach(async () => {
    const db = createServiceClient();
    // FK order: ownership names the offer, offer_courses names both.
    await db.from("ownership").delete().eq("user_id", userId);
    await db.from("users").delete().eq("id", userId);
    for (const id of offerIds.splice(0)) await db.from("offers").delete().eq("id", id);
    for (const id of courseIds.splice(0)) await db.from("courses").delete().eq("id", id);
  });

  it("keeps the courses an offer is given, in order", async () => {
    const [a, b] = [await course(), await course()];
    const o = await offer("course");
    await setOfferCourses(o, [b, a]);
    expect((await coursesForOffer(o)).map((c) => c.id)).toEqual([b, a]);
  });

  it("opens an offer's courses to someone holding it, courses-only", async () => {
    const c = await course();
    const o = await offer("course");
    await setOfferCourses(o, [c]);
    const db = createServiceClient();
    const { error } = await db.from("ownership").insert(holding(o, "active"));
    expect(error).toBeNull();
    expect(await userOwnsCourse(userId, c)).toBe(true);
  });

  it("opens them alongside an app the same offer grants", async () => {
    const c = await course();
    const o = await offer("subscription");
    await setOfferCourses(o, [c]);
    const db = createServiceClient();
    await db.from("ownership").insert(holding(o, "trialing", { app_id: APP }));
    expect((await coursesForUser(userId)).map((x) => x.id)).toContain(c);
  });

  it("takes them away when the offer is refunded or cancelled", async () => {
    const c = await course();
    const o = await offer("course");
    await setOfferCourses(o, [c]);
    const db = createServiceClient();
    await db.from("ownership").insert(holding(o, "canceled"));
    expect(await userOwnsCourse(userId, c)).toBe(false);
  });

  it("grants a courses-only offer, and revives it on a second purchase", async () => {
    const c = await course();
    const o = await offer("course");
    await setOfferCourses(o, [c]);
    const sold = (await getOffer(o))!;
    await grantOfferOwnership(storeId, userId, sold, "grant", null);
    expect(await userOwnsCourse(userId, c)).toBe(true);

    const db = createServiceClient();
    await db.from("ownership").update({ status: "canceled" }).eq("user_id", userId);
    expect(await userOwnsCourse(userId, c)).toBe(false);
    await grantOfferOwnership(storeId, userId, sold, "grant", null);
    expect(await userOwnsCourse(userId, c)).toBe(true);
    const { data: rows } = await db.from("ownership").select("id").eq("user_id", userId);
    expect(rows).toHaveLength(1);
  });
  it("shows on the member's admin page under the offer's name", async () => {
    const o = await offer("course");
    const db = createServiceClient();
    await db.from("ownership").insert(holding(o, "active"));
    const [row] = await accessForMember(userId);
    expect(row.label).toBe("zz offer-courses fixture (courses)");
    expect(row.grantValue).toBe(`offer:${o}`);
  });
});
