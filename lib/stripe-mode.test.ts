import { describe, it, expect, afterEach } from "vitest";
import { stripePublishableKey } from "@/lib/env";

const orig = { sk: process.env.STRIPE_SECRET_KEY, pk: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY };
afterEach(() => {
  process.env.STRIPE_SECRET_KEY = orig.sk;
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = orig.pk;
});
const set = (sk: string, pk: string) => {
  process.env.STRIPE_SECRET_KEY = sk;
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk;
};

// The classic go-live mistake: swap one key and not the other. Caught at boot
// rather than mid-checkout, where it surfaces as a card error and blames the
// buyer's card for a configuration mistake.
describe("Stripe key mode mismatch", () => {
  it("accepts a matched test pair", () => {
    set("sk_test_abc", "pk_test_abc");
    expect(stripePublishableKey()).toBe("pk_test_abc");
  });

  it("accepts a matched live pair", () => {
    set("sk_live_abc", "pk_live_abc");
    expect(stripePublishableKey()).toBe("pk_live_abc");
  });

  it("refuses a live secret with a test publishable", () => {
    set("sk_live_abc", "pk_test_abc");
    expect(() => stripePublishableKey()).toThrow(/mismatch[\s\S]*secret is LIVE[\s\S]*publishable is TEST/i);
  });

  it("refuses a test secret with a live publishable", () => {
    set("sk_test_abc", "pk_live_abc");
    expect(() => stripePublishableKey()).toThrow(/mismatch/i);
  });
});
