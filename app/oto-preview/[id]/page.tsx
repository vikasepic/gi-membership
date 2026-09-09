import { notFound } from "next/navigation";
import { verifyPreviewToken } from "@/lib/preview-token";
import { getOffer } from "@/lib/store";
import { previewUpsellAlt } from "@/lib/checkout";
import { immediateChargeCents } from "@/lib/offers";
import { otoComponentFor } from "@/components/oto/registry";
import { resolveGlobals } from "@/lib/templates-store";
import { SectionsOto } from "@/components/oto/sections-template";
import { getPageSections } from "@/lib/pages";
import type { OtoView } from "@/components/oto/shell";
import { money } from "@/lib/money";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

export const dynamic = "force-dynamic";

// The upsell page on its own, for the admin preview iframe.
//
// It lives OUTSIDE /admin deliberately. Everything under app/admin/ is wrapped
// by app/admin/layout.tsx, so a frame route in there rendered the admin nav and
// the LIVE PAYMENTS badge inside the iframe — a route group cannot escape a
// parent layout, only a different path can. Out here it gets the root layout
// alone: html, body, fonts, theme.
//
// Still admin-only, but proved by a signed token in the URL rather than by the
// session. A cookie set SameSite=Lax is not sent when a document is loaded
// into an iframe, so requireAdmin() here saw no session however signed-in the
// admin was — it redirected the frame to /login and on to the store root,
// which refuses framing outright, and the panel showed a broken document. The
// page that holds the frame has the session and mints the token.
//
// notFound rather than redirect: a redirect inside a frame is what broke this.
//
// A CSS-scaled desktop render is not a mobile preview: media queries still
// resolve against the real viewport, so every breakpoint lies. An iframe has
// its own viewport, which is the only way `md:` behaves as it will on a phone.
export default async function OtoPreviewFrame({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ template?: string; t?: string }>;
}) {
  const { id } = await params;
  const { template, t } = await searchParams;
  if (!verifyPreviewToken(t, "oto")) notFound();

  const offer = await getOffer(id);
  if (!offer) notFound();

  // Both prices, without the live page's `active` check: the preview's job is
  // to show the layout being configured, and an alternative that is still a
  // draft is exactly the one you are here to look at. Taken from the first
  // product that upsells this offer, since a preview has no order behind it.
  const altOffer = await previewUpsellAlt(offer.id);

  const view: OtoView = {
    offer,
    altOffer,
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
    // No real order behind a preview (token is the literal string "preview"),
    // so there is nothing for otoBounceHref to look up — these are only ever
    // rendered inside the admin's iframe, never actually followed by a buyer.
    declineHref: "/checkout/thank-you?oto=declined",
    expiredHref: "/checkout/thank-you?oto=expired",
  };

  // The sections layout reads its content from the database, which a
  // component map cannot supply — so it is resolved here rather than
  // pretending every template has the same shape.
  if ((template || offer.otoTemplate) === "sections") {
    const rows = await getPageSections("offer", offer.id);
    // Whatever this page points at, in one query — see the product page.
    return <SectionsOto view={view} rows={rows} globals={await resolveGlobals(rows)} />;
  }

  const Template = otoComponentFor({ template: template || offer.otoTemplate, offerKey: offer.key });

  // No padding: the live page renders bare too (AppShell steps aside for
  // /checkout/oto), so the preview and the real thing get the same box.
  return (
    <div className="min-h-dvh w-full">
      <Template view={view} />
    </div>
  );
}
