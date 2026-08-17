import Link from "next/link";

/**
 * The selling half of the redesigned checkout.
 *
 * Everything on it comes from a record. There is no field here that the admin
 * cannot fill in and no line that this component makes up: an empty bullet list
 * draws no list, a product with no cover draws no cover, and an offer with no
 * image draws nothing where the mock had a screenshot. The alternative — a
 * placeholder that looks like content — is how a checkout ships promising
 * something the store does not sell.
 *
 * Server component: it holds no state and never needs to. The paying half is
 * the client one.
 */
export function CheckoutStage({
  backHref,
  backLabel,
  eyebrow,
  title,
  sub,
  coverUrl,
  bullets,
  priceLabel,
  priceCaption,
}: {
  backHref: string;
  backLabel: string;
  /** The pill above the title — terms, never a claim. */
  eyebrow: string | null;
  title: string;
  sub: string | null;
  coverUrl: string | null;
  bullets: string[];
  /** The headline figure, where there is a single one worth showing. */
  priceLabel: string | null;
  priceCaption: string | null;
}) {
  return (
    /* The panel bleeds to the window edge; its CONTENT does not.
       Capped and pushed toward the divider, so on a wide monitor the two halves
       read as a pair rather than as a column of text stranded against a wall of
       navy. The back row stays at the top where a back control belongs; the
       rest is centred in whatever height is left, because a product with no
       checkout bullets would otherwise leave two thirds of this half empty. */
    <div className="checkout-v2-stage flex flex-col bg-[#1d2b3a] px-6 py-8 text-[#f3ede6] md:px-8 lg:px-10 lg:py-12">
      <div className="ml-auto flex w-full max-w-[26rem] items-center justify-between gap-4">
        <Link
          href={backHref}
          className="text-xs font-semibold uppercase tracking-[0.12em] text-[#f3ede6]/85 transition-opacity hover:opacity-100"
          style={{ fontSize: "0.72rem" }}
        >
          &larr; {backLabel}
        </Link>
        {/* Says what is true — the card fields are Stripe's, served over TLS.
            Not a badge borrowed from a security vendor we do not use. */}
        <span
          className="flex items-center gap-2 text-[#f3ede6]/80"
          style={{ fontSize: "0.78rem" }}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 shrink-0 fill-current">
            <path d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2ZM9 7a3 3 0 1 1 6 0v2H9V7Z" />
          </svg>
          Secure checkout
        </span>
      </div>

      <div className="ml-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center gap-6 py-8 lg:py-10">
      {eyebrow && (
        <span
          className="self-start rounded-full border border-[#c05f3c]/50 bg-[#c05f3c]/20 px-3 py-1.5 font-semibold uppercase tracking-[0.13em] text-[#e8a183]"
          style={{ fontSize: "0.69rem" }}
        >
          {eyebrow}
        </span>
      )}

      <h1
        className="font-display font-semibold leading-[1.1] tracking-[-0.025em]"
        style={{ fontSize: "clamp(1.55rem, 1.1rem + 1.9vw, 2.35rem)", textWrap: "balance" }}
      >
        {title}
      </h1>

      {sub && (
        <p className="text-[#c3cbd6]" style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
          {sub}
        </p>
      )}

      {(coverUrl || priceLabel) && (
        <div className="flex items-end gap-4 sm:gap-5">
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="w-[5.5rem] shrink-0 rounded-lg object-cover shadow-[0_18px_40px_-16px_rgba(0,0,0,.6)] sm:w-[8rem]"
              style={{ aspectRatio: "3 / 4" }}
            />
          )}
          {priceLabel && (
            <div className="flex flex-col">
              <span
                className="font-semibold uppercase tracking-[0.14em] text-[#8fa0b4]"
                style={{ fontSize: "0.68rem" }}
              >
                Price
              </span>
              <span
                className="font-display font-bold leading-none tracking-[-0.03em]"
                style={{ fontSize: "clamp(1.9rem, 1.2rem + 2.6vw, 3.25rem)" }}
              >
                {priceLabel}
              </span>
              {priceCaption && (
                <span className="mt-1.5 text-[#c3cbd6]" style={{ fontSize: "0.8rem" }}>
                  {priceCaption}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {bullets.length > 0 && (
        <>
          <span className="h-px w-full bg-[#f3ede6]/15" />
          {/* Shown on a phone too. The handoff hid these below the fold on
              mobile, which leaves a buyer on the device most of them are on
              with the price and no reason for it. */}
          <ul className="flex flex-col gap-2.5">
            {bullets.map((b) => (
              <li key={b} className="flex gap-2.5 text-[#e7eaef]" style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 fill-none stroke-[#e8a183]"
                  strokeWidth={2.4}
                >
                  <path d="M4 12.5 9.5 18 20 6.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      </div>
    </div>
  );
}
