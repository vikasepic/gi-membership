// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TrafficTable, CoverageNote } from "@/components/admin/traffic-table";

describe("the traffic table", () => {
  it("totals a page across its sources", () => {
    const html = renderToStaticMarkup(
      <TrafficTable
        rows={[
          { path: "/p/validator", source: "meta", hits: 80 },
          { path: "/p/validator", source: "direct", hits: 20 },
          { path: "/checkout", source: "meta", hits: 30 },
        ]}
      />,
    );
    expect(html).toContain("/p/validator");
    expect(html).toContain("100");
    expect(html).toContain("meta");
  });

  it("says so plainly when there is no traffic yet", () => {
    // A zero-row table reads as broken. A sentence does not.
    const html = renderToStaticMarkup(<TrafficTable rows={[]} />);
    expect(html).toMatch(/No traffic/i);
  });
});

describe("the coverage gap", () => {
  it("states the share the ad tools never saw", () => {
    // The reason there are two layers. A share is actionable; two bare
    // numbers are a puzzle.
    const html = renderToStaticMarkup(<CoverageNote counted={100} consented={69} />);
    expect(html).toContain("31%");
  });

  it("draws nothing before there is any traffic", () => {
    // 0 of 0 is not 100% invisible, it is nothing to say yet.
    expect(renderToStaticMarkup(<CoverageNote counted={0} consented={0} />)).toBe("");
  });

  it("never reports a negative gap", () => {
    // visitors is upserted on later views, so it can briefly exceed the day's
    // counted hits. That is a rounding artefact, not -12% invisible traffic.
    const html = renderToStaticMarkup(<CoverageNote counted={10} consented={14} />);
    expect(html).toContain("0%");
  });
});
