// Every piece of copy on the bespoke upsell page, declared once.
//
// The page used to hold its strings inline, so changing a headline meant a code
// change and a deploy — wrong for the part of the page that gets rewritten most
// often, by the person least able to deploy.
//
// Each field carries its own DEFAULT: the copy the page ships with. An offer
// that has never been edited renders exactly as before, an untouched field
// shows its default as the placeholder rather than looking empty, and a field
// added later starts with real copy instead of a blank.
//
// Groups mirror the page top to bottom, so the editor reads in the same order
// as the thing it edits.

export type FieldType = "text" | "textarea" | "lines";

export type ContentField = {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  default: string;
};

export type ContentGroup = {
  id: string;
  title: string;
  hint?: string;
  fields: ContentField[];
};

/** `a | b | c` per line — the same shape the section editors already use. */
const linesHint = (cols: string) => `One per line: ${cols}`;

export const OTO_CONTENT: ContentGroup[] = [
  {
    id: "hero",
    title: "1 · Hero",
    hint: "The navy band at the top. The first thing anyone reads.",
    fields: [
      {
        key: "hero.badge",
        label: "Urgency badge",
        type: "text",
        hint: "Only say what is true. This page really is shown once — the link behind it is single-use.",
        default: "One-time offer · this page is not shown again",
      },
      {
        key: "hero.eyebrow",
        label: "Eyebrow line",
        type: "textarea",
        default:
          "For the coach, consultant, or creator who has been meaning to post consistently for longer than they would like to admit.",
      },
      {
        key: "hero.headline",
        label: "Headline",
        type: "textarea",
        hint: "Wrap words in *asterisks* to italicise them.",
        default:
          'Go From *"I\'ll Be Consistent Someday"* to *"Here\'s This Week\'s Content"* — Without the Blank Page.',
      },
      {
        key: "hero.sub",
        label: "Sub-headline",
        type: "textarea",
        default:
          "A guided system that studies what is already working in your niche, pulls out the hooks behind it, and drafts your carousels, reels, and posts in your own voice.",
      },
      {
        key: "hero.support",
        label: "Support line",
        type: "textarea",
        default:
          "Built for people who have plenty to say and never enough time to sit down and write it.",
      },
      {
        key: "hero.card",
        label: "Stat card rows",
        type: "lines",
        hint: linesHint("label | value | note"),
        default: [
          "What you get | Carousels, reels + posts | Drafted in your voice for Instagram and LinkedIn. Ready to edit and publish.",
          "Time to start | One afternoon | Add a few competitors and your first drafts are waiting.",
          "Investment | $47 / month | Seven days free. Cancel any time. No contract.",
          "What you own | 100% yours | Every draft is yours to edit, post, and keep.",
        ].join("\n"),
      },
    ],
  },
  {
    id: "statbar",
    title: "2 · Stat bar",
    fields: [
      {
        key: "statbar.items",
        label: "Figures",
        type: "lines",
        hint: linesHint("figure | label"),
        default: [
          "2 | Platforms — IG + LinkedIn",
          "3 | Formats — carousels, reels, posts",
          "7 days | Free trial",
          "$47/mo | Cancel any time",
        ].join("\n"),
      },
    ],
  },
  {
    id: "problem",
    title: "3 · The problem",
    fields: [
      {
        key: "problem.heading",
        label: "Heading",
        type: "textarea",
        default: "You Already Know You Should Be Posting More Consistently.",
      },
      {
        key: "problem.lead",
        label: "Lead line",
        type: "textarea",
        default: "Here is what I hear from coaches, consultants, and creators every week.",
      },
      {
        key: "problem.chips",
        label: "Quote chips",
        type: "lines",
        hint: "One per line. Quote marks are added for you.",
        default: [
          "I know I should post, I just never know what to say.",
          "I open the app, stare at it, and close it again.",
          "I’ve been meaning to be consistent for months.",
        ].join("\n"),
      },
      {
        key: "problem.body",
        label: "Body",
        type: "textarea",
        hint: "Blank line between paragraphs.",
        default:
          "Sound familiar?\n\nYou are not lazy. You are not out of ideas. You are stuck because nobody gave you a repeatable way to turn what is already in your head — and what is already working in your niche — into posts.\n\nContent is not something you invent from nothing every day. It is something you assemble from proven angles and your own thinking.\n\nThat is exactly what Content Engine was built to do.",
      },
    ],
  },
  {
    id: "audience",
    title: "4 · Who it is for",
    fields: [
      {
        key: "audience.heading",
        label: "Heading",
        type: "textarea",
        default:
          "This Is Specifically For People Who Have Plenty to Say But Cannot Sit Down and Write It.",
      },
      {
        key: "audience.body",
        label: "Body",
        type: "textarea",
        default:
          "You speak with clarity the moment someone asks about your work. You can explain your point of view in a two-minute voice note.\n\nBut the moment you open the app to post, the words do not come.\n\nThat is not a discipline problem. It is a blank-page problem.\n\nContent Engine works the way you already work. You start from posts that are already performing, not from nothing. You edit and approve, rather than write from scratch.\n\nYou do not need to become a writer to publish consistently.",
      },
    ],
  },
  {
    id: "mechanism",
    title: "5 · How it works",
    fields: [
      {
        key: "mechanism.heading",
        label: "Heading",
        type: "textarea",
        default: "Your Content Does Not Have to Take Hours Every Day. Or a Whole Weekend.",
      },
      {
        key: "mechanism.body",
        label: "Body",
        type: "textarea",
        default:
          "Most creators believe staying consistent requires either a full day of batching or an agency on retainer. It does not.\n\nThat belief is the reason your best thinking stays in your notes app.",
      },
      {
        key: "mechanism.callout",
        label: "Rose callout",
        type: "textarea",
        default:
          "Content Engine studies the reels and carousels already performing in your niche, pulls out the hooks behind them, and drafts new posts in your voice. You set up your niche once. After that, you always start from a draft, not a blank page.",
      },
      {
        key: "mechanism.result",
        label: "The result line",
        type: "textarea",
        default:
          "A week of carousels, reels, and posts in your own voice, ready to edit and publish. In an afternoon, not a weekend.",
      },
    ],
  },
  {
    id: "speed",
    title: "6 · Speed",
    fields: [
      {
        key: "speed.heading",
        label: "Heading",
        type: "textarea",
        default: "This Week’s Content Could Be Drafted Before You Finish Your Coffee.",
      },
      {
        key: "speed.body",
        label: "Body",
        type: "textarea",
        default:
          "Not next month. Not after you “find the time.” Today.\n\nContent Engine does not ask you to be a writer. It asks you to add the accounts you already admire and answer a few questions about your own voice. From there, it does the research and the first draft.",
      },
      {
        key: "speed.accent",
        label: "Terracotta accent line",
        type: "textarea",
        default: "By the time you finish your second cup of coffee, this week’s posts are drafted.",
      },
    ],
  },
  {
    id: "credibility",
    title: "7 · Who built it",
    fields: [
      {
        key: "credibility.heading",
        label: "Heading",
        type: "textarea",
        default: "This Was Built By People Who Study What Actually Performs.",
      },
      {
        key: "credibility.body",
        label: "Body",
        type: "textarea",
        default:
          "Content Engine was built by the team at Greater Inside. We spend our days on one question: why does one post travel and a nearly identical one does not.\n\nSo the tool does what a good researcher does. It reads the top posts in your niche, transcribes the reels, breaks down the hook behind each one, and turns that into a starting point you can make your own.",
      },
      {
        key: "credibility.callout",
        label: "Plum callout",
        type: "textarea",
        default:
          "This is not a generic AI caption tool. It is a research-and-drafting system built on how content actually gets made — the hooks, the structures, and the angles that already work in your niche.",
      },
    ],
  },
  {
    id: "benefits",
    title: "8 · What changes",
    fields: [
      {
        key: "benefits.heading",
        label: "Heading",
        type: "textarea",
        default: "Here Is What Changes When You Post Consistently.",
      },
      {
        key: "benefits.cards",
        label: "Cards",
        type: "lines",
        hint: linesHint("title | body"),
        default: [
          "You become the name people think of in your space. | When you show up every week with something worth reading, you stop being one option among many and become the obvious one.",
          "You stop starting from zero every time. | Your best hooks, angles, and posts are organised in one place — ready to reuse, repurpose, and build on.",
          "Your ideas turn into a body of work. | The thinking currently living in your head becomes a searchable library of content that is documented, structured, and yours.",
        ].join("\n"),
      },
    ],
  },
  {
    id: "authority",
    title: "9 · Why it matters",
    fields: [
      {
        key: "authority.heading",
        label: "Heading",
        type: "textarea",
        default: "In a Feed Where Attention Is Scarce, Consistency Is Your Best Calling Card.",
      },
      {
        key: "authority.body",
        label: "Body",
        type: "textarea",
        default:
          "Think about the last time someone reached out ready to work with you. They had usually read something of yours first. They already knew how you think before the first message.\n\nThat does not happen from posting once a month. It happens from showing up with a clear point of view, week after week, in a way people can follow.\n\nWhen your content does that job, the conversations change. Fewer cold pitches. More people who arrive already convinced.",
      },
      {
        key: "authority.callout",
        label: "Navy callout",
        type: "textarea",
        hint: "Last line is shown bold.",
        default:
          "More reach. Warmer leads. A pipeline of people who knew your thinking before they ever reached out.\n\nContent is not a vanity metric. It is a business development asset.",
      },
    ],
  },
  {
    id: "strategy",
    title: "11 · Why this works",
    fields: [
      {
        key: "strategy.heading",
        label: "Heading",
        type: "text",
        default: "This Strategy Is as Old as the Feed Itself.",
      },
      {
        key: "strategy.lead",
        label: "Lead line",
        type: "textarea",
        default:
          "The creators who own their categories all did the same thing first: they published consistently, in their own voice, before anyone was watching.",
      },
      {
        key: "strategy.body",
        label: "Body",
        type: "textarea",
        default:
          "Using content to build an audience and a business is not new. It is a strategy that has produced results for as long as there have been platforms to publish on. The tools changed. The principle did not.",
      },
    ],
  },
  {
    id: "means",
    title: "12 · What this means for you",
    fields: [
      {
        key: "means.heading",
        label: "Heading",
        type: "textarea",
        default: "Here Is What Consistent Content Actually Builds.",
      },
      {
        key: "means.box",
        label: "Navy box copy",
        type: "textarea",
        default:
          "You do not need an agency on retainer or a full day every week to get there. You need $47 a month and an afternoon to start.\n\nThe research, the hooks, the drafting in your voice — that is the part Content Engine handles. It is available to you now.",
      },
      {
        key: "means.rows",
        label: "Box rows",
        type: "lines",
        hint: linesHint("label | value"),
        default: ["Time to start | An afternoon", "Investment | $47 / month · 7 days free"].join("\n"),
      },
    ],
  },
  {
    id: "what",
    title: "13 · What it is",
    fields: [
      {
        key: "what.pill",
        label: "Navy pill",
        type: "textarea",
        default: "The system that turns what’s working in your niche into content in your voice.",
      },
      {
        key: "what.heading",
        label: "Heading",
        type: "text",
        default: "CONTENT ENGINE — by Greater Inside",
      },
      {
        key: "what.body",
        label: "Body",
        type: "textarea",
        default:
          "Content Engine is a research-and-drafting system built for coaches, consultants, and creators. It studies the top posts in your niche, extracts the hooks behind them, and drafts carousels, reels, and posts in your voice — then gives you one place to plan and publish them.\n\nThis is not for everyone. It is built for people with real expertise who want to publish consistently and sound like themselves. If you want a tool that auto-posts generic captions with no editing and no point of view, this is not it.\n\nIf you have plenty to say, a niche you know well, and no reliable way to turn that into weekly content — you are in exactly the right place.",
      },
    ],
  },
  {
    id: "compare",
    title: "14 · What it replaces",
    fields: [
      {
        key: "compare.heading",
        label: "Heading",
        type: "textarea",
        default: "Let’s Talk About What Staying Consistent Actually Costs.",
      },
      {
        key: "compare.rows",
        label: "Cards",
        type: "lines",
        hint: `${linesHint("option | price | timing | note")} — the LAST line is the highlighted "best value" card.`,
        default: [
          "Content agency | $2,000–$5,000 | per month · ongoing | Someone else's read on your voice. A retainer that does not stop.",
          "In-house hire | A salary | full-time | Months to ramp, a salary to carry, still your voice to teach.",
          "Doing it yourself | Your time | hours each week | The blank page, every week, with no research to start from.",
          "Content Engine | $47 | per month · an afternoon to start | Research + drafts in your voice. Seven days free. Cancel any time.",
        ].join("\n"),
      },
    ],
  },
  {
    id: "price",
    title: "17 · The offer",
    fields: [
      {
        key: "price.heading",
        label: "Heading",
        type: "textarea",
        default: "Every Week You Wait Is a Week Someone Else Builds the Audience You Should Have.",
      },
      {
        key: "price.body",
        label: "Body",
        type: "textarea",
        default:
          "The creator with the audience is not always the most talented in the room. They are the one who kept showing up.\n\nYou have the expertise. You have the ideas. The only thing missing has been a way to turn them into posts without losing an afternoon to the blank page.\n\nYour next week of content is an afternoon away.",
      },
      {
        key: "price.card_terms",
        label: "Price card terms",
        type: "text",
        default: "7 days free · cancel any time",
      },
    ],
  },
  {
    id: "regret",
    title: "18 · If you leave",
    fields: [
      {
        key: "regret.heading",
        label: "Heading",
        type: "textarea",
        default: "What Happens If You Close This Page and Come Back to It “Later”?",
      },
      {
        key: "regret.body",
        label: "Body",
        type: "textarea",
        default:
          "You already know the answer.\n\nLater becomes next week. Next week becomes next month. And a year from now, you are still meaning to be consistent, while someone with the same expertise — and less of it — has become the name your audience follows.\n\nNot because they were better. Because they kept publishing and you did not.\n\nThe gap between the creators people follow and the ones they do not is rarely talent. It is almost always the decision to start, and to keep going. This is the simplest way to make that decision easy.",
      },
    ],
  },
  {
    id: "recap",
    title: "19 · Recap",
    fields: [
      {
        key: "recap.heading",
        label: "Heading",
        type: "text",
        default: "Here Is Everything, One More Time.",
      },
      {
        key: "recap.body",
        label: "Body",
        type: "textarea",
        default:
          "For $47 a month, with the first seven days free, you get a system that studies what is working in your niche, drafts carousels, reels, and posts in your own voice, and gives you one place to plan and publish them.\n\nSet up your niche once. After that, you start every week from a draft, not a blank page.\n\nNo agency. No blank page. No guessing what to post.\n\nJust your content. Ready.",
      },
    ],
  },
  {
    id: "faq",
    title: "20 · FAQ",
    fields: [
      {
        key: "faq.heading",
        label: "Heading",
        type: "text",
        default: "Everything You Want to Know Before You Start.",
      },
      {
        key: "faq.items",
        label: "Questions",
        type: "lines",
        hint: linesHint("question | answer"),
        default: [
          "Will I be charged today? | No. The first seven days are free. The first $47 is taken only if you keep it past then.",
          "How do I cancel? | From your account settings, at any time. Cancel before day seven and you are not charged.",
          "Who owns what I create? | You do. Every draft is yours to edit, post, and keep.",
          "Do I have to connect my Instagram? | No. You can add competitor accounts and start from there. Connecting your own is optional and lets it learn your voice and track your results.",
          "Does it post for me? | No. It researches, drafts, and helps you plan. You review and post yourself, so nothing goes out that is not yours.",
          "Will it sound like me? | It can learn your style from your own posts and draft in it. You always edit before anything is published.",
          "How long until I get my first drafts? | An afternoon. Add a few accounts in your niche and your first hooks and drafts are ready to work from.",
          "What platforms and formats does it cover? | Instagram and LinkedIn — carousels, reels, and posts.",
        ].join("\n"),
      },
    ],
  },
  {
    id: "final",
    title: "21 · Final call",
    fields: [
      {
        key: "final.heading",
        label: "Heading",
        type: "text",
        default: "One Login. One Afternoon. A Week of Content.",
      },
      {
        key: "final.body",
        label: "Body",
        type: "textarea",
        default:
          "You have been meaning to be consistent for a while. Maybe a long while.\n\nThe ideas are there. The expertise is there. The audience is there.\n\nThe only thing missing has been the system.",
      },
      {
        key: "final.checklist",
        label: "Checklist",
        type: "lines",
        hint: "One per line.",
        default: [
          "The research done for you — the top posts in your niche, and the hooks behind them",
          "Carousels, reels, and posts drafted in your own voice",
          "One place to plan the week and move each piece from draft to posted",
          "Seven days free, then $47 a month, cancel any time",
        ].join("\n"),
      },
    ],
  },
];

