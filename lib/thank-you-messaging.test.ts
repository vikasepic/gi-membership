import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// A buyer who ACCEPTED the upsell was shown "We couldn't confirm this payment"
// on success — the upsell redirects with ?oto=accepted and no redirect_status,
// and the page only read redirect_status. A live subscription, a charged card,
// and a message telling them it failed.
//
// These assert the two properties that prevent it recurring, read from source
// because the page is a server component with no exported logic to call.

const src = readFileSync("app/(store)/checkout/thank-you/page.tsx", "utf8");

describe("thank-you never reports a successful purchase as failed", () => {
  it("treats an oto result as a completed purchase", () => {
    // The upsell is only reachable after payment succeeded, so its presence is
    // itself proof the base order went through.
    expect(src).toMatch(/const paid =[\s\S]{0,80}Boolean\(oto\)/);
  });

  it("only calls it failed when redirect_status is present and not succeeded", () => {
    // Absent must not mean failed — that was the bug.
    expect(src).toMatch(/const failed = Boolean\(redirect_status\) && redirect_status !== "succeeded"/);
  });

  it("has a message for every status acceptOto can return", () => {
    // lib/checkout.ts acceptOto returns these; the action puts them in ?oto=.
    for (const status of ["accepted", "declined", "used", "expired", "invalid", "charge_failed"]) {
      expect(src, `no branch for ${status}`).toContain(`"${status}"`);
    }
  });

  it("never tells an upsell failure that the purchase failed", () => {
    // charge_failed is about the add-on only; the purchase stands.
    expect(src).toMatch(/charge_failed[\s\S]{0,240}Your purchase is unaffected/);
  });
});
