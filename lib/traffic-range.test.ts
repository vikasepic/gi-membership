import { describe, it, expect } from "vitest";
import { presetFrom, rangeOf, daysInRange, PRESETS } from "@/lib/traffic-funnel";

// A Thursday, mid-month, so month boundaries are not accidentally today.
const TODAY = "2026-09-17";

describe("reading the preset off the URL", () => {
  it("defaults to 30 days when nothing is asked for", () => {
    expect(presetFrom({})).toBe("30");
  });

  it("takes a preset it knows", () => {
    for (const p of PRESETS) expect(presetFrom({ preset: p.key })).toBe(p.key);
  });

  it("falls back rather than reaching a query with an unknown value", () => {
    // It selects a window that becomes a date bound. An unbounded value here
    // would be a request for the whole table.
    expect(presetFrom({ preset: "all-time" })).toBe("30");
    expect(presetFrom({ preset: "999" })).toBe("30");
    expect(presetFrom({ preset: "" })).toBe("30");
    expect(presetFrom({ preset: "constructor" })).toBe("30");
    expect(presetFrom({ preset: ["7", "90"] })).toBe("7");
  });
});

describe("what each preset covers", () => {
  it("today is one day, both ends the same", () => {
    expect(rangeOf("today", TODAY)).toEqual({ start: "2026-09-17", end: "2026-09-17" });
  });

  it("yesterday is one day, and does not include today", () => {
    expect(rangeOf("yesterday", TODAY)).toEqual({ start: "2026-09-16", end: "2026-09-16" });
  });

  it("N days counts back INCLUDING today, so 7 days ends today and starts six back", () => {
    expect(rangeOf("7", TODAY)).toEqual({ start: "2026-09-11", end: "2026-09-17" });
    expect(rangeOf("30", TODAY)).toEqual({ start: "2026-08-19", end: "2026-09-17" });
    expect(rangeOf("90", TODAY)).toEqual({ start: "2026-06-20", end: "2026-09-17" });
  });

  it("this month runs from the 1st to today, not to the month's end", () => {
    expect(rangeOf("this-month", TODAY)).toEqual({ start: "2026-09-01", end: "2026-09-17" });
  });

  it("last month is the whole of it", () => {
    expect(rangeOf("last-month", TODAY)).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("crosses a year boundary", () => {
    expect(rangeOf("last-month", "2026-01-09")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(rangeOf("this-month", "2026-01-01")).toEqual({ start: "2026-01-01", end: "2026-01-01" });
  });

  it("gets February right in a leap year and out of one", () => {
    expect(rangeOf("last-month", "2028-03-05")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(rangeOf("last-month", "2026-03-05")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("is computed in UTC, not in whatever zone the server sits in", () => {
    // The store's counts are keyed on UTC days. A range built in local time
    // silently shifts every window by a day for half the world.
    expect(rangeOf("today", "2026-01-01")).toEqual({ start: "2026-01-01", end: "2026-01-01" });
  });
});

describe("the days a range contains", () => {
  it("includes both ends", () => {
    expect(daysInRange({ start: "2026-09-15", end: "2026-09-17" })).toEqual([
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ]);
  });

  it("is one day when the ends are the same", () => {
    expect(daysInRange({ start: "2026-09-17", end: "2026-09-17" })).toEqual(["2026-09-17"]);
  });

  it("has as many days as a preset claims", () => {
    expect(daysInRange(rangeOf("7", TODAY))).toHaveLength(7);
    expect(daysInRange(rangeOf("30", TODAY))).toHaveLength(30);
    expect(daysInRange(rangeOf("90", TODAY))).toHaveLength(90);
    expect(daysInRange(rangeOf("last-month", TODAY))).toHaveLength(31);
  });

  it("returns nothing for a backwards range rather than looping forever", () => {
    expect(daysInRange({ start: "2026-09-17", end: "2026-09-15" })).toEqual([]);
  });
});