const BY_KEY = new Map(OTO_CONTENT.flatMap((g) => g.fields.map((f) => [f.key, f] as const)));

/** Every key, in page order — used by the editor and the save action. */
export const OTO_CONTENT_KEYS = [...BY_KEY.keys()];

export function defaultFor(key: string): string {
  return BY_KEY.get(key)?.default ?? "";
}

/**
 * Read one field, falling back to its default.
 *
 * Anything unexpected in the jsonb resolves to the default rather than
 * throwing. This page runs after a payment; a malformed value should cost a
 * sentence, not the page.
 */
export function contentValue(page: unknown, key: string): string {
  if (page && typeof page === "object" && !Array.isArray(page)) {
    const v = (page as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return defaultFor(key);
}

/** Split a paragraph field on blank lines. */
export function paragraphs(value: string): string[] {
  return value.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

/** Split a `lines` field into rows of pipe-separated cells. */
export function rows(value: string, cells: number): string[][] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split("|").map((c) => c.trim());
      while (parts.length < cells) parts.push("");
      return parts.slice(0, cells);
    });
}

/** Split a `lines` field into single values. */
export function items(value: string): string[] {
  return value.split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * Turn submitted form values into the object stored on the offer.
 *
 * Only declared keys survive, so a crafted post cannot stuff arbitrary data
 * into the offer row. A value that is empty, or typed back to exactly the
 * shipped copy, is dropped: that makes "clear the box" the reset — no separate
 * control to build or explain — and keeps the stored object to real edits, so
 * a later change to the shipped copy still reaches every offer that never
 * overrode it.
 */
export function normalizePageOverrides(
  read: (key: string) => string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of OTO_CONTENT_KEYS) {
    const raw = read(key);
    if (typeof raw !== "string") continue;
    const value = raw.replace(/\r\n/g, "\n").trim();
    if (!value || value === defaultFor(key).trim()) continue;
    out[key] = value;
  }
  return out;
}
