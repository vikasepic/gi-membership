import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { createMember } from "@/lib/members";
import { allRows } from "@/lib/traffic";

/**
 * Who can open one course, and one person added to or removed from it (the
 * Access tab, asked 3-4 Nov 2026). Spec:
 * docs/superpowers/specs/2026-11-04-course-access-tab-design.md.
 *
 * The exceptions live in `course_access` (0098). What they do to access is
 * decided in one place, coursesForUser; this file only lists and writes them.
 */

export type CourseAccessRow = { userId: string; email: string; name: string | null; how: string[]; since: string };
export type CourseRemovedRow = { userId: string; email: string; name: string | null; removedBy: string; at: string };

type Holding = {
  user_id: string;
  product_id: string | null;
  offer_id: string | null;
  source: string;
  created_at: string;
};

/** The products and offers that give this course. */
async function givers(courseId: string): Promise<{ productIds: string[]; offerIds: string[] }> {
  const db = createServiceClient();
  const [p, o] = await Promise.all([
    db.from("product_courses").select("product_id").eq("course_id", courseId),
    db.from("offer_courses").select("offer_id").eq("course_id", courseId),
  ]);
  if (p.error) throw new Error(`course access (products): ${p.error.message}`);
  if (o.error) throw new Error(`course access (offers): ${o.error.message}`);
  return {
    productIds: (p.data ?? []).map((r) => r.product_id as string),
    offerIds: (o.data ?? []).map((r) => r.offer_id as string),
  };
}

/**
 * Ownership rows that still give this course (not canceled, the rule
 * coursesForUser uses), optionally for one person. All of them: PostgREST stops
 * at 1000 without saying so.
 */
async function holdings(courseId: string, userId?: string): Promise<Holding[]> {
  const { productIds, offerIds } = await givers(courseId);
  const either = [
    productIds.length ? `product_id.in.(${productIds.join(",")})` : null,
    offerIds.length ? `offer_id.in.(${offerIds.join(",")})` : null,
  ].filter(Boolean);
  if (either.length === 0) return [];
  const db = createServiceClient();
  return allRows<Holding>((from, to) => {
    let q = db
      .from("ownership")
      .select("user_id, product_id, offer_id, source, created_at")
      .neq("status", "canceled")
      .or(either.join(","));
    if (userId) q = q.eq("user_id", userId);
    return q.order("created_at").order("id").range(from, to);
  });
}

