import Link from "next/link";
import { LEGAL } from "@/lib/legal";

/**
 * The half of the checkout that keeps selling.
 *
 * Not a summary — the prices live with the form, beside the button that charges
 * them. This side answers the questions someone asks themselves while their
 * card is out: what am I actually getting, what happens if I hate it, and where
 * does this number go. All of it visible without scrolling, because that is
 * when the doubt arrives.
 *
 * Every line is one this store can keep. Stripe's Payment Element owns the card
 * fields, so no card value reaches our servers; access is granted by
 * finalizeOrder the moment payment clears; the refund window is the one the
 * policy pages state. Nothing borrowed, nothing invented — a claim a buyer can
 * check and find false costs more than saying nothing.
 */
export function CheckoutPanel({
  title,
  tagline,
  coverUrl,
  backHref,
  /** Present when there is a trial on offer — it changes what needs reassuring. */
  hasTrial,
}: {
  title: string;
  tagline: string | null;
  coverUrl: string | null;
  backHref: string;
  hasTrial?: boolean;
}) {
  return (
    <aside
      className="relative flex flex-col gap-6 border-b border-border px-6 py-8 md:px-8 lg:min-h-dvh lg:border-b-0 lg:border-r lg:py-10"
      style={{
        // A light ground with a warm cast, so the two halves read as one page
        // seen from two angles rather than two sites bolted together.
        background:
          "linear-gradient(165deg, color-mix(in srgb, var(--primary) 9%, var(--surface)) 0%, var(--surface-2) 55%, var(--surface-2) 100%)",
      }}
    >
      {/* Matched to the form's width on the other side, and pushed toward it,
          so the two halves read as one page rather than two columns that happen
          to be adjacent. */}
      <div className="mx-auto flex w-full max-w-[30rem] items-center justify-between gap-4 lg:ml-auto lg:mr-0 lg:pr-4">
        <Link href={backHref} className="kicker text-muted transition-colors hover:text-fg">
          &larr; Back
        </Link>
        {/* Where they are, spelled out. Anyone who was taught to check the
            address bar can check without leaving the page to do it. */}
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 shrink-0 fill-current">
            <path d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2ZM9 7a3 3 0 1 1 6 0v2H9V7Z" />
          </svg>
          grow.greaterinside.com
        </span>
      </div>

      {/* Starts at the top, beside the form, rather than floating in the middle
          of a full-height column. Centring it piled all the empty space above
          the cover and left the two halves starting in different places. */}
      <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 lg:ml-auto lg:mr-0 lg:pr-4">
        {coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={coverUrl}
            alt=""
            className="aspect-[16/10] w-full rounded-2xl border border-border object-cover shadow-[0_20px_50px_-24px_rgba(0,0,0,.4)]"
          />
        ) : (
          <div className="aspect-[16/10] w-full rounded-2xl border border-border bg-surface" />
        )}

        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl leading-tight md:text-3xl">{title}</h1>
          {tagline && <p className="text-muted">{tagline}</p>}
        </div>

        <ul className="flex flex-col gap-3 border-t border-border pt-6">
          <Reassurance>
            Your card details go straight to Stripe. They never reach our servers.
          </Reassurance>
          <Reassurance>
            {LEGAL.refundWindowDays} days to change your mind, whatever the reason.
          </Reassurance>
          <Reassurance>Access opens the moment the payment clears — nothing to wait for.</Reassurance>
          {hasTrial && (
            <Reassurance>
              If you take the free trial, we email you before it ends and turns into a payment.
              Cancelling takes two clicks from your account.
            </Reassurance>
          )}
        </ul>
      </div>
    </aside>
  );
}

function Reassurance({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-muted">
      <svg viewBox="0 0 24 24" aria-hidden className="mt-0.5 size-4 shrink-0 fill-current text-navy">
        <path d="M9.6 16.6 4.8 11.8l1.4-1.4 3.4 3.4 7.2-7.2 1.4 1.4-8.6 8.6Z" />
      </svg>
      <span>{children}</span>
    </li>
  );
}
