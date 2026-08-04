import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseForm } from "@/components/admin/course-form";
import { CourseContent } from "@/components/admin/course-content";
import { Curriculum } from "@/components/admin/curriculum";
import { getCourse } from "@/lib/courses";
import { listCurriculum } from "@/lib/curriculum";
import { publicCoverUrl } from "@/lib/media";

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [course, nodes] = await Promise.all([
    getCourse(id),
    listCurriculum(id, { includeDrafts: true }), // admin must see drafts
  ]);
  if (!course) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/courses" className="kicker w-fit text-muted hover:text-fg">&larr; Courses</Link>
        <h1 className="text-2xl">{course.title}</h1>
        <Link
          href={`/admin/courses/${id}/preview`}
          className="mt-1 w-fit rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-fg"
        >
          Preview as a buyer →
        </Link>
      </div>

      <CourseContent
        course={course}
        coverUrl={publicCoverUrl(course.coverPath)}
        hasCurriculum={nodes.length > 0}
      />

      {/* Chapters &amp; lessons — for a multi-part course. A simple course can
          ignore this entirely and just use the file above. */}
      <Curriculum
        courseId={course.id}
        nodes={nodes}
        chapterLabel={course.chapterLabel}
        lessonLabel={course.lessonLabel}
      />

      <CourseForm course={course} />
    </div>
  );
}
