import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The Stripe account is shared: Circle's community memberships, the Funnel
 * App's own signup and another app all bill through it, and the webhook hears
 * every subscription event. 29 Sep 2026: Circle's $300 membership sat on the
 * Transactions page as a nameless "Cancelled Subscription", and a Funnel App
 * signup had been sent the store's trial reminder on the 27th.
 */
vi.mock("server-only", () => ({}));
const { belongsToStore } = await import("@/lib/subscriptions");

const link = (over: Partial<{ userId: string; offerId: string; productId: string }> = {}) => ({
  storeId: "s",
  userId: null,
  offerId: null,
  productId: null,
  ...over,
});

describe("whose subscription it is", () => {
  it("a subscription this store created is ours, even before anything links it", () => {
    // customer.subscription.created lands before the access row is written.
    expect(belongsToStore({ metadata: { store_created: "true" } }, link())).toBe(true);
  });

  it("Circle's paywall and other apps' subscriptions with nothing linked are not", () => {
    expect(belongsToStore({ metadata: { source: "paywall", paywall_id: "170567" } }, link())).toBe(false);
    expect(belongsToStore({ metadata: { app: "gi-funnel", flow: "signup" } }, link())).toBe(false);
    expect(belongsToStore({ metadata: {} }, link())).toBe(false);
  });

  it("a connected app's own billing is not ours, even on a member's access row", () => {
    // Decided 30 Sep 2026: the member keeps the Funnel App access; the Funnel
    // App keeps the payments and the status.
    expect(belongsToStore({ metadata: { app: "gi-funnel" } }, link({ userId: "u1" }))).toBe(false);
  });

  it("anything tied to a Grow offer or product is ours", () => {
    expect(belongsToStore({ metadata: {} }, link({ userId: "u1", offerId: "o1" }))).toBe(true);
    expect(belongsToStore({ metadata: {} }, link({ productId: "p1" }))).toBe(true);
  });
});

describe("where it is enforced", () => {
  const subs = readFileSync("lib/subscriptions.ts", "utf8");
  const sweep = readFileSync("lib/trial-reminders.ts", "utf8");

  it("the sync writes nothing for a subscription that is not ours", () => {
    expect(subs).toContain("if (!belongsToStore(sub, link)) return null;");
  });

  it("the money screens read only Grow-sold rows, hiding older ones rather than deleting them", () => {
    expect(subs).toContain('.or("offer_id.not.is.null,product_id.not.is.null")');
  });

  it("the trial reminder only goes to subscriptions the store sold and Stripe says it created", () => {
    expect(sweep).toContain('.or("offer_id.not.is.null,product_id.not.is.null")');
    expect(sweep).toContain('sub.metadata?.store_created !== "true"');
    // Checked before the email, not after.
    expect(sweep.indexOf('sub.metadata?.store_created !== "true"')).toBeLessThan(sweep.indexOf("await sendTrialEndingEmail"));
  });
});
