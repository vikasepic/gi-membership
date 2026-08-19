import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { GA4_NAME, META_CUSTOM, META_BOTH_SIDES, NO_VALUE, SERVER_ONLY } from "@/lib/analytics/events";

/**
 * Money going back.
 *
 * A refund revoked access and told nobody, so the sale stayed in Meta and GA4
 * as revenue for good. On this store more than half the paid orders have been
 * refunded, which made the reported figure unrelated to the money in the bank
 * — and the platforms kept optimising towards whatever produced a sale that
 * was handed straight back.
 *
 * A chargeback was worse: nothing handled it at all. Somebody disputed a
 * charge, won by default because no evidence was ever filed, and kept their
 * access.
 */

const reversals = readFileSync("lib/reversals.ts", "utf8");
const hook = readFileSync("app/api/webhooks/stripe/route.ts", "utf8");
const sync = readFileSync("lib/subscription-sync.ts", "utf8");

/** One function's body, to the next top-level export. */
function bodyOf(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const rest = src.slice(start + 10);
  const end = rest.indexOf("\nexport ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("naming them", () => {
  it("uses GA4's own refund event, which its reports already understand", () => {
    expect(GA4_NAME.Refund).toBe("refund");
    expect(GA4_NAME.Chargeback).toBe("refund");
  });

  it("does not borrow a Meta event that would ADD to revenue", () => {
    // fbq only accepts Meta's vocabulary, and the nearest name is Purchase —
    // which would mean the exact opposite of what happened.
    expect(META_CUSTOM).toContain("Refund");
    expect(META_CUSTOM).toContain("Chargeback");
    expect(META_BOTH_SIDES).not.toContain("Refund");
  });

  it("carries the amount, because that is the whole point", () => {
    expect(NO_VALUE).not.toContain("Refund");
    expect(NO_VALUE).not.toContain("Chargeback");
  });

  it("expects no browser to be present", () => {
    // Both arrive as a webhook, days or months after anybody was on a page.
    expect(SERVER_ONLY).toContain("Refund");
    expect(SERVER_ONLY).toContain("Chargeback");
  });

  it("keeps them apart, because they are different facts", () => {
    // A refund is usually the store's decision; a chargeback is the bank
    // reversing a payment over its head, and is the one worth excluding from.
    expect(GA4_NAME.Refund).toBe(GA4_NAME.Chargeback);
    expect(reversals).toContain('kind: "Refund" | "Chargeback"');
  });
});

describe("reporting one", () => {
  it("is matched to its purchase by the ORDER id", () => {
    // GA4 subtracts a refund from revenue on transaction_id. A refund carrying
    // its own id is a refund of nothing.
    expect(reversals).toContain("orderId: args.orderId");
  });

  it("is deduplicated on the refund, not the order", () => {
    // An order can be partially refunded more than once, and a shared id would
    // collapse three refunds into one.
    expect(reversals).toContain("eventIdFor(args.kind, args.stripeId)");
  });

  it("reports what was actually given back", () => {
    // A partial refund is not the whole order; the order total would subtract
    // more revenue than ever left.
    expect(hook).toContain("amountCents: charge.amount_refunded ?? 0");
  });

  it("says nothing about a test order", () => {
    // It never was revenue, so taking it back is not a refund anybody should
    // hear about.
    expect(reversals).toContain("order.livemode === false) return");
  });

  it("still asks for consent", () => {
    expect(reversals).toContain("order.tracking_consent !== true) return");
  });

  it("cannot fail the webhook", () => {
    // The money has moved. A throw here has Stripe redeliver a reversal that
    // has already been applied.
    const fn = reversals.slice(0, reversals.indexOf("export async function handleDispute"));
    expect(fn).toContain("catch (e)");
  });
});

describe("a chargeback", () => {
  it("is handled at all", () => {
    expect(hook).toContain('case "charge.dispute.created"');
  });

  it("takes the access with the money", () => {
    // The funds go the moment a dispute opens. Waiting for it to close means
    // giving the product away for the months Stripe allows for evidence.
    expect(reversals).toContain("await revoke(piId)");
  });

  it("tells somebody, with the deadline", () => {
    // A dispute has a due date and one nobody answers is lost by default.
    expect(reversals).toContain('source: "chargeback"');
    expect(reversals).toContain("evidence_details?.due_by");
    expect(reversals).toContain("lost by default");
  });

  it("does not silently re-grant when it is won", () => {
    // Restoring somebody's account from a webhook is a decision worth a human,
    // and it is rare enough to afford one.
    expect(hook).toContain('case "charge.dispute.closed"');
    expect(reversals).toContain("has NOT been restored automatically");
  });
});

describe("refunding only the upsell", () => {
  it("revokes the upsell", () => {
    // It is charged on its OWN PaymentIntent and recorded on the order ITEM,
    // so the order lookup matched nothing and revoked nothing — the buyer got
    // their money back and kept the thing.
    expect(sync).toContain("export async function revokeOwnershipForItem");
    expect(sync).toContain('.eq("stripe_payment_intent_id", paymentIntentId)');
  });

  it("leaves the rest of the order alone", () => {
    // That was a separate, unrefunded payment. Taking the product away because
    // somebody changed their mind about the add-on is a worse bug.
    const fn = bodyOf(sync, "revokeOwnershipForItem");
    expect(fn).not.toContain("revokeOwnershipForOrder");
    expect(fn).not.toContain('status: "refunded"');
  });

  it("tells the app, like the order-level revoke does", () => {
    const fn = bodyOf(sync, "revokeOwnershipForItem");
    expect(fn).toContain("pushOwnershipStateToApps");
  });
});
