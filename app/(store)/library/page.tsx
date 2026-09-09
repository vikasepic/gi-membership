import Link from "next/link";
import { BuyLink } from "@/components/buy-link";
import { offerHref } from "@/lib/offer-link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStandingOffer, listOwnedApps, hasSavedCard, ownedProductIdsForViewer } from "@/lib/library";
import { coursesForUser } from "@/lib/courses";
import { channelsLabel } from "@/lib/app-channels";
import { publicCoverUrl } from "@/lib/media";
import { LibraryCourseCard } from "@/components/library/course-card";
import { immediateChargeCents } from "@/lib/offers";
import { acceptStandingOfferAction, openAppAction } from "./actions";

// Every outcome of acceptStandingOfferAction AND of the offer checkout's own
// return trip (app/(store)/checkout/offer/complete/route.ts, which reads
// completeOfferCheckout's error straight through to this same ?offer= param),
// in the buyer's words. Without an entry here the redirect lands silently and
// the page reads as broken — which is exactly how it behaved when only
// "added" was handled, and worse than broken for a key from the PAID
// checkout: a blank page after a real charge looks like the charge vanished.
const OFFER_STATUS: Record<string, string> = {
  added: "Added — it’s ready in your library.",
  already_owned: "You already have this — nothing was charged.",
  unavailable: "That offer isn’t available any more.",
  no_saved_card:
    "We don’t have a card on file for you yet. Buy anything from the store once and this becomes one tap.",
  // acceptStandingOfferAction's own one-tap charge (lib/checkout.ts) — a
  // genuine decline BEFORE any money moves. True here; NOT the key the paid
  // checkout uses for its own fulfilment failures (see grant_failed below).
  charge_failed:
    "Your saved card was declined, so nothing was charged. Update it under Account → Manage billing, then try again.",
  // completeOfferCheckout's PAID path (lib/offer-checkout.ts): the
  // PaymentIntent had already succeeded by the time this fired, so the money
  // is real — granting access or recording the order is what failed. Must
  // NEVER say "nothing was charged" — that would be a lie to someone who has,
  // in fact, paid. A later retry (the webhook redelivering, or the buyer
  // reloading this page) reclaims the voided order and finishes the grant.
  grant_failed:
    "Your payment went through, but we hit a snag setting up your access. We’re on it — check back in a few minutes, and please don’t pay again. Contact us if it still isn’t here.",
  // completeOfferCheckout: the intent wasn’t "succeeded" when checked (a
  // failed confirmation reaching this route directly, without Stripe’s own
  // redirect_status query param). Nothing was taken either way — a
  // PaymentIntent that hasn’t succeeded hasn’t captured funds.
  card_not_saved:
    "We couldn’t confirm that — nothing was charged. Try again, or contact us if you’re not sure what happened.",
  // completeOfferCheckout: the order row itself could not be booked (a DB
  // hiccup, or a claim race that neither side won). On the common paid path
  // the charge has already succeeded by this point, so this hedges rather
  // than asserting either way.
  order_failed:
    "Something went wrong finishing this purchase. If you were charged, don’t pay again — we’re on it. Otherwise, please try again.",
  // completeOfferCheckout: the id in the URL was neither a PaymentIntent nor a
  // SetupIntent — a broken or stale link, checked before anything is looked
  // up, so nothing here could have been charged.
  unknown_intent:
    "We couldn’t find that checkout. If you completed a payment, check your library before trying again.",
  // completeOfferCheckout: the intent succeeded but carries none of the
  // metadata this checkout writes — most likely a link for a DIFFERENT
  // purchase (a product's own PaymentIntent) landing on this route. If money
  // moved, it was for that other purchase, which its own flow already handles.
  unknown_intent_metadata:
    "We couldn’t match that to a purchase here. If you were charged, check your library — it may already be there.",
  // The return route's own catch: completeOfferCheckout threw something this
  // page has no name for. The most honest thing left to say is that we don't
  // know either.
  unknown:
    "Something went wrong and we couldn’t tell what happened. If you were charged, please don’t pay again — contact us and we’ll sort it out.",

  // Everything below arrives via otoBounceHref (lib/checkout.ts), not via
  // completeOfferCheckout's own error above — the outcome of the UPSELL shown
  // after an offer-checkout purchase, not of the purchase itself (which was
  // already paid for, and already said "added", before the OTO page ever
  // showed). Same vocabulary otoNote() reads on the product side's thank-you
  // page (app/(store)/checkout/thank-you/page.tsx) — acceptOto's own
  // OtoAcceptResult errors, plus verifyOtoToken's "expired"/"invalid" when the
  // token itself never made it that far.
  //
  // "accepted" is the one entry here silence was never an option for: it
  // follows a REAL second charge (or a new subscription) that just went
  // through, and the offer checkout's fixed ?offer=added a few lines above it
  // says nothing about it at all.
  accepted: "Your add-on is active too — it’s in your library now.",
  // Declining is an ordinary choice, not a failure — the sibling thank-you
  // page shows nothing at all for it. This page still names it (rather than
  // silently rendering no banner) because arriving here happened BY that
  // choice, not as a side effect of it, and a page that reacts to a click with
  // total silence reads as though the click did nothing.
  declined: "No problem — the add-on wasn’t added. The rest of your purchase is all set.",
  // acceptOto's own replay guard: the single-use token was already spent
  // (a double submit, the back button, a reload of the accept page).
  used: "That add-on was already on your account, so it wasn’t added twice.",
  // The one-time-offer window closed before they acted on it.
  expired: "That one-time offer had expired, so nothing was added.",
  // verifyOtoToken failed the signature/shape check, or acceptOto's own
  // after-the-fact checks did (offer withdrawn, a tampered price choice) —
  // grouped under one message the same way thank-you's otoNote() groups them,
  // since a buyer has no way to act differently on one versus the other.
  invalid: "That one-time offer link wasn’t valid, so nothing was added.",
};
import { money } from "@/lib/money";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

