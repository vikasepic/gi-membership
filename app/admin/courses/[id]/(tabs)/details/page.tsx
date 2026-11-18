import { requireAdmin } from "@/lib/admin-guard";
import { notFound } from "next/navigation";
import { CourseForm } from "@/components/admin/course-form";
import { getCourse } from "@/lib/courses";

export default async function CourseDetailsTab({ params }: { params: Promise<{ id: string }> }) {
  // Admins only, asked here as well as in the proxy: a read-only person's session passes the gate on some paths (lib/viewer-paths.ts).
  await requireAdmin();
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) notFound();
  return <CourseForm course={course} />;
}
