import { fill, make, type Template } from "./template";

// One testimonial at a time, full width, the quote over the photograph.
//
// The same Portrait skin as the three-across set, shown one at a time. Worth
// its own entry on the shelf rather than a note on that one: three across is a
// wall of proof you scan, and one at a time is a single story you read, and
// which of those a page wants is decided by where on the page it sits.
//
// Dummy copy, and it reads as dummy — see the portraits template. A
// placeholder testimonial that looks finished is the one placeholder that
// reaches a live page.
export const template: Template = {
  id: "testimonial-single",
  name: "Testimonials — one at a time",
  group: "Testimonials",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 620 } },
  blocks: [
    make(
      "slides",
      {
        skin: "portrait",
        perView: 1,
        items: [
          {
            quote:
              "The whole story in three or four lines, in their words. One at a time means it can run longer than it could in a strip of three.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-1.svg",
          },
          {
            quote: "The second, and it swipes. Keep them roughly the same length.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-2.svg",
          },
          {
            quote: "The third closes on the objection the page is really about.",
            name: "Firstname Lastname",
            role: "What they do",
            image: "/templates/sections/portrait-3.svg",
          },
        ],
      },
      {
        background: fill("#832a63"),
        radius: 18,
        margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
      },
    ),
  ],
};
