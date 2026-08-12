import { at, fill, make, type Template } from "./template";

// "What You'll Learn" — one white card holding six skills, each a lilac tile
// beside a plum eyebrow, a two-line title and a paragraph, ruled apart.
//
// The eyebrow says "SKILL 01", not "01", so it is NOT the block's numbered
// eyebrow — that counts and prints the figure alone. It rides in the card's
// TITLE instead, which is inline markup: a plum span, a break, then the
// heading. That keeps the whole thing one card with one title rather than
// three blocks stacked per row, which is what the shape actually is.
//
// The cost of writing it that way, said out loud: the numbers no longer count
// themselves. Insert a skill in the middle and the eyebrows below it have to
// be retyped. Worth it here — six is a set that rarely changes, and the
// alternative is a block growing an eyebrow field for one design.

const eyebrow = (label: string, title: string) =>
  `<span style="color:#832a63;font-size:14px;letter-spacing:0.5px">${label}</span><br /><strong>${title}</strong>`;

export const template: Template = {
  id: "skills-list",
  name: "Skills — one card, ruled rows",
  group: "Curriculum",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 900 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "What You'll Learn", tag: "h2" },
        {
          color: "#11325b",
          size: 32,
          weight: 700,
          lineHeight: 1.25,
          textAlign: "center",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 16, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ mobile: { style: { size: 25 } } }),
    },
    make(
      "text",
      {
        html: [
          "<p>The 6 Skills That Let One Person Run a Real Business.</p>",
          "<p>Each skill is a layer. Build them in the right order and your business stops depending on you being in the room for every piece.</p>",
        ].join(""),
      },
      {
        color: "#3d3d3d",
        blockAlign: "left",
        size: 16,
        lineHeight: 1.6,
        width: "auto",
        maxWidthValue: null,
        margin: { t: 0, r: 0, b: 26, l: 0, u: "px", link: false },
      },
    ),
    make(
      "cards",
      {
        items: [
          {
            title: eyebrow("SKILL 01", "Foundation:<br />Build the Base Everything Runs On"),
            body: "Your projects and your workspace. Set this up right and every skill you build after it is ten times faster. Skip it and nothing connects.",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="5" width="18" height="12" rx="2"></rect><path d="M8 21h8M12 17v4"></path><circle cx="9.5" cy="11" r="1.4"></circle><circle cx="14.5" cy="11" r="1.4"></circle></svg>',
            image: "",
          },
          {
            title: eyebrow("SKILL 02", "Skills and Stacking:<br />One Prompt Does the Work of Five"),
            body: "How to build skills and stack them so your output multiplies. This is the core mechanic. Everything else depends on understanding it first.",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="3.2"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6 7.7 7.7M16.3 16.3l2.1 2.1M18.4 5.6 16.3 7.7M7.7 16.3l-2.1 2.1"></path></svg>',
            image: "",
          },
          {
            title: eyebrow("SKILL 03", "Content System:<br />Never Start From a Blank Page Again"),
            body: "Your full content workflow. Carousels, posts, short video scripts. The system produces. You direct and approve. That is the whole model.",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 9h5M8 13h8"></path><path d="m15 8 3 3-4 1 1-4Z"></path></svg>',
            image: "",
          },
          {
            title: eyebrow("SKILL 04", "Client Delivery:<br />The Work Runs Without You in the Room"),
            body: "Onboarding, delivery and follow-up as a repeatable process rather than a series of favours you remember to do.",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="9" cy="8.5" r="3"></circle><path d="M3.5 19a5.5 5.5 0 0 1 11 0"></path><path d="m16 12 2 2 4-4"></path></svg>',
            image: "",
          },
          {
            title: eyebrow("SKILL 05", "The Offer:<br />What You Sell and What You Charge"),
            body: "The ladder, the price at each rung, and the sentence that makes the next one obvious.",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 19h16M7 16V9M12 16V5M17 16v-4"></path></svg>',
            image: "",
          },
          {
            title: eyebrow("SKILL 06", "The Loop:<br />Where the Next Client Comes From"),
            body: "The one repeatable motion that fills the pipeline, so growth stops depending on how the week happened to go.",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M20 12a8 8 0 1 1-2.3-5.6"></path><path d="M20 4v4h-4"></path></svg>',
            image: "",
          },
        ],
        columns: 1,
        skin: "plain",
        media: "icon",
        iconShape: "rounded",
        iconPlace: "beside",
        iconBox: 52,
        iconSize: 26,
        iconBg: "#e2cadd",
        iconColor: "#832a63",
        divider: true,
        cardGap: 26,
        cardTextGap: 8,
      },
      {
        // One card holding all six, which is the design: the rules are between
        // the rows, not around each of them.
        background: fill("#ffffff"),
        radius: 20,
        padding: { t: 30, r: 32, b: 30, l: 32, u: "px", link: false },
        color: "#1f1f1f",
        size: 16,
        lineHeight: 1.55,
        margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
      },
    ),
  ],
};
