import {
  Check,
  Emphasised,
  OtoActions,
  OtoBullets,
  OtoMedia,
  OtoPrice,
  type OtoView,
} from "@/components/oto/shell";
import { readOtoSections } from "@/lib/oto-sections";
import { money } from "@/lib/money";

// Long-form upsell page, built as the category standard at full fidelity.
//
// The client was offered a dealt direction and two challengers and chose the
// conventional info-product sales page deliberately, with their own launch page
// as the craft bar. So this is the canon played straight — the same section
// order, density and proof-heavy rhythm — with no irony and nothing smuggled in
// to make it "interesting". The work is in the finish, not in the deviation.
//
// Section order, matching the reference: hook, the terms at a glance, an early
// close for anyone already sold, the problem, the mechanism, what you get,
// proof, what it replaces, a second close, objections, the last word.
//
// Every section is skipped when its content is empty, so the same page serves a
// four-section offer and a ten-section one.

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[clamp(1.65rem,3.6vw,2.4rem)] leading-[1.12] tracking-[-0.03em] text-balance">
      {children}
    </h2>
  );
}

/** A full-width band, used to separate the page into readable movements. */
function Band({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "cream" | "ink";
}) {
  const isInk = tone === "ink";
  return (
    <section
      className={`rounded-3xl px-6 py-12 md:px-12 md:py-16 ${isInk ? "text-white" : "bg-surface-2"}`}
      style={
        isInk
          ? {
              background:
                "linear-gradient(150deg, var(--navy), color-mix(in srgb, var(--plum) 45%, var(--navy)))",
            }
          : undefined
      }
    >
      {children}
    </section>
  );
}

/** The offer block. Repeated down the page; the reader never scrolls back. */
function OfferCard({ view }: { view: OtoView }) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_-32px_rgba(11,11,13,0.45)] md:p-8">
      <OtoBullets bullets={view.offer.bullets} />
      <div className="border-t border-border pt-5">
        <OtoPrice view={view} />
      </div>
      <OtoActions view={view} />
    </div>
  );
}

