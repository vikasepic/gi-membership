import { col, make, rowOf, type Template } from "./template";

// "About the Author, Ajit Nawalkha" — the white card lying across the photo.
//
// Band: Paper, with the section background set to #f6f6f6.
//
// The card is the COLUMN, not a block: a white box holding a heading, three
// paragraphs and a button is a container inside a container, and this builder
// nests exactly one level. A column carries a background, a corner and a
// padding, which is the whole of what the card is.
//
// The overlap runs the other way round from how it looks. `columnCss` emits a
// column's background, padding and radius and nothing else — no margin — so
// the card cannot be pulled left over the photograph. Instead the photograph
// is pushed right, under the card, by -44px of its own margin, and the card's
// background paints over it because a later sibling paints later. The result
// on screen is the design; the mechanism is the reverse of it.
//
// The gradient pill is Custom CSS, and it has to be. A button's fill comes
// from `blockColors`, which reads `background.color` — one flat colour. The
// block's gradient would land on the wrapper behind the pill instead of on
// it, and `!important` is needed because the anchor carries that flat fill as
// an inline style.
export const template: Template = {
  id: "author-about",
  name: "Author — about the author",
  group: "Author",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed" } },
  blocks: [
    {
      ...rowOf(
        [
          [
            {
              ...make(
                "image",
                {
                  url: "/templates/author/stage-purple.png",
                  alt: "Ajit Nawalkha on stage",
                  ratio: "auto",
                  maxWidth: 100,
                },
                {
                  radius: 24,
                  // 4.55% of the content width, which is what the reference
                  // measures: photo 55.5%, card 49%, and the 4.55% they share.
                  margin: { t: 0, r: -47, b: 0, l: 0, u: "px", link: false },
                },
              ),
              // Stacked, an overlap is just a photograph with a bite taken out
              // of its right edge.
              responsive: {
                tablet: {
                  style: { margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
                  props: {},
                },
                mobile: {
                  style: { margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
                  props: {},
                },
              },
            },
          ],
          [
            make(
              "heading",
              // The break is the design's, not a wrap: "About the Author," sits
              // on its own line however wide the card is. Headings render with
              // `white-space: pre-line`, so a newline here is a line break.
              { text: "About the Author,\nAjit Nawalkha", tag: "h2" },
              {
                color: "#000000",
                size: 30,
                lineHeight: 1.25,
                weight: 700,
                margin: { t: 0, r: 0, b: 20, l: 0, u: "px", link: false },
              },
            ),
            make(
              "text",
              {
                html: [
                  "<p>Ajit Nawalkha is a globally recognized coach and co-founder of Mindvalley Coach. Over the past two decades, he has trained more than 15,000 coaches, guided hundreds of founders and leaders, and helped thousands redesign their success with heart and clarity.</p>",
                  "<p>Ajit’s work is rooted in emotional intelligence and strategic simplicity. His philosophy is simple: growth should feel like alignment, not pressure.</p>",
                  "<p>This guide reflects that belief.</p>",
                ].join(""),
              },
              {
                width: "auto",
                maxWidthValue: null,
                blockAlign: "left",
                color: "#000000",
                size: 16,
                lineHeight: 1.55,
                margin: { t: 0, r: 0, b: 26, l: 0, u: "px", link: false },
              },
            ),
            make(
              "button",
              { text: "Download Free Book Now  ⟶", link: "", action: "link", variant: "solid" },
              {
                radius: 999,
                color: "#ffffff",
                weight: 600,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
                // The gradient is the block's own background, not Custom CSS.
                // It was CSS with an `!important` on it, which meant the
                // Background control in the panel did nothing at all — the
                // inspector said one colour and the pill stayed a gradient,
                // with nothing on screen to explain the disagreement.
                background: {
                  type: "gradient",
                  color: null,
                  image: "",
                  size: "cover",
                  position: "center center",
                  repeat: "no-repeat",
                  from: "#0e9ca9",
                  fromAt: 0,
                  to: "#75d45d",
                  toAt: 100,
                  shape: "linear",
                  angle: 90,
                  overlay: 0,
                },
              },
            ),
          ],
        ],
        // No gap: the columns meet, and the overlap is carried by the
        // photograph's negative margin. A gap here would be a white channel
        // between the card and the picture it is supposed to be lying on.
        { widths: [51, 49], gap: 0, verticalAlign: "center", stack: "tablet" },
      ),
      columnStyles: [
        null,
        col({
          // The card lies ON the photograph, said out loud. It used to rest on
          // paint order alone — a later sibling paints later — which holds on
          // the page and REVERSES in the builder, where every block is wrapped
          // in positioned chrome. So the design was right for a buyer and
          // wrong for the person editing it, with no control anywhere to say
          // which was meant.
          zIndex: 1,
          background: {
            type: "classic",
            color: "#ffffff",
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
          radius: 24,
          // The card has to stay SHORTER than the photograph, or its rounded
          // corner and the photograph's meet at the bottom edge and the
          // picture pokes out as a black tail. In the reference the card is
          // 0.77 of the photo's height, centred on it — inset top and bottom
          // by the same 129px.
          padding: { t: 36, r: 36, b: 36, l: 36, u: "px", link: true },
        }),
      ],
    },
  ],
};
