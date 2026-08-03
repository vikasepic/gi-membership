import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOfferByKey } from "@/lib/store";
import { ownershipFor } from "@/lib/checkout";
import { isOfferEligible } from "@/lib/offers";
import { hasPageSections, getPageSections } from "@/lib/pages";
import { SalesPage } from "@/components/page/sales-page";
import { buildBumpView } from "@/lib/bump";

export const dynamic = "force-dynamic";

/**
 * An offer's own sales page, at a plain address you can paste anywhere.
 *
 * The upsell page needs a signed token, so it cannot be linked to — this is the
 * same nine sections at a URL that can go in an ad or an email. Buying routes
 * through /checkout/offer, which already handles signing in and refuses anyone
 * who owns it, so nothing about eligibility is reimplemented here.
 */
export default async function OfferSalesPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const offer = await getOfferByKey(key);
  if (!offer || !offer.active) notFound();
  if (!(await hasPageSections("offer", offer.id))) notFound();

  const rows = await getPageSections("offer", offer.id);
  const view = buildBumpView(offer);

  // Someone who already has it gets the truth rather than a buy button they
  // would be refused at.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const owned = user ? await ownershipFor(user.id) : null;
  const alreadyHas = owned ? !isOfferEligible(offer, owned) : false;

  return (
    <div className="-mx-4 md:-mx-6">
      <SalesPage
        rows={rows}
        money={{ priceLabel: view.nowLabel, termsLabel: view.termsLabel }}
        cta={(label) =>
          alreadyHas ? (
            <Link
              href="/library"
              className="inline-block w-fit rounded-full border border-current px-7 py-3 font-display text-[0.95rem] font-semibold"
            >
              You already have this — open your library
            </Link>
          ) : (
            <Link
              href={`/checkout/offer?offer=${offer.id}`}
              className="inline-block w-fit rounded-full bg-primary px-7 py-3 font-display text-[0.95rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              {label}
            </Link>
          )
        }
      />
    </div>
  );
}
