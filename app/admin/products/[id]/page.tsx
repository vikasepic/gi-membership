import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { publicCoverUrl } from "@/lib/media";
import { AssetUpload } from "@/components/admin/asset-upload";
import { getProductById, listOfferOptions, priceUsage } from "@/lib/admin";
import { listCourses, coursesForProduct } from "@/lib/courses";
import { hasPageSections } from "@/lib/pages";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, offers, allCourses, assigned, hasSalesPage, usage] = await Promise.all([
    getProductById(id),
    listOfferOptions(),
    listCourses(),
    coursesForProduct(id),
    hasPageSections("product", id),
    // How many people are on each price. A price somebody is on may be hidden
    // but never repriced — the editor says so on the row rather than letting
    // the save fail with a message about a row nobody can see.
    priceUsage(id, "product"),
  ]);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-5">
      {/* No heading block and no cover card. Both are in the form's own header
          row now — the heading was a sentence read once on the first day, and
          the cover card was five hundred pixels for one picture. */}
      <ProductForm
        product={product}
        priceUsage={usage}
        offers={offers}
        allCourses={allCourses}
        assignedCourseIds={assigned.map((c) => c.id)}
        coverUrl={publicCoverUrl(product.coverPath)}
        inheritedCoverUrl={publicCoverUrl(assigned.find((c) => c.coverPath)?.coverPath ?? null)}
        hasSalesPage={hasSalesPage}
        salesPageHref={`/admin/products/${id}/page-editor`}
        // Offered whatever the status. A draft's public address is where you
        // go to SEE that it 404s; hiding the way there is how somebody decides
        // the page is broken rather than unpublished.
        liveHref={`/p/${product.slug}`}
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
