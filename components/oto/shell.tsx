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
  /**
   * The second billing option, when the offer declares one.
   *
   * Shown as a button beside the first. Both are one click on the same saved
   * card; which one was clicked travels as "alt", not as an id, so the choice
   * stays between the two prices the page actually displayed.
   */
  altOffer?: Offer | null;
  token: string;
  chargeNowCents: number;
  /** e.g. "then $47/month after your 7-day trial" — null for one-off offers. */
  recurringNote: string | null;
  /**
   * When this token stops working, in unix ms. Real: the token is signed with
   * a 15-minute TTL and verifyOtoToken refuses it afterwards, so a countdown
   * built on this is describing the actual state of the offer rather than
   * manufacturing pressure.
   */
  expiresAt?: number;
  /**
   * True in the admin preview only.
   *
   * The approved design carries marked placeholder blocks for the sections
   * whose copy does not exist yet — testimonials, the creator roster, the
   * founder story, the bonuses. Those show the client the whole structure,
   * which is the point of a preview. They must never reach a buyer: a page
   * that says "[Placeholder]" to someone who has just paid is worse than one
   * section short. So they render here and are omitted on the live page.
   */
  preview?: boolean;
};

// Drawn icons in one stroke weight. Unicode ticks and emoji are not an icon
// system: they change shape per platform and cannot hold a consistent weight
// next to the type.
export function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={`size-5 shrink-0 ${className}`} fill="none">
      <circle cx="10" cy="10" r="9" className="fill-current opacity-10" />
      <path
        d="M6 10.4l2.6 2.6L14.2 7.4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={`size-4 shrink-0 fill-current ${className}`}>
      <path d="M11 4l6 6-6 6-1.4-1.4 3.6-3.6H3v-2h10.2L9.6 5.4 11 4z" />
    </svg>
  );
}

export function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={`size-4 shrink-0 fill-current ${className}`}>
      <path d="M14 8V6a4 4 0 1 0-8 0v2H4.5v10h11V8H14ZM8 6a2 2 0 1 1 4 0v2H8V6Z" />
    </svg>
  );
}

/**
 * The buy block: price, one-click accept, decline, and the reassurance that
 * belongs beside a button rather than in a separate trust section.
 *
 * `tone="band"` renders it for a coloured section; the mechanics are identical.
 */
/** "$199 / year" — the alternative says what it is, not "the other one". */
function altLabel(alt: Offer): string {
  const price = money(alt.priceCents, alt.currency);
  return alt.interval ? `${price} / ${alt.interval}` : price;
}

/**
 * What the alternative saves, in the alternative's own terms.
 *
 * Derived from the two prices rather than typed, so it cannot drift from them.
 * "5 months free" is a fact about $199 against 12 × $29; a number someone typed
 * once is a claim that survives the next price change.
 */
function altSaving(main: Offer, alt: Offer): string | null {
  if (main.interval !== "month" || alt.interval !== "year") return null;
  const full = main.priceCents * 12;
  if (alt.priceCents >= full) return null;
  const months = Math.floor((full - alt.priceCents) / main.priceCents);
  if (months < 1) return null;
  return `${months} month${months === 1 ? "" : "s"} free`;
}

