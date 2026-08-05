import Link from "next/link";
import { OfferForm } from "@/components/admin/offer-form";
import { listProductOptions, listAppOptions, listOfferOptions } from "@/lib/admin";

export default async function NewOfferPage() {
  const [products, apps, offers] = await Promise.all([
    listProductOptions(),
    listAppOptions(),
    listOfferOptions(true),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/offers" className="kicker w-fit text-muted hover:text-fg">&larr; Offers</Link>
        <h1 className="text-2xl">New offer</h1>
      </div>
      <OfferForm products={products} apps={apps} offers={offers} />
    </div>
  );
}
