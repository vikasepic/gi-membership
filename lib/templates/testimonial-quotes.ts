import { fill, make, type Template } from "./template";

// One testimonial at a time, in words, with the face reduced to a circle.
//
// The same `slides` block as the two beside it, on its default Card skin — the
// strip, the snapping, the arrows and the dots are shared and stay shared. The
// only thing this design needed that the skin did not draw was the avatar: the
// panelled skins read `quote`, `name` and `role` and ignored `image` entirely,
// so `avatars` was added to that skin rather than a second block type invented
// for it. Portrait is the same slide with the picture behind the words instead
// of beside them, and this is what a page wants when the quote is the point and
// the photograph is not — or when the photographs are not good enough to enlarge.
//
// The copy is DUMMY and looks it. A placeholder testimonial with a plausible
// name and a specific figure is a fabricated trust signal the moment the
// template lands on a live page, and it is the one placeholder nobody catches
// because it reads like finished work. Replace it with something real — with
// permission — or delete the block.
export const template: Template = {
  id: "testimonial-quotes",
  name: "Testimonials — words only",
  group: "Testimonials",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 620 } },
  blocks: [
    make(
      "slides",
      {
        perView: 1,
        avatars: true,
        arrows: true,
        dots: true,
        items: [
          {
            quote:
              "The one line they would say about it, if you asked them in a corridor.\n\nThen the longer version, in their words: what they were doing before, what changed, and how long that took. Two or three sentences is plenty.\n\nAnd the last one answers the objection this page is really about.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-1.svg",
          },
          {
            quote:
              "The second, and it swipes.\n\nKeep them roughly the same length — a short one after a long one leaves the card half empty as it slides in.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-2.svg",
          },
          {
            quote:
              "The third is the one for the person still deciding.\n\nA quote that names the thing they are worried about does more here than a quote that says the whole thing was wonderful.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-3.svg",
          },
        ],
      },
      {
        background: fill("#832a63"),
        // Stated, not derived: the Card skin paints the slide with the block's
        // own background and its ink with the block's own colour, and the
        // band's ink is dark paper ink that would be unreadable on this.
        color: "#ffffff",
        radius: 18,
        margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
      },
    ),
  ],
};
