import { at, make, type Template } from "./template";

// A list of benefits, each with a round lilac mark, separated by full-width
// hairlines rather than boxed.
//
// This is the `cards` block doing what it already does — one column, plain
// skin, icon beside, rule between — and the whole design is settings. The mark
// is a 44px circle of #ead8e4 with the plum drawing inside it, measured off
// the reference.
//
// Icon beside rather than above: the reference hangs the mark in the left
// margin so the headings all start on one line. Above would indent every
// heading by the width of its own tile.
export const template: Template = {
  id: "list-ruled",
  name: "Benefit list — ruled",
  group: "Features",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 860 } },
  blocks: [
    {
      ...make(
        "cards",
        {
          items: [
            {
              title: "You reach for a hook instead of a blank screen.",
              body: "You open the shelf, pick a hook, fill in the blank, and you are already halfway to a finished post. The staring stops the day this lands in your inbox.",
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11V6.5a1.5 1.5 0 0 1 3 0V11"></path><path d="M12 11V9a1.5 1.5 0 0 1 3 0v2"></path><path d="M15 11v-.5a1.5 1.5 0 0 1 3 0V15a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-4.2-2.3L5 14a1.6 1.6 0 0 1 2.6-1.8L9 14"></path></svg>',
              image: "",
            },
            {
              title: "One belief becomes three posts.",
              body: "TAP shows you how to take a single thing you believe and write it three ways. You stop needing new ideas every week because every idea you already hold is three carousels, minimum.",
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9a3 3 0 0 1 3-3h5a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H7l-3 2.5V14a3 3 0 0 1-1-2.2Z"></path><path d="M17 9.5a3.5 3.5 0 0 1 2 6.3V18"></path><path d="M18.5 20h1"></path></svg>',
              image: "",
            },
            {
              title: "The structure is done before you start.",
              body: "Five formats, each mapped to a job. You pick the one that fits and drop your words into slides that are already built to hold a swipe.",
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="5" width="12" height="14" rx="2"></rect><path d="M16 8h2.5A1.5 1.5 0 0 1 20 9.5V17a2 2 0 0 1-2 2h-2"></path></svg>',
              image: "",
            },
            {
              title: "You post on purpose, not on mood.",
              body: "The schedule tells you what to post and when, from a light three-a-week rhythm up to a full daily engine. No more posting when you feel like it and quitting when you do not.",
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="5" width="15" height="15" rx="2"></rect><path d="M4 10h15M9 3v4M14 3v4"></path><path d="M8 14h6"></path></svg>',
              image: "",
            },
            {
              title: "You know a carousel will land before it goes out.",
              body: "The checklist catches the weak spots while you can still fix them. You hit post with confidence instead of hope.",
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4h9l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"></path><path d="M14 4v5h5"></path><path d="m8.5 14.5 2 2 4-4"></path></svg>',
              image: "",
            },
          ],
          columns: 1,
          skin: "plain",
          media: "icon",
          iconShape: "circle",
          iconPlace: "beside",
          iconBox: 44,
          iconSize: 20,
          iconBg: "#ead8e4",
          iconColor: "#832a63",
          // The rule between items, which is the design. With one column
          // across it draws a hairline above every item but the first.
          divider: true,
          cardGap: 34,
          cardTextGap: 12,
        },
        {
          color: "#1f1f1f",
          size: 17,
          weight: 700,
          margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
        },
      ),
      // Only the heading size moves. `iconPlace` and `cardGap` are NOT
      // per-device props — of everything on the cards block only `columns` is
      // — so setting them here would look right in the builder's phone view
      // and do nothing whatever for a visitor. A 44px tile beside the copy
      // still leaves 300px of measure on a phone, which is enough.
      responsive: at({ mobile: { style: { size: 16 } } }),
    },
  ],
};
