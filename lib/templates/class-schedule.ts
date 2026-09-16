import { at, make, type Template } from "./template";

// "What Happens in Each of the Four Live Classes." — a heading and a line,
// then four dated entries down a black rail with an orange dot on each, the
// class number large and orange beside it. Measured off greaterinside.com's
// Social Media System page on 16 Sep 2026: rail 110px in, 15px dot, Inter 50
// italic numeral, Poppins 16 bold date, Inter 20 italic title, 85px rule,
// Poppins 16 italic copy at 1.8. The phone widths are the page's own media
// rules: rail 60, 12px dot, 32px numeral.
//
// Dates are the reference's. They are the one thing on this design that goes
// stale, and the block's own starter says "Day, Month 0" for that reason; a
// template is the design as it was, and these are what it said.

const entry = (number: string, date: string, title: string, text: string) => ({
  label: "Class",
  number,
  date,
  title,
  text,
});

export const template: Template = {
  id: "class-schedule",
  name: "Class schedule — dated rail",
  group: "Curriculum",
  band: { style: "paper", color: "#ffffff", layout: { width: "boxed", maxWidth: 900 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "What Happens in Each of the <em>Four Live Classes.</em>", tag: "h2" },
        {
          fontFamily: "Inter",
          color: "#000000",
          size: 50,
          weight: 700,
          lineHeight: 1.3,
          textAlign: "left",
          blockAlign: "left",
          margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ tablet: { style: { size: 38 } }, mobile: { style: { size: 32 } } }),
    },
    make(
      "text",
      { html: "<p>Four live sessions with me. Two hours each. Every Monday.</p>" },
      {
        fontFamily: "Poppins",
        color: "#000000",
        size: 18,
        lineHeight: 1.6,
        textAlign: "left",
        blockAlign: "left",
        width: "auto",
        maxWidthValue: null,
        margin: { t: 0, r: 0, b: 40, l: 0, u: "px", link: false },
      },
    ),
    {
      ...make(
        "timeline",
        {
          items: [
            entry(
              "01",
              "Monday, September 21",
              "Finding your message across TAP.",
              "We find the thing you are here to say and split it into the three kinds of posts. You leave with your message and your first week of content already decided.",
            ),
            entry(
              "02",
              "Monday, September 28",
              "Writing your message for carousels.",
              "The format that does the most work on Instagram for people who sell expertise. Structure, hooks, slide flow, and how to build one on your phone.",
            ),
            entry(
              "03",
              "Monday, October 5",
              "Writing your message for LinkedIn.",
              "Where your buyers already are and where almost nobody is posting well. Text posts and PDF posts, written for a feed that rewards useful over loud.",
            ),
            entry(
              "04",
              "Monday, October 12",
              "Building a system for writing and posting.",
              "The part that makes this survive after the program ends. Your batching rhythm, your prompt library, and your AI setup, so week five happens without me in the room.",
            ),
          ],
          eyebrowFont: "Inter",
          numberFont: "Inter",
          dateFont: "Poppins",
          titleFont: "Inter",
          textFont: "Poppins",
        },
        {
          width: "custom",
          maxWidthValue: 785,
          maxWidthUnit: "px",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({
        tablet: { props: { numberSize: 38, titleSize: 18 } },
        mobile: {
          props: {
            rail: 60,
            gap: 35,
            numberWidth: 45,
            numberSize: 32,
            eyebrowSize: 13,
            dotSize: 12,
            itemGap: 10,
            textSize: 15,
          },
        },
      }),
    },
  ],
};
