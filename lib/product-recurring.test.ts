import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const checkout = readFileSync("lib/checkout.ts", "utf8");
const form = readFileSync("components/checkout/checkout-form.tsx", "utf8");
const route = readFileSync("app/(store)/checkout/complete/route.ts", "utf8");
const actions = readFileSync("app/(store)/checkout/actions.ts", "utf8");

const inFn = (name: string) => {
  const at = checkout.indexOf(`export async function ${name}`);
  const next = checkout.indexOf("\nexport ", at + 10);
  return checkout.slice(at, next === -1 ? undefined : next);
};

/**
 * A product can now be sold monthly, and that is a fork in the money path.
 *
 * A one-off charge and a subscription are two different Stripe objects with two
 * different failure modes, and the expensive mistakes here are all silent: the
 * wrong price charged, the same subscription created twice, access granted to
 * somebody nobody is billing.
 */
describe("the browser never picks the price", () => {
  it("sends an index, and the server rebuilds the list", () => {
    // The same invariant the bump and the upsell hold. Never an id, never an
    // amount — the only thing a tampered post can buy is something it was shown.
    expect(form).toContain("priceChoice: pricePick ?? undefined");
    expect(inFn("createCheckoutIntent")).toContain("livePrices(product.prices)");
  });

  it("refuses an index outside the list", () => {
    // Falling back to the headline price would charge somebody for an option
    // they did not choose.
    expect(inFn("createCheckoutIntent")).toContain("That option is no longer available.");
  });

  it("prices the coupon against the chosen way, not the headline", () => {
    // A code resolved against $49 and applied to a $9 monthly takes more off
    // than the price.
    expect(inFn("createCheckoutIntent")).toContain("resolveCoupon(input.couponCode, listCents");
  });

  it("records which way to pay on the order line", () => {
    expect(inFn("createCheckoutIntent")).toContain("product_price_id: chosen?.id ?? null");
  });
});

describe("a recurring price saves the card instead of charging it", () => {
  it("opens a SetupIntent, not a $0 payment", () => {
    // Stripe will not make a $0 PaymentIntent, which is what a trial would need.
    const fn = inFn("createCheckoutIntent");
    expect(fn).toContain("setupIntents.create");
    expect(fn).toContain('mode: "setup"');
  });

  it("tells the browser which object to confirm", () => {
    // Confirming the wrong one fails with a message about a client secret,
    // which tells the buyer nothing.
    expect(form).toContain('res.mode === "setup"');
    expect(form).toContain("confirmSetup");
    expect(form).toContain("confirmPayment");
  });

  it("comes back through the same route", () => {
    // confirmSetup redirects with setup_intent rather than payment_intent.
    expect(route).toContain('url.searchParams.get("setup_intent")');
  });

  it("keeps the two ids in separate columns", () => {
    // Reusing stripe_payment_intent_id would mean every reader of a payment id
    // has to know it might be a setup id, and the ones that forget retrieve the
    // wrong object type and throw.
    expect(checkout).toContain("stripe_setup_intent_id: si.id");
  });
});

describe("finalize creates the subscription exactly once", () => {
  const fn = inFn("finalizeOrder");

  it("finds the order by either intent", () => {
    expect(fn).toContain("stripe_payment_intent_id");
    expect(fn).toContain("stripe_setup_intent_id");
  });

  it("keys idempotency on the SetupIntent", () => {
    // The thank-you page and the Stripe webhook both call this within
    // milliseconds. Without the key they would create two subscriptions.
    expect(fn).toContain("idempotencyKey: `basesub_${intentId}`");
  });

  it("bills the price it was told at start, read back from our own metadata", () => {
    expect(fn).toContain("pi.metadata.productPriceId");
    expect(fn).toContain("!x.archived");
  });

  it("refuses rather than guessing when that price has gone", () => {
    // Archived between saving the card and landing here. Charging the headline
    // instead would bill somebody for something they never chose.
    expect(fn).toContain("the chosen way to pay no longer exists");
  });

  it("subscribes BEFORE granting access", () => {
    // The order is already claimed as paid and cannot be replayed, so granting
    // first and failing here would hand out access nobody is billed for.
    expect(fn.indexOf("subscriptions.create")).toBeLessThan(fn.indexOf("grant base"));
  });

  it("records the subscription against what it grants", () => {
    // The reconciler, the cancel flow and the trial-ending email all ask "who
    // is on this".
    expect(fn).toContain("stripe_subscription_id: baseSubscriptionId");
    expect(fn).toContain("product_price_id: basePriceId");
  });

  it("lets Stripe work out the tax on every future invoice", () => {
    // Ours could only ever be right for the first one.
    expect(fn).toContain("automatic_tax");
  });

  it("hands the coupon to Stripe rather than discounting the unit amount", () => {
    // Editing unit_amount down would discount every renewal, forever, silently.
    expect(fn).toContain("promotion_code");
    expect(fn).toContain("unit_amount: price.priceCents");
  });
});

describe("the rest of the funnel still works on a subscription order", () => {
  it("offers the upsell after one", () => {
    expect(inFn("resolveOtoForOrder")).toContain("stripe_setup_intent_id");
  });

  it("still fulfils a bump, on the card the SetupIntent saved", () => {
    expect(inFn("finalizeOrder")).toContain("bumpOfferId");
  });

  it("takes the choice through the action layer", () => {
    expect(actions).toContain("priceChoice: z.coerce.number().int().min(0).optional()");
  });
});

describe("a product subscription is not a second-class one", () => {
  it("loses access when it is cancelled, through the same path an offer does", () => {
    // ownershipFor excludes 'canceled', and syncSubscriptionOwnership updates
    // by subscription id rather than by offer — so recording the subscription
    // on the ownership row is what made cancellation work at all.
    const own = readFileSync("lib/checkout.ts", "utf8");
    expect(own).toContain('.neq("status", "canceled")');
    const sync = readFileSync("lib/subscription-sync.ts", "utf8");
    expect(sync).toContain('.eq("stripe_subscription_id", stripeSubscriptionId)');
  });

  it("is named in the drift report rather than showing as blank", () => {
    // A drifting row nobody can identify is a row nobody can act on, and acting
    // on them is the entire point of that screen.
    const rec = readFileSync("lib/subscription-reconcile.ts", "utf8");
    expect(rec).toContain("product_id");
    expect(rec).toContain('db.from("products").select("id, title")');
  });

  it("is named in the trial-ending email", () => {
    // "Your subscription ends in three days" three days before charging
    // somebody is the exact ambiguity that email exists to remove.
    const emails = readFileSync("lib/subscription-emails.ts", "utf8");
    expect(emails).toContain("product_price_id");
    expect(emails).toContain('db.from("products").select("title, currency")');
  });

  it("warns about the price they are ON, not the product's headline", () => {
    // A product sold monthly and yearly would otherwise warn the yearly
    // subscriber about the monthly figure.
    const emails = readFileSync("lib/subscription-emails.ts", "utf8");
    expect(emails).toContain('.from("product_prices")');
    expect(emails).toContain('.eq("id", row.product_price_id as string)');
  });
});