export function OtoActions({
  view,
  tone = "plain",
  className = "",
  buttonClassName,
  showNote = true,
  align = "stretch",
  acceptLabel,
  ink,
}: {
  view: OtoView;
  tone?: "plain" | "band";
  className?: string;
  /**
   * Restyle the button for a bespoke page. Appearance only — the form, the
   * token and the server action stay here, so a custom layout can never
   * reinvent the money path while reinventing the look.
   */
  buttonClassName?: string;
  /** Some pages carry the reassurance line once rather than at every CTA. */
  showNote?: boolean;
  align?: "stretch" | "start";
  /**
   * Override the button text. For layouts whose own copy is editable — the
   * label is presentation, so it may vary; the form, the token and the action
   * beneath it may not.
   */
  acceptLabel?: string;
  /**
   * The ink of the band this sits on.
   *
   * The alternative price is an outlined button, so it is drawn in the page's
   * text colour rather than a brand one — the same rule every block follows.
   * `currentColor` cannot do it: a button does not inherit colour by default,
   * and the value that reached it was black on a navy band, 1.6:1.
   */
  ink?: string;
}) {
  const onBand = tone === "band";
  const alt = view.altOffer;
  return (
    <div className={`flex flex-col gap-4 ${align === "start" ? "items-start" : ""} ${className}`}>
      <div className={`flex flex-wrap items-stretch gap-3 ${align === "start" ? "" : "w-full"}`}>
      <form action={acceptOtoAction} className={align === "start" ? "" : "flex-1"}>
        <input type="hidden" name="token" value={view.token} />
        <button
          type="submit"
          // White on brand terracotta (#c8653d) is 3.90:1 — under AA for a
          // 17px label. #b0532f is 5.09:1 and still unmistakably the brand
          // colour. Written as a literal rather than var(--primary-hover)
          // because that token flips LIGHTER in dark mode, which would make
          // the contrast worse exactly where it is already failing.
          className={buttonClassName ?? "group flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#b0532f] px-6 py-4 text-[1.05rem] font-medium text-white shadow-[0_12px_28px_-12px_rgba(176,83,47,0.55)] transition-[transform,background-color,box-shadow] duration-200 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:bg-[#9c4728] hover:shadow-[0_18px_38px_-14px_rgba(176,83,47,0.6)] active:scale-[0.995] motion-reduce:transition-none motion-reduce:active:scale-100"}
        >
          {acceptLabel || view.offer.acceptLabel}
          <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
        </button>
      </form>

      {alt && (
        // The second price, quieter than the first: one of them has to lead, or
        // the page asks the reader to make a decision before it has made a case.
        <form action={acceptOtoAction} className={align === "start" ? "" : "flex-1"}>
          <input type="hidden" name="token" value={view.token} />
          <input type="hidden" name="choice" value="alt" />
          <button
            type="submit"
            // Ink and rule from the band, not a fixed brand colour. Terracotta
            // on the navy band is 2.0:1 — this button lands on whichever band
            // the section is painted, so the only colour it can safely use is
            // the one the band already reads with.
            className="flex w-full flex-col items-center justify-center rounded-xl border px-6 py-3 transition-colors hover:[background-color:color-mix(in_srgb,currentColor_10%,transparent)]"
            style={{
              color: ink ?? (onBand ? "#ffffff" : undefined),
              borderColor: `color-mix(in srgb, ${ink ?? (onBand ? "#ffffff" : "currentColor")} 42%, transparent)`,
            }}
          >
            <span className="text-[1.02rem] font-medium">{altLabel(alt)}</span>
            {altSaving(view.offer, alt) && (
              <span className="text-xs opacity-75">{altSaving(view.offer, alt)}</span>
            )}
          </button>
        </form>
      )}
      </div>

      {showNote && (
        <p
          className={`flex items-center gap-1.5 text-xs ${align === "start" ? "" : "justify-center"} ${onBand ? "text-white/70" : "text-muted"}`}
        >
          <LockIcon className="opacity-70" />
          One click — your card is already saved. Nothing else to fill in.
        </p>
      )}

      {/* Declining is as findable as accepting. A buried decline converts once
          and refunds twice. */}
      <Link
        href="/checkout/thank-you?oto=declined"
        className={`text-sm underline underline-offset-4 transition-colors ${align === "start" ? "" : "text-center"} ${
          onBand ? "text-white/60 hover:text-white" : "text-muted hover:text-fg"
        }`}
      >
        {view.offer.declineLabel}
      </Link>
    </div>
  );
}

/** Price, stated with what happens when the trial ends. */
export function OtoPrice({
  view,
  size = "lg",
  tone = "plain",
}: {
  view: OtoView;
  size?: "lg" | "xl";
  tone?: "plain" | "band";
}) {
  const onBand = tone === "band";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <span
          className={`font-display leading-none tracking-[-0.03em] ${size === "xl" ? "text-[3.25rem]" : "text-[2.5rem]"}`}
        >
          {money(view.chargeNowCents, view.offer.currency)}
        </span>
        <span className={onBand ? "text-white/70" : "text-muted"}>today</span>
      </div>
      {view.recurringNote && (
        <p className={`text-sm ${onBand ? "text-white/70" : "text-muted"}`}>
          {view.recurringNote}. Cancel any time.
        </p>
      )}
    </div>
  );
}

export function OtoBullets({
  bullets,
  className = "",
}: {
  bullets: string[];
  className?: string;
}) {
  if (bullets.length === 0) return null;
  return (
    <ul className={`flex flex-col gap-3 ${className}`}>
      {bullets.map((b) => (
        <li key={b} className="flex items-start gap-3">
          <Check className="mt-0.5 text-navy" />
          <span className="text-[0.975rem] leading-relaxed">{b}</span>
        </li>
      ))}
    </ul>
  );
}

/** Hero media: the video if there is one, else the image, else nothing. */
export function OtoMedia({ offer, className = "" }: { offer: Offer; className?: string }) {
  if (offer.otoVideoUrl) {
    return (
      <div
        className={`aspect-video w-full overflow-hidden rounded-2xl border border-border bg-surface-2 ${className}`}
      >
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

/** `*word*` renders italic — headline emphasis without HTML in the database. */
export function Emphasised({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/g).map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <em key={i} className="italic text-primary">{p.slice(1, -1)}</em>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
