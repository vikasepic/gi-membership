import { OtoActions, OtoMedia, type OtoView } from "@/components/oto/shell";
import { readOtoSections } from "@/lib/oto-sections";
import { money } from "@/lib/money";

// Long-form upsell page.
//
// Aesthetic lane, named before building so it could not drift into the
// editorial-serif default: a founder-led launch page with a DARK SPINE. Cream
// paper, oversized left-aligned display type, and three heavy navy/plum bands
// that carry the numbers, the argument and the close. The bands are the design;
// everything between them is deliberately quiet so they land.
//
// Colour strategy is Committed, not Restrained: navy and plum own roughly half
// the vertical run. Terracotta keeps its monopoly on the buy button (the rule
// set in globals.css) — which is exactly why the page can be this colourful
// without the CTA losing its meaning.
//
// Explicitly avoided, from the design guidance:
//   - no 01/02/03 markers on the benefits: six features are not a sequence,
//     and numbering them is scaffolding rather than information
//   - no identical card grid: the benefits are a hairline-ruled list with one
//     lead item at display size, so the eye has somewhere to start
//   - no coloured side-stripe on quotes, no gradient text, no glass
//   - centred everything: the page runs left-aligned so the long measure has
//     a spine to hang from

/** `*word*` renders italic — emphasis inside a headline without HTML in the DB. */
function Emphasised({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/g).map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <em key={i} className="italic">{p.slice(1, -1)}</em>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const NAVY_BAND = {
  background:
    "linear-gradient(155deg, var(--navy) 0%, color-mix(in srgb, var(--plum) 62%, var(--navy)) 100%)",
};

/** The buy block. Repeated so the reader never scrolls back to act. */
function Offer({ view, onDark = false }: { view: OtoView; onDark?: boolean }) {
  const { offer } = view;
  return (
    <div
      className={
        onDark
          ? "flex flex-col gap-6"
          : "flex flex-col gap-6 rounded-3xl border border-border bg-surface p-7 shadow-[0_30px_70px_-45px_rgba(11,11,13,0.5)] md:p-9"
      }
    >
      {offer.bullets.length > 0 && (
        <ul className="flex flex-col gap-3">
          {offer.bullets.map((b) => (
            <li key={b} className="flex items-start gap-3 text-[0.95rem]">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className={`mt-1 size-3.5 shrink-0 fill-current ${onDark ? "text-white/70" : "text-navy"}`}
              >
                <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
              </svg>
              <span className={onDark ? "text-white/85" : ""}>{b}</span>
            </li>
          ))}
        </ul>
      )}

      <div className={`flex flex-wrap items-baseline gap-x-3 border-t pt-5 ${onDark ? "border-white/20" : "border-border"}`}>
        <span className="font-display text-[2.75rem] leading-none tracking-[-0.03em]">
          {money(view.chargeNowCents, offer.currency)}
        </span>
        <span className={onDark ? "text-white/70" : "text-muted"}>today</span>
        {view.recurringNote && (
          <span className={`w-full pt-1 text-sm ${onDark ? "text-white/70" : "text-muted"}`}>
            {view.recurringNote}. Cancel any time.
          </span>
        )}
      </div>

      <OtoActions
        view={view}
        className={onDark ? "[&_a]:text-white/70 [&_a:hover]:text-white [&_p]:text-white/60" : ""}
      />
    </div>
  );
}

export function SalesOto({ view }: { view: OtoView }) {
  const { offer } = view;
  const s = readOtoSections(offer.otoSections);
  const body = (offer.otoBody ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const problem = (s.problem ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const [lead, ...rest] = s.benefits ?? [];

  return (
    <div className="flex w-full flex-col gap-16 pb-4 md:gap-28">
      {/* ── Hero. Left-aligned and oversized; the price sits in the headline's
          shadow rather than in a box, so the first thing read is the promise
          and the second is what it costs. */}
      <section className="rise flex flex-col gap-7 pt-6 md:pt-12">
        <span className="kicker w-fit rounded-full bg-primary px-3 py-1.5 text-primary-fg">
          One-time offer &middot; only on this page
        </span>
        <h1 className="max-w-[18ch] font-display text-[clamp(2.4rem,7vw,4.75rem)] leading-[0.98] tracking-[-0.035em] text-balance">
          <Emphasised text={offer.headline} />
        </h1>
        {offer.description && (
          <p className="max-w-[52ch] text-lg leading-relaxed text-fg/75 text-pretty md:text-xl">
            {offer.description}
          </p>
        )}
      </section>

      {/* ── Stats. A ruled row rather than four equal boxes: unequal widths and
          hairlines read as a specification, which is what these are. */}
      {s.stats && s.stats.length > 0 && (
        <section className="grid grid-cols-2 gap-x-8 gap-y-9 border-y border-border py-9 md:grid-cols-4 md:gap-x-4">
          {s.stats.map((stat, i) => (
            <div
              key={i}
              className={`flex flex-col gap-1.5 ${i > 0 ? "md:border-l md:border-border md:pl-8" : ""}`}
            >
              <span className="font-display text-[clamp(1.6rem,3.6vw,2.5rem)] leading-none tracking-[-0.03em]">
                {stat.value}
              </span>
              <span className="text-sm text-muted">{stat.label}</span>
            </div>
          ))}
        </section>
      )}

      {(offer.otoVideoUrl || offer.imageUrl) && (
        <section className="-mt-4">
          <OtoMedia offer={offer} className="shadow-[0_40px_90px_-55px_rgba(11,11,13,0.6)]" />
        </section>
      )}

      {/* ── First close. 60/40 split: someone already sold buys here. */}
      <section className="grid grid-cols-1 items-start gap-8 md:grid-cols-12 md:gap-12">
        <div className="flex flex-col gap-5 md:col-span-7">
          {body.map((p, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? "text-[1.35rem] leading-[1.45] text-pretty md:text-[1.6rem]"
                  : "leading-relaxed text-fg/75 text-pretty"
              }
            >
              {p}
            </p>
          ))}
        </div>
        <div className="md:col-span-5">
          <Offer view={view} />
        </div>
      </section>

      {/* ── The problem, drenched. First dark band; the page changes world. */}
      {problem.length > 0 && (
        <section
          className="rounded-[2rem] px-6 py-12 text-white md:px-14 md:py-24"
          style={NAVY_BAND}
        >
          <div className="flex max-w-[46ch] flex-col gap-6">
            <h2 className="font-display text-[clamp(1.9rem,4.6vw,3.1rem)] leading-[1.05] tracking-[-0.03em] text-balance">
              <Emphasised text={problem[0]} />
            </h2>
            {problem.slice(1).map((p, i) => (
              // Light type on dark needs the extra line-height to hold weight.
              <p key={i} className="text-lg leading-[1.7] text-white/80 text-pretty">
                {p}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* ── What you get. A ruled list, not a card grid: the first item runs at
          display size and full width, the rest sit in two columns beneath it. */}
      {lead && (
        <section className="flex flex-col gap-10">
          <h2 className="font-display text-[clamp(1.7rem,4vw,2.6rem)] leading-[1.05] tracking-[-0.03em]">
            What you actually get
          </h2>

          <div className="flex flex-col gap-2 border-t border-border pt-8">
            <h3 className="font-display text-[clamp(1.5rem,3.4vw,2.1rem)] leading-tight tracking-[-0.02em] text-navy">
              {lead.title}
            </h3>
            {lead.body && (
              <p className="max-w-[54ch] text-lg leading-relaxed text-fg/75 text-pretty">{lead.body}</p>
            )}
          </div>

          {rest.length > 0 && (
            <div className="grid grid-cols-1 gap-x-12 sm:grid-cols-2">
              {rest.map((b, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-1.5 border-t border-border py-6"
                >
                  <span className="font-medium">{b.title}</span>
                  {b.body && (
                    <span className="text-sm leading-relaxed text-muted text-pretty">{b.body}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {s.testimonials && s.testimonials.length > 0 && (
        <section className="flex flex-col gap-10">
          <h2 className="font-display text-[clamp(1.7rem,4vw,2.6rem)] leading-[1.05] tracking-[-0.03em]">
            What people did with it
          </h2>
          <div className="grid grid-cols-1 gap-x-12 md:grid-cols-3">
            {s.testimonials.map((t, i) => (
              <figure key={i} className="flex flex-col gap-4 border-t border-border py-7">
                <blockquote className="text-[1.05rem] leading-relaxed text-pretty">
                  {t.quote}
                </blockquote>
                <figcaption className="mt-auto flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{t.name}</span>
                  {t.result && <span className="text-sm text-plum">{t.result}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* ── Comparison. The offer's row inverts to solid ink rather than being
          tinted, so the answer is unmissable at a glance. */}
      {s.comparison && s.comparison.length > 0 && (
        <section className="flex flex-col gap-10">
          <h2 className="font-display text-[clamp(1.7rem,4vw,2.6rem)] leading-[1.05] tracking-[-0.03em]">
            What this replaces
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse">
              <tbody>
                {s.comparison.map((row, i) => {
                  const isOffer = i === s.comparison!.length - 1;
                  return (
                    <tr
                      key={i}
                      className={isOffer ? "text-white" : "border-t border-border"}
                      style={isOffer ? NAVY_BAND : undefined}
                    >
                      <td
                        className={`py-5 ${isOffer ? "rounded-l-2xl pl-5 font-medium md:pl-7" : ""}`}
                      >
                        {row.option}
                      </td>
                      <td
                        className={`py-5 text-right ${isOffer ? "font-display text-xl tracking-[-0.02em]" : "font-display text-lg text-fg/80"}`}
                      >
                        {row.cost}
                      </td>
                      <td
                        className={`py-5 pl-6 text-right text-sm ${isOffer ? "rounded-r-2xl pr-5 text-white/80 md:pr-7" : "text-muted"}`}
                      >
                        {row.time}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Mid-page close. A rule and a line of type rather than a third card:
          the same block three times reads as nagging, and the reader who is
          ready here wants a button, not another pitch. */}
      <section className="flex flex-col gap-6 border-y border-border py-10 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
        <div className="flex flex-col gap-1">
          <span className="font-display text-2xl leading-tight tracking-[-0.02em] md:text-[1.75rem]">
            {money(view.chargeNowCents, offer.currency)} today
          </span>
          {view.recurringNote && (
            <span className="text-sm text-muted">{view.recurringNote}. Cancel any time.</span>
          )}
        </div>
        <div className="w-full sm:w-auto sm:min-w-[18rem]">
          <OtoActions view={view} />
        </div>
      </section>

      {s.faq && s.faq.length > 0 && (
        <section className="grid grid-cols-1 gap-8 md:grid-cols-12">
          <h2 className="font-display text-[clamp(1.7rem,4vw,2.6rem)] leading-[1.05] tracking-[-0.03em] md:col-span-4">
            Questions
          </h2>
          <div className="flex flex-col md:col-span-8">
            {s.faq.map((item, i) => (
              // <details> rather than JS: works before hydration, keyboard
              // accessible for free, and prints.
              <details key={i} className="group border-t border-border last:border-b">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-medium marker:content-none">
                  {item.q}
                  <span
                    aria-hidden
                    className="shrink-0 text-2xl font-light leading-none text-muted transition-transform duration-300 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] group-open:rotate-45 motion-reduce:transition-none"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-[62ch] pb-6 leading-relaxed text-fg/75 text-pretty">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* ── The close. Last dark band, biggest type on the page. */}
      <section
        className="rounded-[2rem] px-6 py-12 text-white md:px-14 md:py-20"
        style={NAVY_BAND}
      >
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-14">
          <h2 className="font-display text-[clamp(2rem,5vw,3.4rem)] leading-[1.02] tracking-[-0.035em] text-balance md:col-span-6">
            <Emphasised text={offer.headline} />
          </h2>
          <div className="md:col-span-6">
            <Offer view={view} onDark />
          </div>
        </div>
      </section>
    </div>
  );
}
