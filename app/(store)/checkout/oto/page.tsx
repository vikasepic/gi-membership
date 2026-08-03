import { redirect } from "next/navigation";
import { verifyOtoToken } from "@/lib/oto-token";
import { otoSigningSecret } from "@/lib/env";
import { getOffer } from "@/lib/store";
import { immediateChargeCents } from "@/lib/offers";
import { otoComponentFor } from "@/components/oto/registry";
import { SectionsOto } from "@/components/oto/sections-template";
import { getPageSections } from "@/lib/pages";
import type { OtoView } from "@/components/oto/shell";
import { money } from "@/lib/money";

// The one-click upsell, shown once, immediately after payment.
//
// This page decides nothing about money: the token says which offer and which
// order, the offer says what it costs, and accepting goes through the single
// server action in oto/actions.ts. All this file chooses is which layout
// renders it.
export default async function OtoPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // A missing/invalid/expired token just bypasses to thank-you — never an error
  // page, never a charge.
  if (!token) redirect("/checkout/thank-you");
  const verified = verifyOtoToken(token, otoSigningSecret());
  if (!verified.ok) redirect("/checkout/thank-you?oto=" + verified.reason);

  const offer = await getOffer(verified.payload.offerId);
  if (!offer) redirect("/checkout/thank-you");

  const view: OtoView = {
    offer,
    token,
    // Straight from the signed payload — the same value the server enforces.
    expiresAt: verified.payload.exp * 1000,
    chargeNowCents: immediateChargeCents(offer),
    recurringNote:
      offer.billingType === "recurring"
        ? `then ${money(offer.priceCents, offer.currency)}/${offer.interval}${
            offer.trialDays ? ` after your ${offer.trialDays}-day trial` : ""
          }`
        : null,
  };

  // The sections layout reads its content from the database, which a
  // component map cannot supply — so it is resolved here rather than
  // pretending every template has the same shape.
  if ((offer.otoTemplate) === "sections") {
    return <SectionsOto view={view} rows={await getPageSections("offer", offer.id)} />;
  }

  const Template = otoComponentFor({ template: offer.otoTemplate, offerKey: offer.key });
  return <Template view={view} />;
}
