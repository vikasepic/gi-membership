import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOffer, getOfferByKey } from "@/lib/store";
import { ownershipFor } from "@/lib/checkout";
import { isOfferEligible } from "@/lib/offers";
import { hasPageSections, getPageSections, getPageSettings } from "@/lib/pages";
import { SalesPage } from "@/components/page/sales-page";
import { money } from "@/lib/money";
import { TrackView } from "@/components/track-view";
import { BuyLink } from "@/components/buy-link";
import { buildBumpView } from "@/lib/bump";
import { offerAsSoldTo } from "@/lib/trial-history";
import { altSaving } from "@/lib/offers";

export const dynamic = "force-dynamic";

/**
 * An offer's own sales page, at a plain address you can paste anywhere.
 *
 * The upsell page needs a signed token, so it cannot be linked to — this is the
 * same nine sections at a URL that can go in an ad or an email. Buying routes
 * through /checkout/offer, which already handles signing in and refuses anyone
 * who owns it, so nothing about eligibility is reimplemented here.
 */
export default async function OfferSalesPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const listed = await getOfferByKey(key);
  if (!listed || !listed.active) notFound();
  if (!(await hasPageSections("offer", listed.id))) notFound();

  // Who is reading it decides what it may promise: a free trial is a thing you
  // get once, so anyone who has had this one is shown what they will be
  // charged rather than an offer we would not honour.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const offer = await offerAsSoldTo(user?.email ?? null, listed);

  const [rows, settings] = await Promise.all([
    getPageSections("offer", offer.id),
    getPageSettings("offer", offer.id),
  ]);
  const view = buildBumpView(offer);
  // This page's own second price, if it has one. Bumps and upsells read theirs
  // from the product that places them; a page standing alone has no product.
  const pageAltRaw = offer.pageAltOfferId ? await getOffer(offer.pageAltOfferId) : null;
  const pageAlt = pageAltRaw ? await offerAsSoldTo(user?.email ?? null, pageAltRaw) : null;
  const showAlt = pageAlt?.active ? pageAlt : null;

  // Someone who already has it gets the truth rather than a buy button they
  // would be refused at.
  const owned = user ? await ownershipFor(user.id) : null;
  const alreadyHas = owned ? !isOfferEligible(offer, owned) : false;

  return (
    // Full-bleed. The store shell caps main at max-w-5xl, and a negative
    // margin only cancels its padding — so the coloured bands stopped at
    // 1024px and the page read as a card floating on the shell's background
    // rather than as a page. overflow-x-clip guards the scrollbar gap that
    // 100vw leaves behind.
    <div className="mx-[calc(50%-50vw)] w-screen overflow-x-clip">
      <TrackView
        event="ViewContent"
        stableKey={offer.key}
        params={{ content_ids: [offer.key], content_type: "product", content_name: offer.name }}
      />
      <SalesPage
        rows={rows}
        settings={settings}
        money={{
          // The headline price, not the charge today. During a trial those
          // differ, and the card says "After the trial" above it.
          priceLabel: money(offer.priceCents, offer.currency),
          termsLabel: offer.interval ? `/${offer.interval}` : null,
          dueNowLabel: view.nowLabel,
          trialLabel: offer.trialDays ? `${offer.trialDays} days` : null,
          altPriceLabel: showAlt ? money(showAlt.priceCents, showAlt.currency) : null,
          altTermsLabel: showAlt?.interval ? `/${showAlt.interval}` : null,
        }}
        cta={(label, theme) =>
          alreadyHas ? (
            <Link
              href="/library"
              className="inline-block w-fit rounded-full border border-current px-7 py-3 font-display text-[0.95rem] font-semibold"
            >
              You already have this — open your library
            </Link>
          ) : (
            // Both prices when this page carries a second one. Two links
            // rather than the upsell's two one-click forms, because nobody
            // here has a card on file yet — each goes to the same checkout
            // with a different offer.
            <span className="flex flex-wrap items-stretch gap-3">
              <BuyLink
                href={`/checkout/offer?offer=${offer.id}`}
                valueCents={offer.priceCents}
                currency={offer.currency}
                contentId={offer.key}
                className="inline-block w-fit rounded-full bg-primary px-7 py-3 font-display text-[0.95rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
              >
                {label}
              </BuyLink>
              {showAlt && (
                <BuyLink
                  href={`/checkout/offer?offer=${showAlt.id}`}
                  valueCents={showAlt.priceCents}
                  currency={showAlt.currency}
                  contentId={showAlt.key}
                  // Ink from the band, like every other outlined control on a
                  // page whose sections each choose their own ground.
                  style={{
                    color: theme.fg,
                    borderColor: `color-mix(in srgb, ${theme.fg} 42%, transparent)`,
                  }}
                  className="inline-flex w-fit flex-col items-center justify-center rounded-full border px-6 py-3 font-display text-[0.95rem] font-semibold transition-colors"
                >
                  <span>
                    {money(showAlt.priceCents, showAlt.currency)}
                    {showAlt.interval ? ` / ${showAlt.interval}` : ""}
                  </span>
                  {altSaving(offer, showAlt) && (
                    <span className="text-[0.72rem] font-normal opacity-75">
                      {altSaving(offer, showAlt)}
                    </span>
                  )}
                </BuyLink>
              )}
            </span>
          )
        }
      />
    </div>
  );
}
