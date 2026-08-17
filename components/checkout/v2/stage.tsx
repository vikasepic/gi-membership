import Link from "next/link";
import { StageBody } from "@/components/checkout/v2/stage-body";

/**
 * The selling half of the redesigned checkout.
 *
 * One order, whatever is being bought: image, terms, name, what it says, what
 * it costs, what is in it. A product and an offer differ in what they can fill
 * in, never in where it goes — the checkout for a subscription and the one for
 * a download should not read as two different shops.
 *
 * On a phone everything but the name, the terms and the price folds away
 * behind a control. See StageBody for why, and for how the order survives it.
 *
 * Everything here comes from a record. No bullet list is invented and no
 * placeholder stands in for a missing image: a record with no image draws no
 * image, and nothing else moves.
 *
 * Server component. The one piece that holds state is the fold.
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
  const summary = (
    <div className="order-2 flex flex-col gap-4">
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
        style={{ fontSize: "clamp(1.45rem, 1.1rem + 1.3vw, 2rem)", textWrap: "balance" }}
      >
        {title}
      </h1>

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
            style={{ fontSize: "clamp(1.75rem, 1.2rem + 1.8vw, 2.6rem)" }}
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
  );

  const details = (
    <>
      {/* First on a laptop, because it is the fastest answer to "am I in the
          right place". Contained in a 3:2 frame rather than cropped: a mockup,
          an app screenshot and a course card are three different shapes, and
          the frame they all fit inside without being cut to nonsense is a wide
          one. */}
      {imageUrl && (
        <span
          className="order-1 block w-full overflow-hidden rounded-xl border border-[#f3ede6]/10 bg-[#f3ede6]/[0.06]"
          style={{ aspectRatio: "3 / 2" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="size-full object-contain" />
        </span>
      )}

      {sub && (
        <p className="order-3 text-[#c3cbd6]" style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
          {sub}
        </p>
      )}

      {bullets.length > 0 && (
        <ul className="order-4 flex flex-col gap-2.5 border-t border-[#f3ede6]/15 pt-5">
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
    </>
  );

  // Nothing to unfold — no image, no description, no bullets — so no control
  // offering to unfold it. A button that opens an empty drawer is worse than
  // the scroll it was meant to save.
  const hasDetails = Boolean(imageUrl || sub || bullets.length > 0);

  return (
    <div className="checkout-v2-stage flex flex-col gap-6 bg-[#1d2b3a] px-6 py-8 text-[#f3ede6] md:px-8 lg:px-10 lg:py-12">
      <div className="ml-auto flex w-full max-w-[24rem] items-center justify-between gap-4 lg:mx-auto">
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

      {hasDetails ? (
        <StageBody summary={summary} details={details} moreLabel={"What’s included"} />
      ) : (
        <div className="ml-auto flex w-full max-w-[24rem] flex-col gap-5 lg:mx-auto">{summary}</div>
      )}
    </div>
  );
}
