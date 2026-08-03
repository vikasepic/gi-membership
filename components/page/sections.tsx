import { listOf, textOf, imageSrc, type SectionView, type BandTheme } from "@/lib/page-sections";
import { tint } from "@/lib/color";

// The nine bands.
//
// Each renders a different shape because each part does a different job — a
// sequence is steps, an offer is a stack, proof is quotes. That difference
// comes from the field types in lib/page-sections.ts, not from styling laid on
// top: a section that stores a heading and a body can only ever look like a
// heading and a body, which is what made the first draft read flat.
//
// No "use client": these are plain presentational components, so the store page
// renders them on the server and the admin editor renders the same code in the
// browser. One implementation, so a preview cannot drift from the live page.

/**
 * `cta` is a renderer, not a node, so the section's own editable button label
 * is still used while the page supplies the real link. Passing a finished node
 * would silently kill the ctaLabel field.
 */
export type CtaRender = (label: string) => React.ReactNode;
type P = { view: SectionView; cta?: CtaRender };

function Tick({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="mt-[3px] size-[15px] shrink-0" style={{ color }}>
      <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function H({ children, t, big = false }: { children: React.ReactNode; t: BandTheme; big?: boolean }) {
  return (
    <h2
      className={`font-display font-semibold leading-[1.15] tracking-[-0.015em] text-balance ${
        big ? "text-[clamp(1.7rem,3.4vw,2.4rem)]" : "text-[clamp(1.3rem,2.4vw,1.8rem)]"
      }`}
      style={{ color: t.fg }}
    >
      {children}
    </h2>
  );
}

/** The button. A node when the page can actually buy; plain text in a preview. */
function Cta({ label, t, render }: { label: string; t: BandTheme; render?: CtaRender }) {
  if (!label) return null;
  if (render) return <>{render(label)}</>;
  return (
    <span
      className="inline-block w-fit rounded-full px-7 py-3 font-display text-[0.95rem] font-semibold"
      style={{ background: t.accent, color: t.onAccent }}
    >
      {label}
    </span>
  );
}

// --- 1 + 2 ----------------------------------------------------------------
export function HeroSection({ view, cta }: P) {
  const { c, theme: t } = view;
  const facts = listOf(c.facts, ["label", "value", "detail"]);
  return (
    <div className="grid grid-cols-1 gap-8 @3xl:grid-cols-[1.2fr_0.8fr] @3xl:gap-12">
      <div>
        {textOf(c, "prehead") && (
          <p className="mb-4 max-w-[52ch] text-[0.92rem] italic" style={{ color: t.muted }}>
            {textOf(c, "prehead")}
          </p>
        )}
        <h1
          className="font-display text-[clamp(1.8rem,4vw,2.9rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-balance"
          style={{ color: t.fg }}
        >
          {textOf(c, "headline")}
        </h1>
        {textOf(c, "subhead") && (
          <p className="mt-4 max-w-[58ch] text-[1.02rem] leading-relaxed" style={{ color: t.muted }}>
            {textOf(c, "subhead")}
          </p>
        )}
        <div className="mt-7">
          <Cta label={textOf(c, "ctaLabel")} t={t} render={cta} />
        </div>
        {textOf(c, "ctaNote") && (
          <p className="mt-3 text-[0.85rem]" style={{ color: t.muted }}>
            {textOf(c, "ctaNote")}
          </p>
        )}
      </div>

      {facts.length > 0 && (
        <div className="rounded-2xl px-5" style={{ background: t.panel }}>
          {facts.map((f, i) => (
            <div key={i} className="py-4" style={i ? { borderTop: `1px solid ${t.rule}` } : undefined}>
              <div className="text-[0.66rem] uppercase tracking-[0.13em]" style={{ color: t.muted }}>
                {f.label}
              </div>
              <div className="mt-1 font-display text-[1.3rem] font-bold" style={{ color: t.fg }}>
                {f.value}
              </div>
              {f.detail && (
                <div className="mt-1 text-[0.8rem] leading-snug" style={{ color: t.muted }}>
                  {f.detail}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The figures strip under the hero. A rhythm break, not a section of its own. */
export function HeroStats({ view }: { view: SectionView }) {
  const stats = listOf(view.c.stats, ["value", "label"]);
  if (stats.length === 0) return null;
  const t = view.theme;
  return (
    <div
      className="flex flex-wrap justify-between gap-4 px-6 py-4 text-center"
      style={{ background: t.panel2, borderTop: `1px solid ${t.rule}`, borderBottom: `1px solid ${t.rule}` }}
    >
      {stats.map((s, i) => (
        <div key={i} className="min-w-[110px] flex-1">
          <div className="font-display text-[1.4rem] font-bold" style={{ color: t.fg }}>
            {s.value}
          </div>
          <div className="mt-0.5 text-[0.74rem]" style={{ color: t.muted }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- 3 --------------------------------------------------------------------
export function ProblemSection({ view }: P) {
  const { c, theme: t } = view;
  const chips = listOf(c.chips, ["text"]);
  const feels = textOf(c, "feels");
  const truth = textOf(c, "truth");
  return (
    <div>
      {/* Measure, not container width: the band is wide and a heading running
          the whole of it is a line nobody finishes. */}
      <div className="max-w-[24ch] @xl:max-w-[34ch]">
        <H t={t}>{textOf(c, "heading")}</H>
      </div>
      {textOf(c, "lead") && (
        <p className="mt-3 max-w-[60ch] text-[0.95rem]" style={{ color: t.muted }}>
          {textOf(c, "lead")}
        </p>
      )}

      {/* Their own words, as a group of voices. The previous version alternated
          them left and right like a chat thread, which at full width scattered
          three short lines across a lot of nothing. */}
      {chips.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2.5">
          {chips.map((q, i) => (
            <span
              key={i}
              className="rounded-full px-4 py-2 text-[0.92rem]"
              style={{ background: t.panel, color: t.fg, border: `1px solid ${t.rule}` }}
            >
              &ldquo;{q.text}&rdquo;
            </span>
          ))}
        </div>
      )}

      {(feels || truth) && (
        <div className="mt-8 grid grid-cols-1 items-stretch gap-3 @2xl:grid-cols-[1fr_auto_1.15fr]">
          <div className="rounded-2xl px-5 py-4" style={{ background: t.panel }}>
            <span
              className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.09em]"
              style={{ color: t.muted }}
            >
              What it feels like
            </span>
            <p className="text-[0.95rem]" style={{ color: t.muted }}>
              {feels}
            </p>
          </div>

          <span
            className="hidden self-center text-lg @2xl:block"
            style={{ color: t.accent }}
            aria-hidden
          >
            &rarr;
          </span>

          {/* The reframe is the point of the section, so it carries the accent
              and the weight. Tinted rather than filled: this holds a sentence
              of body copy, and full accent behind body copy is unreadable. */}
          <div
            className="rounded-2xl px-5 py-4"
            style={{ background: tint(t.accent, 0.1), border: `1px solid ${tint(t.accent, 0.3)}` }}
          >
            <span
              className="mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-[0.09em]"
              style={{ color: t.accent }}
            >
              What is actually true
            </span>
            <p className="text-[0.98rem] font-medium" style={{ color: t.fg }}>
              {truth}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 4 --------------------------------------------------------------------
export function SolutionSection({ view }: P) {
  const { c, theme: t } = view;
  const steps = listOf(c.steps, ["title", "body"]);
  return (
    <div>
      <H t={t}>{textOf(c, "heading")}</H>
      {steps.length > 0 && (
        <div className="mt-7 grid grid-cols-1 gap-6 @2xl:grid-cols-3">
          {steps.map((s, i) => (
            <div key={i} className="relative pt-11">
              <span
                className="absolute left-0 top-0 grid size-9 place-content-center rounded-full font-display text-[0.9rem] font-bold"
                style={{ background: t.accent, color: t.onAccent }}
              >
                {i + 1}
              </span>
              <h3 className="mb-1.5 font-display text-[1.02rem] font-semibold" style={{ color: t.fg }}>
                {s.title}
              </h3>
              <p className="text-[0.88rem] leading-relaxed" style={{ color: t.muted }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      )}
      {textOf(c, "result") && (
        <div
          className="mt-7 rounded-xl px-5 py-4 text-[0.95rem] font-semibold"
          style={{ background: t.panel, color: t.fg }}
        >
          {textOf(c, "result")}
        </div>
      )}
    </div>
  );
}

// --- 5 --------------------------------------------------------------------
export function BenefitsSection({ view }: P) {
  const { c, theme: t, variant } = view;
  const items = listOf(c.items, ["title", "body"]);
  return (
    <div>
      <H t={t}>{textOf(c, "heading")}</H>

      {variant === "cards" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 @2xl:grid-cols-3">
          {items.map((it, i) => (
            <div key={i} className="rounded-xl p-5" style={{ background: t.panel }}>
              <span
                className="mb-3 grid size-9 place-content-center rounded-[10px] text-[1rem]"
                style={{ background: t.accent, color: t.onAccent }}
                aria-hidden
              >
                ◆
              </span>
              <h3 className="mb-1.5 font-display text-[1rem] font-semibold" style={{ color: t.fg }}>
                {it.title}
              </h3>
              <p className="text-[0.87rem]" style={{ color: t.muted }}>
                {it.body}
              </p>
            </div>
          ))}
        </div>
      ) : (
        // Weighted rows rather than three identical cards: an even grid of
        // equal boxes is the shape that made this read generic.
        <div className="mt-4">
          {items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr] items-start gap-4 py-5"
              style={i ? { borderTop: `1px solid ${t.rule}` } : undefined}
            >
              <span
                className="grid size-11 place-content-center rounded-xl text-[1.1rem]"
                style={{ background: t.accent, color: t.onAccent }}
                aria-hidden
              >
                ◆
              </span>
              <div>
                <h3 className="mb-1 font-display text-[1.08rem] font-semibold" style={{ color: t.fg }}>
                  {it.title}
                </h3>
                <p className="text-[0.9rem]" style={{ color: t.muted }}>
                  {it.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- 6 --------------------------------------------------------------------
export function OfferSection({ view, priceLabel }: P & { priceLabel?: string | null }) {
  const { c, theme: t } = view;
  const modules = listOf(c.modules, ["title", "body"]);
  const stack = listOf(c.stack, ["label", "amount"]);
  return (
    <div>
      <H t={t}>{textOf(c, "heading")}</H>

      {modules.length > 0 && (
        <div className="my-6 grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          {modules.map((m, i) => (
            <div key={i} className="rounded-xl px-4 py-4 text-[0.87rem]" style={{ background: t.panel }}>
              <b className="mb-1 block font-display text-[0.95rem]" style={{ color: t.fg }}>
                {m.title}
              </b>
              <span style={{ color: t.muted }}>{m.body}</span>
            </div>
          ))}
        </div>
      )}

      {stack.length > 0 && (
        <div className="overflow-hidden rounded-2xl" style={{ background: t.panel }}>
          {stack.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 px-5 py-3 text-[0.9rem]"
              style={i ? { borderTop: `1px solid ${t.rule}` } : undefined}
            >
              <span style={{ color: t.muted }}>{r.label}</span>
              <b className="tabular-nums whitespace-nowrap" style={{ color: t.fg }}>
                {r.amount}
              </b>
            </div>
          ))}
          {textOf(c, "totalAmount") && (
            <div
              className="flex items-center justify-between gap-4 px-5 py-3 font-display text-[1.02rem] font-bold"
              style={{ borderTop: `1px solid ${t.rule}`, color: t.fg }}
            >
              <span>{textOf(c, "totalLabel") || "Total value"}</span>
              <span className="tabular-nums">{textOf(c, "totalAmount")}</span>
            </div>
          )}
          {/* The real charge, from the offer or product — never typed. */}
          {priceLabel && (
            <div
              className="flex items-center justify-between gap-4 px-5 py-4 font-display text-[1.15rem] font-bold"
              style={{ background: t.panel2, borderTop: `1px solid ${t.rule}`, color: t.accent }}
            >
              <span>You pay</span>
              <span className="tabular-nums">{priceLabel}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- 7 --------------------------------------------------------------------
export function AuthoritySection({ view }: P) {
  const { c, theme: t } = view;
  const figures = listOf(c.figures, ["value", "label"]);
  const img = imageSrc(c.imageUrl);
  return (
    <div className="grid grid-cols-1 items-center gap-8 @3xl:grid-cols-[0.8fr_1.2fr]">
      {/* min-w-0 on both columns: without it a wide image sets the track width
          and pushes the copy out past the band's edge. The frame follows the
          image's own shape rather than forcing a portrait crop on artwork that
          is usually square or landscape. */}
      <div className="min-w-0">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt=""
            className="h-auto w-full rounded-2xl object-contain"
            style={{ background: t.panel }}
          />
        ) : (
          <div
            className="grid aspect-[4/3] place-content-center rounded-2xl text-[0.8rem]"
            style={{ background: t.panel, color: t.muted }}
          >
            Image
          </div>
        )}
      </div>
      <div className="min-w-0">
        <H t={t}>{textOf(c, "heading")}</H>
        <p className="mt-4 text-[0.95rem] leading-relaxed" style={{ color: t.muted }}>
          {textOf(c, "body")}
        </p>
        {figures.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-8">
            {figures.map((f, i) => (
              <div key={i}>
                <b className="block font-display text-[1.35rem] font-bold" style={{ color: t.fg }}>
                  {f.value}
                </b>
                <span className="text-[0.76rem]" style={{ color: t.muted }}>
                  {f.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- 8 --------------------------------------------------------------------
export function ProofSection({ view, preview }: P & { preview?: boolean }) {
  const { c, theme: t, variant } = view;
  const quotes = listOf(c.quotes, ["quote", "name", "role"]);
  const reasons = listOf(c.reasons, ["title", "body"]);

  // Nothing invented, ever. With no real quotes the testimonial layout has
  // nothing honest to show, so it falls through to the mechanism — which is
  // true today — rather than rendering empty cards or placeholder names.
  const useQuotes = variant === "quotes" && quotes.length > 0;
  // Which made switching the layout look broken: both settings rendered the
  // same thing and nothing said why. In the editor it now says so; a buyer
  // still never sees this.
  const emptyQuotes = preview && variant === "quotes" && quotes.length === 0;

  return (
    <div>
      <H t={t}>{textOf(c, "heading")}</H>

      {emptyQuotes ? (
        <p
          className="mt-5 rounded-2xl border-[1.5px] border-dashed px-5 py-4 text-[0.9rem] italic"
          style={{ borderColor: tint(t.fg, 0.25), color: t.muted }}
        >
          Editor only — a buyer never sees this. The testimonial layout needs at least one
          quote; add one above and it will appear here. Until then the page falls back to the
          mechanism, which is true today.
        </p>
      ) : useQuotes ? (
        <div className="mt-6 grid grid-cols-1 gap-4 @2xl:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl p-5" style={{ background: t.panel }}>
            <p className="font-display text-[1.1rem] font-semibold leading-snug" style={{ color: t.fg }}>
              &ldquo;{quotes[0].quote}&rdquo;
            </p>
            <div className="mt-4 flex items-center gap-2.5 text-[0.82rem]" style={{ color: t.muted }}>
              <span
                className="grid size-8 place-content-center rounded-full text-[0.72rem] font-bold"
                style={{ background: t.accent, color: t.onAccent }}
                aria-hidden
              >
                {quotes[0].name.slice(0, 1).toUpperCase() || "•"}
              </span>
              <span>
                {quotes[0].name}
                {quotes[0].role ? ` · ${quotes[0].role}` : ""}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {quotes.slice(1, 3).map((q, i) => (
              <div key={i} className="rounded-2xl p-4" style={{ background: t.panel2 }}>
                <p className="text-[0.9rem] leading-snug" style={{ color: t.fg }}>
                  &ldquo;{q.quote}&rdquo;
                </p>
                <p className="mt-2 text-[0.78rem]" style={{ color: t.muted }}>
                  {q.name}
                  {q.role ? ` · ${q.role}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-6 @2xl:grid-cols-3">
            {reasons.map((r, i) => (
              <div key={i} className="relative pt-11">
                <span
                  className="absolute left-0 top-0 grid size-9 place-content-center rounded-full"
                  style={{ background: t.accent, color: t.onAccent }}
                  aria-hidden
                >
                  <svg viewBox="0 0 20 20" fill="none" className="size-4">
                    <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h3 className="mb-1.5 font-display text-[1.02rem] font-semibold" style={{ color: t.fg }}>
                  {r.title}
                </h3>
                <p className="text-[0.88rem]" style={{ color: t.muted }}>
                  {r.body}
                </p>
              </div>
            ))}
          </div>
          {textOf(c, "note") && (
            <p className="mt-6 text-[0.88rem]" style={{ color: t.muted }}>
              {textOf(c, "note")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// --- 9 --------------------------------------------------------------------
export function ValueSection({ view, priceLabel, termsLabel }: P & { priceLabel?: string | null; termsLabel?: string | null }) {
  const { c, theme: t, variant } = view;
  const options = listOf(c.options, ["label", "amount", "note"]);
  const faqs = listOf(c.faqs, ["q", "a"]);
  return (
    <div>
      <H t={t}>{textOf(c, "heading")}</H>

      {/* "card" drops the comparison entirely — for an offer with no honest
          alternative to line up against, three columns of invented rivals is
          worse than none. "tiers" gives every option equal weight instead of
          treating the last as the winner. */}
      {options.length > 0 && variant !== "card" && (
        <div
          className={`my-7 grid gap-3 ${
            variant === "tiers" ? "grid-cols-1 @2xl:grid-cols-3" : "grid-cols-2 @3xl:grid-cols-4"
          }`}
        >
          {options.map((o, i) => {
            const ours = variant !== "tiers" && i === options.length - 1;
            return (
              <div
                key={i}
                className={`relative rounded-xl ${variant === "tiers" ? "px-5 py-6" : "px-4 py-4"}`}
                style={ours ? { background: t.accent, color: t.onAccent } : { background: t.panel, color: t.fg }}
              >
                {ours && (
                  <span
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.07em]"
                    style={{ background: t.fg, color: t.bg }}
                  >
                    Best value
                  </span>
                )}
                <div className="text-[0.68rem] uppercase tracking-[0.09em] opacity-75">{o.label}</div>
                <div
                  className={`mt-1 font-display font-bold ${
                    variant === "tiers" ? "text-[1.6rem]" : "text-[1.2rem]"
                  }`}
                >
                  {o.amount}
                </div>
                <div className="text-[0.75rem] opacity-75">{o.note}</div>
              </div>
            );
          })}
        </div>
      )}

      <div
        className="grid grid-cols-1 items-center gap-6 rounded-2xl px-6 py-5 @2xl:grid-cols-[1fr_auto]"
        style={{ background: t.panel }}
      >
        <div>
          {priceLabel && (
            <div className="font-display text-[2.1rem] font-bold leading-none" style={{ color: t.fg }}>
              {priceLabel}
              {termsLabel && (
                <span className="ml-1 text-[1rem] font-medium" style={{ color: t.muted }}>
                  {termsLabel}
                </span>
              )}
            </div>
          )}
          {textOf(c, "priceNote") && (
            <p className="mt-2 text-[0.85rem]" style={{ color: t.muted }}>
              {textOf(c, "priceNote")}
            </p>
          )}
        </div>
        {textOf(c, "guaranteeBody") && (
          <div className="max-w-[260px] rounded-xl px-4 py-3 text-[0.82rem]" style={{ background: t.panel2 }}>
            <b className="mb-1 block font-display" style={{ color: t.fg }}>
              {textOf(c, "guaranteeTitle")}
            </b>
            <span style={{ color: t.muted }}>{textOf(c, "guaranteeBody")}</span>
          </div>
        )}
      </div>

      {/* Objections belong here rather than in their own band: this section
          exists to remove the last of the risk, and an unanswered question is
          risk. It also keeps Ajit's structure at ten parts. */}
      {faqs.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-5 @2xl:grid-cols-2">
          {faqs.map((f, i) => (
            <div key={i}>
              <div className="mb-1 font-display text-[0.98rem] font-semibold" style={{ color: t.fg }}>
                {f.q}
              </div>
              <div className="pb-4 text-[0.88rem]" style={{ color: t.muted, borderBottom: `1px solid ${t.rule}` }}>
                {f.a}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- 10 -------------------------------------------------------------------
export function CtaSection({ view, cta }: P) {
  const { c, theme: t } = view;
  const checklist = listOf(c.checklist, ["text"]);
  return (
    <div className="grid grid-cols-1 items-stretch gap-7 @3xl:grid-cols-[1.1fr_0.9fr]">
      <div>
        <H t={t}>{textOf(c, "heading")}</H>
        {checklist.length > 0 && (
          <ul className="mt-4 flex list-none flex-col gap-2 p-0">
            {checklist.map((li, i) => (
              <li key={i} className="flex items-start gap-2 text-[0.9rem]" style={{ color: t.fg }}>
                <Tick color={t.accent} />
                <span>{li.text}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6">
          <Cta label={textOf(c, "ctaLabel")} t={t} render={cta} />
        </div>
      </div>
      {textOf(c, "warningBody") && (
        <div className="rounded-2xl px-5 py-5 text-[0.9rem] leading-relaxed" style={{ background: t.panel }}>
          <b className="mb-1.5 block font-display text-[0.98rem]" style={{ color: t.fg }}>
            {textOf(c, "warningTitle")}
          </b>
          <span style={{ color: t.muted }}>{textOf(c, "warningBody")}</span>
        </div>
      )}
    </div>
  );
}
