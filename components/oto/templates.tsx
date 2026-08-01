import { Emphasised, OtoBullets, OtoMedia, type OtoView } from "@/components/oto/shell";
import {
  BLEED,
  Band,
  BenefitCards,
  Cta,
  FinalCta,
  H2,
  Hero,
  NAVY,
  P,
  PLUM,
  PricingCard,
  ROSE,
  StatBar,
  TERRA,
  TickIcon,
} from "@/components/oto/kit";
import { readOtoSections } from "@/lib/oto-sections";

// Three shorter upsell layouts, in the same visual world as the bespoke page:
// navy hero, alternating bands, rose cards, plum emphasis, terracotta CTA.
//
// They differ in what they lead with, which is the only difference that matters
// on an upsell:
//
//   short   the offer itself, for something obvious and cheap
//   visual  the thing, for anything better shown than described
//   long    the argument, for something that needs justifying after a purchase
//
// None owns the accept button, the price maths, or the token. Those live in
// shell.tsx so a new layout cannot get money wrong.

const asStats = (s: ReturnType<typeof readOtoSections>) =>
  (s.stats ?? []).map((x) => ({ value: x.value, label: x.label }));

/** Compact: navy hero, the terms, one price card. Reads in fifteen seconds. */
export function ShortOto({ view }: { view: OtoView }) {
  const { offer } = view;
  const s = readOtoSections(offer.otoSections);
  const stats = asStats(s);

  return (
    <div className={`${BLEED} flex flex-col`}>
      <Hero
        view={view}
        headline={<Emphasised text={offer.headline} />}
        description={offer.description}
        stats={stats.slice(0, 4)}
      />

      <Band tone="white">
        <div className="flex flex-col items-center gap-8">
          {offer.bullets.length > 0 && (
            <div className="w-full max-w-xl rounded-2xl p-7" style={{ background: ROSE }}>
              <OtoBullets bullets={offer.bullets} />
            </div>
          )}
          <PricingCard view={view} title={offer.name.split("—")[0].trim()} />
        </div>
      </Band>
    </div>
  );
}

/** Media-led: the thing first, the terms beside it. */
export function VisualOto({ view }: { view: OtoView }) {
  const { offer } = view;
  const s = readOtoSections(offer.otoSections);
  const stats = asStats(s);
  const hasMedia = Boolean(offer.otoVideoUrl || offer.imageUrl);

  return (
    <div className={`${BLEED} flex flex-col`}>
      <Hero view={view} headline={<Emphasised text={offer.headline} />} description={offer.description} />

      {stats.length > 0 && <StatBar stats={stats} />}

      <Band tone="white" width="5xl">
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-12">
          <div className={hasMedia ? "md:col-span-7" : "md:col-span-7"}>
            {hasMedia ? (
              <OtoMedia offer={offer} className="shadow-[0_30px_70px_-45px_rgba(17,50,91,0.5)]" />
            ) : (
              // No asset: the bullets carry the panel rather than leaving a
              // grey rectangle where an image was meant to be.
              <div className="flex flex-col gap-5 rounded-2xl p-8" style={{ background: ROSE }}>
                <H2 className="!text-[1.4rem]">What you get</H2>
                <OtoBullets bullets={offer.bullets} />
              </div>
            )}
          </div>
          <div className="flex justify-center md:col-span-5">
            <PricingCard view={view} title={offer.name.split("—")[0].trim()} />
          </div>
        </div>
      </Band>

      {s.benefits && s.benefits.length > 0 && (
        <Band tone="grey">
          <div className="flex flex-col gap-9">
            <H2 className="text-center">What you actually get</H2>
            <BenefitCards items={s.benefits.slice(0, 3)} />
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

/** Story-led: the argument, then the offer. */
export function LongOto({ view }: { view: OtoView }) {
  const { offer } = view;
  const s = readOtoSections(offer.otoSections);
  const stats = asStats(s);
  const body = (offer.otoBody ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const problem = (s.problem ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className={`${BLEED} flex flex-col`}>
      <Hero view={view} headline={<Emphasised text={offer.headline} />} description={offer.description} />

      {stats.length > 0 && <StatBar stats={stats} />}

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

      {body.length > 0 && (
        <Band tone="white">
          <div className="flex flex-col items-center gap-6 text-center">
            {body.map((p, i) =>
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
          </div>
        </Band>
      )}

      {offer.bullets.length > 0 && (
        <Band tone="grey">
          <div className="mx-auto flex max-w-2xl flex-col gap-5 rounded-2xl p-8" style={{ background: ROSE }}>
            <H2 className="!text-[1.4rem]">What you get</H2>
            <OtoBullets bullets={offer.bullets} />
          </div>
        </Band>
      )}

      <Band tone="white">
        <div className="flex justify-center">
          <PricingCard view={view} title={offer.name.split("—")[0].trim()} />
        </div>
      </Band>

      <FinalCta
        view={view}
        headline={offer.headline.replace(/\*/g, "")}
        checklist={offer.bullets.slice(0, 4)}
      />
    </div>
  );
}

/**
 * A rose panel with a plum label — used by the sales layout for the strongest
 * single claim on the page.
 */
export function ResultCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 rounded-2xl p-7 text-left md:p-9" style={{ background: ROSE }}>
      <span
        className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-white"
        style={{ background: PLUM }}
      >
        <TickIcon className="size-3" />
        The result
      </span>
      {children}
    </div>
  );
}

/** Terracotta accent rule. One per section at most. */
export function AccentLine({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="border-l-2 py-1 pl-5 text-[1.05rem] font-medium italic leading-relaxed"
      style={{ borderColor: TERRA, color: NAVY }}
    >
      {children}
    </p>
  );
}

export { Cta };
