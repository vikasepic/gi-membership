import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getOfferById } from "@/lib/admin";
import { getPageSections, getPageSettings , listPageSources } from "@/lib/pages";
import { PageEditor } from "@/components/admin/page-editor";
import { PageSettings } from "@/components/admin/page-settings";
import { PageSeo } from "@/components/admin/page-seo";
import { hasStickyBarBlock } from "@/lib/page-sections";
import { getSettingsOrDefaults } from "@/lib/settings";
import { publicCoverUrl } from "@/lib/media-url";
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

  const [rows, settings, pageSources, preview, store] = await Promise.all([
    getPageSections("offer", id),
    getPageSettings("offer", id),
    listPageSources(),
    // The store's fonts and site typography. The admin renders no StoreBrand,
    // so without this the preview draws in the app's own fonts.
    storePreview(),
    getSettingsOrDefaults(),
  ]);
  // The price shown on the page comes from the offer, never from a copy field —
  // the same rule as the order bump.
  const view = buildBumpView(offer);

  // Whether this page already carries a bar of its own — asked through the
  // same helper the upsell uses, so this notice cannot say one thing while the
  // live page does the other.
  const hasStickyBar = hasStickyBarBlock(rows);

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

      {/* Where the sticky bar is.
          It IS editable per offer and always has been — drop a Sticky bar block
          on this page and it replaces the built-in one. Nothing said so, so the
          honest state of it was "not editable": a feature nobody can find is
          one that does not exist. */}
      <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
        {hasStickyBar ? (
          <>
            <strong className="font-medium text-fg">The sticky bar on this page is yours.</strong>{" "}
            It is the Sticky bar block in the sections below — its words, its colours, its position
            and where its button scrolls to are all in its panel. The built-in upsell bar is off
            while it is here; delete the block and that one comes back.
          </>
        ) : (
          <>
            <strong className="font-medium text-fg">This page is using the built-in bar</strong> —
            the one with Accept and No thanks on it, which cannot be edited. To take it over, drag a{" "}
            <strong className="font-medium text-fg">Sticky bar</strong> block from the tray (under
            Sales) into any section. One appears and the built-in one steps aside, so the two never
            argue.
          </>
        )}
      </p>

      {/* Full-bleed out of the admin's 1024px column. The preview needs real
          width: the hero goes side-by-side at 768px, and the pane was narrower
          than that, so every section previewed as its narrow layout.
          overflow-x-clip guards the scrollbar gap 100vw leaves behind. */}
      <div className="mx-[calc(50%-50vw+var(--admin-nav)/2)] w-[calc(100vw-var(--admin-nav))] overflow-x-clip px-5 md:px-8">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
      <details className="rounded-xl border border-border bg-surface">
        {/* Same bar as the product page editor: a caret that turns, the address
            as the loudest thing on the row, and a count of what is folded away.
            It read as a caption with no sign that clicking it did anything. */}
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-surface-2 [&::-webkit-details-marker]:hidden [[open]>&]:border-b [[open]>&]:border-border">
          <svg viewBox="0 0 16 16" aria-hidden className="size-2.5 shrink-0 fill-current text-muted transition-transform [[open]_&]:rotate-90">
            <path d="M5 2.5 10.5 8 5 13.5V2.5Z" />
          </svg>
          <code className="font-mono text-xs text-fg">/o/{offer.key}</code>
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
          <CopyLink
            url={`${siteUrl()}/o/${offer.key}`}
            label="Public link"
            note="The same nine sections at an address you can paste into an ad or an email. Live once you save a section; buying goes through the normal checkout."
          />
          <PageSeo
            ownerType="offer"
            ownerId={id}
            metaTitle={settings.metaTitle}
            metaDescription={settings.metaDescription}
            shareImagePath={settings.shareImagePath}
            // The headline sells; the internal name files. An offer called
            // "Funnel App - Yearly (v2)" is an admin's label, not a page title.
            fallbackTitle={offer.headline || offer.name}
            fallbackDescription={offer.description ?? ""}
            // `imageUrl` is already a URL rather than a storage path — the two
            // are not interchangeable and swapping them yields a broken card.
            fallbackImageUrl={offer.imageUrl || publicCoverUrl(store.shareImagePath || null)}
          />
          <PageSettings
            ownerType="offer"
            ownerId={id}
            customCss={settings.customCss}
            customJs={settings.customJs}
            snippets={settings.snippets}
          />
        </div>
      </details>

      <PageEditor
        pageSources={pageSources}
        ownerType="offer"
        ownerId={id}
        initial={rows}
        money={{
          priceLabel: view.nowLabel,
          termsLabel: view.termsLabel,
          // The decline, drawn in the editor as the upsell will draw it.
          //
          // The live page supplies this, never the block — a sales page has
          // nowhere to decline TO, and the way to decline one is to leave it.
          // But that meant the link was invisible here, so the one page where
          // it DOES appear was the one place it could not be seen or styled,
          // and it was being reported as missing.
          //
          // A real href would be a way out of the editor, so it points at the
          // canvas itself: present, drawn, stylable, and going nowhere.
          declineHref: "#",
          declineLabel: offer.declineLabel,
        }}
        preview={preview}
        liveHref={`/admin/offers/${id}/preview?template=sections`}
      />
        </div>
      </div>
    </div>
  );
}
