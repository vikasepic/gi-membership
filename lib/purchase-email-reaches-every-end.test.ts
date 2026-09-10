import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * The welcome email is sent wherever a checkout ends — not only at thank-you.
 *
 * Reported 10 Sep 2026: a built-in app bought at 07:20:14 was welcomed at
 * 07:55:06. `sendPostPurchaseIfDue` had exactly two callers — `confirmCheckout`,
 * which only the PRODUCT funnel's thank-you page calls, and the 30-minute
 * sweep. An offer purchase never touches that page: it ends on /library, with
 * or without an upsell. So the sweep was its only route, every time.
 *
 * Source assertions because each end is a redirect in a route handler or a
 * server action. What has to be caught is a call going missing from a path.
 */
const read = (p: string) => readFileSync(p, "utf8");

describe("every end of a checkout sends the welcome email", () => {
  it("the product funnel's thank-you page, as it always did", () => {
    expect(read("app/(store)/checkout/actions.ts")).toContain("sendPostPurchaseIfDue(orderId)");
    expect(read("app/(store)/checkout/thank-you/page.tsx")).toContain("confirmCheckout(");
  });

  it("an offer purchase, which lands on /library and never on thank-you", () => {
    const src = read("app/(store)/checkout/offer/complete/route.ts");
    expect(src).toContain("sendPostPurchaseIfDue(result.orderId)");
    // Before the redirect that ends the request, or it never runs.
    expect(src.indexOf("sendPostPurchaseIfDue(result.orderId)")).toBeLessThan(
      src.lastIndexOf("return go(`/library?offer="),
    );
  });

  it("an upsell decided either way, which is the end of the funnel", () => {
    expect(read("app/(store)/checkout/oto/actions.ts")).toContain("sendPostPurchaseIfDue(orderId)");
  });

  it("never lets a mail failure break a page the buyer has paid for", () => {
    for (const [f, call] of [
      ["app/(store)/checkout/offer/complete/route.ts", "await sendPostPurchaseIfDue(result.orderId)"],
      ["app/(store)/checkout/oto/actions.ts", "await sendPostPurchaseIfDue(orderId)"],
    ] as const) {
      const src = read(f);
      // The CALL, not the import at the top of the file.
      const at = src.indexOf(call);
      expect(at, `${f} should call the send`).toBeGreaterThan(-1);
      expect(src.slice(Math.max(0, at - 200), at), `${f} must wrap the send`).toContain("try {");
    }
  });

  it("leaves the decisions in the send, not in its callers", () => {
    // Already sent, upsell in flight, email switched off — one place, so a
    // third caller cannot get them subtly wrong.
    const send = read("lib/post-purchase-send.ts");
    expect(send).toContain('if (order.post_purchase_sent_at) return "already"');
    expect(send).toContain('if (!conf.enabled) return "disabled"');
    expect(send).toContain('return "waiting"');
  });
});

describe("what the admin calls a standalone offer line", () => {
  const src = read("components/admin/order-row.tsx");

  it("says 'offer', not 'OTO', when the line sold the offer the order was for", () => {
    // An offer sold on its own page and an offer accepted as an upsell are
    // both written with kind "oto", so the kind alone called a standalone app
    // purchase an upsell.
    expect(src).toContain("function lineKind(");
    expect(src).toContain('item.kind === "oto" && hostOfferId && item.offerId === hostOfferId');
    expect(src).toContain('return "offer"');
  });

  it("leaves a real upsell, and anything predating the column, as it was", () => {
    expect(src).toContain("return item.kind;");
  });

  it("reads the two columns that make the distinction possible", () => {
    const orders = read("lib/orders.ts");
    expect(orders).toContain("host_offer_id");
    expect(orders).toContain("stripe_subscription_id, offer_id");
  });
});
