import { at, fill, make, type Template } from "./template";

// "What you get / Value" — a white panel on a navy band: a header row, five
// lines each with its worth in orange on the right, and a total row in
// orange under a heavier rule. Measured off greaterinside.com's Social Media
// System page on 16 Sep 2026: panel 25px corners and 40px padding, rows 20px
// top and bottom on 1px black rules, Poppins 18 lines, Inter 30 header,
// Inter 24 / 30 total.
//
// One `pricing` block does all of it, with `highlightLast` off: the last line
// here is a line like the others, not the price being sold. The amounts are
// typed because they are claims of worth, not charges — nothing here is what
// the checkout takes.

export const template: Template = {
  id: "value-table",
  name: "Value table — what you get",
  group: "Pricing",
  band: { style: "navy", color: "#11325b", layout: { width: "boxed", maxWidth: 1100, pad: { t: 60, r: null, b: 60, l: null } } },
  blocks: [
    {
      ...make(
        "pricing",
        {
          items: [
            { label: "4 live 2-hour classes with Ajit", amount: "$4,000", note: "" },
            { label: "20 daily prompts", amount: "$500", note: "" },
            { label: "Lifetime access to all recordings", amount: "$1,000", note: "" },
            { label: "AI prompts that write in your voice", amount: "$200", note: "" },
            { label: "30 days of Content Engine, Instagram and LinkedIn", amount: "$74", note: "" },
          ],
          highlightLast: false,
          headLabel: "What you get",
          headAmount: "Value",
          headFont: "Inter",
          headSize: 30,
          headColor: "#11325b",
          headAmountColor: "#c8653d",
          rowPadY: 20,
          rowPadX: 0,
          ruleWidth: 1,
          ruleColor: "#000000",
          labelFont: "Poppins",
          labelSize: 18,
          labelWeight: "400",
          labelColor: "#000000",
          amountFont: "Poppins",
          amountSize: 18,
          amountWeight: "400",
          amountColor: "#c8653d",
          totalLabel: "TOTAL VALUE",
          totalAmount: "$5,774",
          totalFont: "Inter",
          totalLabelSize: 24,
          totalAmountSize: 30,
          totalWeight: "700",
          totalColor: "#c8653d",
          totalRuleWidth: 1,
        },
        {
          background: fill("#ffffff"),
          radius: 25,
          lineHeight: 1.6,
          padding: { t: 40, r: 40, b: 40, l: 40, u: "px", link: true },
          margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({
        mobile: {
          props: { headSize: 22, labelSize: 15, amountSize: 15, totalLabelSize: 18, totalAmountSize: 22, rowPadY: 14 },
          style: { padding: { t: 22, r: 20, b: 22, l: 20, u: "px", link: false } },
        },
      }),
    },
  ],
};
