import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourse } from "@/lib/courses";
import { CourseTabs } from "@/components/admin/course-tabs";

// The chrome every course tab shares.
//
// This used to be one page: cover upload, then the curriculum, then the
// metadata form, then a Save that applied to two of the five cards on it while
// everything else wrote immediately. Three unrelated jobs stacked as equals,
// with the reason you came here third.
//
// A route group so the lesson editor and the buyer preview — which are not
// tabs of this — do not inherit it.

export default async function CourseTabsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) notFound();
  const live = course.status === "published";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/admin/courses" className="kicker w-fit text-muted hover:text-fg">
          &larr; Courses
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl">{course.title}</h1>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              live ? "border-navy/25 bg-navy/10 text-navy" : "border-border bg-surface-2 text-muted"
            }`}
          >
            {live ? "Published" : "Draft"}
          </span>
          <Link
            href={`/admin/courses/${id}/preview`}
            className="ml-auto rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-fg"
          >
            Preview as a buyer &rarr;
          </Link>
        </div>
      </div>

      <CourseTabs courseId={id} />
      {children}
    </div>
  );
}
