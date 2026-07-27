import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { AssetUpload } from "@/components/admin/asset-upload";
import { CurriculumOutline } from "@/components/admin/curriculum-outline";
import { getProductById, listOfferOptions } from "@/lib/admin";
import { listCurriculum } from "@/lib/curriculum";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, offers, nodes] = await Promise.all([
    getProductById(id),
    listOfferOptions(),
    listCurriculum(id, { includeDrafts: true }),
  ]);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="kicker w-fit text-muted hover:text-fg">&larr; Products</Link>
        <h1 className="text-2xl">{product.title}</h1>
      </div>
      <ProductForm product={product} offers={offers} />

      <CurriculumOutline
        productId={product.id}
        nodes={nodes}
        chapterLabel={product.chapterLabel ?? "Chapter"}
        lessonLabel={product.lessonLabel ?? "Lesson"}
      />

      {product.type !== "video" && product.type !== "app" && (
        <AssetUpload productId={product.id} currentPath={product.mediaPath} />
      )}
    </div>
  );
}
