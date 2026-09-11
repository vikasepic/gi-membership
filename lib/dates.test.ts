import { describe, it, expect } from "vitest";
import { shortDate, dateWithYear, time, shortDateTime, fullDateTime, longDate, longMonthDay } from "@/lib/dates";

// 19:33 UTC on 10 September is already past midnight on 11 September in
// India (UTC+5:30) — the exact case that made the same order read as two
// different days depending on who opened the admin and where they were
// sitting. Every assertion below would fail if `timeZone: "UTC"` were ever
// dropped from lib/dates.ts, because the runtime's own zone (whatever it is
// — this machine defaults to Asia/Kolkata, so this file already exercises
// the bug without any TZ override) would render the 11th instead.
const INSTANT = "2026-09-10T19:33:00Z";

describe("dates: pinned to UTC regardless of runtime zone", () => {
  it("shortDate stays on the UTC day", () => {
    expect(shortDate(INSTANT).startsWith("10 Sep")).toBe(true);
  });

  it("dateWithYear stays on the UTC day and year", () => {
    const out = dateWithYear(INSTANT);
    expect(out.startsWith("10 Sep")).toBe(true);
    expect(out.endsWith("2026")).toBe(true);
  });

  it("time reads the UTC clock, not the local one", () => {
    // Local (Asia/Kolkata) would read 01:03 the next morning.
    expect(time(INSTANT)).toBe("19:33");
  });

  it("shortDateTime stays on the UTC day and clock", () => {
    const out = shortDateTime(INSTANT);
    expect(out.startsWith("10 Sep")).toBe(true);
    expect(out).toContain("19:33");
  });

  it("fullDateTime stays on the UTC day and clock", () => {
    const out = fullDateTime(INSTANT);
    expect(out.startsWith("10 September 2026")).toBe(true);
    expect(out).toContain("19:33");
  });

  it("longDate says 10 September, not 11", () => {
    expect(longDate(INSTANT)).toBe("10 September 2026");
  });

  it("longMonthDay says 10 September, not 11", () => {
    expect(longMonthDay(INSTANT)).toBe("10 September");
  });

  it("accepts a Date object the same way it accepts an ISO string", () => {
    expect(longMonthDay(new Date(INSTANT))).toBe("10 September");
  });

  it("accepts a Date built from a unix-seconds timestamp (the account page's invoice path)", () => {
    const unixSeconds = Date.parse(INSTANT) / 1000;
    expect(dateWithYear(new Date(unixSeconds * 1000)).endsWith("2026")).toBe(true);
    expect(dateWithYear(new Date(unixSeconds * 1000)).startsWith("10 Sep")).toBe(true);
  });
});
