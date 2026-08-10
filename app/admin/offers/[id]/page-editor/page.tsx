import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getOfferById } from "@/lib/admin";
import { getPageSections, getPageSettings , listPageSources } from "@/lib/pages";
import { PageEditor } from "@/components/admin/page-editor";
import { PageSettings } from "@/components/admin/page-settings";
import { buildBumpView } from "@/lib/bump";
import { siteUrl } from "@/lib/env";
import { CopyLink } from "@/components/admin/copy-link";
import { storePreview } from "@/lib/store-preview";

export const dynamic = "force-dynamic";

export default async function OfferPageEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const offer = await getOfferById(id);
  if (!offer) notFound();

  const [rows, settings, pageSources, preview] = await Promise.all([
    getPageSections("offer", id),
    getPageSettings("offer", id),
    listPageSources(),
    // The store's fonts and site typography. The admin renders no StoreBrand,
    // so without this the preview draws in the app's own fonts.
    storePreview(),
  ]);
  // The price shown on the page comes from the offer, never from a copy field —
  // the same rule as the order bump.
  const view = buildBumpView(offer);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href={`/admin/offers/${id}`} className="kicker text-muted hover:text-fg">
          &larr; {offer.name}
        </Link>
        <h1 className="text-xl">Sales page</h1>
        {/* Kept, because it is the one thing here that is not obvious: these
            same sections are also the upsell page, but only when the offer's
            layout says so. */}
        <span className="text-sm text-muted">
          also the upsell page, when this offer&rsquo;s layout is{" "}
          <strong className="font-medium text-fg">Ten sections</strong>
        </span>
      </div>

      {/* Full-bleed out of the admin's 1024px column. The preview needs real
          width: the hero goes side-by-side at 768px, and the pane was narrower
          than that, so every section previewed as its narrow layout.
          overflow-x-clip guards the scrollbar gap 100vw leaves behind. */}
      <div className="mx-[calc(50%-50vw+var(--admin-nav)/2)] w-[calc(100vw-var(--admin-nav))] overflow-x-clip px-5 md:px-8">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
      <details className="rounded-xl border border-border bg-surface">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs text-muted [&::-webkit-details-marker]:hidden">
          Public link &amp; custom code
          <span className="ml-2 text-[0.68rem]">
            /o/{offer.key}
            {settings.customCss || settings.customJs ? " · code set" : ""}
          </span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <CopyLink
            url={`${siteUrl()}/o/${offer.key}`}
            label="Public link"
            note="The same nine sections at an address you can paste into an ad or an email. Live once you save a section; buying goes through the normal checkout."
          />
          <PageSettings
            ownerType="offer"
            ownerId={id}
            customCss={settings.customCss}
            customJs={settings.customJs}
          />
        </div>
      </details>

      <PageEditor
        pageSources={pageSources}
        ownerType="offer"
        ownerId={id}
        initial={rows}
        money={{ priceLabel: view.nowLabel, termsLabel: view.termsLabel }}
        preview={preview}
        liveHref={`/admin/offers/${id}/preview?template=sections`}
      />
        </div>
      </div>
    </div>
  );
}
