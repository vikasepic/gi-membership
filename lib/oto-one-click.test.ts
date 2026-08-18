import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * An upsell charges the card already on file. That is the whole proposition.
 *
 * On the sections layout it did not. The page hands its blocks a `buyHref`,
 * and a "Ways to pay" block dropped on an upsell rendered that as a link — to
 * /checkout/offer, a form asking for the card the buyer had used ninety
 * seconds earlier. The built-in accept beside it was one click; the block was
 * a second checkout.
 *
 * Whichever control somebody presses on that page has to do the same thing.
 */

const sections = readFileSync("components/oto/sections-template.tsx", "utf8");
const priceChoice = readFileSync("components/page/price-choice.tsx", "utf8");
const blocks = readFileSync("components/page/blocks.tsx", "utf8");
const action = readFileSync("app/(store)/checkout/oto/actions.ts", "utf8");

describe("the upsell page", () => {
  it("offers no route to a checkout at all", () => {
    // Not "prefers one-click" — there is nothing on this page a checkout link
    // could correctly mean.
    expect(sections).toContain("buyHref: null");
    expect(sections).not.toMatch(/buyHref: `\/checkout\/offer/);
  });

  it("hands its blocks the one-click token instead", () => {
    expect(sections).toContain("otoToken: view.token");
    expect(blocks).toContain("otoToken?: string | null;");
  });

  it("makes the token win over any link a block was given", () => {
    // A named offer carries its own buyHref through byOffer, and that is also
    // a checkout — so the token has to beat the link rather than fill in for a
    // missing one.
    expect(blocks).toContain("href={money?.otoToken ? null : href}");
  });
});

describe("the buy control on it", () => {
  it("submits rather than navigates", () => {
    const form = priceChoice.slice(priceChoice.indexOf("{otoToken ? ("));
    expect(form).toContain("action={acceptOtoAction}");
    expect(form).toContain('type="submit"');
  });

  it("sends the position it was shown, never a price or an amount", () => {
    // Same contract the built-in accept uses: the server rebuilds the list and
    // takes that index, so the worst a tampered post can buy is something it
    // was already offered.
    const form = priceChoice.slice(priceChoice.indexOf("{otoToken ? ("));
    expect(form).toContain('name="choice"');
    expect(form).not.toMatch(/name="price"/);
    expect(form).not.toMatch(/name="amount"/);
    expect(action).toContain('formData.get("choice")');
  });

  it("will not submit before a choice is made", () => {
    const form = priceChoice.slice(priceChoice.indexOf("{otoToken ? ("));
    expect(form).toContain("disabled={waiting}");
  });
});
