import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildBumpView } from "@/lib/bump";

// The bump used to share headline/description with four other surfaces, so
// editing the checkout tick-box silently rewrote the storefront, the library
// offer, the standalone checkout and the upsell hero. It now has its own pair,
// falling back to the shared copy when unset.

const form = readFileSync("components/admin/offer-form.tsx", "utf8");

const offer = {
  billingType: "one_time" as const,
  priceCents: 2700,
  compareAtCents: null,
  currency: "usd",
  interval: null,
  trialDays: null,
  headline: "Shared headline",
  description: "Shared description",
  bumpHeadline: null as string | null,
  bumpDescription: null as string | null,
  bumpBanner: null,
  bumpBullets: null,
  bumpNote: null,
  bumpAccent: null,
};

describe("checkout bump copy", () => {
  it("prefers the bump copy and falls back to the shared copy", () => {
    // Asserted through buildBumpView rather than by grepping the checkout
    // page. The old version matched source text and broke when the same
    // behaviour moved into lib/bump.ts — it was testing where the code lived,
    // not what it did.
    const inherited = buildBumpView(offer);
    expect(inherited.headline).toBe("Shared headline");
    expect(inherited.description).toBe("Shared description");

    const own = buildBumpView({ ...offer, bumpHeadline: "Bump only", bumpDescription: "Terser" });
    expect(own.headline).toBe("Bump only");
    expect(own.description).toBe("Terser");
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
