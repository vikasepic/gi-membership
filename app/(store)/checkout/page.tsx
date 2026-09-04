import { notFound, redirect } from "next/navigation";
import { getProductBySlug, getOffer } from "@/lib/store";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { shouldShowOffer, offerAtPrice } from "@/lib/offers";
import { livePrices, shownPrices } from "@/lib/offer-prices";
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
import { checkoutDesignVars } from "@/lib/checkout-design";
import { getPageSections } from "@/lib/pages";
import { getStoreId } from "@/lib/store";
import { usableCheckoutLayout } from "@/lib/checkout-layout";
import { checkoutSkin } from "@/lib/checkout-skin";
import { CheckoutStage } from "@/components/checkout/v2/stage";
import { money } from "@/lib/money";
import { recordPageHit } from "@/lib/traffic";
import type { Block } from "@/lib/blocks";

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

/**
 * The store's checkout layout, flattened to one list of blocks.
 *
 * Both bands in order, disabled ones dropped. A band is a horizontal slice and
 * this form is one column of the page, so they concatenate — the two-column
 * arrangement inside the panel is a row block, not a band.
 *
 * Never throws. A settings read that fails must cost this page its layout, not
 * its ability to take a payment.
 */
async function checkoutLayout(): Promise<Block[] | null> {
  try {
    const rows = await getPageSections("checkout", await getStoreId());
    const blocks = rows
      .filter((r) => r.enabled)
      .flatMap((r) => {
        const list = (r.content as Record<string, unknown> | undefined)?.blocks;
        return Array.isArray(list) ? list : [];
      });
    return usableCheckoutLayout(blocks);
  } catch {
    return null;
  }
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; skin?: string }>;
}) {
  const { product: slug, skin: wantSkin } = await searchParams;
  // Not awaited — a count is worth less than a page load.
  void recordPageHit("/checkout");
  const skin = checkoutSkin(wantSkin);
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
  // Three colours and a set of switches — everything the store can change
  // about this page. See lib/checkout-design.
  const design = settings.checkoutDesign;
  const legal = legalFrom(settings);

  // The checkout the store laid out, if it laid one out and if it can still
  // take money. `usableCheckoutLayout` returns null on anything else, and null
  // is the page that has always shipped — see lib/checkout-layout.ts for why
  // this one page does not simply render whatever was saved.
  const layout = await checkoutLayout();

  // The selling half is narrower than the paying half.
  //
  // They were equal, which gave the panel — a title, a picture and three
  // reassurances somebody has already read — the same room as the form that
  // actually takes the card. On a laptop that pushed the card fields into a
  // column narrower than the copy beside them. Two-fifths and three-fifths: the
  // panel still holds its picture, and the form gets the space.
  const ways = livePrices(product.prices);

  const form = (
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
        // Every way to buy it. The form posts the INDEX of the one chosen and
        // createCheckoutIntent rebuilds this same list to resolve it.
        prices: ways,
      }}
      bump={bump}
      bumpAlt={bumpAlt}
      bumpOptions={bumpOptions}
      publishableKey={stripePublishableKey()}
      signedInEmail={user?.email ?? null}
      defaultCountry={defaultCountry}
      layout={layout}
      // The published terms, so this page and the footer cannot name two
      // different sets of terms for the same purchase.
      termsUrl={settings.termsUrl || undefined}
      skin={skin}
      design={design}
    />
  );

  if (skin === "v2") {
    // One price to show, or none. With several ways to buy, a single headline
    // figure on the dark half contradicts the plan cards on the light one —
    // and the figure a buyer reads first is the one they think they agreed to.
    const single = ways.length === 1 ? ways[0] : null;
    const one = ways.length <= 1;
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
          backHref={`/p/${product.slug}`}
          backLabel="Back"
          eyebrow={one ? "One-time purchase" : `${ways.length} ways to pay`}
          title={product.title}
          sub={product.tagline ?? null}
          imageUrl={coverUrl}
          bullets={product.checkoutBullets ?? []}
          priceLabel={one ? money(single?.priceCents ?? product.priceCents, product.currency) : null}
          priceCaption={one ? "one-time · instant access" : null}
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
