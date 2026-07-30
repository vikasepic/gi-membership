import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProductBySlug, getOffer } from "@/lib/store";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { immediateChargeCents, shouldShowOffer } from "@/lib/offers";
import { ownershipFor } from "@/lib/checkout";
import { stripePublishableKey } from "@/lib/env";
import { CheckoutForm, type BumpSummary } from "@/components/checkout/checkout-form";

const money = (c: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(c / 100);

// Their last billing country, so a repeat buyer doesn't re-pick it.
async function lastBillingCountry(userId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("orders")
    .select("buyer_country")
    .eq("user_id", userId)
    .not("buyer_country", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.buyer_country as string) ?? null;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product: slug } = await searchParams;
  if (!slug) notFound();
  const product = await getProductBySlug(slug);
  if (!product || product.status !== "published") notFound();

  // Signed in? Then we already know who they are — don't ask again. Their last
  // billing country is reused so a repeat buyer doesn't re-pick it. This has to
  // come BEFORE the bump is resolved: what they already own decides whether the
  // bump may be shown at all.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // These three are independent of each other, so they run together rather than
  // adding three round-trips to the time before anything renders.
  //
  // `owned` is what the buyer currently holds: an offer is never shown to
  // someone who already has what it grants. An anonymous visitor owns nothing,
  // so this is empty for them and the bump renders as before.
  const [owned, bumpOffer, defaultCountry] = await Promise.all([
    user
      ? ownershipFor(user.id)
      : Promise.resolve({ productIds: new Set<string>(), appIds: new Set<string>() }),
    product.bumpOfferId ? getOffer(product.bumpOfferId) : Promise.resolve(null),
    user ? lastBillingCountry(user.id) : Promise.resolve(null),
  ]);

  // Someone who already owns this would be refused by createCheckoutIntent, but
  // only after they had filled in a card and pressed pay. Send them to what they
  // bought instead of rendering a form that cannot succeed.
  if (owned.productIds.has(product.id)) redirect("/library");

  let bump: BumpSummary | null = null;
  if (bumpOffer && shouldShowOffer(bumpOffer, owned)) {
    const recurringNote =
      bumpOffer.billingType === "recurring"
        ? `then ${money(bumpOffer.priceCents, bumpOffer.currency)}/${bumpOffer.interval}${
            bumpOffer.trialDays ? ` after a ${bumpOffer.trialDays}-day trial` : ""
          }`
        : null;
    bump = {
      headline: bumpOffer.headline,
      description: bumpOffer.description,
      chargeNowCents: immediateChargeCents(bumpOffer),
      recurringNote,
      acceptLabel: bumpOffer.acceptLabel,
    };
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
