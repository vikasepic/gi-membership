import { at, col, make, rowOf, type Template } from "./template";
import { baseStyle, dim } from "@/lib/blocks";

// "One Investment. Everything included." — the close: a heading, a line and
// a checklist on the left; on the right a plum card wearing a pale "BEST
// VALUE" tab on its top edge, the regular price struck, the early-access
// price large, the terms under it, and the button on a darker footer.
// Measured off digital.greaterinside.com's Digital Product Business System
// page on 16 Sep 2026: card 371 wide with 30px corners, Inter 64 price, Inter
// 35 struck price, Poppins 18 title, Poppins 15 terms, footer #95497a with
// an orange pill button.
//
// The card is the `pricecard` block on its panel skin, and the money is left
// BLANK: the price, the struck regular price and the "or 3 monthly payments"
// line are the offer's own, so the card cannot advertise a figure the
// checkout will not charge. "One payment" IS typed — it is the wording of the
// terms, and an offer that bills monthly should change it.

const check = (text: string) => ({ text });

export const template: Template = {
  id: "investment-panel",
  name: "One investment — list and plum card",
  group: "Pricing",
  band: { style: "paper", color: "#f6f7f9", layout: { width: "boxed", maxWidth: 1180, pad: { t: 60, r: null, b: 60, l: null } } },
  blocks: [
    {
      ...rowOf(
        [
          [
            {
              ...make(
                "heading",
                { text: "One Investment. Everything included.", tag: "h2" },
                {
                  fontFamily: "Inter",
                  color: "#11325b",
                  size: 35,
                  weight: 700,
                  lineHeight: 1.2,
                  textAlign: "left",
                  blockAlign: "left",
                  margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({ mobile: { style: { size: 28 } } }),
            },
            make(
              "text",
              { html: "<p>Six weeks. One start date. Everything you need to build, launch, and run your first digital product funnel.</p>" },
              {
                fontFamily: "Poppins",
                color: "#1f1f1f",
                size: 18,
                lineHeight: 1.4,
                textAlign: "left",
                blockAlign: "left",
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 24, l: 0, u: "px", link: false },
              },
            ),
            make(
              "iconlist",
              {
                items: [
                  check("Six live implementation sessions starting August 3rd"),
                  check("Bonus 1: The Backend That Scales"),
                  check("Bonus 2: How to Launch Your First Facebook Ads"),
                  check("Bonus 3: Building Apps for Your Market as Products"),
                  check("Post-live support with pre-recorded ad trainings to run and adjust your campaigns after launch"),
                  check("Live classes happen every Monday 9am EST / 2pm London starting 3rd August for 6 weeks."),
                ],
                layout: "stacked",
                marker: "check",
                iconSize: 16,
                iconGap: 16,
                gap: 9,
                iconColor: "#832a62",
              },
              {
                fontFamily: "Poppins",
                color: "#1f1f1f",
                size: 18,
                lineHeight: 1.4,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            {
              ...make(
                "pricecard",
                {
                  skin: "panel",
                  badge: "Best Value",
                  badgePlace: "top",
                  badgeUpper: true,
                  badgeFont: "Poppins",
                  badgeSize: 18,
                  badgeWeight: "700",
                  badgeBg: "#e0c5d6",
                  badgeColor: "#1f1f1f",
                  title: "Join Digital Product Business System",
                  titleFont: "Poppins",
                  titleSize: 18,
                  titleWeight: "600",
                  titleColor: "#ffffff",
                  compareLabel: "Regular Price",
                  comparePrice: "",
                  compareLabelSize: 16,
                  compareFont: "Inter",
                  compareSize: 35,
                  compareWeight: "700",
                  compareColor: "#ffffff",
                  priceLabel: "Early Access Price",
                  labelFont: "Inter",
                  labelSize: 18,
                  labelWeight: "600",
                  labelColor: "#ffffff",
                  price: "",
                  priceFont: "Inter",
                  priceSize: 64,
                  priceWeight: "700",
                  priceColor: "#ffffff",
                  period: "One payment",
                  altPrefix: "Or",
                  altPrice: "",
                  altItalic: true,
                  termsFont: "Poppins",
                  termsSize: 15,
                  termsWeight: "400",
                  termsColor: "#f4f4f4",
                  ctaLabel: "Join The Waitlist",
                  buttonColor: "#c8653c",
                  buttonInk: "#ffffff",
                  buttonFont: "Poppins",
                  buttonSize: 18,
                  buttonWeight: "500",
                  buttonRadius: 40,
                  buttonPadX: 40,
                  buttonPadY: 15,
                  note: "Additional tools needed: Kajabi or Simplero (hosting) + Claude Pro (~$20/mo)",
                  noteFont: "Poppins",
                  noteSize: 12,
                  noteColor: "#f4f4f4",
                  cardColor: "#832a62",
                  cardRadius: 30,
                  cardPadding: { t: 45, r: 20, b: 20, l: 20, u: "px", link: false },
                  footerColor: "#95497a",
                  footerPadding: { t: 16, r: 20, b: 16, l: 20, u: "px", link: false },
                },
                {
                  // Room for the tab, which hangs half above the card.
                  margin: { t: 20, r: 0, b: 0, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({ mobile: { props: { priceSize: 48, compareSize: 28, cardPadding: { t: 40, r: 16, b: 16, l: 16, u: "px", link: false } } } }),
            },
          ],
        ],
        { widths: [58, 42], gap: 100, verticalAlign: "center", stack: "mobile" },
      ),
      style: baseStyle({ margin: dim(0, 0, 0, 0) }),
      columnStyles: [col(), col()],
      responsive: at({ tablet: { props: { gap: 40 } } }),
    },
  ],
};
