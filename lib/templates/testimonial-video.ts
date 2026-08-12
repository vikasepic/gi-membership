import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim } from "@/lib/blocks";

// A filmed testimonial: the video beside the story it tells.
//
// ONE THING THIS DOES NOT DO, on purpose: the reference opens the film in a
// pop-up over the page. A modal is script, and script is stripped on save —
// this page also carries the payment form, and a section that can introduce
// arbitrary script beside it can read what is typed into it. So the film is
// embedded where it stands.
//
// That is not only the safe answer, it is the better one here: a pop-up costs
// a click before anyone sees a face, and the whole reason to put a filmed
// testimonial on a sales page is that a face does what a paragraph cannot.
//
// The `video` block already handles the embed, the poster frame and the
// aspect. Muted and without autoplay, because a testimonial that starts
// talking at someone is a testimonial they close.
export const template: Template = {
  id: "testimonial-video",
  name: "Testimonial — filmed",
  group: "Testimonials",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 1060 } },
  blocks: [
    {
      ...rowOf(
        [
          [
            make(
              "video",
              {
                source: "youtube",
                // Empty until a real film is put in. A block with no video
                // draws its poster and nothing else, which is honest — better
                // than shipping a template pointing at somebody else's upload.
                url: "",
                poster: "/templates/sections/portrait-2.svg",
                ratio: "16/9",
                controls: true,
                mute: true,
                autoplay: false,
                loop: false,
              },
              {
                radius: 14,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            make(
              "text",
              { html: "<p>In their own words</p>" },
              {
                color: "#832a63",
                blockAlign: "left",
                size: 12,
                weight: 700,
                transform: "uppercase",
                letterSpacing: 1.2,
                lineHeight: 1.3,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 12, l: 0, u: "px", link: false },
              },
            ),
            {
              ...make(
                "heading",
                { text: "What changed, said by the person it changed for.", tag: "h2" },
                {
                  color: "#11325b",
                  size: 27,
                  weight: 700,
                  lineHeight: 1.3,
                  margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({ mobile: { style: { size: 22 } } }),
            },
            make(
              "text",
              {
                html: "<p>Two or three sentences setting up the film — who they are, where they started, and what to listen for. Written by you; the claims are theirs.</p>",
              },
              {
                color: "#3d3d3d",
                blockAlign: "left",
                size: 15,
                lineHeight: 1.65,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
              },
            ),
            make(
              "text",
              { html: "<p><strong>Firstname Lastname</strong><br />What they do</p>" },
              {
                color: "#1f1f1f",
                blockAlign: "left",
                size: 15,
                lineHeight: 1.5,
                width: "auto",
                maxWidthValue: null,
                borderWidth: 3,
                borderSides: "left",
                borderColor: "#832a63",
                padding: { t: 0, r: 0, b: 0, l: 14, u: "px", link: false },
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
        ],
        { widths: [54, 46], gap: 40, verticalAlign: "center", stack: "tablet" },
      ),
      style: baseStyle({
        background: fill("#ffffff"),
        radius: 18,
        padding: dim(28, 30, 28, 30),
        margin: dim(0, 0, 0, 0),
      }),
      columnStyles: [col(), col()],
    },
  ],
};
