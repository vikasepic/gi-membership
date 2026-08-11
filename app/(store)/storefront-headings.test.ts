import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/(store)/page.tsx", "utf8");
const card = readFileSync("components/page/storefront-blocks.tsx", "utf8");

/**
 * A section heading belongs to the group, not to each item in it.
 *
 * "Keep going · Membership" was rendered inside the per-offer component, so a
 * store with four subscriptions printed it four times down one page and emitted
 * four identical h2s. To a reader that looks like the page restarting; to a
 * screen reader it says there are four sections where there is one.
 *
 * Checked against the source rather than a render: this page is an async server
 * component that reads the catalogue, the ownership set and the offer hrefs,
 * and standing all of that up would test the mocks. What can actually go wrong
 * here is someone moving the heading back inside the loop, and that is a shape
 * this can see.
 */
describe("the storefront's section headings", () => {
  it("says Keep going once", () => {
    // The rendered element, not the phrase — prose above it in a comment is
    // not a second heading.
    expect(src.split(">Keep going<").length - 1).toBe(1);
  });

  it("keeps it out of the per-offer card", () => {
    // The card is shared now — the storefront draws it and so does the
    // Memberships block. A heading inside it would repeat in both.
    expect(card).toContain("export function MembershipCard");
    expect(card).not.toContain("Keep going");
  });

  it("still gives every membership its own anchor", () => {
    // The heading moved out; the link target must not have gone with it.
    expect(card).toContain("id={`offer-${offer.key}`}");
  });

  it("does not print the group heading when there are no memberships", () => {
    // An empty rule and a bordered heading over nothing is worse than silence.
    expect(src).toContain("memberships.length > 0");
  });
});
