import { at, make, type Template } from "./template";

// The open FAQ: every answer already showing, in two columns, under a heading
// that sits to the left rather than over the middle.
//
// The same `faq` block as the accordion, switched to its "open" layout — the
// two are one block with one control between them, which is why this template
// is a heading and a list rather than a second FAQ implementation.
//
// Open rather than closed is a decision about where in the page it sits. Late
// on a long sales page an accordion asks a reader who has already decided to
// go hunting; open, they scan for the one thing still bothering them and stop.
export const template: Template = {
  id: "faq-open-columns",
  name: "FAQ — all open, two columns",
  group: "FAQ",
  band: { style: "paper", color: "#ffffff", layout: { width: "boxed", maxWidth: 1000 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "Everything You Want to Know\nBefore You Begin.", tag: "h2" },
        {
          color: "#11325b",
          size: 30,
          weight: 700,
          lineHeight: 1.25,
          textAlign: "left",
          blockAlign: "left",
          margin: { t: 0, r: 0, b: 34, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ mobile: { style: { size: 24 } } }),
    },
    make(
      "faq",
      {
        layout: "open",
        items: [
          {
            q: "Who owns the rights to the book?",
            a: "You do. Completely and entirely. Full copyright, full ownership, no exceptions. Publish it, sell it, give it away, use it as a lead magnet, put it on Amazon — your choice. Book Writer is the tool that helped you write it. The book itself is your intellectual property.",
          },
          {
            q: "Who is Book Writer for?",
            a: "Coaches, consultants, and online course creators who want to write a non-fiction book that establishes their authority and shares their methodology. If you have a framework, a process, or a body of work you have been wanting to put into a book, this is built for you. It is not designed for fiction or general-purpose content.",
          },
          {
            q: "What does the experience actually look like?",
            a: "A structured conversation. The AI asks you questions. You answer in your own words — the way you would explain your ideas to a client. As you respond, the AI builds your manuscript in real time, writing in your voice based on everything you share. Less like filling out a form and more like being coached through a book-writing session by someone who already knows how to do this.",
          },
          {
            q: "Can I edit it after?",
            a: "Absolutely. What you receive is your first draft. Edit it, expand it, refine it however you like. Most people find it needs far less editing than expected, because it was built from their own voice to begin with.",
          },
          {
            q: "Will it sound like me?",
            a: "Yes. That is the core design principle. Book Writer builds your book from what you share in the session — your words, your frameworks, your stories, your perspective. It will not sound like every other business book on the shelf. It will sound like you.",
          },
          {
            q: "How long does it take?",
            a: "Most people complete their session in under two hours. The length of your manuscript depends on how much you share. You can end up with anywhere from 20,000 to 60,000 words.",
          },
          {
            q: "What do I do with the book once it is written?",
            a: "There are five common ways coaches and consultants put a book to work immediately — as a lead magnet, a paid product, a speaking credential, a client onboarding piece, and a course outline.",
          },
          {
            q: "What if I already have notes, an outline, or existing content?",
            a: "Even better. Bring everything into the conversation. The more you share, the richer and more complete your manuscript will be.",
          },
        ],
      },
      { margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
    ),
  ],
};
