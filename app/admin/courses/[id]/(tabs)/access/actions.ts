"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { addCourseAccess, giveBackCourseAccess, removeCourseAccess } from "@/lib/course-access";

// Every action re-checks requireAdmin(): a server action is reachable by
// anyone who finds its id, and the middleware gate is only convenience.

export type CourseAccessState = { error?: string; message?: string };

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function addCourseAccessAction(_prev: CourseAccessState, fd: FormData): Promise<CourseAccessState> {
  const admin = await requireAdmin();
  const courseId = field(fd, "courseId");
  const email = field(fd, "email");
  if (!courseId) return { error: "No course." };
  if (!email) return { error: "Enter an email address." };
  const res = await addCourseAccess({ courseId, email, fullName: field(fd, "fullName") || null, by: admin.email ?? "admin" });
  revalidatePath(`/admin/courses/${courseId}/access`);
  return res.ok ? { message: res.message } : { error: res.error };
}

export async function removeCourseAccessAction(fd: FormData) {
  const admin = await requireAdmin();
  const courseId = field(fd, "courseId");
  const userId = field(fd, "userId");
  if (!courseId || !userId) return;
  await removeCourseAccess({ courseId, userId, by: admin.email ?? "admin" });
  revalidatePath(`/admin/courses/${courseId}/access`);
}

export async function giveBackCourseAccessAction(fd: FormData) {
  await requireAdmin();
  const courseId = field(fd, "courseId");
  const userId = field(fd, "userId");
  if (!courseId || !userId) return;
  await giveBackCourseAccess({ courseId, userId });
  revalidatePath(`/admin/courses/${courseId}/access`);
}
