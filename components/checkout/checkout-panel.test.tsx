import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
const { CheckoutPanel } = await import("@/components/checkout/checkout-panel");
const { LEGAL_DEFAULTS } = await import("@/lib/legal-defaults");

const panel = (over: Partial<React.ComponentProps<typeof CheckoutPanel>> = {}) =>
  renderToStaticMarkup(
    <CheckoutPanel
      title="Product Validator"
      tagline="Know before you build."
      coverUrl="https://x.test/cover.webp"
      backHref="/p/product-validator"
      {...over}
    />,
  );

// This half exists to answer the questions someone asks themselves with their
// card already out. Every claim has to be one the code actually keeps.

describe("what the panel says", () => {
  it("shows the thing being bought, not just its name", () => {
    const out = panel();
    expect(out).toContain("cover.webp");
    expect(out).toContain("Product Validator");
    expect(out).toContain("Know before you build.");
  });

  it("says where the card goes", () => {
    // The single most load-bearing sentence on the page, and it is true:
    // Stripe's Payment Element is an iframe on Stripe's own domain.
    expect(panel()).toContain("never reach our servers");
  });

  it("takes the refund window from the policy, not from prose", () => {
    // A number typed here could drift from the one the refunds page states,
    // and the buyer would be reading a promise nobody is keeping.
    expect(panel()).toContain(`${LEGAL_DEFAULTS.refundWindowDays} days to change your mind`);
  });

  it("states the window it was given, not the default", () => {
    // The window is a setting now. If the panel ignored the prop, raising the
    // policy to 30 days would leave the checkout promising 14 — and the
    // checkout is the copy read with a card already out.
    expect(panel({ refundWindowDays: 30 })).toContain("30 days to change your mind");
  });

  it("names the domain it is on", () => {
    // Anyone taught to check the address bar can check without leaving.
    expect(panel()).toContain("grow.greaterinside.com");
  });

  it("keeps a way back to the product", () => {
    expect(panel()).toContain('href="/p/product-validator"');
  });
});

describe("what it says only when it is true", () => {
  it("says nothing about trials when nothing on offer has one", () => {
    const out = panel();
    expect(out).not.toContain("free trial");
  });

  it("promises the warning email only when there is a trial", () => {
    // The trial-ending email is built and firing, so this is a real promise —
    // but only to someone who is actually being offered a trial.
    const out = panel({ hasTrial: true });
    expect(out).toContain("email you before it ends");
    expect(out).toContain("two clicks");
  });

  it("survives a product with no cover and no tagline", () => {
    const out = panel({ coverUrl: null, tagline: null });
    expect(out).toContain("Product Validator");
    expect(out).not.toContain("<img");
  });
});

describe("claims it must never make", () => {
  const out = panel({ hasTrial: true });

  it.each([
    ["a buyer count", /\d+[,\d]*\s*(buyers|customers|people)/i],
    ["scarcity", /only \d+ left|hurry|expires in/i],
    ["a borrowed security seal", /mcafee|norton|verisign/i],
  ])("makes no %s", (_what, pattern) => {
    // Six paid orders and five buyers. A count would be a lie, and a badge for
    // a relationship we do not have is worse than no badge — the buyer who
    // checks is the one who was already hesitating.
    expect(out).not.toMatch(pattern);
  });
});

describe("copy the product supplies", () => {
  it("shows a note under the tagline", () => {
    expect(panel({ note: "Delivered as a PDF you keep." })).toContain("Delivered as a PDF you keep.");
  });

  it("replaces the standard list when the product has its own", () => {
    const out = panel({ bullets: ["Written for founders, not marketers."] });
    expect(out).toContain("Written for founders, not marketers.");
    expect(out).not.toContain("days to change your mind");
  });

  it("keeps the standard list when the product says nothing", () => {
    // A blank column is worse than three true sentences.
    const out = panel({ bullets: [] });
    expect(out).toContain("never reach our servers");
    expect(out).toContain("days to change your mind");
  });

  it("is the list the product form promises: three, and four with a reply time", () => {
    // The hint beside the Reassurance list in product-form is the only place
    // an owner is told what "empty" leaves behind, and it said four — counting
    // the trial warning, which is not in this list and cannot be replaced, and
    // not counting the reply time, which is. Asserted as a count so the copy
    // and the render cannot drift apart again.
    // `<li ` with the space: a cover image makes React emit a preload `<link`,
    // which a looser match counts as a fourth reassurance.
    const lines = (out: string) => (out.match(/<li /g) ?? []).length;
    expect(lines(panel({ bullets: [] }))).toBe(3);
    expect(lines(panel({ bullets: [], replyTime: "We answer within a day." }))).toBe(4);
    // The warning arrives on top of them rather than among them.
    expect(lines(panel({ bullets: [], hasTrial: true }))).toBe(4);
  });

  it("still warns about a trial even when the list was replaced", () => {
    // What a buyer is agreeing to is not a selling point to be edited away.
    const out = panel({ hasTrial: true, bullets: ["Only my line."] });
    expect(out).toContain("Only my line.");
    expect(out).toContain("before it ends and turns into a payment");
  });
});
