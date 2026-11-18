import { requireAdmin } from "@/lib/admin-guard";
import { notFound } from "next/navigation";
import { CourseContent } from "@/components/admin/course-content";
import { getCourse } from "@/lib/courses";
import { listCurriculum } from "@/lib/curriculum";
import { publicCoverUrl } from "@/lib/media";

export default async function CourseFilesTab({ params }: { params: Promise<{ id: string }> }) {
  // Admins only, asked here as well as in the proxy: a read-only person's session passes the gate on some paths (lib/viewer-paths.ts).
  await requireAdmin();
  const { id } = await params;
  const [course, nodes] = await Promise.all([
    getCourse(id),
    listCurriculum(id, { includeDrafts: true }),
  ]);
  if (!course) notFound();
  return (
    <CourseContent
      course={course}
      coverUrl={publicCoverUrl(course.coverPath)}
      hasCurriculum={nodes.length > 0}
    />
  );
}
