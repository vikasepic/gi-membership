import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOffer } from "@/lib/store";
import { ownershipFor } from "@/lib/checkout";
import { isOfferEligible, immediateChargeCents } from "@/lib/offers";
import { stripePublishableKey } from "@/lib/env";
import { OfferCheckoutForm } from "@/components/checkout/offer-checkout-form";

export const dynamic = "force-dynamic";

const money = (c: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(c / 100);

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

  const offer = await getOffer(offerId);
  if (!offer || !offer.active) notFound();

  // Someone who already has it should never see a payment form for it.
  const owned = await ownershipFor(user.id);
  if (!isOfferEligible(offer, owned)) redirect("/library?offer=already_owned");

  const recurringNote =
    offer.billingType === "recurring"
      ? `Then ${money(offer.priceCents, offer.currency)}/${offer.interval}${
          offer.trialDays ? ` after your ${offer.trialDays}-day trial` : ""
        }. Cancel anytime.`
      : null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 py-4">
      <div className="flex flex-col gap-3">
        <Link href="/library" className="text-sm text-muted hover:text-fg">
          &larr; Back to your library
        </Link>
        <h1 className="text-3xl leading-tight">{offer.headline ?? offer.name}</h1>
        {offer.description && <p className="text-muted">{offer.description}</p>}
      </div>

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
  );
}
