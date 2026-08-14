import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getProductById } from "@/lib/admin";
import { getPageSections, getPageSettings , listPageSources } from "@/lib/pages";
import { PageEditor } from "@/components/admin/page-editor";
import { PageSettings } from "@/components/admin/page-settings";
import { PageSeo } from "@/components/admin/page-seo";
import { getSettingsOrDefaults } from "@/lib/settings";
import { publicCoverUrl } from "@/lib/media-url";
import { productDisplay } from "@/lib/courses";
import { money } from "@/lib/money";
import { siteUrl } from "@/lib/env";
import { CopyLink } from "@/components/admin/copy-link";
import { storePreview } from "@/lib/store-preview";

export const dynamic = "force-dynamic";

export default async function ProductPageEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) notFound();

  const [rows, settings, pageSources, preview, store, display] = await Promise.all([
    getPageSections("product", id),
    getPageSettings("product", id),
    listPageSources(),
    // The store's fonts and site typography. The admin renders no StoreBrand,
    // so without this the preview draws in the app's own fonts.
    storePreview(),
    getSettingsOrDefaults(),
    productDisplay([id]),
  ]);

  // What the card falls back to when the fields are left empty. Worked out here
  // rather than in the panel so the preview shows the real picture instead of a
  // description of which one it would be.
  const fallbackImage =
    publicCoverUrl(product.coverPath ?? display.get(id)?.coverPath ?? null) ??
    publicCoverUrl(store.shareImagePath || null);

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
        {/* It read as a caption: two grey phrases on a bar, no caret, nothing
            that says a click does anything. The address was there and could not
            be opened, copied, or told apart from the label beside it.

            Now: a caret that turns, the address as the loudest thing on the row
            because it is what somebody came to find, the status beside it
            because a draft's address 404s, and a count of what is folded away
            so opening it is a decision rather than a search. */}
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-surface-2 [&::-webkit-details-marker]:hidden [[open]>&]:border-b [[open]>&]:border-border">
          <svg viewBox="0 0 16 16" aria-hidden className="size-2.5 shrink-0 fill-current text-muted transition-transform [[open]_&]:rotate-90">
            <path d="M5 2.5 10.5 8 5 13.5V2.5Z" />
          </svg>
          <code className="font-mono text-xs text-fg">/p/{product.slug}</code>
          {product.status !== "published" && (
            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[0.62rem] font-medium text-primary">
              {product.status} — 404s until published
            </span>
          )}
          <span className="ml-auto text-[0.68rem] text-muted">
            {[
              "Public link",
              settings.customCss || settings.customJs ? "custom code" : null,
              settings.snippets.length > 0
                ? `${settings.snippets.length} snippet${settings.snippets.length === 1 ? "" : "s"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-border p-3">
          {/* The note used to promise the link went live as soon as a section
              was saved. That is only true of a PUBLISHED product: /p/[slug]
              404s a draft, whatever is on the page. Somebody built a whole
              sales page, opened the link and got a 404 while the admin told
              them it was live. */}
          <CopyLink
            url={`${siteUrl()}/p/${product.slug}`}
            label="Public link"
            note={
              product.status === "published"
                ? "Live as soon as you save any section. Before that this address shows the short product page."
                : `This product is a ${product.status}, so the address 404s for everyone until you publish it — whatever is saved here.`
            }
          />
          {/* The slug is a product field with a uniqueness rule behind it, so it
              is edited in the one form that owns it rather than in a second one
              that would have to repeat the rule and could disagree with it. */}
          <p className="text-xs text-muted">
            The address comes from the product&rsquo;s slug.{" "}
            <Link href={`/admin/products/${id}`} className="text-primary underline underline-offset-2">
              Change it in Basics
            </Link>
            .
          </p>
          <PageSeo
            ownerType="product"
            ownerId={id}
            metaTitle={settings.metaTitle}
            metaDescription={settings.metaDescription}
            shareImagePath={settings.shareImagePath}
            fallbackTitle={product.title}
            fallbackDescription={product.tagline ?? ""}
            fallbackImageUrl={fallbackImage}
          />
          <PageSettings
            ownerType="product"
            ownerId={id}
            customCss={settings.customCss}
            customJs={settings.customJs}
            snippets={settings.snippets}
          />
        </div>
      </details>

      <PageEditor
        pageSources={pageSources}
        ownerType="product"
        ownerId={id}
        initial={rows}
        money={{ priceLabel: money(product.priceCents, product.currency), termsLabel: null }}
        preview={preview}
        liveHref={`/p/${product.slug}`}
      />
        </div>
      </div>
    </div>
  );
}
