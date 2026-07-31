import Link from "next/link";
import { money } from "@/lib/money";
import { acceptOtoAction } from "@/app/(store)/checkout/oto/actions";
import type { Offer } from "@/lib/types";

// The parts of an upsell page that must never vary.
//
// Templates own layout and nothing else. Accepting is a POST to one server
// action, the token travels in the form, and the price shown is derived from
// the offer — so a bespoke page written months from now cannot accidentally
// charge the wrong amount, re-ask for a card, or turn accept into a GET that a
// link prefetcher could fire.

export type OtoView = {
  offer: Offer;
  token: string;
  chargeNowCents: number;
  /** e.g. "then $47/month after a 7-day trial" — null for one-off offers. */
  recurringNote: string | null;
};

/** The price, said plainly. A trial that bills silently later is the complaint. */
export function OtoPrice({ view, className = "" }: { view: OtoView; className?: string }) {
  const { offer, chargeNowCents, recurringNote } = view;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-display text-3xl">
          {money(chargeNowCents, offer.currency)}
        </span>
        <span className="text-muted">today</span>
      </div>
      {recurringNote && <span className="text-sm text-muted">{recurringNote}. Cancel any time.</span>}
    </div>
  );
}

/**
 * Accept and decline. The only way to take an upsell.
 *
 * One click and no card entry: the card was saved at checkout, so this charges
 * off-session. The token is single-use, which is what stops the price being
 * replayed from a shared or bookmarked URL.
 */
export function OtoActions({ view, className = "" }: { view: OtoView; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <form action={acceptOtoAction}>
        <input type="hidden" name="token" value={view.token} />
        <button
          type="submit"
          className="group flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 font-medium text-primary-fg transition-[transform,background-color] duration-200 hover:bg-primary-hover active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          {view.offer.acceptLabel}
          <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-current transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0">
            <path d="M13 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2h12.2l-4.6-4.6L13 5Z" />
          </svg>
        </button>
      </form>
      {/* Declining must be as easy to find as accepting. A hidden decline turns
          a good offer into a dark pattern, and the refund arrives anyway. */}
      <Link
        href="/checkout/thank-you?oto=declined"
        className="text-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        {view.offer.declineLabel}
      </Link>
      <p className="text-center text-xs text-muted">
        One click — your card is already saved. Nothing else to fill in.
      </p>
    </div>
  );
}

/** Bullets, shared so every template lists proof the same way. */
export function OtoBullets({ bullets, className = "" }: { bullets: string[]; className?: string }) {
  if (bullets.length === 0) return null;
  return (
    <ul className={`flex flex-col gap-2.5 ${className}`}>
      {bullets.map((b) => (
        <li key={b} className="flex items-start gap-3 text-sm">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

/** Hero media: the video if there is one, else the image, else nothing. */
export function OtoMedia({ offer, className = "" }: { offer: Offer; className?: string }) {
  if (offer.otoVideoUrl) {
    return (
      <div className={`aspect-video w-full overflow-hidden rounded-2xl border border-border bg-surface-2 ${className}`}>
        <iframe
          src={offer.otoVideoUrl}
          title={offer.headline}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    );
  }
  if (offer.imageUrl) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return (
      <img
        src={offer.imageUrl}
        alt=""
        className={`w-full rounded-2xl border border-border object-cover ${className}`}
      />
    );
  }
  return null;
}
