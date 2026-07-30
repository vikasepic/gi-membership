import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import { getStoreId } from "@/lib/store";
import type { Attachment } from "@/lib/curriculum";

// Courses are CONTENT. Products are what you sell. They are joined many-to-many
// through product_courses, so one course can be sold through several products
// and one bundle product can grant several courses.

export type CourseStatus = "draft" | "published";
// What the course IS, for the storefront badge. This is the single source of
// truth for a product's type now — the product no longer carries one.
export type CourseType = "video" | "audio" | "pdf" | "text";

export type Course = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  coverPath: string | null;
  chapterLabel: string;
  lessonLabel: string;
  type: CourseType;
  status: CourseStatus;
  // Direct content, for a course with no chapters/lessons. Used by the student
  // page only when the course has no course_items.
  attachments: Attachment[];
  videoEmbedUrl: string | null;
};

export const COURSE_COLUMNS =
  "id, slug, title, subtitle, description, cover_path, chapter_label, lesson_label, type, status, attachments, video_embed_url";

export async function listCourses(): Promise<Course[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("courses")
    .select(COURSE_COLUMNS)
    .eq("store_id", await getStoreId())
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listCourses: ${error.message}`);
  return camelize<Course[]>(data ?? []);
}

export async function getCourse(id: string): Promise<Course | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("courses").select(COURSE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getCourse: ${error.message}`);
  return data ? camelize<Course>(data) : null;
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("courses")
    .select(COURSE_COLUMNS)
    .eq("store_id", await getStoreId())
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getCourseBySlug: ${error.message}`);
  return data ? camelize<Course>(data) : null;
}

export type CourseInput = {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  chapterLabel: string;
  lessonLabel: string;
  type: CourseType;
  status: CourseStatus;
};

function toRow(input: CourseInput, storeId: string) {
  return {
    store_id: storeId,
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    chapter_label: input.chapterLabel,
    lesson_label: input.lessonLabel,
    type: input.type,
    status: input.status,
  };
}

export async function createCourse(input: CourseInput): Promise<string> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("courses")
    .insert(toRow(input, await getStoreId()))
    .select("id")
    .single();
  if (error) throw new Error(`createCourse: ${error.message}`);
  return data.id as string;
}

export async function updateCourse(id: string, input: CourseInput): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("courses").update(toRow(input, await getStoreId())).eq("id", id);
  if (error) throw new Error(`updateCourse: ${error.message}`);
}

export async function deleteCourse(id: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("courses").delete().eq("id", id);
  if (error) throw new Error(`deleteCourse: ${error.message}`);
}

export async function setCourseCover(id: string, coverPath: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("courses").update({ cover_path: coverPath }).eq("id", id);
  if (error) throw new Error(`setCourseCover: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Direct course content (a course with no chapters — just a file / video)
// ---------------------------------------------------------------------------

export async function addCourseAttachment(courseId: string, a: Attachment): Promise<void> {
  const db = createServiceClient();
  const { data } = await db.from("courses").select("attachments").eq("id", courseId).maybeSingle();
  const list = ((data?.attachments as Attachment[]) ?? []).concat(a);
  const { error } = await db.from("courses").update({ attachments: list }).eq("id", courseId);
  if (error) throw new Error(`addCourseAttachment: ${error.message}`);
}

export async function removeCourseAttachment(courseId: string, path: string): Promise<void> {
  const db = createServiceClient();
  const { data } = await db.from("courses").select("attachments").eq("id", courseId).maybeSingle();
  const list = ((data?.attachments as Attachment[]) ?? []).filter((a) => a.path !== path);
  const { error } = await db.from("courses").update({ attachments: list }).eq("id", courseId);
  if (error) throw new Error(`removeCourseAttachment: ${error.message}`);
}

