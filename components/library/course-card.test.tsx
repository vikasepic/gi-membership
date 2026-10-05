// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LibraryCourseCard } from "@/components/library/course-card";

/**
 * What the card's one action says. A member who opened a reading lesson and
 * left without finishing it has no watched time to count, so the card used to
 * say "Start" under a "Pick up where you left off" box naming that lesson.
 */
const card = (progress: Parameters<typeof LibraryCourseCard>[0]["progress"]) =>
  renderToStaticMarkup(<LibraryCourseCard slug="deep-work" title="Deep Work" progress={progress} />);

describe("the course card's action", () => {
  it("says Start when nothing in the course has been opened", () => {
    expect(card({ courseId: "c", done: 0, total: 4, fraction: 0, opened: false })).toContain("Start");
  });

  it("says Continue once a lesson has been opened, even with no time watched", () => {
    const html = card({ courseId: "c", done: 0, total: 4, fraction: 0, opened: true });
    expect(html).toContain("Continue");
    expect(html).not.toContain("Start");
  });

  it("says Open when every lesson is done", () => {
    expect(card({ courseId: "c", done: 4, total: 4, fraction: 1, opened: true })).toContain("Open");
  });
});
