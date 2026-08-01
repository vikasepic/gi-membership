import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getOffer } from "@/lib/store";
import { immediateChargeCents } from "@/lib/offers";
import { otoComponentFor } from "@/components/oto/registry";
import type { OtoView } from "@/components/oto/shell";
import { money } from "@/lib/money";

export const dynamic = "force-dynamic";

// The upsell page on its own, for the admin preview iframe.
//
// It lives OUTSIDE /admin deliberately. Everything under app/admin/ is wrapped
// by app/admin/layout.tsx, so a frame route in there rendered the admin nav and
// the LIVE PAYMENTS badge inside the iframe — a route group cannot escape a
// parent layout, only a different path can. Out here it gets the root layout
// alone: html, body, fonts, theme.
//
// Still admin-only: requireAdmin() runs before anything renders, and the route
// being outside /admin changes the layout, never the authorisation.
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
    preview: true,
    // A representative 15 minutes so the countdown is visible in preview. The
    // live page uses the token's real expiry.
    expiresAt: Date.now() + 15 * 60 * 1000,
    chargeNowCents: immediateChargeCents(offer),
    recurringNote:
      offer.billingType === "recurring"
        ? `then ${money(offer.priceCents, offer.currency)}/${offer.interval}${
            offer.trialDays ? ` after your ${offer.trialDays}-day trial` : ""
          }`
        : null,
  };

  const Template = otoComponentFor({ template: template || offer.otoTemplate, offerKey: offer.key });

  // No padding: the live page renders bare too (AppShell steps aside for
  // /checkout/oto), so the preview and the real thing get the same box.
  return (
    <div className="min-h-dvh w-full">
      <Template view={view} />
    </div>
  );
}
