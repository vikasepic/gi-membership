import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { OfferForm } from "@/components/admin/offer-form";
import { listProductOptions, listAppOptions, listOfferOptions } from "@/lib/admin";

export default async function NewOfferPage() {
  const [products, apps, offers, settings] = await Promise.all([
    listProductOptions(),
    listAppOptions(),
    listOfferOptions(true),
    getSettings(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/offers" className="kicker w-fit text-muted hover:text-fg">&larr; Offers</Link>
        <h1 className="text-2xl">New offer</h1>
      </div>
      <OfferForm products={products} apps={apps} offers={offers} defaultCurrency={settings.currency} />
    </div>
  );
}
