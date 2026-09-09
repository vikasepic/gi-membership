import { describe, it, expect, vi } from "vitest";

// The one behaviour added when mintOfferLogin learned to accept either intent
// kind: a pi_ id must retrieve a PaymentIntent, a seti_ id a SetupIntent. The
// return value can't tell those apart — both come back null against a bare
// {} response — so this watches which Stripe call is actually made. Variables
// referenced from vi.mock's factory have to go through vi.hoisted: vi.mock is
// hoisted above the rest of the file, so a plain module-level const would
// still be in its temporal dead zone when the factory runs.
const { paymentIntentsRetrieve, setupIntentsRetrieve } = vi.hoisted(() => ({
  paymentIntentsRetrieve: vi.fn(async () => ({})),
  setupIntentsRetrieve: vi.fn(async () => ({})),
}));
vi.mock("@/lib/stripe", async (orig) => ({
  ...(await orig<typeof import("@/lib/stripe")>()),
  stripe: () => ({
    paymentIntents: { retrieve: paymentIntentsRetrieve },
    setupIntents: { retrieve: setupIntentsRetrieve },
  }),
}));

import { mintOfferLogin } from "@/lib/post-purchase";

describe("mintOfferLogin", () => {
  it("refuses an id that is neither intent, without calling Stripe", async () => {
    expect(await mintOfferLogin("cus_nope", "secret")).toBeNull();
  });

  it("refuses when there is no client secret to compare", async () => {
    expect(await mintOfferLogin("pi_123", null)).toBeNull();
  });

  it("routes a pi_ id to paymentIntents.retrieve, not setupIntents.retrieve", async () => {
    await mintOfferLogin("pi_123", "secret");
    expect(paymentIntentsRetrieve).toHaveBeenCalledWith("pi_123");
    expect(setupIntentsRetrieve).not.toHaveBeenCalled();
  });

  it("routes a seti_ id to setupIntents.retrieve, not paymentIntents.retrieve", async () => {
    paymentIntentsRetrieve.mockClear();
    setupIntentsRetrieve.mockClear();
    await mintOfferLogin("seti_123", "secret");
    expect(setupIntentsRetrieve).toHaveBeenCalledWith("seti_123");
    expect(paymentIntentsRetrieve).not.toHaveBeenCalled();
  });
});
