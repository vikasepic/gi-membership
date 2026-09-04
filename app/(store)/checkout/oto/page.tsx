import { redirect } from "next/navigation";
import { verifyOtoToken } from "@/lib/oto-token";
import { otoSigningSecret } from "@/lib/env";
import { getOffer } from "@/lib/store";
import { upsellAltFor, upsellPricesFor, orderEmailFor } from "@/lib/checkout";
import { offerAsSoldTo } from "@/lib/trial-history";
import { immediateChargeCents } from "@/lib/offers";
import { otoComponentFor } from "@/components/oto/registry";
import { resolveGlobals } from "@/lib/templates-store";
import { SectionsOto } from "@/components/oto/sections-template";
import { getPageSections } from "@/lib/pages";
import type { OtoView } from "@/components/oto/shell";
import { money } from "@/lib/money";
import { NOINDEX } from "@/lib/seo";
import { TrackPurchase } from "@/components/track-purchase";
import { purchaseForOrder, adEventForOrder } from "@/lib/tracking-receipt";
import { googleAdsPurchaseLabel } from "@/lib/env";
import { recordPageHit } from "@/lib/traffic";

export const metadata = NOINDEX;

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

  // Not awaited — a count is worth less than a page load.
  void recordPageHit("/checkout/oto");

  const shown = await getOffer(verified.payload.offerId);
  if (!shown) redirect("/checkout/thank-you");
  // The upsell always follows a purchase, so we know exactly who this is: the
  // page shows the terms that will actually be charged.
  const offer = await offerAsSoldTo(await orderEmailFor(verified.payload.orderId), shown);

  // From the PRODUCT this order was for, never from the request. The page shows
  // two prices; the buyer picks a side, not an offer.
  const altOffer = await upsellAltFor(verified.payload.orderId);
  // Every way to pay this order's upsell shows, in the placement's own order.
  // Rebuilt identically in acceptOto from the same product row — the form
  // sends the INDEX of the one that was picked and nothing else.
  const prices = await upsellPricesFor(verified.payload.orderId);

  const view: OtoView = {
    offer,
    altOffer: altOffer?.active ? altOffer : null,
    prices,
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

  // The purchase is reported HERE, not on thank-you.
  //
  // Everyone who is shown an upsell reaches thank-you through it, and every
  // route out of this page — accept, decline, the countdown expiring, closing
  // the tab — arrives there with no payment_intent to read a receipt from. So
  // the browser's copy of Purchase never fired for any of them. Reporting it
  // on the page they land on after paying covers all four, including the tab
  // they close, and the shared event id keeps it one sale rather than two.
  const receipt = await purchaseForOrder(verified.payload.orderId);
  // This funnel's own named event, for an ad account running several funnels
  // through one pixel. Null for a product that has not been given a name.
  const adEvent = await adEventForOrder(verified.payload.orderId);
  const purchase = receipt ? (
    <TrackPurchase
      orderId={receipt.orderId}
      valueCents={receipt.valueCents}
      currency={receipt.currency}
      trialCents={receipt.trialCents}
      email={receipt.email}
      adsLabel={googleAdsPurchaseLabel()}
      customEvent={adEvent}
    />
  ) : null;

  // The sections layout reads its content from the database, which a
  // component map cannot supply — so it is resolved here rather than
  // pretending every template has the same shape.
  if ((offer.otoTemplate) === "sections") {
    const rows = await getPageSections("offer", offer.id);
    // Whatever this page points at, in one query — see the product page.
    return (
      <>
        {purchase}
        <SectionsOto view={view} rows={rows} globals={await resolveGlobals(rows)} />
      </>
    );
  }

  const Template = otoComponentFor({ template: offer.otoTemplate, offerKey: offer.key });
  return (
    <>
      {purchase}
      <Template view={view} />
    </>
  );
}
