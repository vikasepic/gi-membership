import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOffer } from "@/lib/store";
import { offerAsSoldTo } from "@/lib/trial-history";
import { ownershipFor } from "@/lib/checkout";
import { isOfferEligible, immediateChargeCents } from "@/lib/offers";
import { livePrices, priceTerms } from "@/lib/offer-prices";
import { checkoutSkin } from "@/lib/checkout-skin";
import { CheckoutStage } from "@/components/checkout/v2/stage";
import { stripePublishableKey } from "@/lib/env";
import { OfferCheckoutForm } from "@/components/checkout/offer-checkout-form";

export const dynamic = "force-dynamic";

import { money } from "@/lib/money";
import { NOINDEX } from "@/lib/seo";
import { CheckoutPanel } from "@/components/checkout/checkout-panel";
import { legalFrom } from "@/lib/legal";
import { getSettingsOrDefaults } from "@/lib/settings";
import { checkoutDesignVars } from "@/lib/checkout-design";
import { publicCoverUrl } from "@/lib/media";
import { productDisplay } from "@/lib/courses";

export const metadata = NOINDEX;

// Checkout for a single offer, for a signed-in member with no card on file.
// The product checkout can't serve this: it creates an account and charges a
// product price, whereas here the buyer exists and a trial is $0 today.
export default async function OfferCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ offer?: string; price?: string; skin?: string }>;
}) {
  const { offer: offerId, price: wantPrice, skin: wantSkin } = await searchParams;
  const skin = checkoutSkin(wantSkin);
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

  // What this offer looks like: its own image where one has been set, else the
  // artwork of whatever it grants.
  //
  // Its own first, because an offer that grants an APP has no product cover to
  // borrow — which is most of them — and that is the case that left the panel
  // as a headline on an empty half of the screen. The image_url field has been
  // on offers all along with nothing reading it.
  const coverUrl =
    offer.imageUrl ||
    (offer.grantProductId
      ? publicCoverUrl(
          (await productDisplay([offer.grantProductId])).get(offer.grantProductId)?.coverPath ?? null,
        )
      : null);

  // Never the throwing read: a settings row that cannot be parsed must cost this
  // page its logo, not its ability to take a payment.
  const settings = await getSettingsOrDefaults();
  // Three colours and a set of switches — everything the store can change
  // about this page. See lib/checkout-design.
  const design = settings.checkoutDesign;
  const legal = legalFrom(settings);

  // The selling half is narrower than the paying half.
  //
  // They were equal, which gave the panel — a title, a picture and three
  // reassurances somebody has already read — the same room as the form that
  // actually takes the card. On a laptop that pushed the card fields into a
  // column narrower than the copy beside them. Two-fifths and three-fifths: the
  // panel still holds its picture, and the form gets the space.
  const ways = livePrices(offer.prices);
  const form = (
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
      // Every way to pay, and the one they picked on the way here. The
      // choice travels; it does not decide. What is charged is resolved on
      // the server from this same list, so an id it does not recognise
      // preselects nothing rather than buying something unexpected.
      prices={ways}
      chosen={ways.findIndex((p) => p.id === wantPrice)}
      email={user.email}
      publishableKey={stripePublishableKey()}
      skin={skin}
      design={design}
      termsUrl={settings.termsUrl || undefined}
    />
  );

  if (skin === "v2") {
    return (
      <div className="checkout-v2 min-h-dvh bg-bg" style={checkoutDesignVars(design)}>
        {/* Half and half, both hugging the seam — the arrangement Stripe's own
            checkout uses, and for the reason it uses it: two columns of equal
            width with their content pinned to the middle read as one object
            with a fold down it. Every other split leaves the eye travelling
            across empty ground to get from what you are buying to where you
            pay for it, and the wider the monitor the further that trip. The
            room that grows on a big screen grows on the OUTSIDE, evenly. */}
        <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
        <CheckoutStage
          design={design}
          backHref="/library"
          backLabel="Back"
          // The terms as a label, never a claim. An offer with no trial says
          // how it renews instead of saying nothing.
          eyebrow={
            offer.trialDays
              ? `${offer.name} · ${offer.trialDays}-day free trial`
              : offer.name
          }
          title={offer.headline ?? offer.name}
          sub={offer.description}
          imageUrl={coverUrl}
          bullets={offer.bullets ?? []}
          // Only where there is one way to pay. With several, the plan cards
          // on the other half are the price and a headline figure beside them
          // is a second answer to the same question.
          priceLabel={ways.length === 1 ? money(ways[0].priceCents, offer.currency) : null}
          priceCaption={ways.length === 1 ? (priceTerms(ways[0], offer.currency) ?? null) : null}
        />
        <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-5 py-8 md:px-8 lg:mx-0 lg:mr-auto lg:py-12 lg:pl-10 lg:pr-0">
            {form}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
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
      <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-7 px-6 py-8 md:px-8 lg:mx-0 lg:ml-0 lg:mr-auto lg:py-10 lg:pl-10">
        {/* Small on purpose. It labels the column; it is not the page's
            headline — that is on the panel beside it, and two things competing
            to be the biggest word on a checkout is how the actual heading stops
            being read. */}
        <h2 className="font-display text-sm uppercase tracking-[0.12em] text-muted">Checkout</h2>
        {form}
      </div>
    </div>
  );
}
