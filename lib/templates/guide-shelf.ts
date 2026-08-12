import { at, fill, make, type Template } from "./template";

// "Everything Inside the Guide, Part by Part." — a heading, a line, then a
// shelf of white cards that scrolls sideways, each with a terracotta tile, a
// part number and a short description.
//
// The `cards` block on its new Scrolling shelf flag. Everything else here was
// already a card setting: the tile, its colour and shape, the numbered eyebrow,
// the padding, the corner. A block of its own would have been all of that
// again, with its own bugs.
//
// `numbered` with the eyebrow style is what draws "Part 03" — the numbers count
// themselves, so adding a card in the middle renumbers the shelf instead of
// leaving two Part 04s.
export const template: Template = {
  id: "guide-shelf",
  name: "Shelf — scrolling parts",
  group: "Curriculum",
  band: { style: "paper", color: "#e9dde6", layout: { width: "boxed", maxWidth: 1100 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "Everything Inside the Guide,\nPart by Part.", tag: "h2" },
        {
          color: "#11325b",
          size: 40,
          weight: 700,
          lineHeight: 1.15,
          margin: { t: 0, r: 0, b: 12, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ tablet: { style: { size: 32 } }, mobile: { style: { size: 26 } } }),
    },
    make(
      "text",
      { html: "<p>This is a working shelf, not a course to watch.</p>" },
      {
        color: "#3d3d3d",
        blockAlign: "left",
        size: 16,
        lineHeight: 1.5,
        width: "auto",
        maxWidthValue: null,
        margin: { t: 0, r: 0, b: 28, l: 0, u: "px", link: false },
      },
    ),
    {
      ...make(
        "cards",
        {
          carousel: true,
          // How many are visible at once, not how many exist. The shelf holds
          // six and shows three, which is what makes it read as a shelf.
          columns: 3,
          numbered: true,
          numberStyle: "eyebrow",
          skin: "boxed",
          media: "icon",
          iconShape: "rounded",
          iconPlace: "above",
          iconBox: 44,
          iconSize: 22,
          iconBg: "#c8663e",
          iconColor: "#ffffff",
          cardPadding: 26,
          cardRadius: 14,
          cardTextGap: 14,
          items: [
            {
              title: "The positioning.",
              body: "The dos and don’ts that decide whether you sound like an expert or a guru.",
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle></svg>',
              image: "",
            },
            {
              title: "The voice.",
              body: "How to write the way you already speak, so nothing has to be edited back into sounding human.",
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z"></path><path d="M6 11a6 6 0 0 0 12 0M12 17v4"></path></svg>',
              image: "",
            },
            {
              title: "TAP.",
              body: "The three post types that decide everything else. Learn this once and you never run dry.",
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"></path><path d="M14 4v5h5"></path><path d="m9 15 2 2 4-4"></path></svg>',
              image: "",
            },
            {
              title: "The 150 hooks. Your shelf.",
              body: "Every hook written three ways, for Life, Business, and Health, so you see exactly how it flexes to your world.",
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 4.5a2.5 2.5 0 0 1 5 0V14a6 6 0 0 1-12 0"></path><path d="M6 14h4"></path></svg>',
              image: "",
            },
            {
              title: "The five formats.",
              body: "Copy-paste carousel structures, each with a worked example you can model today.",
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M4 9h16M9 9v11"></path></svg>',
              image: "",
            },
            {
              title: "The posting rhythm.",
              body: "From three posts a week to twenty-one, built off the shelf you already have, none of it written from scratch.",
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M4 10h16M9 3v4M15 3v4"></path><path d="m9.5 15 1.6 1.6 3.4-3.4"></path></svg>',
              image: "",
            },
          ],
        },
        {
          // White cards on the lilac band. The boxed skin fills with the
          // band's own panel colour otherwise, which here is cream.
          background: fill("#ffffff"),
          color: "#1f1f1f",
          size: 17,
          // No weight: a block's typography reaches the body as well as the
          // title, and 700 here set the whole card in bold. The card renderer
          // already draws its title semibold.
          margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
        },
      ),
      // Two at a time on a tablet, one on a phone. `columns` is the one prop on
      // this block that IS honoured per device, which is exactly what a shelf
      // needs — the rest of the design does not change with the width.
      responsive: at({ tablet: { props: { columns: 2 } }, mobile: { props: { columns: 1 } } }),
    },
  ],
};
