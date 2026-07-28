import { describe, it, expect } from "vitest";
import { emailEnabled, buildWelcomeEmail, buildReceiptEmail } from "@/lib/email";

describe("emailEnabled", () => {
  it("is off when no API key is configured", () => {
    expect(emailEnabled({})).toBe(false);
  });

  it("needs both an API key and a from address", () => {
    expect(emailEnabled({ RESEND_API_KEY: "re_x" })).toBe(false);
    expect(emailEnabled({ RESEND_FROM: "a@b.com" })).toBe(false);
    expect(emailEnabled({ RESEND_API_KEY: "re_x", RESEND_FROM: "a@b.com" })).toBe(true);
  });
});

describe("buildWelcomeEmail", () => {
  const mail = buildWelcomeEmail({
    email: "buyer@example.com",
    productTitle: "The Deep Work Course",
    siteUrl: "https://grow.greaterinside.com",
  });

  it("tells the buyer where to sign in", () => {
    expect(mail.html).toContain("https://grow.greaterinside.com/login");
  });

  it("names what they bought", () => {
    expect(mail.subject).toContain("The Deep Work Course");
  });

  it("never contains a password", () => {
    // The buyer chose their own password at checkout; emailing one back would
    // put a live credential in their inbox forever.
    expect(mail.html.toLowerCase()).not.toContain("password:");
  });

  it("provides a plain-text alternative", () => {
    expect(mail.text.length).toBeGreaterThan(0);
  });
});

describe("buildReceiptEmail", () => {
  const mail = buildReceiptEmail({
    email: "buyer@example.com",
    orderId: "order-123",
    lines: [
      { description: "The Deep Work Course", amountCents: 2700 },
      { description: "Content Engine — 7-day trial", amountCents: 0 },
    ],
    totalCents: 2700,
    taxCents: 0,
    currency: "usd",
  });

  it("shows every line, including free trial lines", () => {
    expect(mail.html).toContain("The Deep Work Course");
    expect(mail.html).toContain("Content Engine");
  });

  it("formats money in major units, not cents", () => {
    expect(mail.html).toContain("$27.00");
    expect(mail.html).not.toContain("2700");
  });

  it("shows tax as its own line when charged", () => {
    const taxed = buildReceiptEmail({
      email: "b@c.com",
      orderId: "o1",
      lines: [{ description: "Guide", amountCents: 2700 }],
      totalCents: 3240,
      taxCents: 540,
      currency: "usd",
    });
    expect(taxed.html).toContain("$5.40");
    expect(taxed.html).toContain("$32.40");
  });

  it("references the order so support can find it", () => {
    expect(mail.html).toContain("order-123");
  });
});
