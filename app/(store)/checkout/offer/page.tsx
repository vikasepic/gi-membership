import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOffer } from "@/lib/store";
import { offerAsSoldTo } from "@/lib/trial-history";
import { ownershipFor } from "@/lib/checkout";
import { isOfferEligible, immediateChargeCents } from "@/lib/offers";
import { stripePublishableKey } from "@/lib/env";
import { OfferCheckoutForm } from "@/components/checkout/offer-checkout-form";

export const dynamic = "force-dynamic";

import { money } from "@/lib/money";
import { NOINDEX } from "@/lib/seo";
import { CheckoutPanel } from "@/components/checkout/checkout-panel";
import { legalFrom } from "@/lib/legal";
import { getSettingsOrDefaults } from "@/lib/settings";
import { publicCoverUrl } from "@/lib/media";
import { productDisplay } from "@/lib/courses";

export const metadata = NOINDEX;

// Checkout for a single offer, for a signed-in member with no card on file.
// The product checkout can't serve this: it creates an account and charges a
// product price, whereas here the buyer exists and a trial is $0 today.
export default async function OfferCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ offer?: string }>;
}) {
  const { offer: offerId } = await searchParams;
  if (!offerId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect(`/login?next=${encodeURIComponent(`/checkout/offer?offer=${offerId}`)}`);

  const listed = await getOffer(offerId);
  if (!listed || !listed.active) notFound();
  // Signed in by the redirect above, so we know exactly what they have had.
  const offer = await offerAsSoldTo(user.email, listed);

  // Someone who already has it should never see a payment form for it.
  const owned = await ownershipFor(user.id);
  if (!isOfferEligible(offer, owned)) redirect("/library?offer=already_owned");

  const recurringNote =
    offer.billingType === "recurring"
      ? `Then ${money(offer.priceCents, offer.currency)}/${offer.interval}${
          offer.trialDays ? ` after your ${offer.trialDays}-day trial` : ""
        }. Cancel anytime.`
      : null;

  // An offer has no artwork of its own — it grants something, and that thing
  // does. Without this the panel is a headline on an empty half of the screen,
  // which is worse than the single column it replaced.
  const coverUrl = offer.grantProductId
    ? publicCoverUrl((await productDisplay([offer.grantProductId])).get(offer.grantProductId)?.coverPath ?? null)
    : null;

  // Never the throwing read: a settings row that cannot be parsed must cost this
  // page its logo, not its ability to take a payment.
  const settings = await getSettingsOrDefaults();
  const legal = legalFrom(settings);

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <CheckoutPanel
        title={offer.headline ?? offer.name}
        tagline={offer.description}
        coverUrl={coverUrl}
        backHref="/library"
        hasTrial={Boolean(offer.trialDays)}
        refundWindowDays={legal.refundWindowDays}
        replyTime={settings.replyTime}
      />

      {/* The ground bleeds to the window edge; the content does not. A form
          stretched across half a large monitor turns every field into a
          900px-wide box, which is what made this look like a page with the
          zoom stuck on. */}
      <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-7 px-6 py-8 md:px-8 lg:mx-0 lg:ml-0 lg:mr-auto lg:py-10 lg:pl-10">
        <h2 className="font-display text-xl">Checkout</h2>
        <OfferCheckoutForm
          offer={{
          id: offer.id,
          headline: offer.headline ?? offer.name,
          description: offer.description,
          chargeNowCents: immediateChargeCents(offer),
          recurringNote,
          acceptLabel: offer.acceptLabel ?? "Confirm",
          currency: offer.currency,
        }}
          email={user.email}
          publishableKey={stripePublishableKey()}
        />
      </div>
    </div>
  );
}
