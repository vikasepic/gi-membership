import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseForm } from "@/components/admin/course-form";
import { CurriculumOutline } from "@/components/admin/curriculum-outline";
import { getCourse } from "@/lib/courses";
import { listCurriculum } from "@/lib/curriculum";

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
      </div>

      <CurriculumOutline
        courseId={course.id}
        nodes={nodes}
        chapterLabel={course.chapterLabel}
        lessonLabel={course.lessonLabel}
      />

      <CourseForm course={course} />
    </div>
  );
}
