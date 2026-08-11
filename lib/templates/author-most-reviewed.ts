import { col, make, rowOf, type Template } from "./template";

// "Learn From One of the Most Reviewed Business Coaches in the World".
//
// Band: Paper, with the section background set to #e9dde6.
//
// The lilac is the band's, not the template's. A blocks-only template lives
// inside the section's 1040px column and cannot paint to the screen edge, so
// the ground has to come from the section — which is why the photograph is a
// keyed PNG with a real alpha channel rather than the screenshot's baked
// lilac. Baked, it matches on exactly one band colour and shows its seams on
// every other.
//
// The picture stands ON the bottom edge: the row carries -64px of bottom
// margin, which is precisely the section's own `md:py-16`, and the column is
// aligned to the end so the figure grows downward into it. Below 768px that
// padding is 48px AND the columns have stacked, so the bleed is cleared —
// left in, it would pull the photograph over the first paragraph.
export const template: Template = {
  id: "author-most-reviewed",
  name: "Author — most reviewed",
  group: "Author",
  blocks: [
    {
      ...rowOf(
        [
          [
            {
              ...make("image", {
                url: "/templates/author/coach-cutout.png",
                alt: "Ajit Nawalkha",
                ratio: "auto",
                maxWidth: 100,
              }),
              // Stacked, the figure has the whole 834px column to fill and a
              // head-to-waist portrait at that size is a poster, not a
              // portrait. Centred and held to just over half the width it
              // keeps the proportion it has beside the words.
              //
              // Through the STYLE width, not the image's own `maxWidth` prop:
              // the live renderer reads `block.props` directly and never calls
              // `propsFor`, so a per-device prop override is honoured only
              // where CSS can carry it — rows and cards. Set as a prop here it
              // looks right in the editor and does nothing for a visitor.
              responsive: {
                tablet: {
                  style: {
                    width: "custom",
                    maxWidthValue: 55,
                    maxWidthUnit: "%",
                    blockAlign: "center",
                  },
                  props: {},
                },
                mobile: {
                  style: {
                    width: "custom",
                    maxWidthValue: 82,
                    maxWidthUnit: "%",
                    blockAlign: "center",
                  },
                  props: {},
                },
              },
            },
          ],
          [
            {
              ...make(
                "heading",
                {
                  text: "Learn From One of the Most Reviewed Business Coaches in the World",
                  tag: "h2",
                },
                {
                  color: "#11325b",
                  size: 30,
                  lineHeight: 1.25,
                  weight: 700,
                  margin: { t: 0, r: 0, b: 20, l: 0, u: "px", link: false },
                },
              ),
              responsive: {
                tablet: { style: { size: 26 }, props: {} },
                mobile: { style: { size: 24 }, props: {} },
              },
            },
            make(
              "text",
              {
                html: [
                  "<p>Ajit Nawalkha is one of the few who can show you exactly what he did, not just tell you what to do.</p>",
                  "<p>He’s the former CEO of Mindvalley and co-founder of Evercoach, which trained over 50,000 coaches globally before being acquired in 2024.</p>",
                  "<p>But the credentials aren’t the point. The results are.</p>",
                  "<p>Ajit generated $600,000 in six months using social media alone, no paid ads, no agency, no team of content creators. Just a clear point of view and a repeatable system. On an account Instagram had shadow-banned, he built a reach of 24 million.</p>",
                  "<p>He then combined that organic authority with paid media and cut his cost of advertising in half because content that already converts makes every ad dollar work twice as hard.</p>",
                  "<p>He didn’t figure this out as a marketer. He figured it out as a coach who was posting into silence, spending money on strategies that produced nothing, and slowly realizing he’d been given a content creator’s playbook for an expert’s business.</p>",
                  "<p>The shift was simple, and replicable: people respond to people. The moment he stopped chasing the algorithm and started owning his perspective, the right clients started showing up, already sold.</p>",
                  "<p>That’s the system you’re getting in this workshop. Live. Free.</p>",
                ].join(""),
              },
              // Width auto, not the 680px measure a new text block starts at:
              // inside a column the measure is the column's already, and a
              // centred 680px box would sit off to one side of a wider one.
              {
                width: "auto",
                maxWidthValue: null,
                blockAlign: "left",
                size: 16,
                lineHeight: 1.55,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
        ],
        // Stacks at tablet, not only on a phone. Side by side at 834px the
        // eight paragraphs run far taller than the figure, and a column
        // aligned to the bottom then leaves a hand's depth of empty lilac
        // above it — the design reads as a mistake at exactly the width most
        // people hold.
        { widths: [44, 56], gap: 40, verticalAlign: "stretch", stack: "tablet" },
      ),
      style: {
        ...make("row").style,
        margin: { t: 0, r: 0, b: -64, l: 0, u: "px", link: false },
      },
      responsive: {
        // The bleed goes with the side-by-side layout. Once the columns stack,
        // the photograph is above the words and -64px would pull it onto them.
        tablet: {
          style: { margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
          props: {},
        },
        mobile: {
          style: { margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
          props: {},
        },
      },
      columnStyles: [col({ colAlignSelf: "flex-end" }), null],
    },
  ],
};
