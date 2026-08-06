import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getProductById } from "@/lib/admin";
import { getPageSections, getPageSettings } from "@/lib/pages";
import { PageEditor } from "@/components/admin/page-editor";
import { PageSettings } from "@/components/admin/page-settings";
import { money } from "@/lib/money";
import { siteUrl } from "@/lib/env";
import { CopyLink } from "@/components/admin/copy-link";

export const dynamic = "force-dynamic";

export default async function ProductPageEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) notFound();

  const [rows, settings] = await Promise.all([
    getPageSections("product", id),
    getPageSettings("product", id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {/* One line. A heading, a paragraph explaining what a sales page is, a
          card for the URL and a card for custom code cost five hundred pixels
          before the first section. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href={`/admin/products/${id}`} className="kicker text-muted hover:text-fg">
          &larr; {product.title}
        </Link>
        <h1 className="text-xl">Sales page</h1>
        <span className="text-sm text-muted">replaces the short product page</span>
      </div>

      {/* Full-bleed out of the admin's 1024px column. The preview needs real
          width: the hero goes side-by-side at 768px, and the pane was narrower
          than that, so every section previewed as its narrow layout.
          overflow-x-clip guards the scrollbar gap 100vw leaves behind. */}
      <div className="mx-[calc(50%-50vw+var(--admin-nav)/2)] w-[calc(100vw-var(--admin-nav))] overflow-x-clip px-5 md:px-8">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
      {/* Both folded away. The URL is one line you copy occasionally; custom
          code is empty on every page until the day it is not. */}
      <details className="rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs text-muted [&::-webkit-details-marker]:hidden">
          Public link &amp; custom code
          <span className="ml-2 text-[0.68rem]">
            /p/{product.slug}
            {settings.customCss || settings.customJs ? " · code set" : ""}
          </span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <CopyLink
            url={`${siteUrl()}/p/${product.slug}`}
            label="Public link"
            note="Live as soon as you save any section. Before that this address shows the short product page."
          />
          <PageSettings
            ownerType="product"
            ownerId={id}
            customCss={settings.customCss}
            customJs={settings.customJs}
          />
        </div>
      </details>

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
