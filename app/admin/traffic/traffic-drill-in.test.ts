import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * One funnel at its own URL.
 *
 * The card itself is unchanged — it already answered "how is this page
 * doing". What it lacked was somewhere to live that was not a stack of
 * thirteen others, and a link somebody could send.
 */
const src = readFileSync("app/admin/traffic/[key]/page.tsx", "utf8");

describe("the drill-in page", () => {
  it("builds the same funnels the overview does, from the same window", () => {
    // A second shaping path would drift from the table it was reached from.
    expect(src).toContain("buildFunnels");
    expect(src).toContain("presetFrom");
    expect(src).toContain("rangeOf");
  });

  it("resolves ONE funnel by the key in the path", () => {
    expect(src).toMatch(/view\.funnels\.find\(/);
  });

  it("404s for a key with no funnel in this window", () => {
    expect(src).toContain("notFound()");
  });

  it("renders the card the storefront funnel already had", () => {
    expect(src).toContain("FunnelCard");
  });

  it("keeps the window AND the filters on the way back", () => {
    // Landing back on a 30-day table after drilling in from a 7-day,
    // offers-only, drop-sorted one is the kind of quiet lie this whole
    // screen is meant to stop telling. The old assertion here matched the
    // substring `/admin/traffic?preset=` anywhere in the file, which stayed
    // true of a back link rebuilt from `preset` alone — dropping sort, dir,
    // kind, source and q — so it passed on exactly the bug it existed to
    // catch. `overviewFilterFrom(sp)` is what makes this version able to
    // fail: a back link built from `preset` by itself, or from anything but
    // the request's own searchParams, does not call it.
    expect(src).toContain("overviewFilterFrom(sp)");
    expect(src).toMatch(/trafficUrl\(\s*"\/admin\/traffic"/);
  });

  it("is dynamic, like every other admin page that reads live counts", () => {
    expect(src).toContain('export const dynamic = "force-dynamic"');
  });
});
