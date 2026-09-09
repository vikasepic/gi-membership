import { OtoActions, type OtoView } from "@/components/oto/shell";
import { OtoStickyBar } from "@/components/oto/sticky-bar";
import { contentValue, paragraphs, rows, items } from "@/lib/oto-content";
import { money } from "@/lib/money";

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

/**
 * `*starred*` runs render italic and underlined, matching the hero treatment.
 *
 * The headline needs two emphasised phrases and the client needs to be able to
 * change them. A full rich-text editor for one effect on one field is a worse
 * trade than one character of markup with a hint beside the box.
 */
function Emph({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/g).map((part, i) =>
        part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
          <span key={i} className="italic underline decoration-white/30 underline-offset-[5px]">
            {part.slice(1, -1)}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** A paragraph field split on blank lines; the last one carries `lastClass`. */
function Paras({
  text,
  className = "",
  lastClass = "!mb-0",
}: {
  text: string;
  className?: string;
  lastClass?: string;
}) {
  const ps = paragraphs(text);
  return (
    <>
      {ps.map((t, i) => (
        <Para key={i} className={`${className} ${i === ps.length - 1 ? lastClass : ""}`}>
          {t}
        </Para>
      ))}
    </>
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
  // Every string below comes from the offer, falling back to the copy this page
  // shipped with. An offer nobody has edited renders exactly as before.
  const c = (key: string) => contentValue(offer.otoPage, key);

  // Derived from the offer, not editable. A price typed into a copy field can
  // disagree with the price actually charged; this one cannot.
  const priceLine = [
    money(offer.priceCents, offer.currency) + (offer.interval ? `/${offer.interval}` : ""),
    offer.trialDays ? `${offer.trialDays} days free` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
                {c("hero.badge")}
              </span>
              <p className="mb-4 max-w-[520px] text-sm italic text-[#a9bad4]">
                {c("hero.eyebrow")}
              </p>
              <h1 className="mb-5 max-w-[640px] font-display text-[clamp(1.9rem,4.4vw,3.125rem)] font-semibold leading-[1.15] tracking-[-0.01em] text-white">
                <Emph text={c("hero.headline")} />
              </h1>
              <p className="mb-3.5 max-w-[560px] text-[1.125rem] leading-relaxed text-[#d7e0ee]">
                {c("hero.sub")}
              </p>
              <p className="mb-7 max-w-[540px] text-[0.94rem] text-[#a9bad4]">
                {c("hero.support")}
              </p>
              <Cta view={view} />
            </div>

            <div
              className="rounded-2xl border px-5"
              style={{ background: NAVY_2, borderColor: "rgba(255,255,255,0.10)" }}
            >
              {rows(c("hero.card"), 3).map(([k, v, d], i, arr) => (
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
          {rows(c("statbar.items"), 2).map(([fig, lab]) => (
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
        <HSec className="mb-7">{c("problem.heading")}</HSec>
        <p className="mx-auto mb-6 max-w-[680px] text-center" style={{ color: MUTED }}>
          {c("problem.lead")}
        </p>
        <div className="mx-auto mb-7 max-w-[620px]">
          {items(c("problem.chips")).map((q) => (
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
          <Paras text={c("problem.body")} />
        </Narrow>
      </Section>

      {/* 4 */}
      <Section bg={GREY}>
        <HSec className="mb-7">{c("audience.heading")}</HSec>
        <Narrow>
          <Paras text={c("audience.body")} />
        </Narrow>
      </Section>

      {/* 5 */}
      <Section>
        <HSec className="mb-7">{c("mechanism.heading")}</HSec>
        <Narrow center>
          <Paras text={c("mechanism.body")} />
        </Narrow>
        <div
          className="mx-auto my-7 max-w-[760px] rounded-xl border px-7 py-7"
          style={{ background: ROSE, borderColor: ROSE_LINE, color: "#3a2c34" }}
        >
          <p className="leading-[1.6]">{c("mechanism.callout")}</p>
        </div>
        {/* The approved artifact uses a 4px terracotta left rule here. Kept
            because the brief specifies it, not reached for by habit. */}
        <div
          className="mx-auto max-w-[760px] rounded-lg px-5 py-4"
          style={{ background: ROSE_2, borderLeft: `4px solid ${TERRA}` }}
        >
          <p>
            <b style={{ color: NAVY }}>The result:</b> {c("mechanism.result")}
          </p>
        </div>
      </Section>

      {/* 6 */}
      <Section bg={CREAM}>
        <HSec className="mb-7">{c("speed.heading")}</HSec>
        <Narrow center>
          <Paras text={c("speed.body")} />
        </Narrow>
        <p
          className="mx-auto mt-6 max-w-[640px] text-center font-display text-xl font-semibold italic"
          style={{ color: TERRA }}
        >
          {c("speed.accent")}
        </p>
      </Section>

      {/* 7 */}
      <Section>
        <div className="mx-auto grid max-w-[960px] grid-cols-1 items-center gap-11 md:grid-cols-2">
          <div>
            <HSec left className="mb-5">
              {c("credibility.heading")}
            </HSec>
            <div style={{ color: "#3a3a48" }}>
              <Paras text={c("credibility.body")} />
            </div>
            <Placeholder view={view}>
              One or two sentences of real, verifiable credibility — volume of content analysed, who
              built it, a track record you can stand behind.
            </Placeholder>
          </div>
          <ImgBox label="[ Image / product screenshot ]" />
        </div>
        <div className="mx-auto mt-8 max-w-[760px] rounded-xl px-7 py-7 text-white" style={{ background: PLUM }}>
          <p className="leading-[1.6]">{c("credibility.callout")}</p>
        </div>
      </Section>

      {/* 8 */}
      <Section bg={GREY}>
        <HSec className="mb-9">{c("benefits.heading")}</HSec>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {rows(c("benefits.cards"), 2).map(([h, b]) => (
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
        <HSec className="mb-7">{c("authority.heading")}</HSec>
        <Narrow center>
          <Paras text={c("authority.body")} />
        </Narrow>
        <div
          className="mx-auto mt-7 max-w-[760px] rounded-xl px-7 py-7 text-center text-white"
          style={{ background: NAVY }}
        >
          {paragraphs(c("authority.callout")).map((t, i, a) => (
            <p
              key={i}
              className={`leading-[1.6] ${i === a.length - 1 ? "font-semibold" : "mb-4"}`}
            >
              {t}
            </p>
          ))}
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
        <HSec className="mb-6">{c("strategy.heading")}</HSec>
        <p className="mx-auto mb-6 max-w-[680px] text-center" style={{ color: MUTED }}>
          {c("strategy.lead")}
        </p>
        <Narrow center>
          <Paras text={c("strategy.body")} />
        </Narrow>
        <Placeholder view={view}>
          A roster of well-known creators, each with a key format or channel and one factual
          sentence about how consistent publishing built their audience. Publicly verifiable claims
          only. This proves the strategy works — it does not claim any of them use Content Engine.
        </Placeholder>
      </Section>

      {/* 12 */}
      <Section bg={ROSE}>
        <HSec className="mb-8">{c("means.heading")}</HSec>
        <div className="mx-auto grid max-w-[960px] grid-cols-1 items-start gap-11 md:grid-cols-2">
          <Placeholder view={view}>
            A real, specific story — yours or a named creator&rsquo;s, with permission — of how
            consistent content built an audience or a business, with numbers you can stand behind.
          </Placeholder>
          <div className="rounded-xl px-7 py-7 text-white" style={{ background: NAVY }}>
            {paragraphs(c("means.box")).map((t, i, a) => (
              <p
                key={i}
                className={`leading-[1.6] text-[#dfe7f4] ${i === a.length - 1 ? "mb-2" : "mb-4"}`}
              >
                {t}
              </p>
            ))}
            <div className="mt-2 pt-3.5" style={{ borderTop: "1px solid rgba(255,255,255,.12)" }}>
              {rows(c("means.rows"), 2).map(([k, v]) => (
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
            {c("what.pill")}
          </div>
          <HSec className="mb-7">{c("what.heading")}</HSec>
        </div>
        <Narrow>
          <Paras text={c("what.body")} />
        </Narrow>
      </Section>

      {/* 14 · Comparison */}
      <Section bg={GREY}>
        <HSec className="mb-9">{c("compare.heading")}</HSec>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Last row is the highlighted card — the editor says so, so "which one
              is ours" is a property of the copy rather than a hidden flag. */}
          {rows(c("compare.rows"), 4)
            .map(([tag, price, time, p], i, a) => ({ tag, price, time, p, best: i === a.length - 1 }))
            .map((card) => (
            <div
              key={card.tag}
              className="relative rounded-xl border px-5 py-6"
              style={card.best ? { background: PLUM, borderColor: PLUM } : { background: "#fff", borderColor: LINE }}
            >
              {card.best && (
                <span
                  className="absolute -top-[11px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[20px] px-3 py-1 font-display text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-white"
                  style={{ background: TERRA }}
                >
                  Best value
                </span>
              )}
              <div
                className="mb-3 text-[0.69rem] uppercase tracking-[0.1em]"
                style={{ color: card.best ? "#e7c9dc" : MUTED }}
              >
                {card.tag}
              </div>
              <div
                className="mb-0.5 font-display text-2xl font-bold"
                style={{ color: card.best ? "#fff" : NAVY }}
              >
                {card.price}
              </div>
              <div className="mb-3.5 text-[0.81rem]" style={{ color: card.best ? "#e7c9dc" : MUTED }}>
                {card.time}
              </div>
              <p className="text-[0.84rem]" style={{ color: card.best ? "#fff" : "#4a4a58" }}>
                {card.p}
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
        <HSec className="mb-7">{c("price.heading")}</HSec>
        <Narrow center>
          <Paras text={c("price.body")} lastClass="font-semibold" />
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
            {c("price.card_terms")}
          </div>
          <Cta view={view} block />
        </div>
      </Section>

      {/* 18 */}
      <Section>
        <HSec className="mb-7">{c("regret.heading")}</HSec>
        <Narrow center>
          <Paras text={c("regret.body")} />
        </Narrow>
      </Section>

      {/* 19 · Recap */}
      <Section bg={GREY}>
        <div className="mx-auto grid max-w-[960px] grid-cols-1 items-center gap-11 md:grid-cols-2">
          <div>
            <HSec left className="mb-5">
              {c("recap.heading")}
            </HSec>
            <div style={{ color: "#3a3a48" }}>
              <Paras text={c("recap.body")} lastClass="font-semibold" />
            </div>
            <Cta view={view} />
          </div>
          <ImgBox label="[ Image ]" />
        </div>
      </Section>

      {/* 20 · FAQ */}
      <Section>
        <HSec className="mb-9">{c("faq.heading")}</HSec>
        <div className="mx-auto grid max-w-[900px] grid-cols-1 gap-x-11 gap-y-6 md:grid-cols-2">
          {rows(c("faq.items"), 2).map(([q, a]) => (
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
              {c("final.heading")}
            </h2>
            {paragraphs(c("final.body")).map((t, i, a) => (
              <p key={i} className={i === a.length - 1 ? "font-semibold" : "mb-4 text-[#c8d3e6]"}>
                {t}
              </p>
            ))}
          </div>
          <div>
            <ul className="mb-6 list-none p-0">
              {items(c("final.checklist")).map((li) => (
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
        priceLine={priceLine}
        subLine={view.recurringNote ? `${view.recurringNote}. Cancel any time.` : null}
        expiresAt={view.expiresAt}
        declineHref={view.declineHref}
        expiredHref={view.expiredHref}
      />
    </div>
  );
}
