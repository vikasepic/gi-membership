import { notFound } from "next/navigation";
import { verifyPreviewToken } from "@/lib/preview-token";
import { getCourse } from "@/lib/courses";
import { listCurriculum, getCourseItem } from "@/lib/curriculum";
import { flattenPlayable, neighbours } from "@/lib/curriculum-student";
import { CourseOverview } from "@/components/library/course-overview";
import { LessonView } from "@/components/library/lesson-view";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

export const dynamic = "force-dynamic";

/**
 * The learner's view of a course, for an admin who does not own it.
 *
 * Outside /admin because a route group cannot escape the admin layout, and this
 * has to render bare inside an iframe.
 *
 * Gated by a signed token in the URL rather than the session: a SameSite=Lax
 * cookie is not sent when a document is loaded into a frame, so requireAdmin()
 * here saw no session however signed-in the admin was and bounced the frame to
 * /login. The page holding the frame has the session and mints the token.
 *
 * Progress and drafts come from the query string, so a preview can show a
 * learner part-way through without touching anyone's real progress. Nothing
 * here writes.
 */
export default async function CoursePreview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ item?: string; progress?: string; drafts?: string; t?: string }>;
}) {
  const { id } = await params;
  const { item: itemId, progress = "fresh", drafts, t } = await searchParams;
  if (!verifyPreviewToken(t, "course")) notFound();

  const course = await getCourse(id);
  if (!course) notFound();

  const withDrafts = drafts === "1";
  const nodes = await listCurriculum(id, { includeDrafts: withDrafts });

  // Progress is simulated, never read. "part" completes the first half of the
  // reading order, which is what puts the resume button and a half-filled bar
  // on screen — the states an empty course never shows you.
  const flat = flattenPlayable(nodes);
  const doneIds = new Set<string>(
    progress === "done"
      ? flat.map((i) => i.id)
      : progress === "part"
        ? flat.slice(0, Math.floor(flat.length / 2)).map((i) => i.id)
        : [],
  );

  if (itemId) {
    const item = await getCourseItem(itemId);
    if (!item || item.courseId !== id) notFound();
    const { prev, next } = neighbours(flat, itemId);
    return (
      <div className="px-4 py-6 md:px-6">
        <LessonView
          course={course}
          item={item}
          prev={prev}
          next={next}
          completed={doneIds.has(item.id)}
          assetUrl={(i) => `/api/media/item/${item.id}/${i}`}
          lessonHref={(lid) =>
            `/course-preview/${id}?item=${lid}&progress=${progress}${withDrafts ? "&drafts=1" : ""}`
          }
          backHref={{
            href: `/course-preview/${id}?progress=${progress}${withDrafts ? "&drafts=1" : ""}`,
            label: course.title,
          }}
          interactive={false}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-6">
      <CourseOverview
        course={course}
        nodes={nodes}
        doneIds={doneIds}
        lessonHref={(lid) =>
          `/course-preview/${id}?item=${lid}&progress=${progress}${withDrafts ? "&drafts=1" : ""}`
        }
        backHref={null}
        markDrafts={withDrafts}
      />
    </div>
  );
}
