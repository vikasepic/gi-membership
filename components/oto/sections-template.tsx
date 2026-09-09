import { OtoActions, type OtoView } from "@/components/oto/shell";
import { OtoStickyBar } from "@/components/oto/sticky-bar";
import { SalesPage } from "@/components/page/sales-page";
import { offersForRows } from "@/lib/block-offers";
import { livePrices } from "@/lib/offer-prices";
import { hasStickyBarBlock, type SectionRow } from "@/lib/page-sections";
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

  // Does the page already carry a Sticky bar block? The offer's page editor
  // asks the same question through the same helper, so what it tells you and
  // what this renders cannot drift apart.
  const hasStickyBlock = hasStickyBarBlock(rows);

  // What the page is showing to choose between. The bar can buy only when
  // there is one of them.
  const options = livePrices(offer.prices);
  const optionCount = options.length > 1 ? options.length : alt ? 2 : 1;

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
          // Deliberately no checkout link on this page: the card is on file,
          // and every buy control here charges it rather than asking again.
          buyHref: null,
          otoToken: view.token,
          byOffer: await offersForRows(rows),
          // The upsell is the one page with somewhere to decline TO, so it is
          // the one page that hands the block a decline. The same destination
          // the built-in layout uses, and the offer's own wording.
          declineHref: view.declineHref,
          declineLabel: offer.declineLabel,
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
      {/* The built-in bar, unless the page carries one of its own.
          A Sticky bar block is editable — its words, its colours, where it
          scrolls to — and this one is not. Two bars at once would be the page
          arguing with itself, so the block wins where there is one. */}
      {!hasStickyBlock && (
      <OtoStickyBar
        token={view.token}
        acceptLabel={offer.acceptLabel}
        declineLabel={offer.declineLabel}
        priceLine={[priceLabel + (offer.interval ? `/${offer.interval}` : ""), offer.trialDays ? `${offer.trialDays} days free` : null]
          .filter(Boolean)
          .join(" · ")}
        subLine={view.recurringNote ? `${view.recurringNote}. Cancel any time.` : null}
        expiresAt={view.expiresAt}
        optionCount={optionCount}
        declineHref={view.declineHref}
        expiredHref={view.expiredHref}
      />
      )}
    </div>
  );
}
