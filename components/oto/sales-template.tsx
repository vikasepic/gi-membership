import { OtoActions, OtoBullets, OtoMedia, OtoPrice, type OtoView } from "@/components/oto/shell";
import { readOtoSections } from "@/lib/oto-sections";

// Long-form sales page.
//
// Follows the structure of a real launch page — hero, proof, problem,
// benefits, testimonials, price comparison, FAQ, with the offer repeated as
// you scroll — rather than the visual style of any one of them. It uses this
// store's own type scale, borders and terracotta accent, so an upsell reached
// straight after checkout does not feel like it belongs to a different company.
//
// Every section is skipped when its content is empty, so the same template
// serves a three-section page and a ten-section one. That is what makes it a
// template rather than a page: which sections exist is a per-offer decision.

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl leading-tight text-balance md:text-3xl">{children}</h2>
  );
}

/** The offer block. Repeated down the page — nobody should scroll back up. */
function OfferBlock({ view }: { view: OtoView }) {
  return (
    <div className="flex flex-col gap-6 rounded-3xl border border-border bg-surface p-7 md:p-9">
      <OtoBullets bullets={view.offer.bullets} />
      <OtoPrice view={view} className="border-t border-border pt-5" />
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
    <div className="flex w-full flex-col gap-16 py-8 md:gap-24 md:py-14">
      {/* Hero */}
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 text-center">
        <span className="kicker text-primary">One-time offer</span>
        <h1 className="text-[2.1rem] leading-[1.08] tracking-tight text-balance md:text-[3.4rem]">
          {offer.headline}
        </h1>
        {offer.description && (
          <p className="mx-auto max-w-xl text-lg text-muted text-pretty">{offer.description}</p>
        )}
      </section>

      {/* Stat boxes — the offer's terms at a glance, before any argument. */}
      {s.stats && s.stats.length > 0 && (
        <section className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
          {s.stats.map((stat, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5 text-center"
            >
              <span className="font-display text-xl leading-tight md:text-2xl">{stat.value}</span>
              <span className="text-xs text-muted">{stat.label}</span>
            </div>
          ))}
        </section>
      )}

      {(offer.otoVideoUrl || offer.imageUrl) && (
        <section className="mx-auto w-full max-w-3xl">
          <OtoMedia offer={offer} />
        </section>
      )}

      {/* First CTA: someone already sold should not have to read the argument. */}
      <section className="mx-auto w-full max-w-xl">
        <OfferBlock view={view} />
      </section>

      {problem.length > 0 && (
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <SectionHeading>{problem[0]}</SectionHeading>
          {problem.slice(1).map((p, i) => (
            <p key={i} className="text-muted text-pretty leading-relaxed">{p}</p>
          ))}
        </section>
      )}

      {body.length > 0 && (
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 text-pretty leading-relaxed">
          {body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>
      )}

      {s.benefits && s.benefits.length > 0 && (
        <section className="mx-auto flex w-full max-w-4xl flex-col gap-7">
          <SectionHeading>What changes</SectionHeading>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {s.benefits.map((b, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6">
                <span className="font-medium">{b.title}</span>
                {b.body && <span className="text-sm text-muted text-pretty">{b.body}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {s.testimonials && s.testimonials.length > 0 && (
        <section className="mx-auto flex w-full max-w-4xl flex-col gap-7">
          <SectionHeading>What people did with it</SectionHeading>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {s.testimonials.map((t, i) => (
              <figure key={i} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
                <blockquote className="text-sm leading-relaxed text-pretty">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-auto flex flex-col gap-0.5 border-t border-border pt-4">
                  <span className="text-sm font-medium">{t.name}</span>
                  {t.result && <span className="text-xs text-primary">{t.result}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* Price comparison. Scrolls on its own rather than pushing the page
          sideways on a phone — a table is the classic cause of that. */}
      {s.comparison && s.comparison.length > 0 && (
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-7">
          <SectionHeading>What this replaces</SectionHeading>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <tbody>
                {s.comparison.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="p-4">{row.option}</td>
                    <td className="p-4 text-right font-medium">{row.cost}</td>
                    <td className="p-4 text-right text-muted">{row.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Second CTA, after the argument has been made. */}
      <section className="mx-auto w-full max-w-xl">
        <OfferBlock view={view} />
      </section>

      {s.faq && s.faq.length > 0 && (
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <SectionHeading>Questions</SectionHeading>
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
            {s.faq.map((item, i) => (
              // <details> rather than JS: it works before hydration, it is
              // keyboard accessible for free, and it prints.
              <details key={i} className="group p-5">
                <summary className="cursor-pointer list-none text-sm font-medium marker:content-none">
                  <span className="flex items-center justify-between gap-4">
                    {item.q}
                    <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                      +
                    </span>
                  </span>
                </summary>
                <p className="pt-3 text-sm text-muted text-pretty leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Final CTA. */}
      <section className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <h2 className="text-center text-2xl leading-tight text-balance">{offer.headline}</h2>
        <OfferBlock view={view} />
      </section>
    </div>
  );
}