export async function listCourseAccess(
  courseId: string,
): Promise<{ people: CourseAccessRow[]; removed: CourseRemovedRow[] }> {
  const db = createServiceClient();
  const [held, { data: exceptions, error }] = await Promise.all([
    holdings(courseId),
    db.from("course_access").select("user_id, kind, granted_by, created_at").eq("course_id", courseId).order("created_at"),
  ]);
  if (error) throw new Error(`listCourseAccess: ${error.message}`);

  const productIds = [...new Set(held.map((h) => h.product_id).filter(Boolean))] as string[];
  const offerIds = [...new Set(held.map((h) => h.offer_id).filter(Boolean))] as string[];
  const userIds = [...new Set([...held.map((h) => h.user_id), ...(exceptions ?? []).map((e) => e.user_id as string)])];
  const [products, offers, users] = await Promise.all([
    productIds.length ? db.from("products").select("id, title").in("id", productIds) : Promise.resolve({ data: [] }),
    offerIds.length ? db.from("offers").select("id, name").in("id", offerIds) : Promise.resolve({ data: [] }),
    userIds.length ? db.from("users").select("id, email, username").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const title = new Map((products.data ?? []).map((p) => [p.id as string, p.title as string]));
  const offerName = new Map((offers.data ?? []).map((o) => [o.id as string, o.name as string]));
  const person = new Map((users.data ?? []).map((u) => [u.id as string, u]));

  const people = new Map<string, CourseAccessRow>();
  const removed: CourseRemovedRow[] = [];
  const removedIds = new Set<string>();
  for (const e of exceptions ?? []) {
    if (e.kind !== "remove") continue;
    const u = person.get(e.user_id as string);
    removedIds.add(e.user_id as string);
    removed.push({
      userId: e.user_id as string,
      email: (u?.email as string) ?? "",
      name: (u?.username as string | null) ?? null,
      removedBy: e.granted_by as string,
      at: e.created_at as string,
    });
  }

  const add = (userId: string, label: string, at: string) => {
    if (removedIds.has(userId)) return;
    const u = person.get(userId);
    const row = people.get(userId) ?? {
      userId,
      email: (u?.email as string) ?? "",
      name: (u?.username as string | null) ?? null,
      how: [],
      since: at,
    };
    if (!row.how.includes(label)) row.how.push(label);
    if (new Date(at) < new Date(row.since)) row.since = at;
    people.set(userId, row);
  };
  for (const h of held) {
    // An offer row reads as the offer, even when it reached the course through
    // the product the offer grants: that is how they got it.
    const label = h.offer_id
      ? (offerName.get(h.offer_id) ?? "An offer")
      : `${h.source === "grant" ? "Granted" : "Bought"} ${title.get(h.product_id!) ?? "a product"}`;
    add(h.user_id, label, h.created_at);
  }
  for (const e of exceptions ?? []) {
    if (e.kind === "grant") add(e.user_id as string, `Added by ${e.granted_by}`, e.created_at as string);
  }

  const sorted = [...people.values()].sort(
    (a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email) || a.email.localeCompare(b.email),
  );
  return { people: sorted, removed };
}

/**
 * Give one person this one course: no product, no offer, nothing else. An
 * unknown email becomes a member the way Add member does it. The grant is
 * written even when a purchase already gives the course, so it survives a
 * later refund: the admin asked for "add", which is a promise.
 */
export async function addCourseAccess(args: {
  courseId: string;
  email: string;
  fullName: string | null;
  by: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const member = await createMember({ email: args.email, fullName: args.fullName });
  if (!member.ok) return { ok: false, error: member.error };
  const email = args.email.trim().toLowerCase();

  const db = createServiceClient();
  const { data: before } = await db
    .from("course_access")
    .select("kind")
    .eq("user_id", member.userId)
    .eq("course_id", args.courseId)
    .maybeSingle();
  const hadIt =
    before?.kind === "grant" || (before?.kind !== "remove" && (await holdings(args.courseId, member.userId)).length > 0);

  const { error } = await db.from("course_access").upsert(
    {
      store_id: await getStoreId(),
      user_id: member.userId,
      course_id: args.courseId,
      kind: "grant",
      granted_by: args.by,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,course_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: hadIt ? `${email} already had this course` : `Added ${email}` };
}

/**
 * Take this one course from one person, whatever gave it. Billing and every
 * other course they hold are left alone. When nothing but a hand grant gave
 * it, the grant row is simply deleted, so nothing lingers.
 */
export async function removeCourseAccess(args: { courseId: string; userId: string; by: string }): Promise<void> {
  const db = createServiceClient();
  if ((await holdings(args.courseId, args.userId)).length === 0) {
    const { error } = await db.from("course_access").delete().eq("user_id", args.userId).eq("course_id", args.courseId);
    if (error) throw new Error(`removeCourseAccess: ${error.message}`);
    return;
  }
  const { error } = await db.from("course_access").upsert(
    {
      store_id: await getStoreId(),
      user_id: args.userId,
      course_id: args.courseId,
      kind: "remove",
      granted_by: args.by,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,course_id" },
  );
  if (error) throw new Error(`removeCourseAccess: ${error.message}`);
}

/** Lift a removal. Whatever they bought gives the course again. */
export async function giveBackCourseAccess(args: { courseId: string; userId: string }): Promise<void> {
  const { error } = await createServiceClient()
    .from("course_access")
    .delete()
    .eq("user_id", args.userId)
    .eq("course_id", args.courseId)
    .eq("kind", "remove");
  if (error) throw new Error(`giveBackCourseAccess: ${error.message}`);
}

/**
 * A purchase gives back a course the admin took away (owner, 4 Nov 2026):
 * nobody is charged for a course they cannot open. Called only where a
 * purchase writes its ownership row, never on a renewal or an admin grant,
 * so a monthly charge does not undo a removal.
 *
 * Best-effort, like tagAccessGranted: the card is already charged and a failed
 * delete must not fail a paid order. The admin can still Give back by hand.
 */
export async function liftRemovals(
  userId: string,
  from: { productId?: string | null; offerId?: string | null },
): Promise<void> {
  try {
    const db = createServiceClient();
    const [p, o] = await Promise.all([
      from.productId
        ? db.from("product_courses").select("course_id").eq("product_id", from.productId)
        : Promise.resolve({ data: [], error: null }),
      from.offerId
        ? db.from("offer_courses").select("course_id").eq("offer_id", from.offerId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (p.error || o.error) throw new Error((p.error ?? o.error)!.message);
    const courseIds = [...(p.data ?? []), ...(o.data ?? [])].map((r) => r.course_id as string);
    if (courseIds.length === 0) return;
    const { error } = await db
      .from("course_access")
      .delete()
      .eq("user_id", userId)
      .eq("kind", "remove")
      .in("course_id", courseIds);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("liftRemovals", userId, from, err);
  }
}
