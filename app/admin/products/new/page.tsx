import Link from "next/link";
import { ProductForm } from "@/components/admin/product-form";
import { listOfferOptions } from "@/lib/admin";

export default async function NewProductPage() {
  const offers = await listOfferOptions();
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="kicker w-fit text-muted hover:text-fg">&larr; Products</Link>
        <h1 className="text-2xl">New product</h1>
      </div>
      <ProductForm offers={offers} />
    </div>
  );
}
