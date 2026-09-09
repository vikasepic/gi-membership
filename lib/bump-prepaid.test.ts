import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A one-time bump is paid for with the product, not after it.
 *
 * It used to be a second, off-session charge on the saved card once the first
 * had settled. Two things wrong with that, one of them fatal:
 *
 *   Stripe refuses an off-session card payment on a card issued in India
 *   without an RBI e-mandate — "You must provide a mandate for off-session card
 *   payments made with cards issued in India". So the product was charged, the
 *   add-on was not, and the buyer got what they paid for minus the thing they
 *   had ticked. That is a real order on this store, and the failure was only
 *   visible because the queue caught it.
 *
 *   And the page had already said "Total today $11.50" while the payment
 *   authorised $0.50. The figure somebody agreed to and the figure their card
 *   saw were never the same number.
 *
 * One on-session charge for the amount on the button. No mandate is needed for
 * a payment the cardholder is present for.
 */

const checkout = readFileSync("lib/checkout.ts", "utf8");
const retry = readFileSync("lib/retry.ts", "utf8");

describe("what the card is asked for", () => {
  it("includes a one-time bump", () => {
    expect(checkout).toContain("const bumpNowCents =");
    expect(checkout).toContain("priceCents: payableCents + bumpNowCents,");
  });

  it("leaves a recurring bump out of it", () => {
    // A trial takes nothing today, so there is nothing to fold in, and its
    // subscription bills on its own terms.
    expect(checkout).toMatch(/bumpOffer\.billingType === "one_time" \? immediateChargeCents\(bumpOffer\) : 0/);
  });

  it("records an order that adds up to what was charged", () => {
    expect(checkout).toContain("subtotal_cents: listCents + bumpNowCents,");
  });
});

describe("fulfilment of something already paid for", () => {
  const fulfil = checkout.slice(
    checkout.indexOf("export async function fulfilBump"),
    checkout.indexOf("// Idempotently finalize a paid order"),
  );

  it("takes no second payment", () => {
    // Charging here as well would bill the buyer twice for one tickbox.
    expect(fulfil).toContain("args.prepaid");
    expect(fulfil).toMatch(/args\.prepaid[\s\S]{0,200}: await fulfilOffer\(/);
  });

  it("still grants it and still writes the line", () => {
    // The money is settled; the access and the bookkeeping are not.
    expect(fulfil).toContain("grantOfferOwnership(");
    expect(fulfil).toContain('kind: "bump"');
  });

  it("is told so by the intent, not by guessing", () => {
    // Written by us into metadata, read by us — nothing the browser sends can
    // turn a charge into a free grant.
    expect(checkout).toContain('prepaid: pi.metadata.bumpPrepaid === "true"');
    // billingType, not bumpNowCents > 0 — a FREE one-time bump and a
    // RECURRING one both compute bumpNowCents as 0, so the amount alone
    // cannot tell them apart. A free one-time bump read as not-prepaid would
    // take fulfilOffer's off_session, confirm: true path — the exact India
    // refusal this branch exists to delete — for something already fully
    // covered by the host's own on-session charge.
    expect(checkout).toContain(
      'bumpPrepaid: bumpOffer && bumpOffer.billingType === "one_time" ? "true" : ""',
    );
  });

  it("survives the retry queue without becoming a charge", () => {
    // The failed-bump job replays fulfilBump. A replay that dropped the flag
    // would charge for something already paid for.
    expect(checkout).toMatch(/jobPayload: \{[\s\S]{0,400}prepaid: pi\.metadata\.bumpPrepaid === "true"/);
    expect(retry).toContain("prepaid: p.prepaid === true");
  });

  it("refuses a prepaid claim against an offer that turns out recurring", () => {
    // fulfilOffer's own prepaid/recurring guard (this same file, above) never
    // runs for a prepaid bump — the branch under test here skips calling
    // fulfilOffer entirely when prepaid is set. Without this guard, a bump
    // whose host priced it one-time but whose own price flips to recurring
    // before fulfilment would be granted with no subscription and no charge —
    // free access forever. This is fulfilBump's OWN copy of the guard, not a
    // call into fulfilOffer's, so it has to exist as its own line.
    expect(fulfil).toMatch(/if \(args\.prepaid && offer\.billingType !== "one_time"\)/);
    expect(fulfil).toMatch(/if \(args\.prepaid && offer\.billingType !== "one_time"\)[\s\S]{0,80}throw new Error/);
  });
});
