import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { coursesForUser } from "@/lib/courses";
import { listCourseAccess, addCourseAccess, removeCourseAccess, giveBackCourseAccess } from "@/lib/course-access";

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
  let email: string;
  const productIds: string[] = [];
  const offerIds: string[] = [];
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const newEmails: string[] = [];
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
    email = `${tag()}@example.test`;
    const { error } = await createServiceClient().from("users").insert({ id: userId, store_id: storeId, email });
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
    // Members addCourseAccess created: profile row, then the auth user.
    for (const email of newEmails.splice(0)) {
      const { data } = await db.from("users").select("id").eq("email", email).maybeSingle();
      if (!data) continue;
      await db.from("course_access").delete().eq("user_id", data.id);
      await db.from("users").delete().eq("id", data.id);
      await db.auth.admin.deleteUser(data.id as string);
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

  const titleOf = async (productId: string) =>
    (await createServiceClient().from("products").select("title").eq("id", productId).single()).data!.title as string;
  const nameOf = async (offerId: string) =>
    (await createServiceClient().from("offers").select("name").eq("id", offerId).single()).data!.name as string;
  const rowsFor = async (courseId: string) =>
    (await createServiceClient().from("course_access").select("kind").eq("user_id", userId).eq("course_id", courseId)).data ?? [];

  describe("listCourseAccess", () => {
    it("labels every source on one row", async () => {
      const c = await course();
      const p = await product(c);
      const o = await offer(c);
      await owns({ product_id: p });
      await owns({ offer_id: o, source: "grant" });
      await access(c, "grant");
      const { people } = await listCourseAccess(c);
      expect(people).toHaveLength(1);
      expect(people[0].userId).toBe(userId);
      expect(people[0].email).toBe(email);
      expect(people[0].how).toEqual([`Bought ${await titleOf(p)}`, await nameOf(o), "Added by zz-test"]);
    });

    it("says Granted for an admin-granted product", async () => {
      const c = await course();
      const p = await product(c);
      await owns({ product_id: p, source: "grant" });
      expect((await listCourseAccess(c)).people[0].how).toEqual([`Granted ${await titleOf(p)}`]);
    });

    it("leaves out a canceled purchase", async () => {
      const c = await course();
      await owns({ product_id: await product(c), status: "canceled" });
      expect((await listCourseAccess(c)).people).toEqual([]);
    });

    it("puts a removed person under Removed only", async () => {
      const c = await course();
      await owns({ product_id: await product(c) });
      await access(c, "remove");
      const { people, removed } = await listCourseAccess(c);
      expect(people).toEqual([]);
      expect(removed).toHaveLength(1);
      expect(removed[0]).toMatchObject({ userId, email, removedBy: "zz-test" });
    });

    it("since is the earliest source date", async () => {
      const c = await course();
      const p = await product(c);
      await owns({ product_id: p, created_at: "2026-01-02T00:00:00Z" });
      await access(c, "grant");
      expect(new Date((await listCourseAccess(c)).people[0].since).toISOString()).toBe("2026-01-02T00:00:00.000Z");
    });
  });

  describe("add, remove, give back", () => {
    it("add creates the member and grants just that course", async () => {
      const [c, other] = [await course(), await course()];
      await product(c, other);
      const fresh = `${tag()}@example.test`;
      newEmails.push(fresh);
      const res = await addCourseAccess({ courseId: c, email: fresh.toUpperCase(), fullName: null, by: "zz-admin" });
      expect(res).toEqual({ ok: true, message: `Added ${fresh}` });
      const { data: u } = await createServiceClient().from("users").select("id").eq("email", fresh).single();
      expect((await coursesForUser(u!.id as string)).map((x) => x.id)).toEqual([c]);
    });

    it("add reports someone who already had it, and still writes the grant", async () => {
      const c = await course();
      await owns({ product_id: await product(c) });
      const res = await addCourseAccess({ courseId: c, email, fullName: null, by: "zz-admin" });
      expect(res).toEqual({ ok: true, message: `${email} already had this course` });
      expect(await rowsFor(c)).toEqual([{ kind: "grant" }]);
    });

    it("re-adding a removed person puts them back in the list", async () => {
      const c = await course();
      await owns({ product_id: await product(c) });
      await removeCourseAccess({ courseId: c, userId, by: "zz-admin" });
      await addCourseAccess({ courseId: c, email, fullName: null, by: "zz-admin" });
      const { people, removed } = await listCourseAccess(c);
      expect(removed).toEqual([]);
      expect(people.map((p) => p.userId)).toEqual([userId]);
    });

    it("remove writes a remove row when a purchase gives it", async () => {
      const c = await course();
      await owns({ product_id: await product(c) });
      await removeCourseAccess({ courseId: c, userId, by: "zz-admin" });
      expect(await rowsFor(c)).toEqual([{ kind: "remove" }]);
      expect(await ids()).toEqual([]);
    });

    it("remove deletes the row when only a hand grant gave it", async () => {
      const c = await course();
      await access(c, "grant");
      await removeCourseAccess({ courseId: c, userId, by: "zz-admin" });
      expect(await rowsFor(c)).toEqual([]);
      expect(await ids()).toEqual([]);
    });

    it("one remove hides a course held two ways, one give back restores it", async () => {
      const c = await course();
      await owns({ product_id: await product(c) });
      await owns({ offer_id: await offer(c) });
      await removeCourseAccess({ courseId: c, userId, by: "zz-admin" });
      expect(await ids()).toEqual([]);
      await giveBackCourseAccess({ courseId: c, userId });
      expect(await ids()).toEqual([c]);
    });

    it("give back leaves a hand grant alone", async () => {
      const c = await course();
      await access(c, "grant");
      await giveBackCourseAccess({ courseId: c, userId });
      expect(await rowsFor(c)).toEqual([{ kind: "grant" }]);
    });
  });
});
