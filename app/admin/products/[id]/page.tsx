import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { ProductCover } from "@/components/admin/product-cover";
import { publicCoverUrl } from "@/lib/media";
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
        <Link
          href={`/admin/products/${id}/page-editor`}
          className="mt-1 w-fit rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-fg"
        >
          Edit sales page →
        </Link>
      </div>

      <ProductCover
        productId={product.id}
        coverUrl={publicCoverUrl(product.coverPath)}
        inheritedUrl={publicCoverUrl(assigned.find((c) => c.coverPath)?.coverPath ?? null)}
      />

      <ProductForm
        product={product}
        offers={offers}
        allCourses={allCourses}
        assignedCourseIds={assigned.map((c) => c.id)}
      />

      {/* Legacy single-file delivery, only for a product with no course yet.
          Course-backed products deliver through their course, so this uploader
          would be dead weight there. */}
      {assigned.length === 0 && (
        <AssetUpload productId={product.id} currentPath={product.mediaPath} />
      )}
    </div>
  );
}
