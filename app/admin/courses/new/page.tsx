import Link from "next/link";
import { CourseForm } from "@/components/admin/course-form";

export default function NewCoursePage() {
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
