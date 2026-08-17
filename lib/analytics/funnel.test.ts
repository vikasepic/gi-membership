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
  // The card fields became a block that can be placed anywhere, so the element
  // itself lives with the pieces now. The form still owns the callback.
  const slots = readFileSync("components/checkout/slots.tsx", "utf8");

  it("fires as the card is being filled in, not on submit", () => {
    // The gap between "began entering a card" and "bought" is the most useful
    // signal on the page; treating it as a submit event throws away everyone
    // who started and stopped.
    // The callback, not the exact markup — the element's change handler also
    // carries the billing country back to the form now, so a one-line
    // assertion would break on formatting rather than on anything that matters.
    const el = slots.slice(slots.indexOf("<PaymentElement"));
    const handler = el.slice(0, el.indexOf("options={options}"));
    expect(handler).toContain("onChange=");
    expect(handler).toContain("c.notePaymentInfo()");
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

describe("the add-on decisions are reported", () => {
  // A bump and an upsell are the two places a buyer says yes or no to something
  // extra, and until now only the yes ever surfaced — folded into the eventual
  // Purchase as one total. So "how many are offered this and take it" was
  // unanswerable, and a bump nobody ticked looked like a bump nobody was shown.
  const events = readFileSync("lib/analytics/events.ts", "utf8");

  it("names all four", () => {
    for (const e of ["BumpSelected", "BumpDeclined", "UpsellSelected", "UpsellDeclined"]) {
      expect(events, e).toContain(`"${e}"`);
    }
  });

  it("sends them to Meta as custom events", () => {
    // fbq('track') only accepts Meta's own vocabulary; anything else is dropped
    // with a console warning nobody reads, and the event never arrives.
    const custom = events.slice(events.indexOf("export const META_CUSTOM"));
    for (const e of ["BumpSelected", "BumpDeclined", "UpsellSelected", "UpsellDeclined"]) {
      expect(custom.slice(0, 500), e).toContain(e);
    }
  });

  it("does not report a decline as revenue", () => {
    const noValue = events.slice(events.indexOf("export const NO_VALUE"));
    expect(noValue.slice(0, 400)).toContain("BumpDeclined");
    expect(noValue.slice(0, 400)).toContain("UpsellDeclined");
  });

  it("does not reuse AddToCart for Meta, which would inflate it", () => {
    // AddToCart already fires when a buy button is pressed. Reporting a ticked
    // bump under the same name would pad that number with people who never
    // reached a checkout — and then optimise delivery against it.
    const both = events.slice(events.indexOf("export const META_BOTH_SIDES"), events.indexOf("export const SERVER_ONLY"));
    expect(both).not.toContain("BumpSelected");
  });

  it("fires from the bump, on the choice rather than on submit", () => {
    const form = readFileSync("components/checkout/checkout-form.tsx", "utf8");
    expect(form).toContain('track("BumpSelected"');
    expect(form).toContain('track("BumpDeclined"');
    // Routed through one function, so the tickbox and the price list cannot
    // report differently.
    expect(form).toContain("function chooseBump");
  });

  it("fires from the upsell, including the decline", () => {
    const shell = readFileSync("components/oto/shell.tsx", "utf8");
    expect(shell).toContain('event="UpsellSelected"');
    expect(shell).toContain('event="UpsellDeclined"');
    // Every accept form carries one — the single price, the list, and the old
    // two-offer pairing.
    expect(shell.split("UpsellSelected").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("keeps the upsell's decline a real link", () => {
    // Wrapped, not replaced: middle-click and open-in-new-tab still work, and
    // the event is a side effect of the click rather than a condition of it.
    const shell = readFileSync("components/oto/shell.tsx", "utf8");
    expect(shell).toContain('href="/checkout/thank-you?oto=declined"');
  });
});
