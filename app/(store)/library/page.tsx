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

// Every outcome of acceptStandingOfferAction, in the buyer's words. Without an
// entry here the redirect lands silently and the button reads as broken — which
// is exactly how it behaved when only "added" was handled.
const OFFER_STATUS: Record<string, string> = {
  added: "Added — it’s ready in your library.",
  already_owned: "You already have this — nothing was charged.",
  unavailable: "That offer isn’t available any more.",
  no_saved_card:
    "We don’t have a card on file for you yet. Buy anything from the store once and this becomes one tap.",
  charge_failed:
    "Your saved card was declined, so nothing was charged. Update it under Account → Manage billing, then try again.",
};
import { money } from "@/lib/money";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

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
            offerStatus === "added"
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
          {/* The same grid the courses use. An app IS a thing they bought, and
              a full-width bar under a wall of cards read as an afterthought —
              a name, a dot, and a button, saying less than the smallest course
              card above it. */}
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
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5"
                >
                  {/* A mark rather than a logo: there is no logo column, and a
                      letter in the app's own colour is a real identity a
                      member can pick out of a grid — not a placeholder box
                      pretending an image is coming. */}
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white"
                      style={{ background: "var(--navy)" }}
                    >
                      {a.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium">{a.name}</span>
                      {a.host && <span className="truncate text-xs text-muted">{a.host}</span>}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 text-sm">
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
                  </div>

                  <form action={openAppAction} className="mt-auto">
                    <button className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover">
                      Open the app &rarr;
                    </button>
                    <input type="hidden" name="appId" value={a.id} />
                  </form>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Standing offer for buyers who declined — one-click on the saved card. */}
      {standing && (
        <section
          className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-7"
          style={{
            backgroundImage:
              "radial-gradient(90% 60% at 100% 0%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 60%)",
          }}
        >
          <span className="kicker text-primary">Still available</span>
          <h2 className="text-xl">{standing.headline}</h2>
          {standing.description && <p className="text-sm text-muted">{standing.description}</p>}
          <div className="flex flex-wrap items-center gap-4">
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
              <form action={acceptStandingOfferAction} className="ml-auto">
                <input type="hidden" name="offerId" value={standing.id} />
                <button className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover">
                  {standing.acceptLabel}
                </button>
              </form>
            ) : (
              <BuyLink
                href={await offerHref(standing)}
                valueCents={standing.priceCents}
                currency={standing.currency}
                contentId={standing.key}
                className="ml-auto rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
              >
                {standing.acceptLabel}
              </BuyLink>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
