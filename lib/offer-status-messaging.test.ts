import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The library page renders OFFER_STATUS[searchParams.offer] — an unknown key
// renders NOTHING, so a buyer who just paid and hit a snag lands on a bare
// library page with no idea what happened. Two callers feed this same
// ?offer= param: acceptStandingOfferAction (lib/checkout.ts) and the offer
// checkout's own return route (app/(store)/checkout/offer/complete/route.ts,
// which passes completeOfferCheckout's error straight through, and adds its
// own "unknown" on an uncaught exception). This asserts every key either can
// produce has a message, from source because the page is a server component.
const src = readFileSync("app/(store)/library/page.tsx", "utf8");

// The full string literal for one key — via its quotes, not by cutting at the
// next comma, because every message here is prose full of its OWN commas.
// Cutting at the first comma would grab a fragment of the sentence and let a
// phrase later in the same string slip past unchecked — the slice must fail
// CLOSED, so it has to capture the whole literal. Module-level so both describe
// blocks below share one implementation.
function messageFor(key: string): string {
  const m = src.match(new RegExp(`${key}:\\s*"([^"]*)"`));
  expect(m, `no message found for ${key}`).toBeTruthy();
  return m![1];
}

describe("the library page has a message for every offer-checkout outcome", () => {
  it("covers every error key completeOfferCheckout and its return route can produce", () => {
    for (const status of [
      "unavailable",
      "no_saved_card",
      "charge_failed",
      "grant_failed",
      "card_not_saved",
      "order_failed",
      "unknown_intent",
      "unknown_intent_metadata",
      "unknown",
    ]) {
      expect(src, `no message for ${status}`).toContain(`${status}:`);
    }
  });

  it("never tells a charged buyer nothing was taken", () => {
    // grant_failed only fires once the PaymentIntent has already succeeded
    // (lib/offer-checkout.ts) — saying otherwise here would be a lie to
    // someone who has, in fact, just paid.
    expect(messageFor("grant_failed")).not.toMatch(/nothing was charged/i);
  });

  it("keeps charge_failed meaning what it says — a genuine decline before any money moved", () => {
    // This key is acceptStandingOfferAction's own one-tap charge, a different
    // function from completeOfferCheckout's paid path (which uses
    // grant_failed instead — see above). Pinned so nobody "simplifies" the
    // two back into one key.
    expect(messageFor("charge_failed")).toMatch(/nothing was charged/i);
  });
});

// A SEPARATE vocabulary, arriving via a different mechanism: otoBounceHref
// (lib/checkout.ts) redirects a buyer OUT of the OTO page/accept action to
// /library?offer=<reason> for an offer-checkout order — reasons from
// acceptOto's own OtoAcceptResult and from verifyOtoToken, never from
// completeOfferCheckout's error above. Before this coverage existed an offer
// buyer who ACCEPTED their upsell — a real second charge, or a new
// subscription — landed on a bare library page with no acknowledgement of it
// at all, which is the same "reads as broken" failure the describe block
// above exists to prevent, just from a different source.
describe("the library page also has a message for every OTO-accept outcome", () => {
  it("covers every reason otoBounceHref/acceptOto/verifyOtoToken can send here", () => {
    for (const status of ["accepted", "declined", "used", "expired", "invalid"]) {
      expect(src, `no message for ${status}`).toContain(`${status}:`);
    }
  });

  it("acknowledges a real charge — the outcome that follows money", () => {
    // "accepted" means a second charge (or a new subscription) genuinely just
    // went through. Silence here is the one failure this key exists to rule
    // out, so it must say SOMETHING was added, not merely avoid an error tone.
    expect(messageFor("accepted")).toMatch(/library now|active|added/i);
  });
});
