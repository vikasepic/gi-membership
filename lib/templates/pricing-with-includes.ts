import { at, col, make, rowOf, type Template } from "./template";
import { baseStyle, dim } from "@/lib/blocks";

// The full price section: what you get on the left, the price panel on the
// right.
//
// The panel is the same `pricecard` the standalone price template uses, with
// its price left blank so it shows the offer's real figure. Putting the
// includes beside it rather than inside it is the whole point of this layout —
// the list can run to five or nine lines without making the card taller than
// the fold.
//
// The card sits second in the source and therefore first on a phone, because
// the row stacks in order. That is deliberate: on a phone the price is what
// someone scrolled down for, and a nine-line list above it is nine lines
// between them and the button.
export const template: Template = {
  id: "pricing-with-includes",
  name: "Pricing — includes and panel",
  group: "Pricing",
  band: {
    style: "paper",
    color: "#f2e8e3",
    layout: { width: "boxed", maxWidth: 1100, pad: { t: 56, r: null, b: 56, l: null } },
  },
  blocks: [
    {
      ...rowOf(
        [
          [
            {
              ...make(
                "heading",
                { text: "Write up to 3 Funnels\nEvery Month", tag: "h2" },
                {
                  color: "#1f1f1f",
                  size: 40,
                  weight: 700,
                  lineHeight: 1.15,
                  margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({
                tablet: { style: { size: 32 } },
                mobile: { style: { size: 26 } },
              }),
            },
            make(
              "text",
              { html: "<p>Everything you can do with <em>micro-offer funnel writer</em></p>" },
              {
                color: "#3d3d3d",
                blockAlign: "left",
                size: 16,
                lineHeight: 1.5,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 22, l: 0, u: "px", link: false },
              },
            ),
            make(
              "iconlist",
              {
                items: [
                  { text: "3 complete funnels every month" },
                  { text: "Unlimited edits and regenerations per piece" },
                  { text: ".docx export on every funnel" },
                  { text: "Voice-matched copy from your samples" },
                  { text: "A market check before every build" },
                ],
                layout: "stacked",
                iconSize: 16,
                gap: 14,
                iconColor: "#c8663e",
              },
              {
                color: "#2f2f2f",
                size: 16,
                lineHeight: 1.5,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            make(
              "pricecard",
              {
                eyebrow: "After trial",
                // Blank, so it shows what the offer actually charges. The
                // reference's figures belong to that store, not to this design.
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
        ],
        { widths: [56, 44], gap: 48, verticalAlign: "center", stack: "tablet" },
      ),
      style: baseStyle({ margin: dim(0, 0, 0, 0) }),
      columnStyles: [col(), col()],
    },
  ],
};
