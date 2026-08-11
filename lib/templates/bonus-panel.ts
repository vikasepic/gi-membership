import { at, col, fill, make, rowOf, type Template } from "./template";

// The bonus panel: a plum block, the offer on the left, four lilac rows on the
// right, each with a mark.
//
// The plum is the BAND rather than a block background, so the panel runs to
// whatever measure the section is set to and the ink comes with it — the plum
// preset already carries a pale text colour, which is why nothing here names
// one for the left-hand copy.
//
// The right-hand rows are a cards block at one column with the tinted skin
// given an explicit lilac; icon beside, because each row is one line of copy
// and a mark above it would double the panel's height.
export const template: Template = {
  id: "bonus-panel",
  name: "Bonus — offer and inclusions",
  group: "Callouts",
  band: {
    style: "plum",
    layout: { width: "boxed", maxWidth: 1040, pad: { t: 44, r: 44, b: 44, l: 44 } },
  },
  blocks: [
    {
      ...rowOf(
        [
          [
            make(
              "heading",
              { text: "Bonus", tag: "h2" },
              {
                color: "#ffffff",
                size: 34,
                weight: 700,
                lineHeight: 1.15,
                margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
              },
            ),
            make(
              "heading",
              {
                text: "A 90-minute Pre-Recorded Walkthrough:\nWe Build a Book Together.",
                tag: "h3",
              },
              {
                color: "#ffffff",
                size: 18,
                weight: 700,
                lineHeight: 1.4,
                margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
              },
            ),
            make(
              "text",
              {
                html: [
                  "<p>Ajit takes you through the entire Book Writer experience, question by question, answer by answer, and builds a complete book manuscript on screen as you watch.</p>",
                  "<p>You will see exactly how the conversation works, how your answers shape the writing, and how a full book comes together in a single session.</p>",
                ].join(""),
              },
              {
                color: "#f6e6f0",
                size: 15,
                lineHeight: 1.65,
                width: "auto",
                maxWidthValue: null,
                blockAlign: "left",
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            make(
              "cards",
              {
                items: [
                  {
                    title: "",
                    body: "Watch a real book get written from the very first question to the final manuscript. Nothing skipped, nothing edited out.",
                    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5Z"></path><path d="M11 4h3.5A1.5 1.5 0 0 1 16 5.5V12"></path><path d="m14 20 6-6 1.5 1.5-6 6H14Z"></path></svg>',
                    image: "",
                  },
                  {
                    title: "",
                    body: "See how to answer the prompts in a way that produces writing that sounds like you, not like every other business book on the shelf.",
                    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="m7 9 3 3-3 3M13 15h4"></path></svg>',
                    image: "",
                  },
                  {
                    title: "",
                    body: "Understand what to do with your manuscript once it is done. How to edit, publish, and put it to work immediately.",
                    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"></path><path d="M14 4v5h5"></path><path d="M9 16h4M9 12h6"></path></svg>',
                    image: "",
                  },
                  {
                    title: "",
                    body: "Access the recording any time, as many times as you need. It is yours forever.",
                    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="10" r="2"></circle><path d="M5 17c.7-2 2-3 3.5-3s2.8 1 3.5 3M15 9h4M15 13h4"></path></svg>',
                    image: "",
                  },
                ],
                columns: 1,
                skin: "tinted",
                media: "icon",
                iconShape: "square",
                iconPlace: "beside",
                iconBox: 26,
                iconSize: 22,
                // Transparent, because the mark sits directly on the lilac row
                // rather than in a tile of its own — a tile inside a tinted
                // card is two boxes where the design has one.
                iconBg: "transparent",
                iconColor: "#832a63",
                cardGap: 12,
                cardPadding: 16,
                cardRadius: 8,
              },
              {
                color: "#4a1236",
                size: 14,
                lineHeight: 1.5,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
        ],
        { widths: [42, 58], gap: 34, verticalAlign: "flex-start", stack: "tablet" },
      ),
      columnStyles: [col(), col()],
    },
  ],
};
