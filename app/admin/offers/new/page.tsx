import Link from "next/link";
import { OfferForm } from "@/components/admin/offer-form";
import { listProductOptions, listAppOptions } from "@/lib/admin";

export default async function NewOfferPage() {
  const [products, apps] = await Promise.all([
    listProductOptions(),
    listAppOptions(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/offers" className="kicker w-fit text-muted hover:text-fg">&larr; Offers</Link>
        <h1 className="text-2xl">New offer</h1>
      </div>
      <OfferForm products={products} apps={apps} />
    </div>
  );
}
