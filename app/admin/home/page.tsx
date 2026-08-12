import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { getPageSections, listPageSources } from "@/lib/pages";
import { getStoreId } from "@/lib/store";
import { PageEditor } from "@/components/admin/page-editor";
import { storePreview } from "@/lib/store-preview";
import { HomeSeed } from "@/components/admin/home-seed";
import { storefrontPreview } from "@/lib/storefront-preview";

export const dynamic = "force-dynamic";

/**
 * The storefront's own page.
 *
 * The same editor a sales page uses, pointed at the store instead of a product.
 * That is the whole design: one editor, one renderer, one save path, and a home
 * page that is data rather than a file only a deploy can change.
 *
 * What it does NOT get is the Page settings panel. Custom CSS and JavaScript
 * for the storefront already exist in Site settings → Advanced and apply to
 * every page including this one; a second box here would be two places to write
 * the same thing and no way to tell which one was winning.
 */
export default async function HomePageEditor() {
  await requireAdmin();
  const storeId = await getStoreId();

  const [rows, pageSources, preview, store] = await Promise.all([
    getPageSections("store", storeId),
    listPageSources(),
    // The store's fonts and site typography. The admin renders no StoreBrand,
    // so without this the preview draws in the app's own fonts.
    storePreview(),
    // The real catalogue and memberships, so Catalogue, Memberships and
    // Featured draw something on the canvas. Without this they render nothing
    // here — you drop one in, see an empty band, and conclude it is broken.
    storefrontPreview(),
  ]);

  // Whether a visitor is seeing this page yet. Read off the stored blocks
  // rather than the row's existence: opening the editor and closing it writes
  // rows, and a page of empty bands must not claim to be live.
  const built = rows.some((r) => {
    const blocks = (r.content as Record<string, unknown> | undefined)?.blocks;
    return Array.isArray(blocks) && blocks.length > 0;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href="/admin" className="kicker text-muted hover:text-fg">
          &larr; Admin
        </Link>
        <h1 className="text-xl">Home page</h1>
        <span className="text-sm text-muted">what a visitor sees at the front of the store</span>
      </div>

      {/* Said plainly, because until the first band has something in it this
          editor changes nothing a visitor can see, and an editor that appears
          to do nothing is one people stop trusting. */}
      <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
        {built ? (
          <>
            The store is showing the bands below. Empty every one of them and it goes back to the
            built-in home page — nothing is lost by trying something.
          </>
        ) : (
          <>
            The store is showing its built-in home page. Put anything in a band below and this
            takes over instead. <strong className="font-medium text-fg">Catalogue</strong>,{" "}
            <strong className="font-medium text-fg">Memberships</strong> and{" "}
            <strong className="font-medium text-fg">Featured</strong> are in the block tray under
            Storefront — they draw the real products and subscriptions, and they never offer
            somebody something they already own.
          </>
        )}
      </p>

      <HomeSeed built={built} />

      {/* Full-bleed out of the admin's column: the preview needs real width or
          every band previews as its narrow layout. overflow-x-clip guards the
          scrollbar gap 100vw leaves behind. */}
      <div className="mx-[calc(50%-50vw+var(--admin-nav)/2)] w-[calc(100vw-var(--admin-nav))] overflow-x-clip px-5 md:px-8">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
          <PageEditor
            pageSources={pageSources}
            ownerType="store"
            ownerId={storeId}
            initial={rows}
            // No product behind this page, so there is no price to hand a Buy
            // button. One dropped here links out rather than pricing anything.
            money={{ priceLabel: null, termsLabel: null }}
            preview={preview}
            store={store}
            liveHref="/"
          />
        </div>
      </div>
    </div>
  );
}
