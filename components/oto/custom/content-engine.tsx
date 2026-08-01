import { OtoActions, type OtoView } from "@/components/oto/shell";
import { OtoStickyBar } from "@/components/oto/sticky-bar";

// Content Engine — bespoke upsell page.
//
// Built to the client-approved artifact: its section order, background
// alternation, callout treatments and copy, verbatim. Where this departs from
// that artifact it is for one of two reasons, both noted at the point of
// departure: a placeholder block that must not reach a buyer, or the upsell
// mechanics (one-click accept, decline, expiry) that a static mockup has no
// way to express.
//
// Palette is the client's: navy #11325B, terracotta #C8653D, plum #832A63,
// rose #f7e9ee, cream #FAFAF8, grey #f1f1ef. Terracotta is the CTA and the one
// accent per section, never decoration. Plum is emphasis only.
//
// Buttons fill with #b1552f rather than #C8653D. White on the brand terracotta
// is 3.90:1, under AA for a 16px label; this is 5.06:1 and visually identical.
// #C8653D stays for large accent text where 3:1 is the bar.

const NAVY = "#11325B";
const NAVY_2 = "#1a4179";
const TERRA = "#C8653D";
const PLUM = "#832A63";
const ROSE = "#f7e9ee";
const ROSE_2 = "#f2dde5";
const ROSE_LINE = "#e6c9d6";
const CREAM = "#FAFAF8";
const GREY = "#f1f1ef";
const INK = "#20202c";
const MUTED = "#5c5c6b";
const LINE = "#e6e6e2";

const BTN =
  "inline-flex items-center justify-center rounded-lg bg-[#b1552f] px-8 py-4 font-display text-[1rem] font-semibold text-white transition-colors duration-150 hover:bg-[#9c4728]";

function Section({
  children,
  bg = "#ffffff",
  className = "",
}: {
  children: React.ReactNode;
  bg?: string;
  className?: string;
}) {
  return (
    <section className={`px-6 py-14 md:py-[72px] ${className}`} style={{ background: bg }}>
      <div className="mx-auto w-full max-w-[1080px]">{children}</div>
    </section>
  );
}

function HSec({ children, className = "", left = false }: { children: React.ReactNode; className?: string; left?: boolean }) {
  return (
    <h2
      className={`font-display text-[clamp(1.6rem,3.6vw,2.375rem)] font-semibold leading-[1.15] tracking-[-0.01em] text-balance ${
        left ? "" : "mx-auto max-w-[820px] text-center"
      } ${className}`}
      style={{ color: INK }}
    >
      {children}
    </h2>
  );
}

function Narrow({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`mx-auto max-w-[680px] ${center ? "text-center" : ""}`} style={{ color: "#3a3a48" }}>
      {children}
    </div>
  );
}

function Para({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`mb-4 leading-[1.6] text-pretty ${className}`}>{children}</p>;
}

/**
 * A marked placeholder, shown in the admin preview only.
 *
 * The artifact ships these so the whole structure is visible while the copy is
 * still being written. On the live page they return null: a buyer who has just
 * paid must never see "[Placeholder]".
 */
function Placeholder({ view, children }: { view: OtoView; children: React.ReactNode }) {
  if (!view.preview) return null;
  return (
    <div
      className="mx-auto my-5 max-w-[820px] rounded-xl border-[1.5px] border-dashed px-5 py-5 text-sm italic"
      style={{ borderColor: ROSE_LINE, background: "#fbf4f7", color: "#8a5a72" }}
    >
      <span
        className="mb-1 block text-[0.72rem] font-semibold not-italic uppercase tracking-[0.04em]"
        style={{ color: PLUM }}
      >
        Placeholder — preview only, never shown to a buyer
      </span>
      {children}
    </div>
  );
}

/** Gradient panel where an image will go. */
function ImgBox({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-[300px] items-center justify-center rounded-xl px-6 text-center text-sm"
      style={{ background: `linear-gradient(135deg, ${NAVY}, ${PLUM})`, color: "#dfe6f2" }}
    >
      {label}
    </div>
  );
}

