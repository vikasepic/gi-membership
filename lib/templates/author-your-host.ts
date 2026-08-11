import { make, rowOf, type Template } from "./template";

// "Your Host" — the off-white band with the two figures in a panel.
//
// Band: Paper painted #f7f7f7, boxed.
//
// The two figures are a stats block wearing the beige panel as its own
// background, each figure in its own outlined box.
//
// Two boxed figures side by side is a row of two columns, and a row inside a
// column is a container inside a container — which this tree does not do. So
// the shape belongs to the block: `stats` gained a Boxed layout, and blocks
// gained a real border for it to draw with. Not Custom CSS, which is what the
// first attempt at the gradient button used and which no control can reach.
//
// The orange is #c8663e, which is BAND_STYLES.navy's accent to the digit; the
// heading navy is #11325b. These designs were drawn from this app's own
// palette, so both are named rather than guessed.
export const template: Template = {
  id: "author-your-host",
  name: "Author — your host",
  group: "Author",
  band: { style: "paper", color: "#f7f7f7", layout: { width: "boxed" } },
  blocks: [
    rowOf(
      [
        [
          {
            ...make(
              "heading",
              { text: "Your Host", tag: "h2" },
              {
                color: "#11325b",
                size: 30,
                lineHeight: 1.25,
                weight: 700,
                margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
              },
            ),
            responsive: {
              tablet: { style: { size: 27 }, props: {} },
              mobile: { style: { size: 24 }, props: {} },
            },
          },
          make(
            "text",
            {
              html: [
                "<p><strong>I was completely broken, rushing towards being completely broken.<br />Then 3 simple plays changed everything.</strong></p>",
                "<p>My name is Ajit Nawalkha.</p>",
                "<p>I co-founded Evercoach. We trained coaches in over 100 countries and built a community of more than 500,000 people. Three Amazon bestselling books.</p>",
                "<p>While building my own company, I also helped build other businesses of a similar caliber. One went on to generate $3 million in revenue. One of my clients did $45 million.</p>",
                "<p>Each of these clients, and my own companies followed the same business philosphy I will show you in the workshop.</p>",
              ].join(""),
            },
            {
              width: "auto",
              maxWidthValue: null,
              blockAlign: "left",
              color: "#1f1f1f",
              size: 16,
              lineHeight: 1.6,
              margin: { t: 0, r: 0, b: 26, l: 0, u: "px", link: false },
            },
          ),
          make(
            "stats",
            {
              items: [
                { value: "3,400+", label: "CLIENT TESTIMONIALS", detail: "" },
                { value: "100+", label: "COUNTRIES", detail: "" },
              ],
              // Each figure in its own outlined box, as the reference draws
              // them. It was a hairline-separated strip until the block grew a
              // border and a layout to use it.
              layout: "boxed",
            },
            {
              // The panel is the block's own background — one block, so it
              // needs no container inside a container.
              background: {
                type: "classic",
                color: "#f3eae7",
                image: "",
                size: "cover",
                position: "center center",
                repeat: "no-repeat",
                from: null,
                fromAt: 0,
                to: null,
                toAt: 100,
                shape: "linear",
                angle: 135,
                overlay: 0,
              },
              radius: 14,
              padding: { t: 26, r: 28, b: 26, l: 28, u: "px", link: false },
              color: "#c8663e",
              margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
            },
          ),
        ],
        [
          make(
            "image",
            {
              url: "/templates/author/gradient-portrait.png",
              alt: "Ajit Nawalkha",
              ratio: "auto",
              maxWidth: 100,
            },
            { radius: 6, margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
          ),
        ],
      ],
      { widths: [50, 50], gap: 36, verticalAlign: "center", stack: "tablet" },
    ),
  ],
};
