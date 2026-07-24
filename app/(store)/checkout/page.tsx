import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug, getOffer } from "@/lib/store";
import { immediateChargeCents } from "@/lib/offers";
import { stripePublishableKey } from "@/lib/env";
import { CheckoutForm, type BumpSummary } from "@/components/checkout/checkout-form";

const money = (c: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(c / 100);

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product: slug } = await searchParams;
  if (!slug) notFound();
  const product = await getProductBySlug(slug);
  if (!product || product.status !== "published") notFound();

  // Bump summary from the product's offer (a fresh buyer owns nothing, so an
  // attached active offer is eligible; ownership-based filtering matters for
  // repeat buyers who are already logged in).
  let bump: BumpSummary | null = null;
  if (product.bumpOfferId) {
    const offer = await getOffer(product.bumpOfferId);
    if (offer) {
      const recurringNote =
        offer.billingType === "recurring"
          ? `then ${money(offer.priceCents, offer.currency)}/${offer.interval}${
              offer.trialDays ? ` after a ${offer.trialDays}-day trial` : ""
            }`
          : null;
      bump = {
        headline: offer.headline,
        description: offer.description,
        chargeNowCents: immediateChargeCents(offer),
        recurringNote,
        acceptLabel: offer.acceptLabel,
      };
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 py-4">
      <div className="flex flex-col gap-2">
        <Link href={`/p/${product.slug}`} className="kicker w-fit text-muted hover:text-fg">
          &larr; Back
        </Link>
        <h1 className="text-2xl">Checkout</h1>
        <p className="text-muted">
          {product.title} — <span className="text-fg">{money(product.priceCents, product.currency)}</span>
        </p>
      </div>

      <CheckoutForm
        product={{
          slug: product.slug,
          title: product.title,
          priceCents: product.priceCents,
          currency: product.currency,
        }}
        bump={bump}
        publishableKey={stripePublishableKey()}
      />
    </div>
  );
}
