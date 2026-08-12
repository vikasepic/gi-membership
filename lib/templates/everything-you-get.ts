import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim } from "@/lib/blocks";

// "Here is Everything You Get When You Join Today" — one white card holding the
// whole close: the full list of what is included on the left, and the offer
// with its price on the right.
//
// Three boxes deep, and each is a thing that already exists: the outer card is
// the ROW's own style, the inner offer card is the right COLUMN's, and the
// price panel inside that is the `pricecard` block. Nothing is nested past the
// one level this tree allows.
//
// The price under "Yours at" is the offer's own, not typed. The struck-through
// figure above it is a comparison and may be typed, because nothing charges it.
// Same division as the standalone offer card, for the same reason.
export const template: Template = {
  id: "everything-you-get",
  name: "Everything you get — list and offer",
  group: "Pricing",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 1160 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "Here is Everything You Get When You Join Today", tag: "h2" },
        {
          color: "#11325b",
          size: 32,
          weight: 700,
          lineHeight: 1.25,
          textAlign: "center",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 26, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ tablet: { style: { size: 27 } }, mobile: { style: { size: 22 } } }),
    },
    {
      ...rowOf(
        [
          [
            make(
              "text",
              { html: "<p><strong>When you say yes, you get:</strong></p>" },
              {
                color: "#1f1f1f",
                blockAlign: "left",
                size: 16,
                lineHeight: 1.5,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
              },
            ),
            make(
              "iconlist",
              {
                items: [
                  {
                    text: "A <strong>complete model for taking a service-based business from losing money to making money</strong>, to growing money toward its first million.",
                  },
                  {
                    text: "<strong>8 hours of pre-recorded, structured training</strong> that shows you how to choose your market, define your person, design products, and price based on pain and gain.",
                  },
                  {
                    text: "The <strong>A.R.M marketing framework</strong>, with four simple monetization paths for mid and high-tier offers.",
                  },
                  {
                    text: "<strong>4 recorded Q&amp;A calls</strong> where founders brought their real business challenges and left with solutions on the spot.",
                  },
                ],
                layout: "stacked",
                iconSize: 16,
                gap: 16,
                iconColor: "#832a63",
              },
              {
                color: "#2f2f2f",
                size: 15,
                lineHeight: 1.6,
                margin: { t: 0, r: 0, b: 20, l: 0, u: "px", link: false },
              },
            ),
            make(
              "text",
              { html: "<p><strong>Plus, you get all of these bonuses:</strong></p>" },
              {
                color: "#1f1f1f",
                blockAlign: "left",
                size: 16,
                lineHeight: 1.5,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
              },
            ),
            make(
              "iconlist",
              {
                items: [
                  {
                    text: "Templates for <strong>webinars, one-on-one sales calls, proposals, and offer documents.</strong>",
                  },
                  {
                    text: "<strong>Social media campaign structures</strong> for the platforms you actually post on.",
                  },
                  { text: "<strong>Newsletter models</strong> that fit a service-based brand." },
                  {
                    text: "Product templates for <strong>one-on-one, group, workshop, and online offers.</strong>",
                  },
                  {
                    text: "<strong>Pricing models to help you price yourself at different stages</strong> and in different ways.",
                  },
                  { text: "<strong>Tools</strong> to help you draft your key messages and copy faster." },
                ],
                layout: "stacked",
                iconSize: 16,
                gap: 16,
                iconColor: "#832a63",
              },
              {
                color: "#2f2f2f",
                size: 15,
                lineHeight: 1.6,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            make(
              "heading",
              { text: "Scale to a Million", tag: "h3" },
              {
                color: "#11325b",
                size: 27,
                weight: 700,
                lineHeight: 1.2,
                textAlign: "center",
                blockAlign: "center",
                margin: { t: 0, r: 0, b: 16, l: 0, u: "px", link: false },
              },
            ),
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
                margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
              },
            ),
            make(
              "text",
              { html: "<p><s>$3000</s></p>" },
              {
                color: "#c8663e",
                size: 30,
                weight: 700,
                lineHeight: 1.1,
                textAlign: "center",
                blockAlign: "center",
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 2, l: 0, u: "px", link: false },
              },
            ),
            make(
              "pricecard",
              {
                eyebrow: "Yours at",
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
                maxWidthValue: 260,
                maxWidthUnit: "px",
                blockAlign: "center",
                margin: { t: 10, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
        ],
        { widths: [58, 42], gap: 40, verticalAlign: "flex-start", stack: "tablet" },
      ),
      // The outer card. A row block has a background, a corner and its own
      // padding, which is exactly a card with two halves in it.
      style: baseStyle({
        background: fill("#ffffff"),
        radius: 20,
        padding: dim(40, 44, 40, 44),
        margin: dim(0, 0, 0, 0),
      }),
      columnStyles: [
        col(),
        // The inner card: outlined rather than filled, because a white panel on
        // a white card is invisible.
        col({
          borderWidth: 1,
          borderColor: "#e2e2e2",
          radius: 16,
          padding: { t: 26, r: 24, b: 26, l: 24, u: "px", link: false },
          responsive: at({
            mobile: { style: { padding: { t: 20, r: 16, b: 20, l: 16, u: "px", link: false } } },
          }),
        }),
      ],
    },
  ],
};
