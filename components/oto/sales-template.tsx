import { Emphasised, OtoBullets, OtoMedia, type OtoView } from "@/components/oto/shell";
import {
  BLEED,
  Band,
  BenefitCards,
  ComparisonCards,
  Cta,
  FaqGrid,
  FinalCta,
  H2,
  Hero,
  NAVY,
  P,
  PLUM,
  PricingCard,
  StatBar,
} from "@/components/oto/kit";
import { AccentLine, ResultCard } from "@/components/oto/templates";
import { readOtoSections } from "@/lib/oto-sections";

// The full long-form layout, data-driven.
//
// Same structure and visual system as the bespoke Content Engine page — navy
// hero with a stat card, tabular stat bar, alternating bands, rose cards, a
// plum callout, comparison cards with a plum best-value, a pricing card, a
// two-column open FAQ, and a navy close — but every section comes from the
// offer record, so any offer can use it without code.
//
// Sections with no content are skipped, so one layout serves a four-section
// offer and a twelve-section one.

export function SalesOto({ view }: { view: OtoView }) {
  const { offer } = view;
  const s = readOtoSections(offer.otoSections);
  const stats = (s.stats ?? []).map((x) => ({ value: x.value, label: x.label }));
  const body = (offer.otoBody ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const problem = (s.problem ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const hasMedia = Boolean(offer.otoVideoUrl || offer.imageUrl);
  const title = offer.name.split("—")[0].trim();

  return (
    <div className={`${BLEED} flex flex-col`}>
      {/* Hook, with the terms already visible beside it. */}
      <Hero
        view={view}
        headline={<Emphasised text={offer.headline} />}
        description={offer.description}
        stats={stats.slice(0, 4)}
      />

      {stats.length > 0 && <StatBar stats={stats} />}

      {hasMedia && (
        <Band tone="white">
          <OtoMedia offer={offer} className="shadow-[0_30px_70px_-45px_rgba(17,50,91,0.5)]" />
        </Band>
      )}

      {/* The problem. */}
      {problem.length > 0 && (
        <Band tone="grey">
          <div className="flex flex-col items-center gap-6 text-center">
            <H2 className="max-w-[26ch]">
              <Emphasised text={problem[0]} />
            </H2>
            {problem.slice(1).map((p, i) => (
              <P key={i} className="max-w-[62ch]">
                {p}
              </P>
            ))}
          </div>
        </Band>
      )}

      {/* The mechanism, closing on the strongest single claim. */}
      {body.length > 0 && (
        <Band tone="white">
          <div className="flex flex-col items-center gap-6 text-center">
            {body.slice(0, -1).map((p, i) =>
              i === 0 ? (
                <P key={i} className="max-w-[60ch] !text-[1.25rem] !leading-[1.6]" style={{ color: NAVY }}>
                  {p}
                </P>
              ) : (
                <P key={i} className="max-w-[62ch]">
                  {p}
                </P>
              ),
            )}
            {body.length > 1 ? (
              <ResultCard>
                <p className="text-[1.02rem] font-semibold leading-relaxed" style={{ color: NAVY }}>
                  {body[body.length - 1]}
                </p>
              </ResultCard>
            ) : (
              <P className="max-w-[62ch]">{body[0]}</P>
            )}
          </div>
        </Band>
      )}

      {/* What you get. */}
      {s.benefits && s.benefits.length > 0 && (
        <Band tone="grey">
          <div className="flex flex-col gap-9">
            <H2 className="text-center">What you actually get</H2>
            <BenefitCards items={s.benefits} />
          </div>
        </Band>
      )}

      {/* A first close, before the comparison. */}
      <Band tone="white">
        <div className="flex flex-col items-center gap-7">
          <H2 className="max-w-[24ch] text-center">{offer.headline.replace(/\*/g, "")}</H2>
          <PricingCard view={view} title={title} />
        </div>
      </Band>

      {/* Proof, only when real quotes exist. */}
      {s.testimonials && s.testimonials.length > 0 && (
        <Band tone="grey">
          <div className="flex flex-col gap-9">
            <H2 className="text-center">What people did with it</H2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {s.testimonials.map((t, i) => (
                <figure
                  key={i}
                  className="flex flex-col gap-5 rounded-2xl p-7 text-white"
                  style={{ background: PLUM }}
                >
                  <blockquote className="text-[0.98rem] leading-relaxed text-pretty">
                    {t.quote}
                  </blockquote>
                  <figcaption className="mt-auto flex flex-col gap-0.5 border-t border-white/20 pt-4">
                    <span className="font-medium">{t.name}</span>
                    {t.result && <span className="text-sm text-white/75">{t.result}</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </Band>
      )}

      {/* What it replaces. */}
      {s.comparison && s.comparison.length > 0 && (
        <Band tone="grey">
          <div className="flex flex-col gap-10">
            <H2 className="text-center">What this replaces</H2>
            <ComparisonCards rows={s.comparison} />
          </div>
        </Band>
      )}

      {/* Bullets as the reassurance block, with the accent line. */}
      {offer.bullets.length > 0 && (
        <Band tone="rose">
          <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12 md:gap-12">
            <div className="flex flex-col gap-5 md:col-span-7">
              <H2 className="!text-[1.5rem]">Everything, one more time</H2>
              <OtoBullets bullets={offer.bullets} />
            </div>
            <div className="md:col-span-5">
              <AccentLine>
                {view.recurringNote
                  ? `${view.recurringNote}. Cancel any time.`
                  : "One click — your card is already saved."}
              </AccentLine>
              <div className="pt-5">
                <Cta view={view} />
              </div>
            </div>
          </div>
        </Band>
      )}

      {/* Objections. */}
      {s.faq && s.faq.length > 0 && (
        <Band tone="white">
          <div className="flex flex-col gap-10">
            <H2 className="text-center">Everything you want to know</H2>
            <FaqGrid items={s.faq} />
          </div>
        </Band>
      )}

      <FinalCta
        view={view}
        headline={offer.headline.replace(/\*/g, "")}
        checklist={offer.bullets.slice(0, 4)}
      />
    </div>
  );
}