/**
 * The ground a piece of offer artwork sits on.
 *
 * These pictures are product mockups on a transparent field, not photographs.
 * `object-cover` cropped them and stranded them in flat grey — a screenshot
 * dropped into a box. Contained on a wash of the store's own colour, the
 * mockup floats and the panel is part of the card.
 */
const WASH = {
  backgroundImage:
    "radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--navy) 8%, var(--surface)), var(--surface-2))",
} as const;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ offer?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { offer: offerStatus } = await searchParams;
  const courses = await coursesForUser(user.id);
  const apps = await listOwnedApps(user.id);
  const standing = await getStandingOffer(user.id);
  const cardOnFile = standing ? await hasSavedCard(user.id) : false;
  // Distinguishes "you have bought nothing" from "what you bought has no
  // content attached" — two very different messages for the reader.
  const ownedProductCount = (await ownedProductIdsForViewer()).size;
  const ownsProducts = ownedProductCount > 0;

  return (
    <div className="flex flex-col gap-10 py-4">
      <h1 className="text-3xl">Your library</h1>

      {offerStatus && OFFER_STATUS[offerStatus] && (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            // "accepted" follows a real second charge or a new subscription —
            // the same kind of event "added" already is — not a decline/
            // expiry/error, which is what the alert tone below is for.
            offerStatus === "added" || offerStatus === "accepted"
              ? "border-navy/30 bg-navy/5 text-navy"
              : "border-primary/30 bg-primary/5 text-fg"
          }`}
        >
          {OFFER_STATUS[offerStatus]}
        </p>
      )}

      {courses.length === 0 ? (
        ownsProducts ? (
          // Owning something that delivers nothing is a store misconfiguration,
          // not an empty library. Saying "nothing here yet" to someone who has
          // paid reads as a bug and sends them hunting; name the real cause.
          <div className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4">
            <span className="font-medium text-fg">Your purchases don&rsquo;t have content attached yet</span>
            <p className="text-sm text-muted">
              You own {ownedProductCount === 1 ? "a product" : `${ownedProductCount} products`}, but
              no course has been attached to {ownedProductCount === 1 ? "it" : "them"} yet, so
              there&rsquo;s nothing to open. This is on us, not you — it will appear here as soon as
              it&rsquo;s published.
            </p>
          </div>
        ) : (
          <p className="text-muted">
            Nothing here yet.{" "}
            <Link href="/" className="text-primary hover:underline">Browse the store</Link>.
          </p>
        )
      ) : (
        <section className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between border-b border-border pb-4">
            <h2 className="text-xl">
              {courses.length === 1 ? "Your course" : `Your courses`}
            </h2>
            {courses.length > 1 && (
              <span className="kicker text-muted">{courses.length} in your library</span>
            )}
          </div>
          {/* auto-FILL, not auto-fit. auto-fit collapses the empty tracks, so a
              single course stretched to the full width and its 16:10 cover
              became a wall of image. auto-fill keeps the empty tracks, so one
              card is card-sized and the grid still reflows on any width. */}
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
            {courses.map((c, i) => (
              <LibraryCourseCard
                key={c.id}
                slug={c.slug}
                title={c.title}
                subtitle={c.subtitle}
                type={c.type}
                coverUrl={publicCoverUrl(c.coverPath)}
                index={i}
              />
            ))}
          </div>
        </section>
      )}

      {/* Connected apps — signed handoff, lands the user already signed in. */}
      {apps.length > 0 && (
        <section className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between border-b border-border pb-4">
            <h2 className="text-xl">Your apps</h2>
            <span className="kicker text-muted">Included with your subscription</span>
          </div>
          {/* The same grid and the same card shape as the courses above. An
              app is a thing they bought; a full-width bar under a wall of
              cards read as an afterthought. */}
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
            {apps.map((a) => {
              const tone =
                a.status === "past_due"
                  ? { dot: "var(--primary)", label: "Payment failed — update your card" }
                  : a.status === "trialing"
                    ? { dot: "var(--navy)", label: "On trial" }
                    : a.status === "active"
                      ? { dot: "var(--navy)", label: "Active" }
                      : { dot: "var(--muted)", label: a.status };
              return (
                <div
                  key={a.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface"
                >
                  {/* The offer's artwork is a wide banner with its name set
                      into it — not an icon. Squeezed into a 44px square beside
                      the title it was unreadable and the title said the same
                      thing twice. Given the band the courses use, it is legible
                      and it is the thing you recognise the card by. */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden" style={WASH}>
                    {a.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={a.imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-contain p-4"
                      />
                    ) : (
                      // A letter on the same ground. What you draw when there
                      // is nothing better — never instead of something better.
                      <span
                        aria-hidden
                        className="absolute inset-0 grid place-items-center font-display text-5xl font-semibold text-navy/30"
                      >
                        {a.name.trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <h3 className="text-lg leading-snug">{a.name}</h3>
                    <div className="flex flex-1 flex-col gap-1 text-sm">
                      <span className="flex items-center gap-2 text-muted">
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: tone.dot }}
                        />
                        {tone.label}
                      </span>
                      {a.channels.length > 0 && (
                        <span className="text-muted">{channelsLabel(a.channels)}</span>
                      )}
                      {a.host && <span className="truncate text-xs text-muted">{a.host}</span>}
                    </div>

                    <form action={openAppAction} className="mt-2 border-t border-border pt-3">
                      <button className="text-sm font-medium text-primary hover:underline">
                        Open the app &rarr;
                      </button>
                      <input type="hidden" name="appId" value={a.id} />
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Standing offer for buyers who declined — one-click on the saved card. */}
      {standing && (
        <section
          className="grid overflow-hidden rounded-3xl border border-border bg-surface md:grid-cols-2"
          style={{
            backgroundImage:
              "radial-gradient(90% 60% at 100% 0%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 60%)",
          }}
        >
          {/* Full bleed, beside the words rather than above them.
              It was a fixed-height box with a border inside a padded card, so
              a wide banner sat pillarboxed in white with its own frame around
              it — a screenshot pasted into a card rather than part of one.
              Given half the card and its own aspect ratio, it fills the space
              it is in and the card reads as one thing. */}
          {standing.imageUrl && (
            <div
              className="relative order-first aspect-[16/10] w-full overflow-hidden md:order-last md:aspect-auto md:h-full"
              style={WASH}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={standing.imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-contain p-6"
              />
            </div>
          )}
          <div className="flex flex-col gap-4 p-7">
          <span className="kicker text-primary">Still available</span>
          <h2 className="text-xl">{standing.headline}</h2>
          {standing.description && <p className="text-sm text-muted">{standing.description}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-3">
            <span className="font-display text-2xl">
              {money(immediateChargeCents(standing), standing.currency)} now
            </span>
            {standing.billingType === "recurring" && (
              <span className="text-sm text-muted">
                then {money(standing.priceCents, standing.currency)}/{standing.interval}
                {standing.trialDays ? ` after a ${standing.trialDays}-day trial` : ""}
              </span>
            )}
            {/* One tap only when there's genuinely a card to charge. Otherwise
                this goes to checkout to collect one, rather than offering a
                button whose only possible outcome is an error. */}
            {cardOnFile ? (
              <form action={acceptStandingOfferAction} className="w-full sm:ml-auto sm:w-auto">
                <input type="hidden" name="offerId" value={standing.id} />
                <button className="w-full rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover">
                  {standing.acceptLabel}
                </button>
              </form>
            ) : (
              <BuyLink
                href={await offerHref(standing)}
                valueCents={standing.priceCents}
                currency={standing.currency}
                contentId={standing.key}
                className="w-full rounded-full bg-primary px-6 py-3 text-center font-medium text-primary-fg transition-colors hover:bg-primary-hover sm:ml-auto sm:w-auto"
              >
                {standing.acceptLabel}
              </BuyLink>
            )}
          </div>
          </div>
        </section>
      )}
    </div>
  );
}
