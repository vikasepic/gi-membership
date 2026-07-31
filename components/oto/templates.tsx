import {
  Emphasised,
  OtoActions,
  OtoBullets,
  OtoMedia,
  OtoPrice,
  type OtoView,
} from "@/components/oto/shell";

// Three shorter upsell layouts, built in the same committed world as the
// long-form sales page: the category standard at full fidelity, no irony.
//
// They differ in what they lead with, which is the only difference that matters
// on an upsell:
//
//   short   the offer itself, for something obvious and cheap
//   visual  the thing, for anything better shown than described
//   long    the argument, for something that needs justifying after a purchase
//
// None owns the accept button, the price maths, or the token. Those live in
// shell.tsx precisely so a new layout cannot get money wrong.

/** Minimal and centred. Reads in five seconds. */
export function ShortOto({ view }: { view: OtoView }) {
  const { offer } = view;
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 py-10">
      <div className="rise flex flex-col gap-4 text-center">
        <h1 className="font-display text-[clamp(1.9rem,5vw,2.75rem)] leading-[1.05] tracking-[-0.03em] text-balance">
          <Emphasised text={offer.headline} />
        </h1>
        {offer.description && (
          <p className="text-lg leading-relaxed text-fg/75 text-pretty">{offer.description}</p>
        )}
      </div>

      <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-7 shadow-[0_20px_50px_-32px_rgba(11,11,13,0.45)]">
        <OtoBullets bullets={offer.bullets} />
        <div className="border-t border-border pt-5">
          <OtoPrice view={view} />
        </div>
        <OtoActions view={view} />
      </div>
    </div>
  );
}

/** Media-led, two columns on desktop. The default. */
export function VisualOto({ view }: { view: OtoView }) {
  const { offer } = view;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 py-8 md:py-12">
      <div className="rise mx-auto flex max-w-3xl flex-col gap-4 text-center">
        <h1 className="font-display text-[clamp(2rem,5.5vw,3.25rem)] leading-[1.03] tracking-[-0.035em] text-balance">
          <Emphasised text={offer.headline} />
        </h1>
        {offer.description && (
          <p className="text-lg leading-relaxed text-fg/75 text-pretty">{offer.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-12 md:gap-10">
        <div className="md:col-span-7">
          <OtoMedia offer={offer} className="shadow-[0_30px_70px_-45px_rgba(11,11,13,0.5)]" />
        </div>
        <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_50px_-32px_rgba(11,11,13,0.45)] md:col-span-5 md:p-7">
          <OtoBullets bullets={offer.bullets} />
          <div className="border-t border-border pt-5">
            <OtoPrice view={view} />
          </div>
          <OtoActions view={view} />
        </div>
      </div>
    </div>
  );
}

/**
 * Long-form. Body copy carries the argument, and the offer is repeated at the
 * bottom so nobody scrolls back up to accept — the most common reason a long
 * page underperforms.
 */
export function LongOto({ view }: { view: OtoView }) {
  const { offer } = view;
  const paragraphs = (offer.otoBody ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-12 py-10">
      <div className="rise flex flex-col gap-5">
        <h1 className="font-display text-[clamp(2.1rem,5.5vw,3.25rem)] leading-[1.03] tracking-[-0.035em] text-balance">
          <Emphasised text={offer.headline} />
        </h1>
        {offer.description && (
          <p className="text-xl leading-relaxed text-fg/75 text-pretty">{offer.description}</p>
        )}
      </div>

      <OtoMedia offer={offer} className="shadow-[0_30px_70px_-45px_rgba(11,11,13,0.5)]" />

      {paragraphs.length > 0 && (
        <div className="flex flex-col gap-5">
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? "text-[1.3rem] leading-[1.5] text-pretty"
                  : "text-lg leading-relaxed text-fg/75 text-pretty"
              }
            >
              {p}
            </p>
          ))}
        </div>
      )}

      {offer.bullets.length > 0 && (
        <div className="flex flex-col gap-5 rounded-2xl bg-surface-2 p-7">
          <h2 className="font-display text-2xl leading-tight tracking-[-0.02em]">What you get</h2>
          <OtoBullets bullets={offer.bullets} />
        </div>
      )}

      <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-7 shadow-[0_20px_50px_-32px_rgba(11,11,13,0.45)]">
        <OtoPrice view={view} />
        <OtoActions view={view} />
      </div>
    </div>
  );
}
