import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim } from "@/lib/blocks";

// The sign-up box: a white card with a thin plum outline and the same hard
// plum edge under it the chat bubbles use, a two-line navy promise, one line
// of instruction, and a terracotta button.
//
// The lilac highlight behind the first sentence is a `<mark>` in the copy
// rather than a second block. It has to be inline — it runs to the middle of a
// wrapping line — and a heading is plain text, so the promise is a TEXT block
// carrying its own markup instead.
//
// Like the photographic hero, this card ends in a button rather than an email
// field: forms are stripped on save, because this page also carries the
// payment form. The button goes wherever the real opt-in lives.
export const template: Template = {
  id: "signup-box",
  name: "Sign-up box",
  group: "Callouts",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 720 } },
  blocks: [
    {
      ...rowOf(
        [
          [
            {
              ...make(
                "text",
                {
                  // The highlight carries its own colour. `<mark>` survives the
                  // sanitizer but nothing styles it, so left bare it renders
                  // the browser's yellow — which is not this design. An inline
                  // `background-color` is on the sanitizer's allowlist, so the
                  // colour travels with the copy.
                  html: '<p><mark style="background-color:#dfc5d6;color:#11325b">3 days. 15 minutes a day.</mark> A working AI system you built yourself, in your own voice.</p>',
                },
                {
                  color: "#11325b",
                  size: 24,
                  weight: 700,
                  lineHeight: 1.32,
                  textAlign: "center",
                  blockAlign: "center",
                  width: "auto",
                  maxWidthValue: null,
                  margin: { t: 0, r: 0, b: 12, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({ mobile: { style: { size: 19 } } }),
            },
            make(
              "text",
              { html: "<p>Sign up below and access Day 1 instantly.</p>" },
              {
                color: "#3d3d3d",
                size: 15,
                lineHeight: 1.5,
                textAlign: "center",
                blockAlign: "center",
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 20, l: 0, u: "px", link: false },
              },
            ),
            make(
              "button",
              { text: "Get Free Instant Access", link: "#", variant: "solid", action: "link" },
              {
                background: fill("#c8663e"),
                color: "#ffffff",
                radius: 999,
                blockAlign: "center",
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
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
          radius: 14,
          borderWidth: 1,
          borderColor: "#b98aa8",
          // Blur zero — the hard second edge, the same shape as the chat
          // bubbles. A soft shadow here reads as a lift; this reads as a card
          // with something behind it.
          shadowY: 5,
          shadowBlur: 0,
          shadowColor: "#832a63",
          padding: { t: 34, r: 40, b: 34, l: 40, u: "px", link: false },
          responsive: at({
            mobile: { style: { padding: { t: 26, r: 20, b: 26, l: 20, u: "px", link: false } } },
          }),
        }),
      ],
    },
  ],
};
