import { at, make, type Template } from "./template";

// "By the end of Day 3 you will have" — a centred navy heading over five
// outcomes, each a round lilac mark beside one sentence, ruled apart.
//
// The same `cards` shape as the ruled benefit list, and deliberately a second
// design rather than an option on it: that one leads each item with a bold
// heading and follows with a paragraph, this one is five single sentences with
// no heading at all. Which of the two a page wants is a real choice, and it is
// the kind of choice a shelf of designs exists to make for you.
//
// Titles are empty on every card, so the block draws body copy only. That is
// what makes it a list of outcomes rather than a list of features.
export const template: Template = {
  id: "outcome-list",
  name: "Outcome list — ruled",
  group: "Features",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 880 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "By the end of Day 3 you will have", tag: "h2" },
        {
          color: "#11325b",
          size: 34,
          weight: 700,
          lineHeight: 1.25,
          textAlign: "center",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 26, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ tablet: { style: { size: 28 } }, mobile: { style: { size: 23 } } }),
    },
    make(
      "cards",
      {
        items: [
          {
            title: "",
            body: "One AI tool you know how to use well, instead of ten you keep switching between",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"></rect><path d="M8 15.5 10.5 9l2.5 6.5M8.9 13.4h3.2M16 9v6.5"></path></svg>',
            image: "",
          },
          {
            title: "",
            body: "An AI Brain that travels with you across every tool and every conversation",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="8" y="8" width="8" height="8" rx="2"></rect><path d="M10 4v4M14 4v4M10 16v4M14 16v4M4 10h4M4 14h4M16 10h4M16 14h4"></path></svg>',
            image: "",
          },
          {
            title: "",
            body: "Your first AI skill producing work at a level beyond what you could produce alone",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="9" r="5"></circle><path d="m9 14-1.5 7L12 19l4.5 2L15 14"></path></svg>',
            image: "",
          },
          {
            title: "",
            body: "A system that handles content, follow-ups, and client work before you start your day",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="4.5" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16.5V20"></path><circle cx="12" cy="10.5" r="2.4"></circle></svg>',
            image: "",
          },
          {
            title: "",
            body: "Clarity on what AI can actually do for your specific business right now",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4-4"></path><path d="M11 8.5v5M8.5 11h5"></path></svg>',
            image: "",
          },
        ],
        columns: 1,
        skin: "plain",
        media: "icon",
        iconShape: "circle",
        iconPlace: "beside",
        iconBox: 46,
        iconSize: 22,
        iconBg: "#e2cadd",
        iconColor: "#832a63",
        // The rule between outcomes. With one column across it draws a
        // hairline above every item but the first, which is the design.
        divider: true,
        cardGap: 28,
      },
      {
        color: "#1f1f1f",
        size: 17,
        lineHeight: 1.5,
        margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
      },
    ),
  ],
};
