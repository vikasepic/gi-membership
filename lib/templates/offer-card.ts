import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim } from "@/lib/blocks";

// The offer card: the product's name, a shot of what you get, what it would
// have cost struck through, then the real price and the button.
//
// The money is a `pricecard`, not typed text, and that is the whole reason
// this template is shaped the way it is. The struck-through figure above it is
// a COMPARISON — what it would otherwise cost — and an author may type that,
// because nothing charges it. The figure underneath is what the checkout will
// take, so it comes from the offer: left blank, the card shows the real price,
// and it cannot drift from what is charged.
//
// The card marks, the Stripe line and the security note all come with the
// price card. They are not decoration to be rebuilt — they are the part of a
// payment panel that has to stay true.
export const template: Template = {
  id: "offer-card",
  name: "Offer card — was and now",
  group: "Pricing",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 620 } },
  blocks: [
    {
      ...rowOf(
        [
          [
            {
              ...make(
                "heading",
                { text: "Scale to a Million", tag: "h2" },
                {
                  color: "#11325b",
                  size: 36,
                  weight: 700,
                  lineHeight: 1.2,
                  textAlign: "center",
                  blockAlign: "center",
                  margin: { t: 0, r: 0, b: 20, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({ mobile: { style: { size: 27 } } }),
            },
            make(
              "image",
              {
                url: "/templates/sections/product-devices.svg",
                alt: "What is included, shown on a laptop, a tablet and a phone",
                ratio: "auto",
                maxWidth: 100,
              },
              {
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
              },
            ),
            make(
              "text",
              { html: "<p><s>$3000</s></p>" },
              {
                // A comparison, and an author may type one: nothing charges it.
                // The figure below is a different matter — see the price card.
                color: "#c8663e",
                size: 34,
                weight: 700,
                lineHeight: 1.1,
                textAlign: "center",
                blockAlign: "center",
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 4, l: 0, u: "px", link: false },
              },
            ),
            make(
              "pricecard",
              {
                eyebrow: "Yours at",
                // Blank: the real price, from the offer.
                price: "",
                period: "",
                altPrice: "",
                altPeriod: "",
                badge: "",
                ctaLabel: "Enroll Now",
                action: "buy",
                note: "You have a 7-day guarantee, so you can look inside, test it and make sure it is right for you.",
                secureNote: "For your security, all orders are processed on a secure server",
              },
              {
                // White, so the price card's own tray disappears into the card
                // it is standing in. Unset it fills with the band's panel and
                // draws a second cream box inside a white one, which is what it
                // did until this was looked at.
                background: fill("#ffffff"),
                radius: 20,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
            // A picture, not part of the price card. Generic marks on purpose:
            // a template cannot know which schemes a store accepts.
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
                margin: { t: 10, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
        ],
        { gap: 0 },
      ),
      style: baseStyle({ margin: dim(0, 0, 0, 0) }),
      columnStyles: [
        col({
          background: fill("#ffffff"),
          radius: 20,
          padding: { t: 34, r: 34, b: 30, l: 34, u: "px", link: false },
          responsive: at({
            mobile: { style: { padding: { t: 24, r: 20, b: 22, l: 20, u: "px", link: false } } },
          }),
        }),
      ],
    },
  ],
};
