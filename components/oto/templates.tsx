import { OtoActions, OtoBullets, OtoMedia, OtoPrice, type OtoView } from "@/components/oto/shell";

// Three layouts for the same offer. They differ in what they lead with, which
// is the only difference that matters on an upsell:
//
//   short   the offer itself, for something obvious and cheap
//   visual  the thing, for anything better shown than described
//   long    the argument, for something that needs justifying after a purchase
//
// None of them owns the accept button, the price maths, or the token. Those
// live in shell.tsx precisely so a new template cannot get money wrong.

/** Minimal and centred. Reads in five seconds. */
export function ShortOto({ view }: { view: OtoView }) {
  const { offer } = view;
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-7 py-10">
      <div className="flex flex-col gap-3 text-center">
        <span className="kicker text-primary">One-time offer</span>
        <h1 className="text-3xl leading-tight text-balance">{offer.headline}</h1>
        {offer.description && <p className="text-muted text-pretty">{offer.description}</p>}
      </div>

      <div className="flex flex-col gap-6 rounded-3xl border border-border bg-surface p-7">
        <OtoBullets bullets={offer.bullets} />
        <OtoPrice view={view} className="border-t border-border pt-5" />
        <OtoActions view={view} />
      </div>
    </div>
  );
}

/** Media-led, two columns on desktop. The default. */
export function VisualOto({ view }: { view: OtoView }) {
  const { offer } = view;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-8 md:py-12">
      <div className="flex flex-col gap-3 text-center">
        <span className="kicker text-primary">One-time offer</span>
        <h1 className="text-3xl leading-tight text-balance md:text-4xl">{offer.headline}</h1>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-10">
        <div className="md:col-span-7">
          <OtoMedia offer={offer} />
          {offer.description && (
            <p className="pt-5 text-muted text-pretty">{offer.description}</p>
          )}
        </div>

        <div className="flex flex-col gap-6 rounded-3xl border border-border bg-surface p-6 md:col-span-5 md:p-7">
          <OtoBullets bullets={offer.bullets} />
          <OtoPrice view={view} className="border-t border-border pt-5" />
          <OtoActions view={view} />
        </div>
      </div>
    </div>
  );
}

/**
 * Long-form. Body copy carries the argument, and the offer is repeated at the
 * bottom so nobody has to scroll back up to accept — the single most common
 * reason a long page underperforms.
 */
export function LongOto({ view }: { view: OtoView }) {
  const { offer } = view;
  const paragraphs = (offer.otoBody ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 py-10">
      <div className="flex flex-col gap-4">
        <span className="kicker text-primary">One-time offer</span>
        <h1 className="text-3xl leading-tight text-balance md:text-[2.6rem] md:leading-[1.1]">
          {offer.headline}
        </h1>
        {offer.description && <p className="text-lg text-muted text-pretty">{offer.description}</p>}
      </div>

      <OtoMedia offer={offer} />

      {paragraphs.length > 0 && (
        <div className="flex flex-col gap-4 text-pretty leading-relaxed">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {offer.bullets.length > 0 && (
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface-2 p-7">
          <span className="kicker text-muted">What you get</span>
          <OtoBullets bullets={offer.bullets} />
        </div>
      )}

      <div className="flex flex-col gap-6 rounded-3xl border border-border bg-surface p-7">
        <OtoPrice view={view} />
        <OtoActions view={view} />
      </div>
    </div>
  );
}
