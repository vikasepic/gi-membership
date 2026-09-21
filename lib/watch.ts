/**
 * Every rule about watching a video, with no database and no DOM.
 *
 * The player bridge, the library cards, the course page and the admin screens
 * all need the same answers: has this been watched enough to count, is there
 * anywhere worth resuming to, and how full is the bar. Those answers live
 * here once so the four surfaces cannot disagree with each other.
 */

/** Watched this much of a video and it counts as finished. */
export const COMPLETE_AT = 0.9;

/**
 * Below this, there is nothing to resume. Someone who pressed play, waited
 * through the intro and left has not "stopped at 0:12"; offering to continue
 * from there is noise dressed up as a feature.
 */
export const MIN_RESUME_SECONDS = 30;

/**
 * At or past this, the video is effectively over. Resuming into the last
 * seconds hands the member a closing frame and a spinner, so the offer
 * becomes a restart instead.
 */
export const NEAR_END = 0.98;

export type WatchRow = {
  completed: boolean;
  positionSeconds: number | null;
  durationSeconds: number | null;
};

export type ResumeOffer =
  | { kind: "resume"; seconds: number; label: string }
  | { kind: "start" };

/** Whole seconds, never negative, never beyond the video. */
export function clampPosition(seconds: number, duration: number | null): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const whole = Math.floor(seconds);
  if (duration && Number.isFinite(duration) && duration > 0) return Math.min(whole, Math.floor(duration));
  return whole;
}

/**
 * "1:42:10" for anything an hour or longer, "7:05" below that.
 *
 * Minutes and seconds are padded, the leading unit is not, which is how every
 * player in the world writes a timestamp.
 */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * What to show when the lesson opens.
 *
 * A finished lesson offers a restart rather than a resume: someone reopening
 * something they completed is rewatching it, not continuing it.
 */
export function resumeOffer(row: WatchRow | null): ResumeOffer {
  if (!row || row.completed) return { kind: "start" };
  const pos = row.positionSeconds ?? 0;
  if (pos < MIN_RESUME_SECONDS) return { kind: "start" };
  const dur = row.durationSeconds;
  if (dur && dur > 0 && pos / dur >= NEAR_END) return { kind: "start" };
  return { kind: "resume", seconds: pos, label: formatTime(pos) };
}

/** True once this much of the video has been watched. */
export function reachedCompletion(positionSeconds: number, durationSeconds: number | null): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false;
  return positionSeconds / durationSeconds >= COMPLETE_AT;
}

/**
 * How much of one lesson is done, from 0 to 1.
 *
 * A completed lesson is 1 whatever the position says, because completion can
 * arrive from the button, a download or dwell time and none of those move a
 * playhead. Without a duration there is nothing to divide by, so an
 * unfinished lesson with a position but no duration is still 0: a bar that
 * guesses is worse than a bar that waits.
 */
export function lessonFraction(row: WatchRow | null | undefined): number {
  if (!row) return 0;
  if (row.completed) return 1;
  const { positionSeconds: pos, durationSeconds: dur } = row;
  if (!pos || !dur || dur <= 0) return 0;
  return Math.min(1, Math.max(0, pos / dur));
}

/**
 * The course bar.
 *
 * `done` and `total` count whole lessons, which is what the text beside the
 * bar says. `fraction` is watched time across those same lessons, so an hour
 * into a three-hour lesson moves the bar while the text still reads 0 of 12.
 */
export function courseProgress(
  itemIds: string[],
  rowById: Map<string, WatchRow>,
): { done: number; total: number; fraction: number } {
  const total = itemIds.length;
  if (total === 0) return { done: 0, total: 0, fraction: 0 };
  let done = 0;
  let sum = 0;
  for (const id of itemIds) {
    const row = rowById.get(id);
    if (row?.completed) done += 1;
    sum += lessonFraction(row);
  }
  return { done, total, fraction: sum / total };
}

/** A whole percentage for a bar's width and for the text beside it. */
export function percent(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
}

/**
 * "2 hours ago", for the continue box and the admin's activity column.
 *
 * Deliberately coarse. Nobody reading "when did they last open something"
 * needs it to the second, and a precise figure invites the reader to treat a
 * clock skew as a fact.
 */
export function agoLabel(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const mins = Math.floor((now.getTime() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
