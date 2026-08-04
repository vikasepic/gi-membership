import { notFound } from "next/navigation";
import { CourseForm } from "@/components/admin/course-form";
import { getCourse } from "@/lib/courses";

export default async function CourseDetailsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) notFound();
  return <CourseForm course={course} />;
}
