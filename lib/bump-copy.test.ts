import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildBumpView } from "@/lib/bump";

// The bump used to share headline/description with four other surfaces, so
// editing the checkout tick-box silently rewrote the storefront, the library
// offer, the standalone checkout and the upsell hero. It now has its own pair,
// falling back to the shared copy when unset.

const form = readFileSync("components/admin/offer-form.tsx", "utf8");
const bumpEditor = readFileSync("components/admin/bump-editor.tsx", "utf8");

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

  it("edits the bump's copy on the bump screen, not the offer form", () => {
    // Both used to be editable from the offer form while the bump also had its
    // own screen. Two places for one field is how a change gets made in the
    // one that is not live.
    expect(bumpEditor).toContain('name="bumpHeadline"');
    expect(bumpEditor).toContain('name="bumpDescription"');
    expect(form, "the offer form still edits bump copy").not.toContain('name="bumpHeadline"');
  });

  it("cannot blank the bump copy when the offer form is saved", () => {
    // toOfferRow must not write these columns, or saving the offer wipes what
    // the bump editor set — the failure this split exists to prevent.
    const admin = readFileSync("lib/admin.ts", "utf8");
    const toRow = admin.slice(admin.indexOf("function toOfferRow"), admin.indexOf("export async function createOffer"));
    expect(toRow).not.toContain("bump_headline");
    expect(toRow).not.toContain("bump_description");
  });

  it("says which surfaces the shared copy affects", () => {
    // The old form said nothing; that was the actual complaint.
    expect(form).toMatch(/storefront|library|standalone offer checkout/i);
  });

  it("shows the inherited value as the placeholder", () => {
    // So an empty field reads as "inherits this", not "blank".
    expect(bumpEditor).toMatch(/placeholder=\{offer\.headline\}/);
  });
});
