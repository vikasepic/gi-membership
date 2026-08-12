import { fill, make, type Template } from "./template";

// The price panel: eyebrow, the recurring price, the alternative, the badge,
// the button, the small print and the security line — plus a strip of card
// marks underneath, which is a picture rather than part of the block.
//
// Almost all of it is the `pricecard` block, and — the part that matters —
// the price is left BLANK
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
        // NOT "{trial}". The token is substituted in the small print and
        // nowhere else, so a button written with it prints the six characters
        // at a buyer. Verified in the preview — it read "Start {trial} free
        // trial". A length typed here would go stale the day the trial changes
        // anyway, so the button simply does not claim one.
        ctaLabel: "Start free trial",
        action: "buy",
        note: "Then 3 funnels every month. Cancel anytime.",
        secureNote: "For your security, all orders are processed on a secure server.",
      },
      {
        // The card's own colour. Unset it takes the band's panel — a cream
        // barely off the ground it stands on — and this design is plum. The
        // ink is chosen against whatever this is set to.
        background: fill("#832a63"),
        // The wrapper paints too once it has a colour, so it needs the card's own corner or a square shows behind the rounded box.
        radius: 20,
        margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
      },
    ),
    // The card marks do NOT come with the price card — it draws the price, the
    // button, the small print and the security line, and nothing else. They are
    // a picture, and a deliberately generic one: a template lands on stores
    // whose accepted schemes nobody here knows, so it must not assert them.
    make(
      "image",
      {
        url: "/templates/sections/payment-marks.svg",
        alt: "Accepted payment methods",
        ratio: "auto",
        maxWidth: 100,
      },
      {
        width: "custom",
        maxWidthValue: 300,
        maxWidthUnit: "px",
        blockAlign: "center",
        margin: { t: 16, r: 0, b: 0, l: 0, u: "px", link: false },
      },
    ),
  ],
};
