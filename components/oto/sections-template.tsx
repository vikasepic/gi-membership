import { OtoActions, type OtoView } from "@/components/oto/shell";
import { OtoStickyBar } from "@/components/oto/sticky-bar";
import { SalesPage } from "@/components/page/sales-page";
import { offersForRows } from "@/lib/block-offers";
import { livePrices } from "@/lib/offer-prices";
import type { SectionRow } from "@/lib/page-sections";
import type { GlobalBlocks } from "@/lib/section-to-blocks";
import { money } from "@/lib/money";

/**
 * The upsell page, rendered from the ten sections.
 *
 * Same components as the store sales page — Ajit's point is that one structure
 * serves both, so a section improved for one is improved for the other.
 *
 * Accepting stays the shell's: layout is the section's business, the money path
 * is not. The button label is editable and the action behind it is not.
 */
export async function SectionsOto({
  view,
  rows,
  globals,
}: {
  view: OtoView;
  rows: SectionRow[];
  /** The designs this page points at. See SectionBand. */
  globals?: GlobalBlocks;
}) {
  const { offer, altOffer: alt } = view;
  const priceLabel = money(view.chargeNowCents, offer.currency);

  return (
    <div className="pb-28">
      <SalesPage
        rows={rows}
        globals={globals}
        money={{
          // The headline price. `priceLabel` here was the charge-now figure,
          // which is $0 through a trial — see PageMoney.
          priceLabel: money(offer.priceCents, offer.currency),
          termsLabel: offer.interval ? `/${offer.interval}` : null,
          dueNowLabel: priceLabel,
          // The same second price the buttons below offer, so a price card
          // cannot advertise one figure while the button charges another.
          altPriceLabel: alt ? money(alt.priceCents, alt.currency) : null,
          altTermsLabel: alt?.interval ? `/${alt.interval}` : null,
          trialLabel: offer.trialDays ? `${offer.trialDays} days` : null,
          // The offer's real prices, and the offers any block on this page
          // names. Without them a Ways to pay block here says the offer has no
          // price showing — which it says on the upsell, the one page where
          // somebody has already got their card out.
          prices: livePrices(offer.prices),
          currency: offer.currency,
          buyHref: `/checkout/offer?offer=${offer.id}`,
          byOffer: await offersForRows(rows),
        }}
        // The band's own ink goes with it: the second price is an outlined
        // button, and an outline has to be drawn in a colour the band reads
        // with — terracotta on the navy hero is 2.0:1.
        cta={(label, theme) => (
          <OtoActions
            view={view}
            align="start"
            showNote={false}
            acceptLabel={label}
            ink={theme.fg}
            className="pt-1"
          />
        )}
      />
      <OtoStickyBar
        token={view.token}
        acceptLabel={offer.acceptLabel}
        declineLabel={offer.declineLabel}
        priceLine={[priceLabel + (offer.interval ? `/${offer.interval}` : ""), offer.trialDays ? `${offer.trialDays} days free` : null]
          .filter(Boolean)
          .join(" · ")}
        subLine={view.recurringNote ? `${view.recurringNote}. Cancel any time.` : null}
        expiresAt={view.expiresAt}
      />
    </div>
  );
}
