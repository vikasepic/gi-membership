import { describe, it, expect } from "vitest";
import { buildReceiptEmail } from "@/lib/email";

/**
 * The receipt, which a buyer keeps and a finance person reads.
 *
 * It used to be three lines: the items, a total, and a uuid. A buyer who used a
 * discount code saw a total that did not match the prices printed above it and
 * nothing on the page explaining the difference — the one question a receipt
 * exists to answer.
 */

const base = {
  email: "buyer@example.com",
  orderId: "a153d1ec-d179-4749-b9c8-1158ef0527e6",
  lines: [
    { description: "Digital Product Validator", amountCents: 1900 },
    { description: "150 Digital Product Ideas", amountCents: 1100 },
  ],
  totalCents: 1150,
  taxCents: 0,
  currency: "usd",
  paidAt: new Date("2026-08-18T09:00:00Z"),
};

describe("a receipt with a discount", () => {
  const mail = buildReceiptEmail({
    ...base,
    subtotalCents: 3000,
    discountCents: 1850,
    couponCode: "DPBS",
  });

  it("shows the arithmetic, including the code that caused it", () => {
    for (const part of ["Subtotal", "$30.00", "DPBS", "−$18.50", "Total paid", "$11.50"]) {
      expect(mail.html, part).toContain(part);
    }
  });

  it("says the same thing in plain text", () => {
    // Some clients show only this, and a receipt that is complete in one
    // rendering and not the other is a receipt somebody has to ask about.
    expect(mail.text).toContain("DPBS");
    expect(mail.text).toContain("-$18.50");
    expect(mail.text).toContain("Total paid  $11.50");
  });

  it("carries the amount in the subject, where a mailbox shows it", () => {
    expect(mail.subject).toContain("$11.50");
  });
});

describe("a receipt with nothing taken off", () => {
  const mail = buildReceiptEmail({ ...base, totalCents: 3000 });

  it("does not print rows that would only raise questions", () => {
    // "Discount $0.00" is noise; "Tax $0.00" invites the question of why not.
    expect(mail.html).not.toContain("Discount");
    expect(mail.html).not.toContain("Tax");
    expect(mail.html).not.toContain("Subtotal");
  });

  it("still totals, dates and identifies itself", () => {
    expect(mail.html).toContain("$30.00");
    expect(mail.html).toContain("18 August 2026");
    // Short where it is read, complete where it is quoted to support.
    expect(mail.html).toContain("Order A153D1EC");
    expect(mail.html).toContain(base.orderId);
  });

  it("points at the thing that was bought", () => {
    // A receipt with no way back to the purchase makes somebody search their
    // inbox for the welcome email instead.
    expect(mail.html).toContain("/library");
  });
});

describe("tax", () => {
  it("appears only when there is some, with a subtotal to make sense of it", () => {
    const mail = buildReceiptEmail({ ...base, totalCents: 3300, taxCents: 300 });
    expect(mail.html).toContain("Tax");
    expect(mail.html).toContain("$3.00");
    expect(mail.html).toContain("Subtotal");
  });
});
