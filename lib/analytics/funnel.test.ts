import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { GA4_NAME, META_BOTH_SIDES, NO_VALUE } from "@/lib/analytics/events";

// Where each step of the funnel is reported, and where a button goes.

describe("the intent step", () => {
  it("has a name on both platforms", () => {
    expect(GA4_NAME.AddToCart).toBe("add_to_cart");
  });

  it("goes to Meta from both sides", () => {
    // It is the step an ad platform can learn from long before there are
    // enough purchases a week to optimise on.
    expect(META_BOTH_SIDES).toContain("AddToCart");
  });

  it("carries a value, because the thing being added has a price", () => {
    expect(NO_VALUE).not.toContain("AddToCart");
  });
});

describe("where a buy button goes", () => {
  const offerLink = readFileSync("lib/offer-link.ts", "utf8");

  it("prefers the offer's sales page", () => {
    // A button that drops a reader straight onto a payment form has skipped
    // the part that explains what they are buying.
    expect(offerLink).toContain("/o/${offer.key}");
  });

  it("still reaches a checkout for an offer with no page", () => {
    // An offer nobody has written a page for has to stay buyable.
    expect(offerLink).toContain("/checkout/offer?offer=");
  });
});

describe("nothing links straight past a sales page any more", () => {
  const pages = ["app/(store)/page.tsx", "app/(store)/library/page.tsx"];

  it.each(pages)("%s routes through offerHref", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("offerHref");
    // The literal is what regressed: someone adds a button and reaches for the
    // checkout URL because it is the one they can see in the address bar.
    expect(src).not.toMatch(/href=\{`\/checkout\/offer\?offer=/);
  });
});

describe("when the card step is reported", () => {
  const form = readFileSync("components/checkout/checkout-form.tsx", "utf8");

  it("fires as the card is being filled in, not on submit", () => {
    // The gap between "began entering a card" and "bought" is the most useful
    // signal on the page; treating it as a submit event throws away everyone
    // who started and stopped.
    expect(form).toContain("<PaymentElement onChange={notePaymentInfo} />");
  });

  it("still fires for a wallet, which never touches the card fields", () => {
    // Apple Pay and Link complete without the form, and those buyers convert
    // best — the event would never fire for exactly them.
    expect(form.split("notePaymentInfo").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("reports it once per checkout", () => {
    expect(form).toContain("enteredPayment.current");
  });
});
