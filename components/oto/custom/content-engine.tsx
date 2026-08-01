import { OtoActions, type OtoView } from "@/components/oto/shell";

// Content Engine — bespoke upsell page.
//
// THESIS: the Greater Inside launch page, rebuilt for a subscription. Section
// rhythm, colour system and voice mirror the Book Writer / Mindvalley page
// because that page converts for this exact audience; the client chose the
// category standard deliberately and pinned that page as the craft bar.
//
// OWN-WORLD: navy #11325B carries the hero, the reassurance boxes and the
// close. Terracotta is the CTA and one accent line per section, never
// decoration. Plum #832A63 marks emphasis only — the best-value card, the
// strongest callout. Rose tints soften the quote chips and benefit cards.
// Alternating white and light-grey bands give the page its rhythm.
//
// STORY: you already know you should post; you are not lazy, you are stuck at
// the blank page; this starts you from what already works in your niche.
//
// FIRST VIEWPORT: navy hero, headline left with italic emphasis, four-row stat
// card right, terracotta CTA under the copy.
//
// COPY: verbatim from the client's sales-page document. Every section whose
// source copy was a [PLACEHOLDER] — testimonials, the creator roster, the
// founder story, both bonuses — is OMITTED rather than invented, per that
// document's own instruction. They drop in when real material exists.
//
// Terracotta fills use #b0532f: white on the brand #C8653D is 3.90:1, under AA
// for button text. #C8653D is kept for large text and accent rules, where 3:1
// is the bar and it passes.

const NAVY = "#11325B";
const PLUM = "#832A63";
const TERRA = "#C8653D";
const BAND = "#f6f4f1";
const ROSE = "#f8ebe6";
const BODY = "#4a4a52";

const CTA_PILL =
  "group inline-flex items-center gap-2.5 rounded-full bg-[#b0532f] px-8 py-4 text-[1.02rem] font-medium text-white shadow-[0_14px_30px_-14px_rgba(176,83,47,0.6)] transition-[transform,background-color] duration-200 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:bg-[#9c4728] active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100";

/** Full-width band. The page's rhythm comes from alternating these. */
function Band({
  children,
  tone = "white",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "white" | "grey" | "navy" | "rose" | "plum";
  className?: string;
}) {
  const bg = {
    white: "#ffffff",
    grey: BAND,
    navy: NAVY,
    rose: ROSE,
    plum: PLUM,
  }[tone];
  const dark = tone === "navy" || tone === "plum";
  return (
    <section
      className={`px-6 py-16 md:px-12 md:py-24 ${dark ? "text-white" : ""} ${className}`}
      style={{ background: bg, color: dark ? "#fff" : undefined }}
    >
      <div className="mx-auto w-full max-w-4xl">{children}</div>
    </section>
  );
}

function H2({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <h2
      className={`font-display text-[clamp(1.6rem,3.4vw,2.35rem)] font-semibold leading-[1.18] tracking-[-0.02em] text-balance ${className}`}
      style={{ color: NAVY, ...style }}
    >
      {children}
    </h2>
  );
}

function P({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <p
      className={`text-[1.02rem] leading-[1.75] text-pretty ${className}`}
      style={{ color: BODY, ...style }}
    >
      {children}
    </p>
  );
}

/** Terracotta accent rule + line. One per section at most, per the brief. */
function AccentLine({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="border-l-2 py-1 pl-5 text-[1.05rem] font-medium italic leading-relaxed"
      style={{ borderColor: TERRA, color: NAVY }}
    >
      {children}
    </p>
  );
}

function Cta({ view, note = false }: { view: OtoView; note?: boolean }) {
  return (
    <OtoActions
      view={view}
      align="start"
      showNote={note}
      buttonClassName={CTA_PILL}
      className="pt-2"
    />
  );
}

