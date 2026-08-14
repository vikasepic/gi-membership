import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EVENTS, GA4_NAME, META_CUSTOM, NO_VALUE, META_BOTH_SIDES, SERVER_ONLY } from "@/lib/analytics/events";

// The course events were declared months before anything called them, which is
// the failure mode worth guarding: a name in a list looks exactly like a name
// being reported.

describe("course activity is actually reported", () => {
  it("reports a lesson opening, from the lesson itself", () => {
    const src = readFileSync("components/library/lesson-view.tsx", "utf8");
    expect(src).toContain('event="LessonStarted"');
  });

  it("does not report the admin previewing a lesson as a student studying it", () => {
    // The preview renders the same component; counting it would put whoever
    // built the course into their own completion numbers.
    const src = readFileSync("components/library/lesson-view.tsx", "utf8");
    expect(src).toMatch(/interactive && \(\s*<TrackView/);
  });

  it("reports a completion from where all four routes to it arrive", () => {
    // Manual button, half the video, opening a download, five minutes of dwell.
    // Reporting from the button would miss three of them.
    const src = readFileSync("components/library/completion-controls.tsx", "utf8");
    expect(src).toContain('"LessonCompleted"');
    expect(src).toContain("if (nowDone && !isDone)");
  });
});

describe("Meta gets a name it will accept", () => {
  it("sends course events as custom ones", () => {
    // fbq('track', 'LessonStarted') is dropped with a console warning — Meta
    // only accepts its own vocabulary through track().
    expect(META_CUSTOM).toContain("LessonStarted");
    expect(META_CUSTOM).toContain("LessonCompleted");
  });

  it("sends every standard event the standard way", () => {
    // The rule is not "these two are custom" — it is that anything Meta HAS a
    // name for must go through track(), because a standard event sent as a
    // custom one is invisible to every built-in report and to optimisation.
    // Listed explicitly so adding an event forces a decision about which it is.
    const META_STANDARD = [
      "PageView",
      "ViewContent",
      "AddToCart",
      "Lead",
      "CompleteRegistration",
      "InitiateCheckout",
      "AddPaymentInfo",
      "Purchase",
      "StartTrial",
      "Subscribe",
    ];
    for (const e of EVENTS) {
      if (META_STANDARD.includes(e)) expect(META_CUSTOM, e).not.toContain(e);
      else expect(META_CUSTOM, `${e} is not a Meta event name — it must be sent as a custom one`).toContain(e);
    }
  });

  it("picks the verb from that list", () => {
    const src = readFileSync("components/analytics.tsx", "utf8");
    expect(src).toMatch(/META_CUSTOM\.includes\(name\)\s*\?\s*"trackCustom"\s*:\s*"track"/);
  });
});

describe("what a course event carries", () => {
  it("carries no revenue", () => {
    // A lesson is not a sale. A value here would invent money in both reports.
    expect(NO_VALUE).toContain("LessonStarted");
    expect(NO_VALUE).toContain("LessonCompleted");
  });

  it("is a browser-only event", () => {
    // No webhook knows a lesson was opened, so there is no server copy to
    // deduplicate against and no reason to claim one.
    for (const e of ["LessonStarted", "LessonCompleted"] as const) {
      expect(META_BOTH_SIDES).not.toContain(e);
      expect(SERVER_ONLY).not.toContain(e);
    }
  });

  it("has a GA4 name its built-in reports understand", () => {
    expect(GA4_NAME.LessonStarted).toBe("tutorial_begin");
    expect(GA4_NAME.LessonCompleted).toBe("tutorial_complete");
  });

  it("reaches GA4 — it carries no money, so it is not held back as commerce", () => {
    const src = readFileSync("components/analytics.tsx", "utf8");
    const commerce = src.match(/const isCommerce[^;]+;/)?.[0] ?? "";
    expect(commerce).not.toContain("Lesson");
  });
});