function Cta({ view, block = false }: { view: OtoView; block?: boolean }) {
  return (
    <OtoActions
      view={view}
      align={block ? "stretch" : "start"}
      showNote={false}
      buttonClassName={block ? `${BTN} w-full` : BTN}
      className="pt-2"
    />
  );
}

export function ContentEngineOto({ view }: { view: OtoView }) {
  const { offer } = view;

  return (
    // Bottom padding clears the sticky bar so the footer is never hidden by it.
    <div className="pb-28" style={{ color: INK }}>
      {/* 1 · HERO */}
      <header className="px-6 pb-16 pt-7" style={{ background: NAVY }}>
        <div className="mx-auto w-full max-w-[1080px]">
          <div className="mb-11 flex items-center gap-2.5 font-display text-[1.19rem] font-bold text-white">
            <span className="inline-block size-4 rounded-full" style={{ background: TERRA }} />
            <span className="leading-none">
              greater
              <span className="mt-0.5 block text-[0.69rem] font-medium uppercase leading-none tracking-[0.14em] text-[#b9c6da]">
                inside
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 items-start gap-11 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rise">
              {/* Honest scarcity: the token behind this page is single-use with
                  a 15-minute TTL, so this really is the only time it appears.
                  It deliberately does NOT claim the product is unavailable
                  elsewhere — Content Engine is also a checkout bump and stands
                  in the library, so "last chance to get it" would be false. */}
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 px-3.5 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-white">
                <span className="inline-block size-1.5 rounded-full" style={{ background: TERRA }} />
                One-time offer · this page is not shown again
              </span>
              <p className="mb-4 max-w-[520px] text-sm italic text-[#a9bad4]">
                For the coach, consultant, or creator who has been meaning to post consistently for
                longer than they would like to admit.
              </p>
              <h1 className="mb-5 max-w-[640px] font-display text-[clamp(1.9rem,4.4vw,3.125rem)] font-semibold leading-[1.15] tracking-[-0.01em] text-white">
                Go From{" "}
                <span className="italic underline decoration-white/30 underline-offset-[5px]">
                  &ldquo;I&rsquo;ll Be Consistent Someday&rdquo;
                </span>{" "}
                to{" "}
                <span className="italic underline decoration-white/30 underline-offset-[5px]">
                  &ldquo;Here&rsquo;s This Week&rsquo;s Content&rdquo;
                </span>{" "}
                — Without the Blank Page.
              </h1>
              <p className="mb-3.5 max-w-[560px] text-[1.125rem] leading-relaxed text-[#d7e0ee]">
                A guided system that studies what is already working in your niche, pulls out the
                hooks behind it, and drafts your carousels, reels, and posts in your own voice.
              </p>
              <p className="mb-7 max-w-[540px] text-[0.94rem] text-[#a9bad4]">
                Built for people who have plenty to say and never enough time to sit down and write
                it.
              </p>
              <Cta view={view} />
            </div>

            <div
              className="rounded-2xl border px-5"
              style={{ background: NAVY_2, borderColor: "rgba(255,255,255,0.10)" }}
            >
              {[
                ["What you get", "Carousels, reels + posts", "Drafted in your voice for Instagram and LinkedIn. Ready to edit and publish."],
                ["Time to start", "One afternoon", "Add a few competitors and your first drafts are waiting."],
                ["Investment", "$47 / month", "Seven days free. Cancel any time. No contract."],
                ["What you own", "100% yours", "Every draft is yours to edit, post, and keep."],
              ].map(([k, v, d], i, arr) => (
                <div
                  key={k}
                  className="py-5"
                  style={{ borderBottom: i === arr.length - 1 ? "none" : "1px solid rgba(255,255,255,0.10)" }}
                >
                  <div className="mb-1.5 text-[0.69rem] uppercase tracking-[0.13em] text-[#8fa6c6]">{k}</div>
                  <div className="mb-1 font-display text-2xl font-bold text-white">{v}</div>
                  <div className="text-[0.84rem] leading-[1.5] text-[#c2cee0]">{d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* 2 · STAT BAR */}
      <div className="px-6 py-7" style={{ background: CREAM, borderBottom: `1px solid ${LINE}` }}>
        <div className="mx-auto flex w-full max-w-[1080px] flex-wrap justify-between gap-5 text-center">
          {[
            ["2", "Platforms — IG + LinkedIn"],
            ["3", "Formats — carousels, reels, posts"],
            ["7 days", "Free trial"],
            ["$47/mo", "Cancel any time"],
          ].map(([fig, lab]) => (
            <div key={lab} className="min-w-[130px] flex-1">
              <div className="font-display text-[1.625rem] font-bold" style={{ color: NAVY }}>
                {fig}
              </div>
              <div className="mt-1 text-[0.78rem]" style={{ color: MUTED }}>
                {lab}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3 · Problem */}
      <Section>
        <HSec className="mb-7">You Already Know You Should Be Posting More Consistently.</HSec>
        <p className="mx-auto mb-6 max-w-[680px] text-center" style={{ color: MUTED }}>
          Here is what I hear from coaches, consultants, and creators every week.
        </p>
        <div className="mx-auto mb-7 max-w-[620px]">
          {[
            "I know I should post, I just never know what to say.",
            "I open the app, stare at it, and close it again.",
            "I’ve been meaning to be consistent for months.",
          ].map((q) => (
            <span
              key={q}
              className="mx-auto my-2.5 block max-w-[560px] rounded-[30px] border px-5 py-2.5 text-center text-[0.94rem]"
              style={{ background: ROSE, borderColor: ROSE_LINE, color: "#6b3a52" }}
            >
              &ldquo;{q}&rdquo;
            </span>
          ))}
        </div>
        <Narrow center>
          <Para className="font-semibold">Sound familiar?</Para>
          <Para>
            You are not lazy. You are not out of ideas. You are stuck because nobody gave you a
            repeatable way to turn what is already in your head — and what is already working in
            your niche — into posts.
          </Para>
          <Para>
            Content is not something you invent from nothing every day. It is something you assemble
            from proven angles and your own thinking.
          </Para>
          <Para className="!mb-0">That is exactly what Content Engine was built to do.</Para>
        </Narrow>
      </Section>

      {/* 4 */}
      <Section bg={GREY}>
        <HSec className="mb-7">
          This Is Specifically For People Who Have Plenty to Say But Cannot Sit Down and Write It.
        </HSec>
        <Narrow>
          <Para>
            You speak with clarity the moment someone asks about your work. You can explain your
            point of view in a two-minute voice note.
          </Para>
          <Para>But the moment you open the app to post, the words do not come.</Para>
          <Para>That is not a discipline problem. It is a blank-page problem.</Para>
          <Para>
            Content Engine works the way you already work. You start from posts that are already
            performing, not from nothing. You edit and approve, rather than write from scratch.
          </Para>
          <Para className="!mb-0">You do not need to become a writer to publish consistently.</Para>
        </Narrow>
      </Section>

      {/* 5 */}
      <Section>
        <HSec className="mb-7">
          Your Content Does Not Have to Take Hours Every Day. Or a Whole Weekend.
        </HSec>
        <Narrow center>
          <Para>
            Most creators believe staying consistent requires either a full day of batching or an
            agency on retainer. It does not.
          </Para>
          <Para>That belief is the reason your best thinking stays in your notes app.</Para>
        </Narrow>
        <div
          className="mx-auto my-7 max-w-[760px] rounded-xl border px-7 py-7"
          style={{ background: ROSE, borderColor: ROSE_LINE, color: "#3a2c34" }}
        >
          <p className="leading-[1.6]">
            Content Engine studies the reels and carousels already performing in your niche, pulls
            out the hooks behind them, and drafts new posts in your voice. You set up your niche
            once. After that, you always start from a draft, not a blank page.
          </p>
        </div>
        {/* The approved artifact uses a 4px terracotta left rule here. Kept
            because the brief specifies it, not reached for by habit. */}
        <div
          className="mx-auto max-w-[760px] rounded-lg px-5 py-4"
          style={{ background: ROSE_2, borderLeft: `4px solid ${TERRA}` }}
        >
          <p>
            <b style={{ color: NAVY }}>The result:</b> A week of carousels, reels, and posts in your
            own voice, ready to edit and publish. In an afternoon, not a weekend.
          </p>
        </div>
      </Section>

      {/* 6 */}
      <Section bg={CREAM}>
        <HSec className="mb-7">
          This Week&rsquo;s Content Could Be Drafted Before You Finish Your Coffee.
        </HSec>
        <Narrow center>
          <Para>Not next month. Not after you &ldquo;find the time.&rdquo; Today.</Para>
          <Para>
            Content Engine does not ask you to be a writer. It asks you to add the accounts you
            already admire and answer a few questions about your own voice. From there, it does the
            research and the first draft.
          </Para>
        </Narrow>
        <p
          className="mx-auto mt-6 max-w-[640px] text-center font-display text-xl font-semibold italic"
          style={{ color: TERRA }}
        >
          By the time you finish your second cup of coffee, this week&rsquo;s posts are drafted.
        </p>
      </Section>

      {/* 7 */}
      <Section>
        <div className="mx-auto grid max-w-[960px] grid-cols-1 items-center gap-11 md:grid-cols-2">
          <div>
            <HSec left className="mb-5">
              This Was Built By People Who Study What Actually Performs.
            </HSec>
            <div style={{ color: "#3a3a48" }}>
              <Para>
                Content Engine was built by the team at Greater Inside. We spend our days on one
                question: why does one post travel and a nearly identical one does not.
              </Para>
              <Para>
                So the tool does what a good researcher does. It reads the top posts in your niche,
                transcribes the reels, breaks down the hook behind each one, and turns that into a
                starting point you can make your own.
              </Para>
            </div>
            <Placeholder view={view}>
              One or two sentences of real, verifiable credibility — volume of content analysed, who
              built it, a track record you can stand behind.
            </Placeholder>
          </div>
          <ImgBox label="[ Image / product screenshot ]" />
        </div>
        <div className="mx-auto mt-8 max-w-[760px] rounded-xl px-7 py-7 text-white" style={{ background: PLUM }}>
          <p className="leading-[1.6]">
            This is not a generic AI caption tool. It is a research-and-drafting system built on how
            content actually gets made — the hooks, the structures, and the angles that already work
            in your niche.
          </p>
        </div>
      </Section>

      {/* 8 */}
      <Section bg={GREY}>
        <HSec className="mb-9">Here Is What Changes When You Post Consistently.</HSec>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {[
            ["You become the name people think of in your space.", "When you show up every week with something worth reading, you stop being one option among many and become the obvious one."],
            ["You stop starting from zero every time.", "Your best hooks, angles, and posts are organised in one place — ready to reuse, repurpose, and build on."],
            ["Your ideas turn into a body of work.", "The thinking currently living in your head becomes a searchable library of content that is documented, structured, and yours."],
          ].map(([h, b]) => (
            <div
              key={h}
              className="rounded-xl border p-6"
              style={{ background: ROSE, borderColor: ROSE_LINE }}
            >
              <div
                className="mb-4 flex size-[38px] items-center justify-center rounded-[9px] text-white"
                style={{ background: PLUM }}
                aria-hidden
              >
                <svg viewBox="0 0 20 20" className="size-4 fill-current">
                  <path d="M10 2.5 12.4 7.6 18 8.4l-4 3.9.9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-3.9 5.6-.8L10 2.5Z" />
                </svg>
              </div>
              <h3 className="mb-2.5 font-display text-[1.19rem] font-semibold leading-snug" style={{ color: NAVY }}>
                {h}
              </h3>
              <p className="text-[0.94rem]" style={{ color: "#4a3a44" }}>
                {b}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* 9 */}
      <Section>
        <HSec className="mb-7">
          In a Feed Where Attention Is Scarce, Consistency Is Your Best Calling Card.
        </HSec>
        <Narrow center>
          <Para>
            Think about the last time someone reached out ready to work with you. They had usually
            read something of yours first. They already knew how you think before the first message.
          </Para>
          <Para>
            That does not happen from posting once a month. It happens from showing up with a clear
            point of view, week after week, in a way people can follow.
          </Para>
          <Para>
            When your content does that job, the conversations change. Fewer cold pitches. More
            people who arrive already convinced.
          </Para>
        </Narrow>
        <div
          className="mx-auto mt-7 max-w-[760px] rounded-xl px-7 py-7 text-center text-white"
          style={{ background: NAVY }}
        >
          <p className="mb-4 leading-[1.6]">
            More reach. Warmer leads. A pipeline of people who knew your thinking before they ever
            reached out.
          </p>
          <p className="font-semibold leading-[1.6]">
            Content is not a vanity metric. It is a business development asset.
          </p>
        </div>
      </Section>

      {/* 10 · Testimonials — preview only until real quotes exist. */}
      {view.preview && (
        <Section bg={PLUM} className="text-white">
          <HSec className="mb-7 !text-white">Real Results From Real Creators.</HSec>
          <div
            className="mx-auto max-w-[760px] rounded-xl border-[1.5px] border-dashed px-5 py-5 text-sm italic"
            style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.25)", color: "#f0dde8" }}
          >
            <span className="mb-1 block text-[0.72rem] font-semibold not-italic uppercase tracking-[0.04em] text-[#f3d7e6]">
              Placeholder — preview only, never shown to a buyer
            </span>
            Three to five real customer quotes. Each: the quote, the person&rsquo;s name, and their
            role. Only quotes you have permission to publish — never invented names or results.
          </div>
        </Section>
      )}

      {/* 11 · Strategy + roster */}
      <Section bg={CREAM}>
        <HSec className="mb-6">This Strategy Is as Old as the Feed Itself.</HSec>
        <p className="mx-auto mb-6 max-w-[680px] text-center" style={{ color: MUTED }}>
          The creators who own their categories all did the same thing first: they published
          consistently, in their own voice, before anyone was watching.
        </p>
        <Narrow center>
          <Para className="!mb-0">
            Using content to build an audience and a business is not new. It is a strategy that has
            produced results for as long as there have been platforms to publish on. The tools
            changed. The principle did not.
          </Para>
        </Narrow>
        <Placeholder view={view}>
          A roster of well-known creators, each with a key format or channel and one factual
          sentence about how consistent publishing built their audience. Publicly verifiable claims
          only. This proves the strategy works — it does not claim any of them use Content Engine.
        </Placeholder>
      </Section>

      {/* 12 */}
      <Section bg={ROSE}>
        <HSec className="mb-8">Here Is What Consistent Content Actually Builds.</HSec>
        <div className="mx-auto grid max-w-[960px] grid-cols-1 items-start gap-11 md:grid-cols-2">
          <Placeholder view={view}>
            A real, specific story — yours or a named creator&rsquo;s, with permission — of how
            consistent content built an audience or a business, with numbers you can stand behind.
          </Placeholder>
          <div className="rounded-xl px-7 py-7 text-white" style={{ background: NAVY }}>
            <p className="mb-4 leading-[1.6] text-[#dfe7f4]">
              You do not need an agency on retainer or a full day every week to get there. You need
              $47 a month and an afternoon to start.
            </p>
            <p className="mb-2 leading-[1.6] text-[#dfe7f4]">
              The research, the hooks, the drafting in your voice — that is the part Content Engine
              handles. It is available to you now.
            </p>
            <div className="mt-2 pt-3.5" style={{ borderTop: "1px solid rgba(255,255,255,.12)" }}>
              {[
                ["Time to start", "An afternoon"],
                ["Investment", "$47 / month · 7 days free"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 text-sm text-[#c8d3e6]">
                  <span>{k}</span>
                  <b className="text-white">{v}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-9 flex justify-center">
          <Cta view={view} />
        </div>
      </Section>

      {/* 13 */}
      <Section>
        <div className="text-center">
          <div
            className="mb-5 inline-flex items-center gap-2 rounded-[30px] px-4.5 py-2.5 font-display text-[0.84rem] text-white"
            style={{ background: NAVY }}
          >
            The system that turns what&rsquo;s working in your niche into content in your voice.
          </div>
          <HSec className="mb-7">CONTENT ENGINE — by Greater Inside</HSec>
        </div>
        <Narrow>
          <Para>
            Content Engine is a research-and-drafting system built for coaches, consultants, and
            creators. It studies the top posts in your niche, extracts the hooks behind them, and
            drafts carousels, reels, and posts in your voice — then gives you one place to plan and
            publish them.
          </Para>
          <Para>
            This is not for everyone. It is built for people with real expertise who want to publish
            consistently and sound like themselves. If you want a tool that auto-posts generic
            captions with no editing and no point of view, this is not it.
          </Para>
          <Para className="!mb-0">
            If you have plenty to say, a niche you know well, and no reliable way to turn that into
            weekly content — you are in exactly the right place.
          </Para>
        </Narrow>
      </Section>

      {/* 14 · Comparison */}
      <Section bg={GREY}>
        <HSec className="mb-9">Let&rsquo;s Talk About What Staying Consistent Actually Costs.</HSec>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { tag: "Content agency", price: "$2,000–$5,000", time: "per month · ongoing", p: "Someone else's read on your voice. A retainer that does not stop." },
            { tag: "In-house hire", price: "A salary", time: "full-time", p: "Months to ramp, a salary to carry, still your voice to teach." },
            { tag: "Content Engine", price: "$47", time: "per month · an afternoon to start", p: "Research + drafts in your voice. Seven days free. Cancel any time.", best: true },
            { tag: "Doing it yourself", price: "Your time", time: "hours each week", p: "The blank page, every week, with no research to start from." },
          ].map((c) => (
            <div
              key={c.tag}
              className="relative rounded-xl border px-5 py-6"
              style={c.best ? { background: PLUM, borderColor: PLUM } : { background: "#fff", borderColor: LINE }}
            >
              {c.best && (
                <span
                  className="absolute -top-[11px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[20px] px-3 py-1 font-display text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-white"
                  style={{ background: TERRA }}
                >
                  Best value
                </span>
              )}
              <div
                className="mb-3 text-[0.69rem] uppercase tracking-[0.1em]"
                style={{ color: c.best ? "#e7c9dc" : MUTED }}
              >
                {c.tag}
              </div>
              <div
                className="mb-0.5 font-display text-2xl font-bold"
                style={{ color: c.best ? "#fff" : NAVY }}
              >
                {c.price}
              </div>
              <div className="mb-3.5 text-[0.81rem]" style={{ color: c.best ? "#e7c9dc" : MUTED }}>
                {c.time}
              </div>
              <p className="text-[0.84rem]" style={{ color: c.best ? "#fff" : "#4a4a58" }}>
                {c.p}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* 15 / 16 · Bonuses — preview only until they are real. */}
      {view.preview && (
        <Section>
          <div
            className="mx-auto mb-5 max-w-[900px] rounded-xl border p-7"
            style={{ background: ROSE, borderColor: ROSE_LINE }}
          >
            <div className="mb-2 text-[0.75rem] font-semibold uppercase tracking-[0.12em]" style={{ color: PLUM }}>
              Bonus 1
            </div>
            <h3 className="mb-3.5 font-display text-[1.375rem] font-semibold">[ Real bonus — title ]</h3>
            <Placeholder view={view}>
              Include only a bonus you will actually deliver — a live onboarding walkthrough, a
              starter template pack, a niche set-up session. Give the format and what they get.
              Remove this block if there is no genuine bonus.
            </Placeholder>
          </div>
          <div className="mx-auto max-w-[900px] rounded-xl p-7 text-white" style={{ background: PLUM }}>
            <div className="mb-2 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-[#e7c9dc]">
              Bonus 2
            </div>
            <h3 className="mb-3.5 font-display text-[1.375rem] font-semibold">[ Real bonus — title ]</h3>
            <div
              className="rounded-xl border-[1.5px] border-dashed px-5 py-4 text-sm italic"
              style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.25)", color: "#f0dde8" }}
            >
              Second real bonus, same rule. Remove if not applicable.
            </div>
          </div>
        </Section>
      )}

      {/* 17 · Pricing */}
      <Section bg={CREAM}>
        <HSec className="mb-7">
          Every Week You Wait Is a Week Someone Else Builds the Audience You Should Have.
        </HSec>
        <Narrow center>
          <Para>
            The creator with the audience is not always the most talented in the room. They are the
            one who kept showing up.
          </Para>
          <Para>
            You have the expertise. You have the ideas. The only thing missing has been a way to
            turn them into posts without losing an afternoon to the blank page.
          </Para>
          <Para className="font-semibold">Your next week of content is an afternoon away.</Para>
        </Narrow>
        <div
          className="mx-auto mt-7 max-w-[360px] rounded-2xl border p-7 text-center"
          style={{ background: ROSE, borderColor: ROSE_LINE }}
        >
          <div className="font-display text-[0.94rem] font-semibold" style={{ color: PLUM }}>
            Content Engine
          </div>
          <div className="my-1 font-display text-[2.75rem] font-bold leading-none" style={{ color: NAVY }}>
            $47
            <span className="text-[1.125rem] font-medium" style={{ color: MUTED }}>
              /mo
            </span>
          </div>
          <div className="mb-5 text-[0.875rem]" style={{ color: MUTED }}>
            7 days free · cancel any time
          </div>
          <Cta view={view} block />
        </div>
      </Section>

      {/* 18 */}
      <Section>
        <HSec className="mb-7">
          What Happens If You Close This Page and Come Back to It &ldquo;Later&rdquo;?
        </HSec>
        <Narrow center>
          <Para>You already know the answer.</Para>
          <Para>
            Later becomes next week. Next week becomes next month. And a year from now, you are
            still meaning to be consistent, while someone with the same expertise — and less of it —
            has become the name your audience follows.
          </Para>
          <Para>Not because they were better. Because they kept publishing and you did not.</Para>
          <Para className="!mb-0">
            The gap between the creators people follow and the ones they do not is rarely talent. It
            is almost always the decision to start, and to keep going. This is the simplest way to
            make that decision easy.
          </Para>
        </Narrow>
      </Section>

      {/* 19 · Recap */}
      <Section bg={GREY}>
        <div className="mx-auto grid max-w-[960px] grid-cols-1 items-center gap-11 md:grid-cols-2">
          <div>
            <HSec left className="mb-5">
              Here Is Everything, One More Time.
            </HSec>
            <div style={{ color: "#3a3a48" }}>
              <Para>
                For $47 a month, with the first seven days free, you get a system that studies what
                is working in your niche, drafts carousels, reels, and posts in your own voice, and
                gives you one place to plan and publish them.
              </Para>
              <Para>
                Set up your niche once. After that, you start every week from a draft, not a blank
                page.
              </Para>
              <Para>No agency. No blank page. No guessing what to post.</Para>
              <Para className="font-semibold" >
                <span style={{ color: NAVY }}>Just your content. Ready.</span>
              </Para>
            </div>
            <Cta view={view} />
          </div>
          <ImgBox label="[ Image ]" />
        </div>
      </Section>

      {/* 20 · FAQ */}
      <Section>
        <HSec className="mb-9">Everything You Want to Know Before You Start.</HSec>
        <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-x-11 gap-y-6 md:grid-cols-2">
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
            <div key={q}>
              <div className="mb-1.5 font-display text-[1.03rem] font-semibold" style={{ color: NAVY }}>
                {q}
              </div>
              <div className="pb-5 text-[0.94rem]" style={{ color: "#4a4a58", borderBottom: `1px solid ${LINE}` }}>
                {a}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 21 · Final CTA */}
      <section className="px-6 py-14 text-white md:py-[72px]" style={{ background: NAVY }}>
        <div className="mx-auto grid w-full max-w-[1080px] grid-cols-1 items-center gap-11 md:grid-cols-2">
          <div>
            <h2 className="mb-4 font-display text-[clamp(1.6rem,3.4vw,2.25rem)] font-semibold leading-[1.15]">
              One Login. One Afternoon. A Week of Content.
            </h2>
            <p className="mb-4 text-[#c8d3e6]">
              You have been meaning to be consistent for a while. Maybe a long while.
            </p>
            <p className="mb-4 text-[#c8d3e6]">
              The ideas are there. The expertise is there. The audience is there.
            </p>
            <p className="font-semibold">The only thing missing has been the system.</p>
          </div>
          <div>
            <ul className="mb-6 list-none p-0">
              {[
                "The research done for you — the top posts in your niche, and the hooks behind them",
                "Carousels, reels, and posts drafted in your own voice",
                "One place to plan the week and move each piece from draft to posted",
                "Seven days free, then $47 a month, cancel any time",
              ].map((li) => (
                <li
                  key={li}
                  className="relative py-2.5 pl-7 text-[0.94rem] text-[#e4ebf6]"
                  style={{ borderBottom: "1px solid rgba(255,255,255,.10)" }}
                >
                  <span
                    className="absolute left-0 top-[17px] size-[11px] rounded-full"
                    style={{ background: TERRA }}
                    aria-hidden
                  />
                  {li}
                </li>
              ))}
            </ul>
            <Cta view={view} />
          </div>
        </div>
      </section>

      {/* 22 · Footer */}
      <footer className="px-6 py-8" style={{ background: "#fff", borderTop: `1px solid ${LINE}` }}>
        <div
          className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center justify-between gap-5 text-[0.84rem]"
          style={{ color: MUTED }}
        >
          <div className="flex items-center gap-2.5 font-display font-bold" style={{ color: NAVY }}>
            <span className="inline-block size-4 rounded-full" style={{ background: TERRA }} />
            <span className="leading-none">
              greater
              <span className="mt-0.5 block text-[0.69rem] font-medium uppercase leading-none tracking-[0.14em]" style={{ color: MUTED }}>
                inside
              </span>
            </span>
          </div>
          <div>
            © Greater Inside 2026. All rights reserved.
            <a href="/privacy" className="ml-4 no-underline hover:underline" style={{ color: MUTED }}>
              Privacy Policy
            </a>
            <a href="/terms" className="ml-4 no-underline hover:underline" style={{ color: MUTED }}>
              Terms &amp; Conditions
            </a>
          </div>
        </div>
      </footer>

      {/* Sticky accept bar. Not in the artifact — a static mockup has no accept
          mechanism — but it is what keeps the offer reachable on a page this
          long, and it carries the real expiry. */}
      <OtoStickyBar
        token={view.token}
        acceptLabel={offer.acceptLabel}
        declineLabel={offer.declineLabel}
        priceLine="$47/mo · 7 days free"
        subLine={view.recurringNote ? `${view.recurringNote}. Cancel any time.` : null}
        expiresAt={view.expiresAt}
      />
    </div>
  );
}
