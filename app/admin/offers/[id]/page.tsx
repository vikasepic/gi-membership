import Link from "next/link";
import { notFound } from "next/navigation";
import { OfferForm } from "@/components/admin/offer-form";
import { getOfferById, listProductOptions, listAppOptions } from "@/lib/admin";
import { hasCustomOtoPage } from "@/components/oto/registry";

export default async function EditOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [offer, products, apps] = await Promise.all([
    getOfferById(id),
    listProductOptions(),
    listAppOptions(),
  ]);
  if (!offer) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/offers" className="kicker w-fit text-muted hover:text-fg">&larr; Offers</Link>
        <h1 className="text-2xl">{offer.name}</h1>
        {/* The custom page's wording lives on its own screen. It is far too
            long to sit inside this form, and it is edited on a different
            rhythm: pricing and grants change rarely, copy changes constantly. */}
        {hasCustomOtoPage(offer.key) && (
          <Link
            href={`/admin/offers/${id}/content`}
            className="w-fit rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-fg"
          >
            Edit upsell page copy →
          </Link>
        )}
      </div>
      <OfferForm offer={offer} products={products} apps={apps} />
    </div>
  );
}
