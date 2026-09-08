import { describe, it, expect } from "vitest";
import { completeOfferCheckout } from "@/lib/offer-checkout";

const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!canRun)("what completeOfferCheckout will accept", () => {
  it("refuses an id that is neither kind of intent rather than guessing", async () => {
    expect(await completeOfferCheckout("cus_notanintent")).toEqual({
      ok: false,
      error: "unknown_intent",
    });
  });
});
