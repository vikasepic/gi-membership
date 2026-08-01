import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The bump used to share headline/description with four other surfaces, so
// editing the checkout tick-box silently rewrote the storefront, the library
// offer, the standalone checkout and the upsell hero. It now has its own pair,
// falling back to the shared copy when unset.

const checkout = readFileSync("app/(store)/checkout/page.tsx", "utf8");
const form = readFileSync("components/admin/offer-form.tsx", "utf8");

describe("checkout bump copy", () => {
  it("prefers the bump copy and falls back to the shared copy", () => {
    expect(checkout).toContain("bumpOffer.bumpHeadline || bumpOffer.headline");
    expect(checkout).toContain("bumpOffer.bumpDescription || bumpOffer.description");
  });

  it("gives the bump its own labelled section in admin", () => {
    expect(form).toContain('name="bumpHeadline"');
    expect(form).toContain('name="bumpDescription"');
    expect(form).toMatch(/On the checkout bump/);
  });

  it("says which surfaces the shared copy affects", () => {
    // The old form said nothing; that was the actual complaint.
    expect(form).toMatch(/storefront and library|changes all four/i);
  });

  it("shows the inherited value as the placeholder", () => {
    // So an empty field reads as "inherits this", not "blank".
    expect(form).toMatch(/name="bumpHeadline"[\s\S]{0,200}placeholder=\{offer\?\.headline/);
  });
});
