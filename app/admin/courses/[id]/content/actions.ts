"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import {
  addCourseAttachment,
  removeCourseAttachment,
  setCourseCover,
  setCourseVideoEmbed,
} from "@/lib/courses";
import { validateUpload, uploadCourseCover, uploadCourseAttachment, pickedFile } from "@/lib/media";

export type ContentState = { error?: string; ok?: boolean };

// These power the "simple course" editor — a course that holds its own cover,
// file, or video with no chapters. Progressive-enhancement server actions:
// each returns state so the section can show a result inline without leaving
// the page.

export async function uploadCourseCoverAction(_prev: ContentState, formData: FormData): Promise<ContentState> {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const chosen = await pickedFile(formData, "cover");
  if (!chosen.ok) return { error: chosen.error };

  const file = formData.get("file");
  if (!chosen.picked && (!(file instanceof File) || file.size === 0)) {
    return { error: "Choose an image" };
  }
  if (!chosen.picked) {
    const f = file as File;
    const check = validateUpload({ type: f.type, size: f.size }, "cover");
    if (!check.ok) return { error: check.error };
  }
  try {
    const path = chosen.picked ? chosen.picked.path : await uploadCourseCover(courseId, file as File);
    await setCourseCover(courseId, path);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
  revalidatePath(`/admin/courses/${courseId}`);
  return { ok: true };
}

export async function uploadCourseFileAction(_prev: ContentState, formData: FormData): Promise<ContentState> {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const chosen = await pickedFile(formData, "attachment");
  if (!chosen.ok) return { error: chosen.error };

  const file = formData.get("file");
  if (!chosen.picked && (!(file instanceof File) || file.size === 0)) {
    return { error: "Choose a file" };
  }
  if (!chosen.picked) {
    const f = file as File;
    const check = validateUpload({ type: f.type, size: f.size }, "attachment");
    if (!check.ok) return { error: check.error };
  }
  try {
    const attachment = chosen.picked ?? (await uploadCourseAttachment(courseId, file as File));
    await addCourseAttachment(courseId, attachment);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
  revalidatePath(`/admin/courses/${courseId}`);
  return { ok: true };
}

export async function removeCourseFileAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const path = String(formData.get("path"));
  await removeCourseAttachment(courseId, path);
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function saveCourseVideoAction(_prev: ContentState, formData: FormData): Promise<ContentState> {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const raw = String(formData.get("videoEmbedUrl") ?? "").trim();
  if (raw && !/^https?:\/\//i.test(raw)) return { error: "Enter a full URL (https://…)" };
  try {
    await setCourseVideoEmbed(courseId, raw || null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Save failed" };
  }
  revalidatePath(`/admin/courses/${courseId}`);
  return { ok: true };
}
