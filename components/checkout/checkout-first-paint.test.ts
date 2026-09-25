import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * What a buyer sees in the first seconds on the offer checkout.
 *
 * Found 25 Sep 2026 on the Micro-Product Builder: 1,053 people landed from
 * ads, 67 clicked buy, 4 paid. The product checkout beside it converts the
 * same step at 29%. Walking both pages live, three things set the offer
 * checkout apart, and all three are here.
 */
const offerPage = readFileSync("app/(store)/checkout/offer/page.tsx", "utf8");
const productPage = readFileSync("app/(store)/checkout/page.tsx", "utf8");
const offerForm = readFileSync("components/checkout/offer-checkout-form.tsx", "utf8");
const rootLayout = readFileSync("app/layout.tsx", "utf8");

describe("the offer checkout's title", () => {
  it("is the offer's name, never its headline field", () => {
    // `headline` doubles as the sales page's fallback <title>, so SEO copy
    // written into it — "… | Greater Inside" — landed at the top of the
    // payment form. The product checkout has always used the product's title.
    expect(offerPage).not.toContain("offer.headline ?? offer.name");
    expect(offerPage).toContain("headline: offer.name,");
    expect(offerPage).toContain("title={offer.name}");
  });
});

describe("a one-time offer says it is one", () => {
  it("in the same words the product checkout uses", () => {
    expect(offerPage).toContain('const oneTime = ways.length === 1 && ways[0].billingType === "one_time"');
    expect(offerPage).toContain('eyebrow={oneTime ? "One-time purchase"');
    expect(offerPage).toContain('"one-time · instant access"');
    // The words themselves are the product checkout's, not a paraphrase.
    expect(productPage).toContain('"One-time purchase"');
    expect(productPage).toContain('"one-time · instant access"');
  });

  it("keeps the trial wording for anything that renews", () => {
    expect(offerPage).toContain("<TrialEyebrow name={offer.name} />");
    expect(offerPage).toContain("<TrialPriceTerms price={ways[0]} currency={offer.currency} />");
  });
});

describe("the payment element is born in the right mode", () => {
  it("starts as a payment, with the amount, when the first price is one-time", () => {
    // Starting in "setup" and switching later meant a $29 one-off opened as a
    // save-a-card element: mandate line, wallets and first paint all wrong,
    // then a re-render. The product form has always been created in payment
    // mode with its amount.
    expect(offerForm).toContain("const bornAsPayment = !startsRecurring && firstAmount > 0");
    expect(offerForm).toMatch(/bornAsPayment\s*\?\s*\{\s*mode:\s*"payment" as const,\s*amount:\s*firstAmount,\s*setupFutureUsage:\s*"off_session" as const\s*\}/);
  });

  it("still starts as setup for anything that renews, where there is nothing to charge today", () => {
    expect(offerForm).toMatch(/:\s*\{\s*mode:\s*"setup" as const\s*\}/);
    expect(offerForm).toContain('firstPrice.billingType === "recurring"');
  });

  it("works the first price out the way Inner will, so the two cannot disagree", () => {
    // Same expression as Inner's own useState initialiser.
    expect(offerForm).toContain("const firstPick = chosen >= 0 ? chosen : prices.length === 1 ? 0 : -1");
    expect(offerForm).toContain("useState<number>(chosen >= 0 ? chosen : prices.length === 1 ? 0 : -1)");
  });

  it("leaves Inner's mode switch exactly as it was", () => {
    // The existing elements-mode tests pin that effect; this only guards
    // that the new start did not become a reason to remove it.
    expect(offerForm).toMatch(/elements\.update\(\{\s*mode:\s*"payment"/);
    expect(offerForm).toMatch(/if\s*\(isRecurring\)\s*\{\s*void elements\.update\(\{\s*mode:\s*"setup"/);
  });
});

describe("no Stripe warm-up on the checkouts, for now", () => {
  it("renders neither a preconnect nor a preload for js.stripe.com", () => {
    // Tried 25 Sep 2026: a preconnect plus a preload of https://js.stripe.com/v3/
    // rendered on both checkout pages. Locally it brought the card fields
    // from 3.3 s to under 1 s. On production it was intermittent: one
    // navigation mounted at 0.93 s, the next three had not mounted after 30 s,
    // where four consecutive measurements before the change all mounted
    // within six. Both checkouts, and the warm-up was the only change the
    // product page had. Pulled the same evening. A safer variant needs to be
    // measured on production, repeatedly, before it is trusted with money.
    expect(offerPage).not.toContain("js.stripe.com");
    expect(productPage).not.toContain("js.stripe.com");
    expect(offerPage).not.toContain("StripeWarmup");
    expect(productPage).not.toContain("StripeWarmup");
    expect(rootLayout).not.toContain("js.stripe.com");
  });
});
