import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { newBlock, setPropsAt, type Block } from "@/lib/blocks";
import { template as valueTable } from "@/lib/templates/value-table";
import { template as investment } from "@/lib/templates/investment-panel";
import { planMoney } from "@/lib/plan-money";
import { newOfferPrice } from "@/lib/offer-prices";

/**
 * The value table and the two-tone price panel.
 *
 * Asked for 16 Sep 2026 as templates of two live sections, "with all edge
 * cases for editing". What has to hold: a table or card saved before these
 * controls existed draws the markup it always did; every new figure reaches
 * the page and is per device; the panel's money is the offer's own; and the
 * two templates carry their references.
 */
const paper = bandTheme("paper");
const render = (b: Block, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<Blocks blocks={[b]} theme={paper} {...extra} />);
const make = (type: "pricing" | "pricecard", props: Record<string, unknown>): Block => {
  const b = newBlock(type);
  return { ...b, props: { ...b.props, ...props } };
};

describe("the price table", () => {
  const rows = [{ label: "A", amount: "$1", note: "" }, { label: "B", amount: "$2", note: "" }];
  it("draws nothing new until something is set", () => {
    const out = render(make("pricing", { items: rows }));
    expect(out).not.toContain("--pt-");
    expect(out).not.toContain("var(");
    expect(out).toMatch(/px-4 py-3/);
  });
  it("adds a header row and its own rules, amounts and total once asked", () => {
    const out = render(
      make("pricing", {
        items: rows,
        headLabel: "What you get",
        headAmount: "Value",
        headAmountColor: "#c8653d",
        amountColor: "#c8653d",
        ruleColor: "#000000",
        rowPadY: 20,
        rowPadX: 0,
        totalLabel: "TOTAL",
        totalAmount: "$3",
        totalRuleWidth: 1,
        totalColor: "#c8653d",
      }),
    );
    expect(out).toContain("What you get");
    expect(out).toContain("--pt-pad-y:20px;--pt-pad-x:0px");
    expect(out).toContain("padding:var(--pt-pad-y, 12px) var(--pt-pad-x, 16px)");
    // The first line wears a rule because a header sits above it.
    // Two lines plus the total row, all on the one rule colour.
    expect(out.split("border-top:1px solid #000000").length - 1).toBe(3);
    expect(out).toContain("border-top:1px solid #000000;color");
    expect(out).toMatch(/ml-auto font-display font-bold" style="color:#c8653d"/);
  });
  it("hands a phone's sizes to the stylesheet", () => {
    const out = render(setPropsAt(make("pricing", { items: rows, labelSize: 18 }), "mobile", { labelSize: 15 }));
    expect(out).toContain("font-size:var(--pt-label)");
    expect(out).toMatch(/@media \(max-width:767px\)\{[^}]*--pt-label:15px\}\}/);
  });
});

describe("the price panel", () => {
  const card = (props: Record<string, unknown> = {}) =>
    make("pricecard", {
      skin: "panel",
      badge: "Best Value",
      badgePlace: "top",
      badgeUpper: true,
      title: "Join the thing",
      compareLabel: "Regular Price",
      priceLabel: "Early Access Price",
      period: "One payment",
      altPrefix: "Or",
      ctaLabel: "Join",
      note: "Tools needed",
      footerColor: "#95497a",
      cardColor: "#832a62",
      cardRadius: 30,
      buttonColor: "#c8653c",
      buttonRadius: 40,
      ...props,
    });
  const money = { priceLabel: "$497", compareAtLabel: "$997", planLabel: "3 monthly payments of $199" };

  it("leaves the classic card exactly as it was", () => {
    const before = render(make("pricecard", { price: "$29", ctaLabel: "Start" }));
    expect(before).toContain("1.9rem 1.6rem");
    expect(before).not.toContain("data-pc-cta");
  });
  it("quotes the offer's own money: the price, the struck regular price and the plan", () => {
    const out = render(card(), { money });
    expect(out).toContain("$497");
    expect(out).toMatch(/<s[^>]*>\$997<\/s>/);
    expect(out).toContain("Or 3 monthly payments of $199");
    expect(out).toContain("One payment");
    expect(out).toContain("text-transform:uppercase");
    expect(out).toContain("-translate-y-1/2");
    // The footer runs to the card's edges and takes the card's own corner.
    expect(out).toContain("background:#95497a;margin:20px -26px 0 -26px");
    expect(out).toContain("border-radius:0 0 var(--pc-radius) var(--pc-radius)");
    // The button is reached from the stylesheet, not restyled inline.
    expect(out).toMatch(/\[data-pc-cta\] a,[^{]*\[data-pc-cta\] > span\{background:#c8653c;border-radius:var\(--pc-btn-radius\)\}/);
  });
  it("hides the struck price when the offer has no compare-at, and a typed one still wins", () => {
    expect(render(card(), { money: { priceLabel: "$497" } })).not.toContain("Regular Price");
    expect(render(card({ comparePrice: "$1,000" }), { money: { priceLabel: "$497" } })).toContain("$1,000");
  });
  it("says nothing about a plan the offer does not have", () => {
    expect(render(card(), { money: { priceLabel: "$497" } })).not.toContain("Or ");
  });
});

describe("planMoney", () => {
  it("words the plan from the offer's real instalments", () => {
    const plan = { ...newOfferPrice("p2"), billingType: "recurring" as const, interval: "month" as const, installments: 3, priceCents: 19900 };
    expect(planMoney({ compareAtCents: 99700, currency: "usd", prices: [newOfferPrice("p1"), plan] })).toEqual({
      compareAtLabel: "$997",
      planLabel: "3 monthly payments of $199",
    });
    expect(planMoney({ compareAtCents: null, currency: "usd", prices: [] })).toEqual({ compareAtLabel: null, planLabel: null });
  });
});

describe("the two templates", () => {
  it("carry the references and leave the card's money to the offer", () => {
    const table = valueTable.blocks[0];
    expect(table.props.headLabel).toBe("What you get");
    expect(table.props.totalAmount).toBe("$5,774");
    expect(render(table)).toContain("30 days of Content Engine");
    const row = investment.blocks[0];
    const cardBlock = row.columns![1][0];
    expect(cardBlock.props.price).toBe("");
    expect(cardBlock.props.comparePrice).toBe("");
    expect(cardBlock.props.altPrice).toBe("");
    const out = renderToStaticMarkup(<Blocks blocks={investment.blocks} theme={paper} money={money0} />);
    expect(out).toContain("One Investment. Everything included.");
    expect(out).toContain("BEST VALUE".toLowerCase() === "best value" ? "Best Value" : "");
    expect(out).toContain("$497");
  });
});
const money0 = { priceLabel: "$497", compareAtLabel: "$997", planLabel: "3 monthly payments of $199" };
