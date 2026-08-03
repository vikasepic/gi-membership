import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getProductById } from "@/lib/admin";
import { getPageSections } from "@/lib/pages";
import { PageEditor } from "@/components/admin/page-editor";
import { money } from "@/lib/money";
import { siteUrl } from "@/lib/env";
import { CopyLink } from "@/components/admin/copy-link";

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

      {/* Full-bleed out of the admin's 1024px column. The preview needs real
          width: the hero goes side-by-side at 768px, and the pane was narrower
          than that, so every section previewed as its narrow layout.
          overflow-x-clip guards the scrollbar gap 100vw leaves behind. */}
      <div className="mx-[calc(50%-50vw)] w-screen overflow-x-clip px-5 md:px-8">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
      <CopyLink
        url={`${siteUrl()}/p/${product.slug}`}
        label="Public link"
        note="Live as soon as you save any section. Before that this address shows the short product page."
      />

      <PageEditor
        ownerType="product"
        ownerId={id}
        initial={rows}
        money={{ priceLabel: money(product.priceCents, product.currency), termsLabel: null }}
        liveHref={`/p/${product.slug}`}
      />
        </div>
      </div>
    </div>
  );
}
