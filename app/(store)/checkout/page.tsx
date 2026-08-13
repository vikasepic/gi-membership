import { notFound, redirect } from "next/navigation";
import { getProductBySlug, getOffer } from "@/lib/store";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { shouldShowOffer, offerAtPrice } from "@/lib/offers";
import { shownPrices } from "@/lib/offer-prices";
import { ownershipFor } from "@/lib/checkout";
import { stripePublishableKey } from "@/lib/env";
import { CheckoutForm, type BumpSummary } from "@/components/checkout/checkout-form";
import { buildBumpView } from "@/lib/bump";
import { offerAsSoldTo } from "@/lib/trial-history";
import { publicCoverUrl } from "@/lib/media";
import { productDisplay } from "@/lib/courses";
import { rememberLead } from "@/lib/leads";
import { NOINDEX } from "@/lib/seo";
import { CheckoutPanel } from "@/components/checkout/checkout-panel";
import { legalFrom } from "@/lib/legal";
import { getSettingsOrDefaults } from "@/lib/settings";

export const metadata = NOINDEX;


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

  // A signed-in member never types an email, so reaching this page IS the
  // moment we know they are considering it — the equivalent of the anonymous
  // buyer filling in the field. Guarded and not awaited for its result: a
  // marketing timer must not be able to stop a checkout rendering.
  if (user?.email) {
    try {
      await rememberLead({ visitorKey: user.id, productId: product.id, email: user.email });
    } catch {
      // Buffering a lead must never stop a checkout rendering.
    }
  }

  // Built by lib/bump.ts, which the admin preview also uses — so what an admin
  // approves in the editor is literally what renders here.
  // Resolved for whoever is here. A member we already know is shown the terms
  // that will actually apply; an anonymous buyer we cannot know yet is shown
  // the trial, and createCheckoutIntent refuses rather than charging them if
  // the address they type turns out to have used it.
  const bumpAsSold = bumpOffer ? await offerAsSoldTo(user?.email ?? null, bumpOffer) : null;
  const bump: BumpSummary | null =
    bumpAsSold && shouldShowOffer(bumpAsSold, owned) ? buildBumpView(bumpAsSold) : null;

  // Every way to buy the bump, in the order the placement stored them.
  //
  // Built here and rebuilt identically in createCheckoutIntent, from the same
  // product row — the browser sends the INDEX of the one it was shown, never
  // an id. If these two lists ever differ by one the buyer is charged the
  // option beside the one they ticked, with no error anywhere, which is why
  // both go through shownPrices and nothing else.
  const bumpOptions: BumpSummary[] =
    bumpAsSold && bump
      ? shownPrices(bumpAsSold.prices, product.bumpPriceIds ?? []).map((price) =>
          buildBumpView(offerAtPrice(bumpAsSold, price)),
        )
      : [];

  // The old pairing, while placements are still on it. A ticked price list
  // wins; this runs only when there is none.
  const altRaw =
    bump && bumpOptions.length < 2 && product.bumpAltOfferId
      ? await getOffer(product.bumpAltOfferId)
      : null;
  const altOffer = altRaw ? await offerAsSoldTo(user?.email ?? null, altRaw) : null;
  const bumpAlt: BumpSummary | null =
    altOffer && altOffer.active && shouldShowOffer(altOffer, owned) ? buildBumpView(altOffer) : null;

  const coverUrl = publicCoverUrl(
    product.coverPath ?? (await productDisplay([product.id])).get(product.id)?.coverPath ?? null,
  );

  // Two halves of one page: what they are buying and why they should trust us
    // on the left, and nothing but the transaction on the right. The store shell
  // is deliberately not around this — see AppShell.
  // Never the throwing read: a settings row that cannot be parsed must cost this
  // page its logo, not its ability to take a payment.
  const settings = await getSettingsOrDefaults();
  const legal = legalFrom(settings);

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <CheckoutPanel
        title={product.title}
        tagline={product.tagline ?? null}
        coverUrl={coverUrl}
        backHref={`/p/${product.slug}`}
        // Read off the offers rather than the view: the view is presentation, and
        // whether a trial exists decides what needs reassuring.
        hasTrial={Boolean(bumpAsSold?.trialDays || altOffer?.trialDays)}
        refundWindowDays={legal.refundWindowDays}
        replyTime={settings.replyTime}
        note={product.checkoutNote}
        bullets={product.checkoutBullets}
      />

      {/* The ground bleeds to the window edge; the content does not. A form
          stretched across half a large monitor turns every field into a
          900px-wide box, which is what made this look like a page with the
          zoom stuck on. */}
      <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-7 px-6 py-8 md:px-8 lg:mx-0 lg:ml-0 lg:mr-auto lg:py-10 lg:pl-10">
        <h2 className="font-display text-xl">Checkout</h2>
        <CheckoutForm
        product={{
          slug: product.slug,
          title: product.title,
          tagline: product.tagline ?? null,
          priceCents: product.priceCents,
          currency: product.currency,
          // Own image wins, else the attached course's — same precedence the
          // storefront card uses, so the panel beside this shows the image they
          // clicked on to get here.
          coverUrl,
        }}
          bump={bump}
          bumpAlt={bumpAlt}
          bumpOptions={bumpOptions}
          publishableKey={stripePublishableKey()}
          signedInEmail={user?.email ?? null}
          defaultCountry={defaultCountry}
        />
      </div>
    </div>
  );
}