export function SalesOto({ view }: { view: OtoView }) {
  const { offer } = view;
  const s = readOtoSections(offer.otoSections);
  const body = (offer.otoBody ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const problem = (s.problem ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="flex w-full flex-col gap-14 pb-6 md:gap-20">
      {/* Hook. */}
      <section className="rise flex flex-col items-center gap-6 pt-6 text-center md:pt-12">
        <h1 className="max-w-[20ch] font-display text-[clamp(2.25rem,6vw,4.25rem)] leading-[1.02] tracking-[-0.035em] text-balance">
          <Emphasised text={offer.headline} />
        </h1>
        {offer.description && (
          <p className="max-w-[58ch] text-lg leading-relaxed text-fg/75 text-pretty md:text-xl">
            {offer.description}
          </p>
        )}
      </section>

      {/* The terms at a glance, before any argument. */}
      {s.stats && s.stats.length > 0 && (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {s.stats.map((stat, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface px-4 py-7 text-center"
            >
              <span className="font-display text-[clamp(1.5rem,3vw,2rem)] leading-none tracking-[-0.03em] text-navy">
                {stat.value}
              </span>
              <span className="text-sm text-muted">{stat.label}</span>
            </div>
          ))}
        </section>
      )}

      {(offer.otoVideoUrl || offer.imageUrl) && (
        <section className="mx-auto w-full max-w-3xl">
          <OtoMedia offer={offer} className="shadow-[0_30px_70px_-45px_rgba(11,11,13,0.5)]" />
        </section>
      )}

      {/* Early close: someone already sold should not have to read on. */}
      <section className="mx-auto w-full max-w-xl">
        <OfferCard view={view} />
      </section>

      {/* The problem. */}
      {problem.length > 0 && (
        <Band tone="cream">
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            <SectionHeading>
              <Emphasised text={problem[0]} />
            </SectionHeading>
            {problem.slice(1).map((p, i) => (
              <p key={i} className="text-lg leading-relaxed text-fg/80 text-pretty">
                {p}
              </p>
            ))}
          </div>
        </Band>
      )}

      {/* The mechanism. */}
      {body.length > 0 && (
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {body.map((p, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? "text-[1.3rem] leading-[1.5] text-pretty md:text-[1.45rem]"
                  : "text-lg leading-relaxed text-fg/75 text-pretty"
              }
            >
              {p}
            </p>
          ))}
        </section>
      )}

      {/* What you get. */}
      {s.benefits && s.benefits.length > 0 && (
        <section className="flex flex-col gap-8">
          <SectionHeading>What you actually get</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.benefits.map((b, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6"
              >
                <Check className="text-primary" />
                <span className="font-medium leading-snug">{b.title}</span>
                {b.body && (
                  <span className="text-sm leading-relaxed text-muted text-pretty">{b.body}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Proof. Rendered only when real quotes exist. */}
      {s.testimonials && s.testimonials.length > 0 && (
        <section className="flex flex-col gap-8">
          <SectionHeading>What people did with it</SectionHeading>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {s.testimonials.map((t, i) => (
              <figure
                key={i}
                className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6"
              >
                <blockquote className="leading-relaxed text-pretty">{t.quote}</blockquote>
                <figcaption className="mt-auto flex flex-col gap-0.5 border-t border-border pt-4">
                  <span className="font-medium">{t.name}</span>
                  {t.result && <span className="text-sm text-primary">{t.result}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* What it replaces. The offer's row is marked, not left for the reader
          to work out. */}
      {s.comparison && s.comparison.length > 0 && (
        <section className="flex flex-col gap-8">
          <SectionHeading>What this replaces</SectionHeading>
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <tbody>
                {s.comparison.map((row, i) => {
                  const isOffer = i === s.comparison!.length - 1;
                  return (
                    <tr
                      key={i}
                      className="border-b border-border last:border-b-0"
                      style={
                        isOffer
                          ? { background: "color-mix(in srgb, var(--primary) 9%, transparent)" }
                          : undefined
                      }
                    >
                      <td className="px-5 py-5 md:px-7">
                        <span className={isOffer ? "font-medium" : ""}>{row.option}</span>
                      </td>
                      <td className="px-5 py-5 text-right md:px-7">
                        <span
                          className={`font-display tracking-[-0.02em] ${isOffer ? "text-xl text-primary" : "text-lg text-fg/80"}`}
                        >
                          {row.cost}
                        </span>
                      </td>
                      <td className="px-5 py-5 text-right text-sm text-muted md:px-7">{row.time}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Second close. */}
      <section className="mx-auto w-full max-w-xl">
        <OfferCard view={view} />
      </section>

      {/* Objections. */}
      {s.faq && s.faq.length > 0 && (
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-7">
          <SectionHeading>Questions</SectionHeading>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {s.faq.map((item, i) => (
              // <details> rather than JS: works before hydration, keyboard
              // accessible for free, and prints.
              <details key={i} className="group border-b border-border last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-5 py-5 font-medium marker:content-none hover:bg-surface-2 md:px-7">
                  {item.q}
                  <span
                    aria-hidden
                    className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-lg leading-none text-muted transition-transform duration-300 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] group-open:rotate-45 motion-reduce:transition-none"
                  >
                    +
                  </span>
                </summary>
                <p className="px-5 pb-6 leading-relaxed text-fg/75 text-pretty md:px-7">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* The last word. */}
      <Band tone="ink">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 text-center">
          <h2 className="font-display text-[clamp(1.9rem,4.6vw,3rem)] leading-[1.05] tracking-[-0.035em] text-balance">
            <Emphasised text={offer.headline} />
          </h2>
          <OtoPrice view={view} size="xl" tone="band" />
          <div className="w-full max-w-sm">
            <OtoActions view={view} tone="band" />
          </div>
        </div>
      </Band>
    </div>
  );
}
