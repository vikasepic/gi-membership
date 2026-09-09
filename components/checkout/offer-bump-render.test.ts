import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("app/(store)/checkout/offer/page.tsx", "utf8");
const form = readFileSync("components/checkout/offer-checkout-form.tsx", "utf8");

describe("the offer checkout shows its bump", () => {
  it("builds the bump from the offer's own placement, not from the request", () => {
    expect(page).toMatch(/bumpOfferId/);
    expect(page).toMatch(/shownPrices\(/);
  });

  it("renders the shared component rather than a second copy of one", () => {
    expect(form).toMatch(/OrderBump/);
  });

  it("posts the choice to the server", () => {
    expect(form).toMatch(/bumpChoice/);
  });
});
