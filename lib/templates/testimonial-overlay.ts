import { at, fill, make, type Template } from "./template";

// "Founder Stories" — the same portraits, washed in black rather than plum,
// under a navy heading.
//
// The wash colour is the block's own card background, so this design and the
// plum one are the same skin with one control changed. Worth its own entry
// because the two read completely differently: plum makes a set of cards, black
// makes the photograph the subject and the words a caption on it.
//
// NOT built: the reference puts a terracotta "Read More" under each quote.
// That needs a link per slide, and a link per slide is a field on the block —
// which would be worth adding for a set of stories that genuinely continue
// somewhere, and is not worth adding for a decoration. Say the word and it is
// a small change; leaving it out is the honest default, because a Read More
// that goes nowhere is worse than no Read More.
export const template: Template = {
  id: "testimonial-overlay",
  name: "Testimonials — dark overlay",
  group: "Testimonials",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 1100 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "Founder Stories", tag: "h2" },
        {
          color: "#11325b",
          size: 30,
          weight: 700,
          lineHeight: 1.25,
          textAlign: "center",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 24, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ mobile: { style: { size: 24 } } }),
    },
    make(
      "slides",
      {
        skin: "portrait",
        perView: 3,
        items: [
          {
            quote:
              "Four lines is the most this shape holds. Their words about what working with you was actually like.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-1.svg",
          },
          {
            quote: "A shorter one. The set reads better when the lengths differ.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-2.svg",
          },
          {
            quote:
              "The one that names the objection — what they had tried before, and why this was not that.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-3.svg",
          },
        ],
      },
      {
        // Near-black rather than plum. The ink over it is chosen against this
        // colour, so the quote stays readable whichever way it is taken.
        background: fill("#111111"),
        radius: 18,
        margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
      },
    ),
  ],
};
