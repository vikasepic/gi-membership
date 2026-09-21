import Link from "next/link";
import { agoLabel, percent, resumeOffer, type WatchRow } from "@/lib/watch";
import type { LastLesson } from "@/lib/learning";

/**
 * The way back in.
 *
 * Sits above the shelf because someone returning to a course they are part
 * way through is doing that far more often than they are browsing what they
 * own. It names the lesson, not just the course, and says where in it they
 * stopped, so the click is a known quantity before it is made.
 */
export function ContinueBox({ last, now }: { last: LastLesson; now: Date }) {
  const row: WatchRow = {
    completed: last.completed,
    positionSeconds: last.positionSeconds,
    durationSeconds: last.durationSeconds,
  };
  const offer = resumeOffer(row);
  const ago = agoLabel(last.at, now);
  const fraction =
    !last.completed && last.positionSeconds && last.durationSeconds
      ? last.positionSeconds / last.durationSeconds
      : last.completed
        ? 1
        : 0;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex flex-col gap-1">
        <span className="kicker text-muted">
          {last.completed ? "Last opened" : "Pick up where you left off"}
          {ago && <> &middot; {ago}</>}
        </span>
        <p className="text-lg text-balance">{last.title}</p>
        <p className="text-sm text-muted">{last.courseTitle}</p>
      </div>

      {fraction > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-primary transition-all" style={{ width: `${percent(fraction)}%` }} />
          </div>
          <span className="text-xs text-muted">
            {last.completed ? "Finished" : `${percent(fraction)}% watched`}
          </span>
        </div>
      )}

      <Link
        href={`/library/${last.courseSlug}/${last.itemId}`}
        className="w-fit rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
      >
        {offer.kind === "resume" ? `Continue from ${offer.label}` : last.completed ? "Open again" : "Continue"}
      </Link>
    </section>
  );
}
