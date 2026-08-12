import { make, type Template } from "./template";

// The price panel: eyebrow, the recurring price, the alternative, the badge,
// the button, the small print, the card marks and the security line.
//
// This is the `pricecard` block and nothing else. Every part of that design is
// already a field on it, and — the part that matters — the price is left BLANK
// so it shows the offer's real figure. A typed price is a claim; the offer's
// price is a fact, and a page that states a number the checkout will not
// charge is the one bug on a sales page nobody forgives.
//
// So the template fills in the words and leaves the money to the offer. The
// "$29" and "$199" in the reference are that store's real prices, not this
// design's, and typing them here would outlive the price they were copied from.
export const template: Template = {
  id: "pricing-panel",
  name: "Price panel",
  group: "Pricing",
  band: {
    style: "paper",
    color: "#f2e8e3",
    layout: { width: "boxed", maxWidth: 460, pad: { t: 40, r: null, b: 40, l: null } },
  },
  blocks: [
    make(
      "pricecard",
      {
        eyebrow: "After trial",
        // Blank on purpose. See above — these two take the offer's own price
        // and its own second billing option.
        price: "",
        period: "",
        altPrice: "",
        altPeriod: "",
        badge: "40% off",
        ctaLabel: "Start {trial} free trial",
        action: "buy",
        note: "{trial} free, then 3 funnels every month. Cancel anytime.",
        secureNote: "For your security, all orders are processed on a secure server.",
      },
      { margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
    ),
  ],
};
