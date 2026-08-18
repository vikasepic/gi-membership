import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The upsell's sticky bar, and what its button is allowed to do.
 *
 * It submitted the accept action with a token and no choice. With one way to
 * pay that is right — there is nothing to decide. With several, the server
 * takes the first, so somebody could read the page, tick the yearly, press the
 * bar that had been following them down, and be charged the monthly.
 *
 * A bar cannot carry a choice it is not showing. So when there is one to make
 * it sends them to it instead.
 */

const bar = readFileSync("components/oto/sticky-bar.tsx", "utf8");
const template = readFileSync("components/oto/sections-template.tsx", "utf8");
const anchor = readFileSync("lib/buy-anchor.ts", "utf8");

describe("the button", () => {
  it("buys when there is nothing to choose", () => {
    expect(bar).toContain("optionCount > 1 ?");
    expect(bar).toContain("<form action={acceptOtoAction}>");
  });

  it("scrolls to the choice when there is one", () => {
    const branch = bar.slice(bar.indexOf("optionCount > 1 ?"), bar.indexOf("<form action={acceptOtoAction}>"));
    expect(branch).toContain("scrollToBuy()");
    expect(branch).not.toContain("acceptOtoAction");
  });

  it("assumes one way to pay unless told otherwise", () => {
    // The custom Content Engine layout renders this bar too and says nothing
    // about prices. Defaulting the other way would break its accept.
    expect(bar).toContain("optionCount = 1");
  });

  it("is told how many by the page, not by the request", () => {
    expect(template).toContain("const options = livePrices(offer.prices)");
    expect(template).toContain("optionCount={optionCount}");
  });
});

describe("where both bars scroll to", () => {
  it("is one answer, shared", () => {
    // The editable Sticky bar block and this one. Two lookups would be two
    // answers to the same question on the same page.
    const block = readFileSync("components/page/sticky-bar-block.tsx", "utf8");
    expect(block).toContain('from "@/lib/buy-anchor"');
    expect(bar).toContain('from "@/lib/buy-anchor"');
  });

  it("prefers a named target, then the choice, then the first thing that buys", () => {
    expect(anchor).toContain("getElementById");
    expect(anchor).toContain("[data-ways-to-pay]");
    expect(anchor).toContain("[data-buy]");
  });

  it("does not override a reduced-motion preference from JavaScript", () => {
    // Naming "smooth" here reaches past the media query, which cannot see it.
    expect(anchor).toContain('scrollIntoView({ block: "center" })');
    expect(anchor).not.toContain("behavior:");
  });
});
