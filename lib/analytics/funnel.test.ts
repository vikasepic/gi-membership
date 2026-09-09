import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { GA4_NAME, META_BOTH_SIDES, META_CUSTOM, NO_VALUE } from "@/lib/analytics/events";

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

  it("does not fire just because the element loaded", () => {
    // Stripe's onChange fires when the element mounts and fills itself in —
    // it detects the buyer's country and reports that as a change. Seen in
    // production 4 Sep 2026: opening the checkout and touching nothing sent
    // AddPaymentInfo three seconds after InitiateCheckout, so the event meant
    // "the page loaded" rather than "a card is being entered", and the gap
    // between them — the most useful signal on the page — measured nothing.
    //
    // `empty` is false only once a field actually has something in it.
    const el = slots.slice(slots.indexOf("<PaymentElement"));
    const handler = el.slice(0, el.indexOf("options={options}"));
    expect(handler, "the change handler must gate on real input").toMatch(
      /!e\.empty[\s\S]{0,80}c\.notePaymentInfo\(\)/,
    );
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
    // The list itself, not a window of the source: a comment added above an
    // entry is not a behaviour change, and a test that fails for one is a test
    // people learn to edit rather than read.
    for (const e of ["BumpSelected", "BumpDeclined", "UpsellSelected", "UpsellDeclined"] as const) {
      expect(META_CUSTOM, e).toContain(e);
    }
  });

  it("does not report a decline as revenue", () => {
    expect(NO_VALUE).toContain("BumpDeclined");
    expect(NO_VALUE).toContain("UpsellDeclined");
  });

  it("does not reuse AddToCart for Meta, which would inflate it", () => {
    // AddToCart already fires when a buy button is pressed. Reporting a ticked
    // bump under the same name would pad that number with people who never
    // reached a checkout — and then optimise delivery against it.
    expect(META_BOTH_SIDES).not.toContain("BumpSelected");
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
    // The destination itself is resolved per-order since 0072 (an offer
    // buyer's decline belongs on /library, not a product's thank-you page —
    // see otoBounceHref in lib/checkout.ts) — what this test still has to
    // prove is that it is a real `href`, not a JS-only handler.
    const shell = readFileSync("components/oto/shell.tsx", "utf8");
    expect(shell).toContain("href={view.declineHref}");
  });
});

describe("an offer reports as itself", () => {
  const checkout = readFileSync("lib/checkout.ts", "utf8");
  const block = checkout.slice(checkout.indexOf("async function trackOfferSale"));
  const sale = block.slice(0, block.indexOf("export async function acceptStandingOffer"));

  it("uses the offer's own name and key, not the order's", () => {
    // `who` describes the whole ORDER — content ids are every product on it,
    // content name is the first line's description. Seen in production 4 Sep
    // 2026: a Funnel App trial arrived as content_name "Digital Product
    // Validator", the product's uuid, num_items 3. Any audience built on
    // content_name would have attributed every upsell to the product.
    expect(sale).toContain("contentName: offer.name");
    expect(sale).toContain("contentIds: [offer.key]");
    expect(sale).toContain("numItems: 1");
    // and the override has to come AFTER the spread, or it is not an override
    expect(sale).toMatch(/\.\.\.who,\s*\n\s*\.\.\.identity,/);
  });

  it("still picks the standard event by what is actually charged", () => {
    // A trial takes nothing today and is a StartTrial worth the recurring
    // price. Anything that takes money — a one-time upsell, or a subscription
    // with no trial — is a Purchase for the amount charged.
    expect(sale).toContain('eventName: nowCents > 0 ? "Purchase" : "StartTrial"');
    expect(sale).toContain("valueCents: nowCents > 0 ? nowCents : offer.priceCents");
  });

  it("sends the offer's own named event beside the standard one", () => {
    expect(sale).toContain("const adName = offer.adEventName?.trim()");
    expect(sale).toContain("customName: adName");
    expect(sale, "GA4 has no name for a made-up event").toMatch(
      /customName: adName[\s\S]{0,400}only: \["meta"\]/,
    );
  });

  it("sends nothing extra for an offer with no name", () => {
    expect(sale).toContain("if (adName) {");
  });
});
