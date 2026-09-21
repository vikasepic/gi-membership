import Link from "next/link";
import { percent } from "@/lib/watch";
import { fmtDate, relative } from "@/components/admin/money-ui";
import type { CourseProgress, LastLesson } from "@/lib/learning";

/**
 * What one member is actually doing with what they bought.
 *
 * Money answers whether someone paid; this answers whether they turned up.
 * The two together are what a refund request or a renewal decision needs,
 * and neither was visible from the admin before.
 */
export function LearningPanel({
  lastSignIn,
  last,
  courses,
  progress,
  now,
}: {
  lastSignIn: string | null;
  last: LastLesson | null;
  courses: { id: string; title: string; slug: string }[];
  progress: Map<string, CourseProgress>;
  now: Date;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-medium">Learning</h2>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Last signed in</dt>
        <dd>{lastSignIn ? `${fmtDate(lastSignIn)} · ${relative(lastSignIn, now)}` : "never"}</dd>
        <dt className="text-muted">Last opened</dt>
        <dd>
          {last ? (
            <>
              <Link href={`/library/${last.courseSlug}/${last.itemId}`} className="hover:text-primary">
                {last.title}
              </Link>{" "}
              <span className="text-muted">· {relative(last.at, now)}</span>
            </>
          ) : (
            "nothing yet"
          )}
        </dd>
      </dl>

      {courses.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Owns no course.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {courses.map((c) => {
            const p = progress.get(c.id);
            const pct = p ? percent(p.fraction) : 0;
            return (
              <li key={c.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{c.title}</span>
                  <span className="whitespace-nowrap text-xs text-muted tabular-nums">
                    {p && p.total > 0 ? `${p.done}/${p.total} · ${pct}%` : "no lessons"}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
