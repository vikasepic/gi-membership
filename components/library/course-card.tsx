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
  const started = !!progress && progress.total > 0 && (progress.fraction > 0 || progress.opened);
  const finished = started && progress!.done === progress!.total;
  return (
    <Link
      href={`/library/${slug}`}
      className="rise group flex flex-col overflow-hidden rounded-[20px] border border-border bg-surface transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)]"
      style={{ animationDelay: `${100 + index * 70}ms` }}
    >
      <div
        className="relative aspect-[16/9] w-full overflow-hidden"
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
      <div className="flex flex-1 flex-col gap-2 px-[18px] pb-[18px] pt-4">
        {/* `!`: the store's h3 setting (28px) is for sales pages and outranks
            a utility class; a shelf of four needs its own size. */}
        <h3 className="text-[17px]! font-bold! leading-snug! tracking-tight">{title}</h3>
        {subtitle && <p className="line-clamp-2 text-[13.5px] leading-relaxed text-muted">{subtitle}</p>}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          {/* Only once a course has something to count. A bar reading 0% on
              every card of an untouched library is decoration that tells the
              reader they have failed at something they have not started. */}
          {started && (
            <div className="flex items-center gap-2.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-primary" style={{ width: `${percent(progress!.fraction)}%` }} />
              </div>
              <span className="whitespace-nowrap text-xs text-muted">
                {finished ? "Finished" : `${progress!.done} of ${progress!.total}`}
              </span>
            </div>
          )}
          <span className="font-display text-sm font-semibold text-primary group-hover:underline">
            {!started ? "Start \u2192" : finished ? "Open \u2192" : "Continue \u2192"}
          </span>
        </div>
      </div>
    </Link>
  );
}
