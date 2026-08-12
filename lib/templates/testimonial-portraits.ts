import { fill, make, type Template } from "./template";

// Three portraits with the quote laid over each, swiping sideways.
//
// The `slides` block on its Portrait skin. It gained a photograph per slide
// and that skin for this design and the four beside it — every one of them is
// a face with words over it, and the strip, the snapping and the quote/name/
// role were already there.
//
// The copy is DUMMY and looks it. A placeholder testimonial with a plausible
// name and a specific figure is a fabricated trust signal the moment the
// template lands on a live page, and it is the one placeholder nobody catches
// because it reads like finished work. Names here are visibly not people, and
// the numbers are shapes rather than claims. Replace both with something real
// — with permission — or delete the block.
export const template: Template = {
  id: "testimonial-portraits",
  name: "Testimonials — portraits",
  group: "Testimonials",
  band: { style: "paper", color: "#ede0ea", layout: { width: "boxed", maxWidth: 1100 } },
  blocks: [
    make(
      "slides",
      {
        skin: "portrait",
        perView: 3,
        items: [
          {
            quote: "One sentence about the result they got, in their own words.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-1.svg",
          },
          {
            quote:
              "A longer one, three or four lines, so the set does not read as three identical cards. Their words, not yours.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-2.svg",
          },
          {
            quote: "A short one to close on. Short quotes land hardest.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-3.svg",
          },
        ],
      },
      {
        // The wash over each photograph is this colour, and the ink on it is
        // chosen against it. Left unset it would take the band's accent, which
        // on a paper band is terracotta.
        background: fill("#832a63"),
        radius: 18,
        margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
      },
    ),
  ],
};
