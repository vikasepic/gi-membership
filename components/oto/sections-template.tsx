import { OtoActions, type OtoView } from "@/components/oto/shell";
import { OtoStickyBar } from "@/components/oto/sticky-bar";
import { SalesPage } from "@/components/page/sales-page";
import type { SectionRow } from "@/lib/page-sections";
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
export function SectionsOto({ view, rows }: { view: OtoView; rows: SectionRow[] }) {
  const { offer } = view;
  const priceLabel = money(view.chargeNowCents, offer.currency);

  return (
    <div className="pb-28">
      <SalesPage
        rows={rows}
        money={{
          // The headline price. `priceLabel` here was the charge-now figure,
          // which is $0 through a trial — see PageMoney.
          priceLabel: money(offer.priceCents, offer.currency),
          termsLabel: offer.interval ? `/${offer.interval}` : null,
          dueNowLabel: priceLabel,
        }}
        cta={(label) => (
          <OtoActions
            view={view}
            align="start"
            showNote={false}
            acceptLabel={label}
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
