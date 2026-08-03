import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getOfferById } from "@/lib/admin";
import { getPageSections } from "@/lib/pages";
import { PageEditor } from "@/components/admin/page-editor";
import { buildBumpView } from "@/lib/bump";
import { siteUrl } from "@/lib/env";
import { CopyLink } from "@/components/admin/copy-link";

export const dynamic = "force-dynamic";

export default async function OfferPageEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const offer = await getOfferById(id);
  if (!offer) notFound();

  const rows = await getPageSections("offer", id);
  // The price shown on the page comes from the offer, never from a copy field —
  // the same rule as the order bump.
  const view = buildBumpView(offer);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/admin/offers/${id}`} className="kicker w-fit text-muted hover:text-fg">
          &larr; {offer.name}
        </Link>
        <h1 className="text-2xl">Sales page</h1>
        <p className="max-w-[70ch] text-muted">
          The ten sections, in order. Used in two places: the upsell page after someone declines the
          order bump — set this offer&rsquo;s layout to <strong>Ten sections</strong> to switch that
          on — and the public page below.
        </p>
      </div>

      <CopyLink
        url={`${siteUrl()}/o/${offer.key}`}
        label="Public link"
        note="The same nine sections at an address you can paste into an ad or an email. Live once you save a section; buying goes through the normal checkout."
      />

      <PageEditor
        ownerType="offer"
        ownerId={id}
        initial={rows}
        money={{ priceLabel: view.nowLabel, termsLabel: view.termsLabel }}
        liveHref={`/admin/offers/${id}/preview?template=sections`}
      />
    </div>
  );
}
