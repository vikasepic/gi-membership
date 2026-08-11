import { col, make, rowOf, type Template } from "./template";

// "One Decision That Can Change How You Build Your Business for the Next
// Decade." — the lilac band with the photograph overhanging it.
//
// Band: Paper painted #dfc5d6, boxed, 56px of air top and bottom.
//
// The photograph deliberately stands PROUD of the band, top and bottom, which
// is the whole character of this design: the lilac is a stripe the picture is
// laid across rather than a box it sits inside. That needs the picture to
// leave its section, and a negative margin is the only thing that says so —
// there is no "overhang" control and inventing one would be a worse answer
// than -112px with a sentence next to it.
//
// This is NOT the case Author 1 had. There the negative margin was faking the
// section's own padding, which is a setting and now behaves as one. Here the
// margin is the design.
//
// Measured off the reference: content 2249px wide, of which the words are
// 49.9% and the picture 47.1% with 3% between; the band is 1062 tall and the
// photograph 1296, so it stands ~117px proud at each end — 54 at this measure,
// on top of the 56 of band padding it also has to clear.
export const template: Template = {
  id: "author-one-decision",
  name: "Author — one decision",
  group: "Author",
  band: {
    style: "paper",
    color: "#dfc5d6",
    layout: { width: "boxed", pad: { t: 0, r: null, b: 0, l: null }, padUnit: "px" },
  },
  blocks: [
    {
      ...rowOf(
        [
          [
            {
              ...make(
                "heading",
                {
                  text: "One Decision That Can Change How You Build Your Business for the Next Decade.",
                  tag: "h2",
                },
                {
                  color: "#11325b",
                  size: 30,
                  lineHeight: 1.25,
                  weight: 700,
                  margin: { t: 0, r: 0, b: 22, l: 0, u: "px", link: false },
                },
              ),
              responsive: {
                tablet: { style: { size: 26 }, props: {} },
                mobile: { style: { size: 23 }, props: {} },
              },
            },
            make(
              "text",
              { html: "<p>Your investment to join this round of Scale to a Million is:</p>" },
              {
                width: "auto",
                maxWidthValue: null,
                blockAlign: "left",
                color: "#1f1f1f",
                size: 16,
                lineHeight: 1.55,
                margin: { t: 0, r: 0, b: 12, l: 0, u: "px", link: false },
              },
            ),
            // The one figure that is NOT verbatim.
            //
            // Everything else on this band is Ajit's own copy and his own true
            // numbers. A price is different: this template can be dropped on
            // any page, and a hardcoded $499 there is a figure the checkout
            // will not charge — which is the one thing this store already
            // refuses elsewhere (see lib/page-price-truth.ts). $000 is
            // unmistakably unfinished, so it gets replaced rather than shipped.
            make(
              "text",
              { html: "<p><s>$000</s> <strong>$000</strong></p>" },
              {
                width: "auto",
                maxWidthValue: null,
                blockAlign: "left",
                color: "#832a63",
                size: 30,
                weight: 700,
                lineHeight: 1.2,
                margin: { t: 0, r: 0, b: 20, l: 0, u: "px", link: false },
              },
            ),
            make(
              "text",
              { html: "<p><strong>You get:</strong></p>" },
              {
                width: "auto",
                maxWidthValue: null,
                blockAlign: "left",
                color: "#1f1f1f",
                size: 16,
                lineHeight: 1.55,
                margin: { t: 0, r: 0, b: 10, l: 0, u: "px", link: false },
              },
            ),
            make(
              "iconlist",
              {
                items: [
                  { text: "<strong>8 hours of pre-recorded, structured training.</strong>" },
                  { text: "All the <strong>templates and custom AI Tools</strong> listed above." },
                ],
                layout: "stacked",
                gap: 14,
                iconColor: "#832a63",
              },
              { margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false } },
            ),
            make(
              "text",
              {
                html: "<p>You get everything you need to understand the model, apply it and keep using it as your business grows.</p>",
              },
              {
                width: "auto",
                maxWidthValue: null,
                blockAlign: "left",
                color: "#1f1f1f",
                size: 16,
                lineHeight: 1.55,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            {
              ...make(
                "image",
                {
                  url: "/templates/author/woa-orange.png",
                  alt: "Ajit Nawalkha speaking",
                  ratio: "auto",
                  maxWidth: 100,
                },
                {
                  radius: 24,
                  // Proud of the band at both ends. 56 clears the band's own
                  // padding; the rest is the overhang itself.
                  margin: { t: -56, r: 0, b: -56, l: 0, u: "px", link: false },
                },
              ),
              // Stacked, there is no band edge to stand proud of — the picture
              // is simply above the words, and an overhang would drag it onto
              // whatever section sits above this one.
              responsive: {
                tablet: {
                  style: { margin: { t: 0, r: 0, b: 24, l: 0, u: "px", link: false } },
                  props: {},
                },
                mobile: {
                  style: { margin: { t: 0, r: 0, b: 20, l: 0, u: "px", link: false } },
                  props: {},
                },
              },
            },
          ],
        ],
        { widths: [50, 50], gap: 32, verticalAlign: "center", stack: "tablet" },
      ),
      // No align-self on the picture's column. Centring it makes the column
      // shrink to its content and centre THAT, which quietly absorbs the
      // negative margins — the photograph then sits flush with the band it is
      // supposed to stand proud of.
      columnStyles: [
        // The words carry the air the band gave up, so the picture can take its
        // overhang from a band with no padding to fight.
        col({ padding: { t: 40, r: 0, b: 40, l: 0, u: "px", link: false } }),
        null,
      ],
    },
  ],
};
