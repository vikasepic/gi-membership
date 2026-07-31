import Link from "next/link";
import { metaFor } from "@/components/course-type";

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
}: {
  slug: string;
  title: string;
  subtitle?: string | null;
  type?: string | null;
  coverUrl?: string | null;
  index?: number;
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
        <span
          className="kicker absolute left-4 top-4 rounded-full px-2.5 py-1"
          style={{
            color: meta.accent,
            background: "color-mix(in srgb, var(--surface) 78%, transparent)",
          }}
        >
          {meta.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="text-lg leading-snug">{title}</h3>
        {subtitle && <p className="flex-1 text-sm text-muted">{subtitle}</p>}
        <span className="mt-2 border-t border-border pt-3 text-sm font-medium text-primary group-hover:underline">
          Open &rarr;
        </span>
      </div>
    </Link>
  );
}
