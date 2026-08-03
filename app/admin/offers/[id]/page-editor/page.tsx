import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getOfferById } from "@/lib/admin";
import { getPageSections } from "@/lib/pages";
import { PageEditor } from "@/components/admin/page-editor";
import { buildBumpView } from "@/lib/bump";

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
          The ten sections, in order. This is what someone sees on the upsell page when they decline
          the order bump.
        </p>
      </div>

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