export function ContentEngineOto({ view }: { view: OtoView }) {
  return (
    <div className="-mx-5 md:-mx-6">
      {/* 1 · HERO */}
      <section className="px-6 py-16 text-white md:px-12 md:py-24" style={{ background: NAVY }}>
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="rise flex flex-col gap-6 lg:col-span-7">
            <p className="max-w-[46ch] text-[0.95rem] italic leading-relaxed text-white/65">
              For the coach, consultant, or creator who has been meaning to post consistently for
              longer than they would like to admit.
            </p>
            <h1 className="font-display text-[clamp(2.1rem,4.6vw,3.4rem)] font-semibold leading-[1.12] tracking-[-0.025em] text-balance">
              Go From{" "}
              <em className="italic" style={{ color: "#e8a184" }}>
                &ldquo;I&rsquo;ll Be Consistent Someday&rdquo;
              </em>{" "}
              to{" "}
              <em className="italic" style={{ color: "#e8a184" }}>
                &ldquo;Here&rsquo;s This Week&rsquo;s Content&rdquo;
              </em>{" "}
              — Without the Blank Page.
            </h1>
            <p className="max-w-[58ch] text-[1.05rem] leading-[1.7] text-white/85">
              A guided system that studies what is already working in your niche, pulls out the
              hooks behind it, and drafts your carousels, reels, and posts in your own voice.
            </p>
            <p className="max-w-[54ch] text-[0.95rem] italic leading-relaxed text-white/60">
              Built for people who have plenty to say and never enough time to sit down and write
              it.
            </p>
            <Cta view={view} note />
          </div>

          {/* Stat card */}
          <div className="flex flex-col divide-y divide-white/12 overflow-hidden rounded-2xl lg:col-span-5"
               style={{ background: "rgba(255,255,255,0.06)" }}>
            {[
              ["What you get", "Carousels, reels + posts", "Drafted in your voice for Instagram and LinkedIn. Ready to edit and publish."],
              ["Time to start", "One afternoon", "Add a few competitors and your first drafts are waiting."],
              ["Investment", "$47 / month", "Seven days free. Cancel any time. No contract."],
              ["What you own", "100% yours", "Every draft is yours to edit, post, and keep."],
            ].map(([label, value, note]) => (
              <div key={label} className="flex flex-col gap-1.5 p-6">
                <span
                  className="text-[0.7rem] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: "#e8a184" }}
                >
                  {label}
                </span>
                <span className="font-display text-xl font-semibold leading-tight">{value}</span>
                <span className="text-sm leading-relaxed text-white/60">{note}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2 · STAT BAR. Figures set in tabular mono — these are measurements, so
          the face is doing a job rather than wearing a costume. */}
      <section className="border-b px-6 py-10 md:px-12" style={{ background: "#fff", borderColor: "#e8e4dd" }}>
        <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-8 md:grid-cols-4">
          {[
            ["2", "Instagram + LinkedIn"],
            ["3", "Carousels · reels · posts"],
            ["7 days", "Full trial, then $47/mo"],
            ["$47", "Cancel any time"],
          ].map(([fig, label]) => (
            <div key={label} className="flex flex-col items-center gap-1 text-center">
              <span
                className="text-[clamp(1.5rem,3vw,2.1rem)] font-semibold leading-none [font-family:ui-monospace,SFMono-Regular,Menlo,monospace] [font-variant-numeric:tabular-nums]"
                style={{ color: NAVY }}
              >
                {fig}
              </span>
              <span className="text-[0.78rem] leading-snug" style={{ color: BODY }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 3 · You already know */}
      <Band tone="white">
        <div className="flex flex-col items-center gap-7 text-center">
          <H2 className="max-w-[24ch]">
            You Already Know You Should Be Posting More Consistently.
          </H2>
          <P className="max-w-[60ch]">
            Here is what I hear from coaches, consultants, and creators every week.
          </P>
          <div className="flex flex-col items-center gap-3">
            {[
              "I know I should post, I just never know what to say.",
              "I open the app, stare at it, and close it again.",
              "I&rsquo;ve been meaning to be consistent for months.",
            ].map((q, i) => (
              <p
                key={i}
                className="rounded-full px-6 py-3 text-[0.95rem] italic"
                style={{ background: ROSE, color: NAVY }}
                dangerouslySetInnerHTML={{ __html: `&ldquo;${q}&rdquo;` }}
              />
            ))}
          </div>
          <P className="max-w-[62ch] font-medium">Sound familiar?</P>
          <P className="max-w-[64ch]">
            You are not lazy. You are not out of ideas. You are stuck because nobody gave you a
            repeatable way to turn what is already in your head — and what is already working in
            your niche — into posts.
          </P>
          <P className="max-w-[64ch]">
            Content is not something you invent from nothing every day. It is something you assemble
            from proven angles and your own thinking.
          </P>
          <P className="max-w-[64ch] font-medium">
            That is exactly what Content Engine was built to do.
          </P>
        </div>
      </Band>

      {/* 4 · Specifically for */}
      <Band tone="grey">
        <div className="flex flex-col items-center gap-6 text-center">
          <H2 className="max-w-[26ch]" style={{ color: NAVY }}>
            This Is Specifically For People Who Have Plenty to Say But Cannot Sit Down and Write It.
          </H2>
          <P className="max-w-[62ch]">
            You speak with clarity the moment someone asks about your work. You can explain your
            point of view in a two-minute voice note.
          </P>
          <P className="max-w-[62ch]">But the moment you open the app to post, the words do not come.</P>
          <P className="max-w-[62ch] font-medium" >
            That is not a discipline problem. It is a blank-page problem.
          </P>
          <P className="max-w-[62ch]">
            Content Engine works the way you already work. You start from posts that are already
            performing, not from nothing. You edit and approve, rather than write from scratch.
          </P>
          <P className="max-w-[62ch]">
            You do not need to become a writer to publish consistently.
          </P>
        </div>
      </Band>

      {/* 5 · Does not have to take hours */}
      <Band tone="grey" className="!pt-0">
        <div className="flex flex-col items-center gap-6 text-center">
          <H2 className="max-w-[26ch]" style={{ color: NAVY }}>
            Your Content Does Not Have to Take Hours Every Day. Or a Whole Weekend.
          </H2>
          <P className="max-w-[62ch]">
            Most creators believe staying consistent requires either a full day of batching or an
            agency on retainer. It does not.
          </P>
          <P className="max-w-[62ch]">
            That belief is the reason your best thinking stays in your notes app.
          </P>
          <div className="mt-2 flex w-full max-w-2xl flex-col gap-5 rounded-2xl p-7 text-left md:p-9" style={{ background: ROSE }}>
            <P>
              Content Engine studies the reels and carousels already performing in your niche, pulls
              out the hooks behind them, and drafts new posts in your voice. You set up your niche
              once. After that, you always start from a draft, not a blank page.
            </P>
            <p className="text-[1.02rem] font-semibold leading-relaxed" style={{ color: NAVY }}>
              The result: A week of carousels, reels, and posts in your own voice, ready to edit and
              publish. In an afternoon, not a weekend.
            </p>
          </div>
        </div>
      </Band>

      {/* 6 · Coffee */}
      <Band tone="white">
        <div className="flex flex-col items-center gap-6 text-center">
          <H2 className="max-w-[24ch]" style={{ color: NAVY }}>
            This Week&rsquo;s Content Could Be Drafted Before You Finish Your Coffee.
          </H2>
          <P className="max-w-[60ch]">Not next month. Not after you &ldquo;find the time.&rdquo; Today.</P>
          <P className="max-w-[62ch]">
            Content Engine does not ask you to be a writer. It asks you to add the accounts you
            already admire and answer a few questions about your own voice. From there, it does the
            research and the first draft.
          </P>
          <div className="w-full max-w-2xl text-left">
            <AccentLine>
              By the time you finish your second cup of coffee, this week&rsquo;s posts are drafted.
            </AccentLine>
          </div>
        </div>
      </Band>

      {/* 7 · Built by people who study */}
      <Band tone="grey">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-12">
          <div className="flex flex-col gap-5 md:col-span-7">
            <H2 style={{ color: NAVY }}>This Was Built By People Who Study What Actually Performs.</H2>
            <P>
              Content Engine was built by the team at Greater Inside. We spend our days on one
              question: why does one post travel and a nearly identical one does not.
            </P>
            <P>
              So the tool does what a good researcher does. It reads the top posts in your niche,
              transcribes the reels, breaks down the hook behind each one, and turns that into a
              starting point you can make your own.
            </P>
          </div>
          <div
            className="flex flex-col justify-center gap-4 rounded-2xl p-7 text-white md:col-span-5 md:p-8"
            style={{ background: PLUM }}
          >
            <p className="text-[1.02rem] leading-[1.7]">
              This is not a generic AI caption tool. It is a research-and-drafting system built on
              how content actually gets made — the hooks, the structures, and the angles that
              already work in your niche.
            </p>
          </div>
        </div>
      </Band>

      {/* 8 · What changes */}
      <Band tone="white">
        <div className="flex flex-col gap-10">
          <H2 className="text-center" style={{ color: NAVY }}>
            Here Is What Changes When You Post Consistently.
          </H2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[
              ["You become the name people think of in your space.", "When you show up every week with something worth reading, you stop being one option among many and become the obvious one."],
              ["You stop starting from zero every time.", "Your best hooks, angles, and posts are organised in one place — ready to reuse, repurpose, and build on."],
              ["Your ideas turn into a body of work.", "The thinking currently living in your head becomes a searchable library of content that is documented, structured, and yours."],
            ].map(([title, body], i) => (
              <div key={i} className="flex flex-col gap-4 rounded-2xl p-7" style={{ background: ROSE }}>
                <span
                  className="grid size-9 place-items-center rounded-lg text-white"
                  style={{ background: PLUM }}
                  aria-hidden
                >
                  <svg viewBox="0 0 20 20" className="size-4 fill-current">
                    <path d="M8 15.6 3.4 11l1.6-1.6L8 12.4l7-7L16.6 7 8 15.6Z" />
                  </svg>
                </span>
                <span className="font-display font-semibold leading-snug" style={{ color: NAVY }}>
                  {title}
                </span>
                <span className="text-[0.95rem] leading-relaxed" style={{ color: BODY }}>
                  {body}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Band>

      {/* 9 · Calling card */}
      <Band tone="grey">
        <div className="flex flex-col items-center gap-6 text-center">
          <H2 className="max-w-[26ch]" style={{ color: NAVY }}>
            In a Feed Where Attention Is Scarce, Consistency Is Your Best Calling Card.
          </H2>
          <P className="max-w-[62ch]">
            Think about the last time someone reached out ready to work with you. They had usually
            read something of yours first. They already knew how you think before the first message.
          </P>
          <P className="max-w-[62ch]">
            That does not happen from posting once a month. It happens from showing up with a clear
            point of view, week after week, in a way people can follow.
          </P>
          <P className="max-w-[62ch]">
            When your content does that job, the conversations change. Fewer cold pitches. More
            people who arrive already convinced.
          </P>
          <div
            className="mt-2 flex w-full max-w-2xl flex-col gap-3 rounded-2xl p-7 text-left text-white md:p-9"
            style={{ background: NAVY }}
          >
            <p className="text-[1.02rem] leading-[1.7] text-white/85">
              More reach. Warmer leads. A pipeline of people who knew your thinking before they ever
              reached out.
            </p>
            <p className="text-[1.05rem] font-semibold leading-relaxed">
              Content is not a vanity metric. It is a business development asset.
            </p>
          </div>
        </div>
      </Band>

      {/* 12 · What this means for you + CTA. The founder story above it in the
          source is a [PLACEHOLDER]; only the factual box ships. */}
      <Band tone="rose">
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-12">
          <div className="flex flex-col gap-5 md:col-span-6">
            <H2 style={{ color: NAVY }}>Here Is What Consistent Content Actually Builds.</H2>
            <P>
              You do not need an agency on retainer or a full day every week to get there. You need
              $47 a month and an afternoon to start.
            </P>
            <P>
              The process — the research, the hooks, the drafting in your voice — is the part
              Content Engine handles. It is available to you now.
            </P>
            <Cta view={view} />
          </div>
          <div
            className="flex flex-col divide-y divide-white/12 overflow-hidden rounded-2xl text-white md:col-span-6"
            style={{ background: NAVY }}
          >
            <div className="p-7">
              <p className="font-display text-lg font-semibold">What This Means For You</p>
            </div>
            {[
              ["Time to start", "An afternoon", "Not a weekend. Not a hire."],
              ["Investment", "$47 / month", "Seven days free. Cancel any time."],
            ].map(([label, value, note]) => (
              <div key={label} className="flex flex-col gap-1 p-7">
                <span
                  className="text-[0.7rem] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: "#e8a184" }}
                >
                  {label}
                </span>
                <span className="font-display text-xl font-semibold">{value}</span>
                <span className="text-sm text-white/60">{note}</span>
              </div>
            ))}
          </div>
        </div>
      </Band>

      {/* 13 · What it is */}
      <Band tone="white">
        <div className="flex flex-col items-center gap-6 text-center">
          <span
            className="rounded-full px-5 py-2.5 text-[0.9rem] font-medium text-white"
            style={{ background: NAVY }}
          >
            The system that turns what&rsquo;s working in your niche into content in your voice.
          </span>
          <H2 style={{ color: NAVY }}>
            CONTENT ENGINE <span className="font-normal">by Greater Inside</span>
          </H2>
          <P className="max-w-[64ch]">
            Content Engine is a research-and-drafting system built for coaches, consultants, and
            creators. It studies the top posts in your niche, extracts the hooks behind them, and
            drafts carousels, reels, and posts in your voice — then gives you one place to plan and
            publish them.
          </P>
          <P className="max-w-[64ch]">
            This is not for everyone. It is built for people with real expertise who want to publish
            consistently and sound like themselves. If you want a tool that auto-posts generic
            captions with no editing and no point of view, this is not it.
          </P>
          <P className="max-w-[64ch] font-medium">
            If you have plenty to say, a niche you know well, and no reliable way to turn that into
            weekly content — you are in exactly the right place.
          </P>
        </div>
      </Band>

      {/* 14 · Comparison */}
      <Band tone="grey">
        <div className="flex flex-col gap-10">
          <H2 className="text-center" style={{ color: NAVY }}>
            Let&rsquo;s Talk About What Staying Consistent Actually Costs.
          </H2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Content agency", price: "$2,000–$5,000", per: "per month, ongoing", note: "Someone else's read on your voice. A retainer that does not stop." },
              { label: "In-house hire", price: "A salary", per: "full-time", note: "Months to ramp, a salary to carry, still your voice to teach." },
              { label: "Content Engine", price: "$47", per: "per month", note: "Research + drafts in your voice. Seven days free. Cancel any time.", best: true },
              { label: "Doing it yourself", price: "Your time", per: "hours each week", note: "The blank page, every week, with no research to start from." },
            ].map((c) => (
              <div
                key={c.label}
                className={`relative flex flex-col gap-3 rounded-2xl p-6 ${c.best ? "text-white" : "bg-white"}`}
                style={c.best ? { background: PLUM } : { border: "1px solid #e8e4dd" }}
              >
                {c.best && (
                  <span
                    className="absolute -top-3 left-6 rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white"
                    style={{ background: "#b0532f" }}
                  >
                    Best value
                  </span>
                )}
                <span
                  className="text-[0.72rem] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: c.best ? "rgba(255,255,255,0.75)" : PLUM }}
                >
                  {c.label}
                </span>
                <span className="font-display text-[1.7rem] font-semibold leading-none tracking-[-0.02em]">
                  {c.price}
                </span>
                <span className={`text-sm ${c.best ? "text-white/70" : ""}`} style={c.best ? undefined : { color: BODY }}>
                  {c.per}
                </span>
                <span
                  className={`mt-1 border-t pt-4 text-[0.9rem] leading-relaxed ${c.best ? "border-white/20 text-white/85" : ""}`}
                  style={c.best ? undefined : { borderColor: "#e8e4dd", color: BODY }}
                >
                  {c.note}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Band>

      {/* 17 · Pricing card */}
      <Band tone="white">
        <div className="flex flex-col items-center gap-6 text-center">
          <H2 className="max-w-[28ch]" style={{ color: NAVY }}>
            Every Week You Wait Is a Week Someone Else Builds the Audience You Should Have.
          </H2>
          <P className="max-w-[62ch]">
            The creator with the audience is not always the most talented in the room. They are the
            one who kept showing up.
          </P>
          <P className="max-w-[62ch]">
            You have the expertise. You have the ideas. The only thing missing has been a way to
            turn them into posts without losing an afternoon to the blank page.
          </P>
          <p className="font-display text-[1.35rem] font-semibold" style={{ color: NAVY }}>
            Your Next Week of Content Is an Afternoon Away.
          </p>

          <div
            className="mt-2 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-8"
            style={{ border: "1px solid #e8e4dd", boxShadow: "0 24px 60px -40px rgba(17,50,91,0.45)" }}
          >
            <span className="font-display text-lg font-semibold" style={{ color: NAVY }}>
              Content Engine
            </span>
            <span className="font-display text-[3.25rem] font-semibold leading-none tracking-[-0.03em]" style={{ color: NAVY }}>
              $47
            </span>
            <span className="text-sm" style={{ color: BODY }}>
              per month · 7 days free · cancel any time
            </span>
            <span className="text-sm" style={{ color: BODY }}>
              Carousels, reels + posts · in your voice
            </span>
            <div className="w-full pt-2">
              <OtoActions
                view={view}
                showNote
                buttonClassName={`${CTA_PILL} w-full justify-center`}
              />
            </div>
          </div>
        </div>
      </Band>

      {/* 18 · If you close this page */}
      <Band tone="grey">
        <div className="flex flex-col items-center gap-6 text-center">
          <H2 className="max-w-[28ch]" style={{ color: NAVY }}>
            What Happens If You Close This Page and Come Back to It &ldquo;Later&rdquo;?
          </H2>
          <P className="max-w-[62ch]">You already know the answer.</P>
          <P className="max-w-[62ch]">
            Later becomes next week. Next week becomes next month. And a year from now, you are
            still meaning to be consistent, while someone with the same expertise — and less of it —
            has become the name your audience follows.
          </P>
          <P className="max-w-[62ch]">
            Not because they were better. Because they kept publishing and you did not.
          </P>
          <P className="max-w-[62ch]">
            The gap between the creators people follow and the ones they do not is rarely talent. It
            is almost always the decision to start, and to keep going. This is the simplest way to
            make that decision easy.
          </P>
        </div>
      </Band>

      {/* 19 · Everything, one more time */}
      <Band tone="white">
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-12">
          <div className="flex flex-col gap-5 md:col-span-7">
            <H2 style={{ color: NAVY }}>Here Is Everything, One More Time.</H2>
            <P>
              For $47 a month, with the first seven days free, you get a system that studies what is
              working in your niche, drafts carousels, reels, and posts in your own voice, and gives
              you one place to plan and publish them.
            </P>
            <P>
              Set up your niche once. After that, you start every week from a draft, not a blank
              page.
            </P>
            <P className="font-medium">No agency. No blank page. No guessing what to post.</P>
            <p className="font-display text-[1.3rem] font-semibold" style={{ color: NAVY }}>
              Just your content. Ready.
            </p>
            <Cta view={view} />
          </div>
          <div className="md:col-span-5">
            <div
              className="flex flex-col gap-4 rounded-2xl p-7"
              style={{ background: ROSE }}
            >
              {[
                "The research done for you",
                "Drafted in your own voice",
                "One place to plan the week",
                "Seven days free, then $47/month",
              ].map((line) => (
                <div key={line} className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white" style={{ background: PLUM }} aria-hidden>
                    <svg viewBox="0 0 20 20" className="size-3 fill-current">
                      <path d="M8 15.6 3.4 11l1.6-1.6L8 12.4l7-7L16.6 7 8 15.6Z" />
                    </svg>
                  </span>
                  <span className="text-[0.95rem] leading-relaxed" style={{ color: NAVY }}>
                    {line}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Band>

      {/* 20 · FAQ — two columns, open, not accordions. */}
      <Band tone="grey">
        <div className="flex flex-col gap-10">
          <H2 className="text-center" style={{ color: NAVY }}>
            Everything You Want to Know Before You Start.
          </H2>
          <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
            {[
              ["Will I be charged today?", "No. The first seven days are free. The first $47 is taken only if you keep it past then."],
              ["How do I cancel?", "From your account settings, at any time. Cancel before day seven and you are not charged."],
              ["Who owns what I create?", "You do. Every draft is yours to edit, post, and keep."],
              ["Do I have to connect my Instagram?", "No. You can add competitor accounts and start from there. Connecting your own is optional and lets it learn your voice and track your results."],
              ["Does it post for me?", "No. It researches, drafts, and helps you plan. You review and post yourself, so nothing goes out that is not yours."],
              ["Will it sound like me?", "It can learn your style from your own posts and draft in it. You always edit before anything is published."],
              ["How long until I get my first drafts?", "An afternoon. Add a few accounts in your niche and your first hooks and drafts are ready to work from."],
              ["What platforms and formats does it cover?", "Instagram and LinkedIn — carousels, reels, and posts."],
            ].map(([q, a]) => (
              <div key={q} className="flex flex-col gap-2 border-t pt-6" style={{ borderColor: "#e0dcd4" }}>
                <p className="font-semibold leading-snug" style={{ color: NAVY }}>
                  {q}
                </p>
                <p className="text-[0.95rem] leading-[1.7]" style={{ color: BODY }}>
                  {a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Band>

      {/* 21 · FINAL CTA */}
      <section className="px-6 py-16 text-white md:px-12 md:py-24" style={{ background: NAVY }}>
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-12 md:grid-cols-12 md:gap-16">
          <div className="flex flex-col gap-5 md:col-span-6">
            <h2 className="font-display text-[clamp(1.8rem,4vw,2.8rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-balance">
              One Login. One Afternoon. A Week of Content.
            </h2>
            <p className="text-[1.02rem] leading-[1.75] text-white/80">
              You have been meaning to be consistent for a while. Maybe a long while.
            </p>
            <p className="text-[1.02rem] leading-[1.75] text-white/80">
              The ideas are there. The expertise is there. The audience is there.
            </p>
            <p className="text-[1.05rem] font-medium leading-relaxed">
              The only thing missing has been the system.
            </p>
          </div>

          <div className="flex flex-col gap-6 md:col-span-6">
            <ul className="flex flex-col gap-4">
              {[
                ["The research done for you", "the top posts in your niche, and the hooks behind them"],
                ["Carousels, reels, and posts", "drafted in your own voice"],
                ["One place to plan the week", "and move each piece from draft to posted"],
                ["Seven days free", "then $47 a month, cancel any time"],
              ].map(([lead, rest]) => (
                <li key={lead} className="flex items-start gap-3">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full" style={{ background: "#b0532f" }} aria-hidden>
                    <svg viewBox="0 0 20 20" className="size-3 fill-white">
                      <path d="M8 15.6 3.4 11l1.6-1.6L8 12.4l7-7L16.6 7 8 15.6Z" />
                    </svg>
                  </span>
                  <span className="text-[0.98rem] leading-relaxed text-white/85">
                    <strong className="font-semibold text-white">{lead}</strong> — {rest}
                  </span>
                </li>
              ))}
            </ul>
            <Cta view={view} note />
          </div>
        </div>
      </section>
    </div>
  );
}
