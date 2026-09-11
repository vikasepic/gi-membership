import { redirect } from "next/navigation";
import { verifyOtoToken } from "@/lib/oto-token";
import { otoSigningSecret } from "@/lib/env";
import { getOffer } from "@/lib/store";
import { upsellAltFor, upsellPricesFor, orderEmailFor, otoBounceHref } from "@/lib/checkout";
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
import { recordOtoPageHit } from "@/lib/traffic";
import { recordVisitStep } from "@/lib/visits";

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
  // page, never a charge. No order is known yet at either point (a token that
  // fails to verify carries no payload — see otoBounceHref), so this is the
  // same thank-you default these two have always used.
  if (!token) redirect(await otoBounceHref(null));
  const verified = verifyOtoToken(token, otoSigningSecret());
  if (!verified.ok) redirect(await otoBounceHref(null, verified.reason));

  const shown = await getOffer(verified.payload.offerId);
  // The order IS known here, so an offer-checkout buyer whose upsell offer was
  // deleted out from under them lands on /library instead of a product's
  // thank-you page.
  if (!shown) redirect(await otoBounceHref(verified.payload.orderId));

  // After every guard, not right after the token verifies: a valid token
  // whose offer has since been deleted also bounces to thank-you, and that is
  // not a shown upsell either.
  void recordOtoPageHit(verified.payload.orderId);
  void recordVisitStep("upsell");

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
    // Computed here, once, rather than hard-coded in every template: an
    // offer-checkout buyer's "No thanks" (or a sticky bar's countdown running
    // out) belongs on /library, not on a product's thank-you page. See
    // otoBounceHref.
    declineHref: await otoBounceHref(verified.payload.orderId, "declined"),
    expiredHref: await otoBounceHref(verified.payload.orderId, "expired"),
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
      attribution={receipt.attribution}
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
