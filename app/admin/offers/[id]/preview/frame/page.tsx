import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getOffer } from "@/lib/store";
import { immediateChargeCents } from "@/lib/offers";
import { otoComponentFor } from "@/components/oto/registry";
import type { OtoView } from "@/components/oto/shell";
import { money } from "@/lib/money";

export const dynamic = "force-dynamic";

// The upsell page on its own, with no admin chrome, so the preview can load it
// in an iframe at a chosen width and show a truthful mobile rendering.
//
// A CSS-scaled desktop render is not a mobile preview: media queries still
// resolve against the real viewport, so every breakpoint lies. An iframe has
// its own viewport, which is the only way `md:` behaves as it will on a phone.
export default async function OtoPreviewFrame({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { template } = await searchParams;

  const offer = await getOffer(id);
  if (!offer) notFound();

  const view: OtoView = {
    offer,
    token: "preview",
    chargeNowCents: immediateChargeCents(offer),
    recurringNote:
      offer.billingType === "recurring"
        ? `then ${money(offer.priceCents, offer.currency)}/${offer.interval}${
            offer.trialDays ? ` after your ${offer.trialDays}-day trial` : ""
          }`
        : null,
  };

  const Template = otoComponentFor({ template: template || offer.otoTemplate, offerKey: offer.key });

  // px-5 mirrors the store shell, because the layouts cancel it with a
  // negative margin to run their bands edge to edge.
  return (
    <div className="min-h-dvh w-full px-5 md:px-6">
      <Template view={view} />
    </div>
  );
}
