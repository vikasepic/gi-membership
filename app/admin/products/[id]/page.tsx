import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { AssetUpload } from "@/components/admin/asset-upload";
import { getProductById, listOfferOptions } from "@/lib/admin";
import { listCourses, coursesForProduct } from "@/lib/courses";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, offers, allCourses, assigned] = await Promise.all([
    getProductById(id),
    listOfferOptions(),
    listCourses(),
    coursesForProduct(id),
  ]);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="kicker w-fit text-muted hover:text-fg">&larr; Products</Link>
        <h1 className="text-2xl">{product.title}</h1>
        <p className="text-sm text-muted">
          A product is what you sell. Its content lives in{" "}
          <Link href="/admin/courses" className="underline">courses</Link> — assign one or more below,
          or attach a single file for a simple one-file sale.
        </p>
      </div>

      <ProductForm
        product={product}
        offers={offers}
        allCourses={allCourses}
        assignedCourseIds={assigned.map((c) => c.id)}
      />

      {/* Simple one-file products still deliver a single asset directly. */}
      {product.type !== "video" && product.type !== "app" && (
        <AssetUpload productId={product.id} currentPath={product.mediaPath} />
      )}
    </div>
  );
}