export async function setCourseVideoEmbed(courseId: string, url: string | null): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("courses").update({ video_embed_url: url }).eq("id", courseId);
  if (error) throw new Error(`setCourseVideoEmbed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Product <-> course assignment
// ---------------------------------------------------------------------------

export async function coursesForProduct(productId: string): Promise<Course[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("product_courses")
    .select(`course_id, courses (${COURSE_COLUMNS})`)
    .eq("product_id", productId);
  if (error) throw new Error(`coursesForProduct: ${error.message}`);
  const rows = (data ?? []) as unknown as { courses: Record<string, unknown> | null }[];
  return rows.filter((r) => r.courses).map((r) => camelize<Course>(r.courses!));
}

export async function setProductCourses(productId: string, courseIds: string[]): Promise<void> {
  const db = createServiceClient();
  const { error: delErr } = await db.from("product_courses").delete().eq("product_id", productId);
  if (delErr) throw new Error(`setProductCourses clear: ${delErr.message}`);
  if (courseIds.length === 0) return;
  const { error } = await db
    .from("product_courses")
    .insert(courseIds.map((course_id, i) => ({ product_id: productId, course_id, sort_order: i })));
  if (error) throw new Error(`setProductCourses: ${error.message}`);
}

// Every course a user can reach, via every product they own. A course granted
// by two owned products appears once.
export async function coursesForUser(userId: string): Promise<Course[]> {
  const db = createServiceClient();
  const { data: owns } = await db
    .from("ownership")
    .select("product_id")
    .eq("user_id", userId)
    .not("product_id", "is", null);
  const productIds = (owns ?? []).map((o) => o.product_id as string);
  if (productIds.length === 0) return [];

  const { data, error } = await db
    .from("product_courses")
    .select(`course_id, courses (${COURSE_COLUMNS})`)
    .in("product_id", productIds);
  if (error) throw new Error(`coursesForUser: ${error.message}`);

  const rows = (data ?? []) as unknown as { courses: Record<string, unknown> | null }[];
  const byId = new Map<string, Course>();
  for (const r of rows) {
    if (!r.courses) continue;
    const c = camelize<Course>(r.courses);
    if (c.status === "published") byId.set(c.id, c);
  }
  return [...byId.values()];
}

export async function userOwnsCourse(userId: string, courseId: string): Promise<boolean> {
  return (await coursesForUser(userId)).some((c) => c.id === courseId);
}

// Course ids per product, batched — the admin list needs this for every row and
// a per-product query would be one round trip each.
export async function productCourseIds(
  productIds: string[],
): Promise<Map<string, string[]>> {
  const byProduct = new Map<string, string[]>();
  if (productIds.length === 0) return byProduct;
  const db = createServiceClient();
  const { data, error } = await db
    .from("product_courses")
    .select("product_id, course_id")
    .in("product_id", productIds);
  if (error) throw new Error(`productCourseIds: ${error.message}`);
  for (const row of data ?? []) {
    const key = row.product_id as string;
    byProduct.set(key, [...(byProduct.get(key) ?? []), row.course_id as string]);
  }
  return byProduct;
}

// How each product presents itself on the storefront: badge type and cover
// image, both taken from the course it grants.
//
// Both are properties of the CONTENT, so they live on the course — one cover
// uploader on the course page feeds the catalog card, the featured panel and the
// product page, and a course sold through two products can't disagree with
// itself about what it looks like. A product with no course has neither, and the
// card falls back to its gradient. Batched: the catalog needs it for every row.
export type ProductDisplay = { type: CourseType; coverPath: string | null };

export async function productDisplay(
  productIds: string[],
): Promise<Map<string, ProductDisplay>> {
  const byProduct = new Map<string, ProductDisplay>();
  if (productIds.length === 0) return byProduct;
  const db = createServiceClient();
  const { data, error } = await db
    .from("product_courses")
    .select(`product_id, courses (type, cover_path)`)
    .in("product_id", productIds);
  if (error) throw new Error(`productDisplay: ${error.message}`);
  for (const row of (data ?? []) as unknown as {
    product_id: string;
    courses: { type: CourseType; cover_path: string | null } | null;
  }[]) {
    // First course wins; a bundle presents as its lead course.
    if (row.courses && !byProduct.has(row.product_id)) {
      byProduct.set(row.product_id, {
        type: row.courses.type,
        coverPath: row.courses.cover_path,
      });
    }
  }
  return byProduct;
}
