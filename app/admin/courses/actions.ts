"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createCourse, updateCourse, deleteCourse } from "@/lib/courses";

const schema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .trim()
    .min(1, "Slug required")
    .regex(/^[a-z0-9-]+$/, "lowercase, numbers, hyphens only"),
  title: z.string().trim().min(1, "Title required"),
  subtitle: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()),
  description: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()),
  chapterLabel: z.string().trim().min(1).default("Chapter"),
  lessonLabel: z.string().trim().min(1).default("Lesson"),
  status: z.enum(["draft", "published"]),
});

export type SaveState = { error?: string };

export async function saveCourseAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const { id, ...input } = parsed.data;
  let courseId = id;
  try {
    if (id) await updateCourse(id, input);
    else courseId = await createCourse(input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Save failed" };
  }
  revalidatePath("/admin/courses");
  redirect(`/admin/courses/${courseId}`);
}

export async function deleteCourseAction(formData: FormData) {
  await requireAdmin();
  await deleteCourse(String(formData.get("id")));
  revalidatePath("/admin/courses");
  redirect("/admin/courses");
}
