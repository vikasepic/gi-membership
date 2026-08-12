import { at, fill, make, type Template } from "./template";

// "What You Walk Away With" — four numbered panels on navy, the number set
// large in terracotta before the title, the body hanging under it.
//
// That indent under the title, with the number sitting out in its own column,
// is the cards block's `inline` number style. It is not a row of two columns
// per card: it is one control, and the numbers count themselves — insert a
// card in the middle and the shelf renumbers rather than leaving two 03s.
//
// The panels take an explicit fill a shade off the band rather than the Navy
// preset's own panel colour, which is lighter than this design wants. Ink
// comes from the band, so nothing here names a text colour for the body.
export const template: Template = {
  id: "walkaway-grid",
  name: "What you walk away with — numbered",
  group: "Features",
  band: {
    style: "navy",
    layout: { width: "boxed", maxWidth: 1100, pad: { t: 56, r: null, b: 56, l: null } },
  },
  blocks: [
    {
      ...make(
        "heading",
        { text: "What You Walk Away With", tag: "h2" },
        {
          color: "#ffffff",
          size: 32,
          weight: 700,
          lineHeight: 1.25,
          textAlign: "center",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 10, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ mobile: { style: { size: 25 } } }),
    },
    make(
      "text",
      { html: "<p>By the end of 60 minutes, you will have:</p>" },
      {
        color: "#c6d3e6",
        size: 16,
        lineHeight: 1.5,
        textAlign: "center",
        blockAlign: "center",
        width: "auto",
        maxWidthValue: null,
        margin: { t: 0, r: 0, b: 28, l: 0, u: "px", link: false },
      },
    ),
    {
      ...make(
        "cards",
        {
          items: [
            {
              title: "The complete map of all 6 skills.",
              body: "Every layer explained. You will know what to build, why, and in what order before you leave.",
              icon: "",
              image: "",
            },
            {
              title: "A real-world model to follow.",
              body: "The system running the business you are being taught by, described plainly — what it does, who runs it, and what it produced.",
              icon: "",
              image: "",
            },
            {
              title: "Clarity on where you are right now.",
              body: "You will be able to identify exactly which layer your business is missing and what to do next.",
              icon: "",
              image: "",
            },
            {
              title: "The foundation logic behind stacking.",
              body: "The one mechanic that makes the whole system work. Once you see it, everything else clicks.",
              icon: "",
              image: "",
            },
          ],
          columns: 2,
          numbered: true,
          // The number out to the left of the title, body hanging under the
          // title rather than under the number. That indent is what makes the
          // figure read as a label on the card instead of part of the sentence.
          numberStyle: "inline",
          skin: "boxed",
          media: "none",
          cardPadding: 24,
          cardRadius: 12,
          cardGap: 20,
        },
        {
          // A shade off the band. The Navy preset's own panel is lighter than
          // this design, and a panel that barely differs from its ground reads
          // as a rendering fault rather than as a panel.
          background: fill("#16355f"),
          size: 15,
          margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ mobile: { props: { columns: 1 } } }),
    },
  ],
};
