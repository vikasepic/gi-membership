import Link from "next/link";

/**
 * The selling half of the redesigned checkout.
 *
 * One order, whatever is being bought: back row, image, terms, name, what it
 * says, what it costs, what is in it. A product and an offer differ in what
 * they can fill in, never in where it goes — the checkout for a subscription
 * and the checkout for a download should not read as two different shops, and
 * they did: a product had a cover propping up its price and an offer had a gap
 * where one would have been.
 *
 * So the image is a band at the top, at one size, and the price stands on its
 * own line under the copy. A record with no image draws no band and nothing
 * moves; the panel is the same panel with one fewer thing in it.
 *
 * Everything here comes from a record. No bullet list is invented, no
 * placeholder stands in for a missing image, and no line claims anything the
 * store has not said — a checkout that ships promising what the shop does not
 * sell is worse than one that says less.
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
  imageUrl,
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
  /** Whatever this thing looks like. Same treatment for a product and an offer. */
  imageUrl: string | null;
  bullets: string[];
  /** The headline figure, where there is a single one worth showing. */
  priceLabel: string | null;
  priceCaption: string | null;
}) {
  return (
    /* The panel bleeds to the window edge; its CONTENT does not — capped and
       pushed toward the divider, so on a wide monitor the two halves read as a
       pair rather than as a column of text against a wall of navy.

       Top-aligned, deliberately. It was centred in the leftover height, which
       looked balanced on a short viewport and on a tall one pushed the title
       half a screen down with the image below the fold — so the first thing
       anyone saw of what they were buying was nothing at all. */
    <div className="checkout-v2-stage flex flex-col gap-6 bg-[#1d2b3a] px-6 py-8 text-[#f3ede6] md:px-8 lg:px-10 lg:py-12">
      <div className="ml-auto flex w-full max-w-[26rem] items-center justify-between gap-4">
        <Link
          href={backHref}
          className="font-semibold uppercase tracking-[0.12em] text-[#f3ede6]/85 transition-opacity hover:opacity-100"
          style={{ fontSize: "0.72rem" }}
        >
          &larr; {backLabel}
        </Link>
        {/* Says what is true — the card fields are Stripe's, served over TLS.
            Not a badge borrowed from a security vendor we do not use. */}
        <span className="flex items-center gap-2 text-[#f3ede6]/80" style={{ fontSize: "0.78rem" }}>
          <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 shrink-0 fill-current">
            <path d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2ZM9 7a3 3 0 1 1 6 0v2H9V7Z" />
          </svg>
          Secure checkout
        </span>
      </div>

      <div className="ml-auto flex w-full max-w-[26rem] flex-col gap-5">
        {/* First, because it is the fastest answer to "am I in the right
            place". A 3:2 band rather than a book-cover thumbnail: a mockup, a
            screenshot and a course card are all different shapes, and the one
            frame they all sit in without being cropped to nonsense is a wide
            one they are contained inside. */}
        {imageUrl && (
          <span
            className="block w-full overflow-hidden rounded-xl border border-[#f3ede6]/10 bg-[#f3ede6]/[0.06]"
            style={{ aspectRatio: "3 / 2" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="size-full object-contain" />
          </span>
        )}

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
          style={{ fontSize: "clamp(1.5rem, 1.1rem + 1.5vw, 2.15rem)", textWrap: "balance" }}
        >
          {title}
        </h1>

        {sub && (
          <p className="text-[#c3cbd6]" style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
            {sub}
          </p>
        )}

        {priceLabel && (
          <div className="flex flex-col border-t border-[#f3ede6]/15 pt-5">
            <span
              className="font-semibold uppercase tracking-[0.14em] text-[#8fa0b4]"
              style={{ fontSize: "0.68rem" }}
            >
              Price
            </span>
            <span
              className="font-display font-bold leading-none tracking-[-0.03em]"
              style={{ fontSize: "clamp(1.8rem, 1.2rem + 2vw, 2.75rem)" }}
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

        {bullets.length > 0 && (
          /* Shown on a phone too. The handoff hid these below the fold on
             mobile, which leaves a buyer on the device most of them are on
             with the price and no reason for it. */
          <ul className="flex flex-col gap-2.5 border-t border-[#f3ede6]/15 pt-5">
            {bullets.map((b) => (
              <li
                key={b}
                className="flex gap-2.5 text-[#e7eaef]"
                style={{ fontSize: "0.9rem", lineHeight: 1.5 }}
              >
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
        )}
      </div>
    </div>
  );
}
