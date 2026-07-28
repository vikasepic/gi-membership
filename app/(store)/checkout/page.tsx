import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug, getOffer } from "@/lib/store";
import { createClient, createServiceClient } from "@/lib/supabase/server";
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

  // Signed in? Then we already know who they are — don't ask again. Their last
  // billing country is reused so a repeat buyer doesn't re-pick it.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let defaultCountry: string | null = null;
  if (user) {
    const db = createServiceClient();
    const { data: prior } = await db
      .from("orders")
      .select("buyer_country")
      .eq("user_id", user.id)
      .not("buyer_country", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    defaultCountry = (prior?.buyer_country as string) ?? null;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-4">
      <div className="flex flex-col gap-2">
        <Link href={`/p/${product.slug}`} className="kicker w-fit text-muted hover:text-fg">
          &larr; Back
        </Link>
        <h1 className="text-2xl md:text-3xl">Checkout</h1>
      </div>

      <CheckoutForm
        product={{
          slug: product.slug,
          title: product.title,
          tagline: product.tagline ?? null,
          priceCents: product.priceCents,
          currency: product.currency,
        }}
        bump={bump}
        publishableKey={stripePublishableKey()}
        signedInEmail={user?.email ?? null}
        defaultCountry={defaultCountry}
      />
    </div>
  );
}
