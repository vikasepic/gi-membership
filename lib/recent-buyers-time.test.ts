import { describe, it, expect } from "vitest";
import { timeAgo } from "@/lib/recent-buyers-time";

// The real age of a purchase, worked out when the card appears. Never rounded
// down to look fresher, and never in the future when the visitor's clock lags.

const now = new Date("2026-10-26T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;

describe("timeAgo", () => {
  it("says just now under a minute, and for a time slightly ahead of this clock", () => {
    expect(timeAgo(ago(30_000), now)).toBe("just now");
    expect(timeAgo(ago(-90_000), now)).toBe("just now");
  });

  it("counts minutes, then hours, then days, rounding down", () => {
    expect(timeAgo(ago(MIN), now)).toBe("1 minute ago");
    expect(timeAgo(ago(59 * MIN), now)).toBe("59 minutes ago");
    expect(timeAgo(ago(61 * MIN), now)).toBe("1 hour ago");
    expect(timeAgo(ago(5 * 60 * MIN), now)).toBe("5 hours ago");
    expect(timeAgo(ago(26 * 60 * MIN), now)).toBe("1 day ago");
    expect(timeAgo(ago(13 * 24 * 60 * MIN), now)).toBe("13 days ago");
  });
});
