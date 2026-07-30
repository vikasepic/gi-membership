import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import { getStoreId } from "@/lib/store";

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
};

export const COURSE_COLUMNS =
  "id, slug, title, subtitle, description, cover_path, chapter_label, lesson_label, type, status";

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

// The storefront badge type for each product, taken from its course. Type lives
// on the course now, so a product with no course has none (a draft still being
// built). Batched — the catalog needs it for every row.
export async function productBadgeTypes(
  productIds: string[],
): Promise<Map<string, CourseType>> {
  const byProduct = new Map<string, CourseType>();
  if (productIds.length === 0) return byProduct;
  const db = createServiceClient();
  const { data, error } = await db
    .from("product_courses")
    .select(`product_id, courses (type)`)
    .in("product_id", productIds);
  if (error) throw new Error(`productBadgeTypes: ${error.message}`);
  for (const row of (data ?? []) as unknown as {
    product_id: string;
    courses: { type: CourseType } | null;
  }[]) {
    // First course wins; a bundle's badge is its lead course.
    if (row.courses && !byProduct.has(row.product_id)) {
      byProduct.set(row.product_id, row.courses.type);
    }
  }
  return byProduct;
}
