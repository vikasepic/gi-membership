import { requireAdmin } from "@/lib/admin-guard";
import Link from "next/link";
import { CourseForm } from "@/components/admin/course-form";

export default async function NewCoursePage() {
  // Admins only, asked here as well as in the proxy: a read-only person's session passes the gate on some paths (lib/viewer-paths.ts).
  await requireAdmin();
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/courses" className="kicker w-fit text-muted hover:text-fg">&larr; Courses</Link>
        <h1 className="text-2xl">New course</h1>
      </div>
      <CourseForm />
    </div>
  );
}
