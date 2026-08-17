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
          {/* The state, and a way to change it.
              It was a grey pill, which is the same colour as the furniture —
              and "draft" is the state that surprises people, so saying it
              quietly is how a course sits unpublished for a week. Same two
              colours the product and offer headers use, so the three read
              alike.

              A link, not a label. The control is on the Details tab, and
              somebody who has just noticed the word "Draft" is somebody
              looking for it — this takes them straight to the field rather
              than leaving them to hunt through the sections. */}
          <Link
            href={`/admin/courses/${id}/details#status`}
            title={
              live
                ? "Students with access can open this course. Click to change."
                : "Hidden from students — nobody can open it, even if they own the product that grants it. Click to change."
            }
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${
              live ? "bg-[#3f9b6d]/12 text-[#2f7553]" : "bg-primary/12 text-primary"
            }`}
          >
            <span aria-hidden className={`size-1.5 rounded-full ${live ? "bg-[#3f9b6d]" : "bg-primary"}`} />
            {live ? "Published" : "Draft"}
          </Link>
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
