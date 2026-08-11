import { make, rowOf, type Template } from "./template";

// "I've built funnels for 12 years. These funnels generated Millions." —
// the navy band with the partner marks in a panel.
//
// Band: Navy, unpainted. This is the one design of the six whose ground is a
// preset exactly: the reference's #11325b IS BAND_STYLES.navy, to the digit,
// and the ink and the accent come with it. So the template names the preset
// and paints nothing.
//
// The panel of logos is a cards block wearing its own background: a caption
// and a row of marks inside one box is a container inside a container, and
// this tree nests one level. Rather than fake it with two blocks that look
// joined, the cards grid learned to draw its own title — one line in
// components/page/blocks.tsx, and the panel became a block.
//
// The marks are cut from the reference and keyed off the panel navy, so they
// sit on any ground rather than only on this one. They are screenshot pixels
// until the real files arrive; nothing about the template changes when they do.
export const template: Template = {
  id: "author-funnels",
  name: "Author — built funnels",
  group: "Author",
  band: { style: "navy", layout: { width: "boxed" } },
  blocks: [
    rowOf(
      [
        [
          {
            ...make(
              "heading",
              {
                // The italic lines are the design's, and the break after each
                // is too — headings render `white-space: pre-line`, so the
                // newlines here are the ones on screen.
                text: "I've built funnels\n<em>for 12 years.</em>\nThese funnels generated\n<em>Millions.</em>",
                tag: "h2",
              },
              {
                size: 38,
                lineHeight: 1.18,
                weight: 700,
                margin: { t: 0, r: 0, b: 26, l: 0, u: "px", link: false },
              },
            ),
            responsive: {
              tablet: { style: { size: 32 }, props: {} },
              mobile: { style: { size: 27 }, props: {} },
            },
          },
          make(
            "text",
            {
              html: [
                "<p>I built the one behind Mindvalley. Then I built the one behind Evercoach.</p>",
                "<p>Since then, I’ve built funnels for coaches and consulting companies that have generated over $80 million in funnel sales combined.</p>",
                "<p>I didn’t learn this from a course. I built it because a bad funnel cost real money, over and over, until I fixed the process for good.</p>",
                "<p>This tool runs that same process. Now it builds it for you.</p>",
              ].join(""),
            },
            {
              width: "auto",
              maxWidthValue: null,
              blockAlign: "left",
              size: 16,
              lineHeight: 1.6,
              margin: { t: 0, r: 0, b: 26, l: 0, u: "px", link: false },
            },
          ),
          make(
            "cards",
            {
              caption: "<em>Companies I have built for, or with:</em>",
              items: [
                { title: "", body: "", icon: "", image: "/templates/author/logos/satori.png" },
                { title: "", body: "", icon: "", image: "/templates/author/logos/mindvalley.png" },
                { title: "", body: "", icon: "", image: "/templates/author/logos/eden.png" },
                { title: "", body: "", icon: "", image: "/templates/author/logos/evercoach.png" },
                { title: "", body: "", icon: "", image: "/templates/author/logos/slb.png" },
                { title: "", body: "", icon: "", image: "/templates/author/logos/lenka.png" },
              ],
              columns: 6,
              numbered: false,
              // Flat: the marks are the content, and a box around each one
              // turns a row of logos into a row of cards.
              skin: "flat",
              media: "image",
              iconShape: "square",
              iconBox: 64,
              cardPadding: 0,
              cardGap: 18,
              divider: false,
            },
            {
              // The panel itself — the block's own background, which is what
              // saves this from needing a container inside a container.
              background: {
                type: "classic",
                color: "#0f2b4e",
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
              radius: 16,
              padding: { t: 20, r: 22, b: 20, l: 22, u: "px", link: false },
              margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
            },
          ),
        ],
        [
          make(
            "image",
            {
              url: "/templates/author/audience.png",
              alt: "Ajit Nawalkha on stage with an audience",
              ratio: "auto",
              maxWidth: 100,
            },
            { radius: 20, margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
          ),
        ],
      ],
      { widths: [52, 48], gap: 36, verticalAlign: "center", stack: "tablet" },
    ),
  ],
};
