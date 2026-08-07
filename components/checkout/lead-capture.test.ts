import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The buyer's name reaches ActiveCampaign as firstName + lastName, but only if
 * it reaches us first. Everything that sends a name downstream is tested where
 * it lives; this covers the one step that has no test of its own because it
 * needs a mounted Stripe Element — the moment the name is buffered.
 *
 * Both failures this guards are silent. Nothing errors, nothing looks wrong on
 * the checkout, and the contact simply arrives with an empty first name.
 */
const src = readFileSync(
  new URL("./checkout-form.tsx", import.meta.url),
  "utf8",
);

describe("buffering the abandoned-cart lead", () => {
  it("captures again when the name field is left", () => {
    // Name sits above Email, so the usual order works either way. This is for
    // the buyer who clicks straight into Email, tabs out, then types a name:
    // without a blur here, that name is never buffered.
    const nameField = src.slice(
      src.indexOf('aria-label="Full name"'),
      src.indexOf('aria-label="Email"'),
    );
    expect(nameField).toContain("onBlur={captureEmail}");
  });

  it("keys the buffer on the name as well as the address", () => {
    // Keyed on the address alone, the second capture is a no-op and the name
    // typed after it is dropped.
    expect(src).toContain("`${value}|${name}`");
  });

  it("still fires the Lead pixel once per address", () => {
    // The buffer may re-send; the pixel may not. Two Lead events for one person
    // would overstate the funnel in Meta and GA4.
    const pixelGuard = src.indexOf("capturedEmail.current !== value");
    const track = src.indexOf('track("Lead"');
    const leadGuard = src.indexOf("bufferedLead.current === key");
    expect(pixelGuard).toBeGreaterThan(-1);
    // The pixel is inside the address-only guard, above the buffer's own.
    expect(track).toBeGreaterThan(pixelGuard);
    expect(track).toBeLessThan(leadGuard);
  });
});
