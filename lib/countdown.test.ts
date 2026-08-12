import { describe, it, expect } from "vitest";
import {
  ALL_ZONES,
  describeDeadline,
  instantFrom,
  pad,
  remainingAt,
  unitLabel,
  zoneIsValid,
  zoneLabel,
} from "@/lib/countdown";

/**
 * A deadline is a wall-clock time PLUS a zone, and the pair is one instant.
 *
 * Elementor stores the string alone and prints "Date set according to your
 * timezone" underneath, which means the moment depends on where the editor was
 * sitting. Every test here is a way that can go wrong.
 */
describe("resolving a deadline to one instant", () => {
  it("reads the same wall clock differently in different zones", () => {
    const local = "2026-09-12T09:48";
    const delhi = instantFrom(local, "Asia/Kolkata")!;
    const london = instantFrom(local, "Europe/London")!;
    expect(delhi).not.toBe(london);
    // IST is +5:30, London is +1 in September. 4h30m apart.
    expect((london - delhi) / 3600000).toBeCloseTo(4.5, 5);
  });

  it("agrees with an ISO string carrying the same offset", () => {
    // The independent check: if this is right, a date with an explicit offset
    // parses to the identical instant.
    expect(instantFrom("2026-09-12T09:48", "Asia/Kolkata")).toBe(
      Date.parse("2026-09-12T09:48:00+05:30"),
    );
    expect(instantFrom("2026-01-15T12:00", "Europe/London")).toBe(
      Date.parse("2026-01-15T12:00:00Z"),
    );
  });

  it("uses the offset in force AT the deadline, not the one in force today", () => {
    // The bug a single-pass conversion has. London is +0 in winter and +1 in
    // summer; a July deadline resolved with January's offset is an hour out.
    expect(instantFrom("2026-07-15T12:00", "Europe/London")).toBe(
      Date.parse("2026-07-15T12:00:00+01:00"),
    );
    expect(instantFrom("2026-12-15T12:00", "Europe/London")).toBe(
      Date.parse("2026-12-15T12:00:00Z"),
    );
  });

  it("handles a zone with a half-hour and a three-quarter-hour offset", () => {
    expect(instantFrom("2026-03-01T00:00", "Asia/Kolkata")).toBe(
      Date.parse("2026-03-01T00:00:00+05:30"),
    );
    expect(instantFrom("2026-03-01T00:00", "Pacific/Auckland")).toBe(
      Date.parse("2026-03-01T00:00:00+13:00"),
    );
  });

  it("survives the hour either side of a spring-forward", () => {
    // 2026-03-29 01:00 UTC is when London jumps to +1. A deadline just after
    // is the case a naive conversion gets wrong.
    expect(instantFrom("2026-03-29T03:30", "Europe/London")).toBe(
      Date.parse("2026-03-29T03:30:00+01:00"),
    );
    expect(instantFrom("2026-03-29T00:30", "Europe/London")).toBe(
      Date.parse("2026-03-29T00:30:00Z"),
    );
  });

  it("accepts seconds and a space instead of a T", () => {
    expect(instantFrom("2026-09-12 09:48:30", "UTC")).toBe(Date.parse("2026-09-12T09:48:30Z"));
  });

  it("returns null rather than throwing on rubbish", () => {
    expect(instantFrom("", "UTC")).toBeNull();
    expect(instantFrom("not a date", "UTC")).toBeNull();
    expect(instantFrom("2026-09-12T09:48", "Mars/Olympus")).toBeNull();
    // A block with a bad setting renders nothing; it does not take the page down.
  });

  it("only offers zones the runtime can actually resolve", () => {
    for (const z of ALL_ZONES) expect(zoneIsValid(z), z).toBe(true);
    expect(zoneIsValid("Mars/Olympus")).toBe(false);
    expect(zoneIsValid("")).toBe(false);
  });

  it("names the zone at that instant, so summer and winter differ", () => {
    const jul = instantFrom("2026-07-15T12:00", "Europe/London")!;
    const jan = instantFrom("2026-01-15T12:00", "Europe/London")!;
    expect(zoneLabel(jul, "Europe/London")).not.toBe(zoneLabel(jan, "Europe/London"));
  });
});

describe("saying the deadline back in words", () => {
  it("states it in its own zone and in one the reader knows", () => {
    const said = describeDeadline("2026-09-12T09:48", "Asia/Kolkata", "Europe/London");
    // Not the month's exact spelling — Node writes "Sept", other runtimes
    // "Sep", and a test that pins it is testing Intl rather than this code.
    expect(said).toMatch(/12 Sept? 2026/);
    expect(said).toContain("09:48");
    // 09:48 IST is 05:18 in London in September.
    expect(said).toContain("05:18");
    expect(said).toContain("London");
  });

  it("does not repeat itself when both zones are the same", () => {
    const said = describeDeadline("2026-09-12T09:48", "Europe/London", "Europe/London");
    expect(said).not.toContain("·");
  });

  it("says nothing at all about a date it cannot read", () => {
    expect(describeDeadline("nonsense", "UTC")).toBe("");
  });
});

describe("what is left", () => {
  const at = (iso: string) => Date.parse(iso);

  it("breaks the gap into days, hours, minutes and seconds", () => {
    const r = remainingAt(at("2026-01-03T04:05:06Z"), at("2026-01-01T00:00:00Z"));
    expect(r).toEqual({ days: 2, hours: 4, minutes: 5, seconds: 6, done: false });
  });

  it("clamps at zero rather than counting backwards", () => {
    const r = remainingAt(at("2026-01-01T00:00:00Z"), at("2026-06-01T00:00:00Z"));
    expect(r).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });

  it("is done exactly at the deadline, not a second later", () => {
    const t = at("2026-01-01T00:00:00Z");
    expect(remainingAt(t, t).done).toBe(true);
    expect(remainingAt(t, t - 1000).done).toBe(false);
  });

  it("carries a hidden unit into the next one instead of losing it", () => {
    // Three days, with Days hidden, is 72 hours — not 0. Widgets that hide a
    // unit without carrying silently drop the time it held.
    const r = remainingAt(at("2026-01-04T00:00:00Z"), at("2026-01-01T00:00:00Z"), {
      days: false,
      hours: true,
      minutes: true,
    });
    expect(r.hours).toBe(72);
    expect(r.days).toBe(0);
  });

  it("carries all the way down when only seconds are shown", () => {
    const r = remainingAt(at("2026-01-01T00:02:00Z"), at("2026-01-01T00:00:00Z"), {
      days: false,
      hours: false,
      minutes: false,
    });
    expect(r.seconds).toBe(120);
  });
});

describe("how a unit is written", () => {
  it("says one day, not one days", () => {
    expect(unitLabel(1, "day", "days")).toBe("day");
    expect(unitLabel(2, "day", "days")).toBe("days");
    expect(unitLabel(0, "day", "days")).toBe("days");
  });

  it("pads only when asked", () => {
    expect(pad(7, true)).toBe("07");
    expect(pad(7, false)).toBe("7");
    expect(pad(72, true)).toBe("72");
  });
});
