import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block } from "@/lib/blocks";

// "What you will get", part by part: a lilac panel per part, each with a plum
// PART badge, a heading, and a checklist whose items lead with a bold clause
// and continue in plain type.
//
// The bold-then-plain line is why the checks are an `iconlist` carrying markup
// rather than two blocks: it is ONE sentence with two weights, and splitting it
// would wrap the plain half onto its own line under the tick.
//
// Close cousin of the three-day curriculum, and deliberately a separate design
// rather than an option on it: that one is a white card with a coloured edge
// and three short lines, this is a lilac panel with four long ones. Same parts,
// different job.

const PANEL = () =>
  col({
    background: fill("#ede0ea"),
    radius: 18,
    padding: { t: 30, r: 36, b: 30, l: 36, u: "px", link: false },
    responsive: at({
      mobile: { style: { padding: { t: 22, r: 20, b: 22, l: 20, u: "px", link: false } } },
    }),
  });

const badge = (label: string) =>
  make(
    "text",
    { html: `<p>${label}</p>` },
    {
      width: "fit",
      maxWidthValue: null,
      blockAlign: "left",
      background: fill("#7a2a5c"),
      color: "#ffffff",
      size: 13,
      weight: 700,
      transform: "uppercase",
      letterSpacing: 0.8,
      lineHeight: 1,
      radius: 4,
      padding: { t: 11, r: 16, b: 11, l: 16, u: "px", link: false },
      margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
    },
  );

const partTitle = (text: string) =>
  make(
    "heading",
    { text, tag: "h3" },
    {
      color: "#1f1f1f",
      size: 21,
      weight: 700,
      lineHeight: 1.3,
      margin: { t: 0, r: 0, b: 16, l: 0, u: "px", link: false },
    },
  );

/** Each line leads bold and continues plain, which is one sentence, not two. */
const checks = (lines: string[]) =>
  make(
    "iconlist",
    {
      items: lines.map((text) => ({ text })),
      layout: "stacked",
      iconSize: 16,
      gap: 16,
      iconColor: "#832a63",
    },
    {
      color: "#2f2f2f",
      size: 15,
      lineHeight: 1.55,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  );

const part = (label: string, title: string, lines: string[], last = false): Block => ({
  ...rowOf([[badge(label), partTitle(title), checks(lines)]], { gap: 0 }),
  style: baseStyle({ margin: dim(0, 0, last ? 0 : 22, 0) }),
  columnStyles: [PANEL()],
});

export const template: Template = {
  id: "parts-panels",
  name: "What you get — part by part",
  group: "Curriculum",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 900 } },
  blocks: [
    part("Part 1:", "Scale to a Million: Fundamentals of Million Dollar Business", [
      "<strong>Understand the Startup J-Curve (and stop panicking in the dip).</strong> You’ll see why progress can look slower before it accelerates, so you don’t quit, pivot too early, or “fix” the wrong problem.",
      "<strong>Know the one job at each stage of growth.</strong> Whether you’re at 0 clients, 1 client, or 5+ clients, you’ll know exactly what matters most right now—so you build momentum instead of doing random tasks.",
      "<strong>Prioritize high-leverage moves and cut the busywork.</strong> You’ll learn what to push up the list (proof, offer clarity, pipeline) and what to stop wasting time on (perfect branding, endless planning, unnecessary tools).",
      "<strong>Build founder-level business thinking.</strong> You’ll get the core fundamentals clear, so you make better decisions faster and stop relying on “hope marketing” or guessing.",
    ]),
    part(
      "Part 2:",
      "Million Dollar Products: Build the Stack",
      [
        "<strong>Design the offer ladder that carries a million.</strong> One entry product, one core programme, one high-touch tier — and the reason each exists.",
        "<strong>Price from value, not from nerves.</strong> What to charge at each rung, and how to say the number without flinching.",
        "<strong>Know which product to build next.</strong> The order matters more than the ideas; building the third one first is how a year disappears.",
      ],
      true,
    ),
  ],
};
