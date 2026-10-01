import { describe, it, expect } from "vitest";
import { buildRenewalEmail, planNameOf, RENEWAL_EMAIL_DEFAULTS, renewalEmailSchema } from "@/lib/renewal-email";

/**
 * The email a member gets when their plan renews: a thank-you with the receipt
 * inside it, replacing the plain receipt. Pure, so the settings preview and the
 * real send render the same thing.
 */

const base = {
  firstName: "Priya",
  plan: "Funnel App",
  amountCents: 2900,
  taxCents: 0,
  currency: "usd",
  paidAt: new Date("2026-10-01T09:00:00Z"),
  periodStart: new Date("2026-10-01T09:00:00Z"),
  nextDate: new Date("2026-11-01T09:00:00Z"),
  orderId: "8f3a21c0-1111-2222-3333-444455556666",
  siteUrl: "https://grow.greaterinside.com",
};

describe("the copy", () => {
  it("is on by default, so renewals stop getting the bare receipt", () => {
    expect(RENEWAL_EMAIL_DEFAULTS.enabled).toBe(true);
    expect(renewalEmailSchema.parse({})).toEqual(RENEWAL_EMAIL_DEFAULTS);
  });

  it("fills every merge tag in the subject, preview, body and plain text", () => {
    const m = buildRenewalEmail(base);
    expect(m.subject).toBe("thank you, your Funnel App has renewed");
    expect(m.html).toContain("Payment of $29 received. Your next renewal is on 1 November 2026.");
    expect(m.html).toContain("hi Priya,");
    expect(m.html).toContain("your Funnel App subscription has renewed");
    expect(m.text).toContain("hi Priya,");
    expect(m.text).toContain("Next renewal: 1 November 2026");
    expect(m.html + m.text + m.subject).not.toContain("{{");
  });

  it("drops the name cleanly when there is none", () => {
    const m = buildRenewalEmail({ ...base, firstName: "" });
    expect(m.html).toContain(">hi,");
    expect(m.html).not.toContain("hi ,");
    expect(m.text.startsWith("hi,")).toBe(true);
  });

  it("links {{account_link}} to the member's account page", () => {
    const m = buildRenewalEmail(base);
    expect(m.html).toMatch(/<a href="https:\/\/grow\.greaterinside\.com\/account"[^>]*>your account<\/a>/);
    expect(m.text).toContain("your account (https://grow.greaterinside.com/account)");
  });

  it("uses the owner's own copy", () => {
    const m = buildRenewalEmail({ ...base, settings: { subject: "{{plan}} renewed, {{amount}}", closing: "write back any time." } });
    expect(m.subject).toBe("Funnel App renewed, $29");
    expect(m.html).toContain("write back any time.");
  });

  it("escapes what Stripe or the owner typed", () => {
    const m = buildRenewalEmail({ ...base, plan: "<b>Pro</b>", firstName: "<i>x" });
    expect(m.html).not.toContain("<b>Pro</b>");
    expect(m.html).toContain("&lt;b&gt;Pro&lt;/b&gt;");
    expect(m.html).not.toContain("<i>x");
  });
});

describe("the receipt inside it", () => {
  const rowsOf = (html: string) => html.replace(/>\s+</g, "><").replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");

  it("shows the plan, its period, the amount, the total, the dates and the order", () => {
    const flat = rowsOf(buildRenewalEmail(base).html);
    expect(flat).toContain("|Funnel App|1 Oct 2026 to 1 Nov 2026|$29|");
    expect(flat).toContain("|Total paid|$29|");
    expect(flat).toContain("|Paid on|1 October 2026|");
    expect(flat).toContain("|Next renewal|1 November 2026|");
    expect(flat).toContain("|Order|8F3A21C0|");
  });

  it("has no tax row when no tax was charged", () => {
    expect(rowsOf(buildRenewalEmail(base).html)).not.toContain("|Tax|");
  });

  it("splits tax out of the total when there was some", () => {
    const flat = rowsOf(buildRenewalEmail({ ...base, amountCents: 3190, taxCents: 290 }).html);
    expect(flat).toContain("|Funnel App|1 Oct 2026 to 1 Nov 2026|$29|");
    expect(flat).toContain("|Tax|$2.90|");
    expect(flat).toContain("|Total paid|$31.90|");
  });

  it("leaves the period line out when the invoice gave no start", () => {
    const flat = rowsOf(buildRenewalEmail({ ...base, periodStart: null }).html);
    expect(flat).toContain("|Funnel App|$29|");
  });
});

describe("the look comes from the welcome email", () => {
  it("uses its header, signature, font and link colour", () => {
    const m = buildRenewalEmail({
      ...base,
      look: {
        headerImageUrl: "https://cdn.example.com/head.png",
        signatureImageUrl: "https://cdn.example.com/sig.png",
        fontFamily: "Georgia, serif",
        linkColor: "#123456",
      },
    });
    expect(m.html).toContain('src="https://cdn.example.com/head.png"');
    expect(m.html).toContain('src="https://cdn.example.com/sig.png"');
    expect(m.html).toContain("font-family:Georgia, serif");
    expect(m.html).toMatch(/href="https:\/\/grow\.greaterinside\.com\/account" style="color:#123456/);
  });
});

describe("planNameOf", () => {
  it("strips Stripe's quantity and price from the invoice line", () => {
    expect(planNameOf("1 × Content Engine — Instagram (at $29.00 / month)")).toBe("Content Engine — Instagram");
    expect(planNameOf("1 × Funnel App - Monthly (7-day trial) (at $29.00 / month)")).toBe("Funnel App - Monthly (7-day trial)");
    expect(planNameOf("1 × Content Engine — Instagram + LinkedIn (at $398.00 / year)")).toBe("Content Engine — Instagram + LinkedIn");
  });

  it("leaves a plain name alone", () => {
    expect(planNameOf("funnel builder")).toBe("funnel builder");
  });
});
