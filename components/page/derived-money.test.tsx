import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks, type BlockMoney } from "@/components/page/blocks";
import { newBlock, type Block } from "@/lib/blocks";
import { bandTheme } from "@/lib/page-sections";

// What a price card says has to follow the offer, or the page goes stale the
// day somebody changes a price and nobody remembers the copy repeats it.

const paper = bandTheme("paper");
const card = (props: Record<string, unknown>): Block => {
  const b = newBlock("pricecard");
  return { ...b, props: { ...b.props, ctaLabel: "Buy", ...props } };
};
const render = (b: Block, money?: BlockMoney) =>
  renderToStaticMarkup(<Blocks blocks={[b]} theme={paper} money={money} />);

const REAL: BlockMoney = {
  priceLabel: "$29",
  termsLabel: "/month",
  altPriceLabel: "$199",
  altTermsLabel: "/year",
  trialLabel: "7 days",
};

describe("the price", () => {
  it("comes from the offer when the field is empty", () => {
    expect(render(card({ price: "" }), REAL)).toContain("$29");
  });

  it("is whatever was typed, when something was", () => {
    // Still possible — some pages need "from £X" or a currency the store does
    // not sell in. It is the SAVE that refuses a figure which contradicts.
    expect(render(card({ price: "from $29" }), REAL)).toContain("from $29");
  });
});

describe("the second price", () => {
  it("comes from the placement when the field is empty", () => {
    const out = render(card({ price: "", altPrice: "" }), REAL);
    expect(out).toContain("$199");
    expect(out).toContain("/year");
  });

  it("is absent when the placement offers only one price", () => {
    const out = render(card({ price: "", altPrice: "" }), { priceLabel: "$29" });
    expect(out).not.toContain("$199");
  });

  it("is still overridable by hand", () => {
    expect(render(card({ price: "", altPrice: "$149" }), REAL)).toContain("$149");
  });
});

describe("the {trial} token", () => {
  it("becomes the offer's real trial length", () => {
    const out = render(card({ price: "", note: "{trial} free, cancel any time" }), REAL);
    expect(out).toContain("7 days free, cancel any time");
    expect(out).not.toContain("{trial}");
  });

  it("follows the offer rather than the copy", () => {
    const out = render(card({ price: "", note: "{trial} free" }), { ...REAL, trialLabel: "14 days" });
    expect(out).toContain("14 days free");
  });

  it("disappears on an offer with no trial, rather than printing itself", () => {
    // "{trial} free" shown to a buyer is worse than saying nothing.
    const out = render(card({ price: "", note: "{trial} free" }), { ...REAL, trialLabel: null });
    expect(out).not.toContain("{trial}");
    expect(out).toContain("free");
  });

  it("leaves copy without the token alone", () => {
    const out = render(card({ price: "", note: "Cancel any time" }), REAL);
    expect(out).toContain("Cancel any time");
  });
});
