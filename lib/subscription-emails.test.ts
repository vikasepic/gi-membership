import { describe, it, expect } from "vitest";
import { buildTrialEndingEmail, buildPaymentFailedEmail } from "@/lib/email";

// The two moments a subscriber hears nothing and quietly leaves. What these
// say matters more than that they send: a warning that hides the amount, or
// makes cancelling hard, is worse than no warning.

describe("the trial-ending email", () => {
  const mail = buildTrialEndingEmail({
    productName: "Funnel App",
    priceLabel: "$29",
    intervalLabel: "/month",
    chargeOn: "12 August",
    manageUrl: "https://grow.greaterinside.com/account",
  });

  it("puts the date in the subject, where it is read", () => {
    expect(mail.subject).toContain("12 August");
    expect(mail.subject).toContain("Funnel App");
  });

  it("says the amount and the date together", () => {
    // The most common reason a first subscription charge is disputed is that
    // nobody remembers signing up a week ago.
    expect(mail.html).toContain("$29");
    expect(mail.html).toContain("12 August");
    expect(mail.text).toContain("$29/month on 12 August");
  });

  it("offers a way out, plainly", () => {
    // A warning that makes cancelling hard is not a warning.
    expect(mail.html).toContain("Manage or cancel");
    expect(mail.html).toContain("/account");
  });

  it("says doing nothing keeps it, so the default is not a surprise either", () => {
    expect(mail.html).toMatch(/Nothing to do/i);
  });

  it("carries a text part, for clients that refuse html", () => {
    expect(mail.text.length).toBeGreaterThan(40);
    expect(mail.text).not.toContain("<");
  });
});

describe("the declined-card email", () => {
  const mail = buildPaymentFailedEmail({
    productName: "Funnel App",
    manageUrl: "https://grow.greaterinside.com/account",
  });

  it("leads with what happened", () => {
    expect(mail.subject).toContain("could not take payment");
    expect(mail.html).toMatch(/declined/i);
  });

  it("says they still have access, which is true and calming", () => {
    // Access is deliberately kept while Stripe retries. Someone who thinks
    // they have been cut off does not come back to fix the card.
    expect(mail.html).toContain("still have access");
    expect(mail.text).toContain("still have access");
  });

  it("says the card will be retried, so the email is not the only chance", () => {
    expect(mail.html).toMatch(/try the card again|retry/i);
  });

  it("links straight to updating the card", () => {
    expect(mail.html).toContain("Update your card");
    expect(mail.html).toContain("/account");
  });
});

describe("what neither email does", () => {
  const both = [
    buildTrialEndingEmail({
      productName: "X",
      priceLabel: "$29",
      intervalLabel: "/month",
      chargeOn: "1 Jan",
      manageUrl: "https://x/account",
    }),
    buildPaymentFailedEmail({ productName: "X", manageUrl: "https://x/account" }),
  ];

  it("never carries a billing-portal session link", () => {
    // A portal session is short-lived and single-customer. One sitting in an
    // inbox is either expired by the time it is clicked, or a link nobody
    // should be forwarding.
    for (const m of both) expect(m.html).not.toContain("billing.stripe.com");
  });

  it("never asks for card details in the email itself", () => {
    for (const m of both) {
      expect(m.html).not.toMatch(/<input/i);
      expect(m.html).not.toMatch(/card number/i);
    }
  });
});
