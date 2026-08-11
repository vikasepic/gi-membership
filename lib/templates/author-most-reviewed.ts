import { col, make, rowOf, type Template } from "./template";

// "Learn From One of the Most Reviewed Business Coaches in the World".
//
// The band comes with the design: Paper, painted #e9dde6, boxed, with the
// vertical air taken off. That last part is what makes the figure stand ON the
// band's bottom edge rather than float above it.
//
// It used to be a -64px margin on the row, cancelling the section's own
// `md:py-16` from the inside. It worked, and it left a negative number in the
// inspector that nobody typed and nothing explained — reported, rightly, as
// "unwanted margin". The air now comes off the band, where it belongs, and
// each column puts back the padding it wants: the words get their 48px, the
// photograph gets 48 at the top and none at the bottom, so it meets the edge.
//
// The photograph is a keyed PNG with a real alpha channel rather than the
// screenshot's baked lilac. Baked, it matches on exactly one band colour and
// shows its seams on every other.
export const template: Template = {
  id: "author-most-reviewed",
  name: "Author — most reviewed",
  group: "Author",
  band: {
    style: "paper",
    color: "#e9dde6",
    layout: { width: "boxed", pad: { t: 0, r: null, b: 0, l: null } },
  },
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
              // Stacked, the figure has the whole column to fill, and a
              // head-to-waist portrait at that size is a poster. Centred and
              // held to just over half the width it keeps the proportion it
              // has beside the words.
              //
              // Through the STYLE width, not the image's own `maxWidth` prop:
              // the live renderer reads `block.props` directly and never calls
              // `propsFor`, so a per-device prop override is honoured only
              // where CSS can carry it. Set as a prop it looks right in the
              // editor and does nothing for a visitor.
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
        // Stacks at tablet, not only on a phone: side by side at 834px the
        // eight paragraphs run far taller than the figure, and the column
        // aligned to the bottom then leaves a hand's depth of empty lilac
        // above it — the design reads as a mistake at exactly the width most
        // people hold.
        { widths: [44, 56], gap: 40, verticalAlign: "stretch", stack: "tablet" },
      ),
      columnStyles: [
        // The photograph's column: air above, none below, so the figure meets
        // the band's edge. This is the -64px margin, said honestly.
        col({
          colAlignSelf: "flex-end",
          padding: { t: 48, r: 0, b: 0, l: 0, u: "px", link: false },
        }),
        // The words keep the air the band gave up.
        col({ padding: { t: 48, r: 0, b: 48, l: 0, u: "px", link: false } }),
      ],
    },
  ],
};
