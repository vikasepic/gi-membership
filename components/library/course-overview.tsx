import Link from "next/link";
import { rollupProgress, flattenPlayable, firstIncomplete } from "@/lib/curriculum-student";
import { publicCoverUrl } from "@/lib/media";
import { SimpleCourseContent } from "@/components/library/simple-course-content";
import type { Course } from "@/lib/courses";
import type { CurriculumNode } from "@/lib/curriculum";

// The course page a buyer lands on.
//
// Extracted from the library route so the admin preview renders THIS, not a
// copy of it. Same rule as the order bump and the sales page: a preview built
// from a separate mock-up goes stale the first time one side changes, and
// nobody notices until it is already wrong in front of a customer.
//
// It takes everything it needs as props — progress included — so a preview can
// show a learner part-way through without touching anyone's real progress.

export function CourseOverview({
  course,
  nodes,
  doneIds,
  /** Null makes a lesson un-clickable, which is what a preview wants. */
  lessonHref,
  backHref,
  /** Preview only: label rows a learner would not be shown at all. */
  markDrafts = false,
}: {
  course: Course;
  nodes: CurriculumNode[];
  doneIds: Set<string>;
  lessonHref: ((itemId: string) => string) | null;
  backHref: { href: string; label: string } | null;
  markDrafts?: boolean;
}) {
  const flat = flattenPlayable(nodes);
  const roll = rollupProgress(nodes.flatMap((n) => [n, ...n.children]), doneIds);
  const resume = firstIncomplete(flat, doneIds);
  const coverUrl = publicCoverUrl(course.coverPath);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-4">
      {backHref && (
        <Link href={backHref.href} className="kicker w-fit text-muted hover:text-fg">
          &larr; {backHref.label}
        </Link>
      )}

      {/* Two columns on desktop: the cover holds the left rail at a fixed 4:5,
          the words and the deliverable run down the right. A full-bleed cover
          above everything pushed the actual content below the fold and made the
          page read as an image with some text stuck under it. Single column on
          mobile, cover first, because there it IS the visual anchor. */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-12">
        {coverUrl && (
          <aside className="md:col-span-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt=""
              className="aspect-[4/5] w-full self-start rounded-2xl border border-border object-cover md:sticky md:top-24"
            />
          </aside>
        )}

        <div className={`flex flex-col gap-6 ${coverUrl ? "md:col-span-7" : "md:col-span-12"}`}>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl leading-tight text-balance md:text-4xl">{course.title}</h1>
              {roll.total > 0 && roll.done === roll.total && (
                <span className="kicker rounded-full bg-navy/10 px-2.5 py-1 text-navy">Completed</span>
              )}
            </div>
            {course.subtitle && <p className="text-lg text-muted text-pretty">{course.subtitle}</p>}
          </div>

          {nodes.length === 0 ? (
            <SimpleCourseContent
              courseId={course.id}
              type={course.type}
              videoEmbedUrl={course.videoEmbedUrl}
              attachments={course.attachments}
            />
          ) : (
            <section className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">
                  {roll.done} of {roll.total} complete
                </span>
                {resume &&
                  (lessonHref ? (
                    <Link
                      href={lessonHref(resume.id)}
                      className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
                    >
                      Continue &rarr; {resume.title}
                    </Link>
                  ) : (
                    <span className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg">
                      Continue &rarr; {resume.title}
                    </span>
                  ))}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: roll.total ? `${(roll.done / roll.total) * 100}%` : "0%" }}
                />
              </div>
              <ol className="flex flex-col gap-3">
                {nodes.map((ch) => (
                  <li key={ch.id} className="rounded-2xl border border-border bg-surface">
                    <div className="flex items-center justify-between gap-3 px-5 py-4">
                      <span className="flex items-center gap-2">
                        {ch.children.length === 0 && lessonHref ? (
                          <Link href={lessonHref(ch.id)} className="hover:underline">
                            {course.chapterLabel} &middot; {ch.title}
                          </Link>
                        ) : (
                          <span>
                            {course.chapterLabel} &middot; {ch.title}
                          </span>
                        )}
                        {markDrafts && !ch.isPublished && <DraftTag />}
                      </span>
                      <span className="text-xs text-muted">
                        {ch.children.length > 0
                          ? `${ch.children.filter((c) => doneIds.has(c.id)).length}/${ch.children.length}`
                          : `${doneIds.has(ch.id) ? 1 : 0}/1`}
                      </span>
                    </div>
                    {ch.children.length > 0 && (
                      <ol className="flex flex-col border-t border-border">
                        {ch.children.map((ls) => {
                          const inner = (
                            <>
                              <span className="text-muted">{doneIds.has(ls.id) ? "✓" : "○"}</span>
                              {ls.title}
                              {markDrafts && !ls.isPublished && <DraftTag />}
                              <span className="ml-auto text-xs uppercase text-muted">
                                {ls.itemType}
                              </span>
                            </>
                          );
                          return (
                            <li key={ls.id}>
                              {lessonHref ? (
                                <Link
                                  href={lessonHref(ls.id)}
                                  className="flex items-center gap-3 px-5 py-3 pl-8 text-sm hover:bg-surface-2"
                                >
                                  {inner}
                                </Link>
                              ) : (
                                <span className="flex items-center gap-3 px-5 py-3 pl-8 text-sm">
                                  {inner}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {course.description && (
            <section className="flex flex-col gap-2 border-t border-border pt-6">
              <h2 className="kicker text-muted">About</h2>
              <p className="whitespace-pre-line leading-relaxed text-fg/90 text-pretty">
                {course.description}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftTag() {
  return (
    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-primary">
      Draft
    </span>
  );
}
