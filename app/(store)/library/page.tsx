import Link from "next/link";
import { BuyLink } from "@/components/buy-link";
import { redirect } from "next/navigation";
import { viewer } from "@/lib/view-as";
import { getStandingOffer, listOwnedApps } from "@/lib/library";
import { ownershipFor } from "@/lib/checkout";
import { coursesForUser } from "@/lib/courses";
import { getProfile } from "@/lib/profile";
import { firstNameOf } from "@/lib/post-purchase-email";
import { appInitials, offerPriceLine, shortDescription } from "@/lib/library-apps";
import { publicCoverUrl } from "@/lib/media";
import { AppCard } from "@/components/library/app-card";
import { LibraryCourseCard } from "@/components/library/course-card";
import { ContinueBox } from "@/components/library/continue-box";
import { progressForCourses, lastLessonFor } from "@/lib/learning";

// Every outcome of the offer checkout's own
// return trip (app/(store)/checkout/offer/complete/route.ts, which reads
// completeOfferCheckout's error straight through to this same ?offer= param),
// in the buyer's words. Without an entry here the redirect lands silently and
// the page reads as broken — which is exactly how it behaved when only
// "added" was handled, and worse than broken for a key from the PAID
// checkout: a blank page after a real charge looks like the charge vanished.
const OFFER_STATUS: Record<string, string> = {
  // An admin standing in for this member. Buying would charge THEIR card.
  viewing_as: "You’re viewing someone else’s account, so nothing can be bought here. Stop viewing to buy as yourself.",
  added: "Added — it’s ready in your library.",
  already_owned: "You already have this — nothing was charged.",
  unavailable: "That offer isn’t available any more.",
  // acceptOto's off-session charge for an upsell (lib/checkout.ts) — a
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
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

/**
 * The member's library (redesigned 5 Oct 2026, direction A of the mockups).
 *
 * Most members own one app and nothing else, and the old page opened on
 * "Nothing here yet" with their app underneath it. Now it opens on a welcome
 * and one big card per app: what it is, what their plan includes, and a
 * button that opens it already signed in. Courses follow, and anything they
 * don't own sits at the bottom, marked as such.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ offer?: string }>;
}) {
  const user = await viewer();
  if (!user) redirect("/login");

  const { offer: offerStatus } = await searchParams;
  const [courses, apps, owned, profile] = await Promise.all([
    coursesForUser(user.id),
    listOwnedApps(user.id),
    // The member's own ownership. `user` is whoever is being viewed, so an
    // admin using "Open the store as them" sees the member's products; the
    // signed-in reader this used to ask for counted the admin's own.
    ownershipFor(user.id),
    getProfile(user.id),
  ]);
  const ownedProductCount = owned.productIds.size;
  const ownsProducts = ownedProductCount > 0;
  // An app the member has offers its missing channel on its own card.
  const standing = await getStandingOffer(user.id, { excludeAppIds: apps.map((a) => a.id) });

  // Both read the same rows, so they are fetched together.
  const [progress, last] = await Promise.all([
    progressForCourses(user.id, courses),
    lastLessonFor(user.id, courses),
  ]);

  // As typed, but with a capital: "vikas" at checkout reads "Welcome back, Vikas".
  const typed = firstNameOf(profile?.fullName ?? null);
  const firstName = typed ? typed.charAt(0).toUpperCase() + typed.slice(1) : "";
  const intro =
    apps.length === 1 && courses.length === 0
      ? `${apps[0].name} is ready for you. Press Open and you're signed in. There's no separate password.`
      : apps.length > 0
        ? `Your ${courses.length > 0 ? "apps and courses are" : "apps are"} below. Press Open on an app and you're signed in. There's no separate password.`
        : courses.length > 0
          ? "Your courses are below. Pick up where you left off, or start one."
          : null;

  const heading = "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3";
  // `!` on every heading: the store's heading settings (h1 60px, h2 45px) are
  // :root rules meant for sales pages and outrank a utility class.
  const h2 = "text-[21px]! font-bold! leading-tight! tracking-tight";
  const lastCover = last ? courses.find((c) => c.id === last.courseId)?.coverPath ?? null : null;

  return (
    // `store-wide`: the store layout widens to 1240px for this page alone
    // (components/app-shell.tsx), so a big screen holds three apps a row.
    <div className="store-wide flex flex-col gap-11 py-4">
      <section className="flex flex-wrap items-stretch gap-x-8 gap-y-5">
        <div className="flex min-w-0 flex-col justify-center gap-2 [flex:999_1_28rem]">
          <span className="kicker text-muted">Your library</span>
          <h1 className="text-balance text-[32px]! font-extrabold! leading-[1.08]! tracking-tight sm:text-[38px]!">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          {intro && <p className="max-w-[56ch] text-pretty text-base text-muted">{intro}</p>}
        </div>
        {last && (
          <div className="flex min-w-0 items-center [flex:1_1_30rem]">
            <div className="w-full">
              <ContinueBox last={last} now={new Date()} coverUrl={publicCoverUrl(lastCover)} />
            </div>
          </div>
        )}
      </section>

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

      {apps.length > 0 && (
        <section className="flex flex-col gap-[18px]">
          <div className={heading}>
            <h2 className={h2}>{apps.length === 1 ? "Your app" : "Your apps"}</h2>
            <span className="text-[13px] text-muted">Press Open and you&rsquo;re signed in</span>
          </div>
          {apps.length === 1 ? (
            <AppCard app={apps[0]} variant="featured" />
          ) : (
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
              {apps.map((a) => (
                <AppCard key={a.id} app={a} variant="compact" />
              ))}
            </div>
          )}
        </section>
      )}

      {courses.length > 0 && (
        <section className="flex flex-col gap-[18px]">
          <div className={heading}>
            <h2 className={h2}>{courses.length === 1 ? "Your course" : "Your courses"}</h2>
            <span className="text-[13px] text-muted">{courses.length === 1 ? "1 course" : `${courses.length} courses`}</span>
          </div>
          {/* auto-FILL, not auto-fit: one course stays card-sized instead of
              stretching its cover across the row. Four across on a wide screen. */}
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))]">
            {courses.map((c, i) => (
              <LibraryCourseCard
                key={c.id}
                slug={c.slug}
                title={c.title}
                subtitle={c.subtitle}
                type={c.type}
                coverUrl={publicCoverUrl(c.coverPath)}
                index={i}
                progress={progress.get(c.id) ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {apps.length === 0 && courses.length === 0 &&
        (ownsProducts ? (
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
        ))}

      {/* What they don't own, at the bottom and marked as such. Through the
          click route, which logs the tap and sends them to the sales page:
          nothing in the library charges (owner, 1 Oct 2026). */}
      {standing && (
        <section className="flex flex-col gap-[18px]">
          <div className={heading}>
            <h2 className={h2}>More from Greater Inside</h2>
            <span className="text-[13px] text-muted">Not in your plan</span>
          </div>
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
            <div className="flex flex-col gap-3 rounded-[20px] border border-border p-5">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-plum font-display text-sm font-extrabold tracking-tight text-white"
                >
                  {appInitials(standing.name)}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="font-display text-base font-bold">{standing.name}</span>
                  <span className="text-[13px] text-muted">{offerPriceLine(standing)}</span>
                </div>
              </div>
              <span className="text-sm text-muted">{shortDescription(standing.headline) ?? shortDescription(standing.description)}</span>
              <BuyLink
                href={`/library/offer/${standing.id}`}
                valueCents={standing.priceCents}
                currency={standing.currency}
                contentId={standing.key}
                className="mt-auto flex min-h-[42px] items-center justify-center rounded-full border border-border font-display text-sm font-semibold transition-colors hover:border-primary"
              >
                See what&rsquo;s inside
              </BuyLink>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
