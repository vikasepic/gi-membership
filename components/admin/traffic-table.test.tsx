// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TrafficTable, CoverageNote } from "@/components/admin/traffic-table";

describe("the traffic table", () => {
  it("totals a page across its sources", () => {
    const html = renderToStaticMarkup(
      <TrafficTable
        rows={[
          { path: "/p/validator", source: "meta", product: "validator", hits: 80 },
          { path: "/p/validator", source: "direct", product: "validator", hits: 20 },
          { path: "/checkout", source: "meta", product: "validator", hits: 30 },
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
  it("states both numbers rather than a percentage", () => {
    // counted (views) and consented (people) count different things, so the
    // note must not claim a share between them.
    const html = renderToStaticMarkup(<CoverageNote counted={100} consented={69} />);
    expect(html).toContain("100");
    expect(html).toContain("69");
    expect(html).not.toMatch(/\d+%/);
  });

  it("draws nothing before there is any traffic", () => {
    // 0 of 0 is not 100% invisible, it is nothing to say yet.
    expect(renderToStaticMarkup(<CoverageNote counted={0} consented={0} />)).toBe("");
  });
});
