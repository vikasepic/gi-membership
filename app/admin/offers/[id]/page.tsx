import Link from "next/link";
import { notFound } from "next/navigation";
import { OfferForm } from "@/components/admin/offer-form";
import { getOfferById, listProductOptions, listAppOptions } from "@/lib/admin";

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
      </div>
      <OfferForm offer={offer} products={products} apps={apps} />
    </div>
  );
}
