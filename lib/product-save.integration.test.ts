import { describe, it, expect, afterAll } from "vitest";
import { parseProductForm } from "@/lib/product-rules";
import { createProduct, updateProduct, getProductById } from "@/lib/admin";
import { setProductCourses, coursesForProduct, createCourse } from "@/lib/courses";
import { createServiceClient } from "@/lib/supabase/server";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const createdProductIds: string[] = [];
const createdCourseIds: string[] = [];

// The exact shape the admin form submits — note the absent media fields, which
// is what used to make every save fail.
const payload = (over: Record<string, string> = {}) => ({
  slug: `save-test-${Date.now()}`,
  title: "Save Test Product",
  tagline: "",
  description: "",
  price: "27",
  compareAt: "",
  status: "draft",
  bumpOfferId: "",
  upsellOfferId: "",
  ...over,
});

describe.skipIf(!canRun)("product save path (integration)", () => {
  it("saves the form payload and attaches courses, so the library can find them", async () => {
    const courseId = await createCourse({
      slug: `save-test-course-${Date.now()}`,
      title: "Save Test Course",
      subtitle: null,
      description: null,
      chapterLabel: "Chapter",
      lessonLabel: "Lesson",
      type: "pdf",
      status: "published",
    });
    createdCourseIds.push(courseId);

    const parsed = parseProductForm(payload());
    if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
    const { id: _unused, ...input } = parsed.data;

    const productId = await createProduct(input);
    createdProductIds.push(productId);
    await setProductCourses(productId, [courseId]);

    const saved = await getProductById(productId);
    expect(saved?.priceCents).toBe(2700);
    expect(saved?.title).toBe("Save Test Product");
    // This join is what coursesForUser walks — an empty product_courses is
    // exactly why the library showed nothing.
    expect((await coursesForProduct(productId)).map((c) => c.id)).toEqual([courseId]);
  });

  it("a save leaves an uploaded asset alone", async () => {
    const parsed = parseProductForm(payload());
    if (!parsed.ok) throw new Error("parse failed");
    const { id: _unused, ...input } = parsed.data;
    const productId = await createProduct(input);
    createdProductIds.push(productId);

    // Simulate what uploadPaidAsset writes.
    const db = createServiceClient();
    await db
      .from("products")
      .update({ media_mode: "upload", media_path: `${productId}/guide.pdf` })
      .eq("id", productId);

    // Re-save through the same path the form uses. Before the fix, ProductInput
    // carried mediaMode from the form and this would have nulled both columns,
    // silently breaking delivery of that product's file.
    const again = parseProductForm(payload({ slug: input.slug, title: "Renamed" }));
    if (!again.ok) throw new Error("parse failed");
    const { id: _drop, ...updateInput } = again.data;
    await updateProduct(productId, updateInput);

    const after = await getProductById(productId);
    expect(after?.title).toBe("Renamed");
    expect(after?.mediaMode).toBe("upload");
    expect(after?.mediaPath).toBe(`${productId}/guide.pdf`);
  });
});

afterAll(async () => {
  const db = createServiceClient();
  for (const id of createdProductIds) {
    await db.from("product_courses").delete().eq("product_id", id);
    await db.from("products").delete().eq("id", id);
  }
  for (const id of createdCourseIds) await db.from("courses").delete().eq("id", id);
});
