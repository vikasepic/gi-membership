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
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
  title: z.string().trim().min(1, "Title required"),
  subtitle: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()),
  description: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()),
  chapterLabel: z.string().trim().min(1).default("Chapter"),
  lessonLabel: z.string().trim().min(1).default("Lesson"),
  type: z.enum(["video", "audio", "pdf", "text"]),
  status: z.enum(["draft", "published"]),
});

// Errors are keyed by field so the form can show each one next to its input and
// never reload. `_form` carries anything not tied to a single field.
export type SaveState = { errors?: Record<string, string> };

export async function saveCourseAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      errors[key] ??= issue.message; // first message per field
    }
    return { errors };
  }

  const { id, ...input } = parsed.data;
  let courseId = id;
  try {
    if (id) await updateCourse(id, input);
    else courseId = await createCourse(input);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed";
    // A duplicate slug is a unique-constraint violation (Postgres 23505). Point
    // it at the slug field instead of surfacing a raw database error.
    if (/duplicate key|already exists|23505/i.test(message)) {
      return { errors: { slug: "That slug is already taken — try another." } };
    }
    return { errors: { _form: message } };
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
