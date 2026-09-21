import { describe, it, expect } from "vitest";
import {
  COMPLETE_AT,
  MIN_RESUME_SECONDS,
  clampPosition,
  formatTime,
  resumeOffer,
  reachedCompletion,
  lessonFraction,
  courseProgress,
  percent,
  agoLabel,
  type WatchRow,
} from "@/lib/watch";

const row = (o: Partial<WatchRow>): WatchRow => ({ completed: false, positionSeconds: null, durationSeconds: null, ...o });

describe("clampPosition", () => {
  it("floors to whole seconds", () => {
    expect(clampPosition(12.87, 100)).toBe(12);
  });

  it("refuses to go backwards past the start", () => {
    expect(clampPosition(-5, 100)).toBe(0);
    expect(clampPosition(Number.NaN, 100)).toBe(0);
  });

  it("refuses to go past the end", () => {
    // The bridge has been seen to report a position a shade beyond the
    // duration on the final frame. A position greater than the duration
    // makes the bar exceed 100% and the DB CHECK is no help: it only
    // refuses negatives.
    expect(clampPosition(105, 100)).toBe(100);
  });

  it("passes the position through when the duration is unknown", () => {
    expect(clampPosition(4000, null)).toBe(4000);
  });
});

describe("formatTime", () => {
  it("writes hours only when there are hours", () => {
    expect(formatTime(425)).toBe("7:05");
    expect(formatTime(6130)).toBe("1:42:10");
  });

  it("is 0:00 at the start and never negative", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(-10)).toBe("0:00");
  });
});

describe("resumeOffer", () => {
  it("offers the timestamp someone actually stopped at", () => {
    const offer = resumeOffer(row({ positionSeconds: 6130, durationSeconds: 10800 }));
    expect(offer).toEqual({ kind: "resume", seconds: 6130, label: "1:42:10" });
  });

  it("says nothing for the first half minute", () => {
    // Pressing play, sitting through the intro and leaving is not a place
    // worth returning to.
    expect(resumeOffer(row({ positionSeconds: MIN_RESUME_SECONDS - 1, durationSeconds: 600 })).kind).toBe("start");
    expect(resumeOffer(row({ positionSeconds: MIN_RESUME_SECONDS, durationSeconds: 600 })).kind).toBe("resume");
  });

  it("starts over at the closing credits rather than resuming into them", () => {
    expect(resumeOffer(row({ positionSeconds: 9950, durationSeconds: 10000 })).kind).toBe("start");
  });

  it("starts over for a lesson already finished, because that is a rewatch", () => {
    expect(resumeOffer(row({ completed: true, positionSeconds: 6130, durationSeconds: 10800 })).kind).toBe("start");
  });

  it("starts over when there is no row at all", () => {
    expect(resumeOffer(null).kind).toBe("start");
  });

  it("still offers a resume when the duration was never captured", () => {
    // No duration means the near-end rule cannot be applied, but the
    // position is still real and still where they stopped.
    expect(resumeOffer(row({ positionSeconds: 900, durationSeconds: null }))).toEqual({
      kind: "resume",
      seconds: 900,
      label: "15:00",
    });
  });
});

describe("reachedCompletion", () => {
  it("is the same nine tenths whatever the length", () => {
    expect(COMPLETE_AT).toBe(0.9);
    expect(reachedCompletion(9720, 10800)).toBe(true);
    expect(reachedCompletion(9719, 10800)).toBe(false);
    expect(reachedCompletion(540, 600)).toBe(true);
  });

  it("never completes without a duration to measure against", () => {
    // Half a three-hour video and the whole of a six-minute one are the same
    // number of seconds. Guessing here marks lessons finished that nobody
    // watched.
    expect(reachedCompletion(99999, null)).toBe(false);
    expect(reachedCompletion(99999, 0)).toBe(false);
  });
});

describe("lessonFraction", () => {
  it("is one for anything completed, however it completed", () => {
    // Completion arrives from the button, a download or dwell time, none of
    // which move a playhead.
    expect(lessonFraction(row({ completed: true }))).toBe(1);
    expect(lessonFraction(row({ completed: true, positionSeconds: 3, durationSeconds: 10800 }))).toBe(1);
  });

  it("is the watched share of an unfinished video", () => {
    expect(lessonFraction(row({ positionSeconds: 3600, durationSeconds: 10800 }))).toBeCloseTo(1 / 3);
  });

  it("is zero when there is nothing to divide by", () => {
    expect(lessonFraction(row({ positionSeconds: 3600, durationSeconds: null }))).toBe(0);
    expect(lessonFraction(null)).toBe(0);
    expect(lessonFraction(undefined)).toBe(0);
  });

  it("never exceeds one", () => {
    expect(lessonFraction(row({ positionSeconds: 11000, durationSeconds: 10800 }))).toBe(1);
  });
});

describe("courseProgress", () => {
  const ids = ["a", "b", "c", "d"];

  it("counts whole lessons for the text and watched time for the bar", () => {
    const rows = new Map<string, WatchRow>([
      ["a", row({ completed: true })],
      ["b", row({ positionSeconds: 5400, durationSeconds: 10800 })],
    ]);
    const p = courseProgress(ids, rows);
    expect(p.done).toBe(1);
    expect(p.total).toBe(4);
    // One whole lesson plus half of another, over four.
    expect(p.fraction).toBeCloseTo(0.375);
    expect(percent(p.fraction)).toBe(38);
  });

  it("moves the bar while the count is still zero", () => {
    // The whole point for a three-hour lesson: an hour in, the bar has moved
    // and "0 of 4 complete" is still the truth.
    const p = courseProgress(ids, new Map([["a", row({ positionSeconds: 3600, durationSeconds: 10800 })]]));
    expect(p.done).toBe(0);
    expect(percent(p.fraction)).toBe(8);
  });

  it("is a full bar when every lesson is done", () => {
    const rows = new Map(ids.map((id) => [id, row({ completed: true })]));
    expect(courseProgress(ids, rows)).toEqual({ done: 4, total: 4, fraction: 1 });
  });

  it("is empty, not a division by zero, for a course with no lessons", () => {
    expect(courseProgress([], new Map())).toEqual({ done: 0, total: 0, fraction: 0 });
  });

  it("ignores progress rows for lessons that are not in the list", () => {
    // An unpublished or deleted lesson must not inflate the bar of the course
    // it used to belong to.
    const rows = new Map([["gone", row({ completed: true })]]);
    expect(courseProgress(ids, rows).done).toBe(0);
  });
});

describe("agoLabel", () => {
  const now = new Date("2026-09-21T12:00:00Z");
  const at = (iso: string) => agoLabel(iso, now);

  it("reads in the largest unit that still says something", () => {
    expect(at("2026-09-21T11:59:30Z")).toBe("just now");
    expect(at("2026-09-21T11:01:00Z")).toBe("59 minutes ago");
    expect(at("2026-09-21T09:00:00Z")).toBe("3 hours ago");
    expect(at("2026-09-18T12:00:00Z")).toBe("3 days ago");
    expect(at("2026-07-21T12:00:00Z")).toBe("2 months ago");
  });

  it("is singular for one of anything", () => {
    expect(at("2026-09-21T11:59:00Z")).toBe("1 minute ago");
    expect(at("2026-09-20T12:00:00Z")).toBe("1 day ago");
  });

  it("is nothing at all when nothing was recorded", () => {
    expect(at("not a date")).toBeNull();
    expect(agoLabel(null, now)).toBeNull();
  });
});
