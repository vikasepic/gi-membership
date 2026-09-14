import { describe, it, expect } from "vitest";
import { basketMetadata, type BasketItem } from "@/lib/order-stripe-metadata";

/**
 * The basket, as Stripe carries it.
 *
 * These four keys existed only on orders a one-time backfill had touched until
 * 12 Sep 2026, so every new order arrived without them. The format is pinned
 * here because the backfilled orders and the new ones have to read identically
 * in an export — two shapes for one thing is worse than neither.
 */

const at = (s: string) => `2026-09-12T${s}:00.000Z`;

describe("the basket Stripe carries", () => {
  it("writes the same shape the backfill wrote", () => {
    const items: BasketItem[] = [
      { kind: "product", description: "Digital Product Validator", amount_cents: 1900, created_at: at("10:00") },
      { kind: "bump", description: "150 Digital Product Ideas", amount_cents: 1100, created_at: at("10:01") },
    ];
    // The four keys the backfill wrote. The upsell keys arrived later and are
    // pinned by their own test below; toMatchObject keeps this one about these.
    expect(basketMetadata("ord-1", items, 3000, "usd")).toMatchObject({
      orderId: "ord-1",
      items: "product:Digital Product Validator:$19.00 | bump:150 Digital Product Ideas:$11.00",
      itemCount: "2",
      orderTotal: "$30.00",
    });
  });

  it("keeps whole dollars at two decimals", () => {
    // `money()` elsewhere drops a whole-dollar .00. The backfill did not, and
    // an export where some rows say $19 and others $19.00 is the bug this
    // assertion exists to catch.
    expect(basketMetadata("o", [], 1900, "usd").orderTotal).toBe("$19.00");
  });

  it("reads product, then bump, then whatever was added later", () => {
    // Insertion order puts the upsell wherever fulfilment happened to land it.
    const items: BasketItem[] = [
      { kind: "oto", description: "Book Writer", amount_cents: 4700, created_at: at("09:00") },
      { kind: "bump", description: "Launch System", amount_cents: 2900, created_at: at("11:00") },
      { kind: "product", description: "Validator", amount_cents: 1900, created_at: at("12:00") },
    ];
    expect(basketMetadata("o", items, 9500, "usd").items).toBe(
      "product:Validator:$19.00 | bump:Launch System:$29.00 | oto:Book Writer:$47.00",
    );
  });

  it("orders two lines of the same kind by when they happened", () => {
    const items: BasketItem[] = [
      { kind: "oto", description: "Second", amount_cents: 100, created_at: at("13:00") },
      { kind: "oto", description: "First", amount_cents: 100, created_at: at("12:00") },
    ];
    expect(basketMetadata("o", items, 200, "usd").items).toBe(
      "oto:First:$1.00 | oto:Second:$1.00",
    );
  });

  it("honours the order's own currency", () => {
    expect(basketMetadata("o", [], 2500, "gbp").orderTotal).toBe("£25.00");
  });

  it("truncates a long basket rather than losing the whole update", () => {
    // Stripe refuses a metadata value over 500 characters and rejects the
    // entire call, which would take orderId down with it.
    const items: BasketItem[] = Array.from({ length: 40 }, (_, i) => ({
      kind: "oto",
      description: `A rather long product name number ${i}`,
      amount_cents: 1900,
    }));
    const md = basketMetadata("o", items, 76000, "usd");
    expect(md.items.length).toBe(500);
    expect(md.orderId).toBe("o");
    expect(md.itemCount).toBe("40");
  });

  it("never mutates the caller's array", () => {
    const items: BasketItem[] = [
      { kind: "oto", description: "B", amount_cents: 1 },
      { kind: "product", description: "A", amount_cents: 1 },
    ];
    basketMetadata("o", items, 2, "usd");
    expect(items[0].description).toBe("B");
  });
});

describe("the upsell on the intent", () => {
  it("gets its own keys, the way the bump has", () => {
    // Seen 14 Sep 2026: an accepted Funnel App trial showed up on the intent
    // only inside `items`, while the bump has bumpOfferId/bumpOfferName. The
    // subscription carries the rest; the intent names it so one object tells
    // the whole order.
    const items: BasketItem[] = [
      { kind: "product", description: "Digital Product Validator", amount_cents: 1900 },
      { kind: "oto", description: "Funnel App", amount_cents: 0, offer_id: "off-1", stripe_subscription_id: "sub_1" },
    ];
    expect(basketMetadata("ord-1", items, 1900, "usd")).toMatchObject({
      upsellOfferId: "off-1",
      upsellOfferName: "Funnel App",
      upsellAmount: "$0.00",
      upsellSubscriptionId: "sub_1",
    });
  });

  it("writes empty upsell keys when none was taken, so a re-stamp clears a stale one", () => {
    const items: BasketItem[] = [{ kind: "product", description: "X", amount_cents: 900 }];
    expect(basketMetadata("ord-1", items, 900, "usd")).toMatchObject({
      upsellOfferId: "",
      upsellOfferName: "",
      upsellAmount: "",
      upsellSubscriptionId: "",
    });
  });
});
