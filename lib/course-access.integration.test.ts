import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { coursesForUser } from "@/lib/courses";

/**
 * One person added to, or removed from, one course (asked 3-4 Nov 2026).
 * See docs/superpowers/specs/2026-11-04-course-access-tab-design.md.
 *
 * Real rows: the question is which rows the access rule lands on.
 */
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!canRun)("course access (integration)", () => {
  let storeId: string;
  let userId: string;
  const productIds: string[] = [];
  const offerIds: string[] = [];
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const tag = () => `zz-course-access-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  async function course(status: "published" | "draft" = "published"): Promise<string> {
    const { data, error } = await createServiceClient()
      .from("courses")
      .insert({ store_id: storeId, slug: tag(), title: "zz access course", status })
      .select("id")
      .single();
    if (error || !data) throw new Error(`test fixture: course: ${error?.message}`);
    courseIds.push(data.id as string);
    return data.id as string;
  }

  async function product(...gives: string[]): Promise<string> {
    const db = createServiceClient();
    const id = crypto.randomUUID();
    const { error } = await db
      .from("products")
      .insert({ id, store_id: storeId, slug: tag(), title: `zz product ${id.slice(0, 4)}`, price_cents: 2700, status: "published" });
    if (error) throw new Error(`test fixture: product: ${error.message}`);
    productIds.push(id);
    if (gives.length) {
      const { error: linkErr } = await db
        .from("product_courses")
        .insert(gives.map((course_id) => ({ product_id: id, course_id })));
      if (linkErr) throw new Error(`test fixture: product_courses: ${linkErr.message}`);
    }
    return id;
  }

  async function offer(...gives: string[]): Promise<string> {
    const db = createServiceClient();
    const id = crypto.randomUUID();
    const { error } = await db.from("offers").insert({
      id,
      store_id: storeId,
      key: tag(),
      name: `zz offer ${id.slice(0, 4)}`,
      grant_type: "course",
      billing_type: "one_time",
      price_cents: 2900,
      currency: "usd",
      headline: "fixture",
    });
    if (error) throw new Error(`test fixture: offer: ${error.message}`);
    offerIds.push(id);
    if (gives.length) {
      const { error: linkErr } = await db
        .from("offer_courses")
        .insert(gives.map((course_id) => ({ offer_id: id, course_id })));
      if (linkErr) throw new Error(`test fixture: offer_courses: ${linkErr.message}`);
    }
    return id;
  }

  async function owns(row: Record<string, unknown>, who = userId) {
    const { error } = await createServiceClient()
      .from("ownership")
      .insert({ store_id: storeId, user_id: who, source: "purchase", status: "active", ...row });
    if (error) throw new Error(`test fixture: ownership: ${error.message}`);
  }

  async function access(courseId: string, kind: "grant" | "remove", who = userId) {
    const { error } = await createServiceClient()
      .from("course_access")
      .insert({ store_id: storeId, user_id: who, course_id: courseId, kind, granted_by: "zz-test" });
    if (error) throw new Error(`test fixture: course_access: ${error.message}`);
  }

  const ids = async (who = userId) => (await coursesForUser(who)).map((c) => c.id).sort();

  beforeEach(async () => {
    storeId = await getStoreId();
    userId = crypto.randomUUID();
    userIds.push(userId);
    const { error } = await createServiceClient()
      .from("users")
      .insert({ id: userId, store_id: storeId, email: `${tag()}@example.test` });
    if (error) throw new Error(`test fixture: user: ${error.message}`);
  });

  afterEach(async () => {
    const db = createServiceClient();
    // FK order: access and ownership name users, courses, products, offers.
    for (const id of userIds.splice(0)) {
      await db.from("course_access").delete().eq("user_id", id);
      await db.from("ownership").delete().eq("user_id", id);
      await db.from("users").delete().eq("id", id);
    }
    for (const id of productIds.splice(0)) await db.from("products").delete().eq("id", id);
    for (const id of offerIds.splice(0)) await db.from("offers").delete().eq("id", id);
    for (const id of courseIds.splice(0)) await db.from("courses").delete().eq("id", id);
  });

  describe("coursesForUser with course_access", () => {
    it("a grant alone opens the course for someone who owns nothing", async () => {
      const c = await course();
      await access(c, "grant");
      expect(await ids()).toEqual([c]);
    });

    it("a grant does not open a draft course", async () => {
      const c = await course("draft");
      await access(c, "grant");
      expect(await ids()).toEqual([]);
    });

    it("a remove beats a product", async () => {
      const c = await course();
      await owns({ product_id: await product(c) });
      await access(c, "remove");
      expect(await ids()).toEqual([]);
    });

    it("a remove beats an offer", async () => {
      const c = await course();
      await owns({ offer_id: await offer(c) });
      await access(c, "remove");
      expect(await ids()).toEqual([]);
    });

    it("a remove on one course leaves the product's other course open", async () => {
      const [a, b] = [await course(), await course()];
      await owns({ product_id: await product(a, b) });
      await access(a, "remove");
      expect(await ids()).toEqual([b]);
    });

    it("a canceled purchase plus a grant still opens it", async () => {
      const c = await course();
      await owns({ product_id: await product(c), status: "canceled" });
      await access(c, "grant");
      expect(await ids()).toEqual([c]);
    });
  });
});
