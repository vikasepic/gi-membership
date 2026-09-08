import { describe, it, expect } from "vitest";
import { mintOfferLogin } from "@/lib/post-purchase";

describe("mintOfferLogin", () => {
  it("refuses an id that is neither intent, without calling Stripe", async () => {
    expect(await mintOfferLogin("cus_nope", "secret")).toBeNull();
  });

  it("refuses when there is no client secret to compare", async () => {
    expect(await mintOfferLogin("pi_123", null)).toBeNull();
  });
});
