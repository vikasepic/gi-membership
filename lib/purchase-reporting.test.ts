import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Where a completed sale gets reported, and the two places it was not.
 *
 * Found by looking for Purchase in Meta's Test Events after a real test buy and
 * not finding it. Two separate holes, both silent:
 *
 *   The browser's copy fired on /checkout/thank-you, and only when the URL
 *   carried a payment_intent. Anybody shown an upsell never arrives that way —
 *   /checkout/complete sends them to /checkout/oto, and every route out of
 *   that page lands on thank-you with an `oto` result and nothing else. So on
 *   the one product that has an upsell, no buyer ever sent the browser copy,
 *   and every ad-blocked buyer was invisible.
 *
 *   The upsell itself was reported nowhere at all. A separate charge on the
 *   same card, a separate line on the order, no event on either side. The
 *   campaigns bidding on this funnel were optimising against the front-end
 *   price alone.
 */

const otoPage = readFileSync("app/(store)/checkout/oto/page.tsx", "utf8");
const checkout = readFileSync("lib/checkout.ts", "utf8");
const receipt = readFileSync("lib/tracking-receipt.ts", "utf8");

describe("the browser's copy of the purchase", () => {
  it("is reported on the upsell page, which everyone shown one reaches", () => {
    expect(otoPage).toContain("purchaseForOrder(verified.payload.orderId)");
    expect(otoPage).toContain("<TrackPurchase");
  });

  it("is on both layouts, not just the one this store happens to use", () => {
    // The sections template and the registry components are both live.
    expect(otoPage.split("{purchase}").length - 1).toBe(2);
  });

  it("reads what it is worth from the order, never from the URL", () => {
    // A value in a query string is a value a buyer can edit, and an edited one
    // lands in Meta as real revenue.
    expect(receipt).toContain("export async function purchaseForOrder");
    expect(otoPage).not.toMatch(/valueCents=\{Number\(/);
  });

  it("still refuses a refunded order", () => {
    // Both lookups go through one place, so the refund guard cannot apply to
    // the payment-intent path and be forgotten on the order path.
    expect(receipt).toContain("async function receiptFor(");
    expect(receipt.match(/status === "refunded"/g)!.length).toBe(1);
  });
});

describe("a sale charged to a card already on file", () => {
  const fn = checkout.slice(
    checkout.indexOf("async function trackOfferSale"),
    checkout.indexOf("// Accept a standing offer from the library"),
  );

  it("is reported by both the ones that make it", () => {
    // The upsell and an offer accepted from the library afterwards.
    expect(checkout.match(/await trackOfferSale\(/g)!.length).toBe(2);
  });

  it("does not collide with the purchase already reported for the order", () => {
    // Meta deduplicates on event_id. Sharing the order's id would throw the
    // second event away rather than adding it up.
    expect(fn).toContain("result.paymentIntentId ?? result.subscriptionId ?? orderId");
  });

  it("calls a trial a trial", () => {
    // $0 today. Reporting it as a purchase says the sale was worthless;
    // reporting the price as revenue says money moved when none did.
    expect(fn).toContain('nowCents > 0 ? "Purchase" : "StartTrial"');
    expect(fn).toContain("valueCents: nowCents > 0 ? nowCents : offer.priceCents");
  });

  it("sends nothing without consent", () => {
    expect(fn).toContain('order.tracking_consent !== true) return');
  });

  it("cannot undo the sale it is reporting", () => {
    // Bought, charged and granted by the time this runs.
    expect(fn).toContain("catch");
    expect(fn).not.toMatch(/catch[\s\S]{0,200}\bthrow\b/);
  });

  it("describes the buyer the same way the purchase does", () => {
    // One builder, so the two events cannot drift into different answers to
    // "what does Meta know about this person".
    expect(checkout).toContain("export async function buyerContextFor");
    expect(checkout.match(/buyerContextFor\(/g)!.length).toBeGreaterThanOrEqual(3);
  });
});
