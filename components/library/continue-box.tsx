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
export function ContinueBox({ last, now, coverUrl = null }: { last: LastLesson; now: Date; coverUrl?: string | null }) {
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

  // One slim card beside the welcome (5 Oct 2026 redesign): the whole card is
  // the way back in, and it names the lesson and the course in two lines.
  return (
    <Link
      href={`/library/${last.courseSlug}/${last.itemId}`}
      className="group flex min-w-0 items-center gap-4 rounded-[18px] border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(70,50,30,0.04)] transition-colors hover:border-primary/40"
    >
      <span
        aria-hidden
        className="relative hidden size-[72px] shrink-0 overflow-hidden rounded-xl sm:block"
        style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, var(--surface)), var(--surface-2))" }}
      >
        {coverUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={coverUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="kicker truncate text-[11px] text-[#a64a28]">
          {last.completed ? "Last opened" : "Pick up where you left off"}
        </span>
        <span className="truncate font-display text-base font-bold">{last.title}</span>
        <span className="truncate text-[13px] text-muted">
          {last.courseTitle}
          {offer.kind === "resume" && <> &middot; from {offer.label}</>}
          {ago && <> &middot; {ago}</>}
        </span>
        {fraction > 0 && fraction < 1 && (
          <span className="mt-1.5 block h-1 w-full max-w-48 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full bg-primary" style={{ width: `${percent(fraction)}%` }} />
          </span>
        )}
      </span>
      {/* A phone has no room for the pill; the arrow says the card is the way in. */}
      <span className="hidden shrink-0 rounded-full bg-primary px-4 py-2.5 font-display text-sm font-semibold text-primary-fg transition-colors group-hover:bg-primary-hover sm:inline">
        {last.completed ? "Open again" : "Continue"}
      </span>
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-fg sm:hidden">
        &rarr;
      </span>
    </Link>
  );
}
