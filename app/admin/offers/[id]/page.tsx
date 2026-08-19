import Link from "next/link";
import { signPreviewToken } from "@/lib/preview-token";
import { notFound } from "next/navigation";
import { OfferForm } from "@/components/admin/offer-form";
import { getOfferById, listProductOptions, listAppOptions, listOfferOptions, priceUsage } from "@/lib/admin";
import { hasCustomOtoPage } from "@/components/oto/registry";
import { hasPageSections } from "@/lib/pages";
import { ViewLive } from "@/components/admin/view-live";

export default async function EditOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [offer, products, apps, offers, usage] = await Promise.all([
    getOfferById(id),
    listProductOptions(),
    listAppOptions(),
    // Drafts too: the second price is usually built beside the first.
    listOfferOptions(true),
    // Who is on each way to pay. A price with anybody on it can be hidden but
    // never repriced or removed — their subscription holds its own price, so
    // changing it here would only mislead whoever changed it.
    priceUsage(id),
  ]);
  if (!offer) notFound();

  // The offer's own sales page needs both: the offer live, and a page actually
  // built. Either missing and /o/<key> is a 404.
  const built = await hasPageSections("offer", offer.id);
  const liveReason = !offer.active
    ? "the offer is switched off"
    : !built
      ? "no sales page built yet"
      : null;

  // Two editors can write an upsell page and only one of them is live at a
  // time. Without saying which, it is possible to spend an afternoon editing a
  // page nobody will see — so the layout is named here rather than left to be
  // inferred from a dropdown further down the form.
  const hasCoded = hasCustomOtoPage(offer.key);
  const liveLayout =
    offer.otoTemplate === "custom" && hasCoded
      ? "coded"
      : offer.otoTemplate === "sections"
        ? "sections"
        : "template";

  const LIVE_LABEL: Record<string, string> = {
    coded: "the coded page written for this offer",
    sections: "the ten-section sales page",
    template: `the “${offer.otoTemplate}” template`,
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link href="/admin/offers" className="kicker w-fit text-muted hover:text-fg">&larr; Offers</Link>
        <h1 className="text-2xl">{offer.name}</h1>

        <p className="text-sm text-muted">
          The upsell page currently uses <strong className="text-fg">{LIVE_LABEL[liveLayout]}</strong>.
          Change it with <em>Upsell page layout</em> in the form below.
        </p>

        {/* Presentation lives on its own screens. Each is too long to sit inside
            this form, and they are edited on a different rhythm: pricing and
            grants change rarely, copy and design change constantly. */}
        <div className="flex flex-wrap gap-2">
          <EditorLink
            href={`/admin/offers/${id}/page-editor`}
            title="Sales page — ten sections"
            live={liveLayout === "sections"}
            hint={
              liveLayout === "sections"
                ? "Live on the upsell page"
                : "Not in use — set the layout to “Ten sections” to switch to it"
            }
          />
          {hasCoded && (
            <EditorLink
              href={`/admin/offers/${id}/content`}
              title="Coded page — wording only"
              live={liveLayout === "coded"}
              hint={
                liveLayout === "coded"
                  ? "Live on the upsell page"
                  : "Not in use — the layout is set to something else"
              }
            />
          )}
          <EditorLink
            href={`/admin/offers/${id}/bump`}
            title="Order bump"
            live
            hint="How this offer looks on a checkout"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <ViewLive
            href={`/o/${offer.key}`}
            unavailable={liveReason}
            label="View the sales page"
          />
          {/* The upsell is only ever reached mid-checkout with a signed token,
              so there is no public URL to open — this is the preview that
              renders it with the same code the buyer gets. */}
          <a
            href={`/oto-preview/${offer.id}?t=${encodeURIComponent(signPreviewToken("oto"))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-fg"
          >
            Preview the upsell ↗
          </a>
        </div>
      </div>
      <OfferForm offer={offer} products={products} apps={apps} offers={offers} usage={usage} />
    </div>
  );
}

function EditorLink({
  href,
  title,
  hint,
  live,
}: {
  href: string;
  title: string;
  hint: string;
  live: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col gap-0.5 rounded-2xl border px-4 py-3 transition-colors hover:border-fg ${
        live ? "border-navy/40 bg-navy/5" : "border-border"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {title}
        {live && (
          <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-navy">
            Live
          </span>
        )}
      </span>
      <span className="text-xs text-muted">{hint}</span>
    </Link>
  );
}
