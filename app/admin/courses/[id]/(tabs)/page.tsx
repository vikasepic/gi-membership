import { notFound } from "next/navigation";
import { Curriculum } from "@/components/admin/curriculum";
import { getCourse } from "@/lib/courses";
import { listCurriculum } from "@/lib/curriculum";

// The reason you opened this course. It gets the page to itself.
export default async function CurriculumTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [course, nodes] = await Promise.all([
    getCourse(id),
    listCurriculum(id, { includeDrafts: true }), // admin must see drafts
  ]);
  if (!course) notFound();

  return (
    <Curriculum
      courseId={course.id}
      nodes={nodes}
      chapterLabel={course.chapterLabel}
      lessonLabel={course.lessonLabel}
    />
  );
}
