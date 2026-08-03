import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getProductById } from "@/lib/admin";
import { getPageSections } from "@/lib/pages";
import { PageEditor } from "@/components/admin/page-editor";
import { money } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function ProductPageEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) notFound();

  const rows = await getPageSections("product", id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/admin/products/${id}`} className="kicker w-fit text-muted hover:text-fg">
          &larr; {product.title}
        </Link>
        <h1 className="text-2xl">Sales page</h1>
        <p className="max-w-[70ch] text-muted">
          The ten sections, in order. This replaces the short product page for buyers arriving from
          the store.
        </p>
      </div>

      <PageEditor
        ownerType="product"
        ownerId={id}
        initial={rows}
        money={{ priceLabel: money(product.priceCents, product.currency), termsLabel: null }}
        liveHref={`/p/${product.slug}`}
      />
    </div>
  );
}
