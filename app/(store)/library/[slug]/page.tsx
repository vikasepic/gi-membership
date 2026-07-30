import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCourseBySlug, userOwnsCourse } from "@/lib/courses";
import { listCurriculum, rollupProgress } from "@/lib/curriculum";
import { flattenPlayable, firstIncomplete } from "@/lib/curriculum-student";
import { completedItemIds } from "@/lib/progress";
import { publicCoverUrl } from "@/lib/media";
import { SimpleCourseContent } from "@/components/library/simple-course-content";

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
  const flat = flattenPlayable(nodes);
  const roll = rollupProgress(nodes.flatMap((n) => [n, ...n.children]), doneIds);
  const resume = firstIncomplete(flat, doneIds);
  const coverUrl = publicCoverUrl(course.coverPath);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-4">
      <Link href="/library" className="kicker w-fit text-muted hover:text-fg">&larr; Library</Link>

      {/* Two columns on desktop: the cover holds the left rail at a fixed 4:5,
          the words and the deliverable run down the right. A full-bleed cover
          above everything pushed the actual content below the fold and made the
          page read as an image with some text stuck under it. Single column on
          mobile, cover first, because there it IS the visual anchor. */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-12">
        {coverUrl && (
          <aside className="md:col-span-5">
            {/* Sticky so the artwork stays with you down a long description,
                and self-start so it doesn't stretch to the row height. */}
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
            <span className="text-sm text-muted">{roll.done} of {roll.total} complete</span>
            {resume && (
              <Link
                href={`/library/${course.slug}/${resume.id}`}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                Continue &rarr; {resume.title}
              </Link>
            )}
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
                <div className="flex items-center justify-between px-5 py-4">
                  {ch.children.length === 0 ? (
                    <Link href={`/library/${course.slug}/${ch.id}`} className="hover:underline">
                      {course.chapterLabel} &middot; {ch.title}
                    </Link>
                  ) : (
                    <span>{course.chapterLabel} &middot; {ch.title}</span>
                  )}
                  <span className="text-xs text-muted">
                    {ch.children.length > 0
                      ? `${ch.children.filter((c) => doneIds.has(c.id)).length}/${ch.children.length}`
                      : `${doneIds.has(ch.id) ? 1 : 0}/1`}
                  </span>
                </div>
                {ch.children.length > 0 && (
                  <ol className="flex flex-col border-t border-border">
                    {ch.children.map((ls) => (
                      <li key={ls.id}>
                        <Link
                          href={`/library/${course.slug}/${ls.id}`}
                          className="flex items-center gap-3 px-5 py-3 pl-8 text-sm hover:bg-surface-2"
                        >
                          <span className="text-muted">{doneIds.has(ls.id) ? "✓" : "○"}</span>
                          {ls.title}
                          <span className="ml-auto text-xs uppercase text-muted">{ls.itemType}</span>
                        </Link>
                      </li>
                    ))}
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
