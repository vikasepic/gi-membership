import { at, make, type Template } from "./template";

// The closed FAQ: a navy heading over questions that open one at a time.
//
// The `faq` block's accordion layout already IS this — it draws the round
// chevron, the hairline between rows and the open/close behaviour. Nothing
// here rebuilds any of that; the template is the heading, the measure and the
// questions worth answering.
//
// Deliberately narrower than the band's usual 1040: an answer set across a
// full desktop width runs to twenty words a line, which is the width at which
// people stop reading answers and go back to the price.
export const template: Template = {
  id: "faq-accordion",
  name: "FAQ — open one at a time",
  group: "FAQ",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 780 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "Frequently Asked Questions", tag: "h2" },
        {
          color: "#11325b",
          size: 32,
          weight: 700,
          lineHeight: 1.25,
          textAlign: "center",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 30, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ mobile: { style: { size: 25 } } }),
    },
    make(
      "faq",
      {
        layout: "accordion",
        items: [
          {
            q: "What if I am just starting and have no clients yet?",
            a: "That is a great time to join. The model will help you avoid years of trial and error. You will learn how to choose a market, define a person, craft your first offer and cleanly start simple marketing, instead of guessing and changing directions every few months.",
          },
          {
            q: "What if I already have clients but feel stuck below a million?",
            a: "Then the constraint is usually structure rather than effort. Replace the guesswork with a sequence and the same work starts compounding.",
          },
          {
            q: "Does this only work for coaches?",
            a: "No. It works for any expert-led business where the buyer is paying for judgement — consultants, agencies, course creators, advisors.",
          },
          {
            q: "How much time do I need each week?",
            a: "Plan for a few focused hours. The programme is built to fit around client work rather than replace it.",
          },
          {
            q: "What if I cannot make the live calls?",
            a: "Every call is recorded and posted. You can send your question ahead and watch the answer later.",
          },
          {
            q: "How long do I keep access to the material?",
            a: "For as long as the programme runs. Nothing you have already worked through is taken away.",
          },
          {
            q: "What if I join and realize it is not for me?",
            a: "Write to the team inside the guarantee window and you get your money back. No case to argue.",
          },
        ],
      },
      { margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
    ),
  ],
};
