import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCourseBySlug, userOwnsCourse } from "@/lib/courses";
import { listCurriculum } from "@/lib/curriculum";
import { completedItemIds } from "@/lib/progress";
import { CourseOverview } from "@/components/library/course-overview";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const course = await getCourseBySlug(slug);
  // Ownership is via ANY product that grants this course.
  if (!course || !(await userOwnsCourse(user.id, course.id))) redirect("/library");

  const nodes = await listCurriculum(course.id); // published-only by default
  const doneIds = await completedItemIds(user.id, course.id);

  // The layout lives in CourseOverview so the admin preview renders the same
  // component. This page keeps what only it can do: work out who is asking,
  // refuse them if they do not own it, and read their real progress.
  return (
    <CourseOverview
      course={course}
      nodes={nodes}
      doneIds={doneIds}
      lessonHref={(itemId) => `/library/${course.slug}/${itemId}`}
      backHref={{ href: "/library", label: "Library" }}
    />
  );
}
