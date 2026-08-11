import { col, make, rowOf, type Template } from "./template";

// "I Did Not Study This. I Posted Until It Worked, Then Wrote Down What Did."
//
// Band: Paper painted #000000, FULL width, no padding at all — the picture
// runs to the screen edge on the right, which is the whole point of the
// design and the thing a blocks-only template could not do at all before the
// section grew a width of its own. The words put their own air back.
//
// No preset is black, so the ground is painted rather than named. The ink is
// set on the blocks instead of coming from the band, because Paper's ink is
// near-black and this ground is black.
export const template: Template = {
  id: "author-not-studied",
  name: "Author — did not study this",
  group: "Author",
  band: {
    style: "paper",
    color: "#000000",
    layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, padUnit: "px" },
  },
  blocks: [
    {
      ...rowOf(
        [
          [
            {
              ...make(
                "heading",
                {
                  text: "I Did Not Study This.\nI Posted Until It Worked,\nThen Wrote Down What Did.",
                  tag: "h2",
                },
                {
                  color: "#ffffff",
                  size: 36,
                  lineHeight: 1.22,
                  weight: 700,
                  margin: { t: 0, r: 0, b: 26, l: 0, u: "px", link: false },
                },
              ),
              responsive: {
                tablet: { style: { size: 30 }, props: {} },
                mobile: { style: { size: 25 }, props: {} },
              },
            },
            make(
              "text",
              {
                html: [
                  "<p>I know carousels from doing them. Badly at first, then well, then consistently, tracking what actually got shared and what died quietly.</p>",
                  "<p>I run Greater Inside, where we help service founders build real businesses on systems instead of hustle. I have written three bestselling books. Through Evercoach, I helped train coaches in over 100 countries.</p>",
                  "<p>None of that is why this guide works.</p>",
                  "<p>It works because my own content runs on this exact shelf. The same three post types. The same formats. The same schedule. I built it because I needed it, and I am handing you the finished version so you skip the years of figuring it out.</p>",
                ].join(""),
              },
              {
                width: "auto",
                maxWidthValue: null,
                blockAlign: "left",
                color: "#e8e8e8",
                size: 16,
                lineHeight: 1.75,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            make(
              "image",
              {
                url: "/templates/author/streaks.png",
                alt: "Ajit Nawalkha speaking, lit from behind",
                ratio: "auto",
                maxWidth: 100,
              },
              { margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
            ),
          ],
        ],
        { widths: [52, 48], gap: 0, verticalAlign: "center", stack: "tablet" },
      ),
      columnStyles: [
        // The words carry the air the band gave up, and keep clear of the
        // screen edge on the left the way the reference does.
        col({ padding: { t: 72, r: 40, b: 72, l: 88, u: "px", link: false } }),
        null,
      ],
    },
  ],
};
