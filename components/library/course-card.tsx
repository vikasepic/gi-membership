import Link from "next/link";
import { metaFor } from "@/components/course-type";
import { percent } from "@/lib/watch";
import type { CourseProgress } from "@/lib/learning";

/**
 * A course the reader already owns.
 *
 * Deliberately the same shape and cover treatment as the storefront card: the
 * thing someone bought should look like the thing they were sold. It previously
 * rendered as a text-only box, so a library of one read as an error state
 * rather than a shelf.
 *
 * The distinction from the catalogue card is what it leads with — no price, no
 * persuasion, just the way in.
 */
export function LibraryCourseCard({
  slug,
  title,
  subtitle,
  type,
  coverUrl,
  index = 0,
  progress = null,
}: {
  slug: string;
  title: string;
  subtitle?: string | null;
  type?: string | null;
  coverUrl?: string | null;
  index?: number;
  /** Omitted where there is no member to have progress, such as a preview. */
  progress?: CourseProgress | null;
}) {
  const meta = metaFor(type);
  return (
    <Link
      href={`/library/${slug}`}
      className="rise group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)]"
      style={{ animationDelay: `${100 + index * 70}ms` }}
    >
      <div
        className="relative aspect-[16/10] w-full overflow-hidden"
        style={{ background: `linear-gradient(145deg, ${meta.wash}, var(--surface-2))` }}
      >
        {coverUrl && (
          // The gradient stays underneath, so a missing or slow cover degrades
          // to a designed panel rather than a blank box. Decorative — the title
          // beside it already names the course.
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        )}
        {/* No type badge here either. The wash below stays — a colour, not a
            claim, and what keeps a card with no artwork from reading as a
            blank box. */}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="text-lg leading-snug">{title}</h3>
        {subtitle && <p className="flex-1 text-sm text-muted">{subtitle}</p>}
        {/* Only once a course has something to count. A bar reading 0% on
            every card of an untouched library is decoration that tells the
            reader they have failed at something they have not started. */}
        {progress && progress.total > 0 && progress.fraction > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-primary" style={{ width: `${percent(progress.fraction)}%` }} />
            </div>
            <span className="text-xs text-muted">
              {progress.done === progress.total
                ? "Finished"
                : `${progress.done} of ${progress.total} \u00b7 ${percent(progress.fraction)}%`}
            </span>
          </div>
        )}
        <span className="mt-2 border-t border-border pt-3 text-sm font-medium text-primary group-hover:underline">
          {progress && progress.fraction > 0 && progress.done !== progress.total ? "Continue \u2192" : "Open \u2192"}
        </span>
      </div>
    </Link>
  );
}
